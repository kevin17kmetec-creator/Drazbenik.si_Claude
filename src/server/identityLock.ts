import { adminDb } from '../lib/firebase-admin';
import crypto from 'crypto';

/**
 * Hilfsfunktion zur Bereinigung der Steuernummer (entfernt alle Zeichen ausser Ziffern)
 * Behaelt nur Ziffern und fuegt den Laendercode hinzu.
 */
export function normalizeTaxId(taxId: string, country: string = 'SI'): string | null {
  if (!taxId) return null;
  const digits = taxId.replace(/\D/g, '');
  if (!digits) return null;
  const countryKey = (country || 'SI').toUpperCase();
  return `${countryKey}:${digits}`;
}

/**
 * Erstellt den HMAC-SHA256-Schluessel der Steuernummer.
 * Der Document-ID in Firestore wird dieses Hash-Ergebnis sein, damit sensible Daten unlesbar bleiben.
 */
export function lockKey(normalizedTaxId: string): string {
  const secret = process.env.IDENTITY_LOCK_SECRET || '';
  return crypto.createHmac('sha256', secret).update(normalizedTaxId).digest('hex');
}

/**
 * Versucht, eine Steuernummer fuer einen Benutzer zu reservieren (Claim-Prozess).
 * Wird in einer Transaktion ausgefuehrt, um Race-Conditions zu vermeiden.
 */
export async function claimIdentityLock(
  uid: string, 
  taxId: string, 
  country: string = 'SI'
): Promise<{ success: boolean; error?: 'TAX_ID_IN_USE' | 'IDENTITY_BLOCKED' }> {
  const secret = process.env.IDENTITY_LOCK_SECRET;
  if (!secret) {
    console.error("IDENTITY_LOCK_SECRET ist nicht gesetzt. Sperre wird uebersprungen (fail-open).");
    return { success: true };
  }

  const normalized = normalizeTaxId(taxId, country);
  if (!normalized) {
    return { success: true };
  }

  const docId = lockKey(normalized);
  const lockRef = adminDb.collection('identity_locks').doc(docId);

  try {
    return await adminDb.runTransaction(async (transaction) => {
      const lockSnap = await transaction.get(lockRef);

      if (!lockSnap.exists) {
        // Keine Sperre vorhanden -> Sperre fuer den Benutzer anlegen
        transaction.set(lockRef, {
          uid,
          created_at: new Date().toISOString(),
          blocked: false
        });
        return { success: true };
      }

      const lockData = lockSnap.data() || {};
      
      // Wenn die Sperre bereits diesem Benutzer gehört, ist alles in Ordnung
      if (lockData.uid === uid) {
        return { success: true };
      }

      // Če je zapora blokirana, zavrni
      if (lockData.blocked === true) {
        return { success: false, error: 'IDENTITY_BLOCKED' };
      }

      // Če zapora pripada drugemu uporabniku: pravilo "Prvi obdrži"
      // Prvi uporabnik obdrži zaporo, drugi uporabnik je ne more prevzeti ali ponastaviti njegovega profila.
      const otherUid = lockData.uid;
      const otherUserRef = adminDb.collection('users').doc(otherUid);
      const otherUserSnap = await transaction.get(otherUserRef);

      if (!otherUserSnap.exists) {
        // Prejšnji uporabnik ne obstaja več v bazi -> prevzemi osirotelo zaporo
        transaction.set(lockRef, {
          uid,
          created_at: new Date().toISOString(),
          blocked: false
        });
        return { success: true };
      }

      // Prejšnji uporabnik obstaja -> prvi uporabnik obdrži zaporo
      return { success: false, error: 'TAX_ID_IN_USE' };
    });
  } catch (err: any) {
    console.error("Napaka pri uveljavljanju zapore identitete:", err);
    throw err;
  }
}

/**
 * Loescht die Sperre, falls sie nicht blockiert ist und dem Benutzer gehoert.
 * Dadurch kann ein ehrlicher Benutzer seinen Account loeschen und sich neu registrieren.
 */
export async function releaseIdentityLock(uid: string, taxId: string, country: string = 'SI'): Promise<void> {
  const secret = process.env.IDENTITY_LOCK_SECRET;
  if (!secret) return;

  const normalized = normalizeTaxId(taxId, country);
  if (!normalized) return;

  const docId = lockKey(normalized);
  const lockRef = adminDb.collection('identity_locks').doc(docId);

  try {
    await adminDb.runTransaction(async (transaction) => {
      const lockSnap = await transaction.get(lockRef);
      if (lockSnap.exists) {
        const lockData = lockSnap.data() || {};
        if (lockData.uid === uid && lockData.blocked !== true) {
          transaction.delete(lockRef);
        }
      }
    });
  } catch (err) {
    console.error("Fehler beim Loeschen des Identity Locks:", err);
  }
}

/**
 * Markiert eine Identitaet dauerhaft als blockiert (z. B. wegen Strikes oder admin-Sperre).
 */
export async function markIdentityBlocked(uid: string, reason: string = 'unpaid_strikes'): Promise<void> {
  const secret = process.env.IDENTITY_LOCK_SECRET;
  if (!secret) return;

  try {
    const userSnap = await adminDb.collection('users').doc(uid).get();
    if (!userSnap.exists) return;

    const userData = userSnap.data() || {};
    const taxId = userData.tax_id || userData.tax_number || userData.taxNumber || userData.taxId;
    const country = userData.country || userData.country_code || userData.countryCode || 'SI';

    if (!taxId) return;

    const normalized = normalizeTaxId(taxId, country);
    if (!normalized) return;

    const docId = lockKey(normalized);

    await adminDb.collection('identity_locks').doc(docId).set({
      uid,
      blocked: true,
      blocked_at: new Date().toISOString(),
      blocked_reason: reason
    }, { merge: true });
  } catch (err) {
    console.error("Fehler beim Markieren des Identity Locks als blockiert:", err);
  }
}
