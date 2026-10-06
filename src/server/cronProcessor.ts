import { adminDb, isDocSnapshotExists, getDocSnapshotData, FieldValue } from '../lib/firebase-admin';
import { syncPublicProfile } from './publicProfile';
import {
  sendEndingSoonNotification,
  sendAuctionWonNotification,
  sendPaymentReminderNotification,
  sendReviewReminderNotification,
} from './emailService';

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

  // Send emails AFTER transaction and only if state was actually changed by this call
  if (finalizedData && finalizedData.finalized) {
    if (finalizedData.winnerId) {
      try {
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
      } catch (winErr: any) {
        console.error(`[finalizeAuction] Error notifying winner ${finalizedData.winnerId}:`, winErr.message);
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
    // 4. EXPIRED PAYMENT DEADLINE (48h REACHED) -> UNPAID STRIKE (Bounded Query)
    // -------------------------------------------------------------
    let expiredPaymentSnap;
    try {
      expiredPaymentSnap = await adminDb.collection('auctions')
        .where('post_auction_status', '==', 'awaiting_payment_1st')
        .where('payment_deadline', '<=', nowIso)
        .limit(100)
        .get();
    } catch (e: any) {
      console.warn('[CRON] Failed to fetch expired payment auctions:', e.message);
      expiredPaymentSnap = { empty: true, docs: [] } as any;
    }

    for (const auctionDoc of expiredPaymentSnap.docs) {
      const data = auctionDoc.data();
      if (data.payment_status === 'paid') continue;

      const deadlineStr = data.payment_deadline;
      if (!deadlineStr) continue;

      const deadline = new Date(deadlineStr).getTime();

      if (deadline <= now.getTime()) {
        const auctionId = auctionDoc.id;
        const winnerId = data.winner_id || data.winnerId;

        if (winnerId) {
          try {
            const userRef = adminDb.collection('users').doc(winnerId);
            const auctionRef = adminDb.collection('auctions').doc(auctionId);

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
              }

              transaction.update(userRef, userUpdates);
              transaction.update(auctionRef, { unpaid_strike_applied: true });
            });

            await syncPublicProfile(winnerId);
          } catch (strikeErr: any) {}
        }

        let privTopBids = [];
        try {
          const privSnap = await adminDb.collection('auctions_private').doc(auctionId).get();
          if (isDocSnapshotExists(privSnap)) {
            const privData = getDocSnapshotData(privSnap) || {};
            privTopBids = privData.top_bids || [];
          }
        } catch (privErr) {}
        const topBids = privTopBids.length > 0 ? privTopBids : (data.top_bids || []);
        const secondBidder = topBids.length > 1 ? topBids[1] : null;

        if (secondBidder && secondBidder.user_id) {
          const secondChanceDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
          await adminDb.collection('auctions').doc(auctionId).update({
            post_auction_status: 'offered_2nd',
            second_chance_deadline: secondChanceDeadline,
            second_winner_id: secondBidder.user_id,
          });
          details.push(`Auction ${auctionId} 1st payment expired; offered 2nd chance to ${secondBidder.user_id}`);
        } else {
          await adminDb.collection('auctions').doc(auctionId).update({
            post_auction_status: 'failed_1st',
          });
          details.push(`Auction ${auctionId} 1st payment expired with no 2nd bidder; marked failed_1st`);
        }

        result.actions.expired1stProcessed++;
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
