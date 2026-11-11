import Stripe from 'stripe';
import { Resend } from './localizedResend';
import { adminDb } from '../lib/firebase-admin';

// Deutscher Kommentar: Eigener Stripe-Client, damit kein Zirkelimport mit app.ts noetig ist
let stripeClient: Stripe | null = null;
function getStripeClient(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

// Deutscher Kommentar: Storniert eine schwebende Bankueberweisung sicher, verhindert Doppelzahlung und setzt die letzte Chance
export async function cancelAuctionBankTransfer(
  auctionId: string,
  _auctionData: any,
  mode: 'failed' | 'switch_to_card' = 'failed'
): Promise<{ success: boolean; reason?: string }> {
  const auctionRef = adminDb.collection('auctions').doc(auctionId);

  // Deutscher Kommentar: Vorab pruefen, ob Auktion existiert und ob sie bereits bezahlt ist
  const snap = await auctionRef.get();
  if (!snap.exists) return { success: false, reason: 'not_found' };
  const data: any = snap.data() || {};
  if (data.payment_status === 'paid' || data.post_auction_status === 'paid') {
    return { success: false, reason: 'already_paid' };
  }
  if (data.bank_transfer_pending !== true) {
    return { success: false, reason: 'not_pending' };
  }

  const sessionId = data.bank_transfer_session_id;
  const buyerId = data.winner_id || data.winnerId || data.second_winner_id || data.secondWinnerId;

  // Deutscher Kommentar: Schritt 1 - Pruefen, ob die Bankueberweisung beim Zahlungsanbieter bereits bezahlt oder in Bearbeitung ist
  if (sessionId) {
    try {
      const stripe = getStripeClient();
      const sess = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
      let pi: Stripe.PaymentIntent | null = null;
      if (typeof sess.payment_intent === 'object' && sess.payment_intent !== null) {
        pi = sess.payment_intent as Stripe.PaymentIntent;
      } else if (typeof sess.payment_intent === 'string') {
        pi = await stripe.paymentIntents.retrieve(sess.payment_intent);
      }

      const isPaidOrProcessing =
        sess.payment_status === 'paid' ||
        pi?.status === 'succeeded' ||
        pi?.status === 'processing';

      if (isPaidOrProcessing) {
        console.warn(`[CancelBankTransfer] Cannot cancel session ${sessionId}: already paid or processing`);
        return { success: false, reason: 'already_paid_or_processing' };
      }

      // Deutscher Kommentar: Storniere nur PaymentIntents mit status requires_action oder requires_payment_method
      if (pi) {
        if (pi.status === 'requires_action' || pi.status === 'requires_payment_method') {
          try {
            await stripe.paymentIntents.cancel(pi.id);
            console.log(`[CancelBankTransfer] Cancelled PaymentIntent ${pi.id} for session ${sessionId}`);
          } catch (cancelErr: any) {
            console.warn(`[CancelBankTransfer] Cancel error for ${pi.id}, re-retrieving PaymentIntent: ${cancelErr.message}`);
            const reloadedPi = await stripe.paymentIntents.retrieve(pi.id);
            if (reloadedPi.status === 'succeeded' || reloadedPi.status === 'processing') {
              return { success: false, reason: 'already_paid_or_processing' };
            }
            if (reloadedPi.status === 'canceled') {
              // Deutscher Kommentar: Bereits storniert, fahre mit Transaktion fort
            } else {
              return { success: false, reason: 'cancel_failed' };
            }
          }
        } else if (pi.status === 'canceled') {
          // Deutscher Kommentar: Bereits storniert, fahre mit Transaktion fort
        } else {
          return { success: false, reason: 'cancel_failed' };
        }
      } else if (sess.status === 'open') {
        // Deutscher Kommentar: Nur ablaufen lassen, wenn kein PaymentIntent existiert und Sitzung offen ist
        try {
          await stripe.checkout.sessions.expire(sessionId);
          console.log(`[CancelBankTransfer] Expired checkout session ${sessionId}`);
        } catch (expireErr: any) {
          console.warn(`[CancelBankTransfer] Session expire failed: ${expireErr.message}`);
          return { success: false, reason: 'cancel_failed' };
        }
      }
    } catch (err: any) {
      console.warn(`[CancelBankTransfer] Warn: communication failure with payment provider for ${sessionId}: ${err.message}`);
      return { success: false, reason: 'stripe_error' };
    }
  }

  // Deutscher Kommentar: Schritt 2 - Transaktion in Firestore, um den Zustand atomar zurueckzusetzen
  let claimed: any = null;
  let newDeadline = '';
  try {
    await adminDb.runTransaction(async (tx) => {
      const txSnap = await tx.get(auctionRef);
      if (!txSnap.exists) return;
      const txData: any = txSnap.data() || {};
      if (txData.payment_status === 'paid' || txData.post_auction_status === 'paid') return;
      if (txData.bank_transfer_pending !== true) return;

      const currentDeadlineMs = new Date(txData.payment_deadline || 0).getTime();
      const minDeadlineMs = Date.now() + 24 * 60 * 60 * 1000;
      newDeadline = new Date(Math.max(currentDeadlineMs || 0, minDeadlineMs)).toISOString();

      tx.set(auctionRef, {
        bank_transfer_pending: false,
        bank_transfer_session_id: null,
        bank_transfer_deadline_at: null,
        bank_transfer_final_chance: true,
        payment_deadline: newDeadline
      }, { merge: true });

      claimed = txData;
    });
  } catch (txErr: any) {
    console.error(`[CancelBankTransfer] Transaction failed for ${auctionId}: ${txErr.message}`);
    return { success: false, reason: 'transaction_failed' };
  }

  // Deutscher Kommentar: Ein anderer Aufrufer war schneller oder es war nichts mehr schwebend
  if (!claimed) return { success: false, reason: 'already_claimed_or_paid' };

  // Deutscher Kommentar: Schritt 3 - AML-Reservierung freigeben
  if (buyerId) {
    try {
      await adminDb.collection('aml_reservations').doc(`${buyerId}_${auctionId}`).set({
        status: 'released',
        released_at: new Date().toISOString(),
        release_reason: mode === 'switch_to_card' ? 'switch_to_card' : 'bank_transfer_cancelled'
      }, { merge: true });
    } catch (rErr: any) {
      console.error(`[CancelBankTransfer] Error releasing aml reservation: ${rErr.message}`);
    }
  }

  // Deutscher Kommentar: Schritt 4 - E-Mail nur bei fehlgeschlagener Ueberweisung versenden
  if (mode === 'failed' && buyerId && process.env.RESEND_API_KEY) {
    try {
      const buyerSnap = await adminDb.collection('users').doc(buyerId).get();
      const buyerData: any = buyerSnap.exists ? buyerSnap.data() || {} : {};
      if (buyerData.email) {
        const resendClient = new Resend(process.env.RESEND_API_KEY);
        const auctionTitle = claimed.title?.SLO || (typeof claimed.title === 'string' ? claimed.title : 'Dražba');
        await resendClient.emails.send({
          from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
          to: buyerData.email,
          subject: 'Nakazilo ni bilo izvedeno - drazbe.si',
          html: `
            <div style="font-family: sans-serif; line-height: 1.5; color: #1E293B;">
              <h2 style="color: #EF4444;">Nakazilo ni bilo izvedeno</h2>
              <p>Spoštovani,</p>
              <p>obveščamo vas, da nakazilo za dražbo <strong>${auctionTitle}</strong> ni bilo izvedeno.</p>
              <p>Za plačilo imate še eno priložnost: plačajte s kartico do <strong>${new Date(newDeadline).toLocaleString('sl-SI')}</strong>. Če plačila ne opravite, veljajo običajna pravila za zamudnike.</p>
              <p>Lep pozdrav,<br/>Ekipa drazbe.si</p>
            </div>
          `
        });
      }
    } catch (mailErr: any) {
      console.error(`[CancelBankTransfer] Error sending e-mail: ${mailErr.message}`);
    }
  }

  return { success: true };
}