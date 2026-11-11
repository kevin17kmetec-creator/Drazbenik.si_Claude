// Deutscher Kommentar: Regeln fuer eingeschraenkte Inserate (Immobilien nur per Anfrage, zulassungspflichtige Fahrzeuge nur Abholung mit PIN)
export const REAL_ESTATE_CATEGORY = 'Nepremičnine';
export const VEHICLE_CATEGORY = 'Avtomobilizem';

// Fahrzeugarten, bei denen Abholung mit PIN Pflicht ist und keine automatische Freigabe erfolgt
export const REGISTERED_VEHICLE_TYPES = [
  'Osebno vozilo',
  'Motorno kolo / Skuter',
  'Dostavno / Gospodarsko vozilo',
  'Prikolica / Vleka',
  'Avtodom / Počitniška prikolica',
];

export function isRealEstateCategory(category: any): boolean {
  const c = typeof category === 'object' && category ? (category.SLO || category.EN || '') : category;
  return String(c || '').trim() === REAL_ESTATE_CATEGORY;
}

export function isRegisteredVehicle(category: any, specifications: any): boolean {
  const c = typeof category === 'object' && category ? (category.SLO || category.EN || '') : category;
  if (String(c || '').trim() !== VEHICLE_CATEGORY) return false;
  const vt = specifications?.vehicle_type;
  return typeof vt === 'string' && REGISTERED_VEHICLE_TYPES.includes(vt);
}
