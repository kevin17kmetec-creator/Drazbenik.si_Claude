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
  HOLD_ALERT_DAYS
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
import { Resend } from 'resend';
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
  sendOutbidNotification
} from './emailService';
import { syncPublicProfile } from './publicProfile';
import { TERMS_VERSION } from '../lib/termsVersion';

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
import { PLATFORM_COMPANY } from '../lib/platformCompany';

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
  // Reale Werte: 'post' und 'shipping' (select-delivery), 'POSTAL_DELIVERY' nur als Altwert
  return ['post', 'shipping', 'POSTAL_DELIVERY'].includes(method);
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

async function releaseSellerPayout(txId: string, reason: string) {
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
      
      if (data.payout_status === 'paid_out') {
        return { ok: true, status: 'paid_out', tx: data };
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
    if (txResult.status === 'paid_out') {
      return { ok: true, status: 'paid_out' };
    }
    
    const tx = txResult.tx;
    if (!tx) {
      return { ok: false, status: 'not_found' };
    }

    const sellerStripeAccountId = tx.seller_stripe_account_id;
    const sellerNetCents = tx.seller_net_cents;

    if (!sellerStripeAccountId || !sellerNetCents) {
      await txRef.update({ payout_lease_until: 0 });
      return { ok: false, status: 'missing_stripe_info' };
    }

    const stripe = getStripe();
    let balance: Stripe.Balance;
    try {
      balance = await stripe.balance.retrieve({}, { stripeAccount: sellerStripeAccountId });
    } catch (balErr: any) {
      console.error('[releaseSellerPayout] Error retrieving seller balance:', balErr.message);
      await txRef.update({ payout_lease_until: 0 });
      return { ok: false, status: 'balance_check_failed' };
    }

    const availableEurCents = balance.available.find(b => b.currency === 'eur')?.amount || 0;

    if (availableEurCents < sellerNetCents) {
      await txRef.update({
        payout_status: 'release_waiting_funds',
        payout_lease_until: 0
      });
      return { ok: false, status: 'release_waiting_funds' };
    }

    try {
      const payout = await stripe.payouts.create({
        amount: sellerNetCents,
        currency: 'eur',
        metadata: { tx_id: txId, auction_id: tx.auction_id || '' }
      }, {
        stripeAccount: sellerStripeAccountId,
        // Schluessel je Versuchsfolge: ein endgueltig fehlgeschlagener Versuch wird von Stripe sonst identisch wiederholt
        idempotencyKey: 'payout_' + txId + '_' + (tx.payout_key_seq || 0)
      });

      await txRef.update({
        payout_status: 'paid_out',
        payout_id: payout.id,
        paid_out_at: new Date().toISOString(),
        release_reason: reason,
        status: 'COMPLETED',
        payout_lease_until: 0
      });

      // Send email to seller
      try {
        const sellerDoc = await safeGetDoc(adminDb.collection('users').doc(tx.seller_id));
        const seller = sellerDoc.data();
        if (seller?.email && process.env.RESEND_API_KEY) {
          const auctionDoc = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
          const auction = auctionDoc.data();
          const auctionTitleText = auction?.title?.SLO || auction?.title?.EN || 'Predmet dražbe';
          
          const resendClient = new Resend(process.env.RESEND_API_KEY);
          await resendClient.emails.send({
            from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
            to: seller.email,
            subject: 'Izplačilo izvedeno',
            html: `<p>Izplačilo za dražbo <strong>${auctionTitleText}</strong> v višini <strong>${(tx.seller_net_cents / 100).toFixed(2)}</strong> EUR je bilo uspešno izvedeno na vaš povezan Stripe račun.</p>`
          });
        }
      } catch (emErr: any) {
        console.error('[releaseSellerPayout] Error sending success email:', emErr.message);
      }

      return { ok: true, status: 'paid_out' };
    } catch (payoutErr: any) {
      console.error('[releaseSellerPayout] Stripe Payout Creation failed:', payoutErr.message);
      const safeErr = formatStripeError(payoutErr);
      const attempts = (tx.payout_attempts || 0) + 1;
      const nextAttempt = attempts < PAYOUT_MAX_ATTEMPTS 
        ? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
        : null;

      await txRef.update({
        payout_status: 'release_failed',
        payout_error: safeErr.userMessage,
        payout_attempts: attempts,
        // Bei Verbindungsfehlern denselben Schluessel behalten (Zahlung koennte angekommen sein)
        payout_key_seq: (payoutErr?.type === 'StripeConnectionError' || payoutErr?.type === 'StripeAPIError')
          ? (tx.payout_key_seq || 0)
          : (tx.payout_key_seq || 0) + 1,
        next_payout_attempt_at: nextAttempt,
        payout_lease_until: 0
      });
      return { ok: false, status: 'release_failed' };
    }
  } catch (err: any) {
    console.error('[releaseSellerPayout] Unexpected error:', err.message);
    try {
      await txRef.update({ payout_lease_until: 0 });
    } catch (_) {}
    return { ok: false, status: 'unexpected_error' };
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
    const deliveryMethod = auction.delivery_method || 'pickup';
    const autoReleaseAtIso = deliveryMethod === 'pickup'
      ? new Date(Date.now() + PICKUP_AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null;
    // Versandfrist nur bei Paketversand (Abholung hat eigene Frist ueber auto_release_at)
    const shippingDeadlineIso = isPostalDelivery(deliveryMethod)
      ? new Date(Date.now() + SHIP_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const makeSnapshot = (user: any) => {
      const street = user.street_address || user.street || user.company_street || user.companyStreet || '';
      const postal = user.postal_code || user.postalCode || user.company_postal_code || user.companyPostalCode || '';
      const city = user.city || user.company_city || user.companyCity || '';
      
      const firstName = user.first_name || user.firstName || '';
      const lastName = user.last_name || user.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim() || user.name || user.username || user.userName || '';

      return {
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
      delivery_method: deliveryMethod,
      ...(shippingDeadlineIso ? { shipping_deadline: shippingDeadlineIso } : {}),
      auto_release_at: autoReleaseAtIso,
      hold_deadline_at: holdDeadlineIso,
      buyer_snapshot: buyerSnapshot,
      seller_snapshot: sellerSnapshot,
      ...(amountMismatch ? { amount_mismatch: true } : {})
    }, { merge: true });

    await adminDb.collection('auctions').doc(auctionId).update({
      status: 'completed',
      payment_status: 'paid',
      post_auction_status: 'paid',
      paid_at: new Date().toISOString()
    });

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
            paymentDeadline: '7 dni'
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

  if (event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed') {
    const isSession = event.type === 'checkout.session.completed';
    const sessionObj = isSession ? (event.data.object as Stripe.Checkout.Session) : null;
    const paymentIntent = !isSession ? (event.data.object as Stripe.PaymentIntent) : null;

    const rawMetadata = isSession ? (sessionObj?.metadata || {}) : (paymentIntent?.metadata || {});
    const paymentId = isSession 
      ? (typeof sessionObj?.payment_intent === 'string' ? sessionObj.payment_intent : sessionObj?.payment_intent?.id || sessionObj!.id)
      : paymentIntent!.id;
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
    if (!auction_id || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: "Manjkajoči ali neveljavni podatki za ponudbo." });
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

      // D) Write user private my_bids document
      transaction.set(myBidRef, {
        auction_id,
        my_max: calculatedMyMax,
        updated_at: new Date().toISOString()
      }, { merge: true });

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
      my_max: finalMyMax,
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
    const { currency = "eur", auction_id, auctionId, return_url, type = "auction", package_id, planId, tier } = req.body || {};
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
        tier: buyerTotals.tier
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
      if (buyerTotals.feeCents > 0) {
        const feePercentStr = String(buyerTotals.feePercent).replace('.', ',');
        lineItems.push({
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: `Provizija platforme (${feePercentStr} %)` },
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

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
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
      let effectiveSellerId = metadata.seller_id;

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

    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: { external_account_collection: true }
        },
      },
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
      const fee = calculatePlatformFeeCents(Math.round(currentPrice * 100), 'PRO') / 100;
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

    if (itemData) {
      if (itemData.end_time) itemData.end_time = new Date(itemData.end_time).toISOString();
      if (itemData.endTime) itemData.endTime = new Date(itemData.endTime).toISOString();
      if (itemData.payment_deadline) itemData.payment_deadline = new Date(itemData.payment_deadline).toISOString();
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
      // Lieferart aus der Transaktion, bei Altdaten aus der Auktion
      let txDeliveryMethod = tx.delivery_method;
      if (!txDeliveryMethod && tx.auction_id) {
        const auctionSnap = await safeGetDoc(adminDb.collection('auctions').doc(tx.auction_id));
        txDeliveryMethod = auctionSnap.exists() ? auctionSnap.data().delivery_method : null;
      }
      // Abholung oder noch nicht gewaehlte Lieferart: keine Versandfrist
      if (!isPostalDelivery(txDeliveryMethod)) continue;

      let deadline = tx.shipping_deadline;
      const paidReference = tx.paid_at || tx.held_since;
      if (!deadline && paidReference) {
        deadline = new Date(new Date(paidReference).getTime() + SHIP_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      }

      if (deadline && now >= deadline) {
        // Echte Rueckerstattung ueber den zentralen Helper (reverse_transfer + refund_application_fee)
        const refundResult = await refundTransactionToBuyer(docSnap.id, 'seller_no_shipment');

        if (!refundResult.ok) {
          // Status bleibt unveraendert, naechster Cron-Lauf versucht es erneut (idempotent)
          await docSnap.ref.update({
            refund_error: refundResult.status,
            refund_failed_at: now
          });
          try {
            if (process.env.RESEND_API_KEY) {
              const resendAdmin = new Resend(process.env.RESEND_API_KEY);
              await resendAdmin.emails.send({
                from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
                to: adminEmailAddress,
                subject: "Vračilo zaradi neposlane pošiljke ni uspelo",
                html: `<p>Samodejno vračilo za naročilo <strong>${docSnap.id}</strong> ni uspelo (status: ${refundResult.status}). Preverite naročilo v administraciji.</p>`
              });
            }
          } catch (adminMailErr: any) {
            console.error('[cron] Admin alert for failed refund not sent:', adminMailErr.message);
          }
          continue;
        }

        // Verkaeufer-Strike und Notiz
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

        // E-Mails an Kaeufer und Verkaeufer, je einmal (email_flags.shipping_cancelled)
        try {
          const freshSnap = await docSnap.ref.get();
          const flags = (freshSnap.data() || {}).email_flags || {};
          if (!flags.shipping_cancelled && process.env.RESEND_API_KEY) {
            const resendCron = new Resend(process.env.RESEND_API_KEY);
            const fromAddr = process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>';
            const buyerDoc = tx.buyer_id ? await safeGetDoc(adminDb.collection('users').doc(tx.buyer_id)) : null;
            const sellerData = sellerDoc.exists() ? sellerDoc.data() : null;
            const buyerEmail = buyerDoc && buyerDoc.exists() ? buyerDoc.data().email : null;
            if (buyerEmail) {
              await resendCron.emails.send({
                from: fromAddr,
                to: buyerEmail,
                subject: "Naročilo je bilo preklicano",
                html: `<p>Naročilo je bilo preklicano, ker prodajalec predmeta ni poslal v roku. Znesek vam vrnemo v celoti, vključno s provizijo.</p>`
              });
            }
            if (sellerData?.email) {
              await resendCron.emails.send({
                from: fromAddr,
                to: sellerData.email,
                subject: "Naročilo je bilo preklicano",
                html: `<p>Naročilo je bilo preklicano, ker predmet ni bil poslan v predpisanem roku. Kupcu smo vrnili znesek, vaš račun pa je prejel opozorilo.</p>`
              });
            }
            await docSnap.ref.set({ email_flags: { ...flags, shipping_cancelled: true } }, { merge: true });
          }
        } catch (mailErr: any) {
          console.error('[cron] Cancellation e-mails not sent:', mailErr.message);
        }

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
      status: 'DELIVERED',
      delivered_at: new Date().toISOString(),
      auto_complete_at: new Date(Date.now() + AUTO_COMPLETE_AFTER_DELIVERED_DAYS * 24 * 60 * 60 * 1000).toISOString()
    });

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
          subject: `Prevzem potrjen: ${auctionTitleText} - dražbenik.si`,
          html: htmlContent
        });
      }
    } catch (emErr: any) {
      console.error('[verify-pickup-pin] Error sending email:', emErr.message);
    }

    res.json({ success: true, message: "Prevzem potrjen. Izplačilo bo prodajalcu sproženo samodejno po izteku roka za pritožbe." });
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

    const amount = Number(tx.item_price ?? (tx.seller_net_cents ? tx.seller_net_cents / 100 : tx.amount_total));
    if (amount > 15 && !tracking_number) {
      return res.status(400).json({ error: "Za zneske nad 15 € je obvezen vnos sledilne številke." });
    }

    const buyerCc = tx.buyer_snapshot?.country_code || 'SI';
    const sellerCc = tx.seller_snapshot?.country_code || 'SI';
    const isCrossBorder = buyerCc !== 'SI' || sellerCc !== 'SI';
    const releaseDays = isCrossBorder ? AUTO_RELEASE_AFTER_SHIPPED_DAYS_CROSS_BORDER : AUTO_RELEASE_AFTER_SHIPPED_DAYS;
    
    const now = new Date();
    const autoReleaseAt = new Date(now.getTime() + releaseDays * 24 * 60 * 60 * 1000);

    await txRef.update({
      status: 'SHIPPED',
      carrier_name: carrier_name || 'Neznano',
      tracking_number: tracking_number || null,
      shipped_at: now.toISOString(),
      auto_release_at: autoReleaseAt.toISOString()
    });

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
          carrierName: carrier_name,
          trackingNumber: tracking_number
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

    const txRef = adminDb.collection('transactions').doc(id);
    const txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) return res.status(404).json({ error: "Naročilo ne obstaja." });

    const tx = txDoc.data();
    // Nur der Kaeufer der Bestellung darf die Lieferung bestaetigen
    if (tx.buyer_id !== userId) return res.status(403).json({ error: "Nimate pravic." });
    if (tx.status !== 'SHIPPED') return res.status(400).json({ error: "Naročilo mora biti poslano." });

    const now = new Date();
    const autoCompleteDate = new Date(now.getTime() + AUTO_COMPLETE_AFTER_DELIVERED_DAYS * 24 * 60 * 60 * 1000);

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
    let processed = 0;

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
      await releaseSellerPayout(docSnap.id, 'auto_complete_delivered');
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
      await releaseSellerPayout(docSnap.id, 'auto_deadline');
      processed++;
    }

    // (c) retry all payout_status == 'release_waiting_funds'
    const waitingSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('payout_status', '==', 'release_waiting_funds')
    );
    for (const docSnap of waitingSnap.docs) {
      await releaseSellerPayout(docSnap.id, 'retry_waiting_funds');
      processed++;
    }

    // (c2) fehlgeschlagene Auszahlungen erneut versuchen (max. PAYOUT_MAX_ATTEMPTS)
    const failedSnap = await safeGetDocs(
      adminDb.collection('transactions')
        .where('payout_status', '==', 'release_failed')
    );
    for (const docSnap of failedSnap.docs) {
      const tx = docSnap.data();
      if ((tx.payout_attempts || 0) >= PAYOUT_MAX_ATTEMPTS) {
        // Endgueltig fehlgeschlagen: Admin einmalig informieren
        if (!tx.payout_failed_alert_sent && process.env.RESEND_API_KEY) {
          try {
            const resendFail = new Resend(process.env.RESEND_API_KEY);
            await resendFail.emails.send({
              from: process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>',
              to: adminEmailAddress,
              subject: "Izplačilo prodajalcu ni uspelo",
              html: `<p>Izplačilo za naročilo <strong>${docSnap.id}</strong> ni uspelo ${tx.payout_attempts}-krat. Napaka: ${tx.payout_error || 'neznana'}. Preverite prodajalčev Stripe račun.</p>`
            });
            await docSnap.ref.update({ payout_failed_alert_sent: true });
          } catch (failMailErr: any) {
            console.error('[cron] Admin alert for failed payout not sent:', failMailErr.message);
          }
        }
        continue;
      }
      if (tx.next_payout_attempt_at && tx.next_payout_attempt_at > now) continue;
      await releaseSellerPayout(docSnap.id, 'retry_failed');
      processed++;
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
      // Abgeschlossene oder erstattete Transaktionen loesen keinen Alarm aus
      if (['paid_out', 'refunded'].includes(tx.payout_status)) continue;
      const statusCheck = ['held', 'frozen', 'release_waiting_funds'].includes(tx.payout_status);
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
      status: 'DISPUTED',
      payout_status: 'frozen',
      dispute_opened_at: new Date().toISOString()
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
      status: 'DELIVERED',
      delivered_at: new Date().toISOString(),
      auto_complete_at: new Date(Date.now() + AUTO_COMPLETE_AFTER_DELIVERED_DAYS * 24 * 60 * 60 * 1000).toISOString()
    });
    
    await adminDb.collection('auctions').doc(auction_id).update({
      buyer_received: true,
      received_at: new Date().toISOString(),
      receipt_confirmed_at: new Date().toISOString(),
      post_auction_status: 'delivered'
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

    res.json({ success: true, message: "Prejem potrjen. Izplačilo bo sproženo samodejno čez 2 dni." });
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
      role
    };

    res.json(response);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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

    let actualSellerId = '';
    let reviewId = '';

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

      if (auctionData.review_submitted) {
        throw { status: 400, message: "Ocena je že oddana." };
      }

      const auctionTitle = auctionData.title?.SLO || auctionData.title?.EN || (typeof auctionData.title === 'string' ? auctionData.title : 'Dražba');
      const auctionImage = Array.isArray(auctionData.images) && auctionData.images.length > 0 ? auctionData.images[0] : null;

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
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    return res.json({ url });
  } catch (err: any) {
    console.error("Error generating subscription invoice download URL:", err);
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

    const now = new Date();
    const deadline = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

    await auctionRef.update({
      post_auction_status: 'offered_2nd',
      second_winner_id: secondWinnerId,
      second_highest_bidder_id: secondWinnerId,
      second_chance_deadline: deadline,
      current_price: secondAmount,
      currentBid: secondAmount
    });

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
    if (sellerId !== userId) {
      return res.status(403).json({ error: "Način predaje lahko nastavi le prodajalec te dražbe." });
    }

    const isPaid = data.payment_status === 'paid' || data.post_auction_status === 'paid';
    if (!isPaid) {
      return res.status(400).json({ error: "Način predaje je mogoče nastaviti le za plačane dražbe." });
    }

    await docRef.update({
      delivery_method: delivery_method,
      selected_delivery: delivery_method,
    });

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

      if (action === 'accept') {
        const paymentDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        t.update(docRef, {
          post_auction_status: 'awaiting_payment_2nd',
          payment_deadline: paymentDeadline,
          winner_id: userId,
          winnerId: userId,
        });
        resultMsg = "Sprejeli ste ponudbo za drugo možnost. Imate 48 ur za plačilo.";
      } else {
        t.update(docRef, {
          post_auction_status: 'rejected_2nd',
        });
        resultMsg = "Zavrnili ste ponudbo druge možnosti.";
      }
    });

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

      const currentUserDoc = await adminDb.collection('users').doc(uid).get();
      const currentData = currentUserDoc.data() || {};
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
  await adminDb.collection('users').doc(uid).set({
    terms_version,
    terms_accepted_at: new Date().toISOString()
  }, { merge: true });
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
      [`unread_counts.${recipientId}`]: FieldValue.increment(1)
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

  const adminUids = (process.env.ADMIN_UIDS || 'admin,owner').split(',').map(s => s.trim()).filter(Boolean);
  if (!adminUids.includes(uid) && uid !== 'admin' && uid !== 'owner') {
    return res.status(403).json({ error: "Nimate administratorskih pravic." });
  }

  try {
    const { id } = req.params;
    const { decision, note } = req.body || {};

    if (decision !== 'release_to_seller' && decision !== 'refund_buyer') {
      return res.status(400).json({ error: "Invalid decision value." });
    }

    const txRef = adminDb.collection('transactions').doc(id);
    const txDoc = await safeGetDoc(txRef);
    if (!txDoc.exists()) {
      return res.status(404).json({ error: "Naročilo ne obstaja." });
    }

    const tx = txDoc.data();
    if (tx.status !== 'DISPUTED') {
      return res.status(400).json({ error: "Naročilo ni v sporu." });
    }

    const stripe = getStripe();
    const resendClient = new Resend(process.env.RESEND_API_KEY);

    if (decision === 'release_to_seller') {
      await txRef.update({
        payout_status: 'held',
        admin_dispute_decision: 'release_to_seller',
        admin_dispute_note: note || ''
      });
      const resPay = await releaseSellerPayout(id, 'admin_release');
      if (!resPay.ok && resPay.status === 'release_waiting_funds') {
        // Not a hard failure, just awaiting funds
      }
    } else if (decision === 'refund_buyer') {
      if (!tx.stripe_payment_intent_id) {
        return res.status(400).json({ error: "Naročilo nima povezanega plačilnega ID (payment_intent_id)." });
      }

      await stripe.refunds.create({
        payment_intent: tx.stripe_payment_intent_id,
        reverse_transfer: true,
        refund_application_fee: true
      }, {
        idempotencyKey: 'refund_' + id
      });

      await txRef.update({
        payout_status: 'refunded',
        status: 'REFUNDED',
        refunded_at: new Date().toISOString(),
        admin_dispute_decision: 'refund_buyer',
        admin_dispute_note: note || ''
      });

      await adminDb.collection('auctions').doc(tx.auction_id || '').update({
        payment_status: 'refunded',
        post_auction_status: 'refunded',
        status: 'canceled'
      });

      // Decrement AML spend for buyer (existing helper: recordAmlSpend, decrementing via local transaction)
      try {
        const { currentYear } = getLjubljanaYear();
        const buyerId = tx.buyer_id;
        const amountEur = Number(tx.amount_total || tx.amount || 0);
        if (buyerId && amountEur > 0) {
          await adminDb.runTransaction(async (t) => {
            const buyerRef = adminDb.collection('users').doc(buyerId);
            const buyerDoc = await t.get(buyerRef);
            if (buyerDoc.exists) {
              const buyerData = buyerDoc.data() || {};
              const isCurrentYear = buyerData.yearly_spent_year === currentYear;
              const previousYearlySpent = isCurrentYear ? (Number(buyerData.yearly_spent) || 0) : 0;
              const newYearlySpent = Math.max(0, previousYearlySpent - amountEur);
              
              t.set(buyerRef, {
                yearly_spent: newYearlySpent,
                [`yearly_spent_by_year.${currentYear}`]: FieldValue.increment(-amountEur),
                total_spent: FieldValue.increment(-amountEur),
                purchases_count: FieldValue.increment(-1)
              }, { merge: true });
            }
          });
        }
      } catch (amlErr: any) {
        console.error('[resolve-dispute] Error reducing buyer AML spend:', amlErr.message);
      }
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

// POST /api/admin/run-cron
app.post("/api/admin/run-cron", async (req, res) => {
  let uid: string;
  try {
    uid = await authenticateFirebaseUser(req);
  } catch (authErr: any) {
    return res.status(401).json({ error: authErr.message || 'Unauthorized' });
  }

  const adminUids = (process.env.ADMIN_UIDS || 'admin,owner').split(',').map(s => s.trim()).filter(Boolean);
  if (!adminUids.includes(uid) && uid !== 'admin' && uid !== 'owner') {
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

// Catch-all for unhandled API routes to prevent HTML 404s
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found on Vercel backend', url: req.url, originalUrl: req.originalUrl });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

