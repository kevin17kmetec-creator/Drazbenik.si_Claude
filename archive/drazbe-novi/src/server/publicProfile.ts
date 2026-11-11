import { adminDb } from '../lib/firebase-admin';

/**
 * Helper to sync user profile data to public_profiles/{uid} collection.
 * Writes ONLY safe public profile fields. Never email, phone, street, postal code, tax numbers, wallet, subscription, or strikes.
 */
export async function syncPublicProfile(uid: string) {
  try {
    if (!uid) return;
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) return;
    const user = userDoc.data() || {};

    const userType = user.user_type || user.userType || 'individual';
    const companyName = (user.company_name || user.companyName || '').trim();
    const username = (user.username || user.userName || '').trim();
    const firstName = (user.first_name || user.firstName || '').trim();
    const lastName = (user.last_name || user.lastName || '').trim();

    let displayName = '';
    if (userType === 'business' && companyName) {
      displayName = companyName;
    } else if (username) {
      displayName = username;
    } else if (firstName) {
      const lastInitial = lastName ? ` ${lastName.charAt(0).toUpperCase()}.` : '';
      displayName = `${firstName}${lastInitial}`;
    }

    const photoUrl = user.profile_picture_url || user.profilePicture || user.photo_url || user.photoURL || null;
    const city = user.city || user.company_city || user.companyCity || null;
    const description = user.description || null;
    const createdAt = user.created_at || user.createdAt || new Date().toISOString();

    const soldCount = typeof user.sold_count === 'number' ? user.sold_count : (typeof user.soldCount === 'number' ? user.soldCount : 0);
    const unpaidPenalties = Number(user.unpaidStrikes ?? user.unpaid_penalties ?? user.unpaidPenalties ?? 0);

    const identityVerified = user.identity_verified === true;
    const isDeleted = Boolean(user.is_deleted || user.isDeleted);

    const publicProfileData = {
      username: username || null,
      display_name: displayName || 'Uporabnik',
      user_type: userType,
      company_name: companyName || null,
      photo_url: photoUrl,
      city: city || null,
      description: description || null,
      created_at: createdAt,
      sold_count: soldCount,
      unpaid_penalties: unpaidPenalties,
      identity_verified: identityVerified,
      is_deleted: isDeleted,
      updated_at: new Date().toISOString()
    };

    await adminDb.collection('public_profiles').doc(uid).set(publicProfileData, { merge: true });
  } catch (err: any) {
    console.error(`[syncPublicProfile] Error syncing for user ${uid}:`, err);
  }
}
