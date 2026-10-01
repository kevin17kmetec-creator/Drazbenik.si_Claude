import Stripe from 'stripe';

export interface StripeSafeDiagnostic {
  type?: string;
  code?: string;
  decline_code?: string;
  param?: string;
  requestId?: string;
  statusCode?: number;
  userMessage: string;
}

/**
 * Format a safe, user-friendly diagnostic object from any Stripe error.
 * Strictly prevents leaking secret keys or internal infrastructure credentials.
 */
export function formatStripeError(err: any): StripeSafeDiagnostic {
  const type = err.type || err.raw?.type;
  const code = err.code || err.raw?.code;
  const decline_code = err.decline_code || err.raw?.decline_code;
  const param = err.param || err.raw?.param;
  const requestId = err.requestId || err.raw?.requestId;
  const statusCode = err.statusCode || err.status;
  const rawMessage = err.message || '';

  let userMessage = "Pri obdelavi izplačila preko sistema Stripe je prišlo do napake.";

  if (code === 'balance_insufficient' || rawMessage.toLowerCase().includes('insufficient funds')) {
    userMessage = "Nezadostno razpoložljivo stanje na platformskem računu Stripe za izvedbo nakazila.";
  } else if (rawMessage.includes('transfers') && (rawMessage.includes('capabilities') || rawMessage.includes('inactive'))) {
    userMessage = "Prejemniški Stripe račun nima aktivne zmožnosti nakazil ('transfers'). Za prejem sredstev je potrebno zaključiti Stripe onboarding.";
  } else if (rawMessage.includes('payouts are not enabled') || rawMessage.includes('payouts_not_enabled')) {
    userMessage = "Izplačila na prejemniškem Stripe računu še niso aktivirana.";
  } else if (code === 'account_invalid' || rawMessage.includes('No such destination')) {
    userMessage = "Povezani Stripe račun prejemnika ne obstaja ali ni veljaven.";
  } else if (code === 'card_declined') {
    userMessage = `Plačilo zavrnjeno s strani izdajatelja kartice (${decline_code || 'splošna zavrnitev'}).`;
  } else if (rawMessage) {
    // Sanitize message: strip any possible sk_live or sk_test strings just in case
    const sanitized = rawMessage.replace(/sk_(test|live)_[0-9a-zA-Z]+/g, '[REDACTED]');
    userMessage = `Stripe napaka: ${sanitized}`;
  }

  return {
    type,
    code,
    decline_code,
    param,
    requestId,
    statusCode,
    userMessage
  };
}

/**
 * In Stripe TEST MODE, automatically ensure the platform balance has sufficient
 * available EUR funds to satisfy transfers. Uses 'tok_bypassPending' to instantly
 * credit available balance in test mode without manual dashboard intervention.
 */
export async function ensurePlatformTestBalance(stripe: Stripe, requiredCents: number): Promise<{ toppedUp: boolean; availableCents: number }> {
  try {
    const isTestMode = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');
    if (!isTestMode) {
      return { toppedUp: false, availableCents: 0 };
    }

    const balance = await stripe.balance.retrieve();
    const eurAvailable = balance.available.find(b => b.currency.toLowerCase() === 'eur');
    const availableCents = eurAvailable ? eurAvailable.amount : 0;

    if (availableCents < requiredCents) {
      const topupAmount = Math.max(requiredCents * 2, 50000); // at least 500 EUR in test mode
      await stripe.charges.create({
        amount: topupAmount,
        currency: 'eur',
        source: 'tok_bypassPending',
        description: 'Automated test platform balance funding for test transfers'
      });
      return { toppedUp: true, availableCents: availableCents + topupAmount };
    }

    return { toppedUp: false, availableCents };
  } catch (err: any) {
    console.warn("[ensurePlatformTestBalance] Top-up notice:", err.message);
    return { toppedUp: false, availableCents: 0 };
  }
}

/**
 * Run a safe, non-destructive diagnostic check for Stripe withdrawal prerequisites.
 */
export async function diagnoseStripeTransferPrerequisites(
  stripe: Stripe,
  user: any,
  amountInCents: number
) {
  const logs: string[] = [];
  const issues: string[] = [];
  const isTestMode = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');

  logs.push(`[1] Preverjanje Stripe okolja: ${isTestMode ? 'TESTNI NAČIN (sk_test_...)' : 'PRODUKCIJSKI NAČIN (sk_live_...)'}`);
  
  // 1. Platform balance check
  let platformEurCents = 0;
  try {
    const balance = await stripe.balance.retrieve();
    const eurAvailable = balance.available.find(b => b.currency.toLowerCase() === 'eur');
    platformEurCents = eurAvailable ? eurAvailable.amount : 0;
    logs.push(`[2] Stanje platforme Stripe (EUR na voljo): ${(platformEurCents / 100).toFixed(2)} €`);
    if (platformEurCents < amountInCents) {
      if (isTestMode) {
        logs.push(`[!] Opozorilo: Stanje platforme (${(platformEurCents / 100).toFixed(2)} €) je nižje od zneska izplačila (${(amountInCents / 100).toFixed(2)} €). V testnem načinu se bo izvedla samodejna polnitev.`);
      } else {
        issues.push("Nezadostno stanje na platformskem računu Stripe.");
      }
    }
  } catch (balErr: any) {
    logs.push(`[2] Napaka pri branju stanja platforme: ${balErr.message}`);
    issues.push(`Preverjanje stanja platforme ni uspelo: ${balErr.message}`);
  }

  // 2. Connected account check
  const stripeAccountId = user.stripeAccountId || user.stripe_account_id;
  if (!stripeAccountId) {
    logs.push(`[3] Stripe Connect račun: NI POVEZAN (prodajalec nima nastavljenega računa)`);
    issues.push("Stripe račun za izplačila ni povezan.");
    return {
      ready: false,
      issues,
      logs,
      details: {
        isTestMode,
        stripeAccountId: null,
        platformEurCents
      }
    };
  }

  logs.push(`[3] Stripe Connect račun najden: ${stripeAccountId}`);

  // 3. Connected account capability retrieval
  let stripeAccount: Stripe.Account | null = null;
  try {
    stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
    const transfersActive = stripeAccount.capabilities?.transfers === 'active';
    const payoutsEnabled = Boolean(stripeAccount.payouts_enabled);
    const chargesEnabled = Boolean(stripeAccount.charges_enabled);
    const detailsSubmitted = Boolean(stripeAccount.details_submitted);

    logs.push(`[4] Podatki računa oddani (details_submitted): ${detailsSubmitted ? 'DA' : 'NE'}`);
    logs.push(`[5] Zmožnost nakazil (capabilities.transfers): ${transfersActive ? 'AKTIVNA (Active)' : `${stripeAccount.capabilities?.transfers || 'inactive'}`}`);
    logs.push(`[6] Izplačila omogočena (payouts_enabled): ${payoutsEnabled ? 'DA' : 'NE'}`);
    logs.push(`[7] Plačila omogočena (charges_enabled): ${chargesEnabled ? 'DA' : 'NE'}`);

    if (!transfersActive && !payoutsEnabled) {
      issues.push("Prejemniški Stripe račun nima aktivnih nakazil ('transfers'). Dokončajte onboarding postopek.");
    }
  } catch (acctErr: any) {
    logs.push(`[4] Napaka pri preverjanju računa ${stripeAccountId}: ${acctErr.message}`);
    issues.push(`Povezanega Stripe računa ni bilo mogoče preveriti: ${acctErr.message}`);
  }

  const ready = issues.length === 0;
  logs.push(`[8] Skupna ocena pripravljenosti za izplačilo: ${ready ? 'PRIPRAVLJENO' : 'POTREBNA DEJANJA'}`);

  return {
    ready,
    issues,
    logs,
    details: {
      isTestMode,
      stripeAccountId,
      platformEurCents,
      accountType: stripeAccount?.type,
      transfersCapability: stripeAccount?.capabilities?.transfers,
      payoutsEnabled: stripeAccount?.payouts_enabled,
      detailsSubmitted: stripeAccount?.details_submitted
    }
  };
}
