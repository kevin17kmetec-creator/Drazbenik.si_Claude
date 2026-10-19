import { adminDb, isDocSnapshotExists, getDocSnapshotData, FieldValue } from '../lib/firebase-admin';
import { cancelAuctionBankTransfer } from './bankTransferCancel';
import { syncPublicProfile } from './publicProfile';
import { createNotification, isUserOnline } from './notifications';
import { markIdentityBlocked } from './identityLock';
import Stripe from 'stripe';
import { Resend } from './localizedResend';
import {
  sendEndingSoonNotification,
  sendAuctionWonNotification,
  sendPaymentReminderNotification,
  sendReviewReminderNotification,
  sendSellerDecisionNeededNotification,
  sendSecondChanceFailedSellerNotification,
} from './emailService';

// Deutscher Kommentar: Regel - 2. Bieter bekommt nur dann eine Verwarnung, wenn er ein ausdrueckliches Verkaeuferangebot angenommen und nicht bezahlt hat
const SECOND_WINNER_UNPAID_GETS_WARNING = true;

function briefOf(a: any): { title: string; image?: string } {
  const title = a?.title?.SLO || a?.title?.EN || (typeof a?.title === 'string' ? a.title : 'Dražba');
  const image = Array.isArray(a?.images) && a.images.length > 0 ? a.images[0] : undefined;
  return { title, image };
}

async function contactOf(uid: string): Promise<{ email?: string; name: string }> {
  try {
    const snap = await adminDb.collection('users').doc(uid).get();
    const d: any = isDocSnapshotExists(snap) ? (getDocSnapshotData(snap) || {}) : {};
    return { email: d.email, name: d.first_name || d.company_name || d.username || 'Uporabnik' };
  } catch {
    return { name: 'Uporabnik' };
  }
}

export interface FinalizeAuctionResult {
  finalized: boolean;
  post_auction_status?: string;
  status?: string;
  auctionId?: string;
}

/**
 * Idempotent and race-safe auction finalization function.
 */
export async function finalizeAuction(auctionId: string): Promise<FinalizeAuctionResult> {
  if (!auctionId) return { finalized: false };
  const auctionRef = adminDb.collection('auctions').doc(auctionId);
  const now = new Date();
  const nowIso = now.toISOString();

  let finalizedData: any = null;

  try {
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(auctionRef);
      if (!snap.exists) return;
      const data = snap.data() || {};

      if (data.status !== 'active') {
        return;
      }

      const endTimeStr = data.end_time || data.endTime;
      if (!endTimeStr) return;

      const endTime = new Date(endTimeStr).getTime();
      if (endTime > now.getTime()) {
        return;
      }

      const hasBids = (data.bid_count > 0 || data.bidCount > 0) && (data.winner_id || data.winnerId);
      const title =
        data.title?.SLO ||
        data.title?.EN ||
        (typeof data.title === 'string' ? data.title : 'Predmet dražbe');
      const imageUrl =
        Array.isArray(data.images) && data.images.length > 0
          ? data.images[0]
          : undefined;
      const finalPrice = Number(data.current_price ?? data.currentBid ?? 0);
      const sellerId = data.seller_id || data.sellerId;

      if (hasBids) {
        const winnerId = data.winner_id || data.winnerId;
        const paymentDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

        transaction.update(auctionRef, {
          status: 'completed',
          post_auction_status: 'awaiting_payment_1st',
          payment_deadline: paymentDeadline,
          winner_notified: true,
          ended_at: nowIso,
          finalized_at: nowIso,
        });

        finalizedData = {
          finalized: true,
          post_auction_status: 'awaiting_payment_1st',
          status: 'completed',
          auctionId,
          title,
          imageUrl,
          finalPrice,
          winnerId,
          paymentDeadline,
          sellerId,
        };
      } else {
        transaction.update(auctionRef, {
          status: 'completed',
          post_auction_status: 'unsold',
          winner_notified: true,
          ended_at: nowIso,
          finalized_at: nowIso,
        });

        finalizedData = {
          finalized: true,
          post_auction_status: 'unsold',
          status: 'completed',
          auctionId,
          sellerId,
        };
      }
    });
  } catch (txErr: any) {
    console.error(`[finalizeAuction] Transaction error for auction ${auctionId}:`, txErr.message);
  }

  // Benachrichtigungen und E-Mails nach Auktionsende versenden
  if (finalizedData && finalizedData.finalized) {
    if (finalizedData.winnerId) {
      try {
        // Gewinner-Benachrichtigung im System erstellen
        await createNotification({
          userId: finalizedData.winnerId,
          type: 'won',
          auctionId,
          auctionTitle: finalizedData.title,
          imageUrl: finalizedData.imageUrl,
          price: finalizedData.finalPrice,
        });

        // E-Mail an Gewinner nur senden, wenn dieser nicht online ist
        const winnerOnline = await isUserOnline(finalizedData.winnerId);
        if (!winnerOnline) {
          const winnerSnap = await adminDb.collection('users').doc(finalizedData.winnerId).get();
          if (isDocSnapshotExists(winnerSnap)) {
            const winnerData = getDocSnapshotData(winnerSnap) || {};
            if (winnerData.email) {
              const pd = finalizedData.paymentDeadline;
              await sendAuctionWonNotification({
                toEmail: winnerData.email,
                recipientName: winnerData.first_name || winnerData.name || 'Zmagovalec',
                auctionId,
                auctionTitle: finalizedData.title,
                auctionImageUrl: finalizedData.imageUrl,
                winningPrice: finalizedData.finalPrice,
                paymentDeadlineFormatted: pd ? '48 ur (do ' + new Date(pd).toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit' }) + ' ob ' + new Date(pd).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' }) + ')' : '48 ur',
              });
            }
          }
        }
      } catch (winErr: any) {
        console.error(`[finalizeAuction] Error notifying winner ${finalizedData.winnerId}:`, winErr.message);
      }

      // Benachrichtigungen für alle anderen Bieter (lost)
      try {
        const otherBidders = new Set<string>();
        const privSnap = await adminDb.collection('auctions_private').doc(auctionId).get();
        if (isDocSnapshotExists(privSnap)) {
          const privData = getDocSnapshotData(privSnap) || {};
          const bidderIds: string[] = privData.bidder_ids || [];
          for (const bId of bidderIds) {
            if (bId && bId !== finalizedData.winnerId && bId !== finalizedData.sellerId) {
              otherBidders.add(bId);
            }
          }
          const topBids = privData.top_bids || [];
          for (const item of topBids) {
            const bId = item.user_id || item.userId;
            if (bId && bId !== finalizedData.winnerId && bId !== finalizedData.sellerId) {
              otherBidders.add(bId);
            }
          }
        }

        for (const loserId of otherBidders) {
          try {
            await createNotification({
              userId: loserId,
              type: 'lost',
              auctionId,
              auctionTitle: finalizedData.title,
              imageUrl: finalizedData.imageUrl,
              price: finalizedData.finalPrice,
            });
          } catch (lostErr: any) {
            console.error(`[finalizeAuction] Error notifying loser ${loserId}:`, lostErr.message);
          }
        }
      } catch (loserErr: any) {
        console.error(`[finalizeAuction] Error processing losers:`, loserErr.message);
      }
    }
  }

  return finalizedData || { finalized: false };
}

export interface CronRunResult {
  success: boolean;
  timestamp: string;
  actions: {
    reminders30mSent: number;
    auctionsEnded: number;
    winnersNotified: number;
    unsoldUpdated: number;
    paymentRemindersSent: number;
    expired1stProcessed: number;
    reviewRemindersSent: number;
  };
  details: string[];
}

export async function processAuctionCrons(): Promise<CronRunResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const details: string[] = [];
  const result: CronRunResult = {
    success: true,
    timestamp: nowIso,
    actions: {
      reminders30mSent: 0,
      auctionsEnded: 0,
      winnersNotified: 0,
      unsoldUpdated: 0,
      paymentRemindersSent: 0,
      expired1stProcessed: 0,
      reviewRemindersSent: 0,
    },
    details,
  };

  try {
    // -------------------------------------------------------------
    // 1. NOTIFICATIONS: 30 MINUTES BEFORE ENDING (Bounded Query)
    // -------------------------------------------------------------
    const plus30Iso = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    let remindersSnap;
    try {
      remindersSnap = await adminDb.collection('auctions')
        .where('status', '==', 'active')
        .where('end_time', '>=', nowIso)
        .where('end_time', '<=', plus30Iso)
        .limit(100)
        .get();
    } catch (e: any) {
      console.warn('[CRON] Failed to fetch 30m reminder auctions:', e.message);
      remindersSnap = { empty: true, docs: [] } as any;
    }

    for (const auctionDoc of remindersSnap.docs) {
      const data = auctionDoc.data();
      if (data.reminder_30m_sent) continue;
      const endTimeStr = data.end_time || data.endTime;
      if (!endTimeStr) continue;

      const endTime = new Date(endTimeStr).getTime();
      const diffMs = endTime - now.getTime();

      if (diffMs > 0 && diffMs <= 30 * 60 * 1000) {
        const auctionId = auctionDoc.id;
        const title =
          data.title?.SLO ||
          data.title?.EN ||
          (typeof data.title === 'string' ? data.title : 'Predmet dražbe');
        const imageUrl =
          Array.isArray(data.images) && data.images.length > 0
            ? data.images[0]
            : undefined;
        const currentPrice = Number(data.current_price ?? data.currentBid ?? 0);

        const userIdsToNotify = new Set<string>();
        let privateData: any = {};
        try {
          const privSnap = await adminDb.collection('auctions_private').doc(auctionId).get();
          if (isDocSnapshotExists(privSnap)) {
            privateData = getDocSnapshotData(privSnap) || {};
          }
        } catch (privErr) {}

        const bidderIds: string[] = privateData.bidder_ids || [];
        for (const uId of bidderIds) {
          if (uId && uId !== data.seller_id && uId !== data.sellerId) {
            userIdsToNotify.add(uId);
          }
        }

        const topBids = privateData.top_bids || data.top_bids || [];
        for (const item of topBids) {
          const uId = item.user_id || item.userId;
          if (uId && uId !== data.seller_id && uId !== data.sellerId) {
            userIdsToNotify.add(uId);
          }
        }

        let sentCount = 0;
        for (const userId of userIdsToNotify) {
          try {
            // Benachrichtigung im System erstellen
            await createNotification({
              userId,
              type: 'ending_soon',
              auctionId,
              auctionTitle: title,
              imageUrl,
              price: currentPrice
            });

            // E-Mail nur senden, wenn der Benutzer NICHT online ist
            const online = await isUserOnline(userId);
            if (!online) {
              const userSnap = await adminDb.collection('users').doc(userId).get();
              if (isDocSnapshotExists(userSnap)) {
                const udata = getDocSnapshotData(userSnap) || {};
                if (udata.email) {
                  const minutesLeft = Math.max(1, Math.round(diffMs / 60000));
                  await sendEndingSoonNotification({
                    toEmail: udata.email,
                    recipientName: udata.first_name || udata.name || 'Uporabnik',
                    auctionId,
                    auctionTitle: title,
                    auctionImageUrl: imageUrl,
                    currentPrice,
                    endTimeFormatted: `${minutesLeft} min`,
                  });
                  sentCount++;
                }
              }
            }
          } catch (userErr: any) {}
        }

        try {
          await adminDb.collection('auctions').doc(auctionId).update({
            reminder_30m_sent: true,
            reminder_30m_sent_at: nowIso,
          });
        } catch (updErr: any) {}

        result.actions.reminders30mSent += sentCount;
        details.push(`30m reminder sent for auction ${auctionId} to ${sentCount} users`);
      }
    }

    // -------------------------------------------------------------
    // 2. AUCTION CONCLUSION & WINNER NOTIFICATION (Bounded Query)
    // -------------------------------------------------------------
    let endedAuctionsSnap;
    try {
      endedAuctionsSnap = await adminDb.collection('auctions')
        .where('status', '==', 'active')
        .where('end_time', '<=', nowIso)
        .limit(100)
        .get();
    } catch (e: any) {
      console.warn('[CRON] Failed to fetch ended auctions:', e.message);
      endedAuctionsSnap = { empty: true, docs: [] } as any;
    }

    for (const auctionDoc of endedAuctionsSnap.docs) {
      const auctionId = auctionDoc.id;
      const res = await finalizeAuction(auctionId);
      if (res.finalized) {
        if (res.post_auction_status === 'awaiting_payment_1st') {
          result.actions.auctionsEnded++;
          result.actions.winnersNotified++;
          details.push(`Auction ${auctionId} finalized; awaiting_payment_1st`);
        } else if (res.post_auction_status === 'unsold') {
          result.actions.unsoldUpdated++;
          details.push(`Auction ${auctionId} finalized; marked as unsold`);
        }
      }
    }

    // -------------------------------------------------------------
    // 3. PAYMENT REMINDER: 2 HOURS BEFORE 48h DEADLINE (Bounded Query)
    // -------------------------------------------------------------
    let awaitingPaymentSnap;
    const plus2HoursIso = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    try {
      awaitingPaymentSnap = await adminDb.collection('auctions')
        .where('post_auction_status', '==', 'awaiting_payment_1st')
        .where('payment_deadline', '<=', plus2HoursIso)
        .limit(100)
        .get();
    } catch (e: any) {
      console.warn('[CRON] Failed to fetch awaiting payment auctions:', e.message);
      awaitingPaymentSnap = { empty: true, docs: [] } as any;
    }

    for (const auctionDoc of awaitingPaymentSnap.docs) {
      const data = auctionDoc.data();
      if (data.payment_status === 'paid' || data.payment_reminder_sent) continue;

      const deadlineStr = data.payment_deadline;
      if (!deadlineStr) continue;

      const deadline = new Date(deadlineStr).getTime();
      const diffMs = deadline - now.getTime();

      if (diffMs > 0 && diffMs <= 2 * 60 * 60 * 1000) {
        const auctionId = auctionDoc.id;
        const winnerId = data.winner_id || data.winnerId;
        const title =
          data.title?.SLO ||
          data.title?.EN ||
          (typeof data.title === 'string' ? data.title : 'Predmet dražbe');
        const imageUrl =
          Array.isArray(data.images) && data.images.length > 0
            ? data.images[0]
            : undefined;
        const amount = Number(data.current_price ?? data.currentBid ?? 0);

        if (winnerId) {
          try {
            const winnerSnap = await adminDb.collection('users').doc(winnerId).get();
            if (isDocSnapshotExists(winnerSnap)) {
              const winnerData = getDocSnapshotData(winnerSnap) || {};
              if (winnerData.email) {
                const hoursLeft = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)));
                await sendPaymentReminderNotification({
                  toEmail: winnerData.email,
                  recipientName: winnerData.first_name || winnerData.name || 'Kupec',
                  auctionId,
                  auctionTitle: title,
                  auctionImageUrl: imageUrl,
                  amount,
                  paymentDeadlineFormatted: `manj kot ${hoursLeft} ${hoursLeft === 1 ? 'ura' : 'uri'}`,
                });
                result.actions.paymentRemindersSent++;
                details.push(`Payment reminder (2h) sent to ${winnerData.email} for auction ${auctionId}`);
              }
            }
          } catch (payErr: any) {}
        }

        await adminDb.collection('auctions').doc(auctionId).update({
          payment_reminder_sent: true,
          payment_reminder_sent_at: nowIso,
        });
      }
    }

    // -------------------------------------------------------------
    // 3.5. EXPIRED BANK TRANSFER DEADLINE (Bounded Query)
    // -------------------------------------------------------------
    let expiredBankTransfersSnap;
    try {
      expiredBankTransfersSnap = await adminDb.collection('auctions')
        .where('bank_transfer_pending', '==', true)
        .limit(100)
        .get();
    } catch (e: any) {
      console.error('[CRON] Failed to fetch expired bank transfer auctions:', e.message);
      expiredBankTransfersSnap = { empty: true, docs: [] } as any;
    }

    const getStripeInstance = (): Stripe => {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new Error('STRIPE_SECRET_KEY environment variable is required');
      }
      return new Stripe(key);
    };

    for (const auctionDoc of expiredBankTransfersSnap.docs) {
      const auctionData = auctionDoc.data() || {};
      const deadline = auctionData.bank_transfer_deadline_at ? new Date(auctionData.bank_transfer_deadline_at).getTime() : 0;
      if (deadline > now.getTime()) continue;

      const auctionId = auctionDoc.id;
      console.log(`[CRON] Processing expired bank transfer for auction ${auctionId}`);

      // Deutscher Kommentar: Nutze die geteilte Logik zur Stornierung
      try {
        await cancelAuctionBankTransfer(auctionId, auctionData, 'failed');
        console.log(`[CRON] Applied shared bank transfer cancel logic for auction ${auctionId}`);
      } catch (canErr: any) {
        console.error(`[CRON] Error applying bank transfer cancel: ${canErr.message}`);
      }
    }

    // -------------------------------------------------------------
    // 4. EXPIRED PAYMENT DEADLINE (48h REACHED) -> UNPAID STRIKE (Bounded Query)
    // -------------------------------------------------------------
    let expiredPaymentSnap;
    try {
      expiredPaymentSnap = await adminDb.collection('auctions')
        .where('post_auction_status', '==', 'awaiting_payment_1st')
        .limit(100)
        .get();
    } catch (e: any) {
      console.error('[CRON] Failed to fetch expired payment auctions:', e.message);
      expiredPaymentSnap = { empty: true, docs: [] } as any;
    }

    for (const auctionDoc of expiredPaymentSnap.docs) {
      const data = auctionDoc.data();
      if (data.payment_status === 'paid') continue;
      
      const deadline = data.payment_deadline ? new Date(data.payment_deadline).getTime() : 0;
      if (deadline > now.getTime()) continue;

      if (data.bank_transfer_pending === true) {
        const btDeadline = data.bank_transfer_deadline_at ? new Date(data.bank_transfer_deadline_at).getTime() : 0;
        if (btDeadline > now.getTime()) {
          console.log(`[CRON] Skipping expired payment deadline for auction ${auctionDoc.id} because bank transfer is pending and deadline ${data.bank_transfer_deadline_at} is in the future.`);
          continue;
        }
      }

      if (deadline <= now.getTime()) {
        const auctionId = auctionDoc.id;
        const winnerId = data.winner_id || data.winnerId;

        if (winnerId) {
          try {
            const userRef = adminDb.collection('users').doc(winnerId);
            const auctionRef = adminDb.collection('auctions').doc(auctionId);

            let strikesReachedThree = false;
            await adminDb.runTransaction(async (transaction) => {
              const auctionSnap = await transaction.get(auctionRef);
              if (!auctionSnap.exists) return;
              const auctionData = auctionSnap.data() || {};
              if (auctionData.unpaid_strike_applied === true) {
                return;
              }

              const userSnap = await transaction.get(userRef);
              const userData = userSnap.exists ? (userSnap.data() || {}) : {};
              const currentStrikes = Number(userData.unpaidStrikes ?? userData.unpaid_penalties ?? userData.unpaidPenalties ?? 0);
              const newStrikes = currentStrikes + 1;

              const userUpdates: any = {
                unpaidStrikes: FieldValue.increment(1),
                unpaid_penalties: FieldValue.increment(1)
              };
              if (newStrikes >= 3) {
                userUpdates.isBlocked = true;
                strikesReachedThree = true;
              }

              transaction.update(userRef, userUpdates);
              transaction.update(auctionRef, { unpaid_strike_applied: true });
            });

            if (strikesReachedThree) {
              try {
                await markIdentityBlocked(winnerId);
              } catch (blockErr) {
                console.error("Fehler beim Blockieren der Identität im Cron-Prozessor:", blockErr);
              }
            }

            await syncPublicProfile(winnerId);
          } catch (strikeErr: any) {}
        }

        // Deutscher Kommentar: Kein automatisches Angebot an den 2. Bieter - der Verkaeufer entscheidet
        const sellerId = data.seller_id || data.sellerId;
        await adminDb.collection('auctions').doc(auctionId).update({
          post_auction_status: 'failed_1st',
          seller_decision_requested_at: now.toISOString(),
        });
        details.push(`Auction ${auctionId} 1st payment expired; awaiting seller decision`);

        if (sellerId && data.seller_decision_notified !== true) {
          try {
            const brief = briefOf(data);
            const price = Number(data.current_price || data.currentBid || 0);
            await createNotification({
              userId: sellerId,
              type: 'seller_decision',
              auctionId,
              auctionTitle: brief.title,
              imageUrl: brief.image,
              price,
              message: 'Zmagovalec ni plačal. Odločite se: ponudite dražbo 2. ponudniku ali jo objavite ponovno.',
              target: 'unsold'
            });
            const c = await contactOf(sellerId);
            if (c.email) {
              await sendSellerDecisionNeededNotification({
                toEmail: c.email, recipientName: c.name, auctionId,
                auctionTitle: brief.title, auctionImageUrl: brief.image, price
              });
            }
            await adminDb.collection('auctions').doc(auctionId).update({ seller_decision_notified: true });
          } catch (nErr: any) {
            console.error('[CRON] Seller decision notification failed:', nErr?.message);
          }
        }

        result.actions.expired1stProcessed++;
      }
    }

    // -------------------------------------------------------------
    // 4b. SELLER OFFER TO 2ND BIDDER EXPIRED WITHOUT RESPONSE -> UNSOLD (no strike)
    // 4c. 2ND BIDDER ACCEPTED BUT DID NOT PAY IN 48h -> strike -> UNSOLD
    // -------------------------------------------------------------
    for (const status of ['offered_2nd', 'awaiting_payment_2nd']) {
      let snap2: any;
      try {
        snap2 = await adminDb.collection('auctions').where('post_auction_status', '==', status).limit(100).get();
      } catch (e: any) {
        console.error(`[CRON] Failed to fetch ${status} auctions:`, e.message);
        continue;
      }
      for (const d of snap2.docs) {
        const data = d.data();
        if (data.payment_status === 'paid') continue;
        const dl = status === 'offered_2nd' ? data.second_chance_deadline : data.payment_deadline;
        const dlMs = dl ? new Date(dl).getTime() : 0;
        if (!dlMs || dlMs > now.getTime()) continue;
        if (status === 'awaiting_payment_2nd' && data.bank_transfer_pending === true) {
          const bt = data.bank_transfer_deadline_at ? new Date(data.bank_transfer_deadline_at).getTime() : 0;
          if (bt > now.getTime()) continue;
        }

        const auctionId = d.id;
        const auctionRef = adminDb.collection('auctions').doc(auctionId);
        const sellerId = data.seller_id || data.sellerId;
        const secondId = data.second_winner_id || data.second_highest_bidder_id;
        const brief = briefOf(data);
        const price = Number(data.current_price || data.currentBid || 0);

        try {
          let struck = false;
          let blocked = false;
          if (status === 'awaiting_payment_2nd' && SECOND_WINNER_UNPAID_GETS_WARNING && secondId) {
            const userRef = adminDb.collection('users').doc(secondId);
            await adminDb.runTransaction(async (tx) => {
              const aSnap = await tx.get(auctionRef);
              const aData: any = aSnap.exists ? (aSnap.data() || {}) : {};
              if (aData.second_unpaid_strike_applied === true) return;
              const uSnap = await tx.get(userRef);
              const uData: any = uSnap.exists ? (uSnap.data() || {}) : {};
              const cur = Number(uData.unpaidStrikes ?? uData.unpaid_penalties ?? uData.unpaidPenalties ?? 0);
              const upd: any = { unpaidStrikes: FieldValue.increment(1), unpaid_penalties: FieldValue.increment(1) };
              if (cur + 1 >= 3) { upd.isBlocked = true; blocked = true; }
              tx.update(userRef, upd);
              tx.update(auctionRef, { second_unpaid_strike_applied: true });
              struck = true;
            });
            if (blocked) { try { await markIdentityBlocked(secondId); } catch {} }
            await syncPublicProfile(secondId);
          }

          await auctionRef.update({
            post_auction_status: 'failed_2nd',
            seller_decision_requested_at: now.toISOString(),
          });

          if (sellerId) {
            await createNotification({
              userId: sellerId, type: 'second_chance_failed', auctionId,
              auctionTitle: brief.title, imageUrl: brief.image, price,
              message: status === 'offered_2nd'
                ? 'Drugi ponudnik se ni odzval na vašo ponudbo. Dražba je med neprodanimi.'
                : 'Drugi ponudnik ni plačal v roku. Dražba je med neprodanimi – objavite jo lahko ponovno.',
              target: 'unsold'
            });
            const c = await contactOf(sellerId);
            if (c.email) {
              await sendSecondChanceFailedSellerNotification({
                toEmail: c.email, recipientName: c.name, auctionId,
                auctionTitle: brief.title, auctionImageUrl: brief.image, price
              });
            }
          }
          if (secondId) {
            await createNotification({
              userId: secondId, type: 'second_chance_failed', auctionId,
              auctionTitle: brief.title, imageUrl: brief.image, price,
              message: struck ? 'Rok za plačilo je potekel. Prejeli ste opomin.' : 'Rok za odziv na ponudbo je potekel.',
              target: 'winnings'
            });
          }
          details.push(`Auction ${auctionId} ${status} expired -> failed_2nd${struck ? ' (strike)' : ''}`);
        } catch (e: any) {
          console.error(`[CRON] ${status} expiry failed for ${auctionId}:`, e?.message);
        }
      }
    }

    // -------------------------------------------------------------
    // 5. CLEANUP OLD COMPLETED AUCTIONS (> 30 DAYS) (Bounded Query)
    // -------------------------------------------------------------
    const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let completedAuctionsSnap;
    try {
      completedAuctionsSnap = await adminDb.collection('auctions')
        .where('status', '==', 'completed')
        .where('end_time', '<=', thirtyDaysAgoIso)
        .limit(100)
        .get();
    } catch (e: any) {
      completedAuctionsSnap = { empty: true, docs: [] } as any;
    }

    for (const auctionDoc of completedAuctionsSnap.docs) {
      const data = auctionDoc.data();
      if (
        data.post_auction_status === 'unsold' ||
        data.post_auction_status === 'failed_1st' ||
        data.post_auction_status === 'failed_2nd' ||
        data.post_auction_status === 'rejected_2nd'
      ) {
        const auctionId = auctionDoc.id;
        try {
          await adminDb.collection('auctions').doc(auctionId).delete();
          details.push(`Auction ${auctionId} permanently deleted from DB (expired > 30 days)`);
        } catch (delErr: any) {}
      }
    }

    // -------------------------------------------------------------
    // 6. REVIEW REMINDERS (Bounded Query)
    // -------------------------------------------------------------
    try {
      const receivedAuctionsSnap = await adminDb.collection('auctions')
        .where('buyer_received', '==', true)
        .limit(100)
        .get();

      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      for (const aDoc of receivedAuctionsSnap.docs) {
        const aData = aDoc.data();
        if (aData.review_submitted || aData.review_reminder_sent) continue;

        const receivedAtStr = aData.received_at || aData.receipt_confirmed_at || aData.paid_at;
        if (!receivedAtStr) continue;

        const receivedTime = new Date(receivedAtStr).getTime();
        if (now.getTime() - receivedTime >= twentyFourHoursMs) {
          const buyerId = aData.winner_id || aData.winnerId;
          if (buyerId) {
            try {
              const buyerSnap = await adminDb.collection('users').doc(buyerId).get();
              if (isDocSnapshotExists(buyerSnap)) {
                const bData = getDocSnapshotData(buyerSnap) || {};
                if (bData.email) {
                  const aTitle = aData.title?.SLO || aData.title?.EN || (typeof aData.title === 'string' ? aData.title : 'Predmet dražbe');
                  const aImage = Array.isArray(aData.images) && aData.images.length > 0 ? aData.images[0] : undefined;

                  await sendReviewReminderNotification({
                    toEmail: bData.email,
                    recipientName: bData.first_name || bData.name || 'Spoštovani kupec',
                    auctionId: aDoc.id,
                    auctionTitle: aTitle,
                    auctionImageUrl: aImage,
                  });

                  await aDoc.ref.update({
                    review_reminder_sent: true,
                    review_reminder_sent_at: nowIso,
                  });

                  result.actions.reviewRemindersSent++;
                  details.push(`Review reminder sent for auction ${aDoc.id} to buyer ${bData.email}`);
                }
              }
            } catch (remErr: any) {}
          }
        }
      }
    } catch (revCronErr: any) {}

    // -------------------------------------------------------------
    // 7. SUBSCRIPTIONS: EXPIRED CANCELLED SUBSCRIPTIONS (Bounded Query)
    // -------------------------------------------------------------
    try {
      const cancelledUsersSnap = await adminDb.collection('users')
        .where('subscription_canceled', '==', true)
        .limit(100)
        .get();

      for (const uDoc of cancelledUsersSnap.docs) {
        const uData = uDoc.data();
        if (uData.subscription_valid_until) {
          const validUntil = new Date(uData.subscription_valid_until).getTime();
          if (now.getTime() >= validUntil) {
            await uDoc.ref.set({
              subscription: 'FREE',
              subscription_tier: 'FREE',
              subscription_active: false,
              subscription_canceled: false,
            }, { merge: true });
            details.push(`User ${uDoc.id} subscription expired after cancellation, reverted to FREE`);
          }
        }
      }
    } catch (subErr: any) {}

    return result;
  } catch (error: any) {
    console.error('[CRON ERROR] processAuctionCrons failed:', error);
    result.success = false;
    details.push(`Fatal error: ${error.message}`);
    return result;
  }
}
