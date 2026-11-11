// Deutscher Kommentar: Serverlogik fuer Gruendungsmitglieder, Einladungsprogramm, Bonus-Inserate und Aktionscodes
import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { adminDb, adminAuth, FieldValue, isDocSnapshotExists, getDocSnapshotData } from '../lib/firebase-admin';
import { authenticateFirebaseUser } from './authHelper';
import { getEffectiveTier } from '../lib/feeCalculator';
import {
  getFounderStatus,
  getActiveCreditList,
  normalizePromoCode,
  type ListingCredit
} from '../lib/promotions';

export const PROMO_CONFIG_PATH = { collection: 'platform_config', doc: 'promotions' };

export interface PromoConfig {
  founder: { enabled: boolean; limit: number; count: number; months: number; tier: 'PRO' | 'BASIC'; eligible_from: string | null };
  referral: { enabled: boolean; reward_listings: number; reward_valid_months: number; max_rewards_per_user: number };
}

export const DEFAULT_PROMO_CONFIG: PromoConfig = {
  founder: { enabled: true, limit: 500, count: 0, months: 12, tier: 'PRO', eligible_from: null },
  referral: { enabled: true, reward_listings: 2, reward_valid_months: 6, max_rewards_per_user: 0 }
};

const configRef = () => adminDb.collection(PROMO_CONFIG_PATH.collection).doc(PROMO_CONFIG_PATH.doc);

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function mergeConfig(raw: any): PromoConfig {
  const f = raw?.founder || {};
  const r = raw?.referral || {};
  return {
    founder: {
      enabled: f.enabled !== undefined ? f.enabled === true : DEFAULT_PROMO_CONFIG.founder.enabled,
      limit: Number.isFinite(Number(f.limit)) ? Number(f.limit) : DEFAULT_PROMO_CONFIG.founder.limit,
      count: Number.isFinite(Number(f.count)) ? Number(f.count) : 0,
      months: Number.isFinite(Number(f.months)) && Number(f.months) > 0 ? Number(f.months) : DEFAULT_PROMO_CONFIG.founder.months,
      tier: f.tier === 'BASIC' ? 'BASIC' : 'PRO',
      eligible_from: f.eligible_from && !isNaN(new Date(f.eligible_from).getTime()) ? new Date(f.eligible_from).toISOString() : null
    },
    referral: {
      enabled: r.enabled !== undefined ? r.enabled === true : DEFAULT_PROMO_CONFIG.referral.enabled,
      reward_listings: Number.isFinite(Number(r.reward_listings)) ? Number(r.reward_listings) : DEFAULT_PROMO_CONFIG.referral.reward_listings,
      reward_valid_months: Number.isFinite(Number(r.reward_valid_months)) && Number(r.reward_valid_months) > 0 ? Number(r.reward_valid_months) : DEFAULT_PROMO_CONFIG.referral.reward_valid_months,
      max_rewards_per_user: Number.isFinite(Number(r.max_rewards_per_user)) ? Number(r.max_rewards_per_user) : DEFAULT_PROMO_CONFIG.referral.max_rewards_per_user
    }
  };
}

export async function getPromoConfig(): Promise<PromoConfig> {
  try {
    const snap = await configRef().get();
    return mergeConfig(isDocSnapshotExists(snap) ? getDocSnapshotData(snap) : null);
  } catch {
    return mergeConfig(null);
  }
}

// ---------- Hashing und Netzwerkdaten ----------

const HASH_SALT = process.env.REFERRAL_HASH_SALT || 'drazbenik-promo-salt';

function hashValue(value: string): string {
  if (!value) return '';
  return crypto.createHash('sha256').update(`${HASH_SALT}:${value}`).digest('hex').slice(0, 40);
}

export function getClientIp(req: Request): string {
  const rawIp = req.headers['x-forwarded-for'];
  return ((rawIp ? String(rawIp).split(',')[0].trim() : req.ip) || req.socket?.remoteAddress || '').trim();
}

export interface DeviceFingerprint {
  ipHash: string;
  deviceHash: string;
  fpHash: string;
}

export function buildFingerprint(req: Request, deviceId?: any, fingerprint?: any): DeviceFingerprint {
  const cleanId = typeof deviceId === 'string' ? deviceId.trim().slice(0, 100) : '';
  const cleanFp = typeof fingerprint === 'string' ? fingerprint.trim().slice(0, 200) : '';
  return {
    ipHash: hashValue(getClientIp(req)),
    deviceHash: cleanId ? hashValue(`dev:${cleanId}`) : '',
    fpHash: cleanFp ? hashValue(`fp:${cleanFp}`) : ''
  };
}

// ---------- Gruendungsmitglieder ----------

// Deutscher Kommentar: Vergibt den Gruendungsstatus einmalig (nur mit bestaetigter E-Mail) und zaehlt atomar bis zum Limit
export async function grantFounderIfEligible(uid: string, emailVerified: boolean): Promise<{ granted: boolean; number?: number }> {
  if (!uid || !emailVerified) return { granted: false };
  try {
    const userRef = adminDb.collection('users').doc(uid);
    const result = await adminDb.runTransaction(async (t: any) => {
      const [userSnap, cfgSnap] = await Promise.all([t.get(userRef), t.get(configRef())]);
      if (!isDocSnapshotExists(userSnap)) return { granted: false };
      const user = getDocSnapshotData<any>(userSnap) || {};
      if (typeof user.founder_number === 'number' || user.founder_revoked === true) {
        return { granted: false };
      }
      const cfg = mergeConfig(isDocSnapshotExists(cfgSnap) ? getDocSnapshotData(cfgSnap) : null);
      if (!cfg.founder.enabled || cfg.founder.count >= cfg.founder.limit) {
        return { granted: false };
      }
      // Deutscher Kommentar: Nur Nutzer, die sich nach dem eingestellten Startdatum registriert haben, zaehlen automatisch
      if (cfg.founder.eligible_from && user.created_at && new Date(user.created_at).getTime() < new Date(cfg.founder.eligible_from).getTime()) {
        return { granted: false };
      }
      const number = cfg.founder.count + 1;
      const now = new Date();
      t.set(configRef(), { founder: { ...cfg.founder, count: number } }, { merge: true });
      t.set(userRef, {
        founder_number: number,
        founder_since: now.toISOString(),
        founder_until: addMonths(now, cfg.founder.months).toISOString(),
        founder_tier: cfg.founder.tier
      }, { merge: true });
      return { granted: true, number };
    });
    return result;
  } catch (e: any) {
    console.error('[promotions] grantFounderIfEligible failed:', e?.message || e);
    return { granted: false };
  }
}

// ---------- Bonus-Inserate ----------

function newCredit(amount: number, validMonths: number, source: string): ListingCredit {
  const now = new Date();
  return {
    id: crypto.randomBytes(6).toString('hex'),
    remaining: amount,
    granted_at: now.toISOString(),
    expires_at: addMonths(now, validMonths).toISOString(),
    source
  };
}

export async function grantListingCredits(uid: string, amount: number, validMonths: number, source: string): Promise<void> {
  if (!uid || amount <= 0) return;
  const userRef = adminDb.collection('users').doc(uid);
  await adminDb.runTransaction(async (t: any) => {
    const snap = await t.get(userRef);
    if (!isDocSnapshotExists(snap)) return;
    const user = getDocSnapshotData<any>(snap) || {};
    const active = getActiveCreditList(user);
    active.push(newCredit(amount, validMonths, source));
    t.set(userRef, { listing_credits: active }, { merge: true });
  });
}

// Deutscher Kommentar: Verbraucht ein Bonus-Inserat (das zuerst ablaufende zuerst); false, wenn keines vorhanden ist
export async function consumeListingCredit(uid: string): Promise<boolean> {
  const userRef = adminDb.collection('users').doc(uid);
  return adminDb.runTransaction(async (t: any) => {
    const snap = await t.get(userRef);
    if (!isDocSnapshotExists(snap)) return false;
    const user = getDocSnapshotData<any>(snap) || {};
    const active = getActiveCreditList(user);
    if (active.length === 0) return false;
    active[0] = { ...active[0], remaining: active[0].remaining - 1 };
    t.set(userRef, { listing_credits: active.filter(c => c.remaining > 0) }, { merge: true });
    return true;
  });
}

// ---------- Einladungsprogramm ----------

const REF_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomRefCode(): string {
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += REF_CODE_ALPHABET[bytes[i] % REF_CODE_ALPHABET.length];
  return out;
}

// Deutscher Kommentar: Liefert den persoenlichen Einladungscode (einmalig, ueber die Sammlung referral_codes eindeutig garantiert)
export async function ensureReferralCode(uid: string): Promise<string> {
  const userRef = adminDb.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const existing = getDocSnapshotData<any>(userSnap)?.referral_code;
  if (existing) return existing;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomRefCode();
    const codeRef = adminDb.collection('referral_codes').doc(code);
    try {
      await codeRef.create({ uid, created_at: new Date().toISOString() });
      await userRef.set({ referral_code: code }, { merge: true });
      return code;
    } catch {
      // Kollision: neuen Code versuchen
    }
  }
  throw new Error('Kode povabila ni bilo mogoče ustvariti.');
}

async function rememberKnownIp(uid: string, ipHash: string) {
  if (!ipHash) return;
  try {
    const ref = adminDb.collection('users').doc(uid);
    const snap = await ref.get();
    const known: string[] = getDocSnapshotData<any>(snap)?.known_ip_hashes || [];
    if (known.includes(ipHash)) return;
    await ref.set({ known_ip_hashes: [...known, ipHash].slice(-10) }, { merge: true });
  } catch { /* ignorieren */ }
}

// Deutscher Kommentar: Speichert Geraete- und Netzwerk-Hashes bei der Registrierung (nur Hashes, keine Klartextdaten)
export async function recordSignupFingerprint(uid: string, fp: DeviceFingerprint) {
  try {
    await adminDb.collection('users').doc(uid).set({
      signup_ip_hash: fp.ipHash || null,
      signup_device_hash: fp.deviceHash || null,
      signup_fp_hash: fp.fpHash || null,
      known_ip_hashes: fp.ipHash ? [fp.ipHash] : []
    }, { merge: true });
  } catch (e: any) {
    console.warn('[promotions] recordSignupFingerprint failed:', e?.message);
  }
}

function sameNonEmpty(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a === b;
}

// Deutscher Kommentar: Prueft, ob Eingeladener und Einladender dasselbe Geraet oder dasselbe Netzwerk benutzen
async function detectReferralFraud(referrerId: string, invitedId: string, fp: DeviceFingerprint): Promise<string | null> {
  const referrerSnap = await adminDb.collection('users').doc(referrerId).get();
  const ref = getDocSnapshotData<any>(referrerSnap) || {};
  const knownIps: string[] = Array.isArray(ref.known_ip_hashes) ? ref.known_ip_hashes : [];
  if (sameNonEmpty(fp.deviceHash, ref.signup_device_hash) || sameNonEmpty(fp.fpHash, ref.signup_fp_hash)) {
    return 'same_device_as_referrer';
  }
  if (fp.ipHash && (knownIps.includes(fp.ipHash) || ref.signup_ip_hash === fp.ipHash)) {
    return 'same_network_as_referrer';
  }
  // Deutscher Kommentar: Dasselbe Geraet darf nur einmal als "eingeladen" gezaehlt werden
  const dupChecks: Array<[string, string]> = [['device_hash', fp.deviceHash], ['fp_hash', fp.fpHash]];
  for (const [field, value] of dupChecks) {
    if (!value) continue;
    const dup = await adminDb.collection('referrals').where(field, '==', value).limit(3).get();
    if (dup.docs.some((d: any) => d.id !== invitedId)) return 'device_already_used_for_referral';
  }
  if (fp.ipHash) {
    const sameIp = await adminDb.collection('referrals')
      .where('referrer_id', '==', referrerId).where('ip_hash', '==', fp.ipHash).limit(3).get();
    if (sameIp.docs.some((d: any) => d.id !== invitedId)) return 'same_network_as_other_invited';
  }
  return null;
}

// Deutscher Kommentar: Ordnet einen neu registrierten Nutzer dem Einladenden zu (genau einmal pro Nutzer)
export async function attachReferralOnSignup(
  invitedId: string,
  rawCode: any,
  fp: DeviceFingerprint
): Promise<{ attached: boolean; status?: string; reason?: string }> {
  try {
    const code = String(rawCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (!code) return { attached: false };
    const cfg = await getPromoConfig();
    if (!cfg.referral.enabled) return { attached: false };

    const existing = await adminDb.collection('referrals').doc(invitedId).get();
    if (isDocSnapshotExists(existing)) return { attached: false };

    const codeSnap = await adminDb.collection('referral_codes').doc(code).get();
    if (!isDocSnapshotExists(codeSnap)) return { attached: false, reason: 'unknown_code' };
    const referrerId = getDocSnapshotData<any>(codeSnap)?.uid;
    if (!referrerId || referrerId === invitedId) return { attached: false, reason: 'self_referral' };

    const fraud = await detectReferralFraud(referrerId, invitedId, fp);
    const status = fraud ? 'rejected' : 'pending';
    await adminDb.collection('referrals').doc(invitedId).set({
      invited_id: invitedId,
      referrer_id: referrerId,
      code,
      status,
      reject_reason: fraud || null,
      ip_hash: fp.ipHash || null,
      device_hash: fp.deviceHash || null,
      fp_hash: fp.fpHash || null,
      created_at: new Date().toISOString(),
      rewarded_at: null
    });
    return { attached: true, status, reason: fraud || undefined };
  } catch (e: any) {
    console.error('[promotions] attachReferralOnSignup failed:', e?.message || e);
    return { attached: false };
  }
}

// Deutscher Kommentar: Wird nach abgeschlossenem Verkauf aufgerufen; belohnt beide Seiten genau einmal beim ersten abgeschlossenen Verkauf des Eingeladenen
export async function processReferralOnSale(sellerId: string, buyerId?: string): Promise<void> {
  try {
    if (!sellerId) return;
    const refRef = adminDb.collection('referrals').doc(sellerId);
    const refSnap = await refRef.get();
    if (!isDocSnapshotExists(refSnap)) return;
    const refData = getDocSnapshotData<any>(refSnap) || {};
    if (refData.status !== 'pending') return;

    const cfg = await getPromoConfig();
    if (!cfg.referral.enabled) return;
    const referrerId = refData.referrer_id;

    // Deutscher Kommentar: Kaeufer darf weder der Einladende selbst noch der Eingeladene sein
    if (buyerId && (buyerId === referrerId || buyerId === sellerId)) {
      await refRef.set({ status: 'rejected', reject_reason: 'buyer_is_party' }, { merge: true });
      return;
    }

    const [invitedSnap, referrerSnap] = await Promise.all([
      adminDb.collection('users').doc(sellerId).get(),
      adminDb.collection('users').doc(referrerId).get()
    ]);
    const invited = getDocSnapshotData<any>(invitedSnap) || {};
    const referrer = getDocSnapshotData<any>(referrerSnap) || {};
    if (!isDocSnapshotExists(invitedSnap) || !isDocSnapshotExists(referrerSnap) || referrer.isBlocked || invited.isBlocked) return;

    let emailOk = invited.email_verified === true || invited.is_verified === true;
    if (!emailOk) {
      try { emailOk = (await adminAuth.getUser(sellerId)).emailVerified === true; } catch { /* ignorieren */ }
    }
    if (!emailOk) return;

    // Deutscher Kommentar: Kaeufer-Geraet gegen Einladenden/Eingeladenen pruefen (Selbstverkauf mit Zweitkonto)
    if (buyerId) {
      const buyerSnap = await adminDb.collection('users').doc(buyerId).get();
      const buyer = getDocSnapshotData<any>(buyerSnap) || {};
      const sameAs = (u: any) =>
        sameNonEmpty(buyer.signup_device_hash, u.signup_device_hash) ||
        sameNonEmpty(buyer.signup_fp_hash, u.signup_fp_hash) ||
        sameNonEmpty(buyer.signup_ip_hash, u.signup_ip_hash);
      if (sameAs(invited) || sameAs(referrer)) {
        await refRef.set({ status: 'rejected', reject_reason: 'buyer_same_device_or_network' }, { merge: true });
        return;
      }
    }

    const rewardedCount = (await adminDb.collection('referrals')
      .where('referrer_id', '==', referrerId).where('status', '==', 'rewarded').get()).size;
    // Deutscher Kommentar: 0 bedeutet unbegrenzte Belohnungen pro Einladenden
    const referrerCapped = cfg.referral.max_rewards_per_user > 0 && rewardedCount >= cfg.referral.max_rewards_per_user;

    // Deutscher Kommentar: Status atomar von pending auf rewarded setzen, damit nie doppelt belohnt wird
    const won = await adminDb.runTransaction(async (t: any) => {
      const s = await t.get(refRef);
      if (!isDocSnapshotExists(s) || (getDocSnapshotData<any>(s) || {}).status !== 'pending') return false;
      t.set(refRef, { status: 'rewarded', rewarded_at: new Date().toISOString(), referrer_capped: referrerCapped }, { merge: true });
      return true;
    });
    if (!won) return;

    await grantListingCredits(sellerId, cfg.referral.reward_listings, cfg.referral.reward_valid_months, 'referral_invited');
    if (!referrerCapped) {
      await grantListingCredits(referrerId, cfg.referral.reward_listings, cfg.referral.reward_valid_months, 'referral_referrer');
    }
  } catch (e: any) {
    console.error('[promotions] processReferralOnSale failed:', e?.message || e);
  }
}

// ---------- Aktionscodes ----------

export interface PromoCodeDoc {
  code: string;
  description?: string;
  type: 'commission_percent' | 'commission_fixed' | 'bonus_listings';
  value: number;
  max_discount_cents?: number;
  min_purchase_cents?: number;
  max_uses?: number;
  per_user_limit?: number;
  used_count?: number;
  valid_from?: string | null;
  valid_until?: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export class PromoError extends Error {
  code = 'PROMO_INVALID';
  statusCode = 400;
}

async function loadPromo(code: string): Promise<PromoCodeDoc> {
  const norm = normalizePromoCode(code);
  if (!norm) throw new PromoError('Vnesite kodo.');
  const snap = await adminDb.collection('promo_codes').doc(norm).get();
  if (!isDocSnapshotExists(snap)) throw new PromoError('Koda ne obstaja.');
  const promo = getDocSnapshotData<PromoCodeDoc>(snap) as PromoCodeDoc;
  const now = Date.now();
  if (!promo.active) throw new PromoError('Koda ni aktivna.');
  if (promo.valid_from && new Date(promo.valid_from).getTime() > now) throw new PromoError('Koda še ni veljavna.');
  if (promo.valid_until && new Date(promo.valid_until).getTime() < now) throw new PromoError('Koda je potekla.');
  if ((promo.max_uses || 0) > 0 && (promo.used_count || 0) >= (promo.max_uses as number)) {
    throw new PromoError('Koda je bila že porabljena.');
  }
  return promo;
}

async function assertPerUserLimit(promo: PromoCodeDoc, uid: string) {
  const limit = promo.per_user_limit && promo.per_user_limit > 0 ? promo.per_user_limit : 1;
  const used = await adminDb.collection('promo_redemptions')
    .where('uid', '==', uid).where('code', '==', promo.code).where('status', '==', 'redeemed').get();
  if (used.size >= limit) throw new PromoError('To kodo ste že uporabili.');
}

// Deutscher Kommentar: Berechnet den Rabatt auf die Provision (vor MwSt); wirft PromoError bei ungueltigem Code
export async function resolvePromoForPurchase(
  rawCode: any,
  uid: string,
  itemPriceCents: number,
  feeCents: number
): Promise<{ code: string; discountCents: number; description: string }> {
  const promo = await loadPromo(rawCode);
  if (promo.type === 'bonus_listings') throw new PromoError('Ta koda ni namenjena plačilu. Vnesite jo v nastavitvah.');
  if ((promo.min_purchase_cents || 0) > itemPriceCents) {
    throw new PromoError('Znesek nakupa je prenizek za to kodo.');
  }
  await assertPerUserLimit(promo, uid);

  let discount = 0;
  if (promo.type === 'commission_percent') {
    discount = Math.round((feeCents * Math.min(100, Math.max(0, promo.value))) / 100);
  } else {
    discount = Math.round(promo.value);
  }
  if ((promo.max_discount_cents || 0) > 0) discount = Math.min(discount, promo.max_discount_cents as number);
  discount = Math.max(0, Math.min(discount, feeCents));
  return { code: promo.code, discountCents: discount, description: promo.description || '' };
}

// Deutscher Kommentar: Verbucht die Einloesung nach erfolgreicher Zahlung (idempotent pro Nutzer und Dražba)
export async function markPromoRedeemed(code: string, uid: string, auctionId: string, discountCents: number) {
  const norm = normalizePromoCode(code);
  if (!norm || !uid || !auctionId) return;
  try {
    const redRef = adminDb.collection('promo_redemptions').doc(`${uid}_${auctionId}_${norm}`);
    const promoRef = adminDb.collection('promo_codes').doc(norm);
    await adminDb.runTransaction(async (t: any) => {
      const s = await t.get(redRef);
      if (isDocSnapshotExists(s)) return;
      t.set(redRef, {
        uid, auction_id: auctionId, code: norm, discount_cents: discountCents,
        status: 'redeemed', created_at: new Date().toISOString()
      });
      t.set(promoRef, { used_count: FieldValue.increment(1), total_discount_cents: FieldValue.increment(discountCents) }, { merge: true });
    });
  } catch (e: any) {
    console.error('[promotions] markPromoRedeemed failed:', e?.message || e);
  }
}

// ---------- Routen ----------

async function requireUser(req: Request, res: Response): Promise<string | null> {
  try {
    return await authenticateFirebaseUser(req);
  } catch (e: any) {
    res.status(401).json({ error: e?.message || 'Unauthorized' });
    return null;
  }
}

function publicBaseUrl(req: Request): string {
  const env = process.env.APP_URL || process.env.PUBLIC_APP_URL || '';
  if (env) return env.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  return `${proto}://${host}`;
}

function sanitizePromoInput(body: any): PromoCodeDoc {
  const code = normalizePromoCode(body?.code);
  if (!code || code.length < 3) throw new PromoError('Koda mora imeti vsaj 3 znake (A–Z, 0–9).');
  const type = body?.type;
  if (!['commission_percent', 'commission_fixed', 'bonus_listings'].includes(type)) throw new PromoError('Neveljavna vrsta kode.');
  const value = Number(body?.value);
  if (!Number.isFinite(value) || value <= 0) throw new PromoError('Vrednost mora biti večja od 0.');
  if (type === 'commission_percent' && value > 100) throw new PromoError('Odstotek je lahko največ 100.');
  const num = (v: any, def = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : def);
  const date = (v: any) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };
  return {
    code,
    description: String(body?.description || '').slice(0, 200),
    type,
    value: type === 'commission_percent' ? value : Math.floor(value),
    max_discount_cents: num(body?.max_discount_cents),
    min_purchase_cents: num(body?.min_purchase_cents),
    max_uses: num(body?.max_uses),
    per_user_limit: Math.max(1, num(body?.per_user_limit, 1)),
    valid_from: date(body?.valid_from),
    valid_until: date(body?.valid_until),
    active: body?.active !== false
  };
}

export function registerPromotionRoutes(app: Express, deps: { isAdminUser: (uid: string) => Promise<boolean> }) {
  const requireAdmin = async (req: Request, res: Response): Promise<string | null> => {
    const uid = await requireUser(req, res);
    if (!uid) return null;
    if (!(await deps.isAdminUser(uid))) {
      res.status(403).json({ error: 'Forbidden' });
      return null;
    }
    return uid;
  };

  // Oeffentlich: Anzahl der verbleibenden Gruendungsplaetze (fuer Registrierungsseite)
  app.get('/api/promotions/public', async (_req, res) => {
    const cfg = await getPromoConfig();
    res.json({
      founder: {
        enabled: cfg.founder.enabled,
        remaining: Math.max(0, cfg.founder.limit - cfg.founder.count),
        limit: cfg.founder.limit,
        months: cfg.founder.months
      },
      referral: { enabled: cfg.referral.enabled, reward_listings: cfg.referral.reward_listings }
    });
  });

  // Nutzer: eigener Status (Gruendungsmitglied, Einladungslink, Bonus-Inserate)
  app.get('/api/promotions/me', async (req, res) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    try {
      const cfg = await getPromoConfig();
      const userSnap = await adminDb.collection('users').doc(uid).get();
      const user = getDocSnapshotData<any>(userSnap) || {};
      const fp = buildFingerprint(req, req.query.device_id, req.query.fp);
      const code = cfg.referral.enabled ? await ensureReferralCode(uid) : (user.referral_code || null);
      await rememberKnownIp(uid, fp.ipHash);

      const refs = await adminDb.collection('referrals').where('referrer_id', '==', uid).get();
      const invited = refs.docs.map((d: any) => {
        const r = d.data();
        return { status: r.status, created_at: r.created_at, rewarded_at: r.rewarded_at || null, reject_reason: r.status === 'rejected' ? 'not_eligible' : null };
      });
      const mine = await adminDb.collection('referrals').doc(uid).get();
      const myRef = isDocSnapshotExists(mine) ? getDocSnapshotData<any>(mine) : null;

      res.json({
        founder: getFounderStatus(user),
        effective_tier: getEffectiveTier(user),
        referral: {
          enabled: cfg.referral.enabled,
          code,
          link: code ? `${publicBaseUrl(req)}/?ref=${code}` : null,
          reward_listings: cfg.referral.reward_listings,
          reward_valid_months: cfg.referral.reward_valid_months,
          invited,
          invited_by_status: myRef ? myRef.status : null
        },
        credits: getActiveCreditList(user).map(c => ({ remaining: c.remaining, expires_at: c.expires_at, source: c.source }))
      });
    } catch (e: any) {
      console.error('[promotions/me]', e);
      res.status(500).json({ error: 'Podatkov ni bilo mogoče pridobiti.' });
    }
  });

  // Nutzer: Code fuer Bonus-Inserate einloesen
  app.post('/api/promotions/redeem-code', async (req, res) => {
    const uid = await requireUser(req, res);
    if (!uid) return;
    try {
      const promo = await loadPromo(req.body?.code);
      if (promo.type !== 'bonus_listings') throw new PromoError('Ta koda se vnese pri plačilu dražbe.');
      await assertPerUserLimit(promo, uid);
      await grantListingCredits(uid, Math.floor(promo.value), 6, `promo_${promo.code}`);
      const redRef = adminDb.collection('promo_redemptions').doc(`${uid}_listings_${promo.code}_${Date.now()}`);
      await redRef.set({ uid, code: promo.code, auction_id: null, discount_cents: 0, listings: Math.floor(promo.value), status: 'redeemed', created_at: new Date().toISOString() });
      await adminDb.collection('promo_codes').doc(promo.code).set({ used_count: FieldValue.increment(1) }, { merge: true });
      res.json({ success: true, listings: Math.floor(promo.value) });
    } catch (e: any) {
      if (e instanceof PromoError) return res.status(400).json({ error: e.message });
      console.error('[promotions/redeem-code]', e);
      res.status(500).json({ error: 'Kode ni bilo mogoče vnesti.' });
    }
  });

  // ---- Admin ----
  app.get('/api/admin/promotions/overview', async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const cfg = await getPromoConfig();
      const [founders, referrals, promos] = await Promise.all([
        adminDb.collection('users').where('founder_number', '>', 0).orderBy('founder_number', 'desc').limit(100).get(),
        adminDb.collection('referrals').orderBy('created_at', 'desc').limit(200).get(),
        adminDb.collection('promo_codes').get()
      ]);
      const referralRows = referrals.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      const counts = referralRows.reduce((acc: any, r: any) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
      res.json({
        config: cfg,
        founders: founders.docs.map((d: any) => {
          const u = d.data();
          return { id: d.id, email: u.email || '', username: u.username || '', founder_number: u.founder_number, founder_since: u.founder_since, founder_until: u.founder_until, founder_tier: u.founder_tier, founder_revoked: u.founder_revoked === true };
        }),
        referrals: referralRows.map((r: any) => ({ ...r, ip_hash: undefined, device_hash: undefined, fp_hash: undefined })),
        referralCounts: counts,
        promoCodes: promos.docs.map((d: any) => ({ ...d.data() }))
      });
    } catch (e: any) {
      console.error('[admin/promotions/overview]', e);
      res.status(500).json({ error: 'Podatkov ni bilo mogoče pridobiti.' });
    }
  });

  app.post('/api/admin/promotions/config', async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const current = await getPromoConfig();
      const b = req.body || {};
      const next: PromoConfig = {
        founder: {
          ...current.founder,
          enabled: b.founder?.enabled !== undefined ? b.founder.enabled === true : current.founder.enabled,
          limit: Math.max(current.founder.count, Math.floor(Number(b.founder?.limit ?? current.founder.limit)) || current.founder.limit),
          months: Math.min(36, Math.max(1, Math.floor(Number(b.founder?.months ?? current.founder.months)) || current.founder.months)),
          tier: b.founder?.tier === 'BASIC' ? 'BASIC' : 'PRO',
          eligible_from: b.founder && 'eligible_from' in b.founder ? (b.founder.eligible_from && !isNaN(new Date(b.founder.eligible_from).getTime()) ? new Date(b.founder.eligible_from).toISOString() : null) : current.founder.eligible_from
        },
        referral: {
          enabled: b.referral?.enabled !== undefined ? b.referral.enabled === true : current.referral.enabled,
          reward_listings: Math.min(50, Math.max(0, Math.floor(Number(b.referral?.reward_listings ?? current.referral.reward_listings)))),
          reward_valid_months: Math.min(36, Math.max(1, Math.floor(Number(b.referral?.reward_valid_months ?? current.referral.reward_valid_months)) || 6)),
          max_rewards_per_user: Math.min(1000, Math.max(0, Math.floor(Number(b.referral?.max_rewards_per_user ?? current.referral.max_rewards_per_user))))
        }
      };
      // Deutscher Kommentar: Der Zaehler wird nie ueberschrieben, damit keine Plaetze doppelt vergeben werden
      await configRef().set({ founder: next.founder, referral: next.referral }, { merge: true });
      res.json({ success: true, config: next });
    } catch (e: any) {
      console.error('[admin/promotions/config]', e);
      res.status(500).json({ error: 'Shranjevanje ni uspelo.' });
    }
  });

  app.post('/api/admin/promotions/founder', async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { user_id, email, action } = req.body || {};
      let uid = typeof user_id === 'string' ? user_id : '';
      if (!uid && typeof email === 'string' && email) {
        const q = await adminDb.collection('users').where('email', '==', email.trim().toLowerCase()).limit(1).get();
        uid = q.docs[0]?.id || '';
      }
      if (!uid) return res.status(404).json({ error: 'Uporabnik ni najden.' });
      const userRef = adminDb.collection('users').doc(uid);
      const cfg = await getPromoConfig();
      if (action === 'revoke') {
        await userRef.set({ founder_revoked: true }, { merge: true });
        return res.json({ success: true });
      }
      if (action === 'restore') {
        await userRef.set({ founder_revoked: false }, { merge: true });
        return res.json({ success: true });
      }
      // grant (ausserhalb des automatischen Zaehlers, z. B. fuer Bestandsnutzer)
      const snap = await userRef.get();
      const user = getDocSnapshotData<any>(snap) || {};
      if (typeof user.founder_number === 'number') return res.status(400).json({ error: 'Uporabnik je že ustanovni član.' });
      const number = await adminDb.runTransaction(async (t: any) => {
        const c = await t.get(configRef());
        const cc = mergeConfig(isDocSnapshotExists(c) ? getDocSnapshotData(c) : null);
        const n = cc.founder.count + 1;
        t.set(configRef(), { founder: { ...cc.founder, count: n, limit: Math.max(cc.founder.limit, n) } }, { merge: true });
        return n;
      });
      const now = new Date();
      await userRef.set({
        founder_number: number,
        founder_since: now.toISOString(),
        founder_until: addMonths(now, cfg.founder.months).toISOString(),
        founder_tier: cfg.founder.tier,
        founder_revoked: false
      }, { merge: true });
      res.json({ success: true, founder_number: number });
    } catch (e: any) {
      console.error('[admin/promotions/founder]', e);
      res.status(500).json({ error: 'Dejanje ni uspelo.' });
    }
  });

  app.post('/api/admin/promotions/referral', async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { invited_id, action } = req.body || {};
      if (typeof invited_id !== 'string' || !invited_id) return res.status(400).json({ error: 'Manjka ID.' });
      const refRef = adminDb.collection('referrals').doc(invited_id);
      const snap = await refRef.get();
      if (!isDocSnapshotExists(snap)) return res.status(404).json({ error: 'Povabilo ne obstaja.' });
      if (action === 'reject') {
        await refRef.set({ status: 'rejected', reject_reason: 'admin_rejected' }, { merge: true });
      } else if (action === 'approve') {
        // Deutscher Kommentar: Manuelle Freigabe setzt den Status zurueck auf pending und belohnt sofort, falls bereits ein Verkauf vorliegt
        const prev = getDocSnapshotData<any>(snap) || {};
        if (prev.status === 'rewarded') return res.status(400).json({ error: 'Nagrada je že izplačana.' });
        await refRef.set({ status: 'pending', reject_reason: null }, { merge: true });
        const sold = await adminDb.collection('transactions').where('seller_id', '==', invited_id).where('status', '==', 'COMPLETED').limit(1).get();
        if (!sold.empty) await processReferralOnSale(invited_id);
      } else {
        return res.status(400).json({ error: 'Neznano dejanje.' });
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error('[admin/promotions/referral]', e);
      res.status(500).json({ error: 'Dejanje ni uspelo.' });
    }
  });

  app.post('/api/admin/promotions/promo-codes', async (req, res) => {
    const adminUid = await requireAdmin(req, res);
    if (!adminUid) return;
    try {
      const input = sanitizePromoInput(req.body);
      const ref = adminDb.collection('promo_codes').doc(input.code);
      const snap = await ref.get();
      const now = new Date().toISOString();
      const prev = isDocSnapshotExists(snap) ? (getDocSnapshotData<any>(snap) || {}) : null;
      await ref.set({
        ...input,
        used_count: prev?.used_count || 0,
        total_discount_cents: prev?.total_discount_cents || 0,
        created_at: prev?.created_at || now,
        created_by: prev?.created_by || adminUid,
        updated_at: now
      }, { merge: true });
      res.json({ success: true, code: input.code });
    } catch (e: any) {
      if (e instanceof PromoError) return res.status(400).json({ error: e.message });
      console.error('[admin/promo-codes]', e);
      res.status(500).json({ error: 'Shranjevanje ni uspelo.' });
    }
  });

  app.post('/api/admin/promotions/promo-codes/toggle', async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const code = normalizePromoCode(req.body?.code);
      if (!code) return res.status(400).json({ error: 'Manjka koda.' });
      if (req.body?.delete === true) {
        await adminDb.collection('promo_codes').doc(code).delete();
      } else {
        await adminDb.collection('promo_codes').doc(code).set({ active: req.body?.active === true, updated_at: new Date().toISOString() }, { merge: true });
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error('[admin/promo-codes/toggle]', e);
      res.status(500).json({ error: 'Dejanje ni uspelo.' });
    }
  });
}
