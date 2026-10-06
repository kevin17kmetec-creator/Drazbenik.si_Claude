'use server';

import Stripe from 'stripe';
import { auth } from '../lib/firebase';
import { getAuthHeaders } from '../lib/authFetch';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

/**
 * Server Actions za drazbenik.si
 * Zagotavljajo varno komunikacijo z backendom, preprečujejo JSON.parse napake
 * in omogočajo robustno obravnavo napak ter nalagalnih stanj.
 */

interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Varen ovitek okoli klicev na backend, ki dosledno preverja status odgovora
 * ter preprečuje zrušitve zaradi nepričakovanih HTML strani ob napakah.
 */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL || 'http://localhost:3000';
}

async function safeApiCall<T = any>(url: string, options?: RequestInit): Promise<ActionResponse<T>> {
  try {
    const fullUrl = url.startsWith('http') ? url : `${getBaseUrl()}${url}`;
    const customHeaders: Record<string, string> = {};
    if (options?.headers) {
      if (typeof options.headers === 'object' && !Array.isArray(options.headers)) {
        Object.assign(customHeaders, options.headers);
      }
    }
    if (!customHeaders['Authorization'] && !customHeaders['authorization'] && typeof window !== 'undefined') {
      try {
        const { auth } = await import('@/src/lib/firebase');
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          customHeaders['Authorization'] = `Bearer ${token}`;
        }
      } catch (e) {
        // ignore
      }
    }

    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...customHeaders,
      },
    });

    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      let errorMsg = `Napaka strežnika (${res.status})`;
      try {
        if (contentType.includes('application/json')) {
          const errData = await res.json();
          errorMsg = errData.error || errData.message || errorMsg;
        } else {
          const text = await res.text();
          if (text && text.length < 250 && !text.includes('<!DOCTYPE') && !text.includes('<html')) {
            errorMsg = text;
          }
        }
      } catch (e) {
        // Fallback na privzeto sporočilo
      }
      return { success: false, error: errorMsg };
    }

    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data && data.error) {
        return { success: false, error: data.error };
      }
      return { success: true, data };
    }

    return { success: true };
  } catch (err: any) {
    console.error(`[API Action Error] ${url}:`, err);
    return {
      success: false,
      error: err?.message || 'Napaka pri povezavi s strežnikom.',
    };
  }
}

/**
 * Neposredno ustvari Stripe Checkout sejo preko Stripe SDK
 */
export async function createCheckoutSessionAction(planOrParams?: any): Promise<{
  url: string | null;
  sessionId?: string;
  success?: boolean;
  error?: string;
}> {
  'use server';
  try {
    const stripeInstance = getStripe();
    if (!stripeInstance) {
      // V okoljih, kjer STRIPE_SECRET_KEY ni neposredno dostopen (npr. brskalnik),
      // se ob klicu varno povežemo s strežniško končno točko
      let token: string | null = null;
      let currentUid: string | null = null;
      try {
        if (typeof window !== 'undefined' && auth.currentUser) {
          token = await auth.currentUser.getIdToken();
          currentUid = auth.currentUser.uid;
        }
      } catch (e) {}

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let bodyObj: any = {};
      if (typeof planOrParams === 'string') {
        bodyObj = {
          type: 'subscription',
          planId: planOrParams,
          package_id: planOrParams.toUpperCase(),
          tier: planOrParams.toUpperCase(),
          user_id: currentUid,
          buyer_id: currentUid,
        };
      } else {
        bodyObj = {
          user_id: currentUid,
          buyer_id: currentUid,
          ...(planOrParams || {}),
        };
      }

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(bodyObj),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Napaka pri vzpostavitvi seje za plačilo.');
      }
      return {
        url: data.url || null,
        sessionId: data.sessionId,
        success: true,
      };
    }

    let planId: string | undefined;
    let amount = 20;
    let title = 'Naročnina';
    let currency = 'eur';
    let returnUrl = (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('drazbenik.si')) 
      ? process.env.NEXT_PUBLIC_APP_URL 
      : 'https://drazbe.eu';
    let sessionMetadata: Record<string, any> = { type: 'subscription' };
    let customerEmail: string | undefined;

    if (typeof planOrParams === 'string') {
      planId = planOrParams;
      const upper = planId.toUpperCase();
      if (upper.includes('PRO')) {
        amount = 50;
        title = 'Naročnina Pro - drazbenik.si';
      } else if (upper.includes('BASIC')) {
        amount = 20;
        title = 'Naročnina Basic - drazbenik.si';
      } else {
        title = `Naročnina ${planId} - drazbenik.si`;
      }
      sessionMetadata = {
        type: 'subscription',
        planId,
        package_id: planId,
      };
    } else if (typeof planOrParams === 'object' && planOrParams !== null) {
      planId = planOrParams.planId || planOrParams.tier;
      if (typeof planOrParams.amount === 'number' && planOrParams.amount > 0) {
        amount = planOrParams.amount;
      } else if (planId) {
        const upper = String(planId).toUpperCase();
        amount = upper.includes('PRO') ? 50 : 20;
      }

      if (planOrParams.title) {
        title = planOrParams.title;
      } else if (planId) {
        title = `Naročnina ${planId} - drazbenik.si`;
      } else {
        title = 'Plačilo - drazbenik.si';
      }

      if (planOrParams.currency) currency = planOrParams.currency;
      if (planOrParams.return_url) returnUrl = planOrParams.return_url;

      sessionMetadata = {
        type: planOrParams.type || (planId ? 'subscription' : 'auction'),
        ...(planId ? { planId, package_id: planId } : {}),
        ...(planOrParams.auction_id ? { auction_id: planOrParams.auction_id } : {}),
        ...(planOrParams.buyer_id || planOrParams.user_id ? { buyer_id: planOrParams.buyer_id || planOrParams.user_id } : {}),
        ...(planOrParams.seller_id ? { seller_id: planOrParams.seller_id } : {}),
        ...(planOrParams.metadata || {}),
      };

      if (planOrParams.buyer_data?.email) {
        customerEmail = planOrParams.buyer_data.email;
      }
    }

    const isSub = sessionMetadata.type === 'subscription';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: title,
            },
            unit_amount: Math.round(amount * 100),
            ...(isSub ? { recurring: { interval: 'month' } } : {}),
          },
          quantity: 1,
        },
      ],
      metadata: sessionMetadata,
      mode: isSub ? 'subscription' : 'payment',
      ...(isSub ? { subscription_data: { metadata: sessionMetadata } } : {}),
      success_url: returnUrl.includes('/stripe-callback.html')
        ? `${returnUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`
        : `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnUrl.includes('/stripe-callback.html')
        ? `${returnUrl}?payment=cancel`
        : `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}payment=cancel`,
    };

    if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripeInstance.checkout.sessions.create(sessionParams);

    return {
      url: session.url,
      sessionId: session.id,
      success: true,
    };
  } catch (error: any) {
    console.error('Napaka pri ustvarjanju Stripe seje:', error);
    return {
      url: null,
      success: false,
      error: error?.message || 'Napaka pri vzpostavitvi povezave s sistemom Stripe.',
    };
  }
}

/**
 * Plačilo dražbe s sredstvi iz denarnice
 */
export async function walletPayAuctionAction(params: {
  amount: number;
  auction_id?: string;
  buyer_id?: string;
  buyer_data?: any;
  [key: string]: any;
}, token?: string): Promise<ActionResponse> {
  'use server';
  return safeApiCall('/api/payments/wallet-pay-auction', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(params),
  });
}

/**
 * Potrditev Stripe Checkout seje
 */
export async function confirmCheckoutSessionAction(params: {
  sessionId?: string;
  auctionId?: string;
  userId?: string;
  user_id?: string;
}): Promise<ActionResponse> {
  'use server';
  let token: string | undefined;
  let uid: string | undefined;
  try {
    if (typeof window !== 'undefined' && auth.currentUser) {
      token = await auth.currentUser.getIdToken();
      uid = auth.currentUser.uid;
    }
  } catch (e) {}

  return safeApiCall('/api/confirm-checkout-session', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify({
      ...params,
      userId: params.userId || params.user_id || uid,
      user_id: params.user_id || params.userId || uid,
    }),
  });
}

/**
 * Sinhronizacija stanja naročnine s Stripe računom
 */
export async function syncUserSubscriptionAction(userId?: string): Promise<ActionResponse<{
  synced: boolean;
  subscription_tier?: string;
  subscription_active?: boolean;
  already_active?: boolean;
  message?: string;
}>> {
  'use server';
  let token: string | undefined;
  let uid = userId;
  try {
    if (typeof window !== 'undefined' && auth.currentUser) {
      token = await auth.currentUser.getIdToken();
      if (!uid) uid = auth.currentUser.uid;
    }
  } catch (e) {}

  return safeApiCall('/api/sync-user-subscription', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify({ user_id: uid, userId: uid }),
  });
}

/**
 * Ustvarjanje nove dražbe
 */
export async function createAuctionAction(params: {
  itemData: any;
  user_id: string;
}): Promise<ActionResponse<{ id?: string }>> {
  'use server';
  return safeApiCall<{ id?: string }>('/api/auctions/create', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Preverjanje statusa Stripe računa
 */
export async function checkStripeAccountStatusAction(params?: {
  user_id?: string;
}, token?: string): Promise<ActionResponse<{ complete?: boolean; account?: any }>> {
  'use server';
  return safeApiCall<{ complete?: boolean; account?: any }>('/api/stripe-check-account-status', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(params || {}),
  });
}

/**
 * Obvestilo ob preseženi ponudbi
 */
export async function notifyOutbidAction(params: {
  auction_id: string;
  outbid_user_id: string;
  new_price: number;
}): Promise<ActionResponse> {
  'use server';
  return safeApiCall('/api/notify-outbid', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Sprožitev preverjanja zaključenih dražb
 */
export async function checkAuctionsCronAction(): Promise<ActionResponse> {
  'use server';
  return safeApiCall('/api/cron/check-auctions', {
    method: 'POST',
  });
}

/**
 * Analiza računa poštnine preko AI
 */
export async function analyzeReceiptAction(params: {
  imageUrl: string;
}): Promise<ActionResponse<{ shipping_cost?: number | null }>> {
  'use server';
  return safeApiCall<{ shipping_cost?: number | null }>('/api/analyze-receipt', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}



/**
 * Preklic naročnine
 */
export async function cancelSubscriptionAction(token: string): Promise<ActionResponse> {
  'use server';
  return safeApiCall('/api/cancel-subscription', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

/**
 * Potrditev prejema predmeta
 */
export async function confirmReceiptAction(params: {
  auction_id: string;
}, token?: string): Promise<ActionResponse> {
  'use server';
  return safeApiCall('/api/auctions/confirm-receipt', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(params),
  });
}

/**
 * Pridobivanje računov za naročnine uporabnika
 */
export async function getSubscriptionInvoicesAction(token?: string): Promise<ActionResponse<{ invoices: any[] }>> {
  'use server';
  return safeApiCall<{ invoices: any[] }>('/api/subscription/invoices', {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

/**
 * Trajni izbris uporabniškega profila in povezanih podatkov
 */
export async function deleteAccountAction(token: string): Promise<ActionResponse> {
  'use server';
  return safeApiCall('/api/delete-account', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

/**
 * Oddaja ocene prodajalca za zmagano dražbo
 */
export async function submitReviewAction(params: {
  auction_id: string;
  seller_id: string;
  rating: number;
  comment?: string;
  would_recommend?: boolean;
}, token?: string): Promise<ActionResponse<{ review_id: string }>> {
  'use server';
  return safeApiCall<{ review_id: string }>('/api/reviews/submit', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(params),
  });
}

