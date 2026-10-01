import { adminDb, FieldValue } from '../lib/firebase-admin';

export type WalletTxType = 'deposit' | 'withdrawal' | 'wallet_payment' | 'hold' | 'release' | 'refund' | 'migration' | 'test_credit' | 'test_deposit' | 'payout';

export interface WalletLedgerEntry {
  transaction_id: string;
  user_id: string;
  type: WalletTxType;
  amount_cents: number;
  status: 'pending' | 'completed' | 'failed';
  auction_id?: string;
  stripe_transfer_id?: string;
  stripe_payment_intent_id?: string;
  idempotency_key: string;
  created_at: any;
}

/** Ensure user wallet is migrated to cents model within a transaction */
export function ensureWalletMigrated(t: FirebaseFirestore.Transaction, userRef: FirebaseFirestore.DocumentReference, userData: any) {
  if (userData.available_cents === undefined) {
    const legacyBalance = Number(userData.wallet_balance) || 0;
    const legacyCents = Math.round(legacyBalance * 100);
    
    t.update(userRef, {
      available_cents: legacyCents,
      held_cents: 0,
      reserved_cents: 0
    });

    if (legacyCents !== 0) {
      const txRef = adminDb.collection('wallet_transactions').doc();
      t.set(txRef, {
        transaction_id: txRef.id,
        user_id: userRef.id,
        type: 'migration',
        amount_cents: legacyCents,
        status: 'completed',
        idempotency_key: `migration_${userRef.id}`,
        created_at: FieldValue.serverTimestamp()
      });
    }
    
    return {
      available_cents: legacyCents,
      held_cents: 0,
      reserved_cents: 0
    };
  }
  return {
    available_cents: userData.available_cents || 0,
    held_cents: userData.held_cents || 0,
    reserved_cents: userData.reserved_cents || 0
  };
}

/** 
 * Reserve funds for withdrawal or wallet payment.
 * Moves from available_cents to reserved_cents.
 */
export async function reserveWalletFunds(userId: string, amountCents: number, type: WalletTxType, idempotencyKey: string, meta?: any) {
  if (amountCents <= 0) throw new Error("Amount must be positive");
  
  return await adminDb.runTransaction(async (t) => {
    // 1. Check idempotency
    const existingQuery = await t.get(
      adminDb.collection('wallet_transactions').where('idempotency_key', '==', idempotencyKey).limit(1)
    );
    if (!existingQuery.empty) {
      throw new Error("Idempotency key already exists");
    }

    // 2. Fetch user
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await t.get(userRef);
    if (!userDoc.exists) throw new Error("User not found");
    const userData = userDoc.data() || {};
    
    const wallet = ensureWalletMigrated(t, userRef, userData);
    
    if (wallet.available_cents < amountCents) {
      throw new Error("Insufficient available balance");
    }

    // 3. Update balances
    const newAvailable = wallet.available_cents - amountCents;
    t.update(userRef, {
      available_cents: FieldValue.increment(-amountCents),
      reserved_cents: FieldValue.increment(amountCents),
      wallet_balance: Math.max(0, newAvailable / 100)
    });

    // 4. Create pending transaction
    const txRef = adminDb.collection('wallet_transactions').doc();
    const entry: any = {
      transaction_id: txRef.id,
      user_id: userId,
      type,
      amount_cents: amountCents,
      status: 'pending',
      idempotency_key: idempotencyKey,
      created_at: FieldValue.serverTimestamp(),
      ...meta
    };
    t.set(txRef, entry);

    return txRef.id;
  });
}

/**
 * Confirm reserved funds are spent.
 * Removes from reserved_cents and marks transaction completed.
 */
export async function commitReservedFunds(txId: string, metaUpdates?: any) {
  await adminDb.runTransaction(async (t) => {
    const txRef = adminDb.collection('wallet_transactions').doc(txId);
    const txDoc = await t.get(txRef);
    if (!txDoc.exists) throw new Error("Transaction not found");
    const tx = txDoc.data()!;
    if (tx.status !== 'pending') throw new Error("Transaction is not pending");

    const userRef = adminDb.collection('users').doc(tx.user_id);
    
    t.update(userRef, {
      reserved_cents: FieldValue.increment(-tx.amount_cents)
    });

    t.update(txRef, {
      status: 'completed',
      ...metaUpdates
    });
  });
}

/**
 * Rollback reserved funds.
 * Moves from reserved_cents back to available_cents and marks transaction failed.
 */
export async function rollbackReservedFunds(txId: string) {
  await adminDb.runTransaction(async (t) => {
    const txRef = adminDb.collection('wallet_transactions').doc(txId);
    const txDoc = await t.get(txRef);
    if (!txDoc.exists) throw new Error("Transaction not found");
    const tx = txDoc.data()!;
    if (tx.status !== 'pending') throw new Error("Transaction is not pending");

    const userRef = adminDb.collection('users').doc(tx.user_id);
    
    const userDoc = await t.get(userRef);
    const userData = userDoc.data() || {};
    const wallet = ensureWalletMigrated(t, userRef, userData);
    const restoredAvailable = wallet.available_cents + tx.amount_cents;

    t.update(userRef, {
      reserved_cents: FieldValue.increment(-tx.amount_cents),
      available_cents: FieldValue.increment(tx.amount_cents),
      wallet_balance: Math.max(0, restoredAvailable / 100)
    });

    t.update(txRef, {
      status: 'failed'
    });
  });
}

/**
 * Add held funds to a user (e.g. from an auction payment).
 * Increases held_cents.
 */
export async function addHeldFunds(userId: string, amountCents: number, idempotencyKey: string, meta?: any) {
  if (amountCents <= 0) throw new Error("Amount must be positive");
  
  await adminDb.runTransaction(async (t) => {
    const existingQuery = await t.get(
      adminDb.collection('wallet_transactions').where('idempotency_key', '==', idempotencyKey).limit(1)
    );
    if (!existingQuery.empty) return; // Already processed

    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await t.get(userRef);
    if (!userDoc.exists) throw new Error("User not found");
    const userData = userDoc.data() || {};
    ensureWalletMigrated(t, userRef, userData);

    t.update(userRef, {
      held_cents: FieldValue.increment(amountCents)
    });

    const txRef = adminDb.collection('wallet_transactions').doc();
    t.set(txRef, {
      transaction_id: txRef.id,
      user_id: userId,
      type: 'hold',
      amount_cents: amountCents,
      status: 'completed',
      idempotency_key: idempotencyKey,
      created_at: FieldValue.serverTimestamp(),
      ...meta
    });
  });
}

/**
 * Release held funds to available funds.
 * Moves from held_cents to available_cents.
 */
export async function releaseHeldFunds(userId: string, amountCents: number, idempotencyKey: string, meta?: any) {
  if (amountCents <= 0) throw new Error("Amount must be positive");
  
  await adminDb.runTransaction(async (t) => {
    const existingQuery = await t.get(
      adminDb.collection('wallet_transactions').where('idempotency_key', '==', idempotencyKey).limit(1)
    );
    if (!existingQuery.empty) return; // Already processed

    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await t.get(userRef);
    if (!userDoc.exists) throw new Error("User not found");
    const userData = userDoc.data() || {};
    const wallet = ensureWalletMigrated(t, userRef, userData);

    if (wallet.held_cents < amountCents) {
      throw new Error("Insufficient held balance");
    }

    const newAvailable = wallet.available_cents + amountCents;
    t.update(userRef, {
      held_cents: FieldValue.increment(-amountCents),
      available_cents: FieldValue.increment(amountCents),
      wallet_balance: Math.max(0, newAvailable / 100)
    });

    const txRef = adminDb.collection('wallet_transactions').doc();
    t.set(txRef, {
      transaction_id: txRef.id,
      user_id: userId,
      type: 'release',
      amount_cents: amountCents,
      status: 'completed',
      idempotency_key: idempotencyKey,
      created_at: FieldValue.serverTimestamp(),
      ...meta
    });
  });
}

/**
 * Safely fetch user wallet data within an atomic transaction,
 * ensuring automatic migration of legacy balances.
 */
export async function getUserWallet(userId: string) {
  return await adminDb.runTransaction(async (t) => {
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await t.get(userRef);
    if (!userDoc.exists) throw new Error("User not found");
    const userData = userDoc.data() || {};
    return ensureWalletMigrated(t, userRef, userData);
  });
}

/**
 * Credit realistic test/sandbox funds to a user's wallet.
 * Operates in cents, migrates legacy balance if needed, updates both
 * available_cents and wallet_balance atomically, and records an official
 * wallet_transactions ledger entry.
 */
export async function creditTestFunds(
  userId: string,
  amountCents: number,
  idempotencyKey: string,
  meta?: any
) {
  if (amountCents <= 0) {
    throw new Error("Amount must be positive integer in cents");
  }

  return await adminDb.runTransaction(async (t) => {
    // 1. Check idempotency
    const existingQuery = await t.get(
      adminDb.collection('wallet_transactions').where('idempotency_key', '==', idempotencyKey).limit(1)
    );
    if (!existingQuery.empty) {
      const existingDoc = existingQuery.docs[0];
      const data = existingDoc.data() || {};
      const userRef = adminDb.collection('users').doc(userId);
      const userDoc = await t.get(userRef);
      const userData = userDoc.data() || {};
      const wallet = ensureWalletMigrated(t, userRef, userData);
      return {
        transaction_id: existingDoc.id,
        amount_cents: data.amount_cents || amountCents,
        available_cents: wallet.available_cents,
        wallet_balance: Math.max(0, wallet.available_cents / 100),
        already_processed: true
      };
    }

    // 2. Fetch and migrate user wallet
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await t.get(userRef);
    if (!userDoc.exists) {
      throw new Error("Uporabnik ne obstaja v bazi");
    }
    const userData = userDoc.data() || {};
    const wallet = ensureWalletMigrated(t, userRef, userData);

    // 3. Atomically update balances
    const newAvailableCents = wallet.available_cents + amountCents;
    const newLegacyBalance = Math.max(0, newAvailableCents / 100);

    t.update(userRef, {
      available_cents: FieldValue.increment(amountCents),
      wallet_balance: newLegacyBalance
    });

    // 4. Create ledger entry in wallet_transactions
    const txRef = adminDb.collection('wallet_transactions').doc();
    const entry: any = {
      transaction_id: txRef.id,
      user_id: userId,
      type: 'test_credit',
      amount_cents: amountCents,
      amount: amountCents / 100,
      status: 'completed',
      description: meta?.description || 'Testno dobroimetje (Sandbox)',
      idempotency_key: idempotencyKey,
      created_at: FieldValue.serverTimestamp(),
      environment: 'sandbox',
      ...meta
    };
    t.set(txRef, entry);

    return {
      transaction_id: txRef.id,
      amount_cents: amountCents,
      available_cents: newAvailableCents,
      wallet_balance: newLegacyBalance,
      already_processed: false
    };
  });
}

/**
 * Credit real Stripe test-mode deposit to user wallet.
 * Strictly idempotent: checks both idempotency_key and stripe_payment_intent_id.
 * Updates available_cents and keeps legacy wallet_balance synchronized.
 * Creates an official wallet_transactions entry with type: 'deposit'.
 */
export async function creditWalletDepositFromStripe(
  userId: string,
  amountCents: number,
  stripePaymentIntentId: string,
  meta?: {
    description?: string;
    environment?: string;
    idempotencyKey?: string;
    [key: string]: any;
  }
) {
  if (amountCents <= 0) {
    throw new Error("Deposit amount must be positive integer in cents");
  }
  if (!stripePaymentIntentId) {
    throw new Error("Stripe PaymentIntent ID is required for deposit credit");
  }

  const idempotencyKey = meta?.idempotencyKey || `stripe_deposit_${stripePaymentIntentId}`;

  return await adminDb.runTransaction(async (t) => {
    // 1. Idempotency Check A: By idempotency_key
    const existingByIdempotency = await t.get(
      adminDb.collection('wallet_transactions').where('idempotency_key', '==', idempotencyKey).limit(1)
    );
    if (!existingByIdempotency.empty) {
      const existingDoc = existingByIdempotency.docs[0];
      const data = existingDoc.data() || {};
      const userRef = adminDb.collection('users').doc(userId);
      const userDoc = await t.get(userRef);
      const userData = userDoc.data() || {};
      const wallet = ensureWalletMigrated(t, userRef, userData);
      return {
        transaction_id: existingDoc.id,
        amount_cents: data.amount_cents || amountCents,
        available_cents: wallet.available_cents,
        wallet_balance: Math.max(0, wallet.available_cents / 100),
        already_processed: true
      };
    }

    // Idempotency Check B: By stripe_payment_intent_id
    const existingByPi = await t.get(
      adminDb.collection('wallet_transactions')
        .where('stripe_payment_intent_id', '==', stripePaymentIntentId)
        .where('type', '==', 'deposit')
        .limit(1)
    );
    if (!existingByPi.empty) {
      const existingDoc = existingByPi.docs[0];
      const data = existingDoc.data() || {};
      const userRef = adminDb.collection('users').doc(userId);
      const userDoc = await t.get(userRef);
      const userData = userDoc.data() || {};
      const wallet = ensureWalletMigrated(t, userRef, userData);
      return {
        transaction_id: existingDoc.id,
        amount_cents: data.amount_cents || amountCents,
        available_cents: wallet.available_cents,
        wallet_balance: Math.max(0, wallet.available_cents / 100),
        already_processed: true
      };
    }

    // 2. Fetch and migrate user wallet
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await t.get(userRef);
    if (!userDoc.exists) {
      throw new Error("Uporabnik ne obstaja v bazi");
    }
    const userData = userDoc.data() || {};
    const wallet = ensureWalletMigrated(t, userRef, userData);

    // 3. Atomically update balances
    const newAvailableCents = wallet.available_cents + amountCents;
    const newLegacyBalance = Math.max(0, newAvailableCents / 100);

    t.update(userRef, {
      available_cents: FieldValue.increment(amountCents),
      wallet_balance: newLegacyBalance
    });

    // 4. Create ledger entry in wallet_transactions
    const txRef = adminDb.collection('wallet_transactions').doc();
    const entry: any = {
      transaction_id: txRef.id,
      user_id: userId,
      type: 'deposit',
      amount_cents: amountCents,
      amount: amountCents / 100,
      status: 'completed',
      stripe_payment_intent_id: stripePaymentIntentId,
      description: meta?.description || 'Platform test balance funding',
      idempotency_key: idempotencyKey,
      created_at: FieldValue.serverTimestamp(),
      environment: meta?.environment || 'test',
      ...meta
    };
    t.set(txRef, entry);

    return {
      transaction_id: txRef.id,
      amount_cents: amountCents,
      available_cents: newAvailableCents,
      wallet_balance: newLegacyBalance,
      already_processed: false
    };
  });
}


