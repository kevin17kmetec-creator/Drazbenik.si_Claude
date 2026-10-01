import express from "express";
import crypto from "crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import {
  reserveWalletFunds,
  commitReservedFunds,
  rollbackReservedFunds,
  addHeldFunds,
  releaseHeldFunds,
  ensureWalletMigrated,
  creditTestFunds,
  creditWalletDepositFromStripe,
  getUserWallet
} from './walletService';
import { parseAmountToCents, calculateCheckoutTotals, calculateMarginalPlatformFee } from './moneyUtils';
import { authenticateFirebaseUser } from './authHelper';
import {
  formatStripeError,
  ensurePlatformTestBalance,
  diagnoseStripeTransferPrerequisites
} from './stripeHelper';
import cors from "cors";
import Stripe from "stripe";
import { Resend } from 'resend';
import { render } from '@react-email/render';
import React from 'react';
import { AuctionEmailTemplate } from '../emails/AuctionEmailTemplate';
import { AuthEmailTemplate } from '../emails/AuthEmailTemplate';
import { GoogleGenAI } from "@google/genai";
import { generateInvoicePDF, generateCertificatePDF, generateSubscriptionInvoicePDF } from '../lib/pdfGenerator';
import {
  sendEndingSoonNotification,
  sendAuctionWonNotification,
  sendPaymentReminderNotification,
  sendOutbidNotification
} from './emailService';
import { processAuctionCrons } from './cronProcessor';
import {
  adminDb,
  adminAuth,
  getAuth,
  uploadBufferToStorage,
  isDocSnapshotExists,
  getDocSnapshotData,
  FieldValue
} from '../lib/firebase-admin';

async function safeGetDocs(queryRef: any) {
  try {
    const snap = await queryRef.get();
    return {
      empty: snap.empty,
      size: snap.size,
      docs: snap.docs.map((d: any) => ({
        id: d.id,
        ref: d.ref,
        data: () => getDocSnapshotData(d) || {},
        exists: () => isDocSnapshotExists(d)
      }))
    };
  } catch (error: any) {
    console.warn("[safeGetDocs] Failed to fetch docs:", error.message);
    return { empty: true, size: 0, docs: [] as any[] };
  }
}

async function safeGetDoc(docRef: any) {
  try {
    const snap = await docRef.get();
    const exists = isDocSnapshotExists(snap);
    return {
      exists: () => exists,
      data: () => (exists ? getDocSnapshotData(snap) : null),
      id: snap.id,
      ref: docRef
    };
  } catch (error: any) {
    console.warn("[safeGetDoc] Failed to fetch doc:", error.message);
    return {
      exists: () => false,
      data: () => null,
      id: docRef.id || '',
      ref: docRef
    };
  }
}

async function generateInvoiceNumber(type: 'SALES' | 'COMMISSION' | 'SUBSCRIPTION'): Promise<string> {
  const year = new Date().getFullYear();
  const docId = `${type}_${year}`;
  const counterRef = adminDb.collection('invoice_counters').doc(docId);

  return await adminDb.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let currentNumber = 1;

    if (isDocSnapshotExists(counterDoc)) {
      const data = getDocSnapshotData(counterDoc);
      currentNumber = (data?.current_number || 0) + 1;
      transaction.update(counterRef, { current_number: currentNumber });
    } else {
      transaction.set(counterRef, {
        type,
        year,
        current_number: 1
      });
    }

    const prefix = type === 'SALES' ? 'RAC' : type === 'SUBSCRIPTION' ? 'NAR' : 'PROV';
    const formattedNum = String(currentNumber).padStart(6, '0');
    return `${prefix}-${year}-${formattedNum}`;
  });
}

async function createAndSendSubscriptionInvoice(params: {
  userId: string;
  packageId: string;
  amountTotal: number;
  sourceId: string;
  paymentMethod?: string;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  const { userId, packageId, amountTotal, sourceId, paymentMethod = 'Spletno plačilo / Kartica (Stripe)', periodStart, periodEnd } = params;
  try {
    // 1. Preveri, ali račun za ta vir (sourceId) že obstaja, da preprečimo podvajanje
    const existing = await safeGetDocs(
      adminDb.collection('documents')
        .where('user_id', '==', userId)
        .where('source_id', '==', sourceId)
        .limit(1)
    );
    if (!existing.empty) {
      console.log(`[subscription-invoice] Račun za naročnino (sourceId: ${sourceId}) že obstaja. Preskakujem.`);
      return;
    }

    // 2. Podatki o uporabniku
    const userDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    const userData = userDoc.data() || {};

    // 3. Generiranje zaporedne številke računa
    const invoiceNo = await generateInvoiceNumber('SUBSCRIPTION');

    // 4. Izračun in generiranje PDF računa
    const pdfBuffer = await generateSubscriptionInvoicePDF({
      invoiceNo,
      user: userData,
      planId: packageId,
      amount: amountTotal,
      paymentMethod,
      periodStart: periodStart || new Date(),
      periodEnd: periodEnd || undefined
    });

    const fileName = `racun_${invoiceNo}.pdf`;
    let publicUrl: string | null = null;
    try {
      publicUrl = await uploadBufferToStorage(pdfBuffer, `${userId}/${fileName}`);
    } catch (uploadErr: any) {
      console.warn('[subscription-invoice] Napaka pri nalaganju v Storage:', uploadErr.message);
    }

    // 5. Shranjevanje v Firestore zbirko 'documents'
    await adminDb.collection('documents').add({
      user_id: userId,
      type: 'subscription_invoice',
      invoice_no: invoiceNo,
      package_id: packageId,
      amount: amountTotal,
      source_id: sourceId,
      payment_method: paymentMethod,
      file_url: publicUrl,
      created_at: new Date().toISOString()
    });
    console.log(`[subscription-invoice] Uspešno shranjen dokument računa ${invoiceNo} za uporabnika ${userId}`);

    // 6. Pošiljanje e-pošte z računom preko Resend
    const targetEmail = userData.email;
    if (targetEmail && process.env.RESEND_API_KEY) {
      try {
        const isPro = String(packageId).toUpperCase().includes('PRO');
        const planName = isPro ? 'NAPREDNI' : 'OSNOVNI';
        const formattedAmount = Number(amountTotal).toFixed(2);
        const recipientName = userData.company_name || userData.first_name || userData.username || 'uporabnik';

        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0A1128; background: #ffffff;">
            <div style="border-bottom: 2px solid #E2E8F0; padding-bottom: 16px; margin-bottom: 24px;">
              <h1 style="color: #0A1128; font-size: 24px; font-weight: 900; margin: 0; text-transform: uppercase;">dražbe.si</h1>
              <p style="color: #94A3B8; font-size: 12px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Račun za naročnino</p>
            </div>
            <p style="font-size: 16px; line-height: 1.5; color: #334155;">Pozdravljeni, <strong>${recipientName}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.5; color: #334155;">
              Zahvaljujemo se vam za zaupanje! Vaša naročnina na paket <strong>${planName}</strong> je bila uspešno aktivirana oz. obnovljena.
            </p>
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; padding: 20px; margin: 24px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748B;">Številka računa:</td>
                  <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #0A1128;">${invoiceNo}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748B;">Paket naročnine:</td>
                  <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #0A1128;">Paket ${planName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748B;">Plačani znesek:</td>
                  <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #0A1128;">${formattedAmount} € (vklj. z 22% DDV)</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748B;">Način plačila:</td>
                  <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #0A1128;">${paymentMethod}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748B;">Status:</td>
                  <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #059669;">PLAČANO</td>
                </tr>
              </table>
            </div>
            <p style="font-size: 14px; line-height: 1.5; color: #64748B;">
              Uradni PDF račun za vaš nakup je priložen temu sporočilu (<strong>${fileName}</strong>). Vse ugodnosti vašega paketa so že na voljo v vašem uporabniškem računu.
            </p>
            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8; text-align: center;">
              <p style="margin: 0;">Dizain d.o.o., Karantanska ulica 28, 2000 Maribor | ID za DDV: SI57008060</p>
              <p style="margin: 4px 0 0 0;">Sporočilo je bilo samodejno generirano s strani sistema dražbe.si.</p>
            </div>
          </div>
        `;

        const resendClient = new Resend(process.env.RESEND_API_KEY);
        await resendClient.emails.send({
          from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
          to: targetEmail,
          subject: `Račun za naročnino št. ${invoiceNo} - dražbenik.si`,
          html: emailHtml,
          attachments: [
            {
              filename: fileName,
              content: pdfBuffer
            }
          ]
        });
        console.log(`[subscription-invoice] E-poštni račun uspešno poslan na ${targetEmail}`);
      } catch (emailErr: any) {
        console.error('[subscription-invoice] Napaka pri pošiljanju e-poštnega računa:', emailErr.message);
      }
    }
  } catch (err: any) {
    console.error('[subscription-invoice] Napaka pri obdelavi računa za naročnino:', err.message);
  }
}




function formatE164Phone(phoneStr?: string, defaultCountry = 'SI'): string | undefined {
  if (!phoneStr || typeof phoneStr !== 'string') return undefined;
  const cleaned = phoneStr.trim();
  if (!cleaned) return undefined;
  const digits = cleaned.replace(/[^0-9+]/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return '+' + digits.substring(2);
  if (digits.startsWith('0')) {
    if (defaultCountry === 'SI') return '+386' + digits.substring(1);
    if (defaultCountry === 'AT') return '+43' + digits.substring(1);
    if (defaultCountry === 'DE') return '+49' + digits.substring(1);
    if (defaultCountry === 'HR') return '+385' + digits.substring(1);
    if (defaultCountry === 'IT') return '+39' + digits.substring(1);
    return '+386' + digits.substring(1);
  }
  return '+386' + digits;
}

function getCustomerFullName(user: any): string {
  if (!user) return '';
  const first = (user.first_name || user.firstName || '').trim();
  const last = (user.last_name || user.lastName || '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  if (user.company_name || user.companyName) return (user.company_name || user.companyName).trim();
  if (user.representative) return user.representative.trim();
  if (user.name) return user.name.trim();
  if (user.displayName) return user.displayName.trim();
  if (user.username) return user.username.trim();
  return '';
}

function getCustomerAddress(user: any): Stripe.AddressParam | undefined {
  if (!user) return undefined;
  const isBusiness = user.user_type === 'business' || user.userType === 'business';
  const line1 = (isBusiness ? (user.company_street || user.companyStreet) : null) || user.street || (typeof user.address === 'string' ? user.address : user.address?.street) || user.company_street || user.companyStreet || undefined;
  const city = (isBusiness ? (user.company_city || user.companyCity) : null) || user.city || user.address?.city || user.company_city || user.companyCity || undefined;
  const postal_code = (isBusiness ? (user.company_postal_code || user.companyPostalCode) : null) || user.postal_code || user.postalCode || user.address?.postcode || user.company_postal_code || user.companyPostalCode || undefined;
  const country = user.country_code || user.countryCode || (user.address && typeof user.address === 'object' ? user.address.country : null) || 'SI';

  if (!line1 && !city && !postal_code && !country) {
    return undefined;
  }
  return {
    line1: line1 || undefined,
    city: city || undefined,
    postal_code: postal_code || undefined,
    country: country || 'SI',
  };
}

async function getOrCreateStripeCustomer(stripe: Stripe, userId: string, user: any): Promise<string | null> {
  if (!user || !user.email) return null;
  const email = user.email.trim();
  const name = getCustomerFullName(user);
  const phone = formatE164Phone(user.phone || user.phoneNumber || user.telephone, user.country_code || 'SI');
  const address = getCustomerAddress(user);

  let customerId = user.stripe_customer_id || user.stripeCustomerId;

  const customerPayload: Stripe.CustomerCreateParams = {
    email,
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
    metadata: {
      user_id: userId,
      user_type: user.user_type || user.userType || 'individual',
    }
  };

  if (customerId) {
    try {
      await stripe.customers.update(customerId, customerPayload);
      return customerId;
    } catch (e: any) {
      console.warn("Could not update existing stripe customer, will search or create fresh:", e.message);
      customerId = null;
    }
  }

  if (!customerId) {
    try {
      const existingList = await stripe.customers.list({ email, limit: 1 });
      if (existingList.data.length > 0) {
        customerId = existingList.data[0].id;
        await stripe.customers.update(customerId, customerPayload);
      } else {
        const newCustomer = await stripe.customers.create(customerPayload);
        customerId = newCustomer.id;
      }

      if (userId && customerId) {
        await adminDb.collection('users').doc(userId).set({
          stripe_customer_id: customerId,
          stripeCustomerId: customerId
        }, { merge: true });
      }
    } catch (e: any) {
      console.error("Error creating/linking stripe customer:", e.message);
    }
  }

  return customerId;
}

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

function getBidIncrement(price: number): number {
  if (price < 50) return 1;
  if (price < 500) return 5;
  if (price < 2000) return 20;
  if (price < 5000) return 50;
  return 100;
}

/**
 * Helper to get current Europe/Ljubljana year.
 */
function getLjubljanaYear(): { currentYear: number; currentYearStr: string } {
  const currentYearStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Ljubljana',
    year: 'numeric'
  }).format(new Date());
  const currentYear = parseInt(currentYearStr, 10) || new Date().getFullYear();
  return { currentYear, currentYearStr };
}

/**
 * Asserts compliance with the EU AML annual purchase limit (10,000 EUR).
 * Reads the current-year spent amount in Europe/Ljubljana time zone.
 * If buyer.identity_verified !== true and (spent + purchaseAmountEur) > 10,000 EUR,
 * refuses the purchase with HTTP 400 status.
 */
function assertAmlLimit(buyer: any, purchaseAmountEur: number): void {
  if (!buyer) return;
  if (buyer.identity_verified === true) return;

  const { currentYear, currentYearStr } = getLjubljanaYear();

  let currentYearSpent = 0;
  if (buyer.yearly_spent_by_year && buyer.yearly_spent_by_year[currentYear] !== undefined) {
    currentYearSpent = Number(buyer.yearly_spent_by_year[currentYear]) || 0;
  } else if (buyer.yearly_spent_by_year && buyer.yearly_spent_by_year[currentYearStr] !== undefined) {
    currentYearSpent = Number(buyer.yearly_spent_by_year[currentYearStr]) || 0;
  } else if ((buyer.yearly_spent_year === currentYear || buyer.yearly_spent_year === currentYearStr) && typeof buyer.yearly_spent === 'number') {
    currentYearSpent = buyer.yearly_spent;
  }

  const projectedSpent = currentYearSpent + purchaseAmountEur;
  if (projectedSpent > 10000) {
    const err: any = new Error("V skladu z zakonodajo EU (ZPPDFT-2 / AML) je za skupne letne nakupe nad 10.000 € obvezna identifikacija z osebnim dokumentom. Prosimo, verificirajte svoj profil v nastavitvah pred nadaljevanjem.");
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Records AML spending for a buyer idempotently.
 * Uses aml_spend_log/{uniqueKey} to guarantee that each payment is counted exactly once.
 * Updates yearly_spent_by_year.<year>, yearly_spent_year, yearly_spent, total_spent, purchases_count, and last_purchase_at.
 * Can run in an existing transaction or create a new one.
 */
async function recordAmlSpend({
  buyerId,
  amountEur,
  uniqueKey,
  transaction
}: {
  buyerId: string;
  amountEur: number;
  uniqueKey: string;
  transaction?: FirebaseFirestore.Transaction;
}): Promise<{ recorded: boolean; already_recorded: boolean }> {
  if (!buyerId || !uniqueKey || amountEur <= 0) {
    return { recorded: false, already_recorded: false };
  }

  const { currentYear } = getLjubljanaYear();
  const logRef = adminDb.collection('aml_spend_log').doc(uniqueKey);
  const buyerRef = adminDb.collection('users').doc(buyerId);
  const nowISO = new Date().toISOString();

  const runWithTx = async (t: FirebaseFirestore.Transaction) => {
    const logDoc = await t.get(logRef);
    if (logDoc.exists) {
      return { recorded: false, already_recorded: true };
    }

    const buyerDoc = await t.get(buyerRef);
    const buyer = buyerDoc.data() || {};

    const isCurrentYear = buyer.yearly_spent_year === currentYear;
    const previousYearlySpent = isCurrentYear ? (Number(buyer.yearly_spent) || 0) : 0;
    const newYearlySpent = previousYearlySpent + amountEur;

    // Create log record
    t.set(logRef, {
      buyer_id: buyerId,
      amount_eur: amountEur,
      year: currentYear,
      created_at: nowISO
    });

    // Update buyer document with FieldValue.increment
    t.set(buyerRef, {
      yearly_spent: newYearlySpent,
      yearly_spent_year: currentYear,
      [`yearly_spent_by_year.${currentYear}`]: FieldValue.increment(amountEur),
      total_spent: FieldValue.increment(amountEur),
      purchases_count: FieldValue.increment(1),
      last_purchase_at: nowISO
    }, { merge: true });

    return { recorded: true, already_recorded: false };
  };

  if (transaction) {
    return await runWithTx(transaction);
  } else {
    return await adminDb.runTransaction(runWithTx);
  }
}

/**
 * Reserves an AML amount in Firestore to prevent race conditions during payment initialization.
 * Runs in a single Firestore transaction:
 * 1. Reads buyer doc
 * 2. Reads all active reservations for this buyer
 * 3. Filters out the current auction's reservation and expired reservations
 * 4. Sums active unexpired reservations + current purchase amount + current year spend
 * 5. If limit > 10,000 EUR and buyer.identity_verified !== true, throws 400 error
 * 6. Sets/updates the reservation doc for `${buyerId}_${auctionId}` with status 'active'
 */
async function reserveAmlAmount({
  buyerId,
  auctionId,
  amountEur
}: {
  buyerId: string;
  auctionId: string;
  amountEur: number;
}): Promise<{ reservationId: string; expiresAt: string }> {
  if (!buyerId || !auctionId || amountEur <= 0) {
    return { reservationId: `${buyerId}_${auctionId}`, expiresAt: '' };
  }

  const reservationId = `${buyerId}_${auctionId}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const createdAt = now.toISOString();

  const currentYearStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Ljubljana',
    year: 'numeric'
  }).format(now);
  const currentYear = parseInt(currentYearStr, 10) || now.getFullYear();

  await adminDb.runTransaction(async (t) => {
    const buyerRef = adminDb.collection('users').doc(buyerId);
    const buyerDoc = await t.get(buyerRef);
    const buyer = buyerDoc.data() || {};

    // If verified, skip limit check but still create reservation
    if (buyer.identity_verified !== true) {
      let currentYearSpent = 0;
      if (buyer.yearly_spent_by_year && buyer.yearly_spent_by_year[currentYear] !== undefined) {
        currentYearSpent = Number(buyer.yearly_spent_by_year[currentYear]) || 0;
      } else if (buyer.yearly_spent_by_year && buyer.yearly_spent_by_year[currentYearStr] !== undefined) {
        currentYearSpent = Number(buyer.yearly_spent_by_year[currentYearStr]) || 0;
      } else if ((buyer.yearly_spent_year === currentYear || buyer.yearly_spent_year === currentYearStr) && typeof buyer.yearly_spent === 'number') {
        currentYearSpent = buyer.yearly_spent;
      }

      // Read all active reservations for this buyer
      const activeReservationsQuery = adminDb.collection('aml_reservations')
        .where('buyer_id', '==', buyerId)
        .where('status', '==', 'active');
      const activeResSnap = await t.get(activeReservationsQuery);

      const nowTime = now.getTime();
      let otherActiveReservationsSum = 0;

      for (const doc of activeResSnap.docs) {
        if (doc.id === reservationId) {
          // Exclude document of this same auction
          continue;
        }
        const data = doc.data();
        if (data.expires_at) {
          const expTime = new Date(data.expires_at).getTime();
          if (expTime > nowTime) {
            otherActiveReservationsSum += Number(data.amount_eur) || 0;
          }
        }
      }

      const projectedTotal = currentYearSpent + otherActiveReservationsSum + amountEur;
      if (projectedTotal > 10000) {
        const err: any = new Error("V skladu z zakonodajo EU (ZPPDFT-2 / AML) je za skupne letne nakupe nad 10.000 € obvezna identifikacija z osebnim dokumentom. Prosimo, verificirajte svoj profil v nastavitvah pred nadaljevanjem.");
        err.statusCode = 400;
        throw err;
      }
    }

    const reservationRef = adminDb.collection('aml_reservations').doc(reservationId);
    t.set(reservationRef, {
      buyer_id: buyerId,
      auction_id: auctionId,
      amount_eur: amountEur,
      year: currentYear,
      status: 'active',
      expires_at: expiresAt,
      created_at: createdAt
    }, { merge: true });
  });

  return { reservationId, expiresAt };
}

const app = express();

const defaultAllowedOrigins = [
  'https://drazbe.eu',
  'https://www.drazbe.eu',
  'https://drazbenik.si',
  'https://www.drazbenik.si',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    const allowed = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
      : defaultAllowedOrigins;
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  }
}));

// SECURITY HEADERS
app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  if (process.env.NODE_ENV === "production") {
    // Only apply in production to prevent breaking the AI Studio live preview iframe
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.googleapis.com https://www.google.com/recaptcha/ https://api.stripe.com ws: wss:; frame-src 'self' https://www.google.com/recaptcha/ https://js.stripe.com; img-src 'self' data: https: blob:;");
  }
  next();
});

// UPSTASH RATE LIMITER
let ratelimit: Ratelimit | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  // 5 requests per minute
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    analytics: true,
  });
}

// APPLY RATE LIMITING TO CRITICAL ROUTES
app.use(async (req, res, next) => {
  if (
    req.path === "/api/auth/verify-captcha" ||
    req.path === "/api/auth/send-verification" ||
    req.path === "/api/auth/send-password-reset" ||
    req.path === "/api/place-bid" ||
    req.path === "/api/auctions/create"
  ) {
    if (ratelimit) {
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
      const identifier = Array.isArray(ip) ? ip[0] : ip;
      try {
        const { success } = await ratelimit.limit(identifier);
        if (!success) {
          return res.status(429).json({ error: "Too many requests. Please try again later." });
        }
      } catch (err) {
        console.warn("Rate limit check failed, skipping blocking:", err);
      }
    } else {
      console.warn("Rate limiting is disabled (missing UPSTASH_REDIS_REST_URL)");
    }
  }
  next();
});

// URL Normalizer for Vercel Serverless environment
app.use((req, _res, next) => {
  if (process.env.VERCEL) {
    const matchedPath = (req.headers['x-matched-path'] as string) || (req.headers['x-invoke-path'] as string);
    let resolvedUrl = req.url || '/';

    if (matchedPath && matchedPath.startsWith('/api')) {
      resolvedUrl = matchedPath;
    } else if (req.originalUrl && req.originalUrl.startsWith('/api') && (req.url === '/' || req.url.startsWith('/api/index') || req.url === '')) {
      resolvedUrl = req.originalUrl;
    } else if (!resolvedUrl.startsWith('/api') && !resolvedUrl.startsWith('/webhook')) {
      resolvedUrl = '/api' + (resolvedUrl.startsWith('/') ? resolvedUrl : '/' + resolvedUrl);
    }

    resolvedUrl = resolvedUrl.replace(/^\/api\/api\//, '/api/');

    if (resolvedUrl === '/api/index.ts' || resolvedUrl === '/api/index') {
      if (req.originalUrl && req.originalUrl !== resolvedUrl) {
        resolvedUrl = req.originalUrl;
      }
    }

    req.url = resolvedUrl;
  }
  next();
});

// Webhook must be mounted BEFORE express.json() to preserve raw Buffer for Stripe signature validation
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (!endpointSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed') {
    const isSession = event.type === 'checkout.session.completed';
    const sessionObj = isSession ? (event.data.object as Stripe.Checkout.Session) : null;
    const paymentIntent = !isSession ? (event.data.object as Stripe.PaymentIntent) : null;

    const rawMetadata = isSession ? (sessionObj?.metadata || {}) : (paymentIntent?.metadata || {});
    const paymentId = isSession ? sessionObj!.id : paymentIntent!.id;
    console.log('Payment event succeeded:', event.type, paymentId);

    try {
      const { type, purpose, auction_id, buyer_id, seller_id, fee_percentage, user_id, package_id } = rawMetadata;

      // Handle Test Wallet Funding from Stripe PaymentIntent
      if (purpose === 'test_wallet_funding' || type === 'test_wallet_funding') {
        const targetUserId = user_id || buyer_id;
        const amountCents = isSession ? (sessionObj?.amount_total || 0) : (paymentIntent?.amount || 0);
        const piId = isSession 
          ? (typeof sessionObj?.payment_intent === 'string' ? sessionObj.payment_intent : sessionObj?.payment_intent?.id || sessionObj!.id)
          : paymentIntent!.id;

        if (targetUserId && amountCents > 0 && piId) {
          console.log(`[stripe-webhook] eventId=${event.id} paymentIntentId=${piId} userId=${targetUserId} walletCredit=${amountCents}`);
          const depositResult = await creditWalletDepositFromStripe(targetUserId, amountCents, piId, {
            description: 'Platform test balance funding',
            environment: 'test',
            webhook_event_id: event.id,
            idempotencyKey: `wallet_dep_${piId}`
          });
          console.log(`[stripe-webhook] eventId=${event.id} paymentIntentId=${piId} userId=${targetUserId} walletCredit=${amountCents} alreadyProcessed=${depositResult.already_processed}`);
        } else {
          console.warn('[stripe-webhook] Missing user_id or amount for test_wallet_funding:', { targetUserId, amountCents, piId });
        }
        res.json({ received: true });
        return;
      }

      const isSub = type === 'subscription' ||
                    (isSession && (sessionObj?.amount_total === 2000 || sessionObj?.amount_total === 5000 || (sessionObj?.metadata?.planId || '').length > 0)) ||
                    (!isSession && (paymentIntent?.amount === 2000 || paymentIntent?.amount === 5000 || (paymentIntent?.metadata?.planId || '').length > 0));

      if (isSub) {
        let targetUserId = user_id || buyer_id || (isSession ? sessionObj?.client_reference_id : null);
        
        const customerEmail = isSession 
          ? (sessionObj?.customer_details?.email || sessionObj?.customer_email)
          : paymentIntent?.receipt_email;
          
        if (!targetUserId && customerEmail) {
          try {
            const uSnap = await adminDb.collection('users').where('email', '==', customerEmail).limit(1).get();
            if (!uSnap.empty) {
              targetUserId = uSnap.docs[0].id;
            }
          } catch (e) {
            console.warn("[webhook] Could not resolve user by email:", e);
          }
        }

        let pkg = (package_id || rawMetadata.planId || rawMetadata.tier || '').toUpperCase();
        const amt = isSession ? sessionObj?.amount_total : paymentIntent?.amount;
        if (!pkg || (!pkg.includes('PRO') && !pkg.includes('BASIC'))) {
          pkg = amt === 5000 ? 'PRO' : 'BASIC';
        }

        console.log('Processing subscription payment for user', targetUserId, 'package:', pkg);
        if (targetUserId) {
          const now = new Date();
          const validUntil = new Date(now);
          validUntil.setMonth(validUntil.getMonth() + 1);

          const updateData: any = {
            subscription_tier: pkg,
            subscription: pkg,
            subscription_active: true,
            subscription_paid_at: now.toISOString(),
            subscription_started_at: now.toISOString(),
            subscription_cycle_started_at: now.toISOString(),
            subscription_valid_until: validUntil.toISOString(),
            subscription_canceled: false
          };
          
          if (isSession && sessionObj?.subscription) {
            updateData.stripe_subscription_id = typeof sessionObj.subscription === 'string' ? sessionObj.subscription : (sessionObj.subscription as any).id;
          }

          let paymentMethodId = null;
          let customerId = null;
          
          if (isSession && sessionObj?.payment_intent) {
            try {
              const pi = typeof sessionObj.payment_intent === 'string' 
                ? await stripe.paymentIntents.retrieve(sessionObj.payment_intent as string)
                : sessionObj.payment_intent;
              if (typeof pi === 'object' && pi.payment_method) {
                 paymentMethodId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method.id;
              }
            } catch (e) {}
          } else if (!isSession && paymentIntent?.payment_method) {
            paymentMethodId = typeof paymentIntent.payment_method === 'string' ? paymentIntent.payment_method : paymentIntent.payment_method.id;
          }
          
          if (isSession && sessionObj?.customer) {
            customerId = typeof sessionObj.customer === 'string' ? sessionObj.customer : sessionObj.customer.id;
          } else if (!isSession && paymentIntent?.customer) {
            customerId = typeof paymentIntent.customer === 'string' ? paymentIntent.customer : paymentIntent.customer.id;
          }
          
          if (paymentMethodId && customerId) {
            updateData.stripe_default_payment_method = paymentMethodId;
            updateData.stripe_customer_id = customerId;
          }
          
          await adminDb.collection('users').doc(targetUserId).set(updateData, { merge: true });

          const subAmt = Number(amt ? amt / 100 : (pkg.includes('PRO') ? 50 : 20));
          createAndSendSubscriptionInvoice({
            userId: targetUserId,
            packageId: pkg,
            amountTotal: subAmt,
            sourceId: paymentId || `sub_${targetUserId}_${Date.now()}`,
            paymentMethod: 'Spletno plačilo / Kartica (Stripe)',
            periodStart: now,
            periodEnd: validUntil
          }).catch(e => console.error("[webhook] Napaka pri ustvarjanju računa za naročnino:", e));
        }
        res.json({ received: true });
        return;
      }

      // Default type is auction
      if (!auction_id || !buyer_id || !seller_id) {
        console.warn('Missing metadata for payment:', paymentId);
        res.json({ received: true });
        return;
      }

      // 2. Fetch buyer and seller details
      const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(buyer_id));
      const buyer = buyerDoc.data();
      const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(seller_id));
      const seller = sellerDoc.data();

      if (!buyer || !seller) throw new Error('Buyer or seller not found');

      // 3. Calculate Fee and VAT dynamically based on active subscription tier and closing price
      const amountTotalInCents = isSession ? (sessionObj?.amount_total || 0) : paymentIntent!.amount;
      const amountTotal = amountTotalInCents / 100;

      // Fetch auction to get exact price instead of estimating it
      const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(auction_id));
      const auction = auctionDoc.data();
      let currentPrice = amountTotal;
      if (auction && (auction.current_price || auction.currentBid)) {
        currentPrice = Number(auction.current_price || auction.currentBid);
      } else {
        const feePct = Number(fee_percentage) || 0;
        if (feePct > 0) {
          currentPrice = amountTotal / (1 + (feePct / 100));
        }
      }

      const platformFee = calculateMarginalPlatformFee(currentPrice, seller.subscription_tier);

      let vatRate = 0;
      let isReverseCharge = false;

      const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
      const buyerCountry = buyer.country_code || 'SI';
      if (buyerCountry === 'SI') {
        vatRate = 22;
      } else if (euCountries.includes(buyerCountry)) {
        if (buyer.company_status === 'company' && buyer.tax_id) {
          isReverseCharge = true;
          vatRate = 0;
        } else {
          vatRate = 22;
        }
      } else {
        vatRate = 0;
      }

      const vatAmount = platformFee * (vatRate / 100);

      // 4. Create Transaction Record (idempotent)
      let transaction: any = null;
      try {
        const existingTxSnap = await safeGetDocs(
          adminDb.collection('transactions').where('stripe_payment_intent_id', '==', paymentId).limit(1)
        );
        if (!existingTxSnap.empty) {
          const docSnap = existingTxSnap.docs[0];
          transaction = { id: docSnap.id, ...docSnap.data() };
        } else {
          const txRef = await adminDb.collection('transactions').add({
            auction_id,
            buyer_id,
            seller_id,
            stripe_payment_intent_id: paymentId,
            amount_total: amountTotal,
            platform_fee: platformFee,
            vat_amount: vatAmount,
            vat_rate: vatRate,
            is_reverse_charge: isReverseCharge,
            status: 'completed',
            created_at: new Date().toISOString()
          });
          const snap = await safeGetDoc(txRef);
          transaction = { id: txRef.id, ...snap.data() };
        }
      } catch (e: any) {
        console.error('Error creating transaction record:', e.message);
        throw e;
      }

      // 5. Update Auction Status to mark as paid
      try {
        await adminDb.collection('auctions').doc(auction_id).update({
          status: 'completed',
          payment_status: 'paid',
          post_auction_status: 'paid',
          paid_at: new Date().toISOString()
        });

        // Credit seller's held wallet
        const currentPriceCents = Math.round(currentPrice * 100);
        await addHeldFunds(seller_id, currentPriceCents, 'stripe_' + paymentId, { stripe_payment_intent_id: paymentId, auction_id });
      } catch (e: any) {
        console.error('Error updating auction status or wallet:', e.message);
      }

      // Track buyer spending for EU AML (10k annual limit) & purchase history via idempotent recordAmlSpend
      const stripePiId = isSession
        ? (typeof sessionObj?.payment_intent === 'string' ? sessionObj.payment_intent : sessionObj?.payment_intent?.id || sessionObj?.id)
        : paymentIntent?.id;

      try {
        await recordAmlSpend({
          buyerId: buyer_id,
          amountEur: amountTotal,
          uniqueKey: 'pi_' + stripePiId
        });
      } catch (spentErr: any) {
        console.error('Error updating buyer spending records in server webhook:', spentErr.message);
      }

      // Mark AML reservation as consumed
      try {
        const reservationDocRef = adminDb.collection('aml_reservations').doc(`${buyer_id}_${auction_id}`);
        const reservationDoc = await safeGetDoc(reservationDocRef);
        if (reservationDoc.exists()) {
          const resData = reservationDoc.data();
          if (resData?.status !== 'active') {
            console.warn(`[webhook] Consuming AML reservation for ${buyer_id}_${auction_id} which was in status '${resData?.status}'`);
          }
          await reservationDocRef.set({
            status: 'consumed',
            consumed_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentId
          }, { merge: true });
        } else {
          console.warn(`[webhook] No active AML reservation found for ${buyer_id}_${auction_id} when consuming payment.`);
        }
      } catch (resErr: any) {
        console.error('[webhook] Error consuming AML reservation:', resErr.message);
      }

      // 6. Generate Invoice Numbers
      let salesInvoiceNo = `ITEM-${transaction.id.substring(0, 8)}`;
      let commissionInvoiceNo = `FEE-${transaction.id.substring(0, 8)}`;
      try {
        salesInvoiceNo = await generateInvoiceNumber('SALES');
        commissionInvoiceNo = await generateInvoiceNumber('COMMISSION');
        await adminDb.collection('transactions').doc(transaction.id).update({
          sales_invoice_no: salesInvoiceNo,
          commission_invoice_no: commissionInvoiceNo
        });
      } catch (e: any) {
        console.error('Error generating invoice numbers:', e.message);
      }

      // 7. Generate Documents
      const documentsToInsert: any[] = [];
      const attachments: any[] = [];
      let auctionDataPdf: any = null;

      try {
        const auctionDocPdf = await safeGetDoc(adminDb.collection('auctions').doc(auction_id));
        auctionDataPdf = auctionDocPdf.data();
        const invoicePdfBuffer = await generateInvoicePDF(transaction, buyer, seller, auctionDataPdf, salesInvoiceNo, commissionInvoiceNo);
        const invoiceFileName = `racun_${salesInvoiceNo}.pdf`;

        // Upload to Storage via Admin SDK
        const publicUrl = await uploadBufferToStorage(invoicePdfBuffer, `${buyer_id}/${invoiceFileName}`);
        documentsToInsert.push({
          transaction_id: transaction.id,
          user_id: buyer_id,
          type: 'invoice',
          file_url: publicUrl,
          created_at: new Date().toISOString()
        });

        attachments.push({
          filename: invoiceFileName,
          content: invoicePdfBuffer
        });
      } catch (pdfErr: any) {
        console.error('Error generating/uploading invoice PDF:', pdfErr.message);
      }

      if (documentsToInsert.length > 0) {
        try {
          const batch = adminDb.batch();
          documentsToInsert.forEach(d => {
            const ref = adminDb.collection('documents').doc();
            batch.set(ref, d);
          });
          await batch.commit();
        } catch (docErr: any) {
          console.error('Error saving document records:', docErr.message);
        }
      }

      if (buyer.email && process.env.RESEND_API_KEY) {
        try {
          const auctionTitleText = auctionDataPdf?.title?.SLO || auctionDataPdf?.title?.EN || 'Predmet dražbe';
          const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
          const auctionUrl = `${baseAppUrl}/?drazba=${auction_id}`;
          
          const htmlContent = await render(React.createElement(AuctionEmailTemplate, {
            type: 'payment_success',
            recipientName: buyer.first_name || buyer.name || 'uporabnik',
            auctionTitle: auctionTitleText,
            auctionImageUrl: auctionDataPdf?.images?.[0]?.url,
            currentPrice: transaction.amount_total,
            auctionUrl,
            settingsUrl: `${baseAppUrl}/?tab=settings`,
          }));

          const resendClient = new Resend(process.env.RESEND_API_KEY);
          await resendClient.emails.send({
            from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
            to: buyer.email,
            subject: `Potrdilo o plačilu in dokumenti: ${auctionTitleText} - dražbenik.si`,
            html: htmlContent,
            attachments
          });
          console.log(`Email sent successfully to ${buyer.email}`);
        } catch (emailErr: any) {
          console.error('Error sending success email:', emailErr.message);
        }
      }

    } catch (err: any) {
      console.error("Error processing successful payment:", err.message);
    }
  }

  if (event.type === 'identity.verification_session.verified') {
    const session = event.data.object as Stripe.Identity.VerificationSession;
    const uid = session?.metadata?.user_id;
    if (!uid) {
      console.warn('[webhook] Missing user_id in identity.verification_session.verified metadata:', session?.id);
    } else {
      try {
        await adminDb.collection('users').doc(uid).set({
          identity_verified: true,
          identity_verified_at: new Date().toISOString(),
          identity_verification_status: 'verified',
        }, { merge: true });
        console.log(`[webhook] User ${uid} identity verified successfully.`);
      } catch (err: any) {
        console.error(`[webhook] Error updating user ${uid} for identity verified:`, err.message);
      }
    }
  } else if (event.type === 'identity.verification_session.requires_input') {
    const session = event.data.object as Stripe.Identity.VerificationSession;
    const uid = session?.metadata?.user_id;
    if (!uid) {
      console.warn('[webhook] Missing user_id in identity.verification_session.requires_input metadata:', session?.id);
    } else {
      try {
        await adminDb.collection('users').doc(uid).set({
          identity_verification_status: 'requires_input',
          identity_verified: false,
        }, { merge: true });
        console.log(`[webhook] User ${uid} identity verification status set to requires_input.`);
      } catch (err: any) {
        console.error(`[webhook] Error updating user ${uid} for identity requires_input:`, err.message);
      }
    }
  } else if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session?.metadata || {};
    const { auction_id, buyer_id } = metadata;
    const sessionId = session?.id;

    try {
      if (buyer_id && auction_id) {
        const reservationId = `${buyer_id}_${auction_id}`;
        await adminDb.collection('aml_reservations').doc(reservationId).set({
          status: 'released',
          released_at: new Date().toISOString(),
          release_reason: 'checkout_session_expired'
        }, { merge: true });
        console.log(`[webhook] Released AML reservation ${reservationId} due to checkout.session.expired`);
      } else if (sessionId) {
        const qSnap = await adminDb.collection('aml_reservations')
          .where('stripe_session_id', '==', sessionId)
          .where('status', '==', 'active')
          .limit(5)
          .get();
        for (const doc of qSnap.docs) {
          await doc.ref.set({
            status: 'released',
            released_at: new Date().toISOString(),
            release_reason: 'checkout_session_expired'
          }, { merge: true });
          console.log(`[webhook] Released AML reservation ${doc.id} by sessionId ${sessionId}`);
        }
      } else {
        console.warn('[webhook] checkout.session.expired received without metadata or session id');
      }
    } catch (err: any) {
      console.error('[webhook] Error releasing AML reservation for checkout.session.expired:', err.message);
    }
  } else if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const metadata = paymentIntent?.metadata || {};
    const { auction_id, buyer_id } = metadata;
    const piId = paymentIntent?.id;

    try {
      if (buyer_id && auction_id) {
        const reservationId = `${buyer_id}_${auction_id}`;
        await adminDb.collection('aml_reservations').doc(reservationId).set({
          status: 'released',
          released_at: new Date().toISOString(),
          release_reason: event.type
        }, { merge: true });
        console.log(`[webhook] Released AML reservation ${reservationId} due to ${event.type}`);
      } else if (piId) {
        const qSnap = await adminDb.collection('aml_reservations')
          .where('stripe_payment_intent_id', '==', piId)
          .where('status', '==', 'active')
          .limit(5)
          .get();
        for (const doc of qSnap.docs) {
          await doc.ref.set({
            status: 'released',
            released_at: new Date().toISOString(),
            release_reason: event.type
          }, { merge: true });
          console.log(`[webhook] Released AML reservation ${doc.id} by paymentIntentId ${piId}`);
        }
      } else {
        console.warn(`[webhook] ${event.type} received without metadata or payment intent id`);
      }
    } catch (err: any) {
      console.error(`[webhook] Error releasing AML reservation for ${event.type}:`, err.message);
    }
  }

  res.json({ received: true });
});

// JSON Body Parser for all non-webhook routes
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return next();
  }
  express.json({ limit: '10mb' })(req, res, (err) => {
    if (err) {
      console.warn('[JSON parse warning]:', err.message);
    }
    next();
  });
});

app.use((req, _res, next) => {
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      // ignore malformed strings
    }
  }
  next();
});

// Helper to validate CRON_SECRET with timing-safe comparison
function requireCronSecret(req: express.Request, res: express.Response): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    res.status(500).json({ error: 'Cron secret not configured' });
    return false;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  const token = authHeader.substring(7);
  const tokenBuf = Buffer.from(token, 'utf8');
  const secretBuf = Buffer.from(cronSecret, 'utf8');

  if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

// Unified Cron handler for Vercel Cron and external schedulers
const handleCronCheck = async (req: express.Request, res: express.Response) => {
  if (!requireCronSecret(req, res)) return;
  try {
    console.log('[CRON] Executing auction check...');
    const results = await processAuctionCrons();
    res.json(results);
  } catch (e: any) {
    console.error('[CRON ERROR]', e);
    res.status(500).json({ error: e.message || 'Internal server error in cron' });
  }
};

app.get("/api/cron/check-auctions", handleCronCheck);
app.post("/api/cron/check-auctions", handleCronCheck);
app.get("/api/cron-auctions", handleCronCheck);
app.post("/api/cron-auctions", handleCronCheck);

// Dedicated endpoint for placing bids with instant outbid email triggers
app.post("/api/place-bid", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { auction_id, amount } = req.body;
    if (!auction_id || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: "Manjkajoči ali neveljavni podatki za ponudbo." });
    }

    const auctionRef = adminDb.collection('auctions').doc(auction_id);
    const userRef = adminDb.collection('users').doc(userId);

    // Verify user existence and state
    const userSnap = await safeGetDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: "Uporabnik ne obstaja." });
    }
    const userData = userSnap.data();
    if (userData.isBlocked) {
      return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
    }

    let outbidUserToNotify: { userId: string; newPrice: number; auctionTitle: string; auctionImageUrl?: string } | null = null;
    let finalWinnerId = userId;
    let finalPrice = amount;

    await adminDb.runTransaction(async (transaction) => {
      const auctionDoc = await transaction.get(auctionRef);
      if (!isDocSnapshotExists(auctionDoc)) {
        throw new Error("Dražba ne obstaja.");
      }
      const data = getDocSnapshotData(auctionDoc) || {};

      // Pruefung, ob die Auktion aktiv ist und nicht in der Vergangenheit liegt
      const auctionStatus = data.status || 'active';
      const rawEndTime = data.end_time || data.endTime;
      const parsedEndTime = rawEndTime ? new Date(rawEndTime).getTime() : 0;
      if (auctionStatus !== 'active' || (parsedEndTime > 0 && parsedEndTime <= Date.now())) {
        throw new Error("Dražba ni več aktivna ali pa je že potekla.");
      }
      
      // VARNOSTNI PREGLED (SECURITY PATCH): Preprečimo lastniku dražbe, da bi licitiral na lasten predmet (Shill bidding)
      if (data.seller_id === userId || data.sellerId === userId) {
        throw new Error("Ne morete oddati ponudbe na lastno dražbo.");
      }
      const currentPrice = Number(data.current_price ?? data.currentBid ?? 0);
      const prevWinnerId = data.winner_id || data.winnerId;
      const isCurrentWinner = prevWinnerId === userId;

      if (amount <= currentPrice) {
        throw new Error("Ponudba mora biti višja od trenutne cene.");
      }

      const currentProxy = data.current_proxy_bid || data.currentProxyBid;
      let newCurrentPrice = currentPrice;
      let newWinnerId = userId;
      let newProxyBid = { user_id: userId, amount };

      const increment = getBidIncrement(currentPrice);

      if (currentProxy && currentProxy.user_id !== userId) {
        if (amount > currentProxy.amount) {
          newCurrentPrice = Math.min(amount, currentProxy.amount + increment);
          newWinnerId = userId;
          newProxyBid = { user_id: userId, amount };
        } else if (amount === currentProxy.amount) {
          newCurrentPrice = amount;
          newWinnerId = currentProxy.user_id;
          newProxyBid = currentProxy;
        } else {
          newCurrentPrice = Math.min(currentProxy.amount, amount + increment);
          newWinnerId = currentProxy.user_id;
          newProxyBid = currentProxy;
        }
      } else if (isCurrentWinner || (currentProxy && currentProxy.user_id === userId)) {
        newCurrentPrice = currentPrice;
        newWinnerId = userId;
        newProxyBid = { user_id: userId, amount };
      } else {
        newCurrentPrice = Math.min(amount, currentPrice + increment);
        newWinnerId = userId;
        newProxyBid = { user_id: userId, amount };
      }

      const endTimeStr = data.end_time || data.endTime;
      const endTime = endTimeStr ? new Date(endTimeStr).getTime() : 0;
      const now = Date.now();
      let newEndTimeStr = endTimeStr;

      if (endTime > now && endTime - now < 60 * 1000) {
        newEndTimeStr = new Date(now + 60 * 1000).toISOString();
      }

      let topBids = data.top_bids || [];
      topBids.push({ user_id: userId, amount, timestamp: new Date().toISOString() });
      topBids.sort((a: any, b: any) => b.amount - a.amount);

      let uniqueTopBids: any[] = [];
      let seenUsers = new Set();
      for (let bid of topBids) {
        if (!seenUsers.has(bid.user_id)) {
          uniqueTopBids.push(bid);
          seenUsers.add(bid.user_id);
        }
      }
      uniqueTopBids = uniqueTopBids.slice(0, 3);

      const existingHistory = data.bidding_history || data.biddingHistory || [];
      const newHistoryItem = {
        user_id: userId,
        userId: userId,
        username: userData.username || userData.first_name || userData.email?.split('@')[0] || 'Uporabnik',
        amount,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      transaction.update(auctionRef, {
        current_price: newCurrentPrice,
        currentBid: newCurrentPrice,
        winner_id: newWinnerId,
        winnerId: newWinnerId,
        current_proxy_bid: newProxyBid,
        currentProxyBid: newProxyBid,
        hidden_max_bid: newProxyBid.amount,
        hiddenMaxBid: newProxyBid.amount,
        bid_count: (data.bid_count || data.bidCount || 0) + 1,
        bidCount: (data.bid_count || data.bidCount || 0) + 1,
        top_bids: uniqueTopBids,
        end_time: newEndTimeStr,
        endTime: newEndTimeStr,
        bidding_history: [...existingHistory, newHistoryItem],
        biddingHistory: [...existingHistory, newHistoryItem]
      });

      finalWinnerId = newWinnerId;
      finalPrice = newCurrentPrice;

      // Check if previous leader was outbid
      if (prevWinnerId && prevWinnerId !== userId && newWinnerId === userId) {
        const title = data.title?.SLO || data.title?.EN || (typeof data.title === 'string' ? data.title : 'Predmet dražbe');
        const imageUrl = Array.isArray(data.images) && data.images.length > 0 ? data.images[0] : undefined;
        outbidUserToNotify = {
          userId: prevWinnerId,
          newPrice: newCurrentPrice,
          auctionTitle: title,
          auctionImageUrl: imageUrl,
        };
      }
    });

    // Send outbid notification email asynchronously
    if (outbidUserToNotify) {
      (async () => {
        try {
          const prevUserDoc = await safeGetDoc(adminDb.collection('users').doc(outbidUserToNotify!.userId));
          if (prevUserDoc.exists()) {
            const prevUserData = prevUserDoc.data();
            if (prevUserData.email) {
              await sendOutbidNotification({
                toEmail: prevUserData.email,
                recipientName: prevUserData.first_name || prevUserData.name || 'Uporabnik',
                auctionId: auction_id,
                auctionTitle: outbidUserToNotify!.auctionTitle,
                auctionImageUrl: outbidUserToNotify!.auctionImageUrl,
                newPrice: outbidUserToNotify!.newPrice,
              });
            }
          }
        } catch (emailErr: any) {
          console.error('[OUTBID EMAIL ERROR]', emailErr.message);
        }
      })();
    }

    const resultStatus = finalWinnerId === userId ? "ok" : "outbid";
    res.json({
      success: true,
      resultStatus,
      newWinnerId: finalWinnerId,
      currentPrice: finalPrice,
    });
  } catch (e: any) {
    console.error("[PLACE BID ERROR]", e);
    res.status(400).json({ error: e.message || "Napaka pri oddaji ponudbe" });
  }
});

// Direct helper endpoint to trigger outbid notifications
app.post("/api/notify-outbid", async (req, res) => {
  try {
    const { auction_id, outbid_user_id, new_price } = req.body;
    if (!auction_id || !outbid_user_id) {
      return res.status(400).json({ error: "Manjkajoči podatki" });
    }

    const [auctionDoc, userDoc] = await Promise.all([
      safeGetDoc(adminDb.collection('auctions').doc(auction_id)),
      safeGetDoc(adminDb.collection('users').doc(outbid_user_id)),
    ]);

    if (!auctionDoc.exists() || !userDoc.exists()) {
      return res.status(404).json({ error: "Dražba ali uporabnik ne obstaja" });
    }

    const auctionData = auctionDoc.data();
    const userData = userDoc.data();

    if (!userData.email) {
      return res.json({ success: false, reason: "No email on user" });
    }

    const title = auctionData.title?.SLO || auctionData.title?.EN || (typeof auctionData.title === 'string' ? auctionData.title : 'Predmet dražbe');
    const imageUrl = Array.isArray(auctionData.images) && auctionData.images.length > 0 ? auctionData.images[0] : undefined;
    const price = typeof new_price === 'number' ? new_price : Number(auctionData.current_price || 0);

    await sendOutbidNotification({
      toEmail: userData.email,
      recipientName: userData.first_name || userData.name || 'Uporabnik',
      auctionId: auction_id,
      auctionTitle: title,
      auctionImageUrl: imageUrl,
      newPrice: price,
    });

    res.json({ success: true });
  } catch (e: any) {
    console.error("[NOTIFY OUTBID ERROR]", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/create-checkout-session", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { currency = "eur", auction_id, auctionId, return_url, type = "auction", package_id, planId, tier } = req.body || {};
    const stripe = getStripe();

    const effectiveAuctionId = auction_id || auctionId;
    const effectiveBuyerId = userId;
    let auctionTitle = "Plačilo";
    let sessionMetadata: any = { type };
    let buyer: any = null;
    let stripeCustomerId: string | null = null;
    let finalAmountCents = 0;
    let reservationId = '';
    let reservationCreated = false;

    // Always load buyer from Firestore; ignore buyer_data from request body
    try {
      const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(effectiveBuyerId));
      if (buyerDoc.exists()) {
        buyer = buyerDoc.data();
      }
    } catch (e: any) {
      console.warn("Could not fetch buyer from DB:", e.message);
    }

    // Check buyer & customer
    if (buyer) {
      stripeCustomerId = await getOrCreateStripeCustomer(stripe, effectiveBuyerId, buyer);
    }

    if (type === "auction") {
      if (!effectiveAuctionId) {
        return res.status(400).json({ error: "Missing required auction fields for payment" });
      }

      let auction: any = null;
      try {
        const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(effectiveAuctionId));
        if (auctionDoc.exists()) {
          auction = auctionDoc.data();
        }
      } catch (e) {
        console.warn("Could not fetch auction:", e);
      }

      if (!auction) {
        return res.status(400).json({ error: "Invalid auction payment amount (auction not found)" });
      }

      if (auction.payment_status === 'paid') {
        return res.status(400).json({ error: "Ta dražba je že plačana." });
      }

      const winnerId = auction.winner_id || auction.winnerId || auction.highest_bidder;
      const isCaseA = auction.post_auction_status === 'awaiting_payment_1st' && winnerId === userId;
      const isCaseB = auction.post_auction_status === 'offered_2nd' && auction.second_winner_id === userId;

      if (!isCaseA && !isCaseB) {
        return res.status(403).json({ error: "Te dražbe ne morete plačati." });
      }

      if (auction.title) {
        auctionTitle = (typeof auction.title === 'object' ? (auction.title['SLO'] || auction.title['EN']) : auction.title) || "Dražba";
      }
      
      let authoritativePriceInCents = 0;
      if (auction.current_price !== undefined && auction.current_price !== null && auction.current_price !== '') {
        authoritativePriceInCents = parseAmountToCents(auction.current_price);
      } else if (auction.currentBid !== undefined && auction.currentBid !== null && auction.currentBid !== '') {
        authoritativePriceInCents = parseAmountToCents(auction.currentBid);
      } else if (auction.starting_price !== undefined && auction.starting_price !== null && auction.starting_price !== '') {
        authoritativePriceInCents = parseAmountToCents(auction.starting_price);
      }

      if (authoritativePriceInCents <= 0) {
        return res.status(400).json({ error: "Invalid auction payment amount" });
      }

      const effectiveSellerId = auction.seller_id || auction.sellerId || '';
      let sellerTier = 'BASIC';
      if (effectiveSellerId) {
        const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(effectiveSellerId));
        if (sellerDoc.exists()) sellerTier = sellerDoc.data()?.subscription_tier || 'BASIC';
      }
      const totals = calculateCheckoutTotals(authoritativePriceInCents, sellerTier);
      finalAmountCents = totals.buyerTotalInCents;

      reservationId = `${userId}_${effectiveAuctionId}`;
      reservationCreated = false;

      try {
        await reserveAmlAmount({
          buyerId: userId,
          auctionId: effectiveAuctionId,
          amountEur: finalAmountCents / 100
        });
        reservationCreated = true;
      } catch (amlErr: any) {
        return res.status(amlErr.statusCode || 400).json({ error: amlErr.message });
      }

      sessionMetadata = {
        type: 'auction',
        auction_id: effectiveAuctionId,
        buyer_id: userId,
        seller_id: effectiveSellerId
      };
    } else if (type === "subscription") {
      const rawPlan = package_id || planId || tier;
      if (!rawPlan || typeof rawPlan !== 'string') {
        return res.status(400).json({ error: "Neveljaven paket naročnine." });
      }
      const cleanPlan = rawPlan.trim().toUpperCase();
      if (cleanPlan !== 'BASIC' && cleanPlan !== 'PRO') {
        return res.status(400).json({ error: "Neveljaven paket naročnine." });
      }

      if (cleanPlan === 'PRO') {
        finalAmountCents = 5000;
      } else {
        finalAmountCents = 2000;
      }

      auctionTitle = "Naročnina - " + (cleanPlan === 'PRO' ? 'Napredni (Pro)' : 'Osnovni (Basic)');
      sessionMetadata = {
        type: 'subscription',
        buyer_id: userId,
        user_id: userId,
        planId: cleanPlan.toLowerCase(),
        package_id: cleanPlan,
        tier: cleanPlan,
        amount: finalAmountCents.toString()
      };
    } else {
      return res.status(400).json({ error: "Neveljavna vrsta plačila." });
    }

    if (finalAmountCents <= 0) {
      return res.status(400).json({ error: "Invalid auction payment amount" });
    }

    // Validate return_url against allowed CORS origins or fall back to APP_URL
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
      : defaultAllowedOrigins;
    let safeBaseUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : 'https://www.drazbe.eu';

    if (return_url && typeof return_url === 'string') {
      try {
        const parsed = new URL(return_url);
        if (allowedOrigins.includes(parsed.origin)) {
          safeBaseUrl = return_url;
        }
      } catch (_) {}
    }

    const successUrl = safeBaseUrl.includes('/stripe-callback.html')
      ? `${safeBaseUrl}${safeBaseUrl.includes('?') ? '&' : '?'}payment=success&type=${type}&session_id={CHECKOUT_SESSION_ID}`
      : `${safeBaseUrl}${safeBaseUrl.includes('?') ? '&' : '?'}payment=success&type=${type}&session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl = safeBaseUrl.includes('/stripe-callback.html')
      ? `${safeBaseUrl}${safeBaseUrl.includes('?') ? '&' : '?'}payment=cancel`
      : `${safeBaseUrl}${safeBaseUrl.includes('?') ? '&' : '?'}payment=cancel`;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: auctionTitle,
          },
          unit_amount: finalAmountCents,
        },
        quantity: 1,
      }],
      metadata: sessionMetadata,
      payment_intent_data: {
        metadata: sessionMetadata,
        ...(type === 'subscription' ? { setup_future_usage: 'off_session' } : {})
      },
      mode: 'payment',
      expires_at: Math.floor(Date.now() / 1000) + 1800,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    if (effectiveBuyerId) {
      sessionParams.client_reference_id = effectiveBuyerId;
    }

    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
      sessionParams.customer_update = {
        address: 'auto',
        name: 'auto',
        shipping: 'auto',
      };
    } else if (buyer?.email) {
      sessionParams.customer_email = buyer.email;
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (stripeErr: any) {
      if (reservationCreated) {
        try {
          await adminDb.collection('aml_reservations').doc(reservationId).set({
            status: 'released',
            released_at: new Date().toISOString(),
            release_reason: 'stripe_checkout_create_failed'
          }, { merge: true });
        } catch (rErr: any) {
          console.error('Error releasing reservation on Stripe checkout failure:', rErr.message);
        }
      }
      throw stripeErr;
    }

    if (reservationCreated) {
      try {
        await adminDb.collection('aml_reservations').doc(reservationId).set({
          stripe_session_id: session.id
        }, { merge: true });
      } catch (rErr: any) {
        console.error('Error updating reservation with stripe_session_id:', rErr.message);
      }
    }

    res.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error("Stripe Checkout Error:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/confirm-checkout-session", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { sessionId, auctionId } = req.body || {};
    const stripe = getStripe();

    if (!sessionId && !auctionId) {
      return res.status(400).json({ error: 'Missing sessionId or auctionId' });
    }

    let session: Stripe.Checkout.Session | null = null;
    let paymentIntent: Stripe.PaymentIntent | null = null;

    if (sessionId) {
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ['payment_intent']
        });
      } catch (err: any) {
        console.error('Error retrieving checkout session:', err);
      }
    }

    if (session) {
      const isPaid = session.payment_status === 'paid' || session.status === 'complete';
      if (!isPaid) {
        return res.status(400).json({ error: 'Payment not completed for this session', status: session.status });
      }

      paymentIntent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
      const metadata = session.metadata || (paymentIntent ? paymentIntent.metadata : {}) || {};

      // Pruefung: Stimmt die Kaeufer- oder Benutzer-ID im Session-Metadata mit der authentifizierten Benutzer-ID ueberein?
      const sessionUserId = metadata.buyer_id || metadata.user_id;
      if (sessionUserId && sessionUserId !== userId) {
        return res.status(403).json({ error: 'Forbidden: Session belongs to another user' });
      }

      const type = metadata.type || 'auction';
      const effectiveAuctionId = metadata.auction_id || auctionId;
      const effectiveBuyerId = userId;
      const effectiveSellerId = metadata.seller_id;

      const isSub = type === 'subscription' || session.amount_total === 2000 || session.amount_total === 5000 || (metadata.planId || '').length > 0;
      if (isSub) {
        let targetUserId = userId;
        
        // If targetUserId is missing, look up by customer email
        if (!targetUserId) {
          const customerEmail = session.customer_details?.email || session.customer_email || paymentIntent?.receipt_email;
          if (customerEmail) {
            try {
              const uSnap = await adminDb.collection('users').where('email', '==', customerEmail).limit(1).get();
              if (!uSnap.empty) {
                targetUserId = uSnap.docs[0].id;
              }
            } catch (e) {
              console.warn("[confirm-checkout-session] Could not find user by email:", e);
            }
          }
        }

        let packageId = (metadata.package_id || metadata.tier || metadata.planId || '').toUpperCase();
        if (!packageId || (!packageId.includes('PRO') && !packageId.includes('BASIC'))) {
          packageId = session.amount_total === 5000 ? 'PRO' : 'BASIC';
        }

        if (targetUserId) {
          const now = new Date();
          const validUntil = new Date(now);
          validUntil.setMonth(validUntil.getMonth() + 1);
          
          const updateData: any = {
            subscription_tier: packageId,
            subscription: packageId,
            subscription_active: true,
            subscription_paid_at: now.toISOString(),
            subscription_started_at: now.toISOString(),
            subscription_cycle_started_at: now.toISOString(),
            subscription_valid_until: validUntil.toISOString(),
            subscription_canceled: false,
            stripe_checkout_session_id: session.id,
          };

          if (session?.subscription) {
            updateData.stripe_subscription_id = typeof session.subscription === 'string' ? session.subscription : (session.subscription as any).id;
          }
          if (session?.customer) {
            updateData.stripe_customer_id = typeof session.customer === 'string' ? session.customer : (session.customer as any).id;
          }

          await adminDb.collection('users').doc(targetUserId).set(updateData, { merge: true });
          console.log(`[confirm-checkout-session] Successfully upgraded user ${targetUserId} to ${packageId}`);

          const subAmt = Number(session.amount_total ? session.amount_total / 100 : (packageId.includes('PRO') ? 50 : 20));
          createAndSendSubscriptionInvoice({
            userId: targetUserId,
            packageId: packageId,
            amountTotal: subAmt,
            sourceId: session.id,
            paymentMethod: 'Spletno plačilo / Kartica (Stripe)',
            periodStart: now,
            periodEnd: validUntil
          }).catch(e => console.error("[confirm-checkout-session] Napaka pri ustvarjanju računa za naročnino:", e));
        }
        return res.json({ success: true, type: 'subscription', package_id: packageId, userId: targetUserId });
      }

      if (effectiveAuctionId) {
        await adminDb.collection('auctions').doc(effectiveAuctionId).update({
          status: 'completed',
          payment_status: 'paid',
          post_auction_status: 'paid',
          paid_at: new Date().toISOString()
        });

        if (effectiveBuyerId && effectiveSellerId) {
          const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(effectiveBuyerId));
          const buyer = buyerDoc.data() || {};
          const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(effectiveSellerId));
          const seller = sellerDoc.data() || {};

          const amountTotal = (session.amount_total || (paymentIntent ? paymentIntent.amount : 0)) / 100;
          const platformFee = calculateMarginalPlatformFee(amountTotal, seller.subscription_tier);

          let vatRate = 0;
          let isReverseCharge = false;
          const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
          const buyerCountry = buyer.country_code || 'SI';
          if (buyerCountry === 'SI') {
            vatRate = 22;
          } else if (euCountries.includes(buyerCountry)) {
            if (buyer.company_status === 'company' && buyer.tax_id) {
              isReverseCharge = true;
              vatRate = 0;
            } else {
              vatRate = 22;
            }
          }

          const vatAmount = platformFee * (vatRate / 100);

          try {
            const existingTx = await safeGetDocs(
              adminDb.collection('transactions').where('stripe_payment_intent_id', '==', (paymentIntent?.id || session.id))
            );

            if (existingTx.empty) {
              await adminDb.collection('transactions').add({
                auction_id: effectiveAuctionId,
                buyer_id: effectiveBuyerId,
                seller_id: effectiveSellerId,
                stripe_payment_intent_id: paymentIntent?.id || session.id,
                stripe_session_id: session.id,
                amount_total: amountTotal,
                platform_fee: platformFee,
                vat_amount: vatAmount,
                vat_rate: vatRate,
                is_reverse_charge: isReverseCharge,
                status: 'completed',
                created_at: new Date().toISOString()
              });
            }
          } catch (txErr) {
            console.error('Error recording transaction:', txErr);
          }

          const stripePiId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent?.id || paymentIntent?.id || session.id);

          try {
            await recordAmlSpend({
              buyerId: effectiveBuyerId,
              amountEur: amountTotal,
              uniqueKey: 'pi_' + stripePiId
            });
          } catch (amlErr: any) {
            console.error('Error updating AML stats in confirm-checkout-session:', amlErr.message);
          }
        }

        return res.json({ success: true, paid: true, auction_id: effectiveAuctionId });
      }
    } else if (auctionId) {
      await adminDb.collection('auctions').doc(auctionId).update({
        status: 'completed',
        payment_status: 'paid',
        post_auction_status: 'paid',
        paid_at: new Date().toISOString()
      });
      return res.json({ success: true, paid: true, auction_id: auctionId });
    }

    return res.status(400).json({ error: 'Could not confirm payment' });
  } catch (err: any) {
    console.error('Error in confirm-checkout-session:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/create-payment-intent", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { currency = "eur", auction_id, auctionId } = req.body || {};
    const stripe = getStripe();
    const effectiveAuctionId = auction_id || auctionId;

    if (!effectiveAuctionId) {
      return res.status(400).json({ error: "Missing required auction fields for payment" });
    }

    let stripeCustomerId: string | null = null;
    let buyer: any = null;
    const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    if (buyerDoc.exists()) {
      buyer = buyerDoc.data();
      stripeCustomerId = await getOrCreateStripeCustomer(stripe, userId, buyer);
    }

    const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(effectiveAuctionId));
    if (!auctionDoc.exists()) {
      return res.status(400).json({ error: "Invalid auction payment amount (auction not found)" });
    }
    const auction = auctionDoc.data() || {};

    if (auction.payment_status === 'paid') {
      return res.status(400).json({ error: "Ta dražba je že plačana." });
    }

    const winnerId = auction.winner_id || auction.winnerId || auction.highest_bidder;
    const isCaseA = auction.post_auction_status === 'awaiting_payment_1st' && winnerId === userId;
    const isCaseB = auction.post_auction_status === 'offered_2nd' && auction.second_winner_id === userId;

    if (!isCaseA && !isCaseB) {
      return res.status(403).json({ error: "Te dražbe ne morete plačati." });
    }

    let authoritativePriceInCents = 0;
    if (auction.current_price !== undefined && auction.current_price !== null && auction.current_price !== '') {
      authoritativePriceInCents = parseAmountToCents(auction.current_price);
    } else if (auction.currentBid !== undefined && auction.currentBid !== null && auction.currentBid !== '') {
      authoritativePriceInCents = parseAmountToCents(auction.currentBid);
    } else if (auction.starting_price !== undefined && auction.starting_price !== null && auction.starting_price !== '') {
      authoritativePriceInCents = parseAmountToCents(auction.starting_price);
    }

    if (authoritativePriceInCents <= 0) {
      return res.status(400).json({ error: "Invalid auction payment amount" });
    }

    const effectiveSellerId = auction.seller_id || auction.sellerId || '';
    let sellerTier = 'BASIC';
    if (effectiveSellerId) {
      const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(effectiveSellerId));
      if (sellerDoc.exists()) sellerTier = sellerDoc.data()?.subscription_tier || 'BASIC';
    }
    const totals = calculateCheckoutTotals(authoritativePriceInCents, sellerTier);
    const finalAmountCents = totals.buyerTotalInCents;

    const reservationId = `${userId}_${effectiveAuctionId}`;
    let reservationCreated = false;

    try {
      await reserveAmlAmount({
        buyerId: userId,
        auctionId: effectiveAuctionId,
        amountEur: finalAmountCents / 100
      });
      reservationCreated = true;
    } catch (amlErr: any) {
      return res.status(amlErr.statusCode || 400).json({ error: amlErr.message });
    }

    if (finalAmountCents <= 0) {
      return res.status(400).json({ error: "Invalid payment intent amount" });
    }

    const intentParams: Stripe.PaymentIntentCreateParams = {
      amount: finalAmountCents,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        type: 'auction',
        auction_id: effectiveAuctionId,
        buyer_id: userId,
        seller_id: effectiveSellerId,
      }
    };

    if (stripeCustomerId) {
      intentParams.customer = stripeCustomerId;
    }

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(intentParams);
    } catch (stripeErr: any) {
      if (reservationCreated) {
        try {
          await adminDb.collection('aml_reservations').doc(reservationId).set({
            status: 'released',
            released_at: new Date().toISOString(),
            release_reason: 'stripe_payment_intent_create_failed'
          }, { merge: true });
        } catch (rErr: any) {
          console.error('Error releasing reservation on Stripe payment intent failure:', rErr.message);
        }
      }
      throw stripeErr;
    }

    if (reservationCreated) {
      try {
        await adminDb.collection('aml_reservations').doc(reservationId).set({
          stripe_payment_intent_id: paymentIntent.id
        }, { merge: true });
      } catch (rErr: any) {
        console.error('Error updating reservation with stripe_payment_intent_id:', rErr.message);
      }
    }

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error: any) {
    console.error("Stripe Payment Intent Error:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/stripe-account-session", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const stripe = getStripe();

    const userDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    const user = userDoc.data();
    let accountId = user?.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true }
        }
      });
      accountId = account.id;
      await adminDb.collection('users').doc(userId).update({ stripe_account_id: accountId });
    }

    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: { enabled: true },
      },
    });

    res.status(200).json({ client_secret: accountSession.client_secret });
  } catch (error: any) {
    console.error("Stripe Account Session Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/stripe-account-link", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { return_url, refresh_url } = req.body || {};
    const targetUserId = userId;
    const stripe = getStripe();

    const userDocRef = adminDb.collection('users').doc(targetUserId);
    const userDoc = await safeGetDoc(userDocRef);
    const user = userDoc.data() || {};

    let targetStripeAccountId = user.stripeAccountId || user.stripe_account_id;
    const isBusiness = user.user_type === 'business' || user.userType === 'business';
    const businessType = isBusiness ? 'company' : 'individual';

    let formattedPhone = undefined;
    if (user.phone) {
      let phone = user.phone.replace(/[^0-9+]/g, '');
      if (phone.startsWith('00')) {
        formattedPhone = '+' + phone.substring(2);
      } else if (phone.startsWith('0')) {
        formattedPhone = '+386' + phone.substring(1);
      } else if (!phone.startsWith('+')) {
        formattedPhone = '+386' + phone;
      } else {
        formattedPhone = phone;
      }
    }

    const accountParams: any = {
      email: user.email,
      business_type: businessType,
      business_profile: {
        url: 'https://drazbe.eu',
        product_description: 'Sodelovanje in prodaja na spletni platformi',
        mcc: '5999',
        support_email: user.email,
        support_phone: formattedPhone || undefined,
        name: isBusiness ? (user.company_name || user.companyName) : `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim() || undefined,
      }
    };

    if (isBusiness) {
      accountParams.company = {
        phone: formattedPhone || undefined,
        name: user.company_name || user.companyName || undefined,
        tax_id: user.tax_number || user.taxNumber || user.tax_id || undefined,
        address: {
          line1: user.company_street || user.companyStreet || user.street || user.address?.street || undefined,
          city: user.company_city || user.companyCity || user.city || user.address?.city || undefined,
          postal_code: user.company_postal_code || user.companyPostalCode || user.postal_code || user.postalCode || user.address?.postcode || undefined,
          country: user.country_code || 'SI'
        }
      };
    } else {
      accountParams.individual = {
        phone: formattedPhone || undefined,
        first_name: user.first_name || user.firstName || undefined,
        last_name: user.last_name || user.lastName || undefined,
        email: user.email || undefined,
        address: {
          line1: user.street || user.address?.street || undefined,
          city: user.city || user.address?.city || undefined,
          postal_code: user.postal_code || user.postalCode || user.address?.postcode || undefined,
          country: user.country_code || 'SI'
        }
      };
    }

    if (!targetStripeAccountId) {
      accountParams.type = 'express';
      accountParams.country = user.country_code || 'SI';
      accountParams.capabilities = {
        transfers: { requested: true }
      };
      accountParams.settings = { payouts: { schedule: { interval: 'manual' } } };

      const account = await stripe.accounts.create(accountParams);
      targetStripeAccountId = account.id;
      await userDocRef.set({ stripeAccountId: targetStripeAccountId }, { merge: true });
    } else {
      if (!user.stripe_onboarding_complete) {
        try {
          await stripe.accounts.update(targetStripeAccountId, accountParams);
        } catch (e: any) {
          console.error("Failed to update existing Stripe account:", e.message);
          try {
            const fallbackParams = { ...accountParams };
            delete fallbackParams.business_type;
            if (e.message.includes('phone')) {
              if (fallbackParams.company) delete fallbackParams.company.phone;
              if (fallbackParams.individual) delete fallbackParams.individual.phone;
              if (fallbackParams.business_profile) delete fallbackParams.business_profile.support_phone;
            }
            await stripe.accounts.update(targetStripeAccountId, fallbackParams);
          } catch (fallbackErr: any) {
            console.error("Fallback update also failed:", fallbackErr.message);
          }
        }
      }
    }

    if (targetStripeAccountId && user.stripe_onboarding_complete) {
      const loginLink = await stripe.accounts.createLoginLink(targetStripeAccountId);
      return res.json({ url: loginLink.url });
    }

    const reqOrigin = req.get('origin') || (req.get('host') ? `${req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http'}://${req.get('host')}` : 'https://www.drazbe.eu');
    const accountLink = await stripe.accountLinks.create({
      account: targetStripeAccountId,
      refresh_url: refresh_url || `${reqOrigin}/stripe-callback.html?stripe=refresh`,
      return_url: return_url || `${reqOrigin}/stripe-callback.html?stripe=success`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (error: any) {
    console.error("Stripe Account Link Error:", error);
    res.status(500).json({ error: error.message || 'Stripe configuration error' });
  }
});

app.post("/api/stripe-check-account-status", async (req, res) => {
  try {
    let userId: string;
    try {
      userId = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const stripe = getStripe();

    const userDocRef = adminDb.collection('users').doc(userId);
    const userDoc = await safeGetDoc(userDocRef);
    const user = userDoc.data() || {};

    let targetStripeAccountId = user.stripeAccountId || user.stripe_account_id;

    if (!targetStripeAccountId) {
      return res.json({ complete: false });
    }

    const account = await stripe.accounts.retrieve(targetStripeAccountId);
    const isComplete = account.details_submitted && account.charges_enabled;

    await userDocRef.set({ stripe_onboarding_complete: isComplete }, { merge: true });

    res.json({ complete: isComplete, account });
  } catch (error: any) {
    console.error("Stripe Check Account Status Error:", error);
    res.status(500).json({ error: error.message || 'Server configuration error' });
  }
});

app.post("/api/payments/wallet-pay-auction", async (req, res) => {
  try {
    let userId: string;
    try {
      userId = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const { auction_id } = req.body || {};
    if (!auction_id) {
      return res.status(400).json({ error: "Manjkajoči podatki" });
    }

    const txId = await adminDb.runTransaction(async (t) => {
      let auction: any = null;
      const auctionRef = adminDb.collection('auctions').doc(auction_id);
      const auctionDoc = await t.get(auctionRef);
      if (auctionDoc.exists) {
        auction = auctionDoc.data();
      } else {
        throw new Error("Dražba ne obstaja");
      }
      
      if (auction.payment_status === 'paid') {
        throw new Error("Ta dražba je že plačana.");
      }

      const winnerId = auction.winner_id || auction.winnerId || auction.highest_bidder;
      const isCaseA = auction.post_auction_status === 'awaiting_payment_1st' && winnerId === userId;
      const isCaseB = auction.post_auction_status === 'offered_2nd' && auction.second_winner_id === userId;

      if (!isCaseA && !isCaseB) {
        throw new Error("Te dražbe ne morete plačati.");
      }

      const buyer_id = userId;
      
      const seller_id = auction.seller_id;
      if (!seller_id) throw new Error("Missing seller info");

      let authoritativePriceInCents = 0;
      if (auction.current_price !== undefined && auction.current_price !== null && auction.current_price !== '') {
        authoritativePriceInCents = parseAmountToCents(auction.current_price);
      } else if (auction.currentBid !== undefined && auction.currentBid !== null && auction.currentBid !== '') {
        authoritativePriceInCents = parseAmountToCents(auction.currentBid);
      } else if (auction.starting_price !== undefined && auction.starting_price !== null && auction.starting_price !== '') {
        authoritativePriceInCents = parseAmountToCents(auction.starting_price);
      }

      if (authoritativePriceInCents <= 0) {
        throw new Error("Invalid auction price");
      }

      const sellerRef = adminDb.collection('users').doc(seller_id);
      const sellerDoc2 = await t.get(sellerRef);
      let sellerTier = 'BASIC';
      let sellerData: any = {};
      if (sellerDoc2.exists) {
         sellerData = sellerDoc2.data() || {};
         sellerTier = sellerData.subscription_tier || 'BASIC';
      }
      const totals = calculateCheckoutTotals(authoritativePriceInCents, sellerTier);
      const finalAmountCents = totals.buyerTotalInCents;

      const buyerRef = adminDb.collection('users').doc(buyer_id);
      const buyerDoc = await t.get(buyerRef);
      const buyerData = buyerDoc.data() || {};
      
      assertAmlLimit(buyerData, finalAmountCents / 100);

      const txId = 'WTX_' + Date.now();

      await recordAmlSpend({
        buyerId: buyer_id,
        amountEur: finalAmountCents / 100,
        uniqueKey: 'wallet_' + txId,
        transaction: t
      });

      // Ensure wallet migration
      const buyerWallet = ensureWalletMigrated(t, buyerRef, buyerData);
      if (buyerWallet.available_cents < finalAmountCents) {
        throw new Error("Ni dovolj sredstev v denarnici");
      }

      // Debit buyer
      t.update(buyerRef, {
        available_cents: FieldValue.increment(-finalAmountCents)
      });
      
      // Ensure seller wallet migration and credit held funds
      ensureWalletMigrated(t, sellerRef, sellerData);
      t.update(sellerRef, {
        held_cents: FieldValue.increment(authoritativePriceInCents) // Seller gets the item price (before platform fee is applied if we assume buyer pays fee? Wait, calculateCheckoutTotals adds platform fee to itemPrice. Actually, seller proceeds is authoritativePriceInCents - totals.platformFeeInCents - totals.vatInCents? Wait, check the original code: it credited `authoritativePriceInCents / 100`. Let's use authoritativePriceInCents)
      });
      
      // Update auction
      t.update(auctionRef, {
        payment_status: 'paid',
        post_auction_status: 'sold',
        status: 'completed',
      });

      t.set(adminDb.collection('transactions').doc(txId), {
        type: 'wallet_payment',
        auction_id,
        buyer_id,
        seller_id,
        amount_total: finalAmountCents / 100, // legacy UI compatibility
        amount_cents: finalAmountCents,
        platform_fee: totals.platformFeeInCents / 100,
        vat_amount: totals.vatInCents / 100,
        vat_rate: 0,
        is_reverse_charge: false,
        currency: 'eur',
        status: 'completed',
        created_at: FieldValue.serverTimestamp()
      });
      
      // Also add wallet ledger entries
      const wtxBuyerId = adminDb.collection('wallet_transactions').doc().id;
      t.set(adminDb.collection('wallet_transactions').doc(wtxBuyerId), {
        transaction_id: wtxBuyerId,
        user_id: buyer_id,
        type: 'wallet_payment',
        amount_cents: finalAmountCents,
        status: 'completed',
        idempotency_key: txId + "_buyer",
        created_at: FieldValue.serverTimestamp()
      });
      
      const wtxSellerId = adminDb.collection('wallet_transactions').doc().id;
      t.set(adminDb.collection('wallet_transactions').doc(wtxSellerId), {
        transaction_id: wtxSellerId,
        user_id: seller_id,
        type: 'hold',
        amount_cents: authoritativePriceInCents,
        status: 'completed',
        auction_id: auction_id,
        idempotency_key: txId + "_seller",
        created_at: FieldValue.serverTimestamp()
      });
      
      return txId;
    });

    res.json({ success: true, transaction_id: txId });
  } catch (error: any) {
    console.error("Wallet pay error:", error);
    res.status(error.statusCode || (error.message?.includes('AML') || error.message?.includes('10.000') ? 400 : 500)).json({ error: error.message || "Napaka" });
  }
});

app.post("/api/payments/wallet-pay-subscription", async (req, res) => {
  try {
    let userId: string;
    try {
      userId = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const { package_id } = req.body || {};
    if (!package_id) {
      return res.status(400).json({ error: "Manjka package_id" });
    }

    const packageIdStr = String(package_id).toLowerCase();
    let amountCents = 0;
    if (packageIdStr.includes('pro')) amountCents = 5000;
    else if (packageIdStr.includes('basic')) amountCents = 2000;
    else {
      return res.status(400).json({ error: "Neznan paket" });
    }

    const idempotencyKey = `sub_wallet_${userId}_${Date.now()}`;
    const txId = await reserveWalletFunds(userId, amountCents, 'wallet_payment', idempotencyKey, {
      package_id,
      type: 'subscription'
    });

    await commitReservedFunds(txId);

    const tierToSet = packageIdStr.includes('pro') ? 'PRO' : 'BASIC';
    await adminDb.collection('users').doc(userId).update({
      subscription_tier: tierToSet,
      subscription_active: true,
      subscription_paid_at: new Date().toISOString()
    });

    console.log('Subscription paid via wallet:', package_id, 'by user:', userId);
    res.json({ success: true, transaction_id: txId, subscription_tier: tierToSet });
  } catch (error: any) {
    console.error("Wallet pay subscription error:", error);
    res.status(500).json({ error: error.message || "Napaka" });
  }
});

app.post("/api/payouts/withdraw", async (req, res) => {
  try {
    let userId: string;
    try {
      userId = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const { amount, return_url, refresh_url } = req.body || {};
    const stripe = getStripe();

    const amountInCents = parseAmountToCents(amount);
    if (amountInCents <= 0) {
       return res.status(400).json({ error: "Invalid payout amount" });
    }

    const userDocRef = adminDb.collection('users').doc(userId);
    const userDoc = await safeGetDoc(userDocRef);
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = userDoc.data() || {};

    let stripeAccountId = user.stripeAccountId || user.stripe_account_id;
    if (!stripeAccountId) {
       return res.status(400).json({ error: "Stripe račun ni povezan" });
    }
    
    // Ensure Stripe account can receive transfers
    const stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
    const payoutsReady = stripeAccount.payouts_enabled || stripeAccount.charges_enabled || (stripeAccount.capabilities && stripeAccount.capabilities.transfers === 'active');
    if (!payoutsReady) {
      return res.status(400).json({ error: "Stripe payouts are not enabled for this account" });
    }

    const idempotencyKey = `withdraw_${userId}_${Date.now()}`;

    // 1. Reserve funds
    let txId: string;
    try {
      txId = await reserveWalletFunds(userId, amountInCents, 'withdrawal', idempotencyKey);
    } catch (e: any) {
      return res.status(400).json({ error: e.message || "Insufficient funds" });
    }

    // 2. Transfer to Connected Account
    try {
      // In test mode, ensure platform balance has sufficient test funds
      await ensurePlatformTestBalance(stripe, amountInCents);

      const transfer = await stripe.transfers.create({
        amount: amountInCents,
        currency: "eur",
        destination: stripeAccountId,
        description: `Izplačilo drazbenik.si za uporabnika ${userId}`
      }, {
        idempotencyKey
      });

      await commitReservedFunds(txId, { stripe_transfer_id: transfer.id });

      const updatedUserDoc = await safeGetDoc(userDocRef);
      const remainingAvailable = updatedUserDoc.data()?.available_cents || 0;

      res.json({
        success: true,
        transfer_id: transfer.id,
        available_cents: remainingAvailable,
        wallet_balance: remainingAvailable / 100
      });
    } catch (transferError: any) {
      console.error("Stripe transfer failed, rolling back reserved funds:", transferError.message);
      await rollbackReservedFunds(txId);

      const safeDiag = formatStripeError(transferError);
      console.warn(`[Withdrawal Diagnostics] Type: ${safeDiag.type || 'none'}, Code: ${safeDiag.code || 'none'}, RequestId: ${safeDiag.requestId || 'none'}`);

      res.status(safeDiag.statusCode || 400).json({
        error: safeDiag.userMessage,
        diagnostics: {
          type: safeDiag.type,
          code: safeDiag.code,
          requestId: safeDiag.requestId
        }
      });
    }
  } catch (error: any) {
    console.error("Payout error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/create-subscription-checkout", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { amount, currency = "eur", package_id, return_url } = req.body || {};
    const stripe = getStripe();

    const packageIdStr = (package_id || '').toLowerCase();
    let finalAmountCents = 0;
    if (packageIdStr.includes('pro')) {
       finalAmountCents = 5000;
    } else if (packageIdStr.includes('basic')) {
       finalAmountCents = 2000;
    } else {
       finalAmountCents = parseAmountToCents(amount);
    }

    if (finalAmountCents <= 0) {
      return res.status(400).json({ error: "Invalid subscription payment amount" });
    }

    let customerId: string | undefined = undefined;
    const userDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    if (userDoc.exists()) {
      const cId = await getOrCreateStripeCustomer(stripe, userId, userDoc.data());
      if (cId) customerId = cId;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_update: { name: 'auto', address: 'auto' },
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: `Naročnina - Paket ${package_id || 'Premium'}`,
          },
          unit_amount: finalAmountCents,
        },
        quantity: 1,
      }],
      metadata: {
        type: 'subscription',
        user_id: userId,
        package_id: package_id || '',
        amount: finalAmountCents.toString()
      },
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          type: 'subscription',
          user_id: userId,
          package_id: package_id || '',
          amount: finalAmountCents.toString()
        }
      },
      mode: 'payment',
      success_url: return_url && return_url.includes('/stripe-callback.html')
        ? `${return_url}?payment=success&type=subscription&session_id={CHECKOUT_SESSION_ID}`
        : `${return_url || 'https://www.drazbe.eu'}${return_url && return_url.includes('?') ? '&' : '?'}payment=success&type=subscription&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: return_url && return_url.includes('/stripe-callback.html')
        ? `${return_url}?payment=cancel`
        : `${return_url || 'https://www.drazbe.eu'}${return_url && return_url.includes('?') ? '&' : '?'}payment=cancel`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Subscription Checkout Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sync-user-subscription", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const targetUserId = userId;

    const userDocRef = adminDb.collection('users').doc(targetUserId);
    const userDoc = await safeGetDoc(userDocRef);
    if (!userDoc.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const stripe = getStripe();
    if (!stripe) {
      return res.json({ synced: false, reason: "Stripe not initialized" });
    }

    const now = new Date();
    const currentTier = (userData.subscription_tier || userData.subscription || '').toUpperCase();
    const isActive = userData.subscription_active === true;
    const validUntilStr = userData.subscription_valid_until;
    const isValid = validUntilStr ? new Date(validUntilStr) > now : false;

    // Če ima uporabnik že veljavno naročnino PRO ali BASIC, ki še traja v prihodnosti
    if (isActive && isValid && currentTier && currentTier !== 'FREE') {
      return res.json({
        success: true,
        synced: false,
        already_active: true,
        subscription_tier: currentTier,
        subscription_valid_until: validUntilStr,
      });
    }

    const customerId = userData.stripe_customer_id || userData.stripeCustomerId;
    const userEmail = (userData.email || '').toLowerCase().trim();

    let matchingSession: Stripe.Checkout.Session | null = null;

    try {
      // 1. Preišči Stripe seje po kupcu, če obstaja
      if (customerId) {
        const customerSessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 20 });
        for (const sess of customerSessions.data) {
          if (sess.payment_status === 'paid' || sess.status === 'complete') {
            const sessDate = new Date(sess.created * 1000);
            const ageInDays = (now.getTime() - sessDate.getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays <= 35) {
              const isSub = sess.metadata?.type === 'subscription' || sess.amount_total === 2000 || sess.amount_total === 5000 || sess.mode === 'subscription';
              if (isSub) {
                matchingSession = sess;
                break;
              }
            }
          }
        }
      }

      // 2. Preišči splošne Stripe seje za ujemanje po e-pošti ali userId
      if (!matchingSession) {
        const recentSessions = await stripe.checkout.sessions.list({ limit: 40 });
        for (const sess of recentSessions.data) {
          if (sess.payment_status === 'paid' || sess.status === 'complete') {
            const sessDate = new Date(sess.created * 1000);
            const ageInDays = (now.getTime() - sessDate.getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays <= 35) {
              const sessEmail = (sess.customer_details?.email || sess.customer_email || '').toLowerCase().trim();
              const sessUid = sess.metadata?.user_id || sess.metadata?.buyer_id || sess.client_reference_id;

              const isMatch = (sessUid && sessUid === targetUserId) ||
                              (userEmail && sessEmail && sessEmail === userEmail) ||
                              (customerId && sess.customer === customerId);

              if (isMatch) {
                const isSub = sess.metadata?.type === 'subscription' || sess.amount_total === 2000 || sess.amount_total === 5000 || sess.mode === 'subscription';
                if (isSub) {
                  matchingSession = sess;
                  break;
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn("[sync-user-subscription] Error searching Stripe checkout sessions:", err.message);
    }

    if (matchingSession) {
      let tier = (matchingSession.metadata?.package_id || matchingSession.metadata?.tier || matchingSession.metadata?.planId || '').toUpperCase();
      if (!tier || (!tier.includes('PRO') && !tier.includes('BASIC'))) {
        tier = matchingSession.amount_total === 5000 ? 'PRO' : 'BASIC';
      }

      const paidDate = new Date(matchingSession.created * 1000);
      const validUntil = new Date(paidDate);
      validUntil.setMonth(validUntil.getMonth() + 1);

      const updateData: any = {
        subscription_tier: tier,
        subscription: tier,
        subscription_active: true,
        subscription_paid_at: paidDate.toISOString(),
        subscription_started_at: paidDate.toISOString(),
        subscription_cycle_started_at: paidDate.toISOString(),
        subscription_valid_until: validUntil.toISOString(),
        subscription_canceled: false,
        stripe_checkout_session_id: matchingSession.id,
      };

      if (matchingSession.customer) {
        updateData.stripe_customer_id = typeof matchingSession.customer === 'string' ? matchingSession.customer : (matchingSession.customer as any).id;
      }
      if (matchingSession.subscription) {
        updateData.stripe_subscription_id = typeof matchingSession.subscription === 'string' ? matchingSession.subscription : (matchingSession.subscription as any).id;
      }

      await userDocRef.set(updateData, { merge: true });
      console.log(`[sync-user-subscription] Successfully synced user ${targetUserId} to ${tier}`);

      return res.json({
        success: true,
        synced: true,
        subscription_tier: tier,
        subscription_active: true,
        subscription_valid_until: validUntil.toISOString(),
      });
    }

    // 3. Dodatno preveri PaymentIntents za primer neposrednih plačil
    try {
      const recentPIs = await stripe.paymentIntents.list({ limit: 40 });
      for (const pi of recentPIs.data) {
        if (pi.status === 'succeeded') {
          const piDate = new Date(pi.created * 1000);
          const ageInDays = (now.getTime() - piDate.getTime()) / (1000 * 60 * 60 * 24);
          if (ageInDays <= 35) {
            const piEmail = (pi.receipt_email || '').toLowerCase().trim();
            const piUid = pi.metadata?.user_id || pi.metadata?.buyer_id;

            const isMatch = (piUid && piUid === targetUserId) ||
                            (userEmail && piEmail && piEmail === userEmail) ||
                            (customerId && pi.customer === customerId);

            const isSub = pi.metadata?.type === 'subscription' || pi.amount === 2000 || pi.amount === 5000;

            if (isMatch && isSub) {
              const tier = (pi.metadata?.package_id || (pi.amount === 5000 ? 'PRO' : 'BASIC')).toUpperCase();
              const validUntil = new Date(piDate);
              validUntil.setMonth(validUntil.getMonth() + 1);

              const updateData: any = {
                subscription_tier: tier,
                subscription: tier,
                subscription_active: true,
                subscription_paid_at: piDate.toISOString(),
                subscription_started_at: piDate.toISOString(),
                subscription_cycle_started_at: piDate.toISOString(),
                subscription_valid_until: validUntil.toISOString(),
                subscription_canceled: false,
                stripe_payment_intent_id: pi.id,
              };

              if (pi.customer) {
                updateData.stripe_customer_id = typeof pi.customer === 'string' ? pi.customer : (pi.customer as any).id;
              }

              await userDocRef.set(updateData, { merge: true });
              console.log(`[sync-user-subscription] Successfully synced user ${targetUserId} from PI to ${tier}`);

              return res.json({
                success: true,
                synced: true,
                subscription_tier: tier,
                subscription_active: true,
                subscription_valid_until: validUntil.toISOString(),
              });
            }
          }
        }
      }
    } catch (piErr: any) {
      console.warn("[sync-user-subscription] Error searching PaymentIntents:", piErr.message);
    }

    return res.json({ success: true, synced: false, message: "Ni najdenih neobdelanih plačil na Stripe." });
  } catch (error: any) {
    console.error("Error in sync-user-subscription:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/create-verification-session", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const targetUserId = userId;
    const stripe = getStripe();

    let user: any = null;
    const userDoc = await safeGetDoc(adminDb.collection('users').doc(targetUserId));
    if (userDoc.exists()) {
      user = userDoc.data();
    }

    const formattedPhone = user?.phone ? formatE164Phone(user.phone, user.country_code || 'SI') : undefined;

    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      options: {
        document: {
          require_id_number: true,
          require_matching_selfie: true,
        },
      },
      provided_details: {
        ...(user?.email ? { email: user.email.trim() } : {}),
        ...(formattedPhone ? { phone: formattedPhone } : {}),
      },
      metadata: {
        user_id: targetUserId || '',
      }
    });
    res.json({ clientSecret: session.client_secret });
  } catch (error: any) {
    console.error("Stripe Identity error:", error);
    res.status(500).json({ error: error.message });
  }
});

// TEST / DIAGNOSTIC ENDPOINTS
app.post("/api/test/send-email", async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_ROUTES !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  const adminUids = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!adminUids.includes(userId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return res.status(500).json({
        error: "RESEND_API_KEY is missing",
        message: "RESEND_API_KEY environment variable is not defined in the server environment.",
        resendConfigured: false
      });
    }

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
    const {
      toEmail,
      type = 'outbid',
      recipientName = "Testni Uporabnik",
      auctionId = "test-auction-123",
      auctionTitle = "Industrijski CNC obdelovalni center Haas VF-2",
      currentPrice = 1250,
      auctionImageUrl = "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800&auto=format&fit=crop&q=60",
    } = body;

    if (!toEmail) {
      return res.status(400).json({ error: "E-poštni naslov prejemnika (toEmail) je obvezen." });
    }

    let sendResult: any = null;

    if (type === 'outbid') {
      sendResult = await sendOutbidNotification({
        toEmail,
        recipientName,
        auctionId,
        auctionTitle,
        newPrice: currentPrice,
        auctionImageUrl,
      });
    } else if (type === 'ending_soon') {
      sendResult = await sendEndingSoonNotification({
        toEmail,
        recipientName,
        auctionId,
        auctionTitle,
        currentPrice,
        auctionImageUrl,
        endTimeFormatted: "čez 28 minut (danes ob 18:00)",
      });
    } else if (type === 'won') {
      sendResult = await sendAuctionWonNotification({
        toEmail,
        recipientName,
        auctionId,
        auctionTitle,
        winningPrice: currentPrice,
        paymentDeadlineFormatted: "48 ur (v roku 2 dni)",
        auctionImageUrl,
      });
    } else if (type === 'payment_reminder') {
      sendResult = await sendPaymentReminderNotification({
        toEmail,
        recipientName,
        auctionId,
        auctionTitle,
        amount: currentPrice,
        paymentDeadlineFormatted: "čez 2 uri (danes ob 18:00)",
        auctionImageUrl,
      });
    } else if (type === 'receipt_invoice') {
      const fee = calculateMarginalPlatformFee(currentPrice, 'PRO');
      const mockTransaction = {
        id: `TX-${Date.now().toString().substring(6)}`,
        amount_total: currentPrice,
        platform_fee: fee,
        vat_amount: Math.round(fee * 0.22 * 100) / 100,
        vat_rate: 22,
        is_reverse_charge: false,
        status: 'completed'
      };
      const mockBuyer = {
        first_name: recipientName.split(' ')[0] || 'Janez',
        last_name: recipientName.split(' ')[1] || 'Novak',
        email: toEmail,
        address: 'Dunajska cesta 156, 1000 Ljubljana',
        user_type: 'individual'
      };
      const mockSeller = {
        company_name: 'Dizain d.o.o. (Testni prodajalec)',
        address: 'Karantanska ulica 28, 2000 Maribor',
        tax_id: 'SI57008060',
        company_status: 'company'
      };
      const mockAuction = {
        id: auctionId,
        title: { SLO: auctionTitle, EN: auctionTitle },
        currentBid: currentPrice
      };

      const invoiceBuffer = await generateInvoicePDF(mockTransaction, mockBuyer, mockSeller, mockAuction, 'RAC-TEST-000001', 'PROV-TEST-000001');
      const attachments = [
        { filename: `racun_${mockTransaction.id}.pdf`, content: invoiceBuffer },
      ];

      const resendClient = new Resend(resendApiKey);
      const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
      const htmlContent = await render(React.createElement(AuctionEmailTemplate, {
        type: 'payment_success',
        recipientName: recipientName || 'Uporabnik',
        auctionTitle: auctionTitle,
        currentPrice: currentPrice,
        auctionUrl: `${baseAppUrl}/?drazba=${auctionId}`,
        settingsUrl: `${baseAppUrl}/?tab=settings`,
      }));

      const emailResponse = await resendClient.emails.send({
        from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
        to: toEmail,
        subject: `🧾 Potrdilo o plačilu in račun: ${auctionTitle} - dražbenik.si`,
        html: htmlContent,
        attachments
      });

      if (emailResponse.error) {
        sendResult = { success: false, error: emailResponse.error.message };
      } else {
        sendResult = { success: true, messageId: emailResponse.data?.id };
      }
    } else {
      return res.status(400).json({ error: "Neznan tip e-poštnega obvestila." });
    }

    if (sendResult && sendResult.success === false) {
      return res.status(400).json({
        success: false,
        error: sendResult.error || "Napaka pri pošiljanju e-pošte preko Resend API.",
        type,
        toEmail,
        details: sendResult,
        resendConfigured: true
      });
    }

    return res.json({
      success: true,
      type,
      toEmail,
      timestamp: new Date().toISOString(),
      details: sendResult,
      resendConfigured: true
    });
  } catch (error: any) {
    console.error("Email send error:", error);
    return res.status(500).json({
      error: error.message || "Nepričakovana napaka pri pošiljanju e-maila",
      stack: error.stack
    });
  }
});

app.post("/api/test/generate-pdf", async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_ROUTES !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  const adminUids = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!adminUids.includes(userId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const {
      relationshipType = "company_individual",
      sellerData = {},
      buyerData = {},
      itemTitle = "Paket orodja DeWalt (Komplet)",
      itemPrice = 1200,
      docType = "invoice",
      transaction: customTx,
      buyer: customBuyer,
      seller: customSeller,
      auction: customAuction,
      salesInvoiceNo,
      commissionInvoiceNo
    } = req.body;

    const mockTx = customTx || {
      id: `TX-${Date.now().toString().substring(5)}`,
      amount_total: Number(itemPrice),
      platform_fee: Math.round(Number(itemPrice) * 0.10 * 100) / 100,
      vat_amount: Math.round(Number(itemPrice) * 0.10 * 0.22 * 100) / 100,
      fee_total: Math.round(Number(itemPrice) * 0.10 * 1.22 * 100) / 100,
      vat_rate: 22,
      is_reverse_charge: relationshipType === 'company_company',
      status: 'completed',
      paid_at: new Date().toISOString()
    };

    const mockAuction = customAuction || {
      id: `AUCT-${Date.now().toString().substring(6)}`,
      title: { SLO: itemTitle, EN: itemTitle },
      currentBid: Number(itemPrice),
      delivery_method: 'pickup'
    };

    let seller: any = customSeller ? { ...customSeller } : { ...sellerData };
    let buyer: any = customBuyer ? { ...customBuyer } : { ...buyerData };

    if (!customSeller) {
      if (relationshipType === 'individual_individual') {
        seller = {
          first_name: sellerData.first_name || 'Marko',
          last_name: sellerData.last_name || 'Horvat',
          address: sellerData.address || 'Celjska cesta 42, 3000 Celje',
          company_status: 'individual',
          user_type: 'individual'
        };
      } else if (relationshipType === 'individual_company') {
        seller = {
          first_name: sellerData.first_name || 'Janez',
          last_name: sellerData.last_name || 'Kranjc',
          address: sellerData.address || 'Cesta v Gorice 14, 1000 Ljubljana',
          company_status: 'individual',
          user_type: 'individual'
        };
      } else {
        seller = {
          company_name: sellerData.company_name || 'AvtoCenter d.o.o.',
          tax_id: sellerData.tax_id || 'SI 12345678',
          registration_number: sellerData.registration_number || '8876543000',
          address: sellerData.address || 'Tržaška cesta 14, 2000 Maribor',
          company_status: 'company',
          user_type: 'business'
        };
      }
    }

    if (!customBuyer) {
      if (relationshipType === 'company_company' || relationshipType === 'individual_company') {
        buyer = {
          company_name: buyerData.company_name || 'TechTrade d.o.o.',
          tax_id: buyerData.tax_id || 'SI 87654321',
          registration_number: buyerData.registration_number || '9988776000',
          address: buyerData.address || 'Letališka cesta 33, 1000 Ljubljana',
          company_status: 'company',
          user_type: 'business'
        };
      } else {
        buyer = {
          first_name: buyerData.first_name || 'Marko',
          last_name: buyerData.last_name || 'Novak',
          address: buyerData.address || 'Dunajska cesta 105, 1000 Ljubljana',
          company_status: 'individual',
          user_type: 'individual'
        };
      }
    }

    let pdfBuffer: Buffer;
    let filename: string;

    const sInvNo = salesInvoiceNo || `RAČ-${new Date().getFullYear()}-${mockAuction.id.substring(mockAuction.id.length - 5).toUpperCase()}`;
    const cInvNo = commissionInvoiceNo || `PROV-${new Date().getFullYear()}-${mockTx.id.substring(mockTx.id.length - 5).toUpperCase()}`;

    if (docType === 'certificate') {
      pdfBuffer = await generateCertificatePDF(mockTx, buyer, seller);
      filename = `Potrdilo_${mockTx.id}.pdf`;
    } else {
      pdfBuffer = await generateInvoicePDF(mockTx, buyer, seller, mockAuction, sInvNo, cInvNo);
      filename = `Racun_${sInvNo}.pdf`;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("Test generate-pdf error:", err);
    res.status(500).json({ error: err.message || "Napaka pri generiranju testnega PDF" });
  }
});

app.post("/api/test/test-payout", async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_ROUTES !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  const adminUids = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!adminUids.includes(userId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { amount = 50, executeReal = false } = req.body || {};
    const amountInCents = parseAmountToCents(amount);

    if (amountInCents <= 0) {
      return res.status(400).json({ error: "Znesek izplačila mora biti večji od 0." });
    }

    const userDocRef = adminDb.collection('users').doc(userId);
    const userDoc = await safeGetDoc(userDocRef);
    if (!userDoc.exists()) {
      return res.status(404).json({ error: "Uporabnik ne obstaja v bazi." });
    }
    const userData = userDoc.data() || {};
    const wallet = await getUserWallet(userId);
    const stripe = getStripe();

    const diag = await diagnoseStripeTransferPrerequisites(stripe, userData, amountInCents);
    const logs: string[] = [
      `[1] Preverjanje uporabnika: ${userData.first_name || ''} ${userData.last_name || userData.username || userId} (ID: ${userId})`,
      `[2] Trenutno razpoložljivo stanje v denarnici: ${(wallet.available_cents / 100).toFixed(2)} € (${wallet.available_cents} centov)`,
      `[3] Zahtevan znesek izplačila: ${(amountInCents / 100).toFixed(2)} € (${amountInCents} centov)`,
      ...diag.logs
    ];

    const hasSufficientBalance = wallet.available_cents >= amountInCents;
    logs.push(`[*] Preverjanje stanja denarnice: ${hasSufficientBalance ? 'DA (Zadostno dobroimetje)' : 'NE (Nezadostno dobroimetje)'}`);

    if (executeReal) {
      if (!hasSufficientBalance) {
        logs.push(`[X] Prekinitev: Sredstva v denarnici niso zadostna.`);
        return res.status(400).json({
          success: false,
          error: "Nezadostno stanje v denarnici za izvedbo izplačila.",
          logs,
          diagnostics: diag.details
        });
      }

      if (!diag.ready) {
        logs.push(`[X] Prekinitev: Zahteve Stripe Connect računa niso izpolnjene.`);
        return res.status(400).json({
          success: false,
          error: diag.issues[0] || "Stripe račun ni pripravljen za izplačilo.",
          logs,
          diagnostics: diag.details
        });
      }

      const stripeAccountId = userData.stripeAccountId || userData.stripe_account_id;
      const idempotencyKey = `test_payout_${userId}_${Date.now()}`;

      // Reserve funds in wallet
      logs.push(`[->] Rezervacija sredstev v denarnici (${amountInCents} centov)...`);
      let txId: string;
      try {
        txId = await reserveWalletFunds(userId, amountInCents, 'withdrawal', idempotencyKey, {
          description: `Testno izplačilo preko Stripe Connect (${(amountInCents / 100).toFixed(2)} €)`,
          environment: 'sandbox'
        });
        logs.push(`[OK] Sredstva uspešno rezervirana (ID transakcije: ${txId})`);
      } catch (reserveErr: any) {
        logs.push(`[X] Rezervacija ni uspela: ${reserveErr.message}`);
        return res.status(400).json({ success: false, error: reserveErr.message, logs });
      }

      // Ensure platform balance in test mode
      await ensurePlatformTestBalance(stripe, amountInCents);

      // Perform Stripe transfer
      logs.push(`[->] Izvajanje Stripe Connect transferja na račun ${stripeAccountId}...`);
      try {
        const transfer = await stripe.transfers.create({
          amount: amountInCents,
          currency: "eur",
          destination: stripeAccountId,
          description: `Testno izplačilo drazbenik.si za ${userId}`
        }, {
          idempotencyKey
        });

        logs.push(`[OK] Stripe transfer uspešno izveden! ID nakazila: ${transfer.id}`);

        // Commit reserved funds
        await commitReservedFunds(txId, {
          stripe_transfer_id: transfer.id,
          status: 'completed'
        });
        logs.push(`[OK] Knjiženje v denarnici potrjeno. Transakcija zaključena.`);

        const updatedWallet = await getUserWallet(userId);
        logs.push(`[=] Novo razpoložljivo stanje v denarnici: ${(updatedWallet.available_cents / 100).toFixed(2)} €`);

        return res.json({
          success: true,
          simulation: false,
          transfer_id: transfer.id,
          requestedAmount: amountInCents / 100,
          previousBalance: wallet.available_cents / 100,
          newBalance: updatedWallet.available_cents / 100,
          available_cents: updatedWallet.available_cents,
          logs,
          diagnostics: diag.details
        });
      } catch (transferErr: any) {
        logs.push(`[X] Stripe transfer ni uspel: ${transferErr.message}`);
        await rollbackReservedFunds(txId);
        logs.push(`[!] Rezervirana sredstva vrnjena v denarnico uporabnika (rollback).`);

        const safeErr = formatStripeError(transferErr);
        logs.push(`[Diagnoza] Koda napake: ${safeErr.code || safeErr.type || 'neznana'}, Sporočilo: ${safeErr.userMessage}`);

        return res.status(400).json({
          success: false,
          error: safeErr.userMessage,
          logs,
          diagnostics: {
            ...diag.details,
            stripeError: safeErr
          }
        });
      }
    } else {
      logs.push(`[7] Način simulacije: Denarnica ni bila zmanjšana in Stripe transfer ni bil sprožen.`);
      logs.push(`[8] Vklopi stikalo 'Izvedi pravo izplačilo' za dejansko nakazilo preko Stripe Connect.`);

      return res.json({
        success: true,
        simulation: true,
        requestedAmount: amountInCents / 100,
        previousBalance: wallet.available_cents / 100,
        newBalance: wallet.available_cents / 100,
        available_cents: wallet.available_cents,
        stripeAccountStatus: diag.ready ? 'ready' : (diag.details.stripeAccountId ? 'onboarding_required' : 'missing'),
        logs,
        diagnostics: diag.details
      });
    }
  } catch (err: any) {
    console.error("Test payout error:", err);
    res.status(500).json({ error: err.message || "Napaka pri testnem izplačilu" });
  }
});

app.post("/api/test/add-test-funds", async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_ROUTES !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  const adminUids = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!adminUids.includes(userId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY || '';
    if (!stripeKey.startsWith('sk_test_')) {
      return res.status(400).json({ error: "Ta funkcija je na voljo le v testnem načinu (Stripe Sandbox)." });
    }

    const { amount = 100 } = req.body || {};
    const amountInCents = parseAmountToCents(amount);
    if (amountInCents <= 0) {
      return res.status(400).json({ error: "Znesek mora biti večji od 0" });
    }

    const stripe = getStripe();
    const clientKey = req.body?.idempotencyKey || `pi_test_${Date.now()}`;
    const stripeIdempotencyKey = `stripe_pi_test_funding_${userId}_${clientKey}`;

    // 1. Create and confirm real Stripe test PaymentIntent with official test card pm_card_visa
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "eur",
      payment_method: "pm_card_visa",
      confirm: true,
      return_url: "https://drazbe.eu/test-sandbox",
      payment_method_types: ['card'],
      description: "Platform test balance funding",
      metadata: {
        purpose: "test_wallet_funding",
        user_id: userId,
        environment: "test"
      }
    }, {
      idempotencyKey: stripeIdempotencyKey
    });

    console.log(`[test-wallet-funding] userId=${userId} paymentIntentId=${paymentIntent.id} amountCents=${amountInCents} status=${paymentIntent.status}`);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        error: `Stripe testno plačilo ni uspelo (stanje: ${paymentIntent.status})`,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      });
    }

    // 2. Credit the wallet idempotently with real Stripe test deposit
    const result = await creditWalletDepositFromStripe(userId, amountInCents, paymentIntent.id, {
      description: "Platform test balance funding",
      environment: "test",
      idempotencyKey: `wallet_dep_${paymentIntent.id}`
    });

    res.json({
      success: true,
      stripe_payment_intent_id: paymentIntent.id,
      transaction_id: result.transaction_id,
      amount: amountInCents / 100,
      amount_cents: amountInCents,
      newBalance: result.wallet_balance,
      available_cents: result.available_cents,
      wallet_balance: result.wallet_balance,
      already_processed: result.already_processed
    });
  } catch (err: any) {
    console.error("Add test funds error:", err);
    const formatted = formatStripeError(err);
    res.status(500).json({ error: formatted.userMessage || "Napaka pri izvedbi Stripe testnega plačila" });
  }
});

app.post("/api/analyze-receipt", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "No imageUrl provided" });

    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const geminiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: "Analiziraj ta račun iz pošte. Poišči skupni znesek poštnine ali končni znesek za plačilo. Vrni izključno JSON objekt v obliki: {\"shipping_cost\": float, \"currency\": \"EUR\"}. Če zneska ne moreš z gotovostjo razbrati, vrni {\"shipping_cost\": null}." }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const resultText = geminiResponse.text || '{}';
    res.json(JSON.parse(resultText));
  } catch (e: any) {
    console.error("Gemini Vision error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ESCROW, DISPUTES & STRIKES
async function checkAndApplySellerPenalties(seller_id: string) {
  try {
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const snapshot = await safeGetDocs(
      adminDb.collection('seller_strikes').where('user_id', '==', seller_id)
    );
    const recentStrikes = snapshot.docs.filter((d: any) => {
      const data = d.data();
      return data.created_at >= sixMonthsAgo;
    });

    if (recentStrikes.length >= 3) {
      const blockedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await adminDb.collection('users').doc(seller_id).update({
        auction_blocked_until: blockedUntil
      });
      console.log(`Seller ${seller_id} penalized: auctions blocked until ${blockedUntil} due to 3+ strikes.`);
    }
  } catch (e) {
    console.error("Error applying seller penalties:", e);
  }
}

app.post("/api/auctions/create", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { itemData } = req.body;

    // SANITIZACIJA PREDMETOV (XSS PREVENTIVA)
    const sanitizeString = (str: any) => {
      if (typeof str !== 'string') return str;
      return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    };

    if (itemData) {
      if (itemData.title) itemData.title = sanitizeString(itemData.title);
      if (itemData.description) itemData.description = sanitizeString(itemData.description);
      if (itemData.category) itemData.category = sanitizeString(itemData.category);
      if (itemData.region) itemData.region = sanitizeString(itemData.region);
      if (itemData.location) itemData.location = sanitizeString(itemData.location);
      
      // VARNOSTNI PREGLED (SECURITY PATCH): Preprečimo zlonameren vnos občutljivih polj
      delete itemData.winner_id;
      delete itemData.winnerId;
      delete itemData.top_bids;
      delete itemData.bidding_history;
      delete itemData.payment_status;
      delete itemData.post_auction_status;
    }

    const userDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    if (!userDoc.exists()) return res.status(404).json({ error: "Uporabnik ne obstaja" });

    const userData = userDoc.data();
    
    const subTier = userData.subscription_tier || userData.subscription || 'FREE';
    let limit = 5;
    if (subTier === 'BASIC') limit = 50;
    if (subTier === 'PRO') limit = Infinity;

    if (limit !== Infinity && !itemData.id) {
      const now = new Date();
      const firstDayOfMonthMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const userAuctions = await adminDb.collection('auctions')
        .where('seller_id', '==', userId)
        .get();
      
      const monthlyCount = userAuctions.docs.filter(doc => {
        const d = doc.data();
        const createdVal = d.created_at || d.createdAt || d.end_time || d.endTime;
        if (!createdVal) return false;
        return new Date(createdVal).getTime() >= firstDayOfMonthMs;
      }).length;

      if (monthlyCount >= limit) {
        return res.status(403).json({ error: `Dosegli ste mesečno omejitev objav za vaš naročniški paket (${limit}). Prosimo, nadgradite paket.` });
      }
    }

    if (userData.auction_blocked_until) {
      const blockedUntil = new Date(userData.auction_blocked_until);
      if (blockedUntil > new Date()) {
        return res.status(403).json({ error: `Objavljanje novih dražb vam je onemogočeno do ${blockedUntil.toLocaleDateString()} zaradi večkratnih kršitev roka za odpošiljanje predmeta.` });
      }
    }

    const newDocRef = itemData.id ? adminDb.collection('auctions').doc(itemData.id) : adminDb.collection('auctions').doc();

    await newDocRef.set({
      ...itemData,
      id: newDocRef.id,
      seller_id: userId,
      status: "active",
      created_at: itemData.created_at || itemData.createdAt || new Date().toISOString()
    }, { merge: true });

    res.json({ success: true, id: newDocRef.id });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const handleProcessShippingDeadlines = async (req: express.Request, res: express.Response) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const now = new Date().toISOString();
    const snapshot = await safeGetDocs(
      adminDb.collection('transactions').where('status', '==', 'HELD_IN_ESCROW')
    );
    let processed = 0;

    for (const docSnap of snapshot.docs) {
      const tx = docSnap.data();
      if (tx.delivery_method !== 'POSTAL_DELIVERY') continue;

      let deadline = tx.shipping_deadline;
      if (!deadline && tx.paid_at) {
        deadline = new Date(new Date(tx.paid_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }

      if (deadline && now >= deadline) {
        // Cancel order
        await docSnap.ref.update({
          status: 'CANCELLED',
          cancelled_reason: 'SELLER_NO_SHIPMENT',
          updated_at: now
        });

        // Refund buyer from held funds
        const refundAmount = Number(tx.amount_total || tx.amount);
        const refundCents = Math.round(refundAmount * 100);
        await adminDb.runTransaction(async (t) => {
          const sellerRef = adminDb.collection('users').doc(tx.seller_id);
          const buyerRef = adminDb.collection('users').doc(tx.buyer_id);
          
          t.update(sellerRef, { held_cents: FieldValue.increment(-refundCents) });
          t.update(buyerRef, { available_cents: FieldValue.increment(refundCents) });
          
          const txRef = adminDb.collection('wallet_transactions').doc();
          t.set(txRef, {
             transaction_id: txRef.id,
             user_id: tx.buyer_id,
             type: 'refund',
             amount_cents: refundCents,
             status: 'completed',
             idempotency_key: 'refund_' + docSnap.id,
             created_at: FieldValue.serverTimestamp()
          });
        });

        // Add seller strike
        await adminDb.collection('seller_strikes').add({
          user_id: tx.seller_id,
          order_id: docSnap.id,
          reason: 'NO_SHIPMENT_IN_7_DAYS',
          created_at: now
        });

        const sellerDocInfo = await safeGetDoc(adminDb.collection('users').doc(tx.seller_id));
        if (sellerDocInfo.exists()) {
          const existingNotes = sellerDocInfo.data().system_notes || [];
          await adminDb.collection('users').doc(tx.seller_id).update({
            system_notes: [...existingNotes, `Naročilo preklicano – predmet ni bil poslan v 7 dneh (Naročilo: ${docSnap.id})`]
          });
        }

        await checkAndApplySellerPenalties(tx.seller_id);
        processed++;
      }
    }

    res.json({ success: true, processed });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

app.get("/api/cron/process-shipping-deadlines", handleProcessShippingDeadlines);
app.post("/api/cron/process-shipping-deadlines", handleProcessShippingDeadlines);

app.post("/api/orders/:id/verify-pickup-pin", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { id } = req.params;
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: "Manjka PIN." });

    const txRef = adminDb.collection('transactions').doc(id);
    const txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });

    const tx = txDoc.data();
    // Nur der Verkaeufer der Bestellung darf den Abhol-PIN verifizieren
    if (tx.seller_id !== userId) return res.status(403).json({ error: "Nimate pravic za to naročilo." });
    if (tx.status !== 'HELD_IN_ESCROW') return res.status(400).json({ error: "Naročilo ni v stanju HELD_IN_ESCROW." });
    if (tx.pickup_pin !== pin) return res.status(400).json({ error: "Napačen PIN." });

    await txRef.update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString()
    });

    const releaseAmount = Number(tx.amount_total || tx.amount) - Number(tx.platform_fee || 0) - Number(tx.vat_amount || 0);
    const releaseCents = Math.round(releaseAmount * 100);
    const tx_id = id;
    const auction_id = tx.auction_id || '';
    await releaseHeldFunds(userId, releaseCents, 'release_' + tx_id, { auction_id, related_tx: tx_id });

    res.json({ success: true, message: "Prevzem potrjen, sredstva so bila sproščena." });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/orders/:id/mark-as-shipped", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { id } = req.params;
    const { carrier_name, tracking_number } = req.body || {};

    const txRef = adminDb.collection('transactions').doc(id);
    const txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });

    const tx = txDoc.data();
    // Nur der Verkaeufer der Bestellung darf diese als versendet markieren
    if (tx.seller_id !== userId) return res.status(403).json({ error: "Nimate pravic." });
    if (tx.status !== 'HELD_IN_ESCROW') return res.status(400).json({ error: "Napačno stanje naročila." });

    const amount = Number(tx.amount_total || tx.amount);
    if (amount > 15 && !tracking_number) {
      return res.status(400).json({ error: "Za zneske nad 15 € je obvezen vnos sledilne številke." });
    }

    await txRef.update({
      status: 'SHIPPED',
      carrier_name: carrier_name || 'Neznano',
      tracking_number: tracking_number || null,
      shipped_at: new Date().toISOString()
    });

    res.json({ success: true, message: "Označeno kot poslano." });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/orders/:id/mark-as-delivered", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { id } = req.params;

    const txRef = adminDb.collection('transactions').doc(id);
    const txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });

    const tx = txDoc.data();
    // Nur der Kaeufer der Bestellung darf die Lieferung bestaetigen
    if (tx.buyer_id !== userId) return res.status(403).json({ error: "Nimate pravic." });
    if (tx.status !== 'SHIPPED') return res.status(400).json({ error: "Naročilo mora biti poslano." });

    const now = new Date();
    const autoCompleteDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    await txRef.update({
      status: 'DELIVERED',
      delivered_at: now.toISOString(),
      auto_complete_at: autoCompleteDate.toISOString()
    });

    res.json({ success: true, message: "Označeno kot dostavljeno. Samodejna potrditev nastavljena na " + autoCompleteDate.toLocaleString() });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const handleProcessEscrowCompletions = async (req: express.Request, res: express.Response) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const now = new Date().toISOString();
    const snapshot = await safeGetDocs(
      adminDb.collection('transactions')
        .where('status', '==', 'DELIVERED')
        .where('auto_complete_at', '<=', now)
    );
    let processed = 0;

    for (const docSnap of snapshot.docs) {
      const tx = docSnap.data();
      if (tx.status === 'DISPUTED') continue;

      await docSnap.ref.update({
        status: 'COMPLETED',
        completed_at: now
      });

      const releaseAmount = Number(tx.amount_total || tx.amount) - Number(tx.platform_fee || 0) - Number(tx.vat_amount || 0);
      const releaseCents = Math.round(releaseAmount * 100);
      await releaseHeldFunds(tx.seller_id, releaseCents, 'cron_release_' + tx.id, { auction_id: tx.auction_id, related_tx: tx.id });
      processed++;
    }

    res.json({ success: true, processed });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

app.get("/api/cron/process-escrow-completions", handleProcessEscrowCompletions);
app.post("/api/cron/process-escrow-completions", handleProcessEscrowCompletions);

app.post("/api/orders/:id/open-dispute", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 1000) {
      return res.status(400).json({ error: "Razlog za spor mora vsebovati med 10 in 1000 znakov." });
    }
    const trimmedReason = reason.trim();

    const txRef = adminDb.collection('transactions').doc(id);
    const txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });

    const tx = txDoc.data();
    // Nur der Kaeufer der Bestellung darf einen Streitfall eroeffnen
    if (tx.buyer_id !== userId) return res.status(403).json({ error: "Nimate pravic." });
    if (tx.status !== 'SHIPPED' && tx.status !== 'DELIVERED') {
      return res.status(400).json({ error: "Spor lahko odprete samo po tem, ko je izdelek poslan ali dostavljen." });
    }

    if (tx.status === 'DELIVERED' && tx.auto_complete_at && new Date(tx.auto_complete_at) < new Date()) {
      return res.status(400).json({ error: "Rok za odprtje spora je potekel (3 dni po dostavi)." });
    }

    await txRef.update({
      status: 'DISPUTED'
    });

    await adminDb.collection('disputes').add({
      order_id: id,
      opened_by_user_id: userId,
      reason: trimmedReason,
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, message: "Spor uspešno odprt." });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// RECAPTCHA V3 VERIFICATION
app.post("/api/auth/verify-captcha", async (req, res) => {
  return res.json({ success: true, score: 1.0 });
});

// AUTH EMAILS

function getAppBaseUrl(_req?: express.Request): string {
  // Use configured APP_URL or fall back to the default platform URL
  return process.env.APP_URL || 'https://drazbe.eu';
}

app.post("/api/auth/send-email-change", async (req, res) => {
  // Authentication required for email change requests
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const userRecord = await adminAuth.getUser(userId);
    const currentEmail = (userRecord.email || '').trim().toLowerCase();

    const { newEmail, displayName } = req.body || {};
    if (!newEmail || typeof newEmail !== 'string') {
      return res.status(400).json({ error: "Manjka nov e-poštni naslov." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanNewEmail = newEmail.trim().toLowerCase();
    if (!emailRegex.test(cleanNewEmail)) {
      return res.status(400).json({ error: "Neveljaven format novega e-poštnega naslova." });
    }

    if (cleanNewEmail === currentEmail) {
      return res.status(400).json({ error: "Nov e-poštni naslov mora biti drugačen od trenutnega." });
    }

    // If another Firebase user already uses this new email, do nothing and return success silently
    try {
      const existingUser = await adminAuth.getUserByEmail(cleanNewEmail);
      if (existingUser && existingUser.uid !== userId) {
        return res.json({ success: true });
      }
    } catch (lookupErr: any) {
      // User not found with new email, proceed normally
    }

    const baseAppUrl = getAppBaseUrl(req);
    const actionUrl = await adminAuth.generateVerifyAndChangeEmailLink(currentEmail, cleanNewEmail, {
      url: `${baseAppUrl}/?tab=settings`
    });

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const htmlContent = await render(React.createElement(AuthEmailTemplate, {
        type: 'verify_email',
        actionUrl,
        recipientName: displayName || userRecord.displayName || cleanNewEmail.split('@')[0],
      }));

      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
        to: cleanNewEmail,
        subject: 'Potrdite spremembo e-poštnega naslova - dražbenik.si',
        html: htmlContent,
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("send-email-change error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/send-verification", async (req, res) => {
  try {
    const { email, displayName } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: "Manjka veljaven e-poštni naslov." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = email.trim().toLowerCase();
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: "Manjka veljaven e-poštni naslov." });
    }

    // Look up user in Firebase Auth without requiring client authentication
    let userRecord: any = null;
    try {
      userRecord = await adminAuth.getUserByEmail(cleanEmail);
    } catch (lookupErr: any) {
      // If user does not exist, return success silently to prevent email enumeration
      return res.json({ success: true });
    }

    if (!userRecord || userRecord.emailVerified) {
      return res.json({ success: true });
    }

    const uid = userRecord.uid;
    const userEmail = userRecord.email || cleanEmail;

    // Rate limiting per user using email_verification_limits/{uid}
    const limitRef = adminDb.collection('email_verification_limits').doc(uid);
    let allowedToSend = false;

    await adminDb.runTransaction(async (t) => {
      const now = new Date();
      const nowIso = now.toISOString();
      const nowMs = now.getTime();
      const limitSnap = await t.get(limitRef);

      if (!limitSnap.exists) {
        t.set(limitRef, {
          last_sent_at: nowIso,
          window_start: nowIso,
          count: 1
        });
        allowedToSend = true;
        return;
      }

      const limitData = limitSnap.data() || {};
      const lastSentMs = limitData.last_sent_at ? new Date(limitData.last_sent_at).getTime() : 0;
      if (nowMs - lastSentMs < 60 * 1000) {
        allowedToSend = false;
        return;
      }

      let windowStartMs = limitData.window_start ? new Date(limitData.window_start).getTime() : 0;
      let count = typeof limitData.count === 'number' ? limitData.count : 0;

      if (nowMs - windowStartMs >= 24 * 60 * 60 * 1000) {
        windowStartMs = nowMs;
        count = 0;
        t.set(limitRef, {
          window_start: nowIso,
          last_sent_at: nowIso,
          count: 1
        }, { merge: true });
        allowedToSend = true;
        return;
      }

      if (count >= 5) {
        allowedToSend = false;
        return;
      }

      t.update(limitRef, {
        count: count + 1,
        last_sent_at: nowIso
      });
      allowedToSend = true;
    });

    if (!allowedToSend) {
      return res.json({ success: true });
    }

    // Generate secure verification token
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = Date.now() + 48 * 60 * 60 * 1000;

    await adminDb.collection('email_verifications').doc(token).set({
      token,
      email: userEmail,
      userId: uid,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      used: false
    });

    await adminDb.collection('users').doc(uid).set({
      verification_token: token,
      verification_token_expires: expiresAt
    }, { merge: true });

    // Send email via Resend if configured
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const baseAppUrl = getAppBaseUrl(req);
      const actionUrl = `${baseAppUrl}/?verify_token=${token}&email=${encodeURIComponent(userEmail)}`;

      const htmlContent = await render(React.createElement(AuthEmailTemplate, {
        type: 'verify_email',
        actionUrl,
        recipientName: displayName || userRecord.displayName || userEmail.split('@')[0],
      }));

      const resend = new Resend(apiKey);
      const fromEmail = process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>';

      await resend.emails.send({
        from: fromEmail,
        to: userEmail,
        subject: 'Potrdite svoj e-poštni naslov - dražbenik.si',
        html: htmlContent,
      });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error("send-verification error:", err);
    return res.json({ success: true });
  }
});

app.post("/api/auth/confirm-email", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: "Manjka veljaven potrditveni žeton." });
    }

    const verificationRef = adminDb.collection('email_verifications').doc(token);

    let alreadyConfirmed = false;
    let isExpired = false;
    let targetUserId = '';
    let targetEmail = '';

    await adminDb.runTransaction(async (t) => {
      const snap = await t.get(verificationRef);
      if (!snap.exists) {
        throw new Error("TOKEN_NOT_FOUND");
      }

      const verification = snap.data() || {};
      targetUserId = verification.userId || '';
      targetEmail = verification.email || '';

      if (verification.used) {
        alreadyConfirmed = true;
        return;
      }

      if (verification.expires_at && verification.expires_at < Date.now()) {
        isExpired = true;
        return;
      }

      t.update(verificationRef, {
        used: true,
        confirmed_at: new Date().toISOString()
      });
    });

    if (alreadyConfirmed) {
      return res.json({ 
        success: true, 
        alreadyConfirmed: true, 
        message: "E-poštni naslov je bil že predhodno potrjen.",
        email: targetEmail
      });
    }

    if (isExpired) {
      return res.status(400).json({ success: false, error: "Povezava za potrditev je potekla. Zahtevajte novo potrditveno povezavo." });
    }

    if (targetUserId) {
      await adminDb.collection('users').doc(targetUserId).set({
        email_verified: true,
        registration_confirmed: true,
        registration_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { merge: true });

      // Synchronize with Firebase Auth if available
      try {
        await adminAuth.updateUser(targetUserId, { emailVerified: true });
      } catch (authErr: any) {
        console.warn("[confirm-email] adminAuth.updateUser notice:", authErr.message);
      }
    }

    return res.json({ 
      success: true, 
      message: "E-poštni naslov je bil uspešno potrjen! Sedaj se lahko prijavite v svoj račun.",
      email: targetEmail
    });
  } catch (err: any) {
    if (err.message === "TOKEN_NOT_FOUND") {
      return res.status(400).json({ success: false, error: "Neveljaven ali neobstoječ potrditveni žeton." });
    }
    console.error("confirm-email error:", err);
    return res.status(500).json({ success: false, error: err.message || "Napaka pri potrditvi e-poštnega naslova." });
  }
});

app.post("/api/auth/send-password-reset", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: "Manjka veljaven e-poštni naslov." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = email.trim().toLowerCase();
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: "Manjka veljaven e-poštni naslov." });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.json({ 
        success: false, 
        fallbackToClient: true, 
        message: "adminAuth ni na voljo za ponastavitev gesla, uporabi Firebase Client SDK." 
      });
    }

    // Verify if user exists without revealing failure reason
    let userRecord: any = null;
    try {
      userRecord = await adminAuth.getUserByEmail(cleanEmail);
    } catch (e: any) {
      // User not found in Firebase Auth; return generic success
      return res.json({ success: true });
    }

    if (!userRecord) {
      return res.json({ success: true });
    }

    let actionUrl: string | null = null;
    const baseAppUrl = getAppBaseUrl(req);
    try {
      actionUrl = await adminAuth.generatePasswordResetLink(cleanEmail, {
        url: `${baseAppUrl}/`
      });
    } catch (authErr: any) {
      return res.json({ success: true });
    }

    if (actionUrl) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const htmlContent = await render(React.createElement(AuthEmailTemplate, {
          type: 'reset_password',
          actionUrl,
          recipientName: userRecord.displayName || cleanEmail.split('@')[0],
        }));

        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
          to: cleanEmail,
          subject: 'Ponastavitev gesla - dražbenik.si',
          html: htmlContent,
        });
      } catch (sendErr: any) {
        console.error("send-password-reset send error:", sendErr);
        return res.json({ success: true });
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error("send-password-reset error:", err);
    return res.json({ success: true });
  }
});

app.post("/api/auth/send-email-changed", async (req, res) => {
  // Authentication required for sending email changed notification
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const userRecord = await adminAuth.getUser(userId);
    const email = userRecord.email;
    if (!email) {
      return res.status(400).json({ error: "User has no email" });
    }

    const baseAppUrl = getAppBaseUrl(req);
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const htmlContent = await render(React.createElement(AuthEmailTemplate, {
        type: 'email_changed',
        actionUrl: `${baseAppUrl}/?tab=settings`,
        recipientName: userRecord.displayName || email.split('@')[0],
      }));

      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
        to: email,
        subject: 'Sprememba e-poštnega naslova - dražbenik.si',
        html: htmlContent,
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("send-email-changed error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/send-mfa-enrollment", async (req, res) => {
  // Authentication required for sending MFA enrollment notification
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const userRecord = await adminAuth.getUser(userId);
    const email = userRecord.email;
    if (!email) {
      return res.status(400).json({ error: "User has no email" });
    }

    const baseAppUrl = getAppBaseUrl(req);
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const htmlContent = await render(React.createElement(AuthEmailTemplate, {
        type: 'mfa_enrollment',
        actionUrl: `${baseAppUrl}/?tab=settings`,
        recipientName: userRecord.displayName || email.split('@')[0],
      }));

      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
        to: email,
        subject: 'Varnostno obvestilo (MFA) - dražbenik.si',
        html: htmlContent,
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("send-mfa-enrollment error:", err);
    res.status(500).json({ error: err.message });
  }
});

export { app };
export default app;


const handleProcessSubscriptionRenewals = async (req: express.Request, res: express.Response) => {
  if (!requireCronSecret(req, res)) return;
  try {

    // 1. Preveri preklicane naročnine, ki jim je poteklo obdobje veljavnosti, in jih vrni na FREE
    const now = new Date();
    try {
      const cancelledUsers = await adminDb.collection('users')
        .where('subscription_canceled', '==', true)
        .get();

      for (const cDoc of cancelledUsers.docs) {
        const cUser = cDoc.data();
        if (cUser.subscription_valid_until) {
          if (now.getTime() >= new Date(cUser.subscription_valid_until).getTime()) {
            await cDoc.ref.set({
              subscription_tier: 'FREE',
              subscription: 'FREE',
              subscription_active: false,
              subscription_canceled: false,
            }, { merge: true });
          }
        }
      }
    } catch (cErr: any) {
      console.warn("Napaka pri pregledu preklicanih naročnin:", cErr.message);
    }

    // 2. Obdelava aktivnih naročnin za samodejno podaljšanje (1 mesec po nakupu)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const usersSnapshot = await adminDb.collection('users')
      .where('subscription_active', '==', true)
      .where('subscription_paid_at', '<=', thirtyDaysAgo.toISOString())
      .get();
      
    let processed = 0;
    const stripe = getStripe();
    
    for (const doc of usersSnapshot.docs) {
      const user = doc.data();
      // Če je uporabnik naročnino preklical, je NE podaljšujemo
      if (user.subscription_canceled === true) {
        continue;
      }

      const packageId = (user.subscription_tier || '').toLowerCase();
      
      let amountCents = 0;
      if (packageId.includes('pro')) amountCents = 5000;
      else if (packageId.includes('basic')) amountCents = 2000;
      else continue; // Preskoči neznane nivoje
      
      const idempotencyKey = `renew_${doc.id}_${new Date().getFullYear()}_${new Date().getMonth()}`;
      const nextValidUntil = new Date(now);
      nextValidUntil.setMonth(nextValidUntil.getMonth() + 1);

      try {
        // 1. Poskusi bremeniti denarnico
        const txId = await reserveWalletFunds(doc.id, amountCents, 'wallet_payment', idempotencyKey, { type: 'subscription_renewal' });
        
        await commitReservedFunds(txId);
        
        await doc.ref.set({
           subscription_paid_at: now.toISOString(),
           subscription_started_at: now.toISOString(),
           subscription_cycle_started_at: now.toISOString(),
           subscription_valid_until: nextValidUntil.toISOString(),
           subscription_active: true
        }, { merge: true });

        createAndSendSubscriptionInvoice({
          userId: doc.id,
          packageId: user.subscription_tier || 'BASIC',
          amountTotal: amountCents / 100,
          sourceId: txId,
          paymentMethod: 'Dobroimetje v denarnici',
          periodStart: now,
          periodEnd: nextValidUntil
        }).catch(e => console.error("[renewal-cron] Napaka pri ustvarjanju računa (denarnica):", e));

        processed++;
        continue;
      } catch (walletError: any) {
        if (walletError.message.includes('Idempotency key already exists')) {
          continue;
        }
        
        // 2. Nadomestno bremeni shranjeno kartico preko Stripe
        if (user.stripe_customer_id && user.stripe_default_payment_method) {
          try {
            await stripe.paymentIntents.create({
              amount: amountCents,
              currency: 'eur',
              customer: user.stripe_customer_id,
              payment_method: user.stripe_default_payment_method,
              off_session: true,
              confirm: true,
              metadata: {
                type: 'subscription',
                user_id: doc.id,
                package_id: user.subscription_tier,
                renewal: 'true'
              }
            }, { idempotencyKey: `card_${idempotencyKey}` });
            
            await doc.ref.set({
               subscription_paid_at: now.toISOString(),
               subscription_started_at: now.toISOString(),
               subscription_cycle_started_at: now.toISOString(),
               subscription_valid_until: nextValidUntil.toISOString(),
               subscription_active: true
            }, { merge: true });

            createAndSendSubscriptionInvoice({
              userId: doc.id,
              packageId: user.subscription_tier || 'BASIC',
              amountTotal: amountCents / 100,
              sourceId: `stripe_renew_${idempotencyKey}`,
              paymentMethod: 'Spletno plačilo / Kartica (Stripe)',
              periodStart: now,
              periodEnd: nextValidUntil
            }).catch(e => console.error("[renewal-cron] Napaka pri ustvarjanju računa (kartica):", e));

            processed++;
          } catch (stripeError: any) {
            console.error(`Neuspešno podaljšanje naročnine s kartico za uporabnika ${doc.id}: `, stripeError);
            await doc.ref.set({
               subscription_active: false
            }, { merge: true });
          }
        } else {
          await doc.ref.set({
             subscription_active: false
          }, { merge: true });
        }
      }
    }

    res.json({ success: true, processed });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

app.get("/api/cron/process-subscription-renewals", handleProcessSubscriptionRenewals);
app.post("/api/cron/process-subscription-renewals", handleProcessSubscriptionRenewals);

app.post("/api/cancel-subscription", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userData.stripe_subscription_id) {
      const stripe = getStripe();
      await stripe.subscriptions.update(userData.stripe_subscription_id, {
        cancel_at_period_end: true
      });
    }

    await adminDb.collection('users').doc(userId).update({
      subscription_canceled: true
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error in cancel-subscription:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auctions/confirm-receipt", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const buyerId = decodedToken.uid;
    const { auction_id } = req.body;

    const txSnap = await safeGetDocs(
      adminDb.collection('transactions').where('auction_id', '==', auction_id)
    );
    if (txSnap.empty) {
      return res.status(404).json({ error: 'Naročilo ni najdeno.' });
    }

    const txDoc = txSnap.docs[0];
    const tx = txDoc.data();

    if (tx.buyer_id !== buyerId) {
      return res.status(403).json({ error: 'Nimate pravic za to dejanje.' });
    }

    if (tx.status !== 'SHIPPED' && tx.status !== 'HELD_IN_ESCROW' && tx.status !== 'DELIVERED') {
      return res.status(400).json({ error: 'Naročila v trenutnem stanju ni mogoče potrditi.' });
    }

    await txDoc.ref.update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString()
    });

    const releaseAmount = Number(tx.amount_total || tx.amount) - Number(tx.platform_fee || 0) - Number(tx.vat_amount || 0);
    const releaseCents = Math.round(releaseAmount * 100);
    
    await releaseHeldFunds(tx.seller_id, releaseCents, 'release_' + txDoc.id, { auction_id: tx.auction_id, related_tx: txDoc.id });
    
    await adminDb.collection('auctions').doc(auction_id).update({
      buyer_received: true,
      received_at: new Date().toISOString(),
      receipt_confirmed_at: new Date().toISOString(),
      post_auction_status: 'completed',
      status: 'completed'
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error in confirm-receipt:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ODDAJA OCENE PRODAJALCA ZA ZMAGANO DRAŽBO
// ==========================================

app.post("/api/reviews/submit", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Niste prijavljeni.' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const buyerId = decodedToken.uid;
    const { auction_id, seller_id, rating, comment, would_recommend } = req.body;

    if (!auction_id || !rating) {
      return res.status(400).json({ error: 'Manjkajoči podatki za oceno.' });
    }

    const numRating = Math.max(1, Math.min(5, Number(rating) || 5));
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';

    // Fetch auction
    const auctionDoc = await adminDb.collection('auctions').doc(auction_id).get();
    if (!isDocSnapshotExists(auctionDoc)) {
      return res.status(404).json({ error: 'Dražba ni najdena.' });
    }
    const auctionData = getDocSnapshotData(auctionDoc) || {};

    const actualSellerId = seller_id || auctionData.seller_id || auctionData.sellerId || auctionData.seller?.id;
    if (!actualSellerId) {
      return res.status(400).json({ error: 'Prodajalec ni določen.' });
    }

    // Fetch buyer info for author name
    let authorName = 'Preverjen kupec';
    try {
      const buyerDoc = await adminDb.collection('users').doc(buyerId).get();
      if (isDocSnapshotExists(buyerDoc)) {
        const bData = getDocSnapshotData(buyerDoc) || {};
        if (bData.company_name) authorName = bData.company_name;
        else if (bData.first_name) authorName = `${bData.first_name} ${bData.last_name || ''}`.trim();
        else if (bData.username) authorName = bData.username;
        else if (bData.name) authorName = typeof bData.name === 'object' ? (bData.name.SLO || bData.name.EN) : bData.name;
      }
    } catch (e) {}

    const auctionTitle = auctionData.title?.SLO || auctionData.title?.EN || (typeof auctionData.title === 'string' ? auctionData.title : 'Dražba');
    const auctionImage = Array.isArray(auctionData.images) && auctionData.images.length > 0 ? auctionData.images[0] : null;

    const reviewPayload = {
      seller_id: actualSellerId,
      sellerId: actualSellerId,
      author_id: buyerId,
      author: authorName,
      rating: numRating,
      comment: trimmedComment,
      auction_id,
      auctionId: auction_id,
      auction_title: auctionTitle,
      auction_image: auctionImage,
      date: new Date().toLocaleDateString('sl-SI'),
      created_at: new Date().toISOString(),
      isVerified: true,
      wouldRecommend: would_recommend !== undefined ? Boolean(would_recommend) : numRating >= 4,
    };

    const reviewRef = await adminDb.collection('reviews').add(reviewPayload);

    // Update auction document
    await adminDb.collection('auctions').doc(auction_id).update({
      review_submitted: true,
      review_rating: numRating,
      review_comment: trimmedComment,
      review_submitted_at: new Date().toISOString(),
      review_id: reviewRef.id,
    });

    // Update seller user statistics
    try {
      const sellerReviewsSnap = await adminDb.collection('reviews')
        .where('seller_id', '==', actualSellerId)
        .get();
      let totalRating = 0;
      let count = 0;
      sellerReviewsSnap.forEach(d => {
        const rData = d.data();
        if (rData.rating) {
          totalRating += Number(rData.rating);
          count++;
        }
      });
      const avg = count > 0 ? Math.round((totalRating / count) * 10) / 10 : numRating;
      await adminDb.collection('users').doc(actualSellerId).set({
        rating: avg,
        review_count: count,
        reviews_count: count,
      }, { merge: true });
    } catch (statErr) {
      console.warn('Error updating seller stats in submit review:', statErr);
    }

    res.json({ success: true, review_id: reviewRef.id });
  } catch (err: any) {
    console.error('Error in /api/reviews/submit:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// NAROČNINE - PREGLED IN PRENOS RAČUNOV
// ==========================================

app.get("/api/subscription/invoices", async (req, res) => {
  try {
    let authUid: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
        authUid = decoded.uid;
      } catch (e) {}
    }
    if (!authUid) {
      return res.status(401).json({ error: "Niste prijavljeni." });
    }

    const docsSnap = await safeGetDocs(
      adminDb.collection('documents')
        .where('user_id', '==', authUid)
        .where('type', '==', 'subscription_invoice')
    );

    const invoices = docsSnap.docs.map((d: any) => ({
      id: d.id,
      ...d.data()
    })).sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    res.json({ invoices });
  } catch (err: any) {
    console.error("Error fetching subscription invoices:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/subscription/download-invoice/:invoiceNo", async (req, res) => {
  try {
    let authUid: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
        authUid = decoded.uid;
      } catch (e) {}
    }
    if (!authUid) {
      return res.status(401).json({ error: "Niste prijavljeni." });
    }

    const { invoiceNo } = req.params;
    const docSnap = await safeGetDocs(
      adminDb.collection('documents')
        .where('invoice_no', '==', invoiceNo)
        .where('user_id', '==', authUid)
        .limit(1)
    );

    if (docSnap.empty) {
      return res.status(404).json({ error: "Račun ni bil najden." });
    }

    const docData = docSnap.docs[0].data();
    const userDoc = await safeGetDoc(adminDb.collection('users').doc(authUid));
    const userData = userDoc.data() || {};

    const pdfBuffer = await generateSubscriptionInvoicePDF({
      invoiceNo: docData.invoice_no,
      user: userData,
      planId: docData.package_id || 'basic',
      amount: docData.amount || 20,
      paymentMethod: docData.payment_method || 'Spletno plačilo / Kartica (Stripe)',
      paymentDate: new Date(docData.created_at).toLocaleDateString('sl-SI')
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="racun_${invoiceNo}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("Error generating subscription invoice download:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// IZBRIS PROFILA IN VSEH POVEZANIH PODATKOV
// ==========================================

app.post("/api/delete-account", async (req, res) => {
  try {
    let authUid: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
        authUid = decoded.uid;
      } catch (e) {
        return res.status(401).json({ error: "Neveljaven varnostni žeton." });
      }
    }
    if (!authUid) {
      return res.status(401).json({ error: "Niste prijavljeni." });
    }

    console.log(`[delete-account] Začenjam brisanje profila in podatkov za uporabnika: ${authUid}`);

    // 1. Preglej dražbe, kjer je uporabnik prodajalec
    const sellerAuctions = await adminDb.collection('auctions')
      .where('seller_id', '==', authUid)
      .get();

    let batch = adminDb.batch();
    let batchCount = 0;

    for (const doc of sellerAuctions.docs) {
      const data = doc.data();
      const hasWinner = Boolean(data.winner_id || data.winnerId);
      const isCompleted = data.status === 'completed' || data.payment_status === 'paid' || data.post_auction_status === 'paid';

      if (hasWinner || isCompleted) {
        // Kupec je zmagal ali plačal: dražba mora OSTATI dostopna kupcu!
        // Označi prodajalca kot izbrisanega, tako da kupec vidi "Uporabnik je bil izbrisan"
        batch.update(doc.ref, {
          is_seller_deleted: true,
          sellerName: 'Uporabnik je bil izbrisan',
          seller: {
            id: authUid,
            is_deleted: true,
            name: { SLO: 'Uporabnik je bil izbrisan', EN: 'User deleted', DE: 'Benutzer gelöscht' },
            photoURL: null
          }
        });
        batchCount++;
      } else {
        // Nezmagane / osnutki / aktivne dražbe brez zmagovalca se trajno izbrišejo
        batch.delete(doc.ref);
        batchCount++;
      }

      if (batchCount >= 400) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    }

    // Dodatno preveri, če so kje uporabljene camelCase 'sellerId'
    const sellerAuctionsCamel = await adminDb.collection('auctions')
      .where('sellerId', '==', authUid)
      .get();

    for (const doc of sellerAuctionsCamel.docs) {
      if (sellerAuctions.docs.some(d => d.id === doc.id)) continue;
      const data = doc.data();
      const hasWinner = Boolean(data.winner_id || data.winnerId);
      const isCompleted = data.status === 'completed' || data.payment_status === 'paid' || data.post_auction_status === 'paid';

      if (hasWinner || isCompleted) {
        batch.update(doc.ref, {
          is_seller_deleted: true,
          sellerName: 'Uporabnik je bil izbrisan',
          seller: {
            id: authUid,
            is_deleted: true,
            name: { SLO: 'Uporabnik je bil izbrisan', EN: 'User deleted', DE: 'Benutzer gelöscht' },
            photoURL: null
          }
        });
        batchCount++;
      } else {
        batch.delete(doc.ref);
        batchCount++;
      }

      if (batchCount >= 400) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    }

    // 2. Izbriši vsa uporabnikova obvestila
    const notifications = await adminDb.collection('notifications')
      .where('user_id', '==', authUid)
      .get();

    for (const nDoc of notifications.docs) {
      batch.delete(nDoc.ref);
      batchCount++;
      if (batchCount >= 400) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // 3. Počisti shranjene dražbe (če obstajajo ločeno)
    try {
      const savedDocs = await adminDb.collection('saved_auctions')
        .where('user_id', '==', authUid)
        .get();
      if (!savedDocs.empty) {
        const sBatch = adminDb.batch();
        savedDocs.docs.forEach(d => sBatch.delete(d.ref));
        await sBatch.commit();
      }
    } catch (sErr) {}

    // 4. Uporabniški dokument v Firestore:
    // Da kupec ob ogledu svojih zmaganih dražb ne doživi sesutja ali praznih podatkov,
    // se osebni podatki v celoti pobrišejo in zamenjajo z anonimiziranim zapisom
    // "Uporabnik je bil izbrisan":
    await adminDb.collection('users').doc(authUid).set({
      id: authUid,
      is_deleted: true,
      isDeleted: true,
      username: 'Uporabnik je bil izbrisan',
      company_name: 'Uporabnik je bil izbrisan',
      first_name: 'Izbrisan',
      last_name: 'Uporabnik',
      name: { SLO: 'Uporabnik je bil izbrisan', EN: 'User deleted', DE: 'Benutzer gelöscht' },
      email: '',
      phone: '',
      address: '',
      street_address: '',
      city: '',
      postal_code: '',
      tax_id: '',
      registration_number: '',
      photoURL: null,
      photoUrl: null,
      photo_url: null,
      stripe_customer_id: null,
      stripe_default_payment_method: null,
      stripe_account_id: null,
      subscription_active: false,
      subscription_tier: 'FREE',
      deleted_at: new Date().toISOString()
    }, { merge: false });

    // 5. Izbris računa iz Firebase Authentication
    try {
      await adminAuth.deleteUser(authUid);
      console.log(`[delete-account] Uporabnik ${authUid} uspešno izbrisan iz Firebase Auth.`);
    } catch (authErr: any) {
      console.warn(`[delete-account] Opozorilo pri brisanju iz Firebase Auth:`, authErr.message);
    }

    console.log(`[delete-account] Uporabnik ${authUid} uspešno in varno izbrisan.`);
    res.json({ success: true, message: "Profil in podatki so bili uspešno izbrisani." });
  } catch (error: any) {
    console.error("[delete-account] Napaka pri brisanju profila:", error);
    res.status(500).json({ error: error.message || "Napaka pri brisanju profila." });
  }
});

// Catch-all for unhandled API routes to prevent HTML 404s
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found on Vercel backend', url: req.url, originalUrl: req.originalUrl });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

