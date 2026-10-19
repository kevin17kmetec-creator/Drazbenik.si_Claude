import express from "express";
import JSZip from "jszip";
import crypto, { randomInt, timingSafeEqual } from "crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import {
  reserveWalletFunds,
  commitReservedFunds,
  rollbackReservedFunds,
  addHeldFunds,
  releaseHeldFunds,
  ensureWalletMigrated,
  creditWalletDepositFromStripe,
  getUserWallet
} from './walletService';
import { parseAmountToCents } from './moneyUtils';
import {
  SHIP_DEADLINE_DAYS,
  AUTO_RELEASE_AFTER_SHIPPED_DAYS,
  AUTO_RELEASE_AFTER_SHIPPED_DAYS_CROSS_BORDER,
  AUTO_COMPLETE_AFTER_DELIVERED_DAYS,
  PICKUP_AUTO_RELEASE_DAYS,
  PRE_RELEASE_BUYER_REMINDER_HOURS,
  PAYOUT_MAX_ATTEMPTS,
  HOLD_HARD_LIMIT_DAYS,
  HOLD_ALERT_DAYS,
  MIN_PAYOUT_CENTS,
  PAYOUT_AUTO_DAYS
} from './escrowConfig';
import { getEffectiveTier, calculateTotals, calculatePlatformFeeCents } from '../lib/feeCalculator';
import { authenticateFirebaseUser } from './authHelper';
import {
  formatStripeError,
  ensurePlatformTestBalance,
  diagnoseStripeTransferPrerequisites
} from './stripeHelper';
import cors from "cors";
import Stripe from "stripe";
import { Resend } from './localizedResend';
import { TRACKING_REQUIRED_ABOVE_EUR, CARRIERS, getCarrierLabel, checkTrackingNumber, getTrackingUrl, NOT_RECEIVED_MIN_DAYS_DOMESTIC, NOT_RECEIVED_MIN_DAYS_CROSS_BORDER, SELLER_PROOF_HOURS, SUSPICIOUS_REPORTS_180D } from '../lib/shippingRules';
import { render } from '@react-email/render';
import React from 'react';
import { AuctionEmailTemplate } from '../emails/AuctionEmailTemplate';
import { AuthEmailTemplate } from '../emails/AuthEmailTemplate';
import { GoogleGenAI } from "@google/genai";
import { finalizeAuction, processAuctionCrons } from './cronProcessor';
import { generateInvoicePDF, generateCertificatePDF, generateSubscriptionInvoicePDF } from '../lib/pdfGenerator';
import {
  sendEndingSoonNotification,
  sendAuctionWonNotification,
  sendPaymentReminderNotification,
  sendOutbidNotification,
  sendShippingCancelledNotifications,
  sendReviewReceivedNotification,
  sendSecondChanceOfferNotification,
  sendSecondChanceFailedSellerNotification,
  sendAuctionEmail,
  getBaseAppUrl
} from './emailService';
import { syncPublicProfile } from './publicProfile';
import { TERMS_VERSION } from '../lib/termsVersion';
import { translations } from '../lib/translations';

// Deutscher Kommentar: Speichert einen unveraenderlichen Nachweis ueber die Zustimmung zu den AGB
async function recordTermsAcceptance(params: {
  uid: string;
  context: 'registration' | 'reaccept' | 'seller_terms' | 'first_bid';
  req: express.Request;
  termsVersion?: string;
  auctionId?: string | null;
}) {
  try {
    const { uid, context, req, termsVersion = TERMS_VERSION, auctionId = null } = params;
    const rawIp = req.headers['x-forwarded-for'];
    const ip = (rawIp ? String(rawIp).split(',')[0].trim() : req.ip) || req.socket?.remoteAddress || '';
    const userAgent = (req.headers['user-agent'] as string) || '';
    const language = (req.headers['accept-language'] as string) || 'sl';
    const termsText = translations?.SLO?.termsText || '';
    const termsTextSha256 = crypto.createHash('sha256').update(termsText).digest('hex');

    await adminDb.collection('terms_acceptances').add({
      uid,
      terms_version: termsVersion,
      terms_text_sha256: termsTextSha256,
      context,
      accepted_at: new Date().toISOString(),
      ip,
      user_agent: userAgent,
      language,
      auction_id: auctionId
    });
  } catch (err) {
    console.error("Fehler beim Speichern des AGB-Nachweises:", err);
  }
}
import { isBankTransferAvailable, resolvePaymentDeadlineMs, addWorkingDays } from '../lib/bankTransfer';
import { cancelAuctionBankTransfer } from './bankTransferCancel';
import { PLATFORM_COMPANY } from '../lib/platformCompany';
import { claimIdentityLock, releaseIdentityLock, markIdentityBlocked, normalizeTaxId, lockKey } from './identityLock';
// Benachrichtigungs- und Anwesenheitshelfer
import { getIncrement } from '../lib/bidIncrement';
import { registerSeoRoutes } from './seo';
import { CSP_HEADER } from './csp';
import { createNotification, isUserOnline } from './notifications';

const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const adminEmailAddress = process.env.ADMIN_EMAIL || 'info@drazbenik.si';

import {
  adminDb,
  adminAuth,
  getAuth,
  getAdminStorage,
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

// Deutscher Kommentar: Prueft, ob der angegebene Benutzer ein Administrator ist
export async function isAdminUser(uid: string): Promise<boolean> {
  if (!uid) return false;
  const adminUids = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (adminUids.includes(uid)) {
    return true;
  }
  const userDoc = await safeGetDoc(adminDb.collection('users').doc(uid));
  if (userDoc.exists() && userDoc.data()?.role === 'admin') {
    return true;
  }
  return false;
}

async function assertVerifiedUser(userId: string, userData: any): Promise<void> {
  let isEmailVerified = userData?.email_verified === true || userData?.is_verified === true;
  if (!isEmailVerified && userId) {
    try {
      const authUser = await adminAuth.getUser(userId);
      if (authUser?.emailVerified === true) {
        isEmailVerified = true;
      }
    } catch (e) {
      // Ignore lookup failure
    }
  }

  if (!isEmailVerified) {
    const err: any = new Error("Za to dejanje morate najprej potrditi svoj e-poštni naslov.");
    err.statusCode = 403;
    err.code = 'EMAIL_NOT_VERIFIED';
    throw err;
  }

  if (userData?.profile_completed !== true) {
    const err: any = new Error("Za to dejanje morate najprej dopolniti svoj profil (Nastavitve, Osebni podatki).");
    err.statusCode = 403;
    err.code = 'PROFILE_INCOMPLETE';
    throw err;
  }

  if (userData?.terms_version !== TERMS_VERSION) {
    const err: any = new Error("Za to dejanje morate najprej sprejeti posodobljene pogoje uporabe.");
    err.statusCode = 403;
    err.code = 'TERMS_REQUIRED';
    throw err;
  }
}

const EU_COUNTRIES_SET = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
]);

async function isViesValid(countryCode: string, vatId: string): Promise<boolean> {
  if (!countryCode || !vatId) return false;
  const cc = countryCode.trim().toUpperCase();
  let num = vatId.trim().replace(/[\s\.-]/g, '');
  if (num.startsWith(cc)) {
    num = num.substring(cc.length);
  }
  if (!num) return false;

  const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${cc}/vat/${num}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.isValid === true;
  } catch (e) {
    clearTimeout(timeout);
    return false;
  }
}

async function getSellerPayoutAccount(sellerId: string): Promise<string> {
  if (!sellerId) {
    const err: any = new Error('Missing seller ID');
    err.code = 'SELLER_PAYOUTS_NOT_READY';
    throw err;
  }
  const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(sellerId));
  if (!sellerDoc.exists()) {
    const err: any = new Error('Seller user not found');
    err.code = 'SELLER_PAYOUTS_NOT_READY';
    throw err;
  }
  const seller = sellerDoc.data() || {};
  const stripeAccountId = seller.stripe_account_id || seller.stripeAccountId;
  if (!seller.stripe_onboarding_complete || !stripeAccountId) {
    const err: any = new Error('Prodajalec še nima urejenih izplačil.');
    err.code = 'SELLER_PAYOUTS_NOT_READY';
    throw err;
  }
  return stripeAccountId;
}

async function getBuyerTaxContext(userId: string, userData: any): Promise<{ countryCode: string; isBusiness: boolean; hasValidVatId: boolean }> {
  const countryCode = (userData?.country_code || 'SI').trim().toUpperCase();
  const isBusiness = Boolean(
    userData?.company_status === 'company' ||
    userData?.user_type === 'company' ||
    userData?.company_name
  );
  const rawVatId = userData?.tax_id || userData?.vat_id || '';
  const hasVatIdInput = Boolean(rawVatId.trim());

  if (!isBusiness || !hasVatIdInput || countryCode === 'SI' || !EU_COUNTRIES_SET.has(countryCode)) {
    return {
      countryCode,
      isBusiness,
      hasValidVatId: false
    };
  }

  const checkKey = `${countryCode}${rawVatId.trim()}`;
  const cachedFor = userData?.vies_checked_for;
  const cachedValid = userData?.vies_valid;
  const cachedAt = userData?.vies_checked_at;

  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  if (cachedFor === checkKey && typeof cachedValid === 'boolean' && cachedAt) {
    const checkedTime = new Date(cachedAt).getTime();
    if (!isNaN(checkedTime) && (now - checkedTime < twentyFourHours)) {
      return {
        countryCode,
        isBusiness,
        hasValidVatId: cachedValid
      };
    }
  }

  const valid = await isViesValid(countryCode, rawVatId);

  try {
    await adminDb.collection('users').doc(userId).set({
      vies_checked_for: checkKey,
      vies_valid: valid,
      vies_checked_at: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.warn('[getBuyerTaxContext] Failed to cache VIES result:', e);
  }

  return {
    countryCode,
    isBusiness,
    hasValidVatId: valid
  };
}

async function computeBuyerTotals(buyerId: string, buyerData: any, itemPriceCents: number) {
  const tier = getEffectiveTier(buyerData);
  const taxCtx = await getBuyerTaxContext(buyerId, buyerData);
  const totals = calculateTotals({
    itemPriceCents,
    tier,
    countryCode: taxCtx.countryCode,
    isBusiness: taxCtx.isBusiness,
    hasValidVatId: taxCtx.hasValidVatId
  });
  return {
    ...totals,
    tier
  };
}

function buildStripeAccountPrefill(user: any) {
  const isBusiness = user?.user_type === 'business' || user?.userType === 'business';
  const businessType = isBusiness ? 'company' : 'individual';

  let formattedPhone: string | undefined = undefined;
  if (user?.phone && typeof user.phone === 'string') {
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
    if (!formattedPhone || formattedPhone.trim() === '+' || formattedPhone.trim() === '+386') {
      formattedPhone = undefined;
    }
  }

  const name = isBusiness
    ? (user?.company_name || user?.companyName || undefined)
    : (`${user?.first_name || user?.firstName || ''} ${user?.last_name || user?.lastName || ''}`.trim() || undefined);

  const businessProfile: any = {
    mcc: '5999',
    product_description: 'Prodaja predmetov preko platforme dražbenik.si',
    url: 'https://www.drazbe.eu',
  };
  if (user?.email && String(user.email).trim()) businessProfile.support_email = String(user.email).trim();
  if (formattedPhone) businessProfile.support_phone = formattedPhone;
  if (name) businessProfile.name = name;

  function cleanAddress(addr: { line1?: string; city?: string; postal_code?: string; country?: string }) {
    const res: any = {};
    if (addr.line1 && addr.line1.trim()) res.line1 = addr.line1.trim();
    if (addr.city && addr.city.trim()) res.city = addr.city.trim();
    if (addr.postal_code && addr.postal_code.trim()) res.postal_code = addr.postal_code.trim();
    if (addr.country && addr.country.trim()) res.country = addr.country.trim();
    return Object.keys(res).length > 0 ? res : undefined;
  }

  const result: any = {
    business_type: businessType,
    business_profile: businessProfile,
  };

  if (user?.email && String(user.email).trim()) {
    result.email = String(user.email).trim();
  }

  if (isBusiness) {
    const compAddress = cleanAddress({
      line1: user?.company_street || user?.companyStreet || user?.street || user?.address?.street,
      city: user?.company_city || user?.companyCity || user?.city || user?.address?.city,
      postal_code: user?.company_postal_code || user?.companyPostalCode || user?.postal_code || user?.postalCode || user?.address?.postcode,
      country: user?.country_code || 'SI'
    });

    const company: any = {};
    if (formattedPhone) company.phone = formattedPhone;
    const companyName = user?.company_name || user?.companyName;
    if (companyName && String(companyName).trim()) company.name = String(companyName).trim();
    const taxId = user?.tax_number || user?.taxNumber || user?.tax_id || user?.vat_id || user?.vatId;
    if (taxId && String(taxId).trim()) company.tax_id = String(taxId).trim();
    const regNum = user?.registration_number || user?.regNumber || user?.registrationNumber;
    if (regNum && String(regNum).trim()) company.registration_number = String(regNum).trim();
    const vatId = user?.vat_id || user?.vatId;
    if (vatId && String(vatId).trim()) company.vat_id = String(vatId).trim();
    if (compAddress) company.address = compAddress;

    if (Object.keys(company).length > 0) {
      result.company = company;
    }
  } else {
    const indAddress = cleanAddress({
      line1: user?.street || user?.address?.street,
      city: user?.city || user?.address?.city,
      postal_code: user?.postal_code || user?.postalCode || user?.address?.postcode,
      country: user?.country_code || 'SI'
    });

    const individual: any = {};
    if (formattedPhone) individual.phone = formattedPhone;
    const firstName = user?.first_name || user?.firstName;
    if (firstName && String(firstName).trim()) individual.first_name = String(firstName).trim();
    const lastName = user?.last_name || user?.lastName;
    if (lastName && String(lastName).trim()) individual.last_name = String(lastName).trim();
    if (user?.email && String(user.email).trim()) individual.email = String(user.email).trim();
    if (indAddress) individual.address = indAddress;

    if (Object.keys(individual).length > 0) {
      result.individual = individual;
    }
  }

  return result;
}

function isStripeAccountReady(account: Stripe.Account): boolean {
  return account.details_submitted === true &&
    account.payouts_enabled === true &&
    account.capabilities?.transfers === 'active';
}

async function ensureSellerStripeAccount(userId: string, user: any): Promise<string> {
  const stripe = getStripe();
  let accountId = user?.stripe_account_id || user?.stripeAccountId;
  const prefill = buildStripeAccountPrefill(user);

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: user?.country_code || 'SI',
      capabilities: {
        transfers: { requested: true }
      },
      settings: {
        payouts: {
          schedule: { interval: 'manual' }
        }
      },
      metadata: {
        firebase_uid: userId
      },
      ...prefill
    });
    accountId = account.id;
    await adminDb.collection('users').doc(userId).set({
      stripe_account_id: accountId,
      stripeAccountId: accountId
    }, { merge: true });
  } else {
    if (!user?.stripe_account_id || !user?.stripeAccountId) {
      await adminDb.collection('users').doc(userId).set({
        stripe_account_id: accountId,
        stripeAccountId: accountId
      }, { merge: true });
    }

    if (!user?.stripe_onboarding_complete) {
      try {
        await stripe.accounts.update(accountId, {
          ...prefill,
          settings: {
            payouts: {
              schedule: { interval: 'manual' }
            }
          }
        });
      } catch (e: any) {
        console.warn(`[ensureSellerStripeAccount] Account update failed for ${accountId}:`, e.message);
      }
    }
  }

  return accountId;
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
  const { userId, packageId, amountTotal, sourceId, paymentMethod = 'Spletno plačilo / Kartica', periodStart, periodEnd } = params;
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
      lang: userData.preferred_language,
      planId: packageId,
      amount: amountTotal,
      paymentMethod,
      periodStart: periodStart || new Date(),
      periodEnd: periodEnd || undefined
    });

    const fileName = `racun_${invoiceNo}.pdf`;
    let invoicePath: string | null = null;
    try {
      invoicePath = await uploadBufferToStorage(pdfBuffer, `${userId}/${fileName}`);
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
      invoice_path: invoicePath,
      created_at: new Date().toISOString()
    });
    console.log(`[subscription-invoice] Uspešno shranjen dokument računa ${invoiceNo} za uporabnika ${userId}`);

    // Deutscher Kommentar: Buchhalterische Archivierung fuer Abonnements gemaess DEL C
    try {
      const isCompany = userData.company_status === 'company' || userData.user_type === 'business' || Boolean(userData.company_name);
      const buyerTaxId = userData.tax_id || userData.taxId || userData.vat_id || '';
      const userCountry = (userData.country_code || userData.country || 'SI').toUpperCase();
      const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'ES', 'SE'];
      const isReverseCharge = isCompany && buyerTaxId && euCountries.includes(userCountry) && userCountry !== 'SI';

      const grossCents = Math.round(Number(amountTotal) * 100);
      const vatRate = isReverseCharge ? 0 : 22;
      const netCents = isReverseCharge ? grossCents : Math.round(grossCents / 1.22);
      const vatCents = isReverseCharge ? 0 : (grossCents - netCents);

      await archiveAccountingDocument({
        type: 'SUBSCRIPTION',
        invoiceNo,
        issuedAt: new Date(),
        pdfBuffer,
        netCents,
        vatCents,
        grossCents,
        vatRate,
        buyerId: userId,
        sellerId: '',
        transactionId: sourceId,
        auctionId: '',
        issuer: 'platform'
      });
    } catch (archiveErr: any) {
      console.error('[subscription-invoice] Fehler bei Buchhaltungsarchivierung:', archiveErr.message);
    }

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
              <p style="margin: 0;">${PLATFORM_COMPANY.name}, ${PLATFORM_COMPANY.address} | ID za DDV: ${PLATFORM_COMPANY.vatId}</p>
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




// Deutscher Kommentar: Archiviert ein Rechnungsdokument in Storage und Firestore (accounting_documents)
async function archiveAccountingDocument(params: {
  type: 'SALES' | 'COMMISSION' | 'SUBSCRIPTION';
  invoiceNo: string;
  issuedAt: Date | string;
  pdfBuffer: Buffer;
  netCents: number;
  vatCents: number;
  grossCents: number;
  vatRate: number;
  buyerId: string;
  sellerId?: string;
  transactionId?: string;
  auctionId?: string;
  issuer: 'seller_on_behalf' | 'platform';
}): Promise<string> {
  const docRef = adminDb.collection('accounting_documents').doc(params.invoiceNo);
  const docSnap = await safeGetDoc(docRef);
  if (docSnap.exists) {
    // Deutscher Kommentar: Dokument bereits im Archiv vorhanden - unveraenderlich belassen
    return docSnap.data()?.storage_path || '';
  }

  const issueDate = typeof params.issuedAt === 'string' ? new Date(params.issuedAt) : (params.issuedAt || new Date());
  const yearStr = String(issueDate.getFullYear());
  const monthStr = String(issueDate.getMonth() + 1).padStart(2, '0');
  const storagePath = `accounting/${yearStr}/${monthStr}/${params.type}/${params.invoiceNo}.pdf`;

  // Deutscher Kommentar: PDF-Puffer in Firebase Storage speichern
  await uploadBufferToStorage(params.pdfBuffer, storagePath);

  // Deutscher Kommentar: Neuer Eintrag in Firestore-Sammlung accounting_documents
  await docRef.set({
    type: params.type,
    invoice_no: params.invoiceNo,
    year: issueDate.getFullYear(),
    month: monthStr,
    issued_at: issueDate.toISOString(),
    currency: 'EUR',
    net_cents: Math.round(params.netCents),
    vat_cents: Math.round(params.vatCents),
    gross_cents: Math.round(params.grossCents),
    vat_rate: params.vatRate,
    buyer_id: params.buyerId || '',
    seller_id: params.sellerId || '',
    transaction_id: params.transactionId || '',
    auction_id: params.auctionId || '',
    issuer: params.issuer,
    storage_path: storagePath,
    created_at: new Date().toISOString()
  });

  return storagePath;
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

// Deutscher Kommentar: Gebotsschritte kommen aus der gemeinsamen Tabelle (identisch mit dem Client)
const getBidIncrement = getIncrement;

/**
 * Masks a username for public bid history (first letter + '***' + last letter).
 * Falls back to 'U***r' if missing or too short.
 */
function maskUsername(name?: string): string {
  const clean = (name || '').trim();
  if (!clean || clean.length < 2) return 'U***r';
  return `${clean[0]}***${clean[clean.length - 1]}`;
}

// syncPublicProfile helper has been moved to its own file publicProfile.ts

/**
 * Helper to record sale completion idempotently and increment seller's sold_count.
 */
export async function recordSaleCompletion(auctionId: string, sellerIdOverride?: string) {
  try {
    if (!auctionId) return;
    const auctionRef = adminDb.collection('auctions').doc(auctionId);
    const snap = await safeGetDoc(auctionRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (data.sold_count_recorded) return;

    const sellerId = sellerIdOverride || data.seller_id || data.sellerId;
    await auctionRef.update({ sold_count_recorded: true });

    if (sellerId) {
      await adminDb.collection('users').doc(sellerId).set({
        sold_count: FieldValue.increment(1)
      }, { merge: true });
      await syncPublicProfile(sellerId);
    }
  } catch (err: any) {
    console.error(`[recordSaleCompletion] Error for auction ${auctionId}:`, err);
  }
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
  amountEur,
  paymentMethod,
  bankTransferDeadlineAt
}: {
  buyerId: string;
  auctionId: string;
  amountEur: number;
  paymentMethod?: string;
  bankTransferDeadlineAt?: string;
}): Promise<{ reservationId: string; expiresAt: string }> {
  if (!buyerId || !auctionId || amountEur <= 0) {
    return { reservationId: `${buyerId}_${auctionId}`, expiresAt: '' };
  }

  const reservationId = `${buyerId}_${auctionId}`;
  const now = new Date();
  const expiresAt = bankTransferDeadlineAt || new Date(now.getTime() + 30 * 60 * 1000).toISOString();
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
    const reservationData: any = {
      buyer_id: buyerId,
      auction_id: auctionId,
      amount_eur: amountEur,
      year: currentYear,
      status: 'active',
      expires_at: expiresAt,
      created_at: createdAt
    };
    if (paymentMethod) {
      reservationData.payment_method = paymentMethod;
    }
    if (bankTransferDeadlineAt) {
      reservationData.bank_transfer_deadline_at = bankTransferDeadlineAt;
    }
    t.set(reservationRef, reservationData, { merge: true });
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
    res.setHeader("Content-Security-Policy", CSP_HEADER);
  }
  next();
});

// UPSTASH RATE LIMITERS
let authRateLimiter: Ratelimit | null = null;
let placeBidRateLimiter: Ratelimit | null = null;
let createAuctionRateLimiter: Ratelimit | null = null;
let checkoutPaymentRateLimiter: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  authRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    prefix: "ratelimit_auth",
    analytics: true,
  });
  placeBidRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 m"),
    prefix: "ratelimit_bid",
    analytics: true,
  });
  createAuctionRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    prefix: "ratelimit_auction",
    analytics: true,
  });
  checkoutPaymentRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "ratelimit_payment",
    analytics: true,
  });
} else {
  console.warn("Upstash Redis not configured. Rate limiting is disabled.");
}

// APPLY RATE LIMITING TO AUTH ROUTES (5 per minute per IP)
app.use(async (req, res, next) => {
  if (
    req.path === "/api/auth/verify-captcha" ||
    req.path === "/api/auth/send-verification" ||
    req.path === "/api/auth/send-password-reset"
  ) {
    if (authRateLimiter) {
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
      const identifier = Array.isArray(ip) ? ip[0] : ip;
      try {
        const { success } = await authRateLimiter.limit(identifier);
        if (!success) {
          return res.status(429).json({ error: "Preveč zahtev. Prosimo, poskusite kasneje." });
        }
      } catch (err) {
        console.warn("Rate limit check failed, skipping blocking:", err);
      }
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

function isPostalDelivery(method: any): boolean {
  if (typeof method !== 'string') return false;
  return ['post', 'shipping'].includes(method);
}

// Deutscher Kommentar: Zaehler pro Nutzer fuer Streitfaelle (nur serverseitig beschrieben, Sammlung user_dispute_stats)
async function bumpDisputeStat(uid: string | undefined, field: string) {
  if (!uid) return;
  try {
    await adminDb.collection('user_dispute_stats').doc(uid).set(
      { [field]: FieldValue.increment(1), last_event_at: new Date().toISOString(), user_id: uid },
      { merge: true }
    );
  } catch (e: any) {
    console.warn('[dispute-stats] Zaehler nicht aktualisiert:', e?.message);
  }
}

async function getDisputeStats(uid: string | undefined) {
  if (!uid) return { all: {} as any, not_received_180d: 0, disputes_180d: 0 };
  const statDoc = await safeGetDoc(adminDb.collection('user_dispute_stats').doc(uid));
  const since = Date.now() - 180 * 86400000;
  const snap = await safeGetDocs(adminDb.collection('disputes').where('opened_by_user_id', '==', uid));
  let notReceived = 0;
  let total = 0;
  for (const d of snap.docs) {
    const x: any = d.data();
    if (!x.created_at || new Date(x.created_at).getTime() < since) continue;
    total++;
    if (x.kind === 'not_received') notReceived++;
  }
  return { all: statDoc.data() || {}, not_received_180d: notReceived, disputes_180d: total };
}

async function refundTransactionToBuyer(txId: string, reason: string): Promise<{ ok: boolean; status: string }> {
  const txRef = adminDb.collection('transactions').doc(txId);
  const now = new Date().toISOString();

  try {
    const txResult = await adminDb.runTransaction(async (t) => {
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) return { ok: false, status: 'not_found', tx: null };
      const data = txDoc.data() || {};
      
      if (data.payout_status === 'paid_out') return { ok: false, status: 'already_paid_out', tx: null };
      if (data.payout_status === 'refunded') return { ok: true, status: 'already_refunded', tx: data };
      if (!['held', 'frozen', 'release_waiting_funds', 'release_failed'].includes(data.payout_status)) return { ok: false, status: 'cannot_refund', tx: data };
      
      return { ok: true, status: 'success', tx: data };
    });

    if (!txResult.ok) return { ok: false, status: txResult.status };
    const tx = txResult.tx;
    if (!tx) return { ok: false, status: txResult.status };

    const stripe = getStripe();
    const refund = await stripe.refunds.create({
      payment_intent: tx.stripe_payment_intent_id,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: { tx_id: txId }
    }, { idempotencyKey: 'refund_' + txId });

    await txRef.update({
      payout_status: 'refunded',
      refund_id: refund.id,
      refunded_at: now,
      refund_reason: reason,
      status: reason === 'seller_no_shipment' ? 'CANCELLED' : 'REFUNDED'
    });

    const buyerId = tx.buyer_id || tx.buyerId;
    if (buyerId) {
      await recordAmlSpend({ buyerId, amountEur: -tx.amount_total, uniqueKey: 'refund_' + txId });
    }

    return { ok: true, status: 'success' };
  } catch (err: any) {
    console.error(`[refundTransactionToBuyer] Error for tx ${txId}:`, err.message);
    return { ok: false, status: 'error' };
  }
}

// Deutscher Kommentar: Gibt die Guthaben fuer den Verkaeufer frei (setzt payout_status auf 'releasable'), ohne sofortige Stripe-Auszahlung
async function releaseSellerFunds(txId: string, reason: string) {
  const txRef = adminDb.collection('transactions').doc(txId);
  const nowMs = Date.now();
  const leaseUntil = nowMs + 30000;
  try {
    const txResult = await adminDb.runTransaction(async (t) => {
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) {
        return { ok: false, status: 'not_found', tx: null };
      }
      const data = txDoc.data() || {};
      
      if (data.payout_status === 'paid_out' || data.payout_status === 'releasable') {
        return { ok: true, status: data.payout_status, tx: data };
      }
      if (data.payout_status === 'frozen' || data.payout_status === 'refunded') {
        return { ok: false, status: data.payout_status, tx: data };
      }
      
      if (typeof data.payout_lease_until === 'number' && data.payout_lease_until > nowMs) {
        return { ok: false, status: 'leased', tx: data };
      }
      
      t.update(txRef, {
        payout_lease_until: leaseUntil
      });
      
      return { ok: true, status: 'leasing_success', tx: data };
    });

    if (!txResult.ok) {
      return { ok: false, status: txResult.status };
    }
    if (txResult.status === 'paid_out' || txResult.status === 'releasable') {
      return { ok: true, status: txResult.status };
    }
    
    const tx = txResult.tx;
    if (!tx) {
      return { ok: false, status: 'not_found' };
    }

    const nowIso = new Date().toISOString();
    await txRef.update({
      payout_status: 'releasable',
      status: 'COMPLETED',
      released_at: nowIso,
      release_reason: reason,
      payout_lease_until: 0
    });

    // Bewertung fuer automatisch abgeschlossene Auktionen freischalten
    if (tx.auction_id) {
      try {
        await adminDb.collection('auctions').doc(tx.auction_id).update({
          review_enabled: true
        });
      } catch (revErr: any) {
        console.warn('[releaseSellerFunds] Could not enable review on auction:', revErr.message);
      }
    }

    // E-Mail an Verkaeufer senden: "Sredstva so sproščena in na voljo za izplačilo"
    try {
      const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(tx.seller_id));
      const seller = sellerDoc.data();
      if (seller?.email && process.env.RESEND_API_KEY) {
        const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
        const auction = auctionDoc.data();
        const auctionTitleText = auction?.title?.SLO || auction?.title?.EN || 'Predmet dražbe';
        const netAmt = ((tx.seller_net_cents || 0) / 100).toFixed(2);

        const resendClient = new Resend(process.env.RESEND_API_KEY);
        await resendClient.emails.send({
          from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
          to: seller.email,
          subject: 'Sredstva so sproščena in na voljo za izplačilo',
          html: `<div style="font-family: sans-serif; color: #0A1128; padding: 20px;">
            <h2 style="color: #0A1128;">Sredstva so sproščena</h2>
            <p>Spoštovani,</p>
            <p>Sredstva v višini <strong>${netAmt} EUR</strong> za dražbo <strong>${auctionTitleText}</strong> so bila uspešno sproščena in so vam zdaj na voljo za izplačilo v nastavitvah profila.</p>
            <p>Izplačilo lahko zahtevate kadar koli (najmanj 10,00 €) ali pa se bo samodejno izvedlo po 30 dneh.</p>
            <p>Lep pozdrav,<br/>dražbe.si</p>
          </div>`
        });
      }
    } catch (emErr: any) {
      console.error('[releaseSellerFunds] Error sending release email:', emErr.message);
    }

    return { ok: true, status: 'releasable' };
  } catch (err: any) {
    console.error('[releaseSellerFunds] Unexpected error:', err.message);
    try {
      await txRef.update({ payout_lease_until: 0 });
    } catch (_) {}
    return { ok: false, status: 'unexpected_error' };
  }
}

// Abschluss nach Bestaetigung: Status COMPLETED und Freigabe der Mittel (releasable)
async function completeTransactionAndPayout(txRef: any, txId: string, reason: string) {
  const nowIso = new Date().toISOString();
  await txRef.update({
    status: 'COMPLETED',
    delivered_at: nowIso,
    completed_at: nowIso,
    auto_complete_at: null
  });
  try {
    await releaseSellerFunds(txId, reason);
  } catch (payErr: any) {
    console.error('[completeTransactionAndPayout] fund release failed:', payErr?.message);
  }
}

// Zufaellige 6-stellige PIN (kryptografisch sicher, nicht fortlaufend)
function generatePickupPin(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

// Deutscher Kommentar: Fuehrt ein zbirno izplačilo (Batch-Auszahlung) fuer alle releasable Transaktionen eines Verkaeufers aus
async function executeSellerBatchPayout(sellerId: string, trigger: 'manual' | 'auto') {
  const userRef = adminDb.collection('users').doc(sellerId);
  const userDoc = await safeGetDoc(userRef);
  const user = userDoc.data() || {};

  const stripeAccountId = user.stripe_account_id || user.stripeAccountId;
  if (!stripeAccountId || !user.stripe_onboarding_complete) {
    return { success: false, error: 'Račun za izplačila ni urejen.' };
  }

  // Deutscher Kommentar: Sperre bei automatischem Aufruf setzen
  if (trigger === 'auto') {
    const nowMs = Date.now();
    const leaseUntil = nowMs + 60000;
    const lockOk = await adminDb.runTransaction(async (t) => {
      const uDoc = await t.get(userRef);
      if (!uDoc.exists) return false;
      const uData = uDoc.data() || {};
      if (typeof uData.payout_request_lease_until === 'number' && uData.payout_request_lease_until > nowMs) {
        return false;
      }
      t.update(userRef, { payout_request_lease_until: leaseUntil });
      return true;
    }).catch(() => false);

    if (!lockOk) {
      return { success: false, error: 'Zahteva za izplačilo se že obdeluje ali zaklep ni uspel.' };
    }
  }

  try {
    // Deutscher Kommentar: Abfrage aller 'releasable' Transaktionen ohne orderBy in Firestore (Sortierung erfolgt im Speicher)
    const txSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('seller_id', '==', sellerId)
        .where('payout_status', '==', 'releasable')
    );

    if (txSnap.empty) {
      return { success: false, error: 'Ni sredstev na voljo za izplačilo.' };
    }

    const sortedDocs = txSnap.docs.slice().sort((a, b) => {
      const da = a.data() || {};
      const db = b.data() || {};
      const ta = new Date(da.released_at || da.completed_at || da.created_at || 0).getTime();
      const tb = new Date(db.released_at || db.completed_at || db.created_at || 0).getTime();
      return ta - tb;
    });

    const stripe = getStripe();
    let balance: Stripe.Balance;
    try {
      balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });
    } catch (balErr: any) {
      console.error('[executeSellerBatchPayout] Error retrieving balance:', balErr.message);
      return { success: false, error: 'Napaka pri preverjanju salda pri ponudniku plačil.' };
    }

    const availableEurCents = balance.available.find(b => b.currency === 'eur')?.amount || 0;

    let totalCents = 0;
    const includedTxs: any[] = [];

    for (const doc of sortedDocs) {
      const data = doc.data() || {};
      const net = data.seller_net_cents || 0;
      if (net <= 0) continue;

      if (trigger === 'manual' && totalCents + net > availableEurCents) {
        break;
      }
      if (trigger === 'auto') {
        const releasedAt = new Date(data.released_at || data.created_at || Date.now()).getTime();
        const ageDays = (Date.now() - releasedAt) / (1000 * 60 * 60 * 24);
        if (ageDays < PAYOUT_AUTO_DAYS) {
          continue;
        }
      }

      totalCents += net;
      includedTxs.push({ id: doc.id, ref: doc.ref, net });
    }

    if (includedTxs.length === 0) {
      return { success: false, error: 'Ni izpolnjenih pogojev za izplačilo.' };
    }

    if (trigger === 'manual' && totalCents < MIN_PAYOUT_CENTS) {
      return { success: false, error: `Najmanjši znesek za izplačilo je ${(MIN_PAYOUT_CENTS / 100).toFixed(2)} €.` };
    }

    if (trigger === 'auto' && totalCents < MIN_PAYOUT_CENTS) {
      return { success: false, error: 'Skupni znesek še ne dosega minimalnega zneska za samodejno izplačilo.' };
    }

    // Deutscher Kommentar: Idempotenter Hash ohne Date.now() aus sortierten Transaktions-IDs und Betrag
    const sortedIds = includedTxs.map(t => t.id).sort();
    const batchId = crypto.createHash('sha256').update(sortedIds.join(',') + '_' + totalCents).digest('hex').substring(0, 16);

    // Deutscher Kommentar: Vor dem Auszahlungsaufruf Status auf 'payout_pending' setzen
    const pendingAtIso = new Date().toISOString();
    const preBatch = adminDb.batch();
    for (const item of includedTxs) {
      preBatch.update(item.ref, {
        payout_status: 'payout_pending',
        payout_batch_id: batchId,
        payout_pending_at: pendingAtIso
      });
    }
    await preBatch.commit();

    try {
      const payout = await stripe.payouts.create({
        amount: totalCents,
        currency: 'eur',
        metadata: {
          seller_id: sellerId,
          tx_count: String(includedTxs.length),
          batch_id: batchId
        }
      }, {
        stripeAccount: stripeAccountId,
        idempotencyKey: 'batch_' + batchId
      });

      const paidOutAtIso = new Date().toISOString();
      const batchWrite = adminDb.batch();

      for (const item of includedTxs) {
        batchWrite.update(item.ref, {
          payout_status: 'paid_out',
          payout_id: payout.id,
          paid_out_at: paidOutAtIso
        });
      }

      await batchWrite.commit();

      if (user.email && process.env.RESEND_API_KEY) {
        try {
          const formattedAmount = (totalCents / 100).toFixed(2);
          const resendClient = new Resend(process.env.RESEND_API_KEY);
          await resendClient.emails.send({
            from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
            to: user.email,
            subject: 'Izplačilo izvedeno na bančni račun',
            html: `<div style="font-family: sans-serif; color: #0A1128; padding: 20px;">
              <h2 style="color: #0A1128;">Izplačilo uspešno izvedeno</h2>
              <p>Spoštovani,</p>
              <p>Vaše zbirno izplačilo v višini <strong>${formattedAmount} EUR</strong> (vključno s/za ${includedTxs.length} dražbami) je bilo uspešno posredovano na vaš bančni račun.</p>
              <p>Denar bo prispel na vaš račun v 1 do 3 delovnih dneh.</p>
              <p>Hvala, ker uporabljate dražbe.si!</p>
            </div>`
          });
        } catch (mailErr: any) {
          console.error('[executeSellerBatchPayout] Error sending payout email:', mailErr.message);
        }
      }

      return { success: true, payoutId: payout.id, totalCents, count: includedTxs.length };
    } catch (stripeErr: any) {
      console.error('[executeSellerBatchPayout] Stripe Payout failed:', stripeErr.message);
      let userMessage = formatStripeError(stripeErr).userMessage;
      const rawMsg = (stripeErr?.message || '').toLowerCase();
      if (stripeErr?.code === 'account_invalid' || stripeErr?.code === 'external_account_not_found' || rawMsg.includes('external account') || rawMsg.includes('bank account') || rawMsg.includes('no attached bank account') || rawMsg.includes('no bank account') || rawMsg.includes('destination')) {
        userMessage = "Najprej dodajte bančni račun v nastavitvah izplačil.";
      }

      const errBatch = adminDb.batch();
      for (const item of includedTxs) {
        errBatch.update(item.ref, {
          payout_status: 'releasable',
          payout_last_error: userMessage
        });
      }
      await errBatch.commit().catch(() => {});
      return { success: false, error: userMessage };
    }
  } finally {
    if (trigger === 'auto') {
      await userRef.update({ payout_request_lease_until: 0 }).catch(() => {});
    }
  }
}

// POST /api/seller/request-payout
app.post("/api/seller/request-payout", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  const userRef = adminDb.collection('users').doc(uid);
  const nowMs = Date.now();
  const leaseUntil = nowMs + 60000;

  try {
    const lockResult = await adminDb.runTransaction(async (t) => {
      const uDoc = await t.get(userRef);
      if (!uDoc.exists) {
        return { ok: false, error: 'Uporabnik ne obstaja.' };
      }
      const data = uDoc.data() || {};
      if (data.isBlocked) {
        return { ok: false, error: 'Vaš račun je blokiran.' };
      }
      if (!data.stripe_onboarding_complete) {
        return { ok: false, error: 'Izplačila še niso urejena.' };
      }

      const lastReq = data.last_payout_requested_at ? new Date(data.last_payout_requested_at).getTime() : 0;
      if (nowMs - lastReq < 24 * 60 * 60 * 1000) {
        return { ok: false, error: 'Izplačilo ste že zahtevali danes. Prosimo, poskusite jutri.' };
      }

      if (typeof data.payout_request_lease_until === 'number' && data.payout_request_lease_until > nowMs) {
        return { ok: false, error: 'Zahteva za izplačilo se že obdeluje. Prosimo, počakajte.' };
      }

      t.update(userRef, {
        payout_request_lease_until: leaseUntil
      });

      return { ok: true };
    });

    if (!lockResult.ok) {
      return res.status(400).json({ error: lockResult.error });
    }

    try {
      await assertVerifiedUser(uid, await (await userRef.get()).data() || {});
    } catch (verErr: any) {
      await userRef.update({ payout_request_lease_until: 0 });
      return res.status(403).json({ error: verErr.message });
    }

    const batchRes = await executeSellerBatchPayout(uid, 'manual');

    await userRef.update({
      payout_request_lease_until: 0,
      ...(batchRes.success ? { last_payout_requested_at: new Date().toISOString() } : {})
    });

    if (!batchRes.success) {
      return res.status(400).json({ error: batchRes.error });
    }

    return res.json({ success: true, totalCents: batchRes.totalCents, count: batchRes.count });
  } catch (err: any) {
    console.error('Error in request-payout:', err);
    try {
      await userRef.update({ payout_request_lease_until: 0 });
    } catch (_) {}
    return res.status(500).json({ error: err.message || 'Napaka pri obdelavi izplačila.' });
  }
});


// Deutscher Kommentar: Erstellt oder laedt Abhol-PIN und QR-Token idempotent in Transaktionsgeheimnissen
async function getOrCreatePickupSecrets(txId: string, auctionId: string): Promise<{ pin: string; qrUrl: string }> {
  const secretRef = adminDb.collection('transaction_secrets').doc(txId);
  return adminDb.runTransaction(async (t) => {
    const snap = await t.get(secretRef);
    const existing = snap.exists ? (snap.data() || {}) : null;
    let pin = existing && existing.pickup_pin ? String(existing.pickup_pin) : generatePickupPin();
    let qrToken = existing && existing.pickup_qr_token ? String(existing.pickup_qr_token) : crypto.randomBytes(32).toString('base64url');
    if (!existing || !existing.pickup_pin || !existing.pickup_qr_token) {
      t.set(secretRef, {
        pickup_pin: pin,
        pickup_qr_token: qrToken,
        failed_attempts: existing?.failed_attempts || 0,
        lock_count: existing?.lock_count || 0,
        locked_until: existing?.locked_until || 0,
        created_at: existing?.created_at || new Date().toISOString()
      }, { merge: true });
    }
    const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
    const qrUrl = `${baseAppUrl}/?prevzem=${auctionId}&t=${qrToken}`;
    return { pin, qrUrl };
  });
}

// PIN je Transaktion einmalig anlegen (idempotent), nur serverseitig lesbar
async function getOrCreatePickupPin(txId: string): Promise<string> {
  const txDoc = await safeGetDoc(adminDb.collection('transactions').doc(txId));
  const auctionId = txDoc.exists() ? txDoc.data()?.auction_id : txId;
  const secrets = await getOrCreatePickupSecrets(txId, auctionId);
  return secrets.pin;
}

// Deutscher Kommentar: Schliesst die Abholung ab, transferiert Escrow-Geld und sendet Verkaeufer-Mail
async function completePickupHandover(txRef: FirebaseFirestore.DocumentReference, txDocId: string, tx: any, source: string) {
  await completeTransactionAndPayout(txRef, txDocId, source);

  await adminDb.collection('auctions').doc(tx.auction_id).update({
    buyer_received: true,
    received_at: new Date().toISOString(),
    receipt_confirmed_at: new Date().toISOString(),
    post_auction_status: 'delivered',
    review_enabled: true
  });

  await adminDb.collection('transaction_secrets').doc(txDocId).set({
    pickup_qr_token: null,
    pickup_pin: null,
    verified_at: new Date().toISOString()
  }, { merge: true });

  try {
    const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(tx.seller_id));
    const seller = sellerDoc.data();
    const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
    const auction = auctionDoc.data();

    if (seller?.email && process.env.RESEND_API_KEY) {
      const auctionTitleText = auction?.title?.SLO || auction?.title?.EN || 'Predmet dražbe';
      const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
      const auctionUrl = `${baseAppUrl}/?drazba=${tx.auction_id}`;
      
      const htmlContent = await render(React.createElement(AuctionEmailTemplate, {
        type: 'item_delivered_seller',
        recipientName: seller.first_name || seller.name || 'prodajalec',
        auctionTitle: auctionTitleText,
        auctionImageUrl: auction?.images?.[0]?.url || auction?.images?.[0],
        currentPrice: tx.item_price,
        auctionUrl,
        settingsUrl: `${baseAppUrl}/?tab=settings`
      }));

      const resendClient = new Resend(process.env.RESEND_API_KEY);
      await resendClient.emails.send({
        from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
        to: seller.email,
        subject: `Predaja potrjena: ${auctionTitleText} - dražbenik.si`,
        html: htmlContent
      });
    }
  } catch (emErr: any) {
    console.error('[completePickupHandover] Error sending email:', emErr.message);
  }
}

async function finalizeAuctionPayment(params: {
  auctionId: string;
  buyerId: string;
  sellerId: string;
  paymentRef: string;
  amountTotalCents: number;
  stripeSessionId?: string;
}): Promise<{ alreadyProcessed: boolean }> {
  const { auctionId, buyerId, sellerId, paymentRef, amountTotalCents, stripeSessionId } = params;
  const txDocRef = adminDb.collection('transactions').doc(`tx_${paymentRef}`);

  const nowMs = Date.now();
  const leaseUntil = nowMs + 120000;

  const txResult = await adminDb.runTransaction(async (t) => {
    const txDoc = await t.get(txDocRef);
    if (txDoc.exists) {
      const data = txDoc.data() || {};
      if (data.finalized === true) {
        return { alreadyProcessed: true };
      }
      if (data.finalized !== true && typeof data.lease_until === 'number' && data.lease_until > nowMs) {
        return { alreadyProcessed: true };
      }
      t.set(txDocRef, {
        lease_until: leaseUntil,
        status: 'processing',
        finalized: false,
        stripe_payment_intent_id: paymentRef,
        ...(stripeSessionId ? { stripe_session_id: stripeSessionId } : {}),
        auction_id: auctionId,
        buyer_id: buyerId,
        seller_id: sellerId
      }, { merge: true });
    } else {
      t.set(txDocRef, {
        auction_id: auctionId,
        buyer_id: buyerId,
        seller_id: sellerId,
        stripe_payment_intent_id: paymentRef,
        ...(stripeSessionId ? { stripe_session_id: stripeSessionId } : {}),
        status: 'processing',
        finalized: false,
        lease_until: leaseUntil,
        created_at: new Date().toISOString()
      });
    }
    return { alreadyProcessed: false };
  });

  if (txResult.alreadyProcessed) {
    return { alreadyProcessed: true };
  }

  try {
    const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(buyerId));
    const buyer = buyerDoc.data() || {};
    const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(sellerId));
    const seller = sellerDoc.data();

    if (!buyer || !seller) throw new Error('Buyer or seller not found');

    let itemCents = 0;
    let feeCents = 0;
    let vatCents = 0;
    let vatRate = 22;
    let isReverseCharge = false;
    let meta: any = {};

    try {
      const stripe = getStripe();
      if (stripeSessionId) {
        const sess = await stripe.checkout.sessions.retrieve(stripeSessionId, { expand: ['payment_intent'] });
        meta = sess.metadata || {};
        if (!meta.item_cents && sess.payment_intent && typeof sess.payment_intent === 'object') {
          meta = { ...meta, ...(sess.payment_intent.metadata || {}) };
        }
      } else if (paymentRef && paymentRef.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(paymentRef);
        meta = pi.metadata || {};
      }
    } catch (e) {}

    itemCents = Number(meta.item_cents);
    feeCents = Number(meta.fee_cents);
    vatCents = Number(meta.vat_cents);
    vatRate = meta.vat_rate !== undefined ? Number(meta.vat_rate) : 22;
    isReverseCharge = meta.reverse_charge === '1' || meta.reverse_charge === true;

    const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(auctionId));
    const auction = auctionDoc.data() || {};

    // Deutscher Kommentar: Schutz vor Doppelzahlung - wenn Auktion bereits bezahlt wurde
    if (auction.payment_status === 'paid' || auction.post_auction_status === 'paid') {
      const stripe = getStripe();
      let piToRefund = paymentRef.startsWith('pi_') ? paymentRef : '';
      if (!piToRefund && stripeSessionId) {
        try {
          const sObj = await stripe.checkout.sessions.retrieve(stripeSessionId);
          piToRefund = typeof sObj.payment_intent === 'string' ? sObj.payment_intent : sObj.payment_intent?.id || '';
        } catch (e) {}
      }
      if (!piToRefund && paymentRef.startsWith('cs_')) {
        try {
          const sObj = await stripe.checkout.sessions.retrieve(paymentRef);
          piToRefund = typeof sObj.payment_intent === 'string' ? sObj.payment_intent : sObj.payment_intent?.id || '';
        } catch (e) {}
      }

      let isDuplicate = false;
      if (auction.paid_payment_ref) {
        // Deutscher Kommentar: Pruefen, ob die Referenz oder die PaymentIntent-ID sich von der bezahlten unterscheidet
        const differsFromRef = auction.paid_payment_ref !== paymentRef;
        const differsFromPi = !piToRefund || auction.paid_payment_ref !== piToRefund;
        if (differsFromRef && differsFromPi) {
          isDuplicate = true;
        }
      } else {
        // Deutscher Kommentar: Fallback fuer fruehere Auktionen ohne paid_payment_ref
        const currentTxSnap = await safeGetDoc(txDocRef);
        const currentTxData = currentTxSnap.data() || {};
        if (currentTxData.finalized === true) {
          return { alreadyProcessed: true };
        }
        const otherTxSnap = await adminDb.collection('transactions')
          .where('auction_id', '==', auctionId)
          .where('finalized', '==', true)
          .limit(1)
          .get();
        if (!otherTxSnap.empty) {
          const otherTx = otherTxSnap.docs[0].data();
          const otherPi = otherTx.stripe_payment_intent_id;
          if (otherPi && otherPi !== paymentRef && (!piToRefund || otherPi !== piToRefund)) {
            isDuplicate = true;
          }
        }
      }

      if (!isDuplicate) {
        return { alreadyProcessed: true };
      }

      console.warn(`[finalizeAuctionPayment] Auktion ${auctionId} ist bereits bezahlt. Rueckerstattung der Doppelzahlung fuer ${paymentRef}`);

      let refundResult: Stripe.Refund | null = null;
      let refundError: string | null = null;

      if (piToRefund) {
        try {
          refundResult = await stripe.refunds.create(
            {
              payment_intent: piToRefund,
              reverse_transfer: true,
              refund_application_fee: true,
              reason: 'duplicate',
              metadata: {
                auction_id: auctionId,
                duplicate_of: auction.paid_payment_ref || auction.paid_at || 'already_paid'
              }
            },
            {
              idempotencyKey: 'dup_refund_' + piToRefund
            }
          );
          console.log(`[finalizeAuctionPayment] Rueckerstattung erfolgreich: ${refundResult.id} fuer Auktion ${auctionId}`);
        } catch (refErr: any) {
          refundError = refErr.message || String(refErr);
          console.error(`[finalizeAuctionPayment] Fehler bei automatischer Rueckerstattung der Doppelzahlung:`, refundError);
        }
      } else {
        refundError = 'Missing payment intent id to refund';
        console.error(`[finalizeAuctionPayment] Keine PaymentIntent-ID fuer Rueckerstattung gefunden (${paymentRef})`);
      }

      // Deutscher Kommentar: Audit-Dokument duplicate_payments schreiben
      try {
        await adminDb.collection('duplicate_payments').doc(paymentRef).set({
          auction_id: auctionId,
          buyer_id: buyerId,
          payment_ref: paymentRef,
          ...(refundResult?.id ? { refund_id: refundResult.id } : {}),
          ...(refundError ? { error: refundError } : {}),
          amount: amountTotalCents / 100,
          created_at: new Date().toISOString()
        });
      } catch (auditErr: any) {
        console.error('[finalizeAuctionPayment] Error creating duplicate_payments audit doc:', auditErr.message);
      }

      await txDocRef.set({
        status: 'duplicate_refunded',
        finalized: true,
        duplicate_refunded: true,
        auction_id: auctionId,
        buyer_id: buyerId,
        amount_total: amountTotalCents / 100,
        refunded_at: new Date().toISOString(),
        ...(refundResult?.id ? { refund_id: refundResult.id } : {}),
        ...(refundError ? { refund_error: refundError } : {}),
        note: 'Dražba je že bila plačana z drugim plačilom.'
      }, { merge: true });

      try {
        await adminDb.collection('aml_reservations').doc(`${buyerId}_${auctionId}`).set({
          status: 'released',
          released_at: new Date().toISOString(),
          release_reason: 'duplicate_payment_refunded'
        }, { merge: true });
      } catch (e) {}

      const formattedAmount = (amountTotalCents / 100).toFixed(2) + ' €';
      const auctionTitle = auction.title?.SLO || (typeof auction.title === 'string' ? auction.title : (auction.title?.EN || 'Dražba'));

      // Deutscher Kommentar: E-Mail an den Kaeufer bei automatischer Rueckerstattung
      if (process.env.RESEND_API_KEY && buyer.email && refundResult?.id) {
        try {
          const resendClient = new Resend(process.env.RESEND_API_KEY);
          await resendClient.emails.send({
            from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
            to: buyer.email,
            subject: 'Dvojno plačilo je bilo samodejno povrnjeno - drazbe.si',
            html: `
              <div style="font-family: sans-serif; line-height: 1.5; color: #1E293B;">
                <h2 style="color: #0A1128;">Dvojno plačilo je bilo samodejno povrnjeno</h2>
                <p>Spoštovani,</p>
                <p>obveščamo vas, da smo zaznali dvojno plačilo za dražbo <strong>${auctionTitle}</strong> v znesku <strong>${formattedAmount}</strong>.</p>
                <p>Znesek bo na vašem računu v nekaj dneh.</p>
                <p>Lep pozdrav,<br/>Ekipa drazbe.si</p>
              </div>
            `
          });
        } catch (mailErr: any) {
          console.error('[finalizeAuctionPayment] Error sending buyer refund email:', mailErr.message);
        }
      }

      // Deutscher Kommentar: Benachrichtigung an Admin ueber Rueckerstattung oder Fehler
      if (process.env.RESEND_API_KEY && adminEmailAddress) {
        try {
          const resendClient = new Resend(process.env.RESEND_API_KEY);
          const originalRef = auction.paid_payment_ref || 'Neznano';
          if (refundResult?.id) {
            await resendClient.emails.send({
              from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
              to: adminEmailAddress,
              subject: `Podvojeno plačilo samodejno povrnjeno - dražba ${auctionId}`,
              html: `
                <div style="font-family: sans-serif; line-height: 1.5; color: #1E293B;">
                  <h3>Podvojeno plačilo je bilo samodejno povrnjeno</h3>
                  <p><strong>Dražba:</strong> ${auctionId}</p>
                  <p><strong>Prvotno plačilo:</strong> ${originalRef}</p>
                  <p><strong>Podvojeno plačilo:</strong> ${paymentRef}</p>
                  <p><strong>ID vračila:</strong> ${refundResult.id}</p>
                  <p><strong>Znesek:</strong> ${formattedAmount}</p>
                </div>
              `
            });
          } else if (refundError) {
            await resendClient.emails.send({
              from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
              to: adminEmailAddress,
              subject: `POZOR: Napaka pri vračilu podvojenega plačila - dražba ${auctionId}`,
              html: `
                <div style="font-family: sans-serif; line-height: 1.5; color: #1E293B;">
                  <h3 style="color: #EF4444;">Napaka pri samodejnem vračilu podvojenega plačila</h3>
                  <p><strong>Dražba:</strong> ${auctionId}</p>
                  <p><strong>Prvotno plačilo:</strong> ${originalRef}</p>
                  <p><strong>Podvojeno plačilo:</strong> ${paymentRef}</p>
                  <p><strong>Napaka:</strong> ${refundError}</p>
                  <p><strong>Znesek:</strong> ${formattedAmount}</p>
                  <p>Potrebno je ročno posredovanje.</p>
                </div>
              `
            });
          }
        } catch (adminMailErr: any) {
          console.error('[finalizeAuctionPayment] Error sending admin duplicate email:', adminMailErr.message);
        }
      }

      return { alreadyProcessed: true };
    }
    let currentPrice = amountTotalCents / 100;
    if (auction.current_price || auction.currentBid || auction.starting_price) {
      currentPrice = Number(auction.current_price || auction.currentBid || auction.starting_price);
    }
    const authoritativePriceInCents = Math.round(currentPrice * 100);

    if (isNaN(itemCents) || itemCents <= 0) {
      const computed = await computeBuyerTotals(buyerId, buyer, authoritativePriceInCents);
      itemCents = computed.itemPriceCents;
      feeCents = computed.feeCents;
      vatCents = computed.vatCents;
      vatRate = computed.vatRate;
      isReverseCharge = computed.isReverseCharge;
    }

    const expectedTotalCents = itemCents + feeCents + vatCents;
    let amountMismatch = false;
    if (expectedTotalCents !== amountTotalCents) {
      amountMismatch = true;
      console.error(`[finalizeAuctionPayment] Amount mismatch! expectedTotalCents=${expectedTotalCents}, amountTotalCents=${amountTotalCents}`, { auctionId, buyerId });
    }

    const itemPrice = itemCents / 100;
    const platformFee = feeCents / 100;
    const vatAmount = vatCents / 100;
    const amountTotal = amountTotalCents / 100;

    const currentTxSnap = await safeGetDoc(txDocRef);
    const existingTxData = currentTxSnap.data() || {};
    let salesInvoiceNo = existingTxData.sales_invoice_no;
    let commissionInvoiceNo = existingTxData.commission_invoice_no;

    const nowIso = new Date().toISOString();
    const holdDeadlineIso = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString();
    const sellerStripeAccountId = seller.stripe_account_id || seller.stripeAccountId || '';
    
    // Deutscher Kommentar: Liefermethode aus Auktion uebernehmen oder aus delivery_option ableiten
    let deliveryMethod = auction.delivery_method || auction.selected_delivery || null;
    let derivedMethod: string | null = null;
    if (!deliveryMethod) {
      if (auction.delivery_option === 'pickup_only') {
        derivedMethod = 'pickup';
      } else if (auction.delivery_option === 'shipping_only') {
        derivedMethod = 'post';
      }
      if (derivedMethod) {
        deliveryMethod = derivedMethod;
      }
    }

    const autoReleaseAtIso = deliveryMethod === 'pickup'
      ? new Date(Date.now() + PICKUP_AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const makeSnapshot = (user: any) => {
      const street = user.street_address || user.street || user.company_street || user.companyStreet || '';
      const postal = user.postal_code || user.postalCode || user.company_postal_code || user.companyPostalCode || '';
      const city = user.city || user.company_city || user.companyCity || '';
      
      const firstName = user.first_name || user.firstName || '';
      const lastName = user.last_name || user.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim() || user.name || user.username || user.userName || '';

      return {
        preferred_language: user.preferred_language || 'SLO',
        name: fullName,
        company_name: user.company_name || user.companyName || '',
        address: street,
        postal_code: postal,
        city: city,
        country_code: user.country_code || user.countryCode || user.country || 'SI',
        tax_id: user.tax_id || user.tax_number || user.taxNumber || user.taxId || '',
        vat_id: user.vat_id || user.vatId || '',
        registration_number: user.registration_number || user.regNumber || user.registrationNumber || '',
        user_type: user.user_type || user.userType || 'individual',
        vat_status: user.vat_status || user.vatStatus || (user.user_type === 'business' ? 'exempt_small' : 'private'),
        email: user.email || ''
      };
    };

    const buyerSnapshot = makeSnapshot(buyer);
    const sellerSnapshot = makeSnapshot(seller);

    await txDocRef.set({
      amount_total: amountTotal,
      platform_fee: platformFee,
      vat_amount: vatAmount,
      vat_rate: vatRate,
      is_reverse_charge: isReverseCharge,
      item_price: itemPrice,
      status: 'HELD_IN_ESCROW',
      payout_status: 'held',
      seller_net_cents: itemCents,
      seller_stripe_account_id: sellerStripeAccountId,
      held_since: nowIso,
      delivery_method: deliveryMethod || null,
      ...(deliveryMethod === 'post' || deliveryMethod === 'shipping' ? { shipping_deadline: new Date(Date.now() + SHIP_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString() } : {}),
      auto_release_at: autoReleaseAtIso,
      hold_deadline_at: holdDeadlineIso,
      buyer_snapshot: buyerSnapshot,
      seller_snapshot: sellerSnapshot,
      ...(amountMismatch ? { amount_mismatch: true } : {})
    }, { merge: true });

    if (deliveryMethod === 'post' || deliveryMethod === 'shipping') {
      // Deutscher Kommentar: Verkaeufer in der App informieren, dass bezahlt wurde und der Versand erfolgen muss
      try {
        const nAuctionSnap = await safeGetDoc(adminDb.collection('auctions').doc(auctionId));
        const nAuction: any = nAuctionSnap.exists() ? nAuctionSnap.data() : {};
        await createNotification({
          userId: sellerId,
          type: 'shipping_required',
          auctionId,
          auctionTitle: nAuction?.title?.SLO || 'Predmet dražbe',
          imageUrl: nAuction?.images?.[0]?.url || nAuction?.images?.[0] || '',
          price: itemPrice,
          message: `Dražba je zaključena in kupec je plačal. Predmet pošljite v ${SHIP_DEADLINE_DAYS} dneh in označite odpremo.`,
          target: 'sold'
        });
      } catch (nErr: any) {
        console.error('[finalizeAuctionPayment] shipping notification failed:', nErr?.message);
      }
    }

    if (deliveryMethod === 'pickup') {
      try {
        await getOrCreatePickupPin(txDocRef.id);
      } catch (pinErr: any) {
        console.error('[finalizeAuctionPayment] Error creating pickup PIN:', pinErr?.message);
      }
    }

    const auctionFinalUpdate: any = {
      status: 'completed',
      payment_status: 'paid',
      post_auction_status: 'paid',
      paid_at: new Date().toISOString(),
      paid_payment_ref: paymentRef,
      bank_transfer_pending: false,
      bank_transfer_session_id: null,
      bank_transfer_deadline_at: null
    };

    // Deutscher Kommentar: Wenn abgeleitet, delivery_method und selected_delivery auf dem Auktionsdokument speichern
    if (derivedMethod) {
      auctionFinalUpdate.delivery_method = derivedMethod;
      auctionFinalUpdate.selected_delivery = derivedMethod;
    }

    await adminDb.collection('auctions').doc(auctionId).update(auctionFinalUpdate);

    await recordSaleCompletion(auctionId, sellerId);

    try {
      await recordAmlSpend({
        buyerId: buyerId,
        amountEur: amountTotal,
        uniqueKey: 'pi_' + paymentRef
      });
    } catch (spentErr: any) {
      console.error('Error updating buyer spending records:', spentErr.message);
    }

    try {
      const reservationDocRef = adminDb.collection('aml_reservations').doc(`${buyerId}_${auctionId}`);
      const reservationDoc = await safeGetDoc(reservationDocRef);
      if (reservationDoc.exists()) {
        await reservationDocRef.set({
          status: 'consumed',
          consumed_at: new Date().toISOString(),
          stripe_payment_intent_id: paymentRef
        }, { merge: true });
      }
    } catch (resErr: any) {
      console.error('[finalizeAuctionPayment] Error consuming AML reservation:', resErr.message);
    }

    if (!salesInvoiceNo || !commissionInvoiceNo) {
      try {
        salesInvoiceNo = await generateInvoiceNumber('SALES');
        commissionInvoiceNo = await generateInvoiceNumber('COMMISSION');
        await txDocRef.update({
          sales_invoice_no: salesInvoiceNo,
          commission_invoice_no: commissionInvoiceNo
        });
      } catch (e: any) {
        console.error('Error generating invoice numbers:', e.message);
      }
    }

    const txSnapFinal = await safeGetDoc(txDocRef);
    const transactionRecord = { id: txDocRef.id, ...txSnapFinal.data() };

    try {
      const documentsToInsert: any[] = [];
      const attachments: any[] = [];
      let auctionDataPdf: any = null;

      const auctionDocPdf = await safeGetDoc(adminDb.collection('auctions').doc(auctionId));
      auctionDataPdf = auctionDocPdf.data();

      let invoicePdfBuffer: Buffer | null = null;
      try {
        invoicePdfBuffer = await generateInvoicePDF(transactionRecord, buyerSnapshot, sellerSnapshot, auctionDataPdf, salesInvoiceNo, commissionInvoiceNo);
      } catch (pdfErr: any) {
        if (pdfErr.message && pdfErr.message.includes('MISSING_REQUIRED_INVOICE_FIELDS')) {
          console.error('[finalizeAuctionPayment] Missing invoice fields, marking review required:', pdfErr.message);
          await txDocRef.update({
            invoice_review_required: true,
            invoice_review_reason: pdfErr.message
          });
          try {
            await adminDb.collection('admin_alerts').add({
              type: 'INVOICE_REVIEW_REQUIRED',
              transaction_id: txDocRef.id,
              reason: pdfErr.message,
              created_at: new Date().toISOString()
            });
          } catch (alertErr: any) {
            console.error('Failed to create admin alert for invoice review:', alertErr.message);
          }
        } else {
          throw pdfErr;
        }
      }

      if (invoicePdfBuffer) {
        const invoiceFileName = `racun_${salesInvoiceNo}.pdf`;
        const invoicePath = await uploadBufferToStorage(invoicePdfBuffer, `${buyerId}/${invoiceFileName}`);
        documentsToInsert.push({
          transaction_id: txDocRef.id,
          user_id: buyerId,
          auction_id: auctionId,
          type: 'invoice',
          invoice_path: invoicePath,
          created_at: new Date().toISOString()
        });

        attachments.push({
          filename: invoiceFileName,
          content: invoicePdfBuffer
        });

        if (documentsToInsert.length > 0) {
          const batch = adminDb.batch();
          documentsToInsert.forEach(d => {
            const ref = adminDb.collection('documents').doc();
            batch.set(ref, d);
          });
          await batch.commit();
        }

        // Deutscher Kommentar: Buchhalterische Archivierung fuer SALES und COMMISSION gemaess DEL C
        try {
          const itemPrice = Number(transactionRecord.item_price ?? (transactionRecord.amount_total || 0));
          const salesGrossCents = transactionRecord.item_cents ?? Math.round(itemPrice * 100);

          const sSnap: any = sellerSnapshot;
          const bSnap: any = buyerSnapshot;
          const sType = sSnap.user_type || sSnap.userType || 'individual';
          const isSellerBusiness = sType === 'business';
          const sellerVatStatus = sSnap.vat_status || sSnap.vatStatus || (isSellerBusiness ? 'exempt_small' : 'private');
          const buyerCountry = (bSnap.country_code || bSnap.countryCode || bSnap.country || 'SI').trim().toUpperCase();
          const buyerTaxId = bSnap.tax_id || bSnap.taxId || bSnap.vat_id || bSnap.vatId || '';
          const isReverseChargeSales = isSellerBusiness && sellerVatStatus === 'payer' && buyerCountry !== 'SI' && buyerTaxId;
          let salesVatRate = 0;
          let salesNetCents = salesGrossCents;
          let salesVatCents = 0;
          if (isSellerBusiness && sellerVatStatus === 'payer' && !isReverseChargeSales) {
            salesVatRate = 22;
            salesNetCents = Math.round(salesGrossCents / 1.22);
            salesVatCents = salesGrossCents - salesNetCents;
          }

          // Deutscher Kommentar: Separates Verkaufsrechnungs-PDF generieren und archivieren
          const salesPdf = await generateInvoicePDF(transactionRecord, buyerSnapshot, sellerSnapshot, auctionDataPdf, salesInvoiceNo, commissionInvoiceNo, 'sales');
          await archiveAccountingDocument({
            type: 'SALES',
            invoiceNo: salesInvoiceNo,
            issuedAt: auctionDataPdf?.paid_at || new Date(),
            pdfBuffer: salesPdf,
            netCents: salesNetCents,
            vatCents: salesVatCents,
            grossCents: salesGrossCents,
            vatRate: salesVatRate,
            buyerId: buyerId,
            sellerId: auctionDataPdf?.sellerId || auctionDataPdf?.seller_id || '',
            transactionId: txDocRef.id,
            auctionId: auctionId,
            issuer: 'seller_on_behalf'
          });

          // Deutscher Kommentar: Provisionsrechnungswerte berechnen
          const commNetCents = Math.round(Number(transactionRecord.platform_fee ?? ((itemPrice * 0.10) / 1.22)) * 100);
          const commVatRate = transactionRecord.vat_rate !== undefined ? Number(transactionRecord.vat_rate) : 22;
          const commVatCents = Math.round(Number(transactionRecord.vat_amount ?? (commNetCents * (commVatRate / 100))) * 100);
          const commGrossCents = commNetCents + commVatCents;

          // Deutscher Kommentar: Separates Provisionsrechnungs-PDF generieren und archivieren
          const commPdf = await generateInvoicePDF(transactionRecord, buyerSnapshot, sellerSnapshot, auctionDataPdf, salesInvoiceNo, commissionInvoiceNo, 'commission');
          await archiveAccountingDocument({
            type: 'COMMISSION',
            invoiceNo: commissionInvoiceNo,
            issuedAt: auctionDataPdf?.paid_at || new Date(),
            pdfBuffer: commPdf,
            netCents: commNetCents,
            vatCents: commVatCents,
            grossCents: commGrossCents,
            vatRate: commVatRate,
            buyerId: buyerId,
            sellerId: '',
            transactionId: txDocRef.id,
            auctionId: auctionId,
            issuer: 'platform'
          });
        } catch (archiveErr: any) {
          console.error('[finalizeAuctionPayment] Fehler bei Buchhaltungsarchivierung:', archiveErr.message);
          try {
            await txDocRef.update({ accounting_archive_failed: true });
          } catch (updateErr: any) {
            console.error('[finalizeAuctionPayment] Fehler beim Setzen von accounting_archive_failed:', updateErr.message);
          }
        }

        if (buyer.email && process.env.RESEND_API_KEY) {
          const auctionTitleText = auctionDataPdf?.title?.SLO || auctionDataPdf?.title?.EN || 'Predmet dražbe';
          const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
          const auctionUrl = `${baseAppUrl}/?drazba=${auctionId}`;
          
          const htmlContent = await render(React.createElement(AuctionEmailTemplate, {
            type: 'payment_success',
            recipientName: buyer.first_name || buyer.name || 'uporabnik',
            auctionTitle: auctionTitleText,
            auctionImageUrl: auctionDataPdf?.images?.[0]?.url,
            currentPrice: transactionRecord.amount_total,
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
        }

        if (seller.email && process.env.RESEND_API_KEY) {
          const auctionTitleText = auctionDataPdf?.title?.SLO || auctionDataPdf?.title?.EN || 'Predmet dražbe';
          const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
          const auctionUrl = `${baseAppUrl}/?drazba=${auctionId}`;
          
          const htmlContent = await render(React.createElement(AuctionEmailTemplate, {
            type: 'payment_received_seller',
            recipientName: seller.first_name || seller.name || 'prodajalec',
            auctionTitle: auctionTitleText,
            auctionImageUrl: auctionDataPdf?.images?.[0]?.url,
            currentPrice: transactionRecord.item_price,
            auctionUrl,
            settingsUrl: `${baseAppUrl}/?tab=settings`,
            paymentDeadline: `${SHIP_DEADLINE_DAYS} dni`
          }));

          const resendClient = new Resend(process.env.RESEND_API_KEY);
          await resendClient.emails.send({
            from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
            to: seller.email,
            subject: `Novo plačilo prejeto: ${auctionTitleText} - dražbenik.si`,
            html: htmlContent
          });
        }
      }
    } catch (docEmailErr: any) {
      console.error('[finalizeAuctionPayment] Error generating docs or sending email:', docEmailErr.message);
    }

    let stripeChargeId: string | null = null;
    let stripeTransferId: string | null = null;
    let transferMissing = false;

    try {
      const stripe = getStripe();
      let piId = paymentRef;
      if (stripeSessionId && (!piId || !piId.startsWith('pi_'))) {
        const sess = await stripe.checkout.sessions.retrieve(stripeSessionId, { expand: ['payment_intent'] });
        if (sess.payment_intent) {
          piId = typeof sess.payment_intent === 'string' ? sess.payment_intent : sess.payment_intent.id;
        }
      }
      if (piId && piId.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
        const charge = pi.latest_charge as any;
        if (charge && typeof charge === 'object') {
          stripeChargeId = charge.id;
          if (charge.transfer) {
            stripeTransferId = typeof charge.transfer === 'string' ? charge.transfer : charge.transfer.id;
          }
        }
      }
    } catch (stErr: any) {
      console.error('[finalizeAuctionPayment] Error retrieving PaymentIntent/Charge for transfer IDs:', stErr.message);
    }

    if (!stripeTransferId) {
      console.error('[finalizeAuctionPayment] Missing transfer ID for charge:', stripeChargeId, 'paymentRef:', paymentRef);
      transferMissing = true;
    }

    await txDocRef.update({
      ...(stripeChargeId ? { stripe_charge_id: stripeChargeId } : {}),
      ...(stripeTransferId ? { stripe_transfer_id: stripeTransferId } : {}),
      ...(transferMissing ? { transfer_missing: true } : {}),
      status: 'HELD_IN_ESCROW',
      finalized: true,
      lease_until: 0
    });

    return { alreadyProcessed: false };
  } catch (err: any) {
    console.error("[finalizeAuctionPayment] Core error processing payment:", err);
    throw err;
  }
}

// Deutscher Kommentar: Auftrag anhand der Stripe-PaymentIntent- oder Charge-ID finden
async function findTransactionByStripeRefs(paymentIntentId?: string | null, chargeId?: string | null): Promise<any | null> {
  if (paymentIntentId) {
    const snap = await adminDb.collection('transactions').where('stripe_payment_intent_id', '==', paymentIntentId).limit(1).get();
    if (!snap.empty) return snap.docs[0];
  }
  if (chargeId) {
    const snap = await adminDb.collection('transactions').where('stripe_charge_id', '==', chargeId).limit(1).get();
    if (!snap.empty) return snap.docs[0];
  }
  return null;
}

// Webhook must be mounted BEFORE express.json() to preserve raw Buffer for Stripe signature validation
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  let event: Stripe.Event | undefined = undefined;

  if (endpointSecret) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } catch (err: any) {
      // Ignore if primary secret fails
    }
  }

  if (!event && connectSecret) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, connectSecret);
    } catch (err: any) {
      // Ignore if connect secret fails
    }
  }

  if (!event) {
    console.error(`Webhook Error: Signature verification failed`);
    res.status(400).send(`Webhook Error: Invalid signature`);
    return;
  }

  if (
    event.type === 'payment_intent.succeeded' || 
    event.type === 'checkout.session.completed' || 
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const isSession = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
    const sessionObj = isSession ? (event.data.object as Stripe.Checkout.Session) : null;
    const paymentIntent = !isSession ? (event.data.object as Stripe.PaymentIntent) : null;

    const rawMetadata = isSession ? (sessionObj?.metadata || {}) : (paymentIntent?.metadata || {});
    const paymentId = isSession 
      ? (typeof sessionObj?.payment_intent === 'string' ? sessionObj.payment_intent : sessionObj?.payment_intent?.id || sessionObj!.id)
      : paymentIntent!.id;
    console.log('Payment event succeeded/completed:', event.type, paymentId);

    try {
      const { type, purpose, auction_id, buyer_id, seller_id, fee_percentage, user_id, package_id } = rawMetadata;

      // Deutscher Kommentar: Wenn Bankueberweisung noch unbezahlt ist (aus checkout.session.completed), kein finalizing ausloesen, sondern Status vermerken
      if (isSession && rawMetadata.payment_method === 'bank_transfer' && sessionObj?.payment_status === 'unpaid') {
        console.log(`[webhook] Bank transfer checkout session completed (unpaid). Session ID: ${sessionObj.id}. Awaiting payment.`);
        if (auction_id) {
          const aDoc = await adminDb.collection('auctions').doc(auction_id).get();
          if (aDoc.exists && (aDoc.data()?.payment_status === 'paid' || aDoc.data()?.post_auction_status === 'paid')) {
            console.log(`[webhook] Auktion ${auction_id} ist bereits bezahlt. Bankueberweisungs-Sitzung wird storniert.`);
            try {
              await stripe.checkout.sessions.expire(sessionObj.id);
            } catch (e) {}
            res.json({ received: true });
            return;
          }
          await adminDb.collection('auctions').doc(auction_id).set({
            bank_transfer_pending: true,
            bank_transfer_session_id: sessionObj.id
          }, { merge: true });
        }
        res.json({ received: true });
        return;
      }

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
          await createAndSendSubscriptionInvoice({
            userId: targetUserId,
            packageId: pkg,
            amountTotal: subAmt,
            sourceId: paymentId || `sub_${targetUserId}_${Date.now()}`,
            paymentMethod: 'Spletno plačilo / Kartica',
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

      const amountTotalCents = isSession ? (sessionObj?.amount_total || 0) : paymentIntent!.amount;
      try {
        await finalizeAuctionPayment({
          auctionId: auction_id,
          buyerId: buyer_id,
          sellerId: seller_id,
          paymentRef: paymentId,
          amountTotalCents: amountTotalCents,
          stripeSessionId: isSession ? sessionObj?.id : undefined
        });
        res.json({ received: true });
        return;
      } catch (err: any) {
        console.error("Error processing successful payment:", err);
        res.status(500).json({ error: 'processing_failed' });
        return;
      }
    } catch (err: any) {
      console.error("Webhook event handling error:", err);
      res.status(500).json({ error: err.message });
      return;
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
        await syncPublicProfile(uid);
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
        await syncPublicProfile(uid);
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

        // Deutscher Kommentar: Wenn die SEPA Bankueberweisung abgelaufen ist, Bankueberweisungsdaten zuruecksetzen
        if (metadata.payment_method === 'bank_transfer') {
          const auctionDoc = await adminDb.collection('auctions').doc(auction_id).get();
          if (auctionDoc.exists) {
            await cancelAuctionBankTransfer(auction_id, auctionDoc.data(), 'failed');
            console.log(`[webhook] Bank transfer expired for auction ${auction_id}. Shared logic applied.`);
          }
        }
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
  } else if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session?.metadata || {};
    const { auction_id, buyer_id } = metadata;

    try {
      if (auction_id) {
        const auctionDoc = await adminDb.collection('auctions').doc(auction_id).get();
        if (auctionDoc.exists) {
            await cancelAuctionBankTransfer(auction_id, auctionDoc.data());
        }
      }
      res.json({ received: true });
      return;
    } catch (err: any) {
      console.error('[webhook] Error handling checkout.session.async_payment_failed:', err.message);
      res.status(500).json({ error: err.message });
      return;
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
  } else if (event.type === 'payout.paid' || event.type === 'payout.failed' || event.type === 'payout.canceled') {
    const payoutObj = event.data.object as Stripe.Payout;
    const payoutId = payoutObj.id;

    try {
      const txSnap = await adminDb.collection('transactions')
        .where('payout_id', '==', payoutId)
        .get();

      if (!txSnap.empty) {
        const nowIso = new Date().toISOString();
        if (event.type === 'payout.paid') {
          const batch = adminDb.batch();
          for (const doc of txSnap.docs) {
            const data = doc.data() || {};
            if (!data.payout_arrived_at) {
              batch.update(doc.ref, { payout_arrived_at: nowIso });
            }
          }
          await batch.commit();
        } else {
          // Deutscher Kommentar: Bei payout.failed oder payout.canceled Transaktionen auf 'releasable' zuruecksetzen und Fehler speichern
          const errReason = payoutObj.failure_message || 'Izplačilo ni uspelo';
          const batch = adminDb.batch();
          let sellerIdToNotify: string | null = null;

          for (const doc of txSnap.docs) {
            const data = doc.data() || {};
            batch.update(doc.ref, {
              payout_status: 'releasable',
              payout_last_error: errReason
            });
            if (data.seller_id) sellerIdToNotify = data.seller_id;
          }
          await batch.commit();

          if (sellerIdToNotify) {
            try {
              const uDoc = await safeGetDoc(adminDb.collection('users').doc(sellerIdToNotify));
              const uData = uDoc.data() || {};
              if (uData.email && process.env.RESEND_API_KEY) {
                const resendClient = new Resend(process.env.RESEND_API_KEY);
                await resendClient.emails.send({
                  from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
                  to: uData.email,
                  subject: 'Izplačilo ni uspelo',
                  html: `<div style="font-family: sans-serif; color: #0A1128; padding: 20px;">
                    <h2 style="color: #0A1128;">Izplačilo ni uspelo</h2>
                    <p>Spoštovani,</p>
                    <p>Vaše nakazilo na bančni račun ni bilo uspešno. Sredstva so ponovno na voljo za izplačilo na vašem računu.</p>
                    <p>Prosimo, preverite svoje nastavitve izplačil ali poskusite znova.</p>
                  </div>`
                });
              }
            } catch (mailErr: any) {
              console.error('[webhook] Error sending payout failure email:', mailErr.message);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[webhook] Error processing ${event.type}:`, err.message);
    }
    res.json({ received: true });
    return;
  } else if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    const accountId = account.id;
    const isComplete = isStripeAccountReady(account);
    const requirementsDue = account.requirements?.currently_due || [];

    try {
      let targetUid: string | null = null;
      const uSnap = await adminDb.collection('users')
        .where('stripe_account_id', '==', accountId)
        .limit(1)
        .get();

      if (!uSnap.empty) {
        targetUid = uSnap.docs[0].id;
      } else {
        const uSnap2 = await adminDb.collection('users')
          .where('stripeAccountId', '==', accountId)
          .limit(1)
          .get();
        if (!uSnap2.empty) {
          targetUid = uSnap2.docs[0].id;
        } else if (account.metadata?.firebase_uid) {
          targetUid = account.metadata.firebase_uid;
        }
      }

      if (targetUid) {
        await adminDb.collection('users').doc(targetUid).set({
          stripe_onboarding_complete: isComplete,
          stripe_requirements_due: requirementsDue
        }, { merge: true });
        console.log(`[webhook] account.updated for user ${targetUid}: complete=${isComplete}`);
      } else {
        console.warn(`[webhook] account.updated received for ${accountId} but no user found in DB or metadata.`);
      }
    } catch (err: any) {
      console.error(`[webhook] Error processing account.updated for ${accountId}:`, err);
    }

    res.json({ received: true });
    return;
  } else if (event.type === 'charge.dispute.created') {
    // Deutscher Kommentar: Kartenrueckbuchung (Chargeback) - Auszahlung einfrieren und Admin-Alarm mit Frist fuer Gegenbeweise anlegen
    const dispute = event.data.object as Stripe.Dispute;
    try {
      const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : (dispute.payment_intent as any)?.id;
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge as any)?.id;
      const txDoc = await findTransactionByStripeRefs(piId, chargeId);
      const nowIso = new Date().toISOString();
      const dueBy = dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null;
      let alreadyPaidOut = false;
      if (txDoc) {
        const tx: any = txDoc.data() || {};
        alreadyPaidOut = tx.payout_status === 'paid_out';
        const patch: any = {
          chargeback_open: true,
          chargeback_id: dispute.id,
          chargeback_reason: dispute.reason || null,
          chargeback_amount_cents: dispute.amount || 0,
          chargeback_evidence_due_by: dueBy,
          chargeback_opened_at: nowIso
        };
        if (['held', 'releasable', 'release_waiting_funds', 'release_failed'].includes(tx.payout_status)) {
          patch.payout_status = 'frozen';
          patch.frozen_reason = 'chargeback';
        }
        await txDoc.ref.update(patch);
      }
      await adminDb.collection('admin_alerts').doc('chargeback_' + dispute.id).set({
        type: 'CHARGEBACK_OPENED',
        transaction_id: txDoc ? txDoc.id : null,
        dispute_id: dispute.id,
        reason: dispute.reason || null,
        amount_cents: dispute.amount || 0,
        evidence_due_by: dueBy,
        already_paid_out: alreadyPaidOut,
        created_at: nowIso
      }, { merge: true });
    } catch (err: any) {
      console.error('[webhook] Error processing charge.dispute.created:', err?.message || err);
      res.status(500).json({ error: 'dispute handling failed' });
      return;
    }
    res.json({ received: true });
    return;
  } else if (event.type === 'charge.refunded') {
    // Deutscher Kommentar: Rueckerstattung, die nicht von der Plattform selbst ausgeloest wurde (z. B. im Stripe-Dashboard), mit dem Auftrag abgleichen
    const charge = event.data.object as Stripe.Charge;
    try {
      const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : (charge.payment_intent as any)?.id;
      const txDoc = await findTransactionByStripeRefs(piId, charge.id);
      if (txDoc) {
        const tx: any = txDoc.data() || {};
        const nowIso = new Date().toISOString();
        let ownRefund = tx.payout_status === 'refunded' || !!tx.refund_id;
        if (!ownRefund) {
          try {
            const list = await getStripe().refunds.list({ charge: charge.id, limit: 10 });
            ownRefund = list.data.some((r: any) => r?.metadata?.tx_id === txDoc.id);
          } catch (listErr: any) {
            console.warn('[webhook] refunds.list failed:', listErr?.message);
          }
        }
        if (!ownRefund) {
          const full = (charge.amount_refunded || 0) >= (charge.amount || 0);
          const alreadyPaidOut = tx.payout_status === 'paid_out';
          const patch: any = { refunded_amount_cents: charge.amount_refunded || 0, refund_outside_platform: true };
          if (full) {
            patch.status = 'REFUNDED';
            patch.refunded_at = nowIso;
            patch.refund_reason = 'stripe_dashboard';
            if (!alreadyPaidOut) patch.payout_status = 'refunded';
          }
          await txDoc.ref.update(patch);
          await adminDb.collection('admin_alerts').doc('refund_' + charge.id + '_' + (charge.amount_refunded || 0)).set({
            type: full ? 'REFUND_OUTSIDE_PLATFORM' : 'PARTIAL_REFUND_OUTSIDE_PLATFORM',
            transaction_id: txDoc.id,
            amount_refunded_cents: charge.amount_refunded || 0,
            already_paid_out: alreadyPaidOut,
            created_at: nowIso
          }, { merge: true });
        }
      }
    } catch (err: any) {
      console.error('[webhook] Error processing charge.refunded:', err?.message || err);
      res.status(500).json({ error: 'refund handling failed' });
      return;
    }
    res.json({ received: true });
    return;
  }

  if (!res.headersSent) {
    res.json({ received: true });
  }
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

// Deutscher Kommentar: Einmalige idempotente Rueckfuehrung (Backfill) fehlender Liefermethoden auf Auktionen aus Transaktionen
const backfillDeliveryMethodsToAuctions = async () => {
  let processed = 0;
  let updated = 0;
  try {
    const auctionsSnap = await adminDb.collection('auctions')
      .where('payment_status', '==', 'paid')
      .limit(200)
      .get();

    for (const auctionDoc of auctionsSnap.docs) {
      processed++;
      try {
        const auctionData = auctionDoc.data() || {};
        const hasMethod = Boolean(auctionData.delivery_method || auctionData.selected_delivery);
        if (hasMethod) continue;

        // Transaktion zu dieser Auktion suchen
        const txSnap = await adminDb.collection('transactions')
          .where('auction_id', '==', auctionDoc.id)
          .limit(1)
          .get();

        if (!txSnap.empty) {
          const txData = txSnap.docs[0].data() || {};
          const txMethod = txData.delivery_method;
          if (txMethod) {
            await auctionDoc.ref.set({
              delivery_method: txMethod,
              selected_delivery: txMethod
            }, { merge: true });
            updated++;

            // Falls Abholung und im Escrow, sicherstellen dass PIN/QR existieren
            if (txMethod === 'pickup' && txData.status === 'HELD_IN_ESCROW') {
              try {
                await getOrCreatePickupSecrets(txSnap.docs[0].id, auctionDoc.id);
              } catch (err: any) {
                console.error(`[Backfill] Error ensuring pickup secrets for tx ${txSnap.docs[0].id}:`, err?.message);
              }
            }
          }
        }
      } catch (itemErr: any) {
        console.error(`[Backfill] Error processing auction ${auctionDoc.id}:`, itemErr?.message);
      }
    }
  } catch (e: any) {
    console.error('[Backfill] Cron backfill error:', e?.message);
  }
  return { processed, updated };
};

// Unified Cron handler for Vercel Cron and external schedulers
const handleCronCheck = async (req: express.Request, res: express.Response) => {
  if (!requireCronSecret(req, res)) return;
  try {
    console.log('[CRON] Executing auction check...');
    const auctionResults = await processAuctionCrons();
    console.log('[CRON] Executing bank transfer reconciliation (daily fallback)...');
    const reconcileResults = await reconcileBankTransfers();
    console.log('[CRON] Executing delivery method backfill...');
    const backfillResults = await backfillDeliveryMethodsToAuctions();
    res.json({
      auctions: auctionResults,
      reconciliation: reconcileResults,
      backfill: backfillResults
    });
  } catch (e: any) {
    console.error('[CRON ERROR]', e);
    res.status(500).json({ error: e.message || 'Internal server error in cron' });
  }
};

app.get("/api/cron/check-auctions", handleCronCheck);
app.post("/api/cron/check-auctions", handleCronCheck);
app.get("/api/cron-auctions", handleCronCheck);
app.post("/api/cron-auctions", handleCronCheck);

// Deutscher Kommentar: Hilfsfunktion zur Abgleichung schwebender Bankueberweisungen mit Stripe-Sessions
const reconcileBankTransfers = async () => {
  const stripe = getStripe();
  const snapshot = await adminDb.collection('auctions')
    .where('bank_transfer_pending', '==', true)
    .get();

  let processed = 0;
  let markedPaid = 0;
  let cancelled = 0;

  for (const doc of snapshot.docs) {
    const auctionData = doc.data();
    const sessionId = auctionData.bank_transfer_session_id;
    if (!sessionId) continue;

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
      if (session.payment_status === 'paid') {
        // Deutscher Kommentar: Zahlung eingegangen, Auktion finalisieren
        const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        await finalizeAuctionPayment({
          auctionId: doc.id,
          buyerId: auctionData.winner_id || auctionData.winnerId || auctionData.second_winner_id || auctionData.secondWinnerId,
          sellerId: auctionData.seller_id || auctionData.sellerId,
          amountTotalCents: session.amount_total || 0,
          paymentRef: piId || session.id,
          stripeSessionId: session.id
        });
        markedPaid++;
        console.log(`[Reconcile] Auction ${doc.id} marked as paid via bank transfer.`);
      } else if (session.status === 'expired') {
        // Deutscher Kommentar: Session abgelaufen, schwebenden Status zuruecksetzen
        await cancelAuctionBankTransfer(doc.id, auctionData, 'failed');
        cancelled++;
        console.log(`[Reconcile] Auction ${doc.id} bank transfer session expired.`);
      }
      processed++;
    } catch (err: any) {
      console.error(`[Reconcile] Error processing auction ${doc.id}:`, err.message);
    }
  }

  return { processed, markedPaid, cancelled };
};

app.get("/api/cron/reconcile-bank-transfers", async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    console.log('[CRON] Executing bank transfer reconciliation...');
    const results = await reconcileBankTransfers();
    res.json(results);
  } catch (e: any) {
    console.error('[RECONCILE ERROR]', e);
    res.status(500).json({ error: e.message || 'Internal server error in reconciliation' });
  }
});

// Dedicated endpoint for placing bids with instant outbid email triggers
app.post("/api/place-bid", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  if (placeBidRateLimiter) {
    try {
      const { success } = await placeBidRateLimiter.limit(userId);
      if (!success) {
        return res.status(429).json({ error: "Preveč oddanih ponudb. Prosimo, počakajte." });
      }
    } catch (err) {
      console.warn("Rate limit check failed:", err);
    }
  }

  try {
    const { auction_id, amount } = req.body;
    if (!auction_id || typeof auction_id !== 'string' || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Manjkajoči ali neveljavni podatki za ponudbo." });
    }
    // Deutscher Kommentar: Betrag auf ganze Cent begrenzen und Obergrenze setzen (gegen Fantasiegebote wie 1e12)
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6 || amount > 1000000) {
      return res.status(400).json({ error: "Znesek ponudbe ni veljaven (največ 1.000.000 €, na cent natančno)." });
    }

    const auctionRef = adminDb.collection('auctions').doc(auction_id);
    const userRef = adminDb.collection('users').doc(userId);
    const privateRef = adminDb.collection('auctions_private').doc(auction_id);
    const myBidRef = adminDb.collection('users').doc(userId).collection('my_bids').doc(auction_id);

    // Verify user existence and state
    const userSnap = await safeGetDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: "Uporabnik ne obstaja." });
    }
    const userData = userSnap.data();
    if (userData.isBlocked) {
      return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
    }
    try {
      await assertVerifiedUser(userId, userData);
    } catch (verErr: any) {
      return res.status(403).json({ error: verErr.message, code: verErr.code });
    }

    let outbidUserToNotify: { userId: string; newPrice: number; auctionTitle: string; auctionImageUrl?: string } | null = null;
    let finalWinnerId = userId;
    let finalPrice = amount;
    let finalMyMax = amount;
    let wasFirstBidOnAuction = false;

    await adminDb.runTransaction(async (transaction) => {
      // 1. ALL READS FIRST
      const auctionDoc = await transaction.get(auctionRef);
      if (!isDocSnapshotExists(auctionDoc)) {
        throw new Error("Dražba ne obstaja.");
      }
      const data = getDocSnapshotData(auctionDoc) || {};

      const privateDoc = await transaction.get(privateRef);
      const privData = isDocSnapshotExists(privateDoc) ? (getDocSnapshotData(privateDoc) || {}) : {};

      const myBidDoc = await transaction.get(myBidRef);
      const myBidData = isDocSnapshotExists(myBidDoc) ? (getDocSnapshotData(myBidDoc) || {}) : {};
      const isFirstBidOnAuction = !isDocSnapshotExists(myBidDoc) || !myBidData.updated_at;
      wasFirstBidOnAuction = isFirstBidOnAuction;

      if (isFirstBidOnAuction && req.body.accepted_bid_terms !== true) {
        throw new Error("BID_TERMS_REQUIRED");
      }

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

      // Read currentProxy from privateData with fallback to auction document
      const currentProxy = privData.current_proxy_bid || data.current_proxy_bid || data.currentProxyBid;
      let newCurrentPrice = currentPrice;
      let newWinnerId = userId;
      let newProxyBid = { user_id: userId, amount };

      // Deutscher Kommentar: Mindestgebot serverseitig erzwingen (gleiche Regel wie im Client: Basis + Gebotsschritt; eigenes Maximum zaehlt als Basis)
      const ownProxyMaxForMin = currentProxy && currentProxy.user_id === userId ? Number(currentProxy.amount) || 0 : 0;
      const minBase = Math.max(currentPrice, ownProxyMaxForMin);
      const minRequired = minBase + getBidIncrement(minBase);
      if (amount < minRequired) {
        throw new Error(`Najmanjša dovoljena ponudba je ${minRequired} €.`);
      }

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
        // Deutscher Kommentar: Das eigene Maximum darf durch ein niedrigeres Gebot nie sinken
        const ownPrevMax = currentProxy && currentProxy.user_id === userId ? Number(currentProxy.amount) || 0 : 0;
        newProxyBid = { user_id: userId, amount: Math.max(amount, ownPrevMax) };
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

      // Top bids calculation
      let topBids = Array.isArray(privData.top_bids) && privData.top_bids.length > 0
        ? [...privData.top_bids]
        : (Array.isArray(data.top_bids) ? [...data.top_bids] : []);

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

      // Distinct bidder tracking & has_second_bidder
      const existingBidderIds: string[] = Array.isArray(privData.bidder_ids) ? privData.bidder_ids : [];
      const distinctBidders = new Set([...existingBidderIds, userId, ...uniqueTopBids.map((b: any) => b.user_id)]);
      const hasSecondBidder = distinctBidders.size >= 2;

      // my_max calculation
      const previousMyMax = Number(myBidData.my_max) || 0;
      const calculatedMyMax = Math.max(previousMyMax, amount);
      finalMyMax = calculatedMyMax;

      // Public bid entry in subcollection auctions/{id}/bids
      const publicBidPrice = newWinnerId === userId ? newCurrentPrice : amount;
      const maskedAlias = maskUsername(userData.username || userData.first_name || userData.email?.split('@')[0]);
      const bidSubDocRef = adminDb.collection('auctions').doc(auction_id).collection('bids').doc();

      // 2. ALL WRITES AFTER ALL READS
      // A) Update public auction document
      transaction.update(auctionRef, {
        current_price: newCurrentPrice,
        currentBid: newCurrentPrice,
        winner_id: newWinnerId,
        winnerId: newWinnerId,
        bid_count: (data.bid_count || data.bidCount || 0) + 1,
        bidCount: (data.bid_count || data.bidCount || 0) + 1,
        has_second_bidder: hasSecondBidder,
        end_time: newEndTimeStr,
        endTime: newEndTimeStr,
        bidding_history: FieldValue.delete(),
        biddingHistory: FieldValue.delete(),
        top_bids: FieldValue.delete(),
        current_proxy_bid: FieldValue.delete(),
        currentProxyBid: FieldValue.delete(),
        hidden_max_bid: FieldValue.delete(),
        hiddenMaxBid: FieldValue.delete()
      });

      // B) Write auctions_private document
      transaction.set(privateRef, {
        current_proxy_bid: newProxyBid,
        top_bids: uniqueTopBids,
        bidder_ids: FieldValue.arrayUnion(userId)
      }, { merge: true });

      // C) Write public subcollection bid document
      transaction.set(bidSubDocRef, {
        bidder_alias: maskedAlias,
        price: publicBidPrice,
        created_at: new Date().toISOString()
      });

      // D) Write bid_log subcollection entry in auctions_private/{auction_id}/bid_log
      const rawIp = req.headers['x-forwarded-for'];
      const clientIp = (rawIp ? String(rawIp).split(',')[0].trim() : req.ip) || req.socket?.remoteAddress || '';
      const clientUserAgent = (req.headers['user-agent'] as string) || '';
      const bidLogRef = adminDb.collection('auctions_private').doc(auction_id).collection('bid_log').doc();

      transaction.set(bidLogRef, {
        uid: userId,
        max_bid_cents: Math.round(amount * 100),
        resulting_price_cents: Math.round(newCurrentPrice * 100),
        created_at: new Date().toISOString(),
        terms_version: userData.terms_version || TERMS_VERSION,
        ip: clientIp,
        user_agent: clientUserAgent,
        is_first_bid_on_auction: isFirstBidOnAuction
      });

      // E) Write user private my_bids document
      const myBidPayload: any = {
        auction_id,
        my_max: calculatedMyMax,
        updated_at: new Date().toISOString()
      };
      if (isFirstBidOnAuction) {
        myBidPayload.bid_terms_accepted_at = new Date().toISOString();
        myBidPayload.bid_terms_version = userData.terms_version || TERMS_VERSION;
      }
      transaction.set(myBidRef, myBidPayload, { merge: true });

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

    if (wasFirstBidOnAuction) {
      await recordTermsAcceptance({
        uid: userId,
        context: 'first_bid',
        req,
        termsVersion: userData.terms_version || TERMS_VERSION,
        auctionId: auction_id
      });
    }

    // Send outbid notification and email asynchronously
    if (outbidUserToNotify) {
      (async () => {
        try {
          // Systembenachrichtigung erstellen
          await createNotification({
            userId: outbidUserToNotify!.userId,
            type: 'outbid',
            auctionId: auction_id,
            auctionTitle: outbidUserToNotify!.auctionTitle,
            imageUrl: outbidUserToNotify!.auctionImageUrl,
            price: outbidUserToNotify!.newPrice
          });

          // E-Mail nur senden, wenn der Benutzer NICHT online ist
          const online = await isUserOnline(outbidUserToNotify!.userId);
          if (!online) {
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
          }
        } catch (emailErr: any) {
          console.error('[OUTBID NOTIFICATION ERROR]', emailErr.message);
        }
      })();
    }

    const resultStatus = finalWinnerId === userId ? "ok" : "outbid";
    res.json({
      success: true,
      resultStatus,
      newWinnerId: finalWinnerId,
      currentPrice: finalPrice,
      my_max: finalMyMax,
    });
  } catch (e: any) {
    console.error("[PLACE BID ERROR]", e);
    if (e.message === 'BID_TERMS_REQUIRED') {
      return res.status(400).json({ error: 'BID_TERMS_REQUIRED', message: 'Za oddajo prve ponudbe morate sprejeti splošne pogoje.' });
    }
    res.status(400).json({ error: e.message || "Napaka pri oddaji ponudbe" });
  }
});

// Direct helper endpoint to trigger outbid notifications
// Deutscher Kommentar: Endpunkt deaktiviert - er hatte keine Authentifizierung und erlaubte beliebigen E-Mail-Versand an fremde Nutzer.
// Die Ueberboten-Benachrichtigung wird serverseitig direkt beim Bieten versendet.
app.post("/api/notify-outbid", async (_req, res) => {
  return res.status(410).json({ error: "Ta funkcija ni več na voljo." });
});

app.post('/api/fees/preview', async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    if (placeBidRateLimiter) {
      try {
        const { success } = await placeBidRateLimiter.limit(userId);
        if (!success) {
          return res.status(429).json({ error: 'Preveč zahtev. Poskusite znova kasneje.' });
        }
      } catch (e) {}
    }

    const { amount, auction_id } = req.body || {};
    let itemPriceCents = 0;

    if (auction_id) {
      const aDoc = await safeGetDoc(adminDb.collection('auctions').doc(auction_id));
      if (!aDoc.exists) {
        return res.status(404).json({ error: 'Dražba ni najdena' });
      }
      const aData = aDoc.data() || {};
      const winnerId = aData.winner_id || aData.winnerId;
      const secondWinnerId = aData.second_winner_id || aData.secondWinnerId;
      if (winnerId !== userId && secondWinnerId !== userId) {
        return res.status(403).json({ error: 'Nimate pravic za pregled te dražbe.' });
      }
      itemPriceCents = parseAmountToCents(aData.current_price || aData.currentBid || aData.starting_price || 0);
    } else {
      itemPriceCents = parseAmountToCents(amount);
      if (itemPriceCents <= 0 || itemPriceCents > 100000000) {
        return res.status(400).json({ error: 'Neveljaven znesek.' });
      }
    }

    const userDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    const userData = userDoc.exists ? (userDoc.data() || {}) : {};

    const result = await computeBuyerTotals(userId, userData, itemPriceCents);
    return res.json(result);
  } catch (err: any) {
    console.error('[fees/preview]', err);
    return res.status(500).json({ error: 'Izračuna provizije ni bilo mogoče pridobiti.' });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Deutscher Kommentar: Empfaenger fuer CSP-Verstoss-Berichte der Browser (nur Protokollierung, hoechstens 60 Eintraege pro Minute und Instanz)
let cspReportWindow = { start: 0, count: 0 };
app.post('/api/csp-report', express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '8kb' }), (req, res) => {
  const now = Date.now();
  if (now - cspReportWindow.start > 60000) cspReportWindow = { start: now, count: 0 };
  if (cspReportWindow.count++ < 60) {
    try {
      const r: any = (req.body && (req.body['csp-report'] || (Array.isArray(req.body) ? req.body[0]?.body : req.body))) || {};
      const clean = (v: any) => String(v ?? '').replace(/[\r\n]/g, ' ').slice(0, 200);
      console.warn(`[CSP] ${clean(r['violated-directive'] || r.effectiveDirective)} blocked=${clean(r['blocked-uri'] || r.blockedURL)} doc=${clean(r['document-uri'] || r.documentURL)}`);
    } catch { /* ignorieren */ }
  }
  res.status(204).end();
});

// Deutscher Kommentar: SEO-Routen (robots.txt, sitemap.xml, Meta-Daten fuer Auktions- und Kategorieseiten)
registerSeoRoutes(app);

app.post("/api/create-checkout-session", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  if (checkoutPaymentRateLimiter) {
    try {
      const { success } = await checkoutPaymentRateLimiter.limit(userId);
      if (!success) {
        return res.status(429).json({ error: "Preveč plačilnih zahtev. Prosimo, počakajte." });
      }
    } catch (err) {
      console.warn("Rate limit check failed:", err);
    }
  }

  try {
    const { currency = "eur", auction_id, auctionId, return_url, type = "auction", package_id, planId, tier, payment_method = "card" } = req.body || {};
    const stripe = getStripe();

    const effectiveAuctionId = auction_id || auctionId;
    if (effectiveAuctionId) {
      await finalizeAuction(effectiveAuctionId);
    }
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
      if (buyer?.isBlocked) {
        return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
      }
      try {
        await assertVerifiedUser(effectiveBuyerId, buyer);
      } catch (verErr: any) {
        return res.status(403).json({ error: verErr.message, code: verErr.code });
      }

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

      // Deutscher Kommentar: Wenn bereits eine Bankueberweisung aktiv ist und die Frist noch laeuft
      const isBankTransfer = (payment_method === 'bank_transfer');
      if (isBankTransfer && auction.bank_transfer_final_chance === true) {
        return res.status(400).json({ error: "Možnost bančnega nakazila za to dražbo je že potekla. Uporabite plačilo s kartico." });
      }

      if (isBankTransfer && auction.bank_transfer_pending === true) {
        const deadline = auction.bank_transfer_deadline_at ? new Date(auction.bank_transfer_deadline_at).getTime() : 0;
        if (deadline > Date.now() && auction.bank_transfer_session_id) {
          try {
            const existingSess = await stripe.checkout.sessions.retrieve(auction.bank_transfer_session_id);
            if (existingSess && existingSess.status === 'open') {
              console.log(`[Checkout] Reusing active bank transfer session ${existingSess.id} for auction ${effectiveAuctionId}`);
              return res.json({ url: existingSess.url, sessionId: existingSess.id });
            }
          } catch (err: any) {
            console.warn(`[Checkout] Error retrieving existing bank transfer session: ${err.message}`);
          }
          return res.status(409).json({ error: "Nakazilo je že v teku" });
        }
      }

      // Deutscher Kommentar: Wenn Kartenzahlung gewaehlt wurde, aber eine Bankueberweisung aussteht, stornieren wir die alte zuerst
      if (!isBankTransfer && auction.bank_transfer_pending === true) {
        console.log(`[Checkout] Card payment requested while bank transfer is pending for auction ${effectiveAuctionId}. Cancelling old bank transfer first.`);
        const cancelRes = await cancelAuctionBankTransfer(effectiveAuctionId, auction, 'switch_to_card');
        if (cancelRes && cancelRes.success === false) {
          if (cancelRes.reason === 'already_paid_or_processing') {
            return res.status(409).json({ error: "Plačilo z nakazilom je že v obdelavi ali zaključeno." });
          }
          if (cancelRes.reason === 'cancel_failed' || cancelRes.reason === 'stripe_error') {
            return res.status(409).json({ error: "Preklic nakazila trenutno ni mogoč. Poskusite znova čez nekaj minut." });
          }
          if (cancelRes.reason !== 'not_pending') {
            return res.status(409).json({ error: "Preklic nakazila trenutno ni mogoč. Poskusite znova čez nekaj minut." });
          }
        }
        const refreshedAuctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(effectiveAuctionId));
        if (refreshedAuctionDoc.exists()) {
          auction = refreshedAuctionDoc.data();
        }
        if (auction.payment_status === 'paid' || auction.post_auction_status === 'paid') {
          return res.status(400).json({ error: "Ta dražba je že plačana." });
        }
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
      const buyerTotals = await computeBuyerTotals(userId, buyer, authoritativePriceInCents);
      finalAmountCents = buyerTotals.totalCents;

      let sellerAccountId = '';
      try {
        sellerAccountId = await getSellerPayoutAccount(effectiveSellerId);
      } catch (payoutErr: any) {
        if (payoutErr.code === 'SELLER_PAYOUTS_NOT_READY') {
          return res.status(409).json({
            error: 'Prodajalec še nima urejenih izplačil. Plačilo trenutno ni mogoče.',
            code: 'SELLER_PAYOUTS_NOT_READY'
          });
        }
        throw payoutErr;
      }

      if (isBankTransfer) {
        const paymentDeadlineMs = resolvePaymentDeadlineMs(auction);
        // Deutscher Kommentar: bank_transfer_used_by wird jetzt aus auctions_private gelesen
        const privDoc = await adminDb.collection('auctions_private').doc(effectiveAuctionId).get();
        const privData = privDoc.exists ? privDoc.data() || {} : {};
        const alreadyUsed = (privData.bank_transfer_used_by || []).includes(userId);
        if (!isBankTransferAvailable({ amountCents: finalAmountCents, paymentDeadlineMs, nowMs: Date.now(), alreadyUsed })) {
          let reason = 'min_amount';
          if (alreadyUsed) reason = 'already_used';
          else if (paymentDeadlineMs <= Date.now()) reason = 'deadline_passed';
          console.warn(`[Checkout] Bank transfer unavailable for auction ${effectiveAuctionId}: ${reason}`);
          return res.status(400).json({ error: "Bančno nakazilo ni na voljo za to plačilo.", reason });
        }
      }

      let bankTransferDeadlineStr: string | undefined = undefined;
      if (isBankTransfer) {
        const now = new Date();
        const threeWorkingDays = addWorkingDays(now, 3);
        bankTransferDeadlineStr = threeWorkingDays.toISOString();
      }

      reservationId = `${userId}_${effectiveAuctionId}`;
      reservationCreated = false;

      try {
        await reserveAmlAmount({
          buyerId: userId,
          auctionId: effectiveAuctionId,
          amountEur: finalAmountCents / 100,
          paymentMethod: isBankTransfer ? 'bank_transfer' : undefined,
          bankTransferDeadlineAt: bankTransferDeadlineStr
        });
        reservationCreated = true;
      } catch (amlErr: any) {
        return res.status(amlErr.statusCode || 400).json({ error: amlErr.message });
      }

      (req as any)._bankTransferDeadlineStr = bankTransferDeadlineStr;
      (req as any)._isBankTransfer = isBankTransfer;

      (req as any)._sellerAccountId = sellerAccountId;
      (req as any)._buyerTotals = buyerTotals;
      (req as any)._auctionId = effectiveAuctionId;

      sessionMetadata = {
        type: 'auction',
        auction_id: effectiveAuctionId,
        buyer_id: userId,
        seller_id: effectiveSellerId,
        item_cents: String(buyerTotals.itemPriceCents),
        fee_cents: String(buyerTotals.feeCents),
        vat_cents: String(buyerTotals.vatCents),
        vat_rate: String(buyerTotals.vatRate),
        reverse_charge: buyerTotals.isReverseCharge ? '1' : '0',
        tier: buyerTotals.tier,
        ...(isBankTransfer ? { payment_method: 'bank_transfer' } : {})
      };

      const lineItems: any[] = [];
      if (buyerTotals.itemPriceCents > 0) {
        lineItems.push({
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: auctionTitle },
            unit_amount: buyerTotals.itemPriceCents,
          },
          quantity: 1,
        });
      }
      // Einzelner Gebührenposten für Stripe Checkout
      if (buyerTotals.feeCents > 0) {
        const feePercentStr = String(buyerTotals.feePercent).replace('.', ',');
        const feeName = buyerTotals.feeIsMinimum ? 'Provizija platforme (minimalna)' : `Provizija platforme (${feePercentStr} %)`;
        lineItems.push({
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: feeName },
            unit_amount: buyerTotals.feeCents,
          },
          quantity: 1,
        });
      }
      if (buyerTotals.vatCents > 0) {
        lineItems.push({
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: `DDV ${buyerTotals.vatRate} % na provizijo` },
            unit_amount: buyerTotals.vatCents,
          },
          quantity: 1,
        });
      }

      (req as any)._auctionLineItems = lineItems;
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

    const isBankTransfer = (req as any)._isBankTransfer === true;
    const bankTransferDeadlineStr = (req as any)._bankTransferDeadlineStr;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: isBankTransfer ? ['customer_balance'] : ['card'],
      line_items: (type === 'auction' && (req as any)._auctionLineItems && (req as any)._auctionLineItems.length > 0)
        ? (req as any)._auctionLineItems
        : [{
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
        ...(type === 'auction' && (req as any)._sellerAccountId ? {
          application_fee_amount: (req as any)._buyerTotals.feeCents + (req as any)._buyerTotals.vatCents,
          transfer_data: { destination: (req as any)._sellerAccountId },
          transfer_group: 'auction_' + (req as any)._auctionId,
        } : {}),
        ...(type === 'subscription' ? { setup_future_usage: 'off_session' } : {})
      },
      mode: 'payment',
      expires_at: isBankTransfer ? Math.floor(Date.now() / 1000) + 24 * 3600 : Math.floor(Date.now() / 1000) + 1800,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    if (isBankTransfer) {
      sessionParams.payment_method_options = {
        customer_balance: {
          funding_type: 'bank_transfer',
          bank_transfer: {
            type: 'eu_bank_transfer',
            eu_bank_transfer: {
              country: 'DE'
            }
          }
        }
      };
    }

    if (effectiveBuyerId) {
      sessionParams.client_reference_id = effectiveBuyerId;
    }

    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
      if (!isBankTransfer) {
        sessionParams.customer_update = {
          address: 'auto',
          name: 'auto',
          shipping: 'auto',
        };
      }
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

    if (isBankTransfer) {
      try {
        await adminDb.collection('auctions').doc(effectiveAuctionId).set({
          bank_transfer_pending: true,
          bank_transfer_session_id: session.id,
          bank_transfer_deadline_at: bankTransferDeadlineStr,
        }, { merge: true });
        
        // Deutscher Kommentar: bank_transfer_used_by in private Dokument verschieben
        await adminDb.collection('auctions_private').doc(effectiveAuctionId).set({
          bank_transfer_used_by: FieldValue.arrayUnion(userId)
        }, { merge: true });

        console.log(`[Checkout] Auction ${effectiveAuctionId} updated to bank_transfer_pending: true and added user ${userId} to auctions_private/bank_transfer_used_by`);
      } catch (aucErr: any) {
        console.error('Error updating auction for bank transfer:', aucErr.message);
      }
    }

    res.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error("Stripe Checkout Error:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/checkout/cancel-bank-transfer", async (req, res) => {
  // Deutscher Kommentar: Authentifizierung des Benutzers
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { auctionId } = req.body || {};
    if (!auctionId) {
      return res.status(400).json({ error: 'Missing auctionId' });
    }

    const auctionDoc = await adminDb.collection('auctions').doc(auctionId).get();
    if (!auctionDoc.exists) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    const auctionData = auctionDoc.data() || {};
    const winnerId = auctionData.winner_id || auctionData.winnerId;
    const secondWinnerId = auctionData.second_winner_id || auctionData.secondWinnerId;

    let authorized = (userId === winnerId || userId === secondWinnerId);

    if (authorized && auctionData.bank_transfer_session_id) {
      try {
        const stripe = getStripe();
        const sess = await stripe.checkout.sessions.retrieve(auctionData.bank_transfer_session_id);
        if (sess.metadata && sess.metadata.buyer_id) {
          authorized = (sess.metadata.buyer_id === userId);
        }
      } catch (e) {
        // Deutscher Kommentar: Fallback auf Winner-Check, wenn Stripe-Session nicht geladen werden konnte
      }
    }

    if (!authorized) {
      return res.status(403).json({ error: 'Te dražbe ne morete upravljati.' });
    }

    const cancelRes = await cancelAuctionBankTransfer(auctionId, auctionData, 'switch_to_card');
    if (cancelRes && cancelRes.success === false) {
      if (cancelRes.reason === 'already_paid_or_processing') {
        return res.status(409).json({ error: "Plačilo z nakazilom je že v obdelavi ali zaključeno." });
      }
      if (cancelRes.reason === 'cancel_failed' || cancelRes.reason === 'stripe_error') {
        return res.status(409).json({ error: "Preklic nakazila trenutno ni mogoč. Poskusite znova čez nekaj minut." });
      }
      return res.status(409).json({ error: "Preklic nakazila trenutno ni mogoč. Poskusite znova čez nekaj minut." });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error("Error cancelling bank transfer:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Deutscher Kommentar: Gibt die URL der Zahlungsanweisungen fuer die Bankueberweisung an den Gewinner zurueck
app.get("/api/checkout/bank-transfer-instructions", async (req, res) => {
  // Deutscher Kommentar: Authentifizierung des Kaeufers
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }

  try {
    const auctionId = (req.query.auction_id || req.query.auctionId) as string;
    if (!auctionId) {
      return res.status(400).json({ error: 'Manjka identifikator dražbe.' });
    }

    const auctionDoc = await adminDb.collection('auctions').doc(auctionId).get();
    if (!auctionDoc.exists) {
      return res.status(404).json({ error: 'Dražba ni bila najdena.' });
    }

    const auctionData = auctionDoc.data() || {};
    const winnerId = auctionData.winner_id || auctionData.winnerId;
    const secondWinnerId = auctionData.second_winner_id || auctionData.secondWinnerId;

    // Deutscher Kommentar: Pruefen, ob der Aufrufer Erst- oder Zweitgewinner der Auktion ist
    const isWinner = (userId === winnerId || userId === secondWinnerId);
    if (!isWinner) {
      return res.status(403).json({ error: 'Nimate dovoljenja za ogled teh navodil.' });
    }

    // Deutscher Kommentar: Pruefen, ob die Bankueberweisung anhaengig ist und eine Sitzungs-ID existiert
    if (auctionData.bank_transfer_pending !== true || !auctionData.bank_transfer_session_id) {
      return res.status(404).json({ error: 'Navodila za nakazilo trenutno niso na voljo.' });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(auctionData.bank_transfer_session_id, {
      expand: ['payment_intent']
    });

    const paymentIntent: any = session.payment_intent;
    const url = paymentIntent?.next_action?.display_bank_transfer_instructions?.hosted_instructions_url;

    if (!url) {
      return res.status(404).json({ error: 'Navodila za nakazilo trenutno niso na voljo.' });
    }

    return res.json({ url });
  } catch (err: any) {
    console.error('[bank-transfer-instructions] Error retrieving transfer instructions:', err);
    return res.status(500).json({ error: 'Napaka pri pridobivanju navodil za nakazilo.' });
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
      const isBankTransfer = session.metadata?.payment_method === 'bank_transfer';
      const isPaid = session.payment_status === 'paid' || session.status === 'complete' || (isBankTransfer && session.status === 'open');
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
      let effectiveSellerId = metadata.seller_id;

      // Deutscher Kommentar: Wenn es eine Bankueberweisung ist und noch nicht vollstaendig bezahlt wurde
      if (isBankTransfer && session.payment_status !== 'paid') {
        return res.json({ 
          success: true, 
          paid: false, 
          pending: true,
          payment_method: 'bank_transfer',
          awaiting_bank_transfer: true, 
          auction_id: effectiveAuctionId 
        });
      }

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
          await createAndSendSubscriptionInvoice({
            userId: targetUserId,
            packageId: packageId,
            amountTotal: subAmt,
            sourceId: session.id,
            paymentMethod: 'Spletno plačilo / Kartica',
            periodStart: now,
            periodEnd: validUntil
          }).catch(e => console.error("[confirm-checkout-session] Napaka pri ustvarjanju računa za naročnino:", e));
        }
        return res.json({ success: true, type: 'subscription', package_id: packageId, userId: targetUserId });
      }

      if (effectiveAuctionId) {
        if (!effectiveSellerId) {
          try {
            const aDoc = await safeGetDoc(adminDb.collection('auctions').doc(effectiveAuctionId));
            if (aDoc.exists()) {
              const aData = aDoc.data() || {};
              effectiveSellerId = aData.seller_id || aData.sellerId;
            }
          } catch (e) {}
        }

        if (!effectiveSellerId) {
          return res.status(400).json({ error: 'Missing seller ID for auction payment' });
        }

        const paymentRef = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id || paymentIntent?.id || session.id);
        const amountTotalCents = session.amount_total || (paymentIntent ? paymentIntent.amount : 0);

        try {
          await finalizeAuctionPayment({
            auctionId: effectiveAuctionId,
            buyerId: effectiveBuyerId,
            sellerId: effectiveSellerId,
            paymentRef: paymentRef,
            amountTotalCents: amountTotalCents,
            stripeSessionId: session.id
          });
        } catch (err: any) {
          console.error('[confirm-checkout-session] finalizeAuctionPayment error:', err);
          return res.status(500).json({ error: 'processing_failed' });
        }

        return res.json({ success: true, paid: true, auction_id: effectiveAuctionId });
      }

      return res.status(400).json({ error: 'Seja plačila nima podatkov o dražbi.' });
    } else {
      return res.status(400).json({ error: 'Manjka identifikator seje plačila.' });
    }
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

  if (checkoutPaymentRateLimiter) {
    try {
      const { success } = await checkoutPaymentRateLimiter.limit(userId);
      if (!success) {
        return res.status(429).json({ error: "Preveč plačilnih zahtev. Prosimo, počakajte." });
      }
    } catch (err) {
      console.warn("Rate limit check failed:", err);
    }
  }

  try {
    const { currency = "eur", auction_id, auctionId } = req.body || {};
    const stripe = getStripe();
    const effectiveAuctionId = auction_id || auctionId;
    if (effectiveAuctionId) {
      await finalizeAuction(effectiveAuctionId);
    }

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
    if (buyer?.isBlocked) {
      return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
    }
    try {
      await assertVerifiedUser(userId, buyer);
    } catch (verErr: any) {
      return res.status(403).json({ error: verErr.message, code: verErr.code });
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
    const buyerTotals = await computeBuyerTotals(userId, buyer, authoritativePriceInCents);
    const finalAmountCents = buyerTotals.totalCents;

    let sellerAccountId = '';
    try {
      sellerAccountId = await getSellerPayoutAccount(effectiveSellerId);
    } catch (payoutErr: any) {
      if (payoutErr.code === 'SELLER_PAYOUTS_NOT_READY') {
        return res.status(409).json({
          error: 'Prodajalec še nima urejenih izplačil. Plačilo trenutno ni mogoče.',
          code: 'SELLER_PAYOUTS_NOT_READY'
        });
      }
      throw payoutErr;
    }

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
      application_fee_amount: buyerTotals.feeCents + buyerTotals.vatCents,
      transfer_data: { destination: sellerAccountId },
      transfer_group: 'auction_' + effectiveAuctionId,
      metadata: {
        type: 'auction',
        auction_id: effectiveAuctionId,
        buyer_id: userId,
        seller_id: effectiveSellerId,
        item_cents: String(buyerTotals.itemPriceCents),
        fee_cents: String(buyerTotals.feeCents),
        vat_cents: String(buyerTotals.vatCents),
        vat_rate: String(buyerTotals.vatRate),
        reverse_charge: buyerTotals.isReverseCharge ? '1' : '0',
        tier: buyerTotals.tier
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
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const userDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    const userData = userDoc.exists ? (userDoc.data() || {}) : {};

    if (userData.isBlocked) {
      return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
    }

    try {
      await assertVerifiedUser(userId, userData);
    } catch (verErr: any) {
      return res.status(403).json({ error: verErr.message, code: verErr.code });
    }

    const accountId = await ensureSellerStripeAccount(userId, userData);
    const stripe = getStripe();

    const scope = req.body?.scope === 'manage' ? 'manage' : 'onboarding';

    // Wenn Management angefordert wird, muss das Onboarding abgeschlossen sein
    if (scope === 'manage') {
      if (userData.stripe_onboarding_complete !== true) {
        return res.status(403).json({ error: "Onboarding erforderlich", code: 'ONBOARDING_REQUIRED' });
      }
    }

    const components: any = {
      account_onboarding: { enabled: true, features: { external_account_collection: true } }
    };

    if (scope === 'manage') {
      components.account_management = { enabled: true, features: { external_account_collection: true } };
      components.notification_banner = { enabled: true, features: { external_account_collection: true } };
      // Payouts konfigurieren, ohne dass der Nutzer Auszahlungen selbst ausloesen kann
      components.payouts = { enabled: true, features: { instant_payouts: false, standard_payouts: false, edit_payout_schedule: false } };
    }

    // Stripe Session fuer Onboarding oder Management erstellen
    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components,
    });

    return res.status(200).json({ client_secret: accountSession.client_secret });
  } catch (error: any) {
    console.error("Stripe Account Session Error:", error);
    return res.status(500).json({ error: error.message || 'Error creating account session' });
  }
});

app.post("/api/stripe-account-link", async (req, res) => {
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

    const targetStripeAccountId = await ensureSellerStripeAccount(targetUserId, user);

    if (user.stripe_onboarding_complete) {
      try {
        const loginLink = await stripe.accounts.createLoginLink(targetStripeAccountId);
        return res.json({ url: loginLink.url });
      } catch (e: any) {
        console.warn("Failed to create login link:", e.message);
      }
    }

    const reqOrigin = req.get('origin') || (req.get('host') ? `${req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http'}://${req.get('host')}` : 'https://www.drazbe.eu');
    const accountLink = await stripe.accountLinks.create({
      account: targetStripeAccountId,
      refresh_url: refresh_url || `${reqOrigin}/stripe-callback.html?stripe=refresh`,
      return_url: return_url || `${reqOrigin}/stripe-callback.html?stripe=success`,
      type: 'account_onboarding',
    });

    return res.json({ url: accountLink.url });
  } catch (error: any) {
    console.error("Stripe Account Link Error:", error);
    return res.status(500).json({ error: error.message || 'Stripe configuration error' });
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
      return res.json({ complete: false, requirements_due: [] });
    }

    const account = await stripe.accounts.retrieve(targetStripeAccountId);
    const isComplete = isStripeAccountReady(account);
    const requirementsDue = account.requirements?.currently_due || [];

    await userDocRef.set({
      stripe_onboarding_complete: isComplete,
      stripe_requirements_due: requirementsDue
    }, { merge: true });

    return res.json({ complete: isComplete, requirements_due: requirementsDue });
  } catch (error: any) {
    console.error("Stripe Check Account Status Error:", error);
    return res.status(500).json({ error: error.message || 'Server configuration error' });
  }
});

app.post("/api/payments/wallet-pay-auction", async (req, res) => {
  return res.status(410).json({ error: 'Plačilo z denarnico ni več na voljo. Uporabite kartico.' });
});

app.post("/api/payments/wallet-pay-subscription", async (req, res) => {
  return res.status(410).json({ error: 'Plačilo z denarnico ni več na voljo. Uporabite kartico.' });
});

app.get("/api/seller/payouts", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const txSnap = await adminDb.collection('transactions')
      .where('seller_id', '==', uid)
      .orderBy('held_since', 'desc')
      .limit(20)
      .get();

    const payouts = [];
    for (const doc of txSnap.docs) {
      const data = doc.data() || {};
      
      let title = "Dražba";
      if (data.auction_id) {
        try {
          const aSnap = await safeGetDoc(adminDb.collection('auctions').doc(data.auction_id));
          if (aSnap.exists()) {
            const aData = aSnap.data() || {};
            title = (aData.title?.SLO || aData.title?.EN || aData.title || "Dražba");
          }
        } catch (_) {}
      }

      payouts.push({
        id: doc.id,
        title,
        seller_net_cents: data.seller_net_cents || (data.item_price ? Math.round(data.item_price * 100) : 0),
        payout_status: data.payout_status || 'held',
        held_since: data.held_since || data.created_at || null,
        auto_release_at: data.auto_release_at || null,
        paid_out_at: data.paid_out_at || null
      });
    }

    return res.json({ success: true, payouts });
  } catch (err: any) {
    console.error('Error fetching seller payouts:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Verkaeuferguthaben und Stripe-Saldo abrufen
app.get("/api/seller/balance", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const userSnap = await safeGetDoc(adminDb.collection('users').doc(uid));
    const user = userSnap.data() || {};
    const accountId = user.stripe_account_id || user.stripeAccountId;

    if (!accountId) {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ 
        success: true, 
        hasAccount: false, 
        onboardingComplete: Boolean(user.stripe_onboarding_complete) 
      });
    }

    let availableCents = 0;
    let pendingCents = 0;
    let inTransitCents = 0;
    let stripeError = false;

    try {
      const stripe = getStripe();
      const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
      if (balance && balance.available) {
        const eurAvail = balance.available.find((b) => b.currency?.toLowerCase() === 'eur');
        if (eurAvail) availableCents = eurAvail.amount || 0;
      }
      if (balance && balance.pending) {
        const eurPend = balance.pending.find((b) => b.currency?.toLowerCase() === 'eur');
        if (eurPend) pendingCents = eurPend.amount || 0;
      }

      // Summe aller noch ausstehenden oder im Transit befindlichen Auszahlungen
      try {
        const payoutsList = await stripe.payouts.list({ limit: 20 }, { stripeAccount: accountId });
        if (payoutsList && payoutsList.data) {
          for (const p of payoutsList.data) {
            if (p.currency?.toLowerCase() === 'eur' && (p.status === 'pending' || p.status === 'in_transit')) {
              inTransitCents += p.amount || 0;
            }
          }
        }
      } catch (payoutsErr) {
        console.warn("Stripe payouts list error:", payoutsErr);
      }
    } catch (stripeErr) {
      console.error("Stripe balance retrieve error:", stripeErr);
      stripeError = true;
    }

    let escrowCents = 0;
    let releasableCents = 0;
    let paidOutCents = 0;
    let paidOutCount = 0;

    try {
      const txSnap = await adminDb.collection('transactions')
        .where('seller_id', '==', uid)
        .limit(500)
        .get();

      for (const doc of txSnap.docs) {
        const data = doc.data() || {};
        const status = (data.status || '').toUpperCase();
        if (status === 'REFUNDED' || status === 'CANCELLED') continue;

        const netCents = data.seller_net_cents || (data.item_price ? Math.round(data.item_price * 100) : 0);
        const payoutStatus = data.payout_status || 'held';

        if (payoutStatus === 'paid_out') {
          paidOutCents += netCents;
          paidOutCount++;
        } else if (payoutStatus === 'releasable') {
          releasableCents += netCents;
        } else if (payoutStatus === 'payout_pending') {
          inTransitCents += netCents;
        } else if (['held', 'frozen', 'release_waiting_funds', 'release_failed'].includes(payoutStatus)) {
          escrowCents += netCents;
        }
      }
    } catch (txErr) {
      console.error("Transactions balance query error:", txErr);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      hasAccount: true,
      availableCents,
      pendingCents,
      inTransitCents,
      escrowCents,
      releasableCents,
      paidOutCents,
      paidOutCount,
      currency: 'eur',
      onboardingComplete: Boolean(user.stripe_onboarding_complete),
      stripeError
    });
  } catch (err: any) {
    console.error("Error fetching seller balance:", err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Link zum Stripe-Nadzorna-Plosca fuer fertige Verkaeufer (deaktiviert gemaess DEL B)
app.post("/api/stripe-dashboard-link", async (req, res) => {
  return res.status(410).json({ error: "Ta funkcija ni več na voljo." });
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

      // Deutscher Kommentar: Rechnung fuer synchronisierte Checkout-Sitzung erstellen, falls noch nicht generiert
      const subAmtSession = Number(matchingSession.amount_total ? matchingSession.amount_total / 100 : (tier.includes('PRO') ? 50 : 20));
      await createAndSendSubscriptionInvoice({
        userId: targetUserId,
        packageId: tier,
        amountTotal: subAmtSession,
        sourceId: matchingSession.id,
        paymentMethod: 'Spletno plačilo / Kartica',
        periodStart: paidDate,
        periodEnd: validUntil
      }).catch(e => console.error("[sync-user-subscription] Fehler beim Erstellen der Abonnementrechnung (Session):", e));

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

              // Deutscher Kommentar: Rechnung fuer synchronisierten PaymentIntent erstellen, falls noch nicht generiert
              const subAmtPi = Number(pi.amount ? pi.amount / 100 : (tier.includes('PRO') ? 50 : 20));
              await createAndSendSubscriptionInvoice({
                userId: targetUserId,
                packageId: tier,
                amountTotal: subAmtPi,
                sourceId: pi.id,
                paymentMethod: 'Spletno plačilo / Kartica',
                periodStart: piDate,
                periodEnd: validUntil
              }).catch(e => console.error("[sync-user-subscription] Fehler beim Erstellen der Abonnementrechnung (PI):", e));

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

// Upstash rate limiters for AI endpoints
let enhanceRateLimitMin: Ratelimit | null = null;
let enhanceRateLimitDay: Ratelimit | null = null;
let analyzeRateLimitHour: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    enhanceRateLimitMin = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
    });
    enhanceRateLimitDay = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(30, "24 h"),
    });
    analyzeRateLimitHour = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
    });
  } catch (err) {
    console.warn("Failed to initialize AI Upstash limiters:", err);
  }
}

async function checkEnhanceRateLimit(uid: string): Promise<boolean> {
  if (enhanceRateLimitMin && enhanceRateLimitDay) {
    try {
      const minResult = await enhanceRateLimitMin.limit(`enhance_min_${uid}`);
      if (!minResult.success) return false;
      const dayResult = await enhanceRateLimitDay.limit(`enhance_day_${uid}`);
      return dayResult.success;
    } catch (e) {
      console.warn("Upstash limit check error, falling back to Firestore:", e);
    }
  }

  try {
    const limitRef = adminDb.collection('user_rate_limits').doc(uid);
    const limitSnap = await limitRef.get();
    const now = Date.now();
    const limitData = limitSnap.exists ? (limitSnap.data() || {}) : {};

    const minTimestamp = limitData.enhance_min_ts || 0;
    let minCount = limitData.enhance_min_cnt || 0;
    if (now - minTimestamp > 60 * 1000) {
      minCount = 0;
    }
    if (minCount >= 5) return false;

    const dayTimestamp = limitData.enhance_day_ts || 0;
    let dayCount = limitData.enhance_day_cnt || 0;
    if (now - dayTimestamp > 24 * 60 * 60 * 1000) {
      dayCount = 0;
    }
    if (dayCount >= 30) return false;

    const updates: any = {};
    if (minCount === 0) updates.enhance_min_ts = now;
    updates.enhance_min_cnt = minCount + 1;

    if (dayCount === 0) updates.enhance_day_ts = now;
    updates.enhance_day_cnt = dayCount + 1;

    await limitRef.set(updates, { merge: true });
    return true;
  } catch (fsErr) {
    console.warn("Firestore rate limit fallback error:", fsErr);
    return true;
  }
}

async function checkAnalyzeRateLimit(uid: string): Promise<boolean> {
  if (analyzeRateLimitHour) {
    try {
      const result = await analyzeRateLimitHour.limit(`analyze_hour_${uid}`);
      return result.success;
    } catch (e) {
      console.warn("Upstash limit check error for analyze, falling back:", e);
    }
  }

  try {
    const limitRef = adminDb.collection('user_rate_limits').doc(uid);
    const limitSnap = await limitRef.get();
    const now = Date.now();
    const limitData = limitSnap.exists ? (limitSnap.data() || {}) : {};

    const hourTimestamp = limitData.analyze_hour_ts || 0;
    let hourCount = limitData.analyze_hour_cnt || 0;
    if (now - hourTimestamp > 60 * 60 * 1000) {
      hourCount = 0;
    }
    if (hourCount >= 10) return false;

    const updates: any = {};
    if (hourCount === 0) updates.analyze_hour_ts = now;
    updates.analyze_hour_cnt = hourCount + 1;

    await limitRef.set(updates, { merge: true });
    return true;
  } catch (fsErr) {
    console.warn("Firestore rate limit analyze fallback error:", fsErr);
    return true;
  }
}

// 2. POST /api/ai/enhance-image (secure, server-side image quality enhancement)
app.post("/api/ai/enhance-image", async (req, res) => {
  try {
    let uid: string;
    try {
      uid = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const { image_base64, mime_type } = req.body;
    if (!image_base64) {
      return res.status(400).json({ error: "Manjka slikovni podatek (image_base64)." });
    }

    if (!mime_type || (mime_type !== 'image/jpeg' && mime_type !== 'image/png' && mime_type !== 'image/webp')) {
      return res.status(400).json({ error: "Nepodprt tip slike (mime_type). Dovoljeni so: image/jpeg, image/png ali image/webp." });
    }

    const decodedLength = (image_base64.length * 3) / 4 - (image_base64.endsWith('==') ? 2 : (image_base64.endsWith('=') ? 1 : 0));
    if (decodedLength > 4 * 1024 * 1024) {
      return res.status(400).json({ error: "Slika presega največjo dovoljeno velikost 4 MB." });
    }

    const allowed = await checkEnhanceRateLimit(uid);
    if (!allowed) {
      return res.status(429).json({ error: "Presegli ste omejitev pošiljanja za polepšanje slik (največ 5 na minuto in 30 na dan)." });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: image_base64,
              mimeType: mime_type,
            },
          },
          {
            text: 'Enhance the quality, lighting, and sharpness of this image. Keep the original subject exactly the same, just make it look more professional and appealing.',
          },
        ],
      },
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
      },
    });

    let newBase64 = null;
    let newMime = mime_type;

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        newBase64 = part.inlineData.data;
        newMime = part.inlineData.mimeType || mime_type;
        break;
      }
    }

    if (!newBase64) {
      return res.status(502).json({ error: "Polepšanje slike trenutno ni uspelo. Poskusite znova ali uporabite izvirno sliko." });
    }

    return res.json({
      image_base64: newBase64,
      mime_type: newMime
    });

  } catch (err: any) {
    console.error('Error in /api/ai/enhance-image:', err);
    return res.status(502).json({ error: "Storitev umetne inteligence trenutno ni na voljo. Poskusite znova pozneje." });
  }
});

// 3. POST /api/analyze-receipt (secure, hardened receipt scanner)
app.post("/api/analyze-receipt", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { imageUrl } = req.body;
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
      return res.status(400).json({ error: "Invalid image URL. Must be a secure HTTPS link." });
    }

    try {
      const parsedUrl = new URL(imageUrl);
      const host = parsedUrl.host;
      if (host !== 'firebasestorage.googleapis.com' && host !== 'storage.googleapis.com') {
        return res.status(400).json({ error: "Dostop zavrnjen. Gostitelj slike mora biti firebasestorage.googleapis.com ali storage.googleapis.com." });
      }

      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
      if (!imageUrl.includes(bucketName)) {
        return res.status(400).json({ error: "Dostop zavrnjen. Slika ne pripada dovoljenemu vedru shranjevanja." });
      }
    } catch (urlErr) {
      return res.status(400).json({ error: "Neveljaven URL slike." });
    }

    const allowed = await checkAnalyzeRateLimit(userId);
    if (!allowed) {
      return res.status(429).json({ error: "Presegli ste urno omejitev analiziranja računov (največ 10 na uro)." });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let fetchResponse;
    try {
      fetchResponse = await fetch(imageUrl, { signal: controller.signal });
    } catch (fetchErr: any) {
      if (fetchErr.name === 'AbortError') {
        return res.status(400).json({ error: "Čas za prenos slike je potekel (največ 10 sekund)." });
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = fetchResponse.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: "Napačna vrsta vsebine. Dovoljene so le slike." });
    }

    const contentLengthStr = fetchResponse.headers.get('content-length');
    if (contentLengthStr) {
      const contentLength = parseInt(contentLengthStr, 10);
      if (contentLength > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "Slika je prevelika (največja dovoljena velikost je 5 MB)." });
      }
    }

    const arrayBuffer = await fetchResponse.arrayBuffer();
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Slika je prevelika (največja dovoljena velikost je 5 MB)." });
    }

    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = contentType || 'image/jpeg';

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const geminiResponse = await ai.models.generateContent({
      model: process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash',
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
    console.error("Gemini Vision error in /api/analyze-receipt:", e);
    res.status(502).json({ error: "Storitev umetne inteligence trenutno ni na voljo. Poskusite znova pozneje." });
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

  if (createAuctionRateLimiter) {
    try {
      const { success } = await createAuctionRateLimiter.limit(userId);
      if (!success) {
        return res.status(429).json({ error: "Preveč ustvarjenih dražb v tem časovnem okviru." });
      }
    } catch (err) {
      console.warn("Rate limit check failed:", err);
    }
  }

  try {
    const { itemData } = req.body || {};
    if (!itemData || typeof itemData !== 'object' || Array.isArray(itemData)) {
      return res.status(400).json({ error: "Manjkajo podatki o dražbi." });
    }

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

      // STRICT IMAGE URL VALIDATION (TASK 27)
      const images = itemData.images || [];
      if (!Array.isArray(images)) {
        return res.status(400).json({ error: "Slike morajo biti seznam povezav (polje)." });
      }
      if (images.length > 10) {
        return res.status(400).json({ error: "Dovoljenih je največ 10 slik." });
      }

      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
      const allowedPrefixEncoded = `auction-images%2F${userId}%2F`;
      const allowedPrefixDecoded = `auction-images/${userId}/`;

      for (const imgUrl of images) {
        if (typeof imgUrl !== 'string') {
          return res.status(400).json({ error: "Neveljaven URL slike." });
        }
        if (!imgUrl.startsWith('https://')) {
          return res.status(400).json({ error: "Vse slike morajo uporabljati varno HTTPS povezavo." });
        }
        try {
          const parsedUrl = new URL(imgUrl);
          if (parsedUrl.host !== 'firebasestorage.googleapis.com') {
            return res.status(400).json({ error: "Slike morajo biti shranjene na firebasestorage.googleapis.com." });
          }
          if (!imgUrl.includes(bucketName)) {
            return res.status(400).json({ error: "Slike morajo pripadati projektu drazba.si." });
          }
          if (!imgUrl.includes(allowedPrefixEncoded) && !imgUrl.includes(allowedPrefixDecoded)) {
            return res.status(400).json({ error: `Nalagate lahko le slike v svojo mapo (${allowedPrefixDecoded}).` });
          }
        } catch (e) {
          return res.status(400).json({ error: "Neveljaven URL slike." });
        }
      }
    }

    const userDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    if (!userDoc.exists()) return res.status(404).json({ error: "Uporabnik ne obstaja" });

    const userData = userDoc.data() || {};
    if (userData.isBlocked) {
      return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
    }
    try {
      await assertVerifiedUser(userId, userData);
    } catch (verErr: any) {
      return res.status(403).json({ error: verErr.message, code: verErr.code });
    }

    if (userData.stripe_onboarding_complete !== true) {
      return res.status(403).json({ error: 'Za objavo dražbe morate najprej urediti izplačila.', code: 'PAYOUTS_NOT_READY' });
    }
    
    const subTier = userData.subscription_tier || userData.subscription || 'FREE';
    let limit = 5;
    if (subTier === 'BASIC') limit = 50;
    if (subTier === 'PRO') limit = Infinity;

    // Deutscher Kommentar: Das Monatslimit darf nicht durch Mitsenden einer eigenen ID umgangen werden; nur die Neuverwendung einer eigenen, unberuehrten Auktion zaehlt nicht doppelt
    let reusesOwnDraft = false;
    if (typeof itemData.id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(itemData.id)) {
      const prev = await safeGetDoc(adminDb.collection('auctions').doc(itemData.id));
      reusesOwnDraft = prev.exists() && (prev.data() as any)?.seller_id === userId;
    }
    if (limit !== Infinity && !reusesOwnDraft) {
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

    if (itemData) {
      const locSlo = (typeof itemData.location === 'object') ? itemData.location?.SLO : itemData.location;
      if (!itemData.category || !String(itemData.category).trim() ||
          !itemData.condition || !String(itemData.condition).trim() ||
          !itemData.region || !String(itemData.region).trim() ||
          !locSlo || !String(locSlo).trim()) {
        return res.status(400).json({ error: "Izberite kategorijo, stanje predmeta, regijo in vnesite mesto." });
      }

      if (itemData.end_time) itemData.end_time = new Date(itemData.end_time).toISOString();
      if (itemData.endTime) itemData.endTime = new Date(itemData.endTime).toISOString();
      if (itemData.payment_deadline) itemData.payment_deadline = new Date(itemData.payment_deadline).toISOString();
    }

    // Deutscher Kommentar: Nur erlaubte Felder uebernehmen (Whitelist). Preis, Gebote, Gewinner und Zahlungsstatus setzt ausschliesslich der Server.
    const cleanDeep = (v: any, depth = 0): any => {
      if (typeof v === 'string') return v.replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 10000);
      if (depth > 3 || v === null || typeof v !== 'object') return typeof v === 'number' || typeof v === 'boolean' ? v : null;
      if (Array.isArray(v)) return v.slice(0, 50).map(x => cleanDeep(x, depth + 1));
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).slice(0, 50)) {
        if (/^__|[./]/.test(k)) continue;
        out[k] = cleanDeep(v[k], depth + 1);
      }
      return out;
    };
    const startPrice = Number(itemData.current_price ?? itemData.startingPrice);
    if (!Number.isFinite(startPrice) || startPrice < 1 || startPrice > 1000000) {
      return res.status(400).json({ error: "Začetna cena mora biti med 1 in 1.000.000 €." });
    }
    const endMs = new Date(itemData.end_time || itemData.endTime || '').getTime();
    // TESTPHASE: Laufzeitgrenzen (frueher 3-14 Tage, Mindestvorlauf 2 Tage) sind voruebergehend aufgehoben. Nach der Testphase wieder einsetzen: minEndMs = Date.now() + (reusesOwnDraft ? 0 : 2 * 86400000), maxEndMs = Date.now() + 15 * 86400000, Fehlertext "Dražba mora trajati od 3 do 14 dni."
    const minEndMs = Date.now() + 60 * 1000;
    const maxEndMs = Date.now() + 365 * 86400000;
    if (!Number.isFinite(endMs) || endMs < minEndMs || endMs > maxEndMs) {
      return res.status(400).json({ error: "Čas zaključka dražbe mora biti v prihodnosti (največ 1 leto)." });
    }
    const deliveryOption = ['both', 'pickup_only', 'shipping_only'].includes(itemData.delivery_option) ? itemData.delivery_option : 'both';
    // Nur noch Festpreis-Versand (Abrechnung nach Rechnung der Post entfernt)
    const shippingFeeType = 'fixed';
    const shippingCost = itemData.shipping_cost === null || itemData.shipping_cost === undefined ? null : Number(itemData.shipping_cost);
    if (shippingCost !== null && (!Number.isFinite(shippingCost) || shippingCost < 0 || shippingCost > 1000)) {
      return res.status(400).json({ error: "Poštnina ni veljavna." });
    }
    if (deliveryOption !== 'pickup_only' && shippingCost === null) {
      return res.status(400).json({ error: "Vnesite znesek poštnine." });
    }
    const specsJson = JSON.stringify(itemData.specifications || {});
    if (specsJson.length > 20000) {
      return res.status(400).json({ error: "Specifikacije so predolge." });
    }
    const safeData: Record<string, any> = {
      title: cleanDeep(itemData.title),
      description: cleanDeep(itemData.description),
      current_price: startPrice,
      item_count: Math.min(Math.max(parseInt(itemData.item_count) || 1, 1), 1000),
      end_time: new Date(endMs).toISOString(),
      location: cleanDeep(itemData.location),
      region: cleanDeep(itemData.region),
      category: cleanDeep(itemData.category),
      condition: cleanDeep(itemData.condition),
      specifications: cleanDeep(itemData.specifications || {}),
      images: itemData.images || [],
      delivery_option: deliveryOption,
      shipping_fee_type: shippingFeeType,
      shipping_cost: shippingCost,
      is_package: itemData.is_package === true,
      package_id: typeof itemData.package_id === 'string' ? itemData.package_id.slice(0, 100) : null,
      packageId: typeof itemData.package_id === 'string' ? itemData.package_id.slice(0, 100) : null,
      package_title: typeof itemData.package_title === 'string' ? cleanDeep(itemData.package_title) : null
    };

    // Deutscher Kommentar: Eine vom Client gewaehlte ID darf nie eine fremde oder bereits laufende Auktion ueberschreiben
    let newDocRef = adminDb.collection('auctions').doc();
    if (typeof itemData.id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(itemData.id)) {
      const wanted = adminDb.collection('auctions').doc(itemData.id);
      const existing = await safeGetDoc(wanted);
      if (existing.exists()) {
        const ex: any = existing.data();
        const sameOwnerUntouched = (ex.seller_id === userId) && !(Number(ex.bid_count) > 0) && !ex.winner_id && !ex.post_auction_status;
        if (!sameOwnerUntouched) {
          return res.status(409).json({ error: "Dražba s tem ID-jem že obstaja." });
        }
      }
      newDocRef = wanted;
    }

    await newDocRef.set({
      ...safeData,
      id: newDocRef.id,
      seller_id: userId,
      status: "active",
      bid_count: 0,
      winner_id: null,
      winnerId: null,
      payment_status: 'unpaid',
      post_auction_status: null,
      created_at: new Date().toISOString()
    });

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
      // Lieferart aus der Transaktion, bei Altdaten aus der Auktion
      let txDeliveryMethod = tx.delivery_method;
      if (!txDeliveryMethod && tx.auction_id) {
        const auctionSnap = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
        txDeliveryMethod = auctionSnap.exists() ? auctionSnap.data().delivery_method : null;
      }
      // Abholung oder noch nicht gewaehlte Lieferart: keine Versandfrist
      if (!isPostalDelivery(txDeliveryMethod)) continue;

      const paidReference = tx.paid_at || tx.held_since;
      let deadline = tx.shipping_deadline;
      if (!deadline && paidReference) {
        deadline = new Date(new Date(paidReference).getTime() + SHIP_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      }

      // Deutscher Kommentar: Taegliche Erinnerung an den Verkaeufer ab 3 Tage vor Fristende, bis die Sendung als versendet markiert ist
      if (deadline && now < deadline && !tx.shipped_at) {
        try {
          const msLeft = new Date(deadline).getTime() - new Date(now).getTime();
          const today = String(now).slice(0, 10);
          if (msLeft <= 3 * 24 * 60 * 60 * 1000 && tx.last_ship_reminder_day !== today) {
            const daysLeft = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
            const rAuctionSnap = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
            const rAuction: any = rAuctionSnap.exists() ? rAuctionSnap.data() : {};
            const rTitle = rAuction?.title?.SLO || 'Predmet dražbe';
            const deadlineTxt = new Date(deadline).toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Ljubljana' });
            await createNotification({
              userId: tx.seller_id,
              type: 'shipping_reminder',
              auctionId: tx.auction_id,
              auctionTitle: rTitle,
              imageUrl: rAuction?.images?.[0]?.url || rAuction?.images?.[0] || '',
              price: Number(tx.item_price || 0),
              message: `Opomnik: predmet še ni poslan. Do izteka roka (${deadlineTxt}) je ${daysLeft === 1 ? 'še 1 dan' : `še ${daysLeft} dni`}. Pošljite ga in označite odpremo.`,
              target: 'sold'
            });
            const rSellerSnap = await safeGetDoc(adminDb.collection('users').doc(tx.seller_id));
            const rSeller: any = rSellerSnap.exists() ? rSellerSnap.data() : {};
            if (rSeller.email && process.env.RESEND_API_KEY && resendClient) {
              const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
              const htmlContent = await render(React.createElement(AuctionEmailTemplate, {
                type: 'shipping_reminder_seller',
                recipientName: rSeller.first_name || rSeller.name || 'prodajalec',
                auctionTitle: rTitle,
                auctionImageUrl: rAuction?.images?.[0]?.url || rAuction?.images?.[0],
                currentPrice: tx.item_price,
                auctionUrl: `${baseAppUrl}/?drazba=${tx.auction_id}`,
                settingsUrl: `${baseAppUrl}/?tab=settings`,
                paymentDeadline: deadlineTxt
              }));
              await resendClient.emails.send({
                from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
                to: rSeller.email,
                subject: `Opomnik: pošljite predmet ${rTitle} (še ${daysLeft === 1 ? '1 dan' : daysLeft + ' dni'}) - dražbenik.si`,
                html: htmlContent
              });
            }
            await docSnap.ref.update({ last_ship_reminder_day: today });
          }
        } catch (remErr: any) {
          console.error('[cron] shipping reminder failed:', remErr?.message);
        }
      }

      if (deadline && now >= deadline) {
        // Durchführung der Rückerstattung über die zentrale Hilfsfunktion
        const refundRes = await refundTransactionToBuyer(docSnap.id, 'seller_no_shipment');

        if (refundRes.ok) {
          // Dem Verkäufer einen Strike hinzufügen
          await adminDb.collection('seller_strikes').add({
            user_id: tx.seller_id,
            order_id: docSnap.id,
            reason: 'NO_SHIPMENT_IN_DEADLINE',
            created_at: now
          });

          const sellerRef = adminDb.collection('users').doc(tx.seller_id);
          const sellerDoc = await safeGetDoc(sellerRef);
          if (sellerDoc.exists()) {
            const notes = sellerDoc.data().system_notes || [];
            await sellerRef.update({
              system_notes: [...notes, `Naročilo preklicano – predmet ni bil poslan v roku (Naročilo: ${docSnap.id})`]
            });
          }

          await checkAndApplySellerPenalties(tx.seller_id);

          // E-Mail-Benachrichtigungen an beide Parteien senden, falls noch nicht geschehen
          try {
            const freshTxSnap = await docSnap.ref.get();
            const freshTx = freshTxSnap.data() || {};
            if (!freshTx.email_flags?.shipping_cancelled) {
              const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(tx.buyer_id));
              const buyer = buyerDoc.data() || {};
              const sellerDoc2 = await safeGetDoc(adminDb.collection('users').doc(tx.seller_id));
              const seller = sellerDoc2.data() || {};
              const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
              const auction = auctionDoc.data() || {};

              if (buyer.email && seller.email) {
                await sendShippingCancelledNotifications({
                  buyerEmail: buyer.email,
                  sellerEmail: seller.email,
                  buyerName: buyer.first_name || buyer.name,
                  sellerName: seller.first_name || seller.name,
                  auctionId: tx.auction_id,
                  auctionTitle: auction?.title?.SLO || 'Predmet dražbe',
                  auctionImageUrl: auction?.images?.[0]?.url || auction?.images?.[0],
                  totalAmount: Number(tx.amount_total || tx.amount || 0)
                });
                
                await docSnap.ref.update({
                  'email_flags.shipping_cancelled': true
                });
              }
            }
          } catch (emErr: any) {
            console.error('[cron] Error sending cancellation emails:', emErr.message);
          }

          processed++;
        } else {
          // Fehler dokumentieren und Admin-Alarm auslösen
          await docSnap.ref.update({
            refund_error: refundRes.status,
            refund_failed_at: now
          });

          try {
            await adminDb.collection('admin_alerts').add({
              type: 'REFUND_FAILED',
              transaction_id: docSnap.id,
              status: refundRes.status,
              reason: 'SELLER_NO_SHIPMENT',
              created_at: now
            });
            // Administrator per E-Mail über den Fehler benachrichtigen
            if (process.env.RESEND_API_KEY && resendClient) {
              await resendClient.emails.send({
                from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
                to: adminEmailAddress,
                subject: `Opozorilo: Neuspešno vračilo kupnine za naročilo ${docSnap.id}`,
                html: `<p>Vračilo kupnine za naročilo <strong>${docSnap.id}</strong> ni uspelo.</p><p>Status: ${refundRes.status}</p>`
              });
            }
          } catch (alertErr: any) {
            console.error('Failed to create admin alert for refund failure:', alertErr.message);
          }
        }
      }
    }

    // Deutscher Kommentar: "Nicht angekommen" ohne Nachweis des Verkaeufers innerhalb der Frist -> Rueckerstattung und Strike
    try {
      const nowIso2 = new Date().toISOString();
      const disputedSnap = await safeGetDocs(
        adminDb.collection('transactions').where('status', '==', 'DISPUTED')
      );
      for (const dDoc of disputedSnap.docs) {
        const dtx: any = dDoc.data();
        if (dtx.dispute_kind !== 'not_received' || dtx.seller_proof_at || !dtx.proof_requested_until) continue;
        if (dtx.proof_requested_until > nowIso2) continue;
        const rr = await refundTransactionToBuyer(dDoc.id, 'seller_no_proof');
        if (!rr.ok) continue;
        await bumpDisputeStat(dtx.seller_id, 'proof_missed_as_seller');
        // Deutscher Kommentar: Opomin nur bei Sendung mit Tracking (Verkaeufer hat Versand mit Nummer erklaert); ohne Tracking nur Rueckerstattung
        if (dtx.shipping_type !== 'untracked') {
          await adminDb.collection('seller_strikes').add({
            user_id: dtx.seller_id,
            order_id: dDoc.id,
            reason: 'NO_SHIPPING_PROOF',
            created_at: nowIso2
          });
          await checkAndApplySellerPenalties(dtx.seller_id);
        }
        const ds = await adminDb.collection('disputes').where('order_id', '==', dDoc.id).get();
        for (const x of ds.docs) {
          await x.ref.update({ status: 'RESOLVED', resolution: 'refund_buyer_no_proof', updated_at: nowIso2 });
        }
        processed++;
      }
    } catch (proofErr: any) {
      console.error('[cron] shipping-proof check failed:', proofErr?.message);
    }

    res.json({ success: true, processed });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

app.get("/api/cron/process-shipping-deadlines", handleProcessShippingDeadlines);
app.post("/api/cron/process-shipping-deadlines", handleProcessShippingDeadlines);

app.get("/api/orders/:id/pickup-pin", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { id } = req.params;
    let txRef = adminDb.collection('transactions').doc(id);
    let txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      const qSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).limit(1));
      if (!qSnap.empty) {
        txDoc = qSnap.docs[0];
        txRef = txDoc.ref;
      }
    }
    if (!txDoc.exists()) {
      return res.status(404).json({ error: "Naročilo ne obstaja." });
    }

    const tx = txDoc.data();
    if (tx.buyer_id !== userId) {
      return res.status(403).json({ error: "Nimate pravic za to naročilo." });
    }

    let deliveryMethod = tx.delivery_method;
    if (!deliveryMethod && tx.auction_id) {
      try {
        const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
        if (auctionDoc.exists()) {
          deliveryMethod = auctionDoc.data()?.delivery_method;
        }
      } catch (err: any) {
        console.error('[GET pickup-pin] Error fetching auction delivery method:', err?.message);
      }
    }

    if (deliveryMethod !== 'pickup') {
      return res.status(400).json({ error: "Za to naročilo koda za predajo ni na voljo." });
    }

    if (tx.status !== 'HELD_IN_ESCROW') {
      return res.status(400).json({ error: "Koda za predajo ni več veljavna." });
    }

    const secrets = await getOrCreatePickupSecrets(txDoc.id, tx.auction_id);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ pin: secrets.pin, qrUrl: secrets.qrUrl });
  } catch (e: any) {
    console.error('[GET pickup-pin]', e);
    return res.status(500).json({ error: e.message });
  }
});

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
    let txRef = adminDb.collection('transactions').doc(id);
    let txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      const qSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).limit(1));
      if (!qSnap.empty) {
        txDoc = qSnap.docs[0];
        txRef = txDoc.ref;
      }
    }
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });

    const tx = txDoc.data();
    // Nur der Verkaeufer der Bestellung darf den Abhol-PIN verifizieren
    if (tx.seller_id !== userId) return res.status(403).json({ error: "Te dražbe ne morete potrditi s tem računom." });
    if (tx.status === 'COMPLETED') return res.json({ success: true, message: "Predaja je že potrjena." });
    if (tx.payout_status === 'frozen' || tx.payout_status === 'refunded' || tx.status === 'DISPUTED') {
      return res.status(400).json({ error: "Naročila v trenutnem stanju ni mogoče potrditi." });
    }
    if (tx.status !== 'HELD_IN_ESCROW') return res.status(400).json({ error: "Naročilo ni v stanju HELD_IN_ESCROW." });

    let deliveryMethod = tx.delivery_method;
    if (!deliveryMethod && tx.auction_id) {
      try {
        const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
        if (auctionDoc.exists()) {
          deliveryMethod = auctionDoc.data()?.delivery_method;
        }
      } catch (err: any) {}
    }
    if (deliveryMethod !== 'pickup') {
      return res.status(400).json({ error: "Predaja je na voljo le za osebni prevzem." });
    }

    // PIN muss genau 6 Ziffern haben
    const pin = String(req.body?.pin || '').trim();
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: "Vnesite 6-mestno kodo." });
    const secretRef = adminDb.collection('transaction_secrets').doc(txDoc.id);
    const secretDoc = await safeGetDoc(secretRef);
    const secret = secretDoc.exists() ? (secretDoc.data() || {}) : null;
    if (!secret || !secret.pickup_pin) return res.status(400).json({ error: "Kupec kode še ni odprl v svojem računu." });
    const nowMs = Date.now();
    if (secret.locked_until && secret.locked_until > nowMs) {
      return res.status(429).json({ error: "Preveč napačnih poskusov. Poskusite znova čez nekaj minut." });
    }
    if ((secret.lock_count || 0) >= 3) {
      return res.status(423).json({ error: "Vnos kode je zaklenjen. Predajo naj potrdi kupec v aplikaciji." });
    }
    // Konstanter Zeitvergleich
    const a = Buffer.from(pin);
    const b = Buffer.from(String(secret.pickup_pin));
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      const failed = (secret.failed_attempts || 0) + 1;
      const update: any = { failed_attempts: failed };
      if (failed >= 5) {
        update.failed_attempts = 0;
        update.lock_count = (secret.lock_count || 0) + 1;
        update.locked_until = nowMs + 15 * 60 * 1000;
      }
      await secretRef.set(update, { merge: true });
      return res.status(400).json({ error: "Napačna koda." });
    }
    await secretRef.set({ failed_attempts: 0 }, { merge: true });

    await completePickupHandover(txRef, txDoc.id, tx, 'pickup_pin_confirmed');

    return res.json({ success: true, message: "Predaja potrjena. Izplačilo je sproženo." });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/orders/:id/verify-pickup-qr", async (req, res) => {
  // Nutzer-ID ausschliesslich aus dem verifizierten Token
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { id } = req.params;
    let txRef = adminDb.collection('transactions').doc(id);
    let txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      const qSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).limit(1));
      if (!qSnap.empty) {
        txDoc = qSnap.docs[0];
        txRef = txDoc.ref;
      }
    }
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });

    const tx = txDoc.data();
    // Nur der Verkaeufer der Bestellung darf den QR-Token verifizieren
    if (tx.seller_id !== userId) return res.status(403).json({ error: "Te dražbe ne morete potrditi s tem računom." });
    if (tx.status === 'COMPLETED') return res.json({ success: true, message: "Predaja je že potrjena." });
    if (tx.payout_status === 'frozen' || tx.payout_status === 'refunded' || tx.status === 'DISPUTED') {
      return res.status(400).json({ error: "Naročila v trenutnem stanju ni mogoče potrditi." });
    }
    if (tx.status !== 'HELD_IN_ESCROW') return res.status(400).json({ error: "Naročilo ni v stanju HELD_IN_ESCROW." });

    let deliveryMethod = tx.delivery_method;
    if (!deliveryMethod && tx.auction_id) {
      try {
        const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
        if (auctionDoc.exists()) {
          deliveryMethod = auctionDoc.data()?.delivery_method;
        }
      } catch (err: any) {}
    }
    if (deliveryMethod !== 'pickup') {
      return res.status(400).json({ error: "Predaja je na voljo le za osebni prevzem." });
    }

    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: "Manjka potrditveni žeton." });

    const secretRef = adminDb.collection('transaction_secrets').doc(txDoc.id);
    const secretDoc = await safeGetDoc(secretRef);
    const secret = secretDoc.exists() ? (secretDoc.data() || {}) : null;
    if (!secret || !secret.pickup_qr_token) return res.status(400).json({ error: "Kupec kode še ni odprl v svojem računu." });
    const nowMs = Date.now();
    if (secret.locked_until && secret.locked_until > nowMs) {
      return res.status(429).json({ error: "Preveč napačnih poskusov. Poskusite znova čez nekaj minut." });
    }
    if ((secret.lock_count || 0) >= 3) {
      return res.status(423).json({ error: "Vnos kode je zaklenjen. Predajo naj potrdi kupec v aplikaciji." });
    }

    const a = Buffer.from(token);
    const b = Buffer.from(String(secret.pickup_qr_token));
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      const failed = (secret.failed_attempts || 0) + 1;
      const update: any = { failed_attempts: failed };
      if (failed >= 5) {
        update.failed_attempts = 0;
        update.lock_count = (secret.lock_count || 0) + 1;
        update.locked_until = nowMs + 15 * 60 * 1000;
      }
      await secretRef.set(update, { merge: true });
      return res.status(400).json({ error: "Napačna koda." });
    }
    await secretRef.set({ failed_attempts: 0 }, { merge: true });

    await completePickupHandover(txRef, txDoc.id, tx, 'pickup_qr_confirmed');

    return res.json({ success: true, message: "Predaja potrjena. Izplačilo je sproženo." });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message });
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
    const { carrier_id, carrier_name, tracking_number, shipping_type, untracked_risk_ack, posting_proof_ack, posting_receipt_ref } = req.body || {};
    const receiptRef = typeof posting_receipt_ref === 'string' ? posting_receipt_ref.trim().slice(0, 200) : '';

    // Deutscher Kommentar: Die Transaktions-ID lautet tx_<paymentRef>; der Client sendet die Auktions-ID, daher Fallback ueber auction_id
    let txRef = adminDb.collection('transactions').doc(id);
    let txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      // Bei mehreren Transaktionen zur Auktion (z. B. erstattet + neu bezahlt) die aktive, noch nicht versendete des Verkaeufers waehlen
      const qSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).where('seller_id', '==', userId));
      if (!qSnap.empty) {
        txDoc = qSnap.docs.find((d: any) => d.data()?.status === 'HELD_IN_ESCROW') || qSnap.docs[0];
        txRef = txDoc.ref;
      }
    }
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });

    const tx = txDoc.data();
    // Nur der Verkaeufer der Bestellung darf diese als versendet markieren
    if (tx.seller_id !== userId) return res.status(403).json({ error: "Nimate pravic." });
    if (tx.status !== 'HELD_IN_ESCROW') return res.status(400).json({ error: "Napačno stanje naročila." });

    const amount = Number(tx.item_price ?? (tx.seller_net_cents ? tx.seller_net_cents / 100 : tx.amount_total));
    // Deutscher Kommentar: Regeln - ueber der Schwelle nur mit Sendungsverfolgung, darunter auch ohne (Risiko beim Verkaeufer)
    const requestedType = shipping_type === 'untracked' ? 'untracked' : 'tracked';
    const carrierId = CARRIERS.some((c) => c.id === carrier_id) ? String(carrier_id) : 'other';
    let normalizedTracking: string | null = null;
    if (amount > TRACKING_REQUIRED_ABOVE_EUR && requestedType === 'untracked') {
      return res.status(400).json({ error: `Za zneske nad ${TRACKING_REQUIRED_ABOVE_EUR} € je obvezna pošiljka s sledenjem.` });
    }
    if (requestedType === 'tracked') {
      const check = checkTrackingNumber(carrierId, String(tracking_number || ''));
      if (check.error) return res.status(400).json({ error: check.error });
      normalizedTracking = check.normalized;
      // Deutscher Kommentar: Dieselbe Sendungsnummer darf nicht bei mehreren Bestellungen verwendet werden
      const dupSnap = await safeGetDocs(adminDb.collection('transactions').where('tracking_number', '==', normalizedTracking));
      // Deutscher Kommentar: Gleiche Nummer ist erlaubt, wenn dieselbe Sendung mehrere Bestellungen desselben Kaeufers beim selben Verkaeufer enthaelt (Sammelversand)
      // TESTPHASE: Die Test-Sendungsnummer RR123456789SI darf beliebig oft verwendet werden (spaeter entfernen)
      const isTestTracking = normalizedTracking === 'RR123456789SI';
      const conflicting = dupSnap.docs.some((d: any) => {
        if (d.id === txDoc.id) return false;
        const o = d.data() || {};
        return !(o.seller_id === tx.seller_id && o.buyer_id === tx.buyer_id);
      });
      if (!isTestTracking && conflicting) {
        return res.status(400).json({ error: "Ta sledilna številka je že uporabljena pri drugem naročilu." });
      }
    } else {
      if (untracked_risk_ack !== true) {
        return res.status(400).json({ error: "Potrdite, da pri pošiljki brez sledenja tveganje izgube nosite sami." });
      }
      // Deutscher Kommentar: Ohne Tracking ist der Aufgabebeleg der einzige Schutz des Verkaeufers, daher Pflichtangabe
      if (receiptRef.length < 5) {
        return res.status(400).json({ error: "Pri pošiljki brez sledenja vpišite podatke s potrdila o oddaji (datum, pošta, številka potrdila)." });
      }
    }
    if (posting_proof_ack !== true) {
      return res.status(400).json({ error: "Potrdite, da hranite potrdilo o oddaji pošiljke." });
    }

    const buyerCc = tx.buyer_snapshot?.country_code || 'SI';
    const sellerCc = tx.seller_snapshot?.country_code || 'SI';
    const isCrossBorder = buyerCc !== 'SI' || sellerCc !== 'SI';
    const releaseDays = isCrossBorder ? AUTO_RELEASE_AFTER_SHIPPED_DAYS_CROSS_BORDER : AUTO_RELEASE_AFTER_SHIPPED_DAYS;
    
    const now = new Date();
    const autoReleaseAt = new Date(now.getTime() + releaseDays * 24 * 60 * 60 * 1000);

    await txRef.update({
      status: 'SHIPPED',
      carrier_id: carrierId,
      carrier_name: (typeof carrier_name === 'string' && carrier_name.trim() ? carrier_name.trim().slice(0, 60) : getCarrierLabel(carrierId)),
      shipping_type: requestedType,
      tracking_number: normalizedTracking,
      untracked_risk_ack: requestedType === 'untracked',
      posting_proof_ack: true,
      posting_receipt_ref: receiptRef || null,
      shipped_at: now.toISOString(),
      auto_release_at: autoReleaseAt.toISOString()
    });

    // Deutscher Kommentar: Versandstatus auch auf der Auktion spiegeln (UI blendet "Označi kot poslano" aus, Kaeufer sieht "Poslano"); Sendungsnummer bleibt nur in der Transaktion
    try {
      await adminDb.collection('auctions').doc(tx.auction_id).update({
        shipped_at: now.toISOString(),
        shipping_status: 'shipped',
        carrier_name: (typeof carrier_name === 'string' && carrier_name.trim() ? carrier_name.trim().slice(0, 60) : getCarrierLabel(carrierId))
      });
    } catch (aErr: any) {
      console.error('[mark-as-shipped] auction update failed:', aErr?.message);
    }
    try {
      const nAuctionSnap = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
      const nAuction: any = nAuctionSnap.exists() ? nAuctionSnap.data() : {};
      await createNotification({
        userId: tx.buyer_id,
        type: 'item_shipped',
        auctionId: tx.auction_id,
        auctionTitle: nAuction?.title?.SLO || 'Predmet dražbe',
        imageUrl: nAuction?.images?.[0]?.url || nAuction?.images?.[0] || '',
        price: Number(tx.item_price || 0),
        message: `Prodajalec je predmet oddal (${carrier_name || getCarrierLabel(carrierId)}). Ko ga prejmete, potrdite prejem v razdelku Moje zmage.`,
        target: 'winnings'
      });
    } catch (nErr: any) {
      console.error('[mark-as-shipped] notification failed:', nErr?.message);
    }

    try {
      const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(tx.buyer_id));
      const buyer = buyerDoc.data();
      const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
      const auction = auctionDoc.data();

      if (buyer?.email && process.env.RESEND_API_KEY) {
        const auctionTitleText = auction?.title?.SLO || auction?.title?.EN || 'Predmet dražbe';
        const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
        const auctionUrl = `${baseAppUrl}/?drazba=${tx.auction_id}`;
        
        const htmlContent = await render(React.createElement(AuctionEmailTemplate, {
          type: 'item_shipped_buyer',
          recipientName: buyer.first_name || buyer.name || 'kupec',
          auctionTitle: auctionTitleText,
          auctionImageUrl: auction?.images?.[0]?.url || auction?.images?.[0],
          currentPrice: tx.item_price,
          auctionUrl,
          settingsUrl: `${baseAppUrl}/?tab=settings`,
          carrierName: carrier_name || getCarrierLabel(carrierId),
          trackingNumber: normalizedTracking || undefined
        }));

        const resendClient = new Resend(process.env.RESEND_API_KEY);
        await resendClient.emails.send({
          from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
          to: buyer.email,
          subject: `Vaš predmet je bil poslan: ${auctionTitleText} - dražbenik.si`,
          html: htmlContent
        });
      }
    } catch (emErr: any) {
      console.error('[mark-as-shipped] Error sending email:', emErr.message);
    }

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

    // Deutscher Kommentar: Die Transaktions-ID lautet tx_<paymentRef>; der Client sendet die Auktions-ID, daher Fallback ueber auction_id
    let txRef = adminDb.collection('transactions').doc(id);
    let txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      const qSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).limit(1));
      if (!qSnap.empty) {
        txDoc = qSnap.docs[0];
        txRef = txDoc.ref;
      }
    }
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });

    const tx = txDoc.data();
    // Nur der Kaeufer der Bestellung darf die Lieferung bestaetigen
    if (tx.buyer_id !== userId) return res.status(403).json({ error: "Nimate pravic." });
    if (tx.status === 'COMPLETED') return res.json({ success: true });
    if (tx.payout_status === 'frozen' || tx.payout_status === 'refunded' || tx.status === 'DISPUTED') {
      return res.status(400).json({ error: "Naročila v trenutnem stanju ni mogoče potrditi." });
    }
    if (tx.status !== 'SHIPPED') return res.status(400).json({ error: "Naročilo mora biti poslano." });

    await completeTransactionAndPayout(txRef, id, 'buyer_confirmed_receipt');

    res.json({ success: true, message: "Prejem potrjen. Izplačilo je sproženo." });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const handleProcessEscrowCompletions = async (req: express.Request, res: express.Response) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const now = new Date().toISOString();
    let processed = 0;

    // 0. Einmalige Migration für ältere Transaktionen im Status release_waiting_funds oder release_failed
    const legacyWaitingSnap = await safeGetDocs(
      adminDb.collection('transactions').where('payout_status', 'in', ['release_waiting_funds', 'release_failed'])
    );
    for (const docSnap of legacyWaitingSnap.docs) {
      await docSnap.ref.update({ payout_status: 'releasable' });
    }

    // (a) DELIVERED + auto_complete_at <= now
    const snapshotDelivered = await safeGetDocs(
      adminDb.collection('transactions')
        .where('status', '==', 'DELIVERED')
        .where('auto_complete_at', '<=', now)
    );
    for (const docSnap of snapshotDelivered.docs) {
      const tx = docSnap.data();
      if (tx.status === 'DISPUTED') continue;

      await docSnap.ref.update({
        status: 'COMPLETED',
        completed_at: now
      });
      await releaseSellerFunds(docSnap.id, 'auto_complete_delivered');
      processed++;
    }

    // (b) status in HELD_IN_ESCROW, SHIPPED with auto_release_at <= now and no dispute
    const heldSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('status', '==', 'HELD_IN_ESCROW')
        .where('auto_release_at', '<=', now)
    );
    const shippedSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('status', '==', 'SHIPPED')
        .where('auto_release_at', '<=', now)
    );

    const allToRelease = [...heldSnap.docs, ...shippedSnap.docs];
    for (const docSnap of allToRelease) {
      const tx = docSnap.data();
      if (tx.payout_status === 'frozen' || tx.payout_status === 'refunded') continue;
      await releaseSellerFunds(docSnap.id, 'auto_deadline');
      processed++;
    }

    // (c) Automatische Auszahlungen für Verkäufer mit Transaktionen im Status 'releasable', die älter als PAYOUT_AUTO_DAYS (30 Tage) sind
    const releasableSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('payout_status', '==', 'releasable')
        .limit(100)
    );

    const sellersToAutoPayout = new Set<string>();
    const cutoffTime = Date.now() - PAYOUT_AUTO_DAYS * 24 * 60 * 60 * 1000;

    for (const docSnap of releasableSnap.docs) {
      const tx = docSnap.data();
      const releasedAt = new Date(tx.released_at || tx.created_at || Date.now()).getTime();
      if (releasedAt <= cutoffTime && tx.seller_id) {
        sellersToAutoPayout.add(tx.seller_id);
      }
    }

    for (const sellerId of sellersToAutoPayout) {
      try {
        await executeSellerBatchPayout(sellerId, 'auto');
      } catch (autoErr: any) {
        console.error(`[cron] Auto batch payout error for seller ${sellerId}:`, autoErr.message);
      }
    }

    // (d) Deutscher Kommentar: Transaktionen im Status 'payout_pending', die aelter als 15 Minuten sind, ueberpruefen und loesen
    const fifteenMinAgoIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const pendingSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('payout_status', '==', 'payout_pending')
        .where('payout_pending_at', '<=', fifteenMinAgoIso)
    );

    if (!pendingSnap.empty) {
      const pendingByBatch: Record<string, { sellerId: string; docs: any[] }> = {};
      for (const pDoc of pendingSnap.docs) {
        const pData = pDoc.data() || {};
        const bId = pData.payout_batch_id || 'unknown';
        if (!pendingByBatch[bId]) {
          pendingByBatch[bId] = { sellerId: pData.seller_id, docs: [] };
        }
        pendingByBatch[bId].docs.push(pDoc);
      }

      const stripeObj = getStripe();
      for (const [batchId, batchData] of Object.entries(pendingByBatch)) {
        try {
          const uDoc = await safeGetDoc(adminDb.collection('users').doc(batchData.sellerId));
          const uData = uDoc.data() || {};
          const acctId = uData.stripe_account_id || uData.stripeAccountId;

          let foundPayoutId: string | null = null;
          if (acctId) {
            const plist = await stripeObj.payouts.list({ limit: 100 }, { stripeAccount: acctId });
            for (const po of plist.data) {
              if (po.metadata?.batch_id === batchId) {
                foundPayoutId = po.id;
                break;
              }
            }
          }

          const bWrite = adminDb.batch();
          const nowIso = new Date().toISOString();
          if (foundPayoutId) {
            for (const pDoc of batchData.docs) {
              bWrite.update(pDoc.ref, {
                payout_status: 'paid_out',
                payout_id: foundPayoutId,
                paid_out_at: nowIso
              });
            }
          } else {
            for (const pDoc of batchData.docs) {
              bWrite.update(pDoc.ref, {
                payout_status: 'releasable',
                payout_last_error: 'Obdelava izplačila prekinjena'
              });
            }
          }
          await bWrite.commit();
        } catch (pendingErr: any) {
          console.error(`[cron] Error processing stuck payout_pending batch ${batchId}:`, pendingErr.message);
        }
      }
    }

    // (e) hold alerts (90-day Stripe limit check)
    const holdAlertThreshold = new Date(Date.now() - HOLD_ALERT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const holdAlertSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('held_since', '<=', holdAlertThreshold)
    );

    const holdHardThreshold = new Date(Date.now() - HOLD_HARD_LIMIT_DAYS * 24 * 60 * 60 * 1000).toISOString();

    for (const docSnap of holdAlertSnap.docs) {
      const tx = docSnap.data();
      // Bereits ausgezahlte oder erstattete Transaktionen überspringen
      if (tx.payout_status === 'paid_out' || tx.payout_status === 'refunded') continue;
      const statusCheck = ['held', 'frozen', 'release_waiting_funds', 'release_failed'].includes(tx.payout_status);
      if (!statusCheck) continue;

      const isHardLimit = tx.held_since <= holdHardThreshold;

      if (isHardLimit) {
        try {
          if (process.env.RESEND_API_KEY) {
            await resendClient.emails.send({
              from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
              to: adminEmailAddress,
              subject: "KRITIČNO: zadržano izplačilo pred potekom roka",
              html: `<p>Izplačilo za naročilo <strong>${docSnap.id}</strong> je zadržano že več kot ${HOLD_HARD_LIMIT_DAYS} dni (od ${tx.held_since}).</p>
                     <p>Približuje se 90-dnevna časovna omejitev Stripe za ročna izplačila!</p>
                     <p>Status izplačila: ${tx.payout_status}. Znesek: ${tx.item_price} EUR.</p>`
            });
          }
        } catch (emErr: any) {
          console.error('[cron] Error sending hard limit admin email:', emErr.message);
        }
      } else {
        if (tx.hold_alert_sent === true) continue;
        try {
          if (process.env.RESEND_API_KEY) {
            await resendClient.emails.send({
              from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
              to: adminEmailAddress,
              subject: `Opozorilo o zadržanih sredstvih - Naročilo ${docSnap.id}`,
              html: `<p>Izplačilo za naročilo <strong>${docSnap.id}</strong> je zadržano već kot ${HOLD_ALERT_DAYS} dni (od ${tx.held_since}).</p>
                     <p>Približuje se 90-dnevna časovna omejitev Stripe.</p>
                     <p>Status: ${tx.payout_status}. Znesek: ${tx.item_price} EUR.</p>`
            });
            await docSnap.ref.update({ hold_alert_sent: true });
          }
        } catch (emErr: any) {
          console.error('[cron] Error sending alert admin email:', emErr.message);
        }
      }
    }

    // (f) pre-release buyer reminder (48h before auto-release)
    const reminderThreshold = new Date(Date.now() + PRE_RELEASE_BUYER_REMINDER_HOURS * 60 * 60 * 1000).toISOString();
    const reminderSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('status', '==', 'SHIPPED')
        .where('auto_release_at', '<=', reminderThreshold)
    );

    for (const docSnap of reminderSnap.docs) {
      const tx = docSnap.data();
      if (tx.pre_release_reminder_sent === true) continue;
      
      try {
        const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(tx.buyer_id));
        const buyer = buyerDoc.data();
        const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
        const auction = auctionDoc.data();

        if (buyer?.email && process.env.RESEND_API_KEY) {
          const auctionTitleText = auction?.title?.SLO || auction?.title?.EN || 'Predmet dražbe';
          const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
          
          const htmlContent = await render(React.createElement(AuctionEmailTemplate, {
            type: 'item_delivered_buyer',
            recipientName: buyer.first_name || buyer.name || 'kupec',
            auctionTitle: auctionTitleText,
            auctionImageUrl: auction?.images?.[0]?.url || auction?.images?.[0],
            currentPrice: tx.item_price,
            auctionUrl: `${baseAppUrl}/?drazba=${tx.auction_id}`,
            settingsUrl: `${baseAppUrl}/?tab=settings`
          }));

          const resendClient = new Resend(process.env.RESEND_API_KEY);
          await resendClient.emails.send({
            from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
            to: buyer.email,
            subject: `Ste prejeli predmet? ${auctionTitleText} - dražbenik.si`,
            html: htmlContent
          });
        }
        await docSnap.ref.update({ pre_release_reminder_sent: true });
      } catch (emErr: any) {
        console.error('[cron] Error sending pre-release reminder email:', emErr.message);
      }
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
    const { reason, kind } = req.body || {};
    const disputeKind = kind === 'not_received' ? 'not_received' : 'other';

    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 1000) {
      return res.status(400).json({ error: "Razlog za spor mora vsebovati med 10 in 1000 znakov." });
    }
    const trimmedReason = reason.trim();

    // Deutscher Kommentar: Die Transaktions-ID lautet tx_<paymentRef>; der Client sendet die Auktions-ID, daher Fallback ueber auction_id
    let txRef = adminDb.collection('transactions').doc(id);
    let txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      const qSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).limit(1));
      if (!qSnap.empty) {
        txDoc = qSnap.docs[0];
        txRef = txDoc.ref;
      }
    }
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

    const nowIso = new Date().toISOString();
    const isCrossBorder = (tx.buyer_snapshot?.country_code || 'SI') !== 'SI' || (tx.seller_snapshot?.country_code || 'SI') !== 'SI';

    // Deutscher Kommentar: "Nicht angekommen" erst nach angemessener Zustellzeit moeglich
    if (disputeKind === 'not_received' && tx.status === 'SHIPPED' && tx.shipped_at) {
      const minDays = isCrossBorder ? NOT_RECEIVED_MIN_DAYS_CROSS_BORDER : NOT_RECEIVED_MIN_DAYS_DOMESTIC;
      const allowedFrom = new Date(new Date(tx.shipped_at).getTime() + minDays * 86400000);
      if (Date.now() < allowedFrom.getTime()) {
        return res.status(400).json({ error: `Pošiljka je bila poslana pred kratkim. Neprispelo pošiljko lahko prijavite od ${allowedFrom.toLocaleDateString('sl-SI')} dalje.` });
      }
    }

    await txRef.update({
      status: 'DISPUTED',
      payout_status: 'frozen',
      dispute_opened_at: nowIso,
      dispute_kind: disputeKind,
      ...(disputeKind === 'not_received'
        ? { proof_requested_until: new Date(Date.now() + SELLER_PROOF_HOURS * 3600000).toISOString() }
        : {})
    });

    // Deutscher Kommentar: Missbrauchskontrolle - Zaehler des Kaeufers und Verkaeufers erhoehen, Haeufung markieren
    await bumpDisputeStat(userId, disputeKind === 'not_received' ? 'not_received_reports' : 'other_disputes');
    await bumpDisputeStat(tx.seller_id, 'disputes_as_seller');
    const buyerStats = await getDisputeStats(userId);
    // Deutscher Kommentar: Die aktuelle Meldung ist in den 180-Tage-Zahlen noch nicht enthalten
    const suspiciousBuyer = buyerStats.not_received_180d + (disputeKind === 'not_received' ? 1 : 0) >= SUSPICIOUS_REPORTS_180D;

    await adminDb.collection('disputes').add({
      order_id: id,
      opened_by_user_id: userId,
      reason: trimmedReason,
      kind: disputeKind,
      shipping_type: tx.shipping_type || null,
      status: 'OPEN',
      suspicious_buyer: suspiciousBuyer,
      created_at: nowIso,
      updated_at: nowIso
    });
    if (suspiciousBuyer) {
      await adminDb.collection('admin_alerts').add({
        type: 'SUSPICIOUS_NOT_RECEIVED_PATTERN',
        user_id: userId,
        transaction_id: id,
        not_received_180d: buyerStats.not_received_180d,
        created_at: nowIso
      });
    }

    // Deutscher Kommentar: Verkaeufer informieren (Plattform + E-Mail), Pflicht zum Nachweis bei Sendungen mit Tracking
    try {
      const auctionSnap = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
      const auction = auctionSnap.exists() ? auctionSnap.data() : {};
      const title = auction?.title?.SLO || 'Predmet dražbe';
      const untracked = tx.shipping_type === 'untracked';
      const autoRefund = false;
      await createNotification({
        userId: tx.seller_id,
        type: 'shipping_dispute',
        auctionId: tx.auction_id,
        auctionTitle: title,
        imageUrl: auction?.images?.[0]?.url || auction?.images?.[0] || '',
        price: Number(tx.item_price || 0),
        message: disputeKind === 'not_received'
            ? `Kupec je prijavil, da pošiljka ni prispela. V ${SELLER_PROOF_HOURS} urah oddajte dokaz o oddaji pošiljke.`
            : 'Kupec je odprl spor glede naročila. Odgovorite v Prodanih dražbah.',
        target: 'sold'
      });
      const sellerSnap = await safeGetDoc(adminDb.collection('users').doc(tx.seller_id));
      const seller = sellerSnap.exists() ? sellerSnap.data() : {};
      if (seller?.email) {
        await sendAuctionEmail(seller.email, `Spor glede naročila: ${title}`, {
          type: 'shipping_dispute_seller',
          recipientName: seller.first_name || seller.name || 'prodajalec',
          auctionTitle: title,
          auctionImageUrl: auction?.images?.[0]?.url || auction?.images?.[0],
          currentPrice: Number(tx.item_price || 0),
          auctionUrl: `${getBaseAppUrl()}/?drazba=${tx.auction_id}`,
        });
      }
    } catch (notifyErr: any) {
      console.warn('[open-dispute] Obvestilo prodajalcu ni uspelo:', notifyErr?.message);
    }

    res.json({ success: true, message: "Spor uspešno odprt." });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Deutscher Kommentar: Verkaeufer reicht Nachweis der Aufgabe (Beleg, Beschreibung) bei "nicht angekommen" ein
app.post("/api/orders/:id/submit-shipping-proof", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }
  try {
    const { id } = req.params;
    const note = String((req.body || {}).note || '').trim();
    const rawPhotos = Array.isArray((req.body || {}).photos) ? (req.body as any).photos.slice(0, 3) : [];
    // Deutscher Kommentar: Fotos als Base64 (vom Client bereits verkleinert); Typ, Groesse und Dateikopf werden geprueft
    const photoBuffers: Array<{ buf: Buffer; ext: string; mime: string }> = [];
    for (const ph of rawPhotos) {
      const mime = String(ph?.mime_type || '');
      const b64 = String(ph?.data_base64 || '');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !b64) {
        return res.status(400).json({ error: "Dovoljene so slike JPG, PNG ali WebP." });
      }
      const buf = Buffer.from(b64, 'base64');
      if (buf.length === 0 || buf.length > 2.5 * 1024 * 1024) {
        return res.status(400).json({ error: "Posamezna slika je lahko velika največ 2,5 MB." });
      }
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
      if (!(isJpeg || isPng || isWebp)) return res.status(400).json({ error: "Datoteka ni veljavna slika." });
      photoBuffers.push({ buf, mime, ext: isPng ? 'png' : isWebp ? 'webp' : 'jpg' });
    }
    if (note.length > 2000 || (photoBuffers.length === 0 && note.length < 10)) {
      return res.status(400).json({ error: "Opišite dokaz o oddaji (10 do 2000 znakov), npr. datum, pošta, številka potrdila, ali priložite fotografijo." });
    }
    // Deutscher Kommentar: Die Transaktions-ID lautet tx_<paymentRef>; der Client sendet die Auktions-ID, daher Fallback ueber auction_id
    let txRef = adminDb.collection('transactions').doc(id);
    let txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      const qSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).limit(1));
      if (!qSnap.empty) {
        txDoc = qSnap.docs[0];
        txRef = txDoc.ref;
      }
    }
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });
    const tx = txDoc.data();
    if (tx.seller_id !== userId) return res.status(403).json({ error: "Nimate pravic." });
    if (tx.status !== 'DISPUTED' || tx.dispute_kind !== 'not_received') {
      return res.status(400).json({ error: "Za to naročilo dokaz ni potreben." });
    }
    if (tx.seller_proof_at) return res.status(400).json({ error: "Dokaz je že oddan." });
    const photoPaths: string[] = [];
    for (let i = 0; i < photoBuffers.length; i++) {
      const path = `shipping-proofs/${id}/${Date.now()}-${i}.${photoBuffers[i].ext}`;
      await uploadBufferToStorage(photoBuffers[i].buf, path, photoBuffers[i].mime);
      photoPaths.push(path);
    }
    await txRef.update({ seller_proof_note: note, seller_proof_photos: photoPaths, seller_proof_at: new Date().toISOString() });
    await adminDb.collection('admin_alerts').add({
      type: 'SELLER_PROOF_SUBMITTED',
      transaction_id: id,
      note,
      photo_count: photoPaths.length,
      created_at: new Date().toISOString()
    });
    res.json({ success: true, message: "Dokaz je oddan. Spor bomo obravnavali." });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// RECAPTCHA V3 VERIFICATION
app.post("/api/auth/verify-captcha", async (req, res) => {
  try {
    const { token, action } = req.body || {};
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    if (!secretKey) {
      if (process.env.NODE_ENV !== 'production') {
        return res.json({ success: true, score: 1.0 });
      }
      return res.status(503).json({ error: "reCAPTCHA ni nastavljen." });
    }

    if (!token) {
      return res.status(400).json({ error: "Manjka reCAPTCHA žeton." });
    }

    const params = new URLSearchParams();
    params.append('secret', secretKey);
    params.append('response', token);

    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: params
    });
    const data = await verifyRes.json() as any;

    if (!data.success) {
      return res.status(400).json({ error: "Preverjanje reCAPTCHA ni uspelo." });
    }

    if (action && data.action && data.action !== action) {
      return res.status(400).json({ error: "Neveljavno dejanje reCAPTCHA." });
    }

    const score = typeof data.score === 'number' ? data.score : 1.0;
    if (score < 0.5) {
      return res.status(400).json({ error: "Zaznana je sumljiva aktivnost (nizka ocena reCAPTCHA)." });
    }

    return res.json({ success: true, score });
  } catch (err: any) {
    console.error("Error verifying reCAPTCHA:", err);
    return res.status(500).json({ error: err.message || "Napaka pri preverjanju reCAPTCHA." });
  }
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
    // Deutscher Kommentar: Verlaengerung per gespeicherter Karte. Max. 3 Versuche (ein Versuch pro Cron-Lauf), danach wird das Abo beendet (FREE).
    const MAX_RENEWAL_ATTEMPTS = 3;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usersSnapshot = await adminDb.collection('users')
      .where('subscription_active', '==', true)
      .where('subscription_paid_at', '<=', thirtyDaysAgo.toISOString())
      .get();

    let processed = 0;
    let failed = 0;
    let terminated = 0;
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

      // Deutscher Kommentar: Hoechstens ein Versuch pro ca. 20 Stunden (Schutz vor doppelter Abbuchung bei manuellem Cron-Lauf)
      const lastAttempt = user.subscription_last_renewal_attempt_at ? new Date(user.subscription_last_renewal_attempt_at).getTime() : 0;
      if (lastAttempt && now.getTime() - lastAttempt < 20 * 60 * 60 * 1000) {
        continue;
      }

      const attemptNo = (Number(user.subscription_renewal_attempts) || 0) + 1;
      const idempotencyKey = `renew_${doc.id}_${user.subscription_paid_at || 'x'}_${attemptNo}`;
      const nextValidUntil = new Date(now);
      nextValidUntil.setMonth(nextValidUntil.getMonth() + 1);

      let success = false;
      let failReason = '';
      if (user.stripe_customer_id && user.stripe_default_payment_method) {
        try {
          const pi = await stripe.paymentIntents.create({
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
          }, { idempotencyKey });
          if (pi.status === 'succeeded') success = true;
          else failReason = 'status_' + pi.status;
        } catch (stripeError: any) {
          failReason = stripeError?.code || stripeError?.message || 'card_error';
          console.error(`Neuspešno podaljšanje naročnine s kartico za uporabnika ${doc.id}: `, failReason);
        }
      } else {
        failReason = 'no_saved_card';
      }

      if (success) {
        await doc.ref.set({
          subscription_paid_at: now.toISOString(),
          subscription_started_at: now.toISOString(),
          subscription_cycle_started_at: now.toISOString(),
          subscription_valid_until: nextValidUntil.toISOString(),
          subscription_active: true,
          subscription_renewal_attempts: 0,
          subscription_last_renewal_attempt_at: now.toISOString()
        }, { merge: true });

        await createAndSendSubscriptionInvoice({
          userId: doc.id,
          packageId: user.subscription_tier || 'BASIC',
          amountTotal: amountCents / 100,
          sourceId: `stripe_renew_${idempotencyKey}`,
          paymentMethod: 'Spletno plačilo / Kartica',
          periodStart: now,
          periodEnd: nextValidUntil
        }).catch(e => console.error("[renewal-cron] Napaka pri ustvarjanju računa (kartica):", e));
        processed++;
        continue;
      }

      failed++;
      const lastTier = user.subscription_tier || 'BASIC';
      if (attemptNo >= MAX_RENEWAL_ATTEMPTS || failReason === 'no_saved_card') {
        // Deutscher Kommentar: Dritter Fehlversuch (oder keine Karte hinterlegt) = Abo beendet, Rueckfall auf FREE
        await doc.ref.set({
          subscription_tier: 'FREE',
          subscription: 'FREE',
          subscription_active: false,
          subscription_canceled: false,
          subscription_renewal_attempts: 0,
          subscription_last_renewal_attempt_at: now.toISOString(),
          subscription_ended_reason: 'payment_failed'
        }, { merge: true });
        terminated++;
      } else {
        await doc.ref.set({
          subscription_renewal_attempts: attemptNo,
          subscription_last_renewal_attempt_at: now.toISOString()
        }, { merge: true });
      }

      if (resendClient && user.email) {
        const ended = attemptNo >= MAX_RENEWAL_ATTEMPTS || failReason === 'no_saved_card';
        resendClient.emails.send({
          from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
          to: user.email,
          subject: ended ? 'Vaša naročnina je prekinjena - dražbenik.si' : 'Podaljšanje naročnine ni uspelo - dražbenik.si',
          html: ended
            ? `<p>Pozdravljeni,</p><p>podaljšanja naročnine (${lastTier}) nam kljub večkratnim poskusom ni uspelo zaračunati. Naročnina je prekinjena in vaš račun je vrnjen na brezplačni paket. Naročnino lahko kadarkoli ponovno aktivirate v nastavitvah.</p>`
            : `<p>Pozdravljeni,</p><p>podaljšanja naročnine (${lastTier}) nam ni uspelo zaračunati na vašo kartico. Poskusili bomo ponovno (poskus ${attemptNo} od ${MAX_RENEWAL_ATTEMPTS}). Poskrbite, da je kartica veljavna in ima dovolj sredstev.</p>`
        }).catch((e: any) => console.error('[renewal-cron] Napaka pri pošiljanju obvestila:', e?.message));
      }
    }

    res.json({ success: true, processed, failed, terminated });
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

    if (tx.status === 'COMPLETED') {
      return res.json({ success: true, message: 'Naročilo je že zaključeno.' });
    }

    if (tx.payout_status === 'frozen' || tx.payout_status === 'refunded' || tx.status === 'DISPUTED') {
      return res.status(400).json({ error: 'Naročila v trenutnem stanju ni mogoče potrditi.' });
    }

    if (tx.status !== 'SHIPPED' && tx.status !== 'HELD_IN_ESCROW' && tx.status !== 'DELIVERED') {
      return res.status(400).json({ error: 'Naročila v trenutnem stanju ni mogoče potrditi.' });
    }

    await completeTransactionAndPayout(txDoc.ref, txDoc.id, 'buyer_confirmed_receipt');
    
    await adminDb.collection('auctions').doc(auction_id).update({
      buyer_received: true,
      received_at: new Date().toISOString(),
      receipt_confirmed_at: new Date().toISOString(),
      post_auction_status: 'delivered',
      review_enabled: true
    });

    await recordSaleCompletion(auction_id, tx.seller_id);
    
    try {
      const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(tx.seller_id));
      const seller = sellerDoc.data();
      const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(auction_id));
      const auction = auctionDoc.data();

      if (seller?.email && process.env.RESEND_API_KEY) {
        const auctionTitleText = auction?.title?.SLO || auction?.title?.EN || 'Predmet dražbe';
        const baseAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('drazbenik.si')) ? process.env.APP_URL : 'https://drazbe.eu';
        const auctionUrl = `${baseAppUrl}/?drazba=${auction_id}`;
        
        const htmlContent = await render(React.createElement(AuctionEmailTemplate, {
          type: 'item_delivered_seller',
          recipientName: seller.first_name || seller.name || 'prodajalec',
          auctionTitle: auctionTitleText,
          auctionImageUrl: auction?.images?.[0]?.url || auction?.images?.[0],
          currentPrice: tx.item_price,
          auctionUrl,
          settingsUrl: `${baseAppUrl}/?tab=settings`
        }));

        const resendClient = new Resend(process.env.RESEND_API_KEY);
        await resendClient.emails.send({
          from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
          to: seller.email,
          subject: `Prejem potrjen: ${auctionTitleText} - dražbenik.si`,
          html: htmlContent
        });
      }
    } catch (emErr: any) {
      console.error('[confirm-receipt] Error sending email:', emErr.message);
    }

    // Auszahlung sofort ausgelöst
    res.json({ success: true, message: "Prejem potrjen. Izplačilo je sproženo." });
  } catch (err: any) {
    console.error('Error in confirm-receipt:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders/payment-status", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  const { auction_id } = req.query;
  if (!auction_id) return res.status(400).json({ error: "Missing auction_id" });

  try {
    const txSnap = await safeGetDocs(
      adminDb.collection('transactions').where('auction_id', '==', String(auction_id))
    );
    if (txSnap.empty) return res.status(404).json({ error: "Naročilo ni bilo najdeno." });

    const tx = txSnap.docs[0].data();
    if (tx.buyer_id !== userId && tx.seller_id !== userId) {
      return res.status(403).json({ error: "Nimate pravic za ogled teh podatkov." });
    }

    const role = tx.buyer_id === userId ? 'buyer' : 'seller';

    const response = {
      status: tx.status,
      payout_status: tx.payout_status,
      delivery_method: tx.delivery_method,
      paid_at: tx.paid_at || tx.held_since,
      shipping_deadline: tx.shipping_deadline,
      shipped_at: tx.shipped_at,
      delivered_at: tx.delivered_at,
      auto_release_at: tx.auto_release_at,
      paid_out_at: tx.paid_out_at,
      refunded_at: tx.refunded_at,
      item_price: tx.item_price,
      platform_fee: tx.platform_fee,
      vat_amount: tx.vat_amount,
      amount_total: tx.amount_total,
      shipping_type: tx.shipping_type || null,
      carrier_name: tx.carrier_name || null,
      tracking_number: tx.tracking_number || null,
      tracking_url: getTrackingUrl(tx.tracking_number),
      dispute_kind: tx.dispute_kind || null,
      proof_requested_until: tx.proof_requested_until || null,
      seller_proof_at: tx.seller_proof_at || null,
      not_received_allowed_from: tx.shipped_at
        ? new Date(new Date(tx.shipped_at).getTime() + ((tx.buyer_snapshot?.country_code || 'SI') !== 'SI' || (tx.seller_snapshot?.country_code || 'SI') !== 'SI' ? NOT_RECEIVED_MIN_DAYS_CROSS_BORDER : NOT_RECEIVED_MIN_DAYS_DOMESTIC) * 86400000).toISOString()
        : null,
      tx_id: txSnap.docs[0].id,
      role
    };

    res.json(response);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// Helper zum Validieren des Transaktionsstatus
const isTransactionValid = (data: any) => {
  const status = String(data.status || '').toUpperCase();
  const paymentStatus = String(data.payment_status || '').toLowerCase();
  const validStatuses = ['HELD_IN_ESCROW', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'DISPUTED'];
  return validStatuses.includes(status) || paymentStatus === 'paid';
};

// Helper zur Normalisierung der Liefermethode
const normalizeDeliveryMethod = (method: string) => {
  const m = method.toLowerCase();
  return m === 'shipping' ? 'post' : m;
};

// Deutscher Kommentar: Authentifizierter Endpunkt zur Abfrage der Liefermethoden bezahlter Transaktionen (Kaeufer oder Verkaeufer)
app.get("/api/orders/delivery-methods", async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const methods: Record<string, string> = {};

    const buyerSnap = await safeGetDocs(
      adminDb.collection('transactions').where('buyer_id', '==', userId).limit(300)
    );
    (buyerSnap.docs || []).forEach((doc: any) => {
      const data = doc.data();
      if (isTransactionValid(data) && data.auction_id && data.delivery_method) {
        methods[String(data.auction_id)] = normalizeDeliveryMethod(String(data.delivery_method));
      }
    });

    const sellerSnap = await safeGetDocs(
      adminDb.collection('transactions').where('seller_id', '==', userId).limit(300)
    );
    (sellerSnap.docs || []).forEach((doc: any) => {
      const data = doc.data();
      if (isTransactionValid(data) && data.auction_id && data.delivery_method) {
        methods[String(data.auction_id)] = normalizeDeliveryMethod(String(data.delivery_method));
      }
    });

    res.json(methods);
  } catch (e: any) {
    console.error('Error in delivery-methods:', e);
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// BENACHRICHTIGUNGEN (GET & MARK-READ)
// ==========================================

app.get("/api/notifications", async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    // Presence-Aktualisierung (last_seen_at max. alle 45 Sek. schreiben)
    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const lastSeen = userDoc.exists ? userDoc.data()?.last_seen_at : null;
    const lastSeenTime = lastSeen ? (typeof lastSeen === 'number' ? lastSeen : new Date(lastSeen).getTime()) : 0;
    if (!lastSeenTime || (Date.now() - lastSeenTime) > 45000) {
      await userRef.set({ last_seen_at: new Date().toISOString() }, { merge: true });
    }

    // Benachrichtigungen der letzten 60 Tage abrufen
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const snap = await adminDb.collection('notifications')
      .where('user_id', '==', uid)
      .limit(100)
      .get();

    const notifications = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(item => item.created_at >= sixtyDaysAgo)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 30);

    return res.json({ notifications });
  } catch (err: any) {
    console.error('[GET /api/notifications] Error:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Deutscher Kommentar: Hauptsprache des Nutzers speichern (Webseite + Rechnungen)
app.post("/api/user/preferred-language", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }
  try {
    const lang = String((req.body || {}).language || '');
    if (!['SLO', 'EN', 'DE'].includes(lang)) {
      return res.status(400).json({ error: "Neveljaven jezik." });
    }
    await adminDb.collection('users').doc(userId).set({ preferred_language: lang }, { merge: true });
    res.json({ success: true, language: lang });
  } catch (e: any) {
    console.error('Error in /api/user/preferred-language:', e);
    res.status(500).json({ error: e.message || 'Napaka pri shranjevanju jezika.' });
  }
});

app.post("/api/notifications/mark-read", async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { id, all } = req.body || {};

    if (all === true) {
      const snap = await adminDb.collection('notifications')
        .where('user_id', '==', uid)
        .get();

      const batch = adminDb.batch();
      let count = 0;
      snap.docs.forEach(doc => {
        if (doc.data()?.read !== true) {
          batch.update(doc.ref, { read: true });
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
      return res.json({ success: true, marked: count });
    }

    if (id && typeof id === 'string') {
      const docRef = adminDb.collection('notifications').doc(id);
      const docSnap = await docRef.get();
      if (docSnap.exists && docSnap.data()?.user_id === uid) {
        await docRef.update({ read: true });
      }
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Missing id or all flag' });
  } catch (err: any) {
    console.error('[POST /api/notifications/mark-read] Error:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ==========================================
// ODDAJA OCENE PRODAJALCA ZA ZMAGANO DRAŽBO
// ==========================================

app.post("/api/reviews/submit", async (req, res) => {
  let buyerId: string;
  try {
    buyerId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }

  try {
    const { auction_id, rating, comment, would_recommend } = req.body || {};

    if (!auction_id || rating === undefined || rating === null) {
      return res.status(400).json({ error: 'Manjkajoči podatki za oceno.' });
    }

    const numRating = Math.max(1, Math.min(5, Number(rating) || 5));
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';

    // Fetch buyer info for author name
    let authorName = 'Preverjen kupec';
    try {
      const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(buyerId));
      if (buyerDoc.exists()) {
        const bData = buyerDoc.data() || {};
        if (bData.company_name) authorName = bData.company_name;
        else if (bData.first_name) authorName = `${bData.first_name} ${bData.last_name || ''}`.trim();
        else if (bData.username) authorName = bData.username;
        else if (bData.name) authorName = typeof bData.name === 'object' ? (bData.name.SLO || bData.name.EN) : bData.name;
      }
    } catch (e) {}

    // Transaktion der Auktion laden, um den Lieferstatus zu pruefen
    const txSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', auction_id).limit(1));
    const tx = !txSnap.empty ? txSnap.docs[0].data() : null;

    let actualSellerId = '';
    let reviewId = '';
    let reviewedTitle = 'Dražba';
    let reviewedImage: string | null = null;

    await adminDb.runTransaction(async (t) => {
      const aRef = adminDb.collection('auctions').doc(auction_id);
      const aDoc = await t.get(aRef);
      if (!aDoc.exists) {
        throw { status: 404, message: "Dražba ni najdena." };
      }
      const auctionData = aDoc.data() || {};
      actualSellerId = auctionData.seller_id || auctionData.sellerId || auctionData.seller?.id;
      if (!actualSellerId) {
        throw { status: 400, message: "Prodajalec ni določen na dražbi." };
      }

      if (buyerId === actualSellerId) {
        throw { status: 400, message: "Prodajalec ne more oceniti samega sebe." };
      }

      const winnerId = auctionData.winner_id || auctionData.winnerId;
      if (winnerId !== buyerId) {
        throw { status: 403, message: "Za oddajo ocene morate biti zmagovalec te dražbe." };
      }

      const isPaid = auctionData.payment_status === 'paid' || auctionData.post_auction_status === 'paid';
      if (!isPaid) {
        throw { status: 400, message: "Oceno lahko oddate le za plačane dražbe." };
      }

      // Bewertung nur moeglich, wenn der Handel abgeschlossen ist
      const isFinished = auctionData.buyer_received === true || 
                         auctionData.review_enabled === true || 
                         ['DELIVERED', 'COMPLETED'].includes(tx?.status);
      if (!isFinished) {
        throw { status: 400, message: "Oceno lahko oddate šele, ko je predmet predan in prejem potrjen." };
      }

      // Deutscher Kommentar: Eine abgegebene Bewertung ist endgueltig und kann nicht mehr geaendert werden
      if (auctionData.review_submitted || auctionData.review_id) {
        throw { status: 409, message: "Ocena je že oddana in je dokončna. Spreminjanje ni mogoče." };
      }

      const auctionTitle = auctionData.title?.SLO || auctionData.title?.EN || (typeof auctionData.title === 'string' ? auctionData.title : 'Dražba');
      const auctionImage = Array.isArray(auctionData.images) && auctionData.images.length > 0 ? auctionData.images[0] : null;

      reviewedTitle = auctionTitle;
      reviewedImage = auctionImage;
      const reviewRef = adminDb.collection('reviews').doc();
      reviewId = reviewRef.id;

      t.set(reviewRef, {
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
      });

      t.update(aRef, {
        review_submitted: true,
        review_rating: numRating,
        review_comment: trimmedComment,
        review_submitted_at: new Date().toISOString(),
        review_id: reviewId,
      });
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

    // Deutscher Kommentar: Verkaeufer per Benachrichtigung und E-Mail ueber die neue Bewertung informieren
    await (async () => {
      try {
        await createNotification({
          userId: actualSellerId,
          type: 'review_received',
          auctionId: auction_id,
          auctionTitle: reviewedTitle,
          imageUrl: reviewedImage || undefined,
          price: 0,
          message: `Prejeli ste novo oceno: ${numRating}/5${trimmedComment ? ' – "' + trimmedComment.slice(0, 80) + (trimmedComment.length > 80 ? '…' : '') + '"' : ''}`,
          target: 'reviews'
        });
        const sellerSnap = await safeGetDoc(adminDb.collection('users').doc(actualSellerId));
        const sData = sellerSnap.exists() ? (sellerSnap.data() || {}) : {};
        if (sData.email) {
          await sendReviewReceivedNotification({
            toEmail: sData.email,
            recipientName: sData.first_name || sData.company_name || sData.username || 'Prodajalec',
            auctionId: auction_id,
            auctionTitle: reviewedTitle,
            auctionImageUrl: reviewedImage || undefined,
            rating: numRating,
            sellerId: actualSellerId
          });
        }
      } catch (notifyErr: any) {
        console.warn('[reviews/submit] Obvestilo prodajalcu ni uspelo:', notifyErr?.message);
      }
    })();

    res.json({ success: true, review_id: reviewId });
  } catch (err: any) {
    if (err && typeof err === 'object' && err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Error in /api/reviews/submit:', err);
    res.status(500).json({ error: err.message || "Napaka pri oddaji ocene." });
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

// Deutscher Kommentar: Alle Rechnungen des Nutzers (Auktionen + Abonnements) in einer Liste fuer den Bereich "Računi" in den Einstellungen
app.get("/api/invoices/mine", async (req, res) => {
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

    const [auctionDocs, subDocs] = await Promise.all([
      safeGetDocs(adminDb.collection('documents').where('user_id', '==', authUid).where('type', '==', 'invoice')),
      safeGetDocs(adminDb.collection('documents').where('user_id', '==', authUid).where('type', '==', 'subscription_invoice'))
    ]);

    const auctionInvoices = await Promise.all(auctionDocs.docs.map(async (d: any) => {
      const data = d.data() || {};
      let title = '';
      let image = '';
      let amountTotal: number | null = null;
      let itemPrice: number | null = null;
      let platformFee: number | null = null;
      let invoiceNo = data.sales_invoice_no || data.invoice_no || '';
      let sellerName = '';
      let paymentMethod = '';
      try {
        if (data.auction_id) {
          const aDoc = await safeGetDoc(adminDb.collection('auctions').doc(data.auction_id));
          if (aDoc.exists) {
            const a = aDoc.data() || {};
            title = typeof a.title === 'string' ? a.title : (a.title?.sl || a.title?.en || '');
            image = (Array.isArray(a.images) && a.images[0]) || a.image || '';
            sellerName = a.seller_name || a.seller?.name || a.seller?.username || '';
          }
        }
        if (data.transaction_id) {
          const tDoc = await safeGetDoc(adminDb.collection('transactions').doc(data.transaction_id));
          if (tDoc.exists) {
            const t = tDoc.data() || {};
            amountTotal = typeof t.amount_total === 'number' ? t.amount_total : null;
            itemPrice = typeof t.item_price === 'number' ? t.item_price : null;
            platformFee = typeof t.platform_fee === 'number' ? t.platform_fee : null;
            invoiceNo = invoiceNo || t.sales_invoice_no || '';
            paymentMethod = t.payment_method || t.payment_method_type || '';
          }
        }
      } catch (e) {}
      return {
        id: d.id,
        kind: 'auction',
        invoice_no: invoiceNo,
        auction_id: data.auction_id || '',
        auction_title: title,
        auction_image: image,
        seller_name: sellerName,
        amount_total: amountTotal,
        item_price: itemPrice,
        platform_fee: platformFee,
        payment_method: paymentMethod,
        created_at: data.created_at || ''
      };
    }));

    const subscriptionInvoices = subDocs.docs.map((d: any) => {
      const data = d.data() || {};
      return {
        id: d.id,
        kind: 'subscription',
        invoice_no: data.invoice_no || '',
        package_id: data.package_id || '',
        amount_total: typeof data.amount === 'number' ? data.amount : Number(data.amount || 0),
        payment_method: data.payment_method || '',
        created_at: data.created_at || ''
      };
    });

    const invoices = [...auctionInvoices, ...subscriptionInvoices]
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    res.json({ invoices });
  } catch (err: any) {
    console.error("Error fetching user invoices:", err);
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
    const isAdmin = await isAdminUser(authUid);

    let docQuery = adminDb.collection('documents')
      .where('invoice_no', '==', invoiceNo);
    if (!isAdmin) {
      docQuery = docQuery.where('user_id', '==', authUid);
    }
    const docSnap = await safeGetDocs(docQuery.limit(1));

    if (docSnap.empty) {
      return res.status(404).json({ error: "Račun ni bil najden." });
    }

    const docData = docSnap.docs[0].data();
    const invoicePath = docData.invoice_path || docData.file_url;
    if (!invoicePath) {
      return res.status(404).json({ error: "Račun ni shranjen v shrambi." });
    }

    let storagePath = invoicePath;
    if (storagePath.startsWith('http')) {
      try {
        storagePath = decodeURIComponent(storagePath.split('/o/')[1].split('?')[0]);
      } catch (e) {}
    }

    const storage = getAdminStorage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
    const file = storage.bucket(bucketName).file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: "Datoteka računa v shrambi ne obstaja." });
    }

    // Wenn json=1 angefordert wird, signierte URL zurueckgeben (fuer Rueckwaertskompatibilitaet)
    if (req.query.json === '1') {
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 10 * 60 * 1000
      });
      return res.json({ url });
    }

    // PDF-Datei direkt als Download ausliefern (DEL A)
    const [pdfBuffer] = await file.download();
    const isInline = String(req.query.inline) === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="racun_${invoiceNo}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.send(pdfBuffer);
  } catch (err: any) {
    console.error("Error downloading subscription invoice:", err);
    res.status(500).json({ error: err.message });
  }
});

// Neuer Endpunkt fuer den direkten Download/Anzeige der Auktionsrechnung (DEL A)
app.get("/api/invoices/file", async (req, res) => {
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

    const { auction_id, inline } = req.query;
    if (!auction_id || typeof auction_id !== 'string') {
      return res.status(400).json({ error: "Manjka ID dražbe." });
    }

    const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(auction_id));
    if (!auctionDoc.exists) {
      return res.status(404).json({ error: "Dražba ni bila najdena." });
    }
    const auction = auctionDoc.data() || {};

    const isAdmin = await isAdminUser(authUid);

    const sellerId = auction.seller_id || auction.seller?.id || auction.sellerId;
    const winnerId = auction.winner_id || auction.winner?.id || auction.buyer_id || auction.winnerId;

    if (!isAdmin && authUid !== sellerId && authUid !== winnerId) {
      return res.status(403).json({ error: "Nimate pravic za dostop do tega računa." });
    }

    const isPaid = auction.status === 'completed' || auction.post_auction_status === 'awaiting_buyer_receipt' || auction.post_auction_status === 'buyer_received' || auction.payment_status === 'paid' || auction.is_paid;
    if (!isPaid) {
      return res.status(400).json({ error: "Dražba še ni plačana." });
    }

    // Pruefung auf bestehendes Dokument in der Sammlung 'documents'
    const docsSnap = await safeGetDocs(
      adminDb.collection('documents')
        .where('auction_id', '==', auction_id)
        .where('type', '==', 'invoice')
        .limit(1)
    );

    const txSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('auction_id', '==', auction_id)
        .limit(1)
    );
    const txDoc = !txSnap.empty ? txSnap.docs[0] : null;
    const txData = txDoc ? txDoc.data() : null;

    if (txData?.invoice_review_required) {
      return res.status(400).json({ error: "Račun je v pregledu in še ni na voljo." });
    }

    let pdfBuffer: Buffer | null = null;
    let invoiceNo = '';

    if (!docsSnap.empty) {
      const docData = docsSnap.docs[0].data();
      invoiceNo = docData.sales_invoice_no || docData.invoice_no || txData?.sales_invoice_no || '';
      let storagePath = docData.invoice_path || docData.file_url;
      if (storagePath) {
        if (storagePath.startsWith('http')) {
          try {
            storagePath = decodeURIComponent(storagePath.split('/o/')[1].split('?')[0]);
          } catch (e) {}
        }
        const storage = getAdminStorage();
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
        const file = storage.bucket(bucketName).file(storagePath);
        const [exists] = await file.exists();
        if (exists) {
          const [downloaded] = await file.download();
          pdfBuffer = downloaded;
        }
      }
    }

    // Falls PDF noch nicht in Storage vorhanden ist, jetzt on-demand generieren (DEL A)
    if (!pdfBuffer) {
      if (!txDoc || !txData) {
        return res.status(404).json({ error: "Račun še ni na voljo. Poskusite znova čez nekaj minut." });
      }

      let salesInvoiceNo = txData.sales_invoice_no;
      let commissionInvoiceNo = txData.commission_invoice_no;
      const updatedFields: any = {};

      if (!salesInvoiceNo) {
        salesInvoiceNo = await generateInvoiceNumber('SALES');
        updatedFields.sales_invoice_no = salesInvoiceNo;
      }
      if (!commissionInvoiceNo) {
        commissionInvoiceNo = await generateInvoiceNumber('COMMISSION');
        updatedFields.commission_invoice_no = commissionInvoiceNo;
      }

      if (Object.keys(updatedFields).length > 0) {
        await txDoc.ref.update(updatedFields);
      }

      invoiceNo = salesInvoiceNo;

      let buyerSnapshot = txData.buyer_snapshot;
      if (!buyerSnapshot && winnerId) {
        const uSnap = await safeGetDoc(adminDb.collection('users').doc(winnerId));
        if (uSnap.exists) buyerSnapshot = uSnap.data();
      }

      let sellerSnapshot = txData.seller_snapshot;
      if (!sellerSnapshot && sellerId) {
        const sSnap = await safeGetDoc(adminDb.collection('users').doc(sellerId));
        if (sSnap.exists) sellerSnapshot = sSnap.data();
      }

      const transactionRecord = { id: txDoc.id, ...txData, ...updatedFields };
      pdfBuffer = await generateInvoicePDF(transactionRecord, buyerSnapshot, sellerSnapshot, auction, salesInvoiceNo, commissionInvoiceNo);

      const invoiceFileName = `racun_${salesInvoiceNo}.pdf`;
      const invoicePath = await uploadBufferToStorage(pdfBuffer, `${winnerId || 'invoices'}/${invoiceFileName}`);

      await adminDb.collection('documents').add({
        transaction_id: txDoc.id,
        user_id: winnerId,
        auction_id: auction_id,
        type: 'invoice',
        invoice_path: invoicePath,
        sales_invoice_no: salesInvoiceNo,
        commission_invoice_no: commissionInvoiceNo,
        created_at: new Date().toISOString()
      });
    }

    const isInline = String(inline) === '1';
    const cleanInvoiceNo = (invoiceNo || (auction_id as string)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `racun_${cleanInvoiceNo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.send(pdfBuffer);
  } catch (err: any) {
    console.error("Error serving invoice file:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/invoices/download-url", async (req, res) => {
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

    const { auction_id } = req.query;
    if (!auction_id || typeof auction_id !== 'string') {
      return res.status(400).json({ error: "Manjka ID dražbe." });
    }

    const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(auction_id));
    if (!auctionDoc.exists) {
      return res.status(404).json({ error: "Dražba ni bila najdena." });
    }
    const auction = auctionDoc.data() || {};

    const sellerId = auction.seller_id || auction.seller?.id;
    const winnerId = auction.winner_id || auction.winner?.id || auction.buyer_id;

    if (authUid !== sellerId && authUid !== winnerId) {
      return res.status(403).json({ error: "Nimate pravic za dostop do tega računa." });
    }

    const isPaid = auction.status === 'completed' || auction.post_auction_status === 'awaiting_buyer_receipt' || auction.post_auction_status === 'buyer_received' || auction.is_paid;
    if (!isPaid) {
      return res.status(400).json({ error: "Dražba še ni plačana." });
    }

    const docsSnap = await safeGetDocs(
      adminDb.collection('documents')
        .where('auction_id', '==', auction_id)
        .where('type', '==', 'invoice')
        .limit(1)
    );

    let invoicePath: string | null = null;
    if (!docsSnap.empty) {
      const docData = docsSnap.docs[0].data();
      invoicePath = docData.invoice_path || docData.file_url;
    } else {
      const txSnap = await safeGetDocs(
        adminDb.collection('transactions')
          .where('auction_id', '==', auction_id)
          .limit(1)
      );
      if (!txSnap.empty) {
        const txId = txSnap.docs[0].id;
        const txDocsSnap = await safeGetDocs(
          adminDb.collection('documents')
            .where('transaction_id', '==', txId)
            .where('type', '==', 'invoice')
            .limit(1)
        );
        if (!txDocsSnap.empty) {
          invoicePath = txDocsSnap.docs[0].data().invoice_path || txDocsSnap.docs[0].data().file_url;
        }
      }
    }

    if (!invoicePath) {
      return res.status(404).json({ error: "Račun za to dražbo ni na voljo." });
    }

    let storagePath = invoicePath;
    if (storagePath.startsWith('http')) {
      try {
        storagePath = decodeURIComponent(storagePath.split('/o/')[1].split('?')[0]);
      } catch (e) {}
    }

    const storage = getAdminStorage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
    const file = storage.bucket(bucketName).file(storagePath);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    return res.json({ url });
  } catch (err: any) {
    console.error("Error generating invoice download URL:", err);
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

    // Preveri odprte obveznosti uporabnika (kot kupec ali prodajalec)
    let hasObligations = false;
    try {
      const sellerTx = await adminDb.collection('transactions')
        .where('seller_id', '==', authUid)
        .get();
      const buyerTx = await adminDb.collection('transactions')
        .where('buyer_id', '==', authUid)
        .get();

      const allTxDocs = [...sellerTx.docs, ...buyerTx.docs];
      const blockStatuses = ['HELD_IN_ESCROW', 'SHIPPED', 'DELIVERED', 'DISPUTED'];
      const blockPayoutStatuses = ['held', 'frozen', 'release_waiting_funds', 'release_failed', 'releasable', 'payout_pending'];

      for (const txDoc of allTxDocs) {
        const tx = txDoc.data() || {};
        const status = (tx.status || '').toUpperCase();
        const payoutStatus = (tx.payout_status || '').toLowerCase();

        if (blockStatuses.includes(status)) {
          hasObligations = true;
          break;
        }
        if (blockPayoutStatuses.includes(payoutStatus)) {
          hasObligations = true;
          break;
        }
      }

      if (!hasObligations) {
        const wonAuctions = await adminDb.collection('auctions')
          .where('winner_id', '==', authUid)
          .get();
        const wonAuctionsCamel = await adminDb.collection('auctions')
          .where('winnerId', '==', authUid)
          .get();
        const allWonAuctions = [...wonAuctions.docs, ...wonAuctionsCamel.docs];

        for (const aDoc of allWonAuctions) {
          const aData = aDoc.data() || {};
          if (aData.status !== 'cancelled' && aData.payment_status !== 'paid' && aData.post_auction_status !== 'paid' && aData.unpaid_strike_applied !== true) {
            hasObligations = true;
            break;
          }
        }
      }
    } catch (obligationErr: any) {
      console.error("Napaka pri preverjanju odprtih obveznosti:", obligationErr);
      return res.status(500).json({ error: "Preverjanje obveznosti ni uspelo. Poskusite znova." });
    }

    if (hasObligations) {
      return res.status(409).json({ 
        error: "OBLIGATIONS_PENDING",
        message: "Računa ni mogoče izbrisati, dokler imate odprta naročila, spore ali neplačane dražbe." 
      });
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
    try {
      const userSnap = await adminDb.collection('users').doc(authUid).get();
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        const isBlocked = userData.isBlocked === true || userData.is_blocked === true;
        if (!isBlocked) {
          const taxId = userData.tax_id || userData.tax_number || userData.taxNumber || userData.taxId;
          const country = userData.country || userData.country_code || userData.countryCode || 'SI';
          if (taxId) {
            await releaseIdentityLock(authUid, taxId, country);
          }
        }
      }
    } catch (releaseErr) {
      console.error("Fehler beim Freigeben des Identity Locks bei der Kontoloeschung:", releaseErr);
    }

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

    await syncPublicProfile(authUid);

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

// Offer second chance to the 2nd highest bidder
// Deutscher Kommentar: Verkaeufer meldet eine Bewertung per E-Mail an den Support
app.post("/api/reviews/dispute", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }
  try {
    const { review_id, reason } = req.body || {};
    const cleanReason = String(reason || '').trim().slice(0, 2000);
    if (!review_id || cleanReason.length < 10) {
      return res.status(400).json({ error: "Navedite razlog prijave (vsaj 10 znakov)." });
    }
    const rRef = adminDb.collection('reviews').doc(String(review_id));
    const rSnap = await safeGetDoc(rRef);
    if (!rSnap.exists()) return res.status(404).json({ error: "Ocena ne obstaja." });
    const r = rSnap.data() || {};
    if ((r.seller_id || r.sellerId) !== userId) {
      return res.status(403).json({ error: "Prijavite lahko le ocene, ki ste jih prejeli kot prodajalec." });
    }
    if (r.dispute_status === 'submitted') {
      return res.status(409).json({ error: "Ta ocena je že prijavljena." });
    }
    const seller = await getUserContact(userId);
    await adminDb.collection('review_disputes').add({
      review_id: String(review_id),
      auction_id: r.auction_id || r.auctionId || '',
      seller_id: userId,
      reason: cleanReason,
      rating: r.rating,
      comment: r.comment || '',
      created_at: new Date().toISOString(),
      status: 'submitted'
    });
    await rRef.update({ dispute_status: 'submitted', dispute_at: new Date().toISOString() });
    if (resendClient) {
      const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
      await resendClient.emails.send({
        from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
        to: 'info@drazbenik.si',
        replyTo: seller.email || undefined,
        subject: `Prijava ocene (${esc(review_id)})`,
        html: `<p><b>Prodajalec:</b> ${esc(seller.name)} (${esc(userId)}) ${esc(seller.email)}</p><p><b>Ocena:</b> ${esc(r.rating)}/5 – ${esc(r.comment)}</p><p><b>Dražba:</b> ${esc(r.auction_id || r.auctionId)}</p><p><b>Razlog prijave:</b><br/>${esc(cleanReason)}</p>`
      });
    }
    res.json({ success: true });
  } catch (e: any) {
    console.error('Error in /api/reviews/dispute:', e);
    res.status(500).json({ error: e.message || 'Napaka pri prijavi ocene.' });
  }
});

// Deutscher Kommentar: Frist fuer 2. Bieter - Annahme und danach Zahlung je 24 Stunden
const SECOND_CHANCE_HOURS = 24;

// Deutscher Kommentar: Hilfsfunktionen fuer Zweitchancen-Benachrichtigungen
async function getUserContact(uid: string): Promise<{ email?: string; name: string }> {
  try {
    const snap = await safeGetDoc(adminDb.collection('users').doc(uid));
    const d = snap.exists() ? (snap.data() || {}) : {};
    return { email: d.email, name: d.first_name || d.company_name || d.username || 'Uporabnik' };
  } catch {
    return { name: 'Uporabnik' };
  }
}

function getAuctionBrief(a: any): { title: string; image?: string } {
  const title = a?.title?.SLO || a?.title?.EN || (typeof a?.title === 'string' ? a.title : 'Dražba');
  const image = Array.isArray(a?.images) && a.images.length > 0 ? a.images[0] : undefined;
  return { title, image };
}

// Deutscher Kommentar: Verkaeufer sieht vor dem Angebot den Preis des 2. Bieters (nur lesend)
app.get("/api/auctions/second-bidder-info", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }
  try {
    const auction_id = String(req.query.auction_id || '');
    if (!auction_id) return res.status(400).json({ error: "Manjka ID dražbe." });
    const aSnap = await safeGetDoc(adminDb.collection('auctions').doc(auction_id));
    if (!aSnap.exists()) return res.status(404).json({ error: "Dražba ne obstaja." });
    const a = aSnap.data() || {};
    if ((a.seller_id || a.sellerId) !== userId) return res.status(403).json({ error: "Niste prodajalec te dražbe." });
    let topBids: any[] = [];
    const priv = await safeGetDoc(adminDb.collection('auctions_private').doc(auction_id));
    if (priv.exists()) topBids = (priv.data() || {}).top_bids || [];
    if (topBids.length < 2 && Array.isArray(a.top_bids)) topBids = a.top_bids;
    if (topBids.length < 2) return res.json({ available: false });
    const amount = Number(topBids[1].amount || topBids[1].bid || 0);
    res.json({ available: amount > 0, amount, first_amount: Number(topBids[0].amount || topBids[0].bid || 0) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Napaka.' });
  }
});

app.post("/api/auctions/offer-second-chance", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }

  try {
    const { auction_id } = req.body || {};
    if (!auction_id) {
      return res.status(400).json({ error: "Manjka ID dražbe." });
    }

    const userDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    const userData = userDoc.data() || {};
    if (userData.isBlocked) {
      return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
    }
    try {
      await assertVerifiedUser(userId, userData);
    } catch (verErr: any) {
      return res.status(403).json({ error: verErr.message, code: verErr.code });
    }

    if (userData.stripe_onboarding_complete !== true) {
      return res.status(403).json({ error: 'Za objavo dražbe morate najprej urediti izplačila.', code: 'PAYOUTS_NOT_READY' });
    }

    if (auction_id) {
      await finalizeAuction(auction_id);
    }

    const auctionRef = adminDb.collection('auctions').doc(auction_id);
    const auctionDoc = await safeGetDoc(auctionRef);
    if (!auctionDoc.exists()) {
      return res.status(404).json({ error: "Dražba ne obstaja." });
    }

    const auction = auctionDoc.data() || {};
    const sellerId = auction.seller_id || auction.sellerId;
    if (sellerId !== userId) {
      return res.status(403).json({ error: "Nimate pravic za to dejanje. Niste prodajalec te dražbe." });
    }

    const rawEndTime = auction.end_time || auction.endTime;
    const isEnded = (rawEndTime && new Date(rawEndTime).getTime() <= Date.now()) || auction.status === 'ended' || auction.status === 'completed';
    if (!isEnded) {
      return res.status(400).json({ error: "Dražba se še ni zaključila." });
    }

    if (auction.payment_status === 'paid' || auction.post_auction_status === 'paid') {
      return res.status(400).json({ error: "Ta dražba je že plačana." });
    }

    const pas = auction.post_auction_status;
    const paymentDeadlineMs = auction.payment_deadline ? new Date(auction.payment_deadline).getTime() : 0;
    const isPaymentDeadlinePast = paymentDeadlineMs > 0 && paymentDeadlineMs <= Date.now();

    const isAllowedStatus = 
      pas === 'failed_1st' || 
      pas === 'unsold' || 
      ((pas === 'awaiting_payment_1st' || pas === 'pending_payment' || pas === 'awaiting_payment' || !pas) && isPaymentDeadlinePast);

    if (!isAllowedStatus) {
      return res.status(400).json({ error: "Prvi zmagovalec ima še čas za plačilo." });
    }

    // Read top bids from auctions_private first, then fallback to auction document
    let topBids: any[] = [];
    try {
      const privDoc = await safeGetDoc(adminDb.collection('auctions_private').doc(auction_id));
      if (privDoc.exists()) {
        const privData = privDoc.data() || {};
        topBids = privData.top_bids || [];
      }
    } catch (privErr) {
      console.warn(`[OFFER 2ND CHANCE] Could not load auctions_private for ${auction_id}:`, privErr);
    }

    if (topBids.length < 2 && Array.isArray(auction.top_bids)) {
      topBids = auction.top_bids;
    }

    if (!topBids || topBids.length < 2) {
      return res.status(400).json({ error: "Ni 2. najvišjega ponudnika za to dražbo." });
    }

    const secondBid = topBids[1];
    const secondWinnerId = secondBid.user_id || secondBid.userId;
    const secondAmount = Number(secondBid.amount || secondBid.bid || 0);

    if (!secondWinnerId || secondAmount <= 0) {
      return res.status(400).json({ error: "Podatki o 2. ponudniku niso veljavni." });
    }

    // Deutscher Kommentar: Hat der Cron die Verwarnung des 1. Gewinners noch nicht vergeben (Frist abgelaufen, nicht bezahlt), wird sie hier nachgeholt
    const firstWinnerId = auction.winner_id || auction.winnerId;
    if (firstWinnerId && !auction.unpaid_strike_applied && pas !== 'unsold' && auction.payment_status !== 'paid') {
      try {
        const fwRef = adminDb.collection('users').doc(firstWinnerId);
        let reachedThree = false;
        await adminDb.runTransaction(async (t) => {
          const aSnap = await t.get(auctionRef);
          if ((aSnap.data() || {}).unpaid_strike_applied === true) return;
          const uSnap = await t.get(fwRef);
          const uData: any = uSnap.exists ? (uSnap.data() || {}) : {};
          const cur = Number(uData.unpaidStrikes ?? uData.unpaid_penalties ?? uData.unpaidPenalties ?? 0);
          const upd: any = { unpaidStrikes: FieldValue.increment(1), unpaid_penalties: FieldValue.increment(1) };
          if (cur + 1 >= 3) { upd.isBlocked = true; reachedThree = true; }
          t.update(fwRef, upd);
          t.update(auctionRef, { unpaid_strike_applied: true });
        });
        if (reachedThree) { try { await markIdentityBlocked(firstWinnerId); } catch {} }
        await syncPublicProfile(firstWinnerId);
      } catch (strikeErr: any) {
        console.warn('[OFFER 2ND CHANCE] Strike for first winner failed:', strikeErr?.message);
      }
    }

    const now = new Date();
    const deadline = new Date(now.getTime() + SECOND_CHANCE_HOURS * 60 * 60 * 1000).toISOString();

    await auctionRef.update({
      post_auction_status: 'offered_2nd',
      second_winner_id: secondWinnerId,
      second_highest_bidder_id: secondWinnerId,
      second_chance_deadline: deadline,
      second_offered_by_seller: true,
      second_offered_at: now.toISOString(),
      current_price: secondAmount,
      currentBid: secondAmount
    });

    // Deutscher Kommentar: 2. Bieter per Website-Benachrichtigung und E-Mail informieren
    try {
      const brief = getAuctionBrief(auction);
      await createNotification({
        userId: secondWinnerId,
        type: 'second_chance_offer',
        auctionId: auction_id,
        auctionTitle: brief.title,
        imageUrl: brief.image,
        price: secondAmount,
        message: `Prodajalec vam ponuja predmet po vaši ponudbi ${secondAmount.toFixed(2).replace('.', ',')} €. Ponudbo sprejmite ali zavrnite v 24 urah.`,
        target: 'winnings'
      });
      const c = await getUserContact(secondWinnerId);
      if (c.email) {
        await sendSecondChanceOfferNotification({
          toEmail: c.email,
          recipientName: c.name,
          auctionId: auction_id,
          auctionTitle: brief.title,
          auctionImageUrl: brief.image,
          price: secondAmount,
          paymentDeadlineFormatted: new Date(deadline).toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' })
        });
      }
    } catch (notifyErr: any) {
      console.warn('[OFFER 2ND CHANCE] Obvestilo ni uspelo:', notifyErr?.message);
    }

    res.json({
      success: true,
      message: "Dražba je bila uspešno ponujena 2. najvišjemu ponudniku.",
      second_winner_id: secondWinnerId,
      second_chance_deadline: deadline,
      price: secondAmount
    });
  } catch (error: any) {
    console.error("[OFFER 2ND CHANCE ERROR]", error);
    res.status(500).json({ error: error.message || "Napaka pri ponujanju druge možnosti." });
  }
});

// Republish an unsold, expired or canceled auction
app.post("/api/auctions/republish", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }

  try {
    const { auction_id } = req.body || {};
    if (!auction_id) {
      return res.status(400).json({ error: "Manjka ID dražbe." });
    }

    const userDoc = await safeGetDoc(adminDb.collection('users').doc(userId));
    const userData = userDoc.data() || {};
    if (userData.isBlocked) {
      return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
    }
    try {
      await assertVerifiedUser(userId, userData);
    } catch (verErr: any) {
      return res.status(403).json({ error: verErr.message, code: verErr.code });
    }

    if (userData.stripe_onboarding_complete !== true) {
      return res.status(403).json({ error: 'Za objavo dražbe morate najprej urediti izplačila.', code: 'PAYOUTS_NOT_READY' });
    }

    if (auction_id) {
      await finalizeAuction(auction_id);
    }

    const auctionRef = adminDb.collection('auctions').doc(auction_id);
    const auctionDoc = await safeGetDoc(auctionRef);
    if (!auctionDoc.exists()) {
      return res.status(404).json({ error: "Dražba ne obstaja." });
    }

    const auction = auctionDoc.data() || {};
    const sellerId = auction.seller_id || auction.sellerId;
    if (sellerId !== userId) {
      return res.status(403).json({ error: "Nimate pravic za to dejanje. Niste prodajalec te dražbe." });
    }

    const rawEndTime = auction.end_time || auction.endTime;
    const isEnded = (rawEndTime && new Date(rawEndTime).getTime() <= Date.now()) || auction.status !== 'active';
    if (!isEnded && auction.status === 'active') {
      return res.status(400).json({ error: "Dražba je trenutno še aktivna in je ni mogoče ponovno objaviti." });
    }

    if (auction.payment_status === 'paid' || auction.post_auction_status === 'paid') {
      return res.status(400).json({ error: "Plačane dražbe ni mogoče ponovno objaviti." });
    }

    const pas = auction.post_auction_status;
    const nowMs = Date.now();

    if (pas === 'awaiting_payment_1st' || pas === 'pending_payment' || pas === 'awaiting_payment' || pas === 'awaiting_payment_2nd') {
      const pDeadlineMs = auction.payment_deadline ? new Date(auction.payment_deadline).getTime() : 0;
      if (pDeadlineMs > nowMs) {
        return res.status(400).json({ error: "Dražbe ni mogoče ponovno objaviti, dokler teče rok za plačilo." });
      }
    }

    if (pas === 'offered_2nd') {
      const scDeadlineMs = auction.second_chance_deadline ? new Date(auction.second_chance_deadline).getTime() : 0;
      if (scDeadlineMs > nowMs) {
        return res.status(400).json({ error: "Dražbe ni mogoče ponovno objaviti, dokler teče rok za sprejem druge možnosti." });
      }
    }

    const originalCreated = new Date(auction.created_at || auction.createdAt || Date.now() - 7 * 24 * 60 * 60 * 1000).getTime();
    const originalEnd = new Date(auction.end_time || auction.endTime || Date.now()).getTime();
    let durationMs = originalEnd - originalCreated;
    if (isNaN(durationMs) || durationMs <= 60 * 1000) {
      durationMs = 7 * 24 * 60 * 60 * 1000;
    }
    const now = new Date();
    const newEndTime = new Date(now.getTime() + durationMs);
    const initialPrice = Number(auction.starting_price ?? auction.startingPrice ?? auction.start_price ?? auction.current_price ?? auction.currentBid ?? 1);

    // 1. Update public auction document with fresh state
    await auctionRef.update({
      status: 'active',
      created_at: now.toISOString(),
      createdAt: now.toISOString(),
      end_time: newEndTime.toISOString(),
      endTime: newEndTime.toISOString(),
      current_price: initialPrice,
      currentBid: initialPrice,
      starting_price: initialPrice,
      startingPrice: initialPrice,
      bid_count: 0,
      bidCount: 0,
      has_second_bidder: false,
      winner_id: null,
      winnerId: null,
      payment_status: 'unpaid',
      post_auction_status: null,
      delivery_method: null,
      selected_delivery: null,
      paid_at: null,
      invoice_url: null,
      second_winner_id: null,
      second_highest_bidder_id: null,
      second_chance_deadline: null,
      reminder_30m_sent: false,
      reminder_end_sent: false,
      bidding_history: FieldValue.delete(),
      biddingHistory: FieldValue.delete(),
      top_bids: FieldValue.delete(),
      current_proxy_bid: FieldValue.delete(),
      currentProxyBid: FieldValue.delete(),
      hidden_max_bid: FieldValue.delete(),
      hiddenMaxBid: FieldValue.delete()
    });

    // 2. Delete private auction secret data document
    try {
      await adminDb.collection('auctions_private').doc(auction_id).delete();
    } catch (delPrivErr: any) {
      console.warn(`[REPUBLISH] Could not delete auctions_private/${auction_id}:`, delPrivErr.message);
    }

    // 3. Delete all documents in public bids subcollection
    try {
      const bidsRef = adminDb.collection('auctions').doc(auction_id).collection('bids');
      if (typeof (adminDb as any).recursiveDelete === 'function') {
        await (adminDb as any).recursiveDelete(bidsRef);
      } else {
        const snap = await bidsRef.get();
        if (!snap.empty) {
          const batch = adminDb.batch();
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
    } catch (delBidsErr: any) {
      console.warn(`[REPUBLISH] Could not delete bids subcollection for ${auction_id}:`, delBidsErr.message);
    }

    res.json({
      success: true,
      message: "Dražba je bila uspešno ponovno objavljena.",
      end_time: newEndTime.toISOString()
    });
  } catch (error: any) {
    console.error("[REPUBLISH ERROR]", error);
    res.status(500).json({ error: error.message || "Napaka pri ponovni objavi dražbe." });
  }
});

// 1. Delete unsold auctions
app.post("/api/auctions/delete-unsold", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }

  try {
    const { auction_ids } = req.body || {};
    if (!Array.isArray(auction_ids) || auction_ids.length === 0 || auction_ids.length > 30) {
      return res.status(400).json({ error: "Neveljavno število dražb za izbris (največ 30)." });
    }

    const nowMs = Date.now();
    const disallowedPending = ['awaiting_payment_1st', 'offered_2nd', 'awaiting_payment_2nd'];

    // Validate ALL auctions first
    for (const id of auction_ids) {
      if (typeof id !== 'string' || !id) {
        return res.status(400).json({ error: "Neveljaven ID dražbe." });
      }

      const docRef = adminDb.collection('auctions').doc(id);
      const snap = await safeGetDoc(docRef);
      if (!snap.exists()) {
        return res.status(404).json({ error: `Dražba ${id} ne obstaja.` });
      }

      const data = snap.data() || {};
      const sellerId = data.seller_id || data.sellerId;
      if (sellerId !== userId) {
        return res.status(403).json({ error: `Nimate pravic za izbris dražbe ${id}. Niste prodajalec.` });
      }

      const rawEndTime = data.end_time || data.endTime;
      const isEnded = (rawEndTime && new Date(rawEndTime).getTime() <= nowMs) || data.status !== 'active';
      if (!isEnded) {
        return res.status(400).json({ error: `Aktivne dražbe (${id}) ni mogoče izbrisati.` });
      }

      if (data.payment_status === 'paid' || data.post_auction_status === 'paid') {
        return res.status(400).json({ error: `Plačane dražbe (${id}) ni mogoče izbrisati.` });
      }

      if (disallowedPending.includes(data.post_auction_status)) {
        return res.status(400).json({ error: `Dražbe (${id}) s tekočim postopkom po koncu dražbe ni mogoče izbrisati.` });
      }

      const txSnap = await adminDb.collection('transactions').where('auction_id', '==', id).limit(1).get();
      if (!txSnap.empty) {
        return res.status(400).json({ error: `Dražbe (${id}) z obstoječimi transakcijami ni mogoče izbrisati.` });
      }
    }

    // Perform deletions after validating all
    for (const id of auction_ids) {
      await adminDb.collection('auctions').doc(id).delete();
      await adminDb.collection('auctions_private').doc(id).delete();
      try {
        const bidsRef = adminDb.collection('auctions').doc(id).collection('bids');
        if (typeof (adminDb as any).recursiveDelete === 'function') {
          await (adminDb as any).recursiveDelete(bidsRef);
        } else {
          const snap = await bidsRef.get();
          if (!snap.empty) {
            const batch = adminDb.batch();
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }
      } catch (bErr) {
        console.warn(`[DELETE UNSOLD] Failed deleting bids subcollection for ${id}:`, bErr);
      }
    }

    res.json({ success: true, message: "Dražbe so bile uspešno izbrisane." });
  } catch (error: any) {
    console.error("[DELETE UNSOLD ERROR]", error);
    res.status(500).json({ error: error.message || "Napaka pri izbrisu dražb." });
  }
});

// 2. Set delivery method
app.post("/api/auctions/set-delivery-method", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }

  try {
    const { auction_id, delivery_method } = req.body || {};
    if (!auction_id || !delivery_method) {
      return res.status(400).json({ error: "Manjka ID dražbe ali način predaje." });
    }

    const validMethods = ['pickup', 'post', 'shipping'];
    if (!validMethods.includes(delivery_method)) {
      return res.status(400).json({ error: "Neveljaven način predaje." });
    }

    const docRef = adminDb.collection('auctions').doc(auction_id);
    const snap = await safeGetDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ error: "Dražba ne obstaja." });
    }

    const data = snap.data() || {};
    const sellerId = data.seller_id || data.sellerId;
    const winnerId = data.winner_id || data.winnerId;
    const secondWinnerId = data.second_winner_id || data.secondWinnerId;

    const isPaid = data.payment_status === 'paid' || data.post_auction_status === 'paid';
    if (!isPaid) {
      return res.status(400).json({ error: "Način predaje je mogoče nastaviti le za plačane dražbe." });
    }

    const isSeller = (sellerId === userId);
    const isWinner = (winnerId === userId || secondWinnerId === userId);
    const currentMethod = data.delivery_method || data.selected_delivery;

    // Deutscher Kommentar: Der Verkaeufer darf immer aendern; der Kaeufer darf nur setzen, solange die Methode noch nicht gewaehlt ist
    if (!isSeller && (!isWinner || currentMethod)) {
      return res.status(403).json({ error: "Nimate pravic za nastavitev načina predaje." });
    }

    const normalizedMethod = delivery_method === 'shipping' ? 'post' : delivery_method;

    await docRef.update({
      delivery_method: normalizedMethod,
      selected_delivery: normalizedMethod,
    });

    // Deutscher Kommentar: Transaktionsdatensatz synchronisieren und bei Abholung den Abhol-PIN erstellen
    try {
      const qTx = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', auction_id).limit(1));
      if (!qTx.empty) {
        const txDoc = qTx.docs[0];
        const updateTx: any = { delivery_method: normalizedMethod };
        if (normalizedMethod === 'pickup') {
          updateTx.auto_release_at = new Date(Date.now() + PICKUP_AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000).toISOString();
          await getOrCreatePickupPin(txDoc.id);
        } else if (normalizedMethod === 'post') {
          updateTx.shipping_deadline = new Date(Date.now() + SHIP_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        }
        await txDoc.ref.update(updateTx);
      }
    } catch (txErr: any) {
      console.error('[SET DELIVERY METHOD] Error updating transaction:', txErr?.message);
    }

    res.json({ success: true, message: "Način predaje uspešno nastavljen." });
  } catch (error: any) {
    console.error("[SET DELIVERY METHOD ERROR]", error);
    res.status(500).json({ error: error.message || "Napaka pri nastavljanju načina predaje." });
  }
});

// 3. Second chance respond (accept or reject)
app.post("/api/auctions/second-chance-respond", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }

  try {
    const { auction_id, action } = req.body || {};
    if (!auction_id || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: "Neveljavno dejanje ali manjka ID dražbe." });
    }

    let resultMsg = '';
    let respondedAuction: any = null;

    await adminDb.runTransaction(async (t) => {
      const docRef = adminDb.collection('auctions').doc(auction_id);
      const snap = await t.get(docRef);
      if (!snap.exists) {
        throw { status: 404, message: "Dražba ne obstaja." };
      }

      const data = snap.data() || {};
      const secondWinner = data.second_winner_id || data.second_highest_bidder_id;
      if (secondWinner !== userId) {
        throw { status: 403, message: "Nimate pravic za odziv na to ponudbo." };
      }

      if (data.post_auction_status !== 'offered_2nd') {
        throw { status: 400, message: "Dražba nima aktivne ponudbe druge možnosti." };
      }

      const deadlineStr = data.second_chance_deadline;
      if (!deadlineStr || new Date(deadlineStr).getTime() <= Date.now()) {
        throw { status: 400, message: "Rok za sprejem druge možnosti je potekel." };
      }

      respondedAuction = data;
      if (action === 'accept') {
        const paymentDeadline = new Date(Date.now() + SECOND_CHANCE_HOURS * 60 * 60 * 1000).toISOString();
        t.update(docRef, {
          post_auction_status: 'awaiting_payment_2nd',
          payment_deadline: paymentDeadline,
          winner_id: userId,
          winnerId: userId,
        });
        resultMsg = "Sprejeli ste ponudbo za drugo možnost. Imate 24 ur za plačilo.";
      } else {
        t.update(docRef, {
          post_auction_status: 'rejected_2nd',
        });
        resultMsg = "Zavrnili ste ponudbo druge možnosti.";
      }
    });

    // Deutscher Kommentar: Verkaeufer ueber Annahme/Ablehnung informieren
    try {
      if (respondedAuction) {
        const brief = getAuctionBrief(respondedAuction);
        const sId = respondedAuction.seller_id || respondedAuction.sellerId;
        const accepted = action === 'accept';
        await createNotification({
          userId: sId,
          type: accepted ? 'second_chance_accepted' : 'second_chance_failed',
          auctionId: auction_id,
          auctionTitle: brief.title,
          imageUrl: brief.image,
          price: Number(respondedAuction.current_price || 0),
          message: accepted
            ? 'Drugi ponudnik je sprejel vašo ponudbo in ima 24 ur za plačilo.'
            : 'Drugi ponudnik je ponudbo zavrnil. Dražba čaka med neprodanimi na vašo odločitev.',
          target: accepted ? 'sold' : 'unsold'
        });
        if (!accepted) {
          const c = await getUserContact(sId);
          if (c.email) {
            await sendSecondChanceFailedSellerNotification({
              toEmail: c.email, recipientName: c.name, auctionId: auction_id,
              auctionTitle: brief.title, auctionImageUrl: brief.image,
              price: Number(respondedAuction.current_price || 0)
            });
          }
        }
      }
    } catch (notifyErr: any) {
      console.warn('[SECOND CHANCE RESPOND] Obvestilo ni uspelo:', notifyErr?.message);
    }

    res.json({ success: true, message: resultMsg });
  } catch (error: any) {
    if (error && typeof error === 'object' && error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("[SECOND CHANCE RESPOND ERROR]", error);
    res.status(500).json({ error: error.message || "Napaka pri obdelavi odziva." });
  }
});

// 4. Archive ended unsold/unpaid auction
app.post("/api/auctions/archive", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Niste prijavljeni.' });
  }

  try {
    const { auction_id } = req.body || {};
    if (!auction_id) {
      return res.status(400).json({ error: "Manjka ID dražbe." });
    }

    const docRef = adminDb.collection('auctions').doc(auction_id);
    const snap = await safeGetDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ error: "Dražba ne obstaja." });
    }

    const data = snap.data() || {};
    const sellerId = data.seller_id || data.sellerId;
    if (sellerId !== userId) {
      return res.status(403).json({ error: "Nimate pravic za arhiviranje te dražbe. Niste prodajalec." });
    }

    const rawEndTime = data.end_time || data.endTime;
    const isEnded = (rawEndTime && new Date(rawEndTime).getTime() <= Date.now()) || data.status !== 'active';
    if (!isEnded) {
      return res.status(400).json({ error: "Dražba se še ni zaključila." });
    }

    if (data.payment_status === 'paid' || data.post_auction_status === 'paid') {
      return res.status(400).json({ error: "Plačane dražbe ni mogoče arhivirati." });
    }

    await docRef.update({
      post_auction_status: 'archived',
    });

    res.json({ success: true, message: "Dražba premaknjena v arhiv." });
  } catch (error: any) {
    console.error("[ARCHIVE AUCTION ERROR]", error);
    res.status(500).json({ error: error.message || "Napaka pri arhiviranju dražbe." });
  }
});

// Deutscher Kommentar: API zur Abfrage, ob der aktuelle Benutzer bereits eine Bankueberweisung fuer eine Liste von Auktionen verwendet hat
app.get("/api/user/bank-transfer-states", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { ids } = req.query;
    if (!ids || typeof ids !== 'string') {
      return res.json({});
    }

    const auctionIds = ids.split(',').filter(Boolean);
    if (auctionIds.length === 0) {
      return res.json({});
    }

    const results: Record<string, boolean> = {};
    const promises = auctionIds.map(async (id) => {
      const privSnap = await adminDb.collection('auctions_private').doc(id).get();
      if (privSnap.exists) {
        const data = privSnap.data() || {};
        results[id] = (data.bank_transfer_used_by || []).includes(userId);
      } else {
        results[id] = false;
      }
    });

    await Promise.all(promises);
    res.json(results);
  } catch (error: any) {
    console.error('Error fetching bank transfer states:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// USER PROFILE & SUBSCRIPTION SERVER ROUTES
// ==========================================

// 1. POST /api/profile/init (idempotent profile initialization)
app.post("/api/profile/init", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email || '';
    const emailVerified = Boolean(decodedToken.email_verified);
    const authProvider = decodedToken.firebase?.sign_in_provider || 'password';

    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      const { accepted_terms, terms_version } = req.body || {};
      if (accepted_terms !== true || terms_version !== TERMS_VERSION) {
        return res.status(400).json({ error: "Za registracijo morate sprejeti pogoje uporabe." });
      }

      const now = new Date().toISOString();
      await userRef.set({
        id: uid,
        email,
        created_at: now,
        subscription: 'FREE',
        subscription_tier: 'FREE',
        profile_completed: false,
        identity_verified: false,
        email_verified: emailVerified,
        auth_provider: authProvider,
        terms_version: TERMS_VERSION,
        terms_accepted_at: now
      });

      await recordTermsAcceptance({ uid, context: 'registration', req });
    } else {
      const updates: any = {};
      if (emailVerified) {
        updates.email_verified = true;
      }
      const existingData = userSnap.data() || {};
      if (!existingData.auth_provider) {
        updates.auth_provider = authProvider;
      }
      if (Object.keys(updates).length > 0) {
        await userRef.update(updates);
      }
    }

    await syncPublicProfile(uid);
    return res.json({ success: true, message: 'Profil inicializiran.' });
  } catch (err: any) {
    console.error('Error in /api/profile/init:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/profile/update (safe user profile update)
app.post("/api/profile/update", async (req, res) => {
  try {
    let uid: string;
    try {
      uid = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const body = req.body || {};

    const currentUserDoc = await adminDb.collection('users').doc(uid).get();
    const currentData = currentUserDoc.data() || {};

    const cleanStr = (val: any, maxLen = 200) => {
      if (typeof val !== 'string') return '';
      const trimmed = val.trim();
      return trimmed.length > maxLen ? trimmed.substring(0, maxLen) : trimmed;
    };

    const firstName = cleanStr(body.first_name || body.firstName);
    const lastName = cleanStr(body.last_name || body.lastName);
    const rawUsername = cleanStr(body.username || body.userName);
    const userType = (body.user_type || body.userType) === 'business' ? 'business' : 'individual';
    const companyName = cleanStr(body.company_name || body.companyName);
    const companyStatus = cleanStr(body.company_status || body.companyStatus);
    const street = cleanStr(body.street_address || body.street || body.company_street || body.companyStreet);
    const postalCode = cleanStr(body.postal_code || body.postalCode || body.company_postal_code || body.companyPostalCode);
    const city = cleanStr(body.city || body.company_city || body.companyCity);
    const country = cleanStr(body.country || body.country_code || body.countryCode || 'SI');
    const phone = cleanStr(body.phone || body.phoneNumber);
    const taxId = cleanStr(body.tax_id || body.tax_number || body.taxNumber || body.taxId);
    const vatId = cleanStr(body.vat_id || body.vatId);
    const regNumber = cleanStr(body.registration_number || body.regNumber);
    const description = cleanStr(body.description, 1000);
    const language = cleanStr(body.language || 'sl');
    const representative = cleanStr(body.representative);
    const autoInvoiceGen = body.auto_invoice_generation !== false && body.autoInvoiceGeneration !== false;
    const emailNotifs = typeof body.email_notifications === 'object' ? body.email_notifications : (typeof body.emailNotifications === 'object' ? body.emailNotifications : undefined);

    const profilePictureUrl = cleanStr(body.profile_picture_url || body.profilePicture, 1000);
    if (profilePictureUrl) {
      if (profilePictureUrl.startsWith('data:')) {
        return res.status(400).json({ error: "Profilna slika mora biti HTTPS povezava." });
      }
      if (!profilePictureUrl.startsWith('https://')) {
        return res.status(400).json({ error: "Profilna slika mora biti veljavna HTTPS povezava." });
      }

      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
      try {
        const parsedUrl = new URL(profilePictureUrl);
        if (parsedUrl.host !== 'firebasestorage.googleapis.com') {
          return res.status(400).json({ error: "Profilna slika mora biti gostovana na firebasestorage.googleapis.com." });
        }
        if (!profilePictureUrl.includes(bucketName)) {
          return res.status(400).json({ error: "Profilna slika mora pripadati projektu drazba.si." });
        }

        const allowedProfEncoded = `profile-pictures%2F${uid}%2F`;
        const allowedProfDecoded = `profile-pictures/${uid}/`;
        if (!profilePictureUrl.includes(allowedProfEncoded) && !profilePictureUrl.includes(allowedProfDecoded)) {
          return res.status(400).json({ error: `Nalagate lahko le profilno sliko v svojo mapo (${allowedProfDecoded}).` });
        }
      } catch (e) {
        return res.status(400).json({ error: "Neveljaven URL profilne slike." });
      }
    }

    let validatedUsername = rawUsername;
    if (validatedUsername) {
      const usernameRegex = /^[a-zA-Z0-9._-]{3,30}$/;
      if (!usernameRegex.test(validatedUsername)) {
        return res.status(400).json({ error: "Uporabniško ime lahko vsebuje le črke, številke, piko, podčrtaj in vezaj (3-30 znakov)." });
      }

      const lowerNewUsername = validatedUsername.toLowerCase();

      const oldUsername = (currentData.username || currentData.userName || '').trim();
      const lowerOldUsername = oldUsername.toLowerCase();

      if (lowerNewUsername !== lowerOldUsername) {
        try {
          await adminDb.runTransaction(async (transaction) => {
            const newUsernameRef = adminDb.collection('usernames').doc(lowerNewUsername);
            const newUsernameDoc = await transaction.get(newUsernameRef);

            if (newUsernameDoc.exists && newUsernameDoc.data()?.uid !== uid) {
              throw new Error("409_USERNAME_TAKEN");
            }

            transaction.set(newUsernameRef, { uid });

            if (lowerOldUsername) {
              const oldUsernameRef = adminDb.collection('usernames').doc(lowerOldUsername);
              transaction.delete(oldUsernameRef);
            }
          });
        } catch (txErr: any) {
          if (txErr.message === "409_USERNAME_TAKEN") {
            return res.status(409).json({ error: "To uporabniško ime je že zasedeno." });
          }
          throw txErr;
        }
      }
    }

    const rawVatStatus = cleanStr(body.vat_status || body.vatStatus);
    let vatStatus = 'private';
    let finalVatId = '';
    if (userType === 'business') {
      if (rawVatStatus === 'payer') {
        vatStatus = 'payer';
        finalVatId = vatId.toUpperCase().replace(/\s/g, '');
      } else {
        vatStatus = 'exempt_small';
        finalVatId = '';
      }
    } else {
      vatStatus = 'private';
      finalVatId = '';
    }

    let isProfileCompleted = Boolean(
      firstName && lastName && street && postalCode && city
    );
    if (userType === 'business') {
      const hasVatStatus = vatStatus === 'payer' || vatStatus === 'exempt_small';
      const isVatIdValid = vatStatus !== 'payer' || Boolean(finalVatId);
      isProfileCompleted = isProfileCompleted && Boolean(companyName && taxId && hasVatStatus && isVatIdValid);
    }

    const updatePayload: any = {
      first_name: firstName,
      firstName: firstName,
      last_name: lastName,
      lastName: lastName,
      username: validatedUsername,
      userName: validatedUsername,
      user_type: userType,
      userType: userType,
      company_name: companyName,
      companyName: companyName,
      company_status: companyStatus,
      street_address: street,
      street: street,
      postal_code: postalCode,
      postalCode: postalCode,
      city: city,
      country: country,
      country_code: country,
      countryCode: country,
      phone: phone,
      phoneNumber: phone,
      tax_id: taxId,
      tax_number: taxId,
      taxNumber: taxId,
      taxId: taxId,
      vat_id: finalVatId,
      vatId: finalVatId,
      vat_status: vatStatus,
      vatStatus: vatStatus,
      registration_number: regNumber,
      regNumber: regNumber,
      description: description,
      language: language,
      representative: representative,
      auto_invoice_generation: autoInvoiceGen,
      autoInvoiceGeneration: autoInvoiceGen,
      profile_picture_url: profilePictureUrl || null,
      profilePicture: profilePictureUrl || null,
      profile_completed: isProfileCompleted,
      address: `${street}, ${postalCode} ${city}`.trim().replace(/^,|,$/g, '').trim(),
      updated_at: new Date().toISOString()
    };

    if (emailNotifs) {
      updatePayload.email_notifications = emailNotifs;
      updatePayload.emailNotifications = emailNotifs;
    }

    // Identitaets-Sperre verarbeiten (nur wenn eine Steuernummer vorhanden ist)
    const SUPPORT_EMAIL_PLACEHOLDER = 'info@drazbenik.si';
    if (taxId) {
      const oldTaxId = currentData.tax_id || currentData.tax_number || currentData.taxNumber || currentData.taxId;
      const oldCountry = currentData.country || currentData.country_code || currentData.countryCode || 'SI';

      // Wenn die Steuernummer neu ist oder sich geaendert hat
      if (!oldTaxId || taxId !== oldTaxId || country !== oldCountry) {
        const lockRes = await claimIdentityLock(uid, taxId, country);
        if (!lockRes.success) {
          if (lockRes.error === 'IDENTITY_BLOCKED') {
            return res.status(409).json({ 
              error: "IDENTITY_BLOCKED",
              message: `Verifikacije ni mogoče dokončati. Kontaktirajte podporo: ${SUPPORT_EMAIL_PLACEHOLDER}.`
            });
          } else {
            return res.status(409).json({ 
              error: "TAX_ID_IN_USE",
              message: `Ta davčna številka je že povezana z drugim računom. Če je to vaša številka, nas kontaktirajte: ${SUPPORT_EMAIL_PLACEHOLDER}.`
            });
          }
        }

        // Wenn die Sperre erfolgreich erworben wurde und es eine alte gab, loeschen wir die alte
        if (oldTaxId) {
          await releaseIdentityLock(uid, oldTaxId, oldCountry);
        }
      }
    }

    await adminDb.collection('users').doc(uid).set(updatePayload, { merge: true });

    await syncPublicProfile(uid);

    return res.json({
      success: true,
      message: "Profil uspešno posodobljen.",
      profile_completed: isProfileCompleted
    });
  } catch (err: any) {
    console.error('Error in /api/profile/update:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/accept-terms", async (req, res) => {
  let uid: string;
  try { uid = await authenticateFirebaseUser(req); }
  catch (authErr: any) { return res.status(401).json({ error: authErr.message || 'Unauthorized' }); }
  const { terms_version } = req.body;
  if (terms_version !== TERMS_VERSION) return res.status(400).json({ error: "Invalid terms version" });
  
  const userRef = adminDb.collection('users').doc(uid);
  const userDoc = await userRef.get();
  const now = new Date().toISOString();

  // Falls das Dokument noch nicht existiert, Standardwerte setzen
  if (!userDoc.exists) {
    await userRef.set({
      id: uid,
      terms_version,
      terms_accepted_at: now,
      created_at: now,
      profile_completed: false,
      identity_verified: false,
      subscription_tier: 'FREE',
      subscription: 'FREE'
    });
  } else {
    await userRef.set({
      terms_version,
      terms_accepted_at: now
    }, { merge: true });
  }
  await recordTermsAcceptance({ uid, context: 'reaccept', req, termsVersion: terms_version });
  return res.json({ success: true });
});

app.post("/api/seller/accept-terms", async (req, res) => {
  let uid: string;
  try { uid = await authenticateFirebaseUser(req); }
  catch (authErr: any) { return res.status(401).json({ error: authErr.message || 'Unauthorized' }); }
  const { terms_version, invoice_authorization, self_certification } = req.body;
  if (terms_version !== TERMS_VERSION || invoice_authorization !== true || self_certification !== true) {
    return res.status(400).json({ error: "Za nadaljevanje morate potrditi obe izjavi." });
  }
  await adminDb.collection('users').doc(uid).set({
    terms_version,
    terms_accepted_at: new Date().toISOString(),
    seller_terms_version: TERMS_VERSION,
    seller_terms_accepted_at: new Date().toISOString(),
    seller_invoice_authorization: true,
    seller_self_certified: true
  }, { merge: true });
  await recordTermsAcceptance({ uid, context: 'seller_terms', req, termsVersion: terms_version });
  return res.json({ success: true });
});

// 3. POST /api/subscription/downgrade-free
app.post("/api/subscription/downgrade-free", async (req, res) => {
  try {
    let uid: string;
    try {
      uid = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    await adminDb.collection('users').doc(uid).set({
      subscription: 'FREE',
      subscription_tier: 'FREE',
      subscription_active: false,
      subscription_canceled: false,
      updated_at: new Date().toISOString()
    }, { merge: true });

    return res.json({ success: true, message: 'Naročnina spremenjena na Brezplačni paket.' });
  } catch (err: any) {
    console.error('Error in /api/subscription/downgrade-free:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. POST /api/packages/publish
app.post("/api/packages/publish", async (req, res) => {
  try {
    let uid: string;
    try {
      uid = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const userDoc = await safeGetDoc(adminDb.collection('users').doc(uid));
    const userData = userDoc.data() || {};
    if (userData.isBlocked) {
      return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
    }
    try {
      await assertVerifiedUser(uid, userData);
    } catch (verErr: any) {
      return res.status(403).json({ error: verErr.message, code: verErr.code });
    }

    if (userData.stripe_onboarding_complete !== true) {
      return res.status(403).json({ error: 'Za objavo dražbe morate najprej urediti izplačila.', code: 'PAYOUTS_NOT_READY' });
    }

    const { package_id, title, auction_ids } = req.body || {};

    if (!package_id || !title || !Array.isArray(auction_ids) || auction_ids.length === 0) {
      return res.status(400).json({ error: 'Neveljavni podatki paketa.' });
    }

    for (const auctionId of auction_ids) {
      const auctionSnap = await adminDb.collection('auctions').doc(auctionId).get();
      if (!auctionSnap.exists) {
        return res.status(404).json({ error: `Dražba ${auctionId} ne obstaja.` });
      }
      const auctionData = auctionSnap.data() || {};
      const sellerId = auctionData.seller_id || auctionData.sellerId;
      if (sellerId !== uid) {
        return res.status(403).json({ error: 'Nimate pravic za te dražbe.' });
      }
    }

    const pkgRef = adminDb.collection('packages').doc(package_id);
    const existingPkg = await pkgRef.get();
    if (existingPkg.exists) {
      const existingData = existingPkg.data() || {};
      if (existingData.seller_id && existingData.seller_id !== uid) {
        return res.status(403).json({ error: 'Paket pripada drugemu uporabniku.' });
      }
    }

    await pkgRef.set({
      id: package_id,
      title: title,
      seller_id: uid,
      auction_ids: auction_ids,
      status: 'active',
      created_at: new Date().toISOString()
    }, { merge: true });

    return res.json({ success: true, message: 'Paket uspešno objavljen.' });
  } catch (err: any) {
    console.error('Error in /api/packages/publish:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/transactions/partner-info?auction_id=...
app.get("/api/transactions/partner-info", async (req, res) => {
  try {
    let uid: string;
    try {
      uid = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const auctionId = req.query.auction_id as string;
    if (!auctionId) {
      return res.status(400).json({ error: 'Manjka auction_id.' });
    }

    const auctionSnap = await adminDb.collection('auctions').doc(auctionId).get();
    if (!auctionSnap.exists) {
      return res.status(404).json({ error: 'Dražba ni najdena.' });
    }

    const auction = auctionSnap.data() || {};
    const isPaid = auction.payment_status === 'paid' || auction.post_auction_status === 'paid' || auction.post_auction_status === 'completed' || auction.status === 'completed';
    if (!isPaid) {
      return res.status(400).json({ error: 'Dražba še ni plačana.' });
    }

    const sellerId = auction.seller_id || auction.sellerId;
    const buyerId = auction.winner_id || auction.winnerId;

    let partnerUid: string | null = null;
    if (uid === sellerId) {
      partnerUid = buyerId;
    } else if (uid === buyerId) {
      partnerUid = sellerId;
    } else {
      return res.status(403).json({ error: 'Nimate pravic za ogled teh podatkov.' });
    }

    if (!partnerUid) {
      return res.status(404).json({ error: 'Podatki partnerja niso na voljo.' });
    }

    const partnerSnap = await adminDb.collection('users').doc(partnerUid).get();
    if (!partnerSnap.exists) {
      return res.status(404).json({ error: 'Partner ni najden.' });
    }

    const pData = partnerSnap.data() || {};

    const partnerInfo = {
      id: partnerUid,
      first_name: pData.first_name || pData.firstName || '',
      firstName: pData.first_name || pData.firstName || '',
      last_name: pData.last_name || pData.lastName || '',
      lastName: pData.last_name || pData.lastName || '',
      username: pData.username || pData.userName || '',
      userName: pData.username || pData.userName || '',
      user_type: pData.user_type || pData.userType || 'individual',
      userType: pData.user_type || pData.userType || 'individual',
      company_name: pData.company_name || pData.companyName || '',
      companyName: pData.company_name || pData.companyName || '',
      company_status: pData.company_status || pData.companyStatus || '',
      companyStatus: pData.company_status || pData.companyStatus || '',
      street_address: pData.street_address || pData.street || '',
      street: pData.street_address || pData.street || '',
      city: pData.city || pData.company_city || pData.companyCity || '',
      postal_code: pData.postal_code || pData.postalCode || '',
      postalCode: pData.postal_code || pData.postalCode || '',
      country_code: pData.country_code || pData.countryCode || 'SI',
      countryCode: pData.country_code || pData.countryCode || 'SI',
      phone: pData.phone || pData.phoneNumber || '',
      phoneNumber: pData.phone || pData.phoneNumber || '',
      email: pData.email || '',
      tax_id: pData.tax_id || pData.tax_number || pData.taxNumber || pData.taxId || '',
      taxId: pData.tax_id || pData.tax_number || pData.taxNumber || pData.taxId || '',
      tax_number: pData.tax_id || pData.tax_number || pData.taxNumber || pData.taxId || '',
      taxNumber: pData.tax_id || pData.tax_number || pData.taxNumber || pData.taxId || '',
      vat_id: pData.vat_id || pData.vatId || '',
      vatId: pData.vat_id || pData.vatId || '',
      registration_number: pData.registration_number || pData.regNumber || '',
      regNumber: pData.registration_number || pData.regNumber || '',
      company_street: pData.company_street || pData.companyStreet || '',
      companyStreet: pData.company_street || pData.companyStreet || '',
      company_city: pData.company_city || pData.companyCity || '',
      companyCity: pData.company_city || pData.companyCity || '',
      company_postal_code: pData.company_postal_code || pData.companyPostalCode || '',
      companyPostalCode: pData.company_postal_code || pData.companyPostalCode || '',
      address: pData.address || '',
      representative: pData.representative || '',
      profile_picture_url: pData.profile_picture_url || pData.profilePicture || null,
      profilePicture: pData.profile_picture_url || pData.profilePicture || null,
      is_deleted: Boolean(pData.is_deleted || pData.isDeleted),
      isDeleted: Boolean(pData.is_deleted || pData.isDeleted)
    };

    return res.json({ success: true, partner: partnerInfo });
  } catch (err: any) {
    console.error('Error in /api/transactions/partner-info:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Chat rate limiter using Upstash Redis sliding window (20 messages per minute)
let chatRatelimit: Ratelimit | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const chatRedis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    chatRatelimit = new Ratelimit({
      redis: chatRedis,
      limiter: Ratelimit.slidingWindow(20, "1 m"),
    });
  } catch (err) {
    console.warn("Failed to initialize chat rate limiter:", err);
  }
}

// 1. POST /api/messages/send
app.post("/api/messages/send", async (req, res) => {
  try {
    let uid: string;
    try {
      uid = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const userDoc = await safeGetDoc(adminDb.collection('users').doc(uid));
    const userData = userDoc.data() || {};
    if (userData.isBlocked) {
      return res.status(403).json({ error: "Vaš račun je začasno blokiran." });
    }
    try {
      await assertVerifiedUser(uid, userData);
    } catch (verErr: any) {
      return res.status(403).json({ error: verErr.message, code: verErr.code });
    }

    const { auction_id, content: rawContent, image_url } = req.body;
    if (!auction_id) {
      return res.status(400).json({ error: "Manjka ID dražbe (auction_id)." });
    }

    const auctionSnap = await adminDb.collection('auctions').doc(auction_id).get();
    if (!auctionSnap.exists) {
      return res.status(404).json({ error: "Dražba ni bila najdena." });
    }

    const auctionData = auctionSnap.data() || {};
    const sellerId = auctionData.seller_id || auctionData.sellerId;
    const winnerId = auctionData.winner_id || auctionData.winnerId;

    if (uid !== sellerId && uid !== winnerId) {
      return res.status(403).json({ error: "Nimate dostopa do tega klepeta." });
    }

    const isPaid = auctionData.payment_status === "paid" || auctionData.post_auction_status === "paid" || auctionData.status === "completed";
    if (!isPaid) {
      return res.status(400).json({ error: "Klepet je mogoč šele, ko je plačilo uspešno izvedeno." });
    }

    const content = (rawContent || '').trim();
    const imageUrl = (image_url || '').trim();

    if (!content && !imageUrl) {
      return res.status(400).json({ error: "Sporočilo mora vsebovati besedilo ali sliko." });
    }

    if (content && content.length > 2000) {
      return res.status(400).json({ error: "Besedilo sporočila je predolgo (največ 2000 znakov)." });
    }

    if (imageUrl) {
      if (!imageUrl.startsWith("https://firebasestorage.googleapis.com/") && !imageUrl.startsWith("https://storage.googleapis.com/")) {
        return res.status(400).json({ error: "Naslov slike mora biti veljaven HTTPS naslov v Firebase ali Google Storage." });
      }
      if (imageUrl.length > 1000) {
        return res.status(400).json({ error: "Naslov slike je predolg (največ 1000 znakov)." });
      }
      if (imageUrl.startsWith("data:")) {
        return res.status(400).json({ error: "Neposredno Base64 nalaganje (data: URL) ni dovoljeno." });
      }
    }

    // Apply chat rate limit (max 20 messages per minute per user)
    if (chatRatelimit) {
      try {
        const { success } = await chatRatelimit.limit(`chat_limit_${uid}`);
        if (!success) {
          return res.status(429).json({ error: "Presegli ste omejitev pošiljanja sporočil. Poskusite ponovno čez eno minuto." });
        }
      } catch (limErr) {
        console.warn("Upstash limit check failed, bypassing:", limErr);
      }
    }

    const nowIso = new Date().toISOString();
    const recipientId = uid === sellerId ? winnerId : sellerId;
    const conversationId = "conv_" + auction_id;

    const batch = adminDb.batch();
    const msgRef = adminDb.collection('messages').doc(); // Auto ID
    const convRef = adminDb.collection('conversations').doc(conversationId);

    const msgData: any = {
      conversation_id: conversationId,
      auction_id: auction_id,
      sender_id: uid,
      recipient_id: recipientId,
      participants: [sellerId, winnerId],
      content: content,
      is_read: false,
      created_at: nowIso
    };
    if (imageUrl) {
      msgData.image_url = imageUrl;
    }

    batch.set(msgRef, msgData);

    const lastMsgText = content ? content.substring(0, 200) : "[Slika]";
    const convData = {
      id: conversationId,
      auction_id: auction_id,
      participant_one: sellerId,
      participant_two: winnerId,
      participants: [sellerId, winnerId],
      last_message: lastMsgText,
      last_message_at: nowIso,
      updated_at: nowIso,
      // Verschachteltes Objekt fuer batch.set mit merge, da Punkt-Notation sonst als flacher Schluesselname gespeichert wird
      unread_counts: {
        [recipientId]: FieldValue.increment(1)
      }
    };

    batch.set(convRef, convData, { merge: true });

    await batch.commit();

    return res.json({ id: msgRef.id, created_at: nowIso });
  } catch (err: any) {
    console.error('Error in /api/messages/send:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/messages/mark-read
app.post("/api/messages/mark-read", async (req, res) => {
  try {
    let uid: string;
    try {
      uid = await authenticateFirebaseUser(req);
    } catch (authErr: any) {
      return res.status(401).json({ error: authErr.message || 'Unauthorized' });
    }

    const { conversation_id } = req.body;
    if (!conversation_id) {
      return res.status(400).json({ error: "Manjka ID pogovora (conversation_id)." });
    }

    const convRef = adminDb.collection('conversations').doc(conversation_id);
    const convSnap = await convRef.get();
    if (!convSnap.exists) {
      return res.status(404).json({ error: "Pogovor ni bil najden." });
    }

    const convData = convSnap.data() || {};
    const participants = convData.participants || [];
    if (!participants.includes(uid)) {
      return res.status(403).json({ error: "Nimate dostopa do tega pogovora." });
    }

    const batch = adminDb.batch();

    // Reset unread count for caller on conversation
    batch.set(convRef, {
      unread_counts: {
        [uid]: 0
      }
    }, { merge: true });

    // Mark messages where recipient is the caller and is_read is false as read
    const unreadMsgsSnap = await adminDb.collection('messages')
      .where('conversation_id', '==', conversation_id)
      .where('recipient_id', '==', uid)
      .where('is_read', '==', false)
      .limit(400)
      .get();

    unreadMsgsSnap.docs.forEach((doc) => {
      batch.update(doc.ref, { is_read: true });
    });

    await batch.commit();

    return res.json({ success: true, marked_count: unreadMsgsSnap.size });
  } catch (err: any) {
    console.error('Error in /api/messages/mark-read:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Finalize rate limiter (30 per minute per user)
let finalizeRatelimit: Ratelimit | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    finalizeRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 m"),
    });
  } catch (err) {
    console.warn("Failed to initialize finalize rate limiter:", err);
  }
}

async function checkFinalizeRateLimit(uid: string): Promise<boolean> {
  if (finalizeRatelimit) {
    try {
      const { success } = await finalizeRatelimit.limit(`finalize_limit_${uid}`);
      return success;
    } catch (e) {
      console.warn("Upstash limit check failed, falling back to Firestore:", e);
    }
  }
  try {
    const limitRef = adminDb.collection('user_rate_limits').doc(uid);
    const limitSnap = await limitRef.get();
    const now = Date.now();
    const limitData = limitSnap.exists ? (limitSnap.data() || {}) : {};
    const timestamp = limitData.finalize_ts || 0;
    let count = limitData.finalize_cnt || 0;
    if (now - timestamp > 60 * 1000) {
      count = 0;
    }
    if (count >= 30) return false;
    const updates: any = {};
    if (count === 0) updates.finalize_ts = now;
    updates.finalize_cnt = count + 1;
    await limitRef.set(updates, { merge: true });
    return true;
  } catch (fsErr) {
    return true;
  }
}

// POST /api/auctions/finalize
app.post("/api/auctions/finalize", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  const allowed = await checkFinalizeRateLimit(uid);
  if (!allowed) {
    return res.status(429).json({ error: "Presegli ste omejitev klicev za zaključevanje dražb. Poskusite ponovno čez minuto." });
  }

  const { auction_id } = req.body || {};
  if (!auction_id) {
    return res.status(400).json({ error: "Manjka ID dražbe (auction_id)." });
  }

  try {
    const result = await finalizeAuction(auction_id);
    return res.json({
      finalized: !!result.finalized,
      post_auction_status: result.post_auction_status || null,
      status: result.status || null
    });
  } catch (err: any) {
    console.error('Error in /api/auctions/finalize:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/orders/:id/resolve-dispute
app.post("/api/admin/orders/:id/resolve-dispute", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  if (!(await isAdminUser(uid))) {
    return res.status(403).json({ error: "Nimate administratorskih pravic." });
  }

  try {
    const { id } = req.params;
    const { decision, note } = req.body || {};

    if (decision !== 'release_to_seller' && decision !== 'refund_buyer') {
      return res.status(400).json({ error: "Invalid decision value." });
    }

    // Deutscher Kommentar: Die Transaktions-ID lautet tx_<paymentRef>; der Client sendet die Auktions-ID, daher Fallback ueber auction_id
    let txRef = adminDb.collection('transactions').doc(id);
    let txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      const qSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).limit(1));
      if (!qSnap.empty) {
        txDoc = qSnap.docs[0];
        txRef = txDoc.ref;
      }
    }
    if (!txDoc.exists()) {
      return res.status(404).json({ error: "Naročilo ne obstaja." });
    }

    const tx = txDoc.data();
    if (tx.status !== 'DISPUTED') {
      return res.status(400).json({ error: "Naročilo ni v sporu." });
    }

    const stripe = getStripe();
    const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : (null as any);

    if (decision === 'release_to_seller') {
      await txRef.update({
        payout_status: 'releasable',
        admin_dispute_decision: 'release_to_seller',
        admin_dispute_note: note || ''
      });
      await releaseSellerFunds(id, 'admin_release');
    } else if (decision === 'refund_buyer') {
      if (!tx.stripe_payment_intent_id) {
        return res.status(400).json({ error: "Naročilo nima povezanega plačilnega ID (payment_intent_id)." });
      }

      // Rückerstattung über die Hilfsfunktion einleiten
      const refundRes = await refundTransactionToBuyer(id, 'admin_dispute_refund');
      if (!refundRes.ok) {
        return res.status(500).json({ error: "Fehler bei der Rückerstattung: " + refundRes.status });
      }

      await txRef.update({
        admin_dispute_decision: 'refund_buyer',
        admin_dispute_note: note || ''
      });

      await adminDb.collection('auctions').doc(tx.auction_id || '').update({
        payment_status: 'refunded',
        post_auction_status: 'refunded',
        status: 'canceled'
      });
    }

    try {
      if (process.env.RESEND_API_KEY) {
        // Send email to buyer
        const buyerDoc = await safeGetDoc(adminDb.collection('users').doc(tx.buyer_id));
        const buyer = buyerDoc.data() || {};
        if (buyer.email) {
          await resendClient.emails.send({
            from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
            to: buyer.email,
            subject: `Razrešitev spora za naročilo - dražbenik.si`,
            html: `<p>Pozdravljeni,</p>
                   <p>Spor glede vašega naročila <strong>${id}</strong> je bil razrešen.</p>
                   <p><strong>Odločitev:</strong> ${decision === 'refund_buyer' ? 'Vračilo kupcu (vam).' : 'Sredstva sproščena prodajalcu.'}</p>
                   <p>Opomba administratorja: ${note || '/'}</p>`
          });
        }

        // Send email to seller
        const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(tx.seller_id));
        const seller = sellerDoc.data() || {};
        if (seller.email) {
          await resendClient.emails.send({
            from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
            to: seller.email,
            subject: `Razrešitev spora za naročilo - dražbenik.si`,
            html: `<p>Pozdravljeni,</p>
                   <p>Spor glede vašega prodanega predmeta v naročilu <strong>${id}</strong> je bil razrešen.</p>
                   <p><strong>Odločitev:</strong> ${decision === 'refund_buyer' ? 'Vračilo kupcu.' : 'Izplačilo sproščeno prodajalcu (vam).'}</p>
                   <p>Opomba administratorja: ${note || '/'}</p>`
          });
        }
      }
    } catch (emErr: any) {
      console.error('[resolve-dispute] Error sending notification emails:', emErr.message);
    }

    // Deutscher Kommentar: Ergebnis im Zaehler des Meldenden festhalten (berechtigt / abgelehnt) fuer die Missbrauchskontrolle
    try {
      const openedBy = (await safeGetDocs(adminDb.collection('disputes').where('order_id', '==', id))).docs[0]?.data()?.opened_by_user_id || tx.buyer_id;
      await bumpDisputeStat(openedBy, decision === 'refund_buyer' ? 'reports_upheld' : 'reports_rejected');
    } catch (statErr: any) {
      console.warn('[resolve-dispute] Statistik nicht aktualisiert:', statErr?.message);
    }

    // Also mark the dispute collection as resolved
    try {
      const disputesSnap = await adminDb.collection('disputes').where('order_id', '==', id).get();
      for (const dDoc of disputesSnap.docs) {
        await dDoc.ref.update({
          status: 'RESOLVED',
          decision,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    } catch (dispErr: any) {
      console.error('[resolve-dispute] Error updating disputes collection:', dispErr.message);
    }

    return res.json({ success: true, message: "Streitfall erfolgreich gelöst." });
  } catch (err: any) {
    console.error('Error resolving dispute:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/identity-lock/release
app.post("/api/admin/identity-lock/release", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  if (!(await isAdminUser(uid))) {
    return res.status(403).json({ error: "Nimate administratorskih pravic." });
  }

  try {
    const { taxId, country } = req.body || {};
    if (!taxId) {
      return res.status(400).json({ error: "Manjka davčna številka." });
    }

    const normalized = normalizeTaxId(taxId, country || 'SI');
    if (!normalized) {
      return res.status(400).json({ error: "Neveljavna davčna številka." });
    }

    const docId = lockKey(normalized);
    const lockRef = adminDb.collection('identity_locks').doc(docId);

    const lockSnap = await lockRef.get();
    if (!lockSnap.exists) {
      return res.status(404).json({ error: "Zapora za to davčno številko ni bila najdena." });
    }

    const lockData = lockSnap.data() || {};

    await lockRef.delete();

    // Audit-Log schreiben, falls erwuenscht (z. B. in admin_logs Collection)
    try {
      await adminDb.collection('admin_logs').add({
        action: 'RELEASE_IDENTITY_LOCK',
        admin_uid: uid,
        timestamp: new Date().toISOString(),
        details: {
          tax_id_normalized: normalized,
          lock_id: docId,
          previous_uid: lockData.uid,
          was_blocked: lockData.blocked || false
        }
      });
    } catch (logErr) {
      console.warn("Fehler beim Schreiben des Audit-Logs:", logErr);
    }

    return res.json({ success: true, message: "Zapora davčne številke uspešno izbrisana." });
  } catch (err: any) {
    console.error('Error in /api/admin/identity-lock/release:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/run-cron
app.post("/api/admin/run-cron", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  if (!(await isAdminUser(uid))) {
    return res.status(403).json({ error: "Nimate administratorskih pravic." });
  }

  try {
    const result = await processAuctionCrons();
    return res.json(result);
  } catch (err: any) {
    console.error('Error in /api/admin/run-cron:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/accounting/backfill
// Deutscher Kommentar: Backfill-Endpunkt zum nachtraeglichen Archivieren bestehender Rechnungen
app.post("/api/admin/accounting/backfill", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  if (!(await isAdminUser(uid))) {
    return res.status(403).json({ error: "Nimate administratorskih pravic." });
  }

  try {
    let processed = 0;
    let archived = 0;
    const errors: string[] = [];

    // Deutscher Kommentar: 1. Bestehende Abonnementsrechnungen verarbeiten
    const subDocsSnap = await adminDb.collection('documents').where('type', '==', 'subscription_invoice').get();
    for (const doc of subDocsSnap.docs) {
      processed++;
      const data = doc.data();
      const invoiceNo = data.invoice_no;
      if (!invoiceNo) continue;

      const existingAcc = await safeGetDoc(adminDb.collection('accounting_documents').doc(invoiceNo));
      if (existingAcc.exists) continue;

      try {
        const userDoc = await safeGetDoc(adminDb.collection('users').doc(data.user_id));
        const userData = userDoc.exists ? userDoc.data() : {};
        const amountTotal = Number(data.amount || 20);

        const isCompany = userData.company_status === 'company' || userData.user_type === 'business' || Boolean(userData.company_name);
        const buyerTaxId = userData.tax_id || userData.taxId || userData.vat_id || '';
        const userCountry = (userData.country_code || userData.country || 'SI').toUpperCase();
        const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'ES', 'SE'];
        const isReverseCharge = isCompany && buyerTaxId && euCountries.includes(userCountry) && userCountry !== 'SI';

        const grossCents = Math.round(amountTotal * 100);
        const vatRate = isReverseCharge ? 0 : 22;
        const netCents = isReverseCharge ? grossCents : Math.round(grossCents / 1.22);
        const vatCents = isReverseCharge ? 0 : (grossCents - netCents);

        const pdfBuffer = await generateSubscriptionInvoicePDF({
          invoiceNo,
          user: userData,
          planId: data.package_id || 'basic',
          amount: amountTotal,
          paymentMethod: data.payment_method || 'Spletno plačilo / Kartica',
          paymentDate: data.created_at ? new Date(data.created_at).toLocaleDateString('sl-SI') : undefined
        });

        await archiveAccountingDocument({
          type: 'SUBSCRIPTION',
          invoiceNo,
          issuedAt: data.created_at || new Date(),
          pdfBuffer,
          netCents,
          vatCents,
          grossCents,
          vatRate,
          buyerId: data.user_id || '',
          sellerId: '',
          transactionId: data.source_id || doc.id,
          auctionId: '',
          issuer: 'platform'
        });
        archived++;
      } catch (subErr: any) {
        errors.push(`Sub ${invoiceNo}: ${subErr.message}`);
      }
    }

    // Deutscher Kommentar: 2. Bestehende Auktionsrechnungen verarbeiten
    const invDocsSnap = await adminDb.collection('documents').where('type', '==', 'invoice').get();
    for (const doc of invDocsSnap.docs) {
      processed++;
      const data = doc.data();
      const txId = data.transaction_id;
      if (!txId) continue;

      try {
        const txSnap = await safeGetDoc(adminDb.collection('transactions').doc(txId));
        if (!txSnap.exists) continue;
        const txData = txSnap.data();

        const sInvNo = txData.sales_invoice_no;
        const cInvNo = txData.commission_invoice_no;
        if (!sInvNo || !cInvNo) continue;

        const aucSnap = await safeGetDoc(adminDb.collection('auctions').doc(data.auction_id || txData.auction_id));
        const aucData = aucSnap.exists ? aucSnap.data() : {};

        const buyerSnapshot = txData.buyer_snapshot || {};
        const sellerSnapshot = txData.seller_snapshot || {};
        const transactionRecord = { id: txId, ...txData };

        // SALES archivieren, falls noch nicht vorhanden
        const existingSales = await safeGetDoc(adminDb.collection('accounting_documents').doc(sInvNo));
        if (!existingSales.exists) {
          const itemPrice = Number(transactionRecord.item_price ?? (transactionRecord.amount_total || 0));
          const salesGrossCents = transactionRecord.item_cents ?? Math.round(itemPrice * 100);

          const sType = sellerSnapshot.user_type || sellerSnapshot.userType || 'individual';
          const isSellerBusiness = sType === 'business';
          const sellerVatStatus = sellerSnapshot.vat_status || sellerSnapshot.vatStatus || (isSellerBusiness ? 'exempt_small' : 'private');
          const buyerCountry = (buyerSnapshot.country_code || buyerSnapshot.countryCode || buyerSnapshot.country || 'SI').trim().toUpperCase();
          const buyerTaxId = buyerSnapshot.tax_id || buyerSnapshot.taxId || buyerSnapshot.vat_id || buyerSnapshot.vatId || '';
          const isReverseChargeSales = isSellerBusiness && sellerVatStatus === 'payer' && buyerCountry !== 'SI' && buyerTaxId;
          let salesVatRate = 0;
          let salesNetCents = salesGrossCents;
          let salesVatCents = 0;
          if (isSellerBusiness && sellerVatStatus === 'payer' && !isReverseChargeSales) {
            salesVatRate = 22;
            salesNetCents = Math.round(salesGrossCents / 1.22);
            salesVatCents = salesGrossCents - salesNetCents;
          }

          const salesPdf = await generateInvoicePDF(transactionRecord, buyerSnapshot, sellerSnapshot, aucData, sInvNo, cInvNo, 'sales');
          await archiveAccountingDocument({
            type: 'SALES',
            invoiceNo: sInvNo,
            issuedAt: aucData?.paid_at || txData.created_at || new Date(),
            pdfBuffer: salesPdf,
            netCents: salesNetCents,
            vatCents: salesVatCents,
            grossCents: salesGrossCents,
            vatRate: salesVatRate,
            buyerId: txData.buyer_id || data.user_id || '',
            sellerId: aucData?.sellerId || aucData?.seller_id || txData.seller_id || '',
            transactionId: txId,
            auctionId: data.auction_id || txData.auction_id || '',
            issuer: 'seller_on_behalf'
          });
          archived++;
        }

        // COMMISSION archivieren, falls noch nicht vorhanden
        const existingComm = await safeGetDoc(adminDb.collection('accounting_documents').doc(cInvNo));
        if (!existingComm.exists) {
          const itemPrice = Number(transactionRecord.item_price ?? (transactionRecord.amount_total || 0));
          const commNetCents = Math.round(Number(transactionRecord.platform_fee ?? ((itemPrice * 0.10) / 1.22)) * 100);
          const commVatRate = transactionRecord.vat_rate !== undefined ? Number(transactionRecord.vat_rate) : 22;
          const commVatCents = Math.round(Number(transactionRecord.vat_amount ?? (commNetCents * (commVatRate / 100))) * 100);
          const commGrossCents = commNetCents + commVatCents;

          const commPdf = await generateInvoicePDF(transactionRecord, buyerSnapshot, sellerSnapshot, aucData, sInvNo, cInvNo, 'commission');
          await archiveAccountingDocument({
            type: 'COMMISSION',
            invoiceNo: cInvNo,
            issuedAt: aucData?.paid_at || txData.created_at || new Date(),
            pdfBuffer: commPdf,
            netCents: commNetCents,
            vatCents: commVatCents,
            grossCents: commGrossCents,
            vatRate: commVatRate,
            buyerId: txData.buyer_id || data.user_id || '',
            sellerId: '',
            transactionId: txId,
            auctionId: data.auction_id || txData.auction_id || '',
            issuer: 'platform'
          });
          archived++;
        }
      } catch (invErr: any) {
        errors.push(`Invoice doc ${doc.id}: ${invErr.message}`);
      }
    }

    return res.json({
      success: true,
      processedCount: processed,
      archivedCount: archived,
      errors: errors.slice(0, 10)
    });
  } catch (err: any) {
    console.error('Error in /api/admin/accounting/backfill:', err);
    return res.status(500).json({ error: err.message || 'Napaka pri usklajevanju računovodskega arhiva' });
  }
});

// GET /api/admin/accounting/documents
// Deutscher Kommentar: Liefert Rechnungsdokumente und Summen fuer das angegebene Jahr, den Monat und Typ
app.get("/api/admin/accounting/documents", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  if (!(await isAdminUser(uid))) {
    return res.status(403).json({ error: "Nimate administratorskih pravic." });
  }

  try {
    const { year, month, type } = req.query;
    let queryRef: any = adminDb.collection('accounting_documents');

    if (year) {
      queryRef = queryRef.where('year', '==', parseInt(String(year), 10));
    }
    if (month) {
      const monthStr = String(month).padStart(2, '0');
      queryRef = queryRef.where('month', '==', monthStr);
    }
    if (type && String(type).toUpperCase() !== 'ALL') {
      queryRef = queryRef.where('type', '==', String(type).toUpperCase());
    }

    const snap = await queryRef.get();
    let totalNetCents = 0;
    let totalVatCents = 0;
    let totalGrossCents = 0;

    const documents: any[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      totalNetCents += Number(data.net_cents || 0);
      totalVatCents += Number(data.vat_cents || 0);
      totalGrossCents += Number(data.gross_cents || 0);
      documents.push({
        id: doc.id,
        ...data
      });
    }

    // Deutscher Kommentar: Nach Ausstellungsdatum absteigend sortieren
    documents.sort((a, b) => new Date(b.issued_at || b.created_at).getTime() - new Date(a.issued_at || a.created_at).getTime());

    return res.json({
      documents,
      totals: {
        totalNetCents,
        totalVatCents,
        totalGrossCents,
        count: documents.length
      }
    });
  } catch (err: any) {
    console.error('Error in /api/admin/accounting/documents:', err);
    return res.status(500).json({ error: err.message || 'Napaka pri pridobivanju računovodskih dokumentov' });
  }
});

// GET /api/admin/accounting/file
// Deutscher Kommentar: Laedt eine archivierte Rechnungs-PDF-Datei herunter oder zeigt sie an
app.get("/api/admin/accounting/file", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  if (!(await isAdminUser(uid))) {
    return res.status(403).json({ error: "Nimate administratorskih pravic." });
  }

  const invoiceNo = String(req.query.invoice_no || '').trim();
  if (!invoiceNo) {
    return res.status(400).json({ error: "Manjka številka računa (invoice_no)." });
  }

  try {
    const docRef = adminDb.collection('accounting_documents').doc(invoiceNo);
    const docSnap = await safeGetDoc(docRef);
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Račun v arhivu ni bil najden." });
    }

    const data = docSnap.data();
    const storagePath = data.storage_path;
    let pdfBuffer: Buffer | null = null;

    if (storagePath) {
      try {
        const storage = getAdminStorage();
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
        const file = storage.bucket(bucketName).file(storagePath);
        const [downloaded] = await file.download();
        pdfBuffer = downloaded;
      } catch (dlErr: any) {
        console.warn(`[accounting/file] Storage Download fehlgeschlagen fuer ${storagePath}:`, dlErr.message);
      }
    }

    // Deutscher Kommentar: Fallback - Regenerierung bei fehlender Storage-Datei
    if (!pdfBuffer) {
      if (data.type === 'SUBSCRIPTION') {
        const userDoc = await safeGetDoc(adminDb.collection('users').doc(data.buyer_id));
        const userData = userDoc.exists ? userDoc.data() : {};
        pdfBuffer = await generateSubscriptionInvoicePDF({
          invoiceNo,
          user: userData,
          planId: data.package_id || 'basic',
          amount: data.gross_cents ? data.gross_cents / 100 : 20,
          paymentDate: new Date(data.issued_at || data.created_at).toLocaleDateString('sl-SI')
        });
      } else {
        const txSnap = await safeGetDoc(adminDb.collection('transactions').doc(data.transaction_id));
        const txData = txSnap.exists ? txSnap.data() : {};
        const aucSnap = await safeGetDoc(adminDb.collection('auctions').doc(data.auction_id || txData.auction_id));
        const aucData = aucSnap.exists ? aucSnap.data() : {};
        const part = data.type === 'COMMISSION' ? 'commission' : 'sales';
        pdfBuffer = await generateInvoicePDF(
          { id: data.transaction_id, ...txData },
          txData.buyer_snapshot || {},
          txData.seller_snapshot || {},
          aucData,
          data.type === 'SALES' ? invoiceNo : txData.sales_invoice_no,
          data.type === 'COMMISSION' ? invoiceNo : txData.commission_invoice_no,
          part
        );
      }
    }

    const isInline = req.query.inline === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="racun_${invoiceNo}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.send(pdfBuffer);
  } catch (err: any) {
    console.error('Error in /api/admin/accounting/file:', err);
    return res.status(500).json({ error: err.message || 'Napaka pri prenosu računa' });
  }
});

// GET /api/admin/accounting/export
// Deutscher Kommentar: Erstellt ein ZIP-Archiv mit PDF-Dateien nach Unterordnern und einer pregled.csv
app.get("/api/admin/accounting/export", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  if (!(await isAdminUser(uid))) {
    return res.status(403).json({ error: "Nimate administratorskih pravic." });
  }

  const { year, month, type } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: "Leto (year) in mesec (month) sta obvezna parametra." });
  }

  const yearNum = parseInt(String(year), 10);
  const monthStr = String(month).padStart(2, '0');
  const typeFilter = String(type || 'ALL').toUpperCase();

  try {
    let queryRef: any = adminDb.collection('accounting_documents')
      .where('year', '==', yearNum)
      .where('month', '==', monthStr);

    if (typeFilter !== 'ALL') {
      queryRef = queryRef.where('type', '==', typeFilter);
    }

    const snap = await queryRef.get();
    const docs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    // Deutscher Kommentar: Pruefung auf mehr als 300 Dokumente zur Einhaltung von Serverless-Timeouts
    if (docs.length > 300 && typeFilter === 'ALL') {
      return res.status(400).json({
        error: "Zaradi časovne omejitve strežnika pri več kot 300 dokumentih izvozite vsako vrsto računa posebej (izberite filter SALES, COMMISSION ali SUBSCRIPTION)."
      });
    }

    const zip = new JSZip();
    const storage = getAdminStorage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';

    // Deutscher Kommentar: CSV-Kopfzeile mit UTF-8 BOM fuer Excel-Kompatibilitaet
    let csvContent = '\uFEFF"Številka";"Datum";"Vrsta";"Neto (€)";"DDV (€)";"Bruto (€)";"Stopnja DDV (%)";"Kupec";"Prodajalec"\r\n';

    // Deutscher Kommentar: Dokumente sortieren
    docs.sort((a: any, b: any) => new Date(a.issued_at || a.created_at).getTime() - new Date(b.issued_at || b.created_at).getTime());

    for (const item of docs) {
      let pdfBuffer: Buffer | null = null;
      if (item.storage_path) {
        try {
          const file = storage.bucket(bucketName).file(item.storage_path);
          const [downloaded] = await file.download();
          pdfBuffer = downloaded;
        } catch (dlErr: any) {
          console.warn(`[export] Storage Download fehlgeschlagen fuer ${item.storage_path}:`, dlErr.message);
        }
      }

      if (!pdfBuffer) {
        try {
          if (item.type === 'SUBSCRIPTION') {
            const userDoc = await safeGetDoc(adminDb.collection('users').doc(item.buyer_id));
            const userData = userDoc.exists ? userDoc.data() : {};
            pdfBuffer = await generateSubscriptionInvoicePDF({
              invoiceNo: item.invoice_no,
              user: userData,
              planId: item.package_id || 'basic',
              amount: item.gross_cents ? item.gross_cents / 100 : 20,
              paymentDate: new Date(item.issued_at || item.created_at).toLocaleDateString('sl-SI')
            });
          } else {
            const txSnap = await safeGetDoc(adminDb.collection('transactions').doc(item.transaction_id));
            const txData = txSnap.exists ? txSnap.data() : {};
            const aucSnap = await safeGetDoc(adminDb.collection('auctions').doc(item.auction_id || txData.auction_id));
            const aucData = aucSnap.exists ? aucSnap.data() : {};
            const part = item.type === 'COMMISSION' ? 'commission' : 'sales';
            pdfBuffer = await generateInvoicePDF(
              { id: item.transaction_id, ...txData },
              txData.buyer_snapshot || {},
              txData.seller_snapshot || {},
              aucData,
              item.type === 'SALES' ? item.invoice_no : txData.sales_invoice_no,
              item.type === 'COMMISSION' ? item.invoice_no : txData.commission_invoice_no,
              part
            );
          }
        } catch (genErr: any) {
          console.error(`[export] Regenerierung fehlgeschlagen fuer ${item.invoice_no}:`, genErr.message);
        }
      }

      if (pdfBuffer) {
        // Deutscher Kommentar: In den passenden Unterordner (SALES, COMMISSION, SUBSCRIPTION) legen
        zip.folder(item.type)?.file(`racun_${item.invoice_no}.pdf`, pdfBuffer);
      }

      // Deutscher Kommentar: CSV-Zeile aufbereiten (Semikolon-Trennzeichen, Dezimalkomma)
      const dateStr = item.issued_at ? new Date(item.issued_at).toLocaleDateString('sl-SI') : '';
      const netStr = (Number(item.net_cents || 0) / 100).toFixed(2).replace('.', ',');
      const vatStr = (Number(item.vat_cents || 0) / 100).toFixed(2).replace('.', ',');
      const grossStr = (Number(item.gross_cents || 0) / 100).toFixed(2).replace('.', ',');
      const vatRateStr = item.vat_rate !== undefined ? String(item.vat_rate) : '0';
      const buyerNameStr = String(item.buyer_id || '').replace(/"/g, '""');
      const sellerNameStr = String(item.issuer === 'platform' ? 'Dizain d.o.o.' : (item.seller_id || '')).replace(/"/g, '""');

      csvContent += `"${item.invoice_no}";"${dateStr}";"${item.type}";"${netStr}";"${vatStr}";"${grossStr}";"${vatRateStr}";"${buyerNameStr}";"${sellerNameStr}"\r\n`;
    }

    // Deutscher Kommentar: pregled.csv zum Hauptverzeichnis des ZIPs hinzufuegen
    zip.file("pregled.csv", csvContent);

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="racunovodstvo_${yearNum}_${monthStr}.zip"`);
    return res.send(zipBuffer);
  } catch (err: any) {
    console.error('Error in /api/admin/accounting/export:', err);
    return res.status(500).json({ error: err.message || 'Napaka pri izvozu računovodskega arhiva' });
  }
});

// Deutscher Kommentar: Kurzlebige signierte Links (60 Minuten) fuer private Nachweisfotos, nur fuer Admins
async function signStoragePaths(paths?: string[] | null): Promise<string[]> {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const out: string[] = [];
  try {
    const bucket = getAdminStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app');
    for (const p of paths) {
      try {
        const [url] = await bucket.file(p).getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });
        out.push(url);
      } catch (e: any) {
        console.warn('[signStoragePaths] Link nicht erstellt:', e?.message);
      }
    }
  } catch (e: any) {
    console.warn('[signStoragePaths] Storage nicht verfuegbar:', e?.message);
  }
  return out;
}

// Deutscher Kommentar: Hilfsfunktionen fuer die Admin-Uebersicht (ohne personenbezogene Daten wie Adresse, Telefon, IBAN, Steuernummer)
async function requireAdminOrReply(req: express.Request, res: express.Response): Promise<string | null> {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (e: any) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (!(await isAdminUser(uid))) {
    res.status(403).json({ error: "Nimate administratorskih pravic." });
    return null;
  }
  return uid;
}

function maskEmail(email?: string | null): string | null {
  if (!email || !email.includes('@')) return null;
  const [name, domain] = email.split('@');
  return `${name.slice(0, 1)}***@${domain}`;
}

function pickTitle(t: any): string {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.SLO || t.EN || t.DE || Object.values(t)[0] as string || '';
}

function adminUserSummary(id: string, u: any) {
  return {
    id,
    username: u.username || u.userName || '',
    email_masked: maskEmail(u.email),
    user_type: u.user_type || null,
    company_name: u.user_type === 'business' || u.user_type === 'company' ? (u.company_name || null) : null,
    country_code: u.country_code || null,
    role: u.role || 'user',
    created_at: u.created_at || u.createdAt || null,
    last_seen_at: u.last_seen_at || null
  };
}

// GET /api/admin/users?q=  (UID, E-Mail exakt, Benutzername-Praefix; ohne q die neuesten Nutzer)
app.get("/api/admin/users", async (req, res) => {
  const uid = await requireAdminOrReply(req, res);
  if (!uid) return;
  try {
    const q = String(req.query.q || '').trim();
    const found = new Map<string, any>();
    if (!q) {
      const snap = await safeGetDocs(adminDb.collection('users').orderBy('created_at', 'desc').limit(50));
      snap.docs.forEach((d: any) => found.set(d.id, d.data()));
    } else {
      const byId = await safeGetDoc(adminDb.collection('users').doc(q.replace(/\//g, '')));
      if (byId.exists()) found.set(byId.id, byId.data());
      if (q.includes('@')) {
        const snap = await safeGetDocs(adminDb.collection('users').where('email', '==', q).limit(10));
        snap.docs.forEach((d: any) => found.set(d.id, d.data()));
      } else {
        const snap = await safeGetDocs(adminDb.collection('users').where('username', '>=', q).where('username', '<=', q + '\uf8ff').limit(30));
        snap.docs.forEach((d: any) => found.set(d.id, d.data()));
      }
    }
    return res.json({ items: [...found.entries()].map(([id, u]) => adminUserSummary(id, u)) });
  } catch (err: any) {
    console.error("Error in /api/admin/users:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id - Diagnose fuer Support (Verifizierung, Opomini, Sperren, Auktionen, Zahlungen, Streitfaelle)
app.get("/api/admin/users/:id", async (req, res) => {
  const adminUid = await requireAdminOrReply(req, res);
  if (!adminUid) return;
  try {
    const id = req.params.id;
    const u: any = (await safeGetDoc(adminDb.collection('users').doc(id))).data();
    if (!u) return res.status(404).json({ error: "Uporabnik ne obstaja." });

    const since = new Date(Date.now() - 180 * 86400000).toISOString();
    const strikesSnap = await safeGetDocs(adminDb.collection('seller_strikes').where('user_id', '==', id));
    const strikes = strikesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const strikes180 = strikes.filter((x: any) => (x.created_at || '') >= since).length;

    const asSellerSnap = await safeGetDocs(adminDb.collection('auctions').where('seller_id', '==', id).limit(200));
    const asWinnerSnap = await safeGetDocs(adminDb.collection('auctions').where('winner_id', '==', id).limit(200));
    const auctionRow = (d: any) => {
      const a: any = d.data();
      return {
        id: d.id,
        title: pickTitle(a.title),
        status: a.status || null,
        post_auction_status: a.post_auction_status || null,
        payment_status: a.payment_status || null,
        price: a.current_price ?? a.currentBid ?? null,
        end_time: a.end_time || a.endTime || null
      };
    };
    const soldRows = asSellerSnap.docs.map(auctionRow).sort((a: any, b: any) => String(b.end_time || '').localeCompare(String(a.end_time || '')));
    const wonRows = asWinnerSnap.docs.map(auctionRow).sort((a: any, b: any) => String(b.end_time || '').localeCompare(String(a.end_time || '')));
    const count = (rows: any[], key: string) => rows.reduce((m: any, r: any) => { const k = r[key] || '-'; m[k] = (m[k] || 0) + 1; return m; }, {});

    const txBuyer = await safeGetDocs(adminDb.collection('transactions').where('buyer_id', '==', id).limit(100));
    const txSeller = await safeGetDocs(adminDb.collection('transactions').where('seller_id', '==', id).limit(100));
    const txRows = [...txBuyer.docs.map((d: any) => ({ role: 'kupec', d })), ...txSeller.docs.map((d: any) => ({ role: 'prodajalec', d }))]
      .map(({ role, d }: any) => {
        const t = d.data();
        return { id: d.id, role, auction_id: t.auction_id, status: t.status, payout_status: t.payout_status, item_price: t.item_price ?? null, shipping_type: t.shipping_type || null, shipped_at: t.shipped_at || null, paid_at: t.paid_at || null };
      })
      .sort((a: any, b: any) => String(b.paid_at || '').localeCompare(String(a.paid_at || '')))
      .slice(0, 30);

    const stats = await getDisputeStats(id);
    const currentTerms = TERMS_VERSION;

    // Deutscher Kommentar: Automatische Hinweise, warum Bieten/Verkaufen/Bezahlen fuer den Nutzer nicht funktionieren koennte
    const diagnostics: Array<{ level: 'error' | 'warn' | 'ok'; text: string }> = [];
    const verified = u.email_verified === true || u.is_verified === true;
    if (!verified) diagnostics.push({ level: 'error', text: 'E-poštni naslov ni potrjen: ne more sodelovati pri dražbah ali plačevati.' });
    if (u.profile_completed !== true) diagnostics.push({ level: 'error', text: 'Profil ni dopolnjen (Nastavitve, Osebni podatki): ne more ponujati ali objavljati.' });
    if (u.terms_version !== currentTerms) diagnostics.push({ level: 'warn', text: `Sprejeta različica pogojev (${u.terms_version || 'nobena'}) se razlikuje od veljavne (${currentTerms}).` });
    if (u.auction_blocked_until && new Date(u.auction_blocked_until) > new Date()) diagnostics.push({ level: 'error', text: `Objava dražb je blokirana do ${new Date(u.auction_blocked_until).toLocaleDateString('sl-SI')} zaradi opominov.` });
    if (strikes180 >= 2) diagnostics.push({ level: 'warn', text: `Opominov v zadnjih 180 dneh: ${strikes180} (pri 3 sledi 30-dnevna blokada objav).` });
    if (!(u.stripe_account_id || u.stripeAccountId)) diagnostics.push({ level: 'warn', text: 'Nima povezanega računa za izplačila (potrebno za objavo dražb).' });
    else if (u.stripe_onboarding_complete === false) diagnostics.push({ level: 'warn', text: 'Registracija za izplačila ni dokončana.' });
    if (stats.not_received_180d >= SUSPICIOUS_REPORTS_180D) diagnostics.push({ level: 'warn', text: `Pogoste prijave »ni prispelo« (${stats.not_received_180d} v 180 dneh).` });
    if (diagnostics.length === 0) diagnostics.push({ level: 'ok', text: 'Ni zaznanih omejitev na računu.' });

    return res.json({
      user: {
        ...adminUserSummary(id, u),
        preferred_language: u.preferred_language || null,
        email_verified: verified,
        profile_completed: u.profile_completed === true,
        identity_verified: u.identity_verified === true,
        terms_version: u.terms_version || null,
        terms_version_current: currentTerms,
        subscription_tier: u.subscription_tier || u.subscription || null,
        auction_blocked_until: u.auction_blocked_until || null,
        has_payout_account: !!(u.stripe_account_id || u.stripeAccountId),
        payout_onboarding_complete: u.stripe_onboarding_complete ?? null,
        vat_id_valid: u.vies_valid ?? null
      },
      diagnostics,
      strikes: strikes.slice(0, 20).map((x: any) => ({ id: x.id, reason: x.reason, order_id: x.order_id, created_at: x.created_at })),
      strikes_180d: strikes180,
      dispute_stats: { ...stats.all, not_received_180d: stats.not_received_180d, disputes_180d: stats.disputes_180d },
      selling: { total: soldRows.length, by_status: count(soldRows, 'status'), by_payment: count(soldRows, 'payment_status'), recent: soldRows.slice(0, 15) },
      winning: { total: wonRows.length, by_payment: count(wonRows, 'payment_status'), recent: wonRows.slice(0, 15) },
      transactions: txRows
    });
  } catch (err: any) {
    console.error("Error in /api/admin/users/:id:", err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:id/set-admin - nur fuer Super-Admins aus ADMIN_UIDS
app.post("/api/admin/users/:id/set-admin", async (req, res) => {
  const adminUid = await requireAdminOrReply(req, res);
  if (!adminUid) return;
  const superAdmins = (process.env.ADMIN_UIDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!superAdmins.includes(adminUid)) {
    return res.status(403).json({ error: "Administratorje lahko dodajajo samo glavni administratorji (ADMIN_UIDS)." });
  }
  try {
    const id = req.params.id;
    const makeAdmin = (req.body || {}).admin === true;
    if (superAdmins.includes(id) && !makeAdmin) {
      return res.status(400).json({ error: "Glavnemu administratorju vloge ni mogoče odvzeti tukaj." });
    }
    const ref = adminDb.collection('users').doc(id);
    const doc = await safeGetDoc(ref);
    if (!doc.exists()) return res.status(404).json({ error: "Uporabnik ne obstaja." });
    await ref.update({ role: makeAdmin ? 'admin' : 'user' });
    await adminDb.collection('admin_logs').add({
      action: makeAdmin ? 'GRANT_ADMIN' : 'REVOKE_ADMIN',
      admin_uid: adminUid,
      target_uid: id,
      created_at: new Date().toISOString()
    });
    return res.json({ success: true, role: makeAdmin ? 'admin' : 'user' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/auctions?q=  (ID, Verkaeufer-UID oder Titelteil; ohne q die neuesten)
app.get("/api/admin/auctions", async (req, res) => {
  const uid = await requireAdminOrReply(req, res);
  if (!uid) return;
  try {
    const q = String(req.query.q || '').trim();
    const rows = new Map<string, any>();
    if (!q) {
      const snap = await safeGetDocs(adminDb.collection('auctions').orderBy('created_at', 'desc').limit(50));
      snap.docs.forEach((d: any) => rows.set(d.id, d.data()));
    } else {
      const byId = await safeGetDoc(adminDb.collection('auctions').doc(q.replace(/\//g, '')));
      if (byId.exists()) rows.set(byId.id, byId.data());
      const bySeller = await safeGetDocs(adminDb.collection('auctions').where('seller_id', '==', q).limit(50));
      bySeller.docs.forEach((d: any) => rows.set(d.id, d.data()));
      if (rows.size === 0) {
        // Deutscher Kommentar: Titelsuche ueber die neuesten 300 Auktionen (kein Volltextindex vorhanden)
        const recent = await safeGetDocs(adminDb.collection('auctions').orderBy('created_at', 'desc').limit(300));
        const needle = q.toLowerCase();
        recent.docs.forEach((d: any) => { const a = d.data(); if (pickTitle(a.title).toLowerCase().includes(needle)) rows.set(d.id, a); });
      }
    }
    const items = [...rows.entries()].slice(0, 50).map(([id, a]: any) => ({
      id,
      title: pickTitle(a.title),
      seller_id: a.seller_id || null,
      status: a.status || null,
      post_auction_status: a.post_auction_status || null,
      payment_status: a.payment_status || null,
      price: a.current_price ?? a.currentBid ?? null,
      end_time: a.end_time || a.endTime || null
    }));
    return res.json({ items });
  } catch (err: any) {
    console.error("Error in /api/admin/auctions:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/auctions/:id - Diagnose warum eine Auktion nicht sichtbar ist oder nicht bezahlt werden kann
app.get("/api/admin/auctions/:id", async (req, res) => {
  const uid = await requireAdminOrReply(req, res);
  if (!uid) return;
  try {
    const id = req.params.id;
    const a: any = (await safeGetDoc(adminDb.collection('auctions').doc(id))).data();
    if (!a) return res.status(404).json({ error: "Dražba ne obstaja." });

    const sellerId = a.seller_id || a.sellerId || null;
    const winnerId = a.winner_id || a.winnerId || null;
    const seller: any = sellerId ? ((await safeGetDoc(adminDb.collection('users').doc(sellerId))).data() || {}) : {};
    const winner: any = winnerId ? ((await safeGetDoc(adminDb.collection('users').doc(winnerId))).data() || {}) : {};
    const txSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).limit(1));
    const tx: any = txSnap.docs[0]?.data() || null;
    const bidSnap = await safeGetDocs(adminDb.collection('auctions_private').doc(id).collection('bid_log').orderBy('created_at', 'desc').limit(10));
    const endMs = new Date(a.end_time || a.endTime || 0).getTime();

    const diagnostics: Array<{ level: 'error' | 'warn' | 'ok'; text: string }> = [];
    if (a.status && a.status !== 'active') diagnostics.push({ level: 'warn', text: `Status dražbe je »${a.status}«, zato ni na seznamu aktivnih dražb.` });
    if (a.status === 'active' && endMs && endMs < Date.now()) diagnostics.push({ level: 'warn', text: 'Čas dražbe je potekel, a status je še »active« (čaka na obdelavo crona, ki teče enkrat dnevno).' });
    if (!Array.isArray(a.images) || a.images.length === 0) diagnostics.push({ level: 'error', text: 'Dražba nima slik.' });
    if (seller.auction_blocked_until && new Date(seller.auction_blocked_until) > new Date()) diagnostics.push({ level: 'warn', text: 'Prodajalec ima blokado objav zaradi opominov.' });
    if (winnerId && a.payment_status !== 'paid') {
      if (!(winner.email_verified === true || winner.is_verified === true)) diagnostics.push({ level: 'error', text: 'Zmagovalec nima potrjenega e-poštnega naslova: plačilo ne bo mogoče.' });
      if (winner.profile_completed !== true) diagnostics.push({ level: 'error', text: 'Zmagovalec nima dopolnjenega profila: plačilo ne bo mogoče.' });
      if (winner.terms_version !== TERMS_VERSION) diagnostics.push({ level: 'warn', text: 'Zmagovalec ni sprejel veljavnih pogojev.' });
      if (!(seller.stripe_account_id || seller.stripeAccountId)) diagnostics.push({ level: 'error', text: 'Prodajalec nima računa za izplačila: plačilo ni mogoče.' });
      else if (seller.stripe_onboarding_complete === false) diagnostics.push({ level: 'error', text: 'Prodajalec ni dokončal registracije za izplačila: plačilo ni mogoče.' });
    }
    if (diagnostics.length === 0) diagnostics.push({ level: 'ok', text: 'Ni zaznanih težav.' });

    return res.json({
      auction: {
        id,
        title: pickTitle(a.title),
        status: a.status || null,
        post_auction_status: a.post_auction_status || null,
        payment_status: a.payment_status || null,
        category: a.category || null,
        region: a.region || null,
        delivery_option: a.delivery_option || a.delivery_method || null,
        starting_price: a.starting_price ?? a.startingPrice ?? null,
        price: a.current_price ?? a.currentBid ?? null,
        bid_count: a.bid_count ?? a.bidCount ?? 0,
        images: Array.isArray(a.images) ? a.images.length : 0,
        created_at: a.created_at || null,
        end_time: a.end_time || a.endTime || null
      },
      seller: sellerId ? adminUserSummary(sellerId, seller) : null,
      winner: winnerId ? adminUserSummary(winnerId, winner) : null,
      transaction: tx ? { id: txSnap.docs[0].id, status: tx.status, payout_status: tx.payout_status, item_price: tx.item_price ?? null, paid_at: tx.paid_at || null, shipped_at: tx.shipped_at || null, shipping_type: tx.shipping_type || null, tracking_number: tx.tracking_number || null } : null,
      recent_bids: bidSnap.docs.map((d: any) => { const b = d.data(); return { amount: b.amount ?? b.bid_amount ?? null, user_id: b.user_id || b.bidder_id || null, created_at: b.created_at || null }; }),
      diagnostics
    });
  } catch (err: any) {
    console.error("Error in /api/admin/auctions/:id:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Deutscher Kommentar: Admin-Liste aller Streitfaelle mit Versanddaten, Nachweis des Verkaeufers und Missbrauchszaehlern
app.get("/api/admin/disputes", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (e: any) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!(await isAdminUser(uid))) {
    return res.status(403).json({ error: "Nimate administratorskih pravic." });
  }
  try {
    const onlyOpen = String(req.query.status || 'OPEN') === 'OPEN';
    const snap = await safeGetDocs(adminDb.collection('disputes').where('status', '==', onlyOpen ? 'OPEN' : 'RESOLVED'));
    const rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 100);

    const userCache: Record<string, any> = {};
    const loadUser = async (userId?: string) => {
      if (!userId) return null;
      if (userCache[userId]) return userCache[userId];
      const u = (await safeGetDoc(adminDb.collection('users').doc(userId))).data() || {};
      const stats = await getDisputeStats(userId);
      userCache[userId] = {
        id: userId,
        name: u.username || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || userId,
        email: u.email || null,
        stats: stats.all,
        not_received_180d: stats.not_received_180d,
        disputes_180d: stats.disputes_180d
      };
      return userCache[userId];
    };

    const items: any[] = [];
    for (const r of rows as any[]) {
      const tx: any = (await safeGetDoc(adminDb.collection('transactions').doc(r.order_id))).data() || {};
      const auction: any = tx.auction_id ? ((await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id))).data() || {}) : {};
      items.push({
        dispute_id: r.id,
        order_id: r.order_id,
        auction_id: tx.auction_id || null,
        auction_title: auction?.title?.SLO || auction?.title?.EN || '',
        kind: r.kind || 'other',
        reason: r.reason || '',
        status: r.status,
        resolution: r.resolution || r.decision || null,
        suspicious_buyer: !!r.suspicious_buyer,
        created_at: r.created_at,
        tx_status: tx.status || null,
        payout_status: tx.payout_status || null,
        item_price: tx.item_price ?? null,
        amount_total: tx.amount_total ?? null,
        shipping_type: tx.shipping_type || null,
        carrier_name: tx.carrier_name || null,
        tracking_number: tx.tracking_number || null,
        tracking_url: getTrackingUrl(tx.tracking_number),
        posting_receipt_ref: tx.posting_receipt_ref || null,
        shipped_at: tx.shipped_at || null,
        proof_requested_until: tx.proof_requested_until || null,
        seller_proof_note: tx.seller_proof_note || null,
        seller_proof_photo_urls: await signStoragePaths(tx.seller_proof_photos),
        seller_proof_at: tx.seller_proof_at || null,
        buyer: await loadUser(tx.buyer_id),
        seller: await loadUser(tx.seller_id)
      });
    }
    return res.json({ items });
  } catch (err: any) {
    console.error("Error in /api/admin/disputes:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Deutscher Kommentar: Liefert Beweise und Log-Eintraege fuer Streitfaelle (bid_log, terms_acceptances, Transaktions-ID)
app.get("/api/admin/disputes/evidence", async (req, res) => {
  try {
    let uid: string;
    try {
      uid = await authenticateFirebaseUser(req);
    } catch (e: any) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!(await isAdminUser(uid))) {
      return res.status(403).json({ error: "Forbidden: Admin access required." });
    }

    const auction_id = String(req.query.auction_id || '');
    if (!auction_id) {
      return res.status(400).json({ error: "Zahtevan je parameter auction_id." });
    }

    const auctionDoc = await adminDb.collection('auctions').doc(auction_id).get();
    if (!auctionDoc.exists) {
      return res.status(404).json({ error: "Dražba ne obstaja." });
    }
    const auctionData = auctionDoc.data() || {};
    const sellerId = auctionData.seller_id || auctionData.sellerId;
    const winnerId = auctionData.winner_id || auctionData.winnerId;

    const bidLogSnap = await adminDb.collection('auctions_private').doc(auction_id).collection('bid_log').orderBy('created_at', 'asc').get();
    const bid_log = bidLogSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const targetUids = Array.from(new Set([sellerId, winnerId].filter(Boolean)));
    let terms_acceptances: any[] = [];
    if (targetUids.length > 0) {
      const taSnap = await adminDb.collection('terms_acceptances').where('uid', 'in', targetUids).get();
      terms_acceptances = taSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const txSnap = await adminDb.collection('transactions').where('auction_id', '==', auction_id).limit(1).get();
    const transaction_id = !txSnap.empty ? txSnap.docs[0].id : null;

    const termsText = translations?.SLO?.termsText || '';
    const terms_text_sha256 = crypto.createHash('sha256').update(termsText).digest('hex');

    return res.json({
      auction_id,
      transaction_id,
      terms_version: TERMS_VERSION,
      terms_text_sha256,
      bid_log,
      terms_acceptances
    });
  } catch (err: any) {
    console.error("Error in /api/admin/disputes/evidence:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders/:id/handover-info", async (req, res) => {
  let userId: string;
  try {
    userId = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  try {
    const { id } = req.params;
    let txRef = adminDb.collection('transactions').doc(id);
    let txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      const qSnap = await safeGetDocs(adminDb.collection('transactions').where('auction_id', '==', id).limit(1));
      if (!qSnap.empty) {
        txDoc = qSnap.docs[0];
        txRef = txDoc.ref;
      }
    }
    
    if (!txDoc.exists()) return res.status(404).json({ error: 'Order not found' });
    const txData = txDoc.data()!;
    if (txData.sellerId !== userId && txData.seller_id !== userId) {
        return res.status(403).json({ error: 'Te dražbe ne morete potrditi s tem računom.' });
    }

    const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(txData.auction_id));
    if (!auctionDoc.exists()) return res.status(404).json({ error: 'Auction not found' });
    const auctionData = auctionDoc.data()!;

    let titleStr = "Predmet dražbe";
    if (typeof auctionData.title === 'string') {
        titleStr = auctionData.title;
    } else if (auctionData.title && typeof auctionData.title === 'object') {
        titleStr = auctionData.title.SLO || auctionData.title.EN || Object.values(auctionData.title).find(v => typeof v === 'string') || "Predmet dražbe";
    }

    let imageUrl = null;
    if (auctionData.images && auctionData.images.length > 0) {
        imageUrl = auctionData.images[0].url || auctionData.images[0];
    } else if (auctionData.image_url) {
        imageUrl = auctionData.image_url;
    }
    
    res.json({ title: titleStr, imageUrl });
  } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
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

