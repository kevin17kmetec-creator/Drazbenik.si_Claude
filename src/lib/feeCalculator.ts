export type Tier = 'FREE' | 'BASIC' | 'PRO';

const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
]);

// Deutscher Kommentar: Ermittelt die effektive Stufe des Benutzers unter Beruecksichtigung der Gueltigkeit
export function getEffectiveTier(userData: any, nowMs = Date.now()): Tier {
  if (!userData) return 'FREE';
  const raw = userData.subscription_tier || userData.subscription;
  if (!raw) return 'FREE';
  const upper = String(raw).toUpperCase();
  let tier: Tier = (upper === 'PRO' || upper === 'BASIC') ? upper : 'FREE';

  const subValidUntil = userData.subscription_valid_until;
  const isCanceled = userData.subscription_canceled === true;
  const isActive = userData.subscription_active !== false;

  if (subValidUntil) {
    const validUntilMs = new Date(subValidUntil).getTime();
    if (!isNaN(validUntilMs) && nowMs > validUntilMs && (isCanceled || !isActive)) {
      tier = 'FREE';
    }
  }
  return tier;
}

export const MIN_PLATFORM_FEE_CENTS = 100;

// Deutscher Kommentar: Berechnet die Plattformgebuehr in Cents (Prozentsatz nach Stufen, mindestens 100 Cents)
export function calculatePlatformFeeCents(itemPriceCents: number, tier: Tier): number {
  if (!itemPriceCents || itemPriceCents <= 0) return 0;
  let b1Bp = 1000; // 10%
  let b2Bp = 600;  // 6%
  let b3Bp = 450;  // 4.5%

  if (tier === 'PRO') {
    b1Bp = 500; // 5%
    b2Bp = 400; // 4%
    b3Bp = 320; // 3.2%
  } else if (tier === 'BASIC') {
    b1Bp = 700; // 7%
    b2Bp = 500; // 5%
    b3Bp = 400; // 4%
  }

  let totalFeeCents = 0;
  let remaining = itemPriceCents;

  // Deutscher Kommentar: Stufe 1 - bis 1.000 EUR (100.000 Cents)
  const inB1 = Math.min(remaining, 100000);
  totalFeeCents += (inB1 * b1Bp) / 10000;
  remaining -= inB1;

  // Deutscher Kommentar: Stufe 2 - von 1.000 EUR bis 5.000 EUR (weitere 400.000 Cents)
  if (remaining > 0) {
    const inB2 = Math.min(remaining, 400000);
    totalFeeCents += (inB2 * b2Bp) / 10000;
    remaining -= inB2;
  }

  // Deutscher Kommentar: Stufe 3 - ueber 5.000 EUR
  if (remaining > 0) {
    totalFeeCents += (remaining * b3Bp) / 10000;
  }

  // Deutscher Kommentar: Prozentualer Anteil gerundet, mindestens 1,00 EUR
  return Math.max(Math.round(totalFeeCents), MIN_PLATFORM_FEE_CENTS);
}

// Deutscher Kommentar: Ermittelt den MwSt-Satz und die Umkehrung der Steuerschuldnerschaft
export function getCommissionVat(countryCode: string, isBusiness: boolean, hasValidVatId: boolean): { vatRate: number; isReverseCharge: boolean } {
  const cc = (countryCode || 'SI').trim().toUpperCase();
  const isEu = EU_COUNTRIES.has(cc);

  if (!isEu) {
    return { vatRate: 0, isReverseCharge: false };
  }

  if (cc === 'SI') {
    return { vatRate: 22, isReverseCharge: false };
  }

  if (isBusiness && hasValidVatId) {
    return { vatRate: 0, isReverseCharge: true };
  }

  return { vatRate: 22, isReverseCharge: false };
}

// Deutscher Kommentar: Berechnet Gesamtsummen inklusive Gebuehren und MwSt
export function calculateTotals(params: {
  itemPriceCents: number;
  tier: Tier;
  countryCode: string;
  isBusiness: boolean;
  hasValidVatId: boolean;
}) {
  const { itemPriceCents, tier, countryCode, isBusiness, hasValidVatId } = params;
  const feeCents = calculatePlatformFeeCents(itemPriceCents, tier);
  const { vatRate, isReverseCharge } = getCommissionVat(countryCode, isBusiness, hasValidVatId);
  
  const vatCents = Math.round((feeCents * vatRate) / 100);
  const totalCents = itemPriceCents + feeCents + vatCents;
  const feePercent = itemPriceCents > 0 ? Math.round((feeCents / itemPriceCents) * 10000) / 100 : 0;
  const feeIsMinimum = feeCents <= MIN_PLATFORM_FEE_CENTS;

  return {
    itemPriceCents,
    bracketFeeCents: feeCents,
    feeCents,
    vatRate,
    vatCents,
    isReverseCharge,
    totalCents,
    feePercent,
    feeIsMinimum
  };
}
