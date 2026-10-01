export interface MissingField {
  key: string;
  label: string;
  description: string;
}

export interface InvoiceDataCheckResult {
  isComplete: boolean;
  userType: 'individual' | 'business';
  missingFields: MissingField[];
}

export function checkUserInvoiceData(user: any): InvoiceDataCheckResult {
  if (!user) {
    return {
      isComplete: false,
      userType: 'individual',
      missingFields: [
        { key: 'user', label: 'Uporabniški račun', description: 'Za objavo morate biti prijavljeni.' }
      ]
    };
  }

  const isBusiness = user.user_type === 'business' || user.company_status === 'company' || user.isCompany || user.userType === 'business';
  const missingFields: MissingField[] = [];

  if (isBusiness) {
    const companyName = (user.company_name || user.companyName || '').trim();
    const taxNumber = (user.tax_number || user.tax_id || user.taxNumber || user.vat_id || user.vatId || '').trim();
    const regNumber = (user.registration_number || user.regNumber || user.regNo || '').trim();
    const companyStreet = (user.company_street || user.companyStreet || user.street || '').trim();
    const companyCity = (user.company_city || user.companyCity || user.city || '').trim();
    const companyPostalCode = (user.company_postal_code || user.companyPostalCode || user.postal_code || user.postalCode || '').trim();
    const representative = (user.representative || '').trim();
    const address = (typeof user.address === 'string' ? user.address : '').trim();

    if (!companyName) {
      missingFields.push({
        key: 'companyName',
        label: 'Naziv podjetja',
        description: 'Polno ime podjetja ali s.p., kot je vpisano v poslovnem registru.'
      });
    }

    if (!taxNumber) {
      missingFields.push({
        key: 'taxNumber',
        label: 'Davčna številka (ID za DDV)',
        description: 'Obvezna za izdajo računov in obračun DDV.'
      });
    }

    if (!regNumber) {
      missingFields.push({
        key: 'regNumber',
        label: 'Matična številka',
        description: 'Matična številka podjetja za uradno identifikacijo na računu.'
      });
    }

    if (!companyStreet && (!address || address.length < 5)) {
      missingFields.push({
        key: 'companyStreet',
        label: 'Sedež podjetja (Ulica in hišna št.)',
        description: 'Uradni naslov sedeža podjetja.'
      });
    }

    if (!companyPostalCode && (!address || !/\d{4}/.test(address))) {
      missingFields.push({
        key: 'companyPostalCode',
        label: 'Poštna številka',
        description: 'Poštna številka kraja sedeža.'
      });
    }

    if (!companyCity && (!address || !address.includes(','))) {
      missingFields.push({
        key: 'companyCity',
        label: 'Kraj / Mesto sedeža',
        description: 'Kraj sedeža podjetja.'
      });
    }

    if (!representative) {
      missingFields.push({
        key: 'representative',
        label: 'Zakoniti zastopnik',
        description: 'Ime in priimek zakonitega zastopnika ali odgovorne osebe.'
      });
    }

    return {
      isComplete: missingFields.length === 0,
      userType: 'business',
      missingFields
    };
  } else {
    // Individual
    const firstName = (user.first_name || user.firstName || '').trim();
    const lastName = (user.last_name || user.lastName || '').trim();
    const street = (user.street || '').trim();
    const city = (user.city || '').trim();
    const postalCode = (user.postal_code || user.postalCode || '').trim();
    const taxNumber = (user.tax_number || user.tax_id || user.taxNumber || user.taxId || '').trim();
    const address = (typeof user.address === 'string' ? user.address : '').trim();

    if (!firstName) {
      missingFields.push({
        key: 'firstName',
        label: 'Ime',
        description: 'Osebno ime prodajalca.'
      });
    }

    if (!lastName) {
      missingFields.push({
        key: 'lastName',
        label: 'Priimek',
        description: 'Priimek prodajalca.'
      });
    }

    if (!street && (!address || address.length < 5)) {
      missingFields.push({
        key: 'street',
        label: 'Ulica in hišna številka',
        description: 'Naslov bivališča prodajalca.'
      });
    }

    if (!postalCode && (!address || !/\d{4}/.test(address))) {
      missingFields.push({
        key: 'postalCode',
        label: 'Poštna številka',
        description: 'Poštna številka kraja bivanja.'
      });
    }

    if (!city && (!address || !address.includes(','))) {
      missingFields.push({
        key: 'city',
        label: 'Kraj / Mesto',
        description: 'Kraj bivanja prodajalca.'
      });
    }

    if (!taxNumber) {
      missingFields.push({
        key: 'taxNumber',
        label: 'Davčna številka',
        description: 'Davčna številka je obvezna za kupoprodajno pogodbo in izdajo računov.'
      });
    }

    return {
      isComplete: missingFields.length === 0,
      userType: 'individual',
      missingFields
    };
  }
}
