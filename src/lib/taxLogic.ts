export interface TaxResult {
  commissionNet: number;
  vatRate: number;
  vatAmount: number;
  totalGross: number;
  isReverseCharge: boolean;
  viesValidationStatus?: string;
  viesValidatedAt?: string;
}

const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

export const isEuCountry = (countryCode: string) => EU_COUNTRIES.includes(countryCode.toUpperCase());

/**
 * Validates VAT number against VIES API.
 */
export const validateViesVat = async (countryCode: string, vatNumber: string): Promise<boolean> => {
  try {
    const response = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${countryCode}/vat/${vatNumber}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });
    if (response.ok) {
        const data = await response.json();
        return data.isValid === true;
    }
  } catch (error) {
    console.warn("VIES verification error, assuming valid as fallback for demo/prototype or error handling:", error);
  }
  // In case of network error (CORS), we fallback to false unless simulated for prototype
  return false;
};

/**
 * Calculates VAT for a digital service commission / platform fee based on buyer's tax status.
 * @param commissionNet Base amount of the commission.
 * @param countryCode Two-letter country code of the user (e.g., 'SI', 'DE').
 * @param isBusiness Boolean indicating if the user is a business.
 * @param vatId VAT ID string without the country prefix.
 * @returns TaxResult
 */
export const calculateCommissionTaxes = async (
  commissionNet: number, 
  countryCode: string, 
  isBusiness: boolean, 
  vatId?: string
): Promise<TaxResult> => {
  const code = (countryCode || 'SI').toUpperCase();
  const baseVAT = 22; // Slovenian VAT for digital services/commissions (platform is SI)

  let vatRate = baseVAT;
  let isReverseCharge = false;
  let viesValidationStatus: string | undefined = undefined;
  
  if (code === 'SI') {
    // Slovenia: Always 22%
    vatRate = 22;
  } else if (isEuCountry(code)) {
    // EU Countries other than SI
    if (isBusiness && vatId) {
      const isValidVIES = await validateViesVat(code, vatId);
      viesValidationStatus = isValidVIES ? 'VALID' : 'INVALID';
      
      if (isValidVIES) {
        vatRate = 0;
        isReverseCharge = true;
      } else {
        vatRate = 22;
      }
    } else {
      // B2C EU
      vatRate = 22;
    }
  } else {
    // Non-EU (Export)
    vatRate = 0;
  }

  const vatAmount = commissionNet * (vatRate / 100);
  const totalGross = commissionNet + vatAmount;

  return {
    commissionNet,
    vatRate,
    vatAmount,
    totalGross: totalGross,
    isReverseCharge,
    viesValidationStatus,
    viesValidatedAt: viesValidationStatus ? new Date().toISOString() : undefined
  };
};
