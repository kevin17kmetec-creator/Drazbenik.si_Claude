import { adminDb, isDocSnapshotExists, getDocSnapshotData } from '../lib/firebase-admin';
import {
  sendEndingSoonNotification,
  sendAuctionWonNotification,
  sendPaymentReminderNotification,
  sendReviewReminderNotification,
} from './emailService';

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
  const details: string[] = [];
  const result: CronRunResult = {
    success: true,
    timestamp: now.toISOString(),
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
    // 1. NOTIFICATIONS: 30 MINUTES BEFORE ENDING
    // -------------------------------------------------------------
    let activeAuctionsSnap;
    try {
      activeAuctionsSnap = await adminDb.collection('auctions').where('status', '==', 'active').get();
    } catch (e: any) {
      console.warn('[CRON] Failed to fetch active auctions:', e.message);
      activeAuctionsSnap = { empty: true, docs: [] } as any;
    }

    for (const auctionDoc of activeAuctionsSnap.docs) {
      const data = auctionDoc.data();
      const endTimeStr = data.end_time || data.endTime;
      if (!endTimeStr) continue;

      const endTime = new Date(endTimeStr).getTime();
      const diffMs = endTime - now.getTime();

      // Check if auction ends within 30 minutes (and is still in the future)
      if (diffMs > 0 && diffMs <= 30 * 60 * 1000 && !data.reminder_30m_sent) {
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

        // Find interested users: bidders & watchers
        const userIdsToNotify = new Set<string>();

        // Add users who bid on this auction
        const history = data.bidding_history || data.biddingHistory || [];
        for (const item of history) {
          const uId = item.user_id || item.userId;
          if (uId && uId !== data.seller_id && uId !== data.sellerId) {
            userIdsToNotify.add(uId);
          }
        }

        const topBids = data.top_bids || [];
        for (const item of topBids) {
          const uId = item.user_id || item.userId;
          if (uId && uId !== data.seller_id && uId !== data.sellerId) {
            userIdsToNotify.add(uId);
          }
        }

        // Send notifications to interested users
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
          } catch (userErr: any) {
            console.error(`[CRON] Error sending 30m reminder to user ${userId}:`, userErr.message);
          }
        }

        // Mark as sent on the auction
        try {
          await adminDb.collection('auctions').doc(auctionId).update({
            reminder_30m_sent: true,
            reminder_30m_sent_at: now.toISOString(),
          });
        } catch (updErr: any) {
          console.error(`[CRON] Error updating auction ${auctionId} reminder:`, updErr.message);
        }

        result.actions.reminders30mSent += sentCount;
        details.push(`30m reminder sent for auction ${auctionId} to ${sentCount} users`);
      }
    }

    // -------------------------------------------------------------
    // 2. AUCTION CONCLUSION & WINNER NOTIFICATION
    // -------------------------------------------------------------
    for (const auctionDoc of activeAuctionsSnap.docs) {
      const data = auctionDoc.data();
      const endTimeStr = data.end_time || data.endTime;
      if (!endTimeStr) continue;

      const endTime = new Date(endTimeStr).getTime();

      // Check if auction has ended
      if (endTime <= now.getTime()) {
        const auctionId = auctionDoc.id;
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

        if (hasBids) {
          const winnerId = data.winner_id || data.winnerId;
          const paymentDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

          await adminDb.collection('auctions').doc(auctionId).update({
            status: 'completed',
            post_auction_status: 'awaiting_payment_1st',
            payment_deadline: paymentDeadline,
            winner_notified: true,
            ended_at: now.toISOString(),
          });

          result.actions.auctionsEnded++;

          // Send winner congratulatory email with checkout link
          if (winnerId) {
            try {
              const winnerSnap = await adminDb.collection('users').doc(winnerId).get();
              if (isDocSnapshotExists(winnerSnap)) {
                const winnerData = getDocSnapshotData(winnerSnap) || {};
                if (winnerData.email) {
                  await sendAuctionWonNotification({
                    toEmail: winnerData.email,
                    recipientName: winnerData.first_name || winnerData.name || 'Zmagovalec',
                    auctionId,
                    auctionTitle: title,
                    auctionImageUrl: imageUrl,
                    winningPrice: finalPrice,
                    paymentDeadlineFormatted: '48 ur (do ' + new Date(paymentDeadline).toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit' }) + ' ob ' + new Date(paymentDeadline).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' }) + ')',
                  });
                  result.actions.winnersNotified++;
                  details.push(`Winner notification sent to ${winnerData.email} for auction ${auctionId}`);
                }
              }
            } catch (winErr: any) {
              console.error(`[CRON] Error notifying winner ${winnerId}:`, winErr.message);
            }
          }
        } else {
          // Unsold auction
          await adminDb.collection('auctions').doc(auctionId).update({
            status: 'completed',
            post_auction_status: 'unsold',
            winner_notified: true,
            ended_at: now.toISOString(),
          });
          result.actions.unsoldUpdated++;
          details.push(`Auction ${auctionId} marked as unsold`);
        }
      }
    }

    // -------------------------------------------------------------
    // 3. PAYMENT REMINDER: 2 HOURS BEFORE 48h DEADLINE
    // -------------------------------------------------------------
    let awaitingPaymentSnap;
    try {
      awaitingPaymentSnap = await adminDb.collection('auctions').where('post_auction_status', '==', 'awaiting_payment_1st').get();
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

      // Check if deadline is within 2 hours (and not already past)
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
          } catch (payErr: any) {
            console.error(`[CRON] Error sending payment reminder for auction ${auctionId}:`, payErr.message);
          }
        }

        await adminDb.collection('auctions').doc(auctionId).update({
          payment_reminder_sent: true,
          payment_reminder_sent_at: now.toISOString(),
        });
      }
    }

    // -------------------------------------------------------------
    // 4. EXPIRED PAYMENT DEADLINE (48h REACHED) -> UNPAID STRIKE
    // -------------------------------------------------------------
    for (const auctionDoc of awaitingPaymentSnap.docs) {
      const data = auctionDoc.data();
      if (data.payment_status === 'paid') continue;

      const deadlineStr = data.payment_deadline;
      if (!deadlineStr) continue;

      const deadline = new Date(deadlineStr).getTime();

      if (deadline <= now.getTime()) {
        const auctionId = auctionDoc.id;
        const winnerId = data.winner_id || data.winnerId;

        // Apply unpaid strike to default winner
        if (winnerId) {
          try {
            const userRef = adminDb.collection('users').doc(winnerId);
            const userDoc = await userRef.get();
            if (isDocSnapshotExists(userDoc)) {
              const udata = getDocSnapshotData(userDoc) || {};
              const newStrikes = (udata.unpaidStrikes || 0) + 1;
              const updates: any = { unpaidStrikes: newStrikes };
              if (newStrikes >= 3) {
                updates.isBlocked = true;
              }
              await userRef.update(updates);
            }
          } catch (strikeErr: any) {
            console.error(`[CRON] Error adding strike to user ${winnerId}:`, strikeErr.message);
          }
        }

        // Check if there is a 2nd highest bidder to offer 2nd chance
        const topBids = data.top_bids || [];
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
    // 5. CLEANUP OLD EXPIRED AUCTIONS (> 30 DAYS AFTER END)
    // -------------------------------------------------------------
    let completedAuctionsSnap;
    try {
      completedAuctionsSnap = await adminDb.collection('auctions').where('status', '==', 'completed').get();
    } catch (e: any) {
      console.warn('[CRON] Failed to fetch completed auctions:', e.message);
      completedAuctionsSnap = { empty: true, docs: [] } as any;
    }
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    for (const auctionDoc of completedAuctionsSnap.docs) {
      const data = auctionDoc.data();
      const endTimeStr = data.end_time || data.endTime;
      if (!endTimeStr) continue;

      const endTime = new Date(endTimeStr).getTime();
      if (endTime < thirtyDaysAgo) {
        // Only completely delete if it wasn't successfully paid/sold
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
          } catch (delErr: any) {
            console.error(`[CRON] Error deleting old auction ${auctionId}:`, delErr.message);
          }
        }
      }
    }

    // -------------------------------------------------------------
    // 6. REVIEW REMINDERS: 24 HOURS AFTER ITEM RECEIPT CONFIRMATION
    // -------------------------------------------------------------
    try {
      const receivedAuctionsSnap = await adminDb.collection('auctions')
        .where('buyer_received', '==', true)
        .get();

      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      for (const aDoc of receivedAuctionsSnap.docs) {
        const aData = aDoc.data();
        // If already reviewed or reminder already sent, skip
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
                    review_reminder_sent_at: now.toISOString(),
                  });

                  result.actions.reviewRemindersSent++;
                  details.push(`Review reminder sent for auction ${aDoc.id} to buyer ${bData.email}`);
                }
              }
            } catch (remErr: any) {
              console.error(`[CRON] Error sending review reminder for auction ${aDoc.id}:`, remErr.message);
            }
          }
        }
      }
    } catch (revCronErr: any) {
      console.warn('[CRON] Error processing review reminders:', revCronErr.message);
    }

    // -------------------------------------------------------------
    // 7. SUBSCRIPTIONS: EXPIRED CANCELLED SUBSCRIPTIONS REVERT TO FREE
    // -------------------------------------------------------------
    try {
      const cancelledUsersSnap = await adminDb.collection('users')
        .where('subscription_canceled', '==', true)
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
    } catch (subErr: any) {
      console.warn('[CRON] Error reverting expired subscriptions:', subErr.message);
    }

    return result;
  } catch (error: any) {
    console.error('[CRON ERROR] processAuctionCrons failed:', error);
    result.success = false;
    details.push(`Fatal error: ${error.message}`);
    return result;
  }
}
