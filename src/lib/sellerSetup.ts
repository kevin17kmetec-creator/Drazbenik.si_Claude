import { TERMS_VERSION } from './termsVersion';
import { auth } from './firebase';

export type SellerSetupStep = 'email' | 'profile' | 'terms' | 'payouts' | 'done';

// Bestimmt den nächsten ausstehenden Schritt für den Verkäufer-Onboarding-Prozess
export function getSellerSetupStep(userData: any): SellerSetupStep {
  if (!userData) return 'email';

  // 1. E-Mail nicht verifiziert
  const emailVerified = Boolean(auth.currentUser?.emailVerified || userData.email_verified);
  if (!emailVerified) {
    return 'email';
  }

  // 2. Profil nicht ausgefüllt (Verifizierung nicht abgeschlossen)
  if (userData.profile_completed !== true) {
    return 'profile';
  }

  // 3. Nutzungsbedingungen nicht auf dem neuesten Stand
  if (userData.terms_version !== TERMS_VERSION) {
    return 'terms';
  }

  // 4. Auszahlungen nicht eingerichtet (Stripe-Onboarding unvollständig)
  if (userData.stripe_onboarding_complete !== true) {
    return 'payouts';
  }

  return 'done';
}
