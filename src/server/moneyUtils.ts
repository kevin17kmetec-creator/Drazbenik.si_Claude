
export function parseAmountToCents(val: any): number {
  if (val === undefined || val === null) return 0;
  let parsed = 0;
  if (typeof val === 'number') {
    parsed = val;
  } else if (typeof val === 'string') {
    let cleaned = val.trim().replace(/,/g, '.');
    parsed = Number(cleaned);
  }
  
  if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  
  return Math.round(parsed * 100);
}

export function calculateMarginalPlatformFee(currentPrice: number, subscriptionTier: string | null | undefined): number {
  let bracket1Rate = 8;
  let bracket2Rate = 5;
  let bracket3Rate = 4;

  const upperTier = (subscriptionTier || '').toUpperCase();
  if (upperTier === 'PRO') {
    bracket1Rate = 3;
    bracket2Rate = 2;
    bracket3Rate = 1.5;
  } else if (upperTier === 'BASIC') {
    bracket1Rate = 5;
    bracket2Rate = 3;
    bracket3Rate = 2;
  }

  let totalFee = 0;
  if (currentPrice <= 50) {
    totalFee = currentPrice * (bracket1Rate / 100);
  } else if (currentPrice <= 500) {
    totalFee = 50 * (bracket1Rate / 100) + (currentPrice - 50) * (bracket2Rate / 100);
  } else {
    totalFee = 50 * (bracket1Rate / 100) + 450 * (bracket2Rate / 100) + (currentPrice - 500) * (bracket3Rate / 100);
  }

  return totalFee;
}

export function calculateCheckoutTotals(itemPriceInCents: number, sellerSubscriptionTier: string | null | undefined) {
  const itemPriceEuro = itemPriceInCents / 100;
  const platformFeeEuro = calculateMarginalPlatformFee(itemPriceEuro, sellerSubscriptionTier);
  const platformFeeInCents = Math.round(platformFeeEuro * 100);
  
  const vatInCents = 0; // The invoice generator handles actual VAT on the fee itself for B2B/B2C later if needed. For checkout total, we just add the item + fee.

  const buyerTotalInCents = itemPriceInCents + platformFeeInCents + vatInCents;
  
  return {
    itemPriceInCents,
    platformFeeInCents,
    vatInCents,
    buyerTotalInCents
  };
}
