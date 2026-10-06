export type Tier = 'FREE' | 'BASIC' | 'PRO';

const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
]);

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

export function calculatePlatformFeeCents(itemPriceCents: number, tier: Tier): number {
  if (!itemPriceCents || itemPriceCents <= 0) return 0;
  let b1Bp = 800; // 8%
  let b2Bp = 500; // 5%
  let b3Bp = 400; // 4%

  if (tier === 'PRO') {
    b1Bp = 300; // 3%
    b2Bp = 250; // 2.5%
    b3Bp = 200; // 2%
  } else if (tier === 'BASIC') {
    b1Bp = 650; // 6.5%
    b2Bp = 400; // 4%
    b3Bp = 320; // 3.2%
  }

  let totalFeeCents = 0;
  let remaining = itemPriceCents;

  // Bracket 1: up to 100,000 cents (1000 EUR)
  const inB1 = Math.min(remaining, 100000);
  totalFeeCents += inB1 * b1Bp / 10000;
  remaining -= inB1;

  // Bracket 2: next 400,000 cents (4000 EUR, up to 500,000 cents)
  if (remaining > 0) {
    const inB2 = Math.min(remaining, 400000);
    totalFeeCents += inB2 * b2Bp / 10000;
    remaining -= inB2;
  }

  // Bracket 3: above 500,000 cents
  if (remaining > 0) {
    totalFeeCents += remaining * b3Bp / 10000;
  }

  let feeCents = Math.round(totalFeeCents);
  const minFeeCents = Math.round(itemPriceCents * 0.02);
  if (feeCents < minFeeCents) {
    feeCents = minFeeCents;
  }
  return feeCents;
}

export function getCommissionVat(countryCode: string, isBusiness: boolean, hasValidVatId: boolean): { vatRate: number; isReverseCharge: boolean } {
  const cc = (countryCode || 'SI').trim().toUpperCase();
  const isEu = EU_COUNTRIES.has(cc);

  if (!isEu) {
    return { vatRate: 0, isReverseCharge: false };
  }

  if (cc === 'SI') {
    return { vatRate: 22, isReverseCharge: false };
  }

  // Other EU
  if (isBusiness && hasValidVatId) {
    return { vatRate: 0, isReverseCharge: true };
  }

  return { vatRate: 22, isReverseCharge: false };
}

export const STRIPE_CARD_BPS = 190;
export const STRIPE_CARD_FIXED_CENTS = 25;
export const CONNECT_PAYOUT_BPS = 25;
export const CONNECT_PAYOUT_FIXED_CENTS = 10;
export const COST_SAFETY_MARGIN_CENTS = 20;

export function calculateMinimumFeeCents(itemPriceCents: number, vatRate: number): number {
  const costs = itemPriceCents * (STRIPE_CARD_BPS + CONNECT_PAYOUT_BPS) / 10000 + STRIPE_CARD_FIXED_CENTS + CONNECT_PAYOUT_FIXED_CENTS + COST_SAFETY_MARGIN_CENTS;
  const denominator = 1 - (STRIPE_CARD_BPS / 10000) * (1 + vatRate / 100);
  return Math.ceil(costs / denominator);
}

export function calculateTotals(params: {
  itemPriceCents: number;
  tier: Tier;
  countryCode: string;
  isBusiness: boolean;
  hasValidVatId: boolean;
}) {
  const { itemPriceCents, tier, countryCode, isBusiness, hasValidVatId } = params;
  const bracketFee = calculatePlatformFeeCents(itemPriceCents, tier);
  const { vatRate, isReverseCharge } = getCommissionVat(countryCode, isBusiness, hasValidVatId);
  
  const minFee = calculateMinimumFeeCents(itemPriceCents, vatRate);
  const feeCents = Math.max(bracketFee, minFee);
  
  const vatCents = Math.round((feeCents * vatRate) / 100);
  const totalCents = itemPriceCents + feeCents + vatCents;
  const feePercent = itemPriceCents > 0 ? Math.round((feeCents / itemPriceCents) * 10000) / 100 : 0;
  const feeIsMinimum = minFee > bracketFee;

  return {
    itemPriceCents,
    feeCents,
    vatRate,
    vatCents,
    isReverseCharge,
    totalCents,
    feePercent,
    feeIsMinimum
  };
}
