import { adminDb, isDocSnapshotExists, getDocSnapshotData } from '../lib/firebase-admin';
import { calculateTotals, getEffectiveTier } from '../lib/feeCalculator';
import { createNotification } from './notifications';
import { sendAmlVerificationRequiredNotification } from './emailService';

// Deutscher Kommentar: Jahreslimit fuer Kaeufe ohne Identitaetspruefung (EU-AML), in Euro
export const AML_ANNUAL_LIMIT_EUR = 10000;

export interface AmlPendingAuction {
  auctionId: string;
  title: string;
  totalEur: number;
}

export interface AmlExposure {
  verified: boolean;
  limitEur: number;
  paidEur: number;
  pendingEur: number;
  totalEur: number;
  exceeded: boolean;
  pending: AmlPendingAuction[];
}

// Deutscher Kommentar: Aktuelles Jahr in der Zeitzone Europe/Ljubljana
function ljubljanaYear(): { year: number; yearStr: string } {
  const yearStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Ljubljana', year: 'numeric' }).format(new Date());
  return { year: parseInt(yearStr, 10) || new Date().getFullYear(), yearStr };
}

// Deutscher Kommentar: Bereits bezahlte Kaeufe im laufenden Jahr (gleiche Leselogik wie assertAmlLimit)
export function getPaidSpentEur(userData: any): number {
  const { year, yearStr } = ljubljanaYear();
  const byYear = userData?.yearly_spent_by_year;
  if (byYear && byYear[year] !== undefined) return Number(byYear[year]) || 0;
  if (byYear && byYear[yearStr] !== undefined) return Number(byYear[yearStr]) || 0;
  if ((userData?.yearly_spent_year === year || userData?.yearly_spent_year === yearStr) && typeof userData?.yearly_spent === 'number') {
    return userData.yearly_spent;
  }
  return 0;
}

// Deutscher Kommentar: Gesamtbetrag inkl. Provision und MwSt, wie ihn der Kaeufer bezahlen muss.
// Vereinfachung: Reverse-Charge wird nur beruecksichtigt, wenn eine gueltige VIES-Pruefung gespeichert ist.
function estimateTotalEur(userData: any, itemPriceEur: number): number {
  const itemPriceCents = Math.round(itemPriceEur * 100);
  if (itemPriceCents <= 0) return 0;
  const isBusiness = Boolean(userData?.company_status === 'company' || userData?.user_type === 'company' || userData?.company_name);
  const totals = calculateTotals({
    itemPriceCents,
    tier: getEffectiveTier(userData),
    countryCode: String(userData?.country_code || 'SI').trim().toUpperCase(),
    isBusiness,
    hasValidVatId: isBusiness && userData?.vies_valid === true,
  });
  return totals.totalCents / 100;
}

function auctionTitleOf(a: any): string {
  return a?.title?.SLO || a?.title?.EN || (typeof a?.title === 'string' ? a.title : 'Dražba');
}

// Deutscher Kommentar: Berechnet bezahlte Kaeufe + gewonnene, noch unbezahlte Auktionen (inkl. Gebuehren).
// Nur Gleichheitsfilter, damit keine zusaetzlichen Firestore-Indizes noetig sind.
export async function computeAmlExposure(userId: string, userData: any): Promise<AmlExposure> {
  const verified = userData?.identity_verified === true;
  const paidEur = getPaidSpentEur(userData);
  const pending: AmlPendingAuction[] = [];

  if (!verified) {
    const seen = new Set<string>();
    const queries = [
      adminDb.collection('auctions').where('winner_id', '==', userId).where('post_auction_status', '==', 'awaiting_payment_1st'),
      adminDb.collection('auctions').where('second_winner_id', '==', userId).where('post_auction_status', '==', 'awaiting_payment_2nd'),
    ];
    for (const q of queries) {
      const snap = await q.get();
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        const a: any = d.data() || {};
        if (a.payment_status === 'paid') continue;
        const price = Number(a.current_price ?? a.currentBid ?? 0);
        const totalEur = estimateTotalEur(userData, price);
        if (totalEur <= 0) continue;
        seen.add(d.id);
        pending.push({ auctionId: d.id, title: auctionTitleOf(a), totalEur });
      }
    }
  }

  const pendingEur = pending.reduce((s, p) => s + p.totalEur, 0);
  const totalEur = paidEur + pendingEur;
  return {
    verified,
    limitEur: AML_ANNUAL_LIMIT_EUR,
    paidEur,
    pendingEur,
    totalEur,
    exceeded: !verified && totalEur > AML_ANNUAL_LIMIT_EUR,
    pending,
  };
}

// Deutscher Kommentar: Nach gewonnener Auktion pruefen, ob das Limit ueberschritten wurde.
// Falls ja: Benachrichtigung im System und immer eine E-Mail (wichtig, auch wenn der Nutzer online ist).
export async function notifyAmlLimitIfExceeded(params: {
  userId: string;
  auctionId: string;
  auctionTitle: string;
  imageUrl?: string;
  price: number;
}): Promise<boolean> {
  try {
    const userSnap = await adminDb.collection('users').doc(params.userId).get();
    if (!isDocSnapshotExists(userSnap)) return false;
    const userData: any = getDocSnapshotData(userSnap) || {};
    const exposure = await computeAmlExposure(params.userId, userData);
    if (!exposure.exceeded) return false;

    await createNotification({
      userId: params.userId,
      type: 'aml_verification',
      auctionId: params.auctionId,
      auctionTitle: params.auctionTitle,
      imageUrl: params.imageUrl,
      price: params.price,
      message: 'Presegli ste letni limit nakupov (10.000 €). Za plačilo in nove ponudbe opravite verifikacijo z osebnim dokumentom.',
      target: 'verification',
    });

    if (userData.email) {
      await sendAmlVerificationRequiredNotification({
        toEmail: userData.email,
        recipientName: userData.first_name || userData.name || 'Uporabnik',
        auctionId: params.auctionId,
        auctionTitle: params.auctionTitle,
        auctionImageUrl: params.imageUrl,
        amountEur: params.price,
        totalEur: exposure.totalEur,
      });
    }
    return true;
  } catch (err: any) {
    console.error('[notifyAmlLimitIfExceeded] Error:', err?.message || err);
    return false;
  }
}
