// Deutscher Kommentar: Regeln fuer Nutzer zwischen 16 und 18 Jahren (Zustimmung der Eltern)
export const ADULT_AGE = 18;
export const PARENTAL_CONSENT_VERSION = '2026-10-v1';

// Deutscher Kommentar: Nur das Geburtsjahr ist bekannt, daher gilt dieselbe Jahresrechnung wie bei der Mindestaltersgrenze
export function isMinorByBirthYear(birthYear: unknown, now: Date = new Date()): boolean {
  const by = Number(birthYear);
  if (!Number.isInteger(by) || by < 1900) return false;
  return now.getFullYear() - by < ADULT_AGE;
}

// Deutscher Kommentar: Zustimmung wird verlangt, solange sie fuer Minderjaehrige nicht gespeichert ist
export function needsParentalConsent(userData: any): boolean {
  if (!userData) return false;
  return isMinorByBirthYear(userData.birth_year ?? userData.birthYear) && userData.parental_consent !== true;
}
