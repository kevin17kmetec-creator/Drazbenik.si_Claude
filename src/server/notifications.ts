import { adminDb } from '../lib/firebase-admin';

export interface CreateNotificationParams {
  userId: string;
  type: 'outbid' | 'ending_soon' | 'won' | 'lost' | 'review_received' | 'seller_decision' | 'second_chance_offer' | 'second_chance_failed' | 'second_chance_accepted' | 'shipping_dispute' | 'shipping_required' | 'shipping_reminder' | 'item_shipped';
  auctionId: string;
  auctionTitle: string;
  imageUrl?: string;
  price: number;
  // Deutscher Kommentar: Optionaler freier Text und Zielansicht fuer die Navigation beim Klick
  message?: string;
  target?: 'unsold' | 'winnings' | 'reviews' | 'sold';
}

// Erstellt eine neue Benachrichtigung in der Firestore-Sammlung
export async function createNotification(params: CreateNotificationParams): Promise<string | null> {
  if (!params.userId) return null;
  try {
    const docRef = await adminDb.collection('notifications').add({
      user_id: params.userId,
      type: params.type,
      auction_id: params.auctionId,
      auction_title: params.auctionTitle || '',
      image_url: params.imageUrl || '',
      price: params.price || 0,
      message: params.message || '',
      target: params.target || '',
      read: false,
      created_at: new Date().toISOString()
    });
    return docRef.id;
  } catch (err: any) {
    console.error('[createNotification] Error creating notification:', err?.message || err);
    return null;
  }
}

// Prüft, ob ein Benutzer in den letzten 90 Sekunden aktiv war
export async function isUserOnline(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;
    const userData = userDoc.data();
    const lastSeen = userData?.last_seen_at;
    if (!lastSeen) return false;

    const lastSeenTime = typeof lastSeen === 'number'
      ? lastSeen
      : new Date(lastSeen).getTime();

    if (isNaN(lastSeenTime)) return false;
    return (Date.now() - lastSeenTime) < 90000; // 90 Sekunden
  } catch (err: any) {
    console.error('[isUserOnline] Error checking presence:', err?.message || err);
    return false;
  }
}
