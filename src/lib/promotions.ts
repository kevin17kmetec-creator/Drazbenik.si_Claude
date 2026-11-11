// Deutscher Kommentar: Gemeinsame (Client und Server) Hilfsfunktionen fuer Gruendungsmitglieder, Bonus-Inserate und Aktionscodes

export type PromoTier = 'FREE' | 'BASIC' | 'PRO';

export const TIER_RANK: Record<PromoTier, number> = { FREE: 0, BASIC: 1, PRO: 2 };

export interface FounderStatus {
  isFounder: boolean;
  isActive: boolean;
  number: number | null;
  tier: PromoTier;
  since: string | null;
  until: string | null;
  daysLeft: number;
}

// Deutscher Kommentar: Liest den Gruendungsmitglied-Status aus dem Nutzerdokument (nur lesend, Werte schreibt ausschliesslich der Server)
export function getFounderStatus(userData: any, nowMs = Date.now()): FounderStatus {
  const number = typeof userData?.founder_number === 'number' ? userData.founder_number : null;
  const until: string | null = userData?.founder_until || null;
  const untilMs = until ? new Date(until).getTime() : NaN;
  const rawTier = String(userData?.founder_tier || 'PRO').toUpperCase();
  const tier: PromoTier = rawTier === 'BASIC' ? 'BASIC' : rawTier === 'FREE' ? 'FREE' : 'PRO';
  const isFounder = number !== null && !!until;
  const isActive = isFounder && !isNaN(untilMs) && untilMs > nowMs && userData?.founder_revoked !== true;
  const daysLeft = isActive ? Math.max(0, Math.ceil((untilMs - nowMs) / 86400000)) : 0;
  return {
    isFounder,
    isActive,
    number,
    tier,
    since: userData?.founder_since || null,
    until,
    daysLeft
  };
}

// Deutscher Kommentar: Hoehere der beiden Stufen (bezahltes Abo gegen Gruendungsmitglied-Vorteil)
export function maxTier(a: PromoTier, b: PromoTier): PromoTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export interface ListingCredit {
  id: string;
  remaining: number;
  granted_at: string;
  expires_at: string;
  source: string;
}

// Deutscher Kommentar: Summe aller noch gueltigen Bonus-Inserate
export function getActiveListingCredits(userData: any, nowMs = Date.now()): number {
  const list: ListingCredit[] = Array.isArray(userData?.listing_credits) ? userData.listing_credits : [];
  return list.reduce((sum, c) => {
    const exp = new Date(c?.expires_at || 0).getTime();
    const rem = Number(c?.remaining) || 0;
    return exp > nowMs && rem > 0 ? sum + rem : sum;
  }, 0);
}

export function getActiveCreditList(userData: any, nowMs = Date.now()): ListingCredit[] {
  const list: ListingCredit[] = Array.isArray(userData?.listing_credits) ? userData.listing_credits : [];
  return list
    .filter(c => new Date(c?.expires_at || 0).getTime() > nowMs && (Number(c?.remaining) || 0) > 0)
    .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
}

// Deutscher Kommentar: Aktionscode normalisieren (Grossbuchstaben, nur A-Z, 0-9, Bindestrich, Unterstrich)
export function normalizePromoCode(raw: any): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}
