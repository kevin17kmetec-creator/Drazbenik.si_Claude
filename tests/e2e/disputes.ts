// Deutscher Kommentar: E2E-Test der Streitfall-Ablaeufe gegen Firebase-Emulator und Stripe-Testmodus (niemals Produktion)
import fs from 'fs';
import Stripe from 'stripe';

const results: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }> = [];
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
  } catch (e: any) {
    if (e?.skip) results.push({ name, status: 'SKIP', detail: e.message });
    else results.push({ name, status: 'FAIL', detail: String(e?.message || e).slice(0, 600) });
  }
}
function eq(actual: any, expected: any, what: string) {
  if (actual !== expected) throw new Error(`${what}: pricakovano ${JSON.stringify(expected)}, dobljeno ${JSON.stringify(actual)}`);
}
function skip(msg: string): never { const e: any = new Error(msg); e.skip = true; throw e; }

async function main() {
  // Sicherheitsabbruch: nur gegen Emulatoren und Stripe-Testschluessel
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Emulator ni aktiven, prekinjam (zaščita pred produkcijo).');
  const sk = process.env.STRIPE_SECRET_KEY || '';
  if (sk && !sk.startsWith('sk_test_') && !sk.startsWith('rk_test_')) throw new Error('STRIPE_SECRET_KEY ni testni kljuc, prekinjam.');
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';

  const { app } = await import('../../src/server/app');
  const { adminDb } = await import('../../src/lib/firebase-admin');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

  async function mkUser(label: string, extra: any = {}) {
    const email = `${label}-${Date.now()}@test.si`;
    const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test1234!', returnSecureToken: true })
    });
    const j: any = await r.json();
    await adminDb.collection('users').doc(j.localId).set({ email, first_name: label, email_verified: true, ...extra });
    return { uid: j.localId as string, token: j.idToken as string, email };
  }
  async function api(method: string, path: string, token: string | null, body?: any) {
    const r = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    let j: any = null; try { j = await r.json(); } catch {}
    return { status: r.status, body: j };
  }

  const buyer = await mkUser('kupec');
  const seller = await mkUser('prodajalec');
  const other = await mkUser('tujec');
  const admin = await mkUser('admin', { role: 'admin' });
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const photos = [{ mime_type: 'image/png', data_base64: PNG }];
  const reason = 'Predmet ni v stanju iz oglasa.';
  const diff = 'Na predmetu je razpoka, ki je v oglasu ni.';

  let seq = 0;
  async function seedTx(over: any = {}) {
    seq++;
    const id = `tx_e2e_${Date.now()}_${seq}`;
    const auctionId = `auc_e2e_${Date.now()}_${seq}`;
    await adminDb.collection('auctions').doc(auctionId).set({ title: { SLO: 'Testni predmet' }, seller_id: seller.uid, status: 'ended' });
    await adminDb.collection('transactions').doc(id).set({
      buyer_id: buyer.uid, seller_id: seller.uid, auction_id: auctionId,
      status: 'SHIPPED', payout_status: 'held', delivery_method: 'shipping', shipping_type: 'tracked',
      shipped_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      item_price: 100, amount_total: 10500, seller_net_cents: 9500,
      buyer_snapshot: { country_code: 'SI' }, seller_snapshot: { country_code: 'SI' },
      ...over
    });
    return { id, auctionId };
  }
  const openBody = (extra: any = {}) => ({ reason, kind: 'other', difference: diff, photos, ...extra });

  // ---- Validacije ob odprtju spora
  await test('open-dispute: brez prijave -> 401', async () => {
    const t = await seedTx(); eq((await api('POST', `/api/orders/${t.id}/open-dispute`, null, openBody())).status, 401, 'status');
  });
  await test('open-dispute: prekratek razlog -> 400', async () => {
    const t = await seedTx(); eq((await api('POST', `/api/orders/${t.id}/open-dispute`, buyer.token, openBody({ reason: 'kratko' }))).status, 400, 'status');
  });
  await test('open-dispute: "druga tezava" brez fotografije -> 400', async () => {
    const t = await seedTx(); eq((await api('POST', `/api/orders/${t.id}/open-dispute`, buyer.token, openBody({ photos: [] }))).status, 400, 'status');
  });
  await test('open-dispute: neveljavna slika -> 400', async () => {
    const t = await seedTx(); eq((await api('POST', `/api/orders/${t.id}/open-dispute`, buyer.token, openBody({ photos: [{ mime_type: 'image/png', data_base64: Buffer.from('ni slika').toString('base64') }] }))).status, 400, 'status');
  });
  await test('open-dispute: tuj uporabnik -> 403', async () => {
    const t = await seedTx(); eq((await api('POST', `/api/orders/${t.id}/open-dispute`, other.token, openBody())).status, 403, 'status');
  });
  await test('open-dispute: zakljuceno narocilo -> 400', async () => {
    const t = await seedTx({ status: 'COMPLETED', payout_status: 'releasable' }); eq((await api('POST', `/api/orders/${t.id}/open-dispute`, buyer.token, openBody())).status, 400, 'status');
  });
  await test('open-dispute: posiljka se ni poslana (HELD_IN_ESCROW, dostava) -> 400', async () => {
    const t = await seedTx({ status: 'HELD_IN_ESCROW' }); eq((await api('POST', `/api/orders/${t.id}/open-dispute`, buyer.token, openBody())).status, 400, 'status');
  });
  await test('open-dispute: "ni prispelo" prezgodaj -> 400', async () => {
    const t = await seedTx({ shipped_at: new Date().toISOString() });
    eq((await api('POST', `/api/orders/${t.id}/open-dispute`, buyer.token, { reason, kind: 'not_received' })).status, 400, 'status');
  });
  await test('open-dispute: rok 3 dni po dostavi potekel -> 400 brez osirotelih fotografij', async () => {
    const t = await seedTx({ status: 'DELIVERED', auto_complete_at: new Date(Date.now() - 1000).toISOString() });
    eq((await api('POST', `/api/orders/${t.id}/open-dispute`, buyer.token, openBody())).status, 400, 'status');
    const [files] = await (await import('../../src/lib/firebase-admin')).getAdminStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app').getFiles({ prefix: `dispute-evidence/${t.id}/` });
    eq(files.length, 0, 'stevilo naloženih datotek');
  });

  // ---- Uspesen spor, pošiljanje
  const shipped = await seedTx();
  await test('open-dispute: uspesen spor pri posiljki', async () => {
    const r = await api('POST', `/api/orders/${shipped.id}/open-dispute`, buyer.token, openBody());
    eq(r.status, 200, 'status');
    const tx = (await adminDb.collection('transactions').doc(shipped.id).get()).data()!;
    eq(tx.status, 'DISPUTED', 'status narocila'); eq(tx.payout_status, 'frozen', 'payout_status');
    eq((tx.buyer_dispute_photos || []).length, 1, 'stevilo fotografij');
    const d = await adminDb.collection('disputes').where('order_id', '==', shipped.id).get();
    eq(d.size, 1, 'stevilo sporov');
  });
  await test('confirm-receipt: v sporu ni mogoce potrditi', async () => {
    eq((await api('POST', '/api/auctions/confirm-receipt', buyer.token, { auction_id: shipped.auctionId, acknowledged: true })).status, 400, 'status');
  });
  await test('resolve-dispute: ne-admin -> 403', async () => {
    eq((await api('POST', `/api/admin/orders/${shipped.id}/resolve-dispute`, buyer.token, { decision: 'release_to_seller' })).status, 403, 'status');
  });
  await test('resolve-dispute: sprostitev prodajalcu -> COMPLETED + releasable', async () => {
    const r = await api('POST', `/api/admin/orders/${shipped.id}/resolve-dispute`, admin.token, { decision: 'release_to_seller', note: 'test' });
    eq(r.status, 200, 'status ' + JSON.stringify(r.body));
    const tx = (await adminDb.collection('transactions').doc(shipped.id).get()).data()!;
    eq(tx.status, 'COMPLETED', 'status narocila'); eq(tx.payout_status, 'releasable', 'payout_status');
    const d = await adminDb.collection('disputes').where('order_id', '==', shipped.id).get();
    eq(d.docs[0].data().status, 'RESOLVED', 'status spora');
  });
  await test('open-dispute: po zakljucku ni vec mogoce', async () => {
    eq((await api('POST', `/api/orders/${shipped.id}/open-dispute`, buyer.token, openBody())).status, 400, 'status');
  });

  // ---- Osebni prevzem
  const pickup = await seedTx({ status: 'HELD_IN_ESCROW', delivery_method: 'pickup', shipping_type: null, shipped_at: null });
  await test('pickup: "ni prispelo" ni dovoljeno', async () => {
    eq((await api('POST', `/api/orders/${pickup.id}/open-dispute`, buyer.token, { reason, kind: 'not_received' })).status, 400, 'status');
  });
  await test('pickup: spor pred predajo z dokazi -> 200', async () => {
    const r = await api('POST', `/api/orders/${pickup.id}/open-dispute`, buyer.token, openBody());
    eq(r.status, 200, 'status ' + JSON.stringify(r.body));
    const tx = (await adminDb.collection('transactions').doc(pickup.id).get()).data()!;
    eq(tx.status, 'DISPUTED', 'status'); eq(tx.payout_status, 'frozen', 'payout_status');
  });

  // ---- Potrditev prejema
  const conf = await seedTx({ status: 'DELIVERED', auto_complete_at: new Date(Date.now() + 86400000).toISOString() });
  await test('confirm-receipt: brez izjave -> 400', async () => {
    eq((await api('POST', '/api/auctions/confirm-receipt', buyer.token, { auction_id: conf.auctionId })).status, 400, 'status');
  });
  await test('confirm-receipt: z izjavo -> COMPLETED + dokaz', async () => {
    const r = await api('POST', '/api/auctions/confirm-receipt', buyer.token, { auction_id: conf.auctionId, acknowledged: true });
    eq(r.status, 200, 'status ' + JSON.stringify(r.body));
    const tx = (await adminDb.collection('transactions').doc(conf.id).get()).data()!;
    eq(tx.status, 'COMPLETED', 'status'); eq(tx.payout_status, 'releasable', 'payout_status');
    eq(!!tx.receipt_confirmation?.at, true, 'receipt_confirmation');
  });
  await test('open-dispute: po potrditvi prejema -> 400', async () => {
    eq((await api('POST', `/api/orders/${conf.id}/open-dispute`, buyer.token, openBody())).status, 400, 'status');
  });

  // ---- Stripe testni nacin: vracilo kupcu
  await test('resolve-dispute: vracilo kupcu (Stripe test) -> REFUNDED', async () => {
    if (!sk) skip('STRIPE_SECRET_KEY ni nastavljen');
    const stripe = new Stripe(sk);
    let pi: Stripe.PaymentIntent;
    try {
      const acct = await stripe.accounts.create({
        type: 'custom', country: 'SI', email: seller.email,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        business_profile: { mcc: '5734', url: 'https://accessible.stripe.com', product_description: 'Test' },
        tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
        individual: { first_name: 'Test', last_name: 'Prodajalec', email: seller.email, dob: { day: 1, month: 1, year: 1990 }, address: { line1: 'Testna 1', city: 'Maribor', postal_code: '2000', country: 'SI' }, phone: '+38640123456' },
        external_account: { object: 'bank_account', country: 'SI', currency: 'eur', account_number: 'SI56263300012039086' } as any
      });
      pi = await stripe.paymentIntents.create({
        amount: 10500, currency: 'eur', payment_method: 'pm_card_visa', confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        application_fee_amount: 1000, transfer_data: { destination: acct.id }
      });
    } catch (e: any) { skip('Stripe priprava ni uspela: ' + String(e.message).slice(0, 300)); }
    eq(pi.status, 'succeeded', 'PaymentIntent');
    const t = await seedTx({ stripe_payment_intent_id: pi.id });
    const o = await api('POST', `/api/orders/${t.id}/open-dispute`, buyer.token, openBody());
    eq(o.status, 200, 'odprtje spora');
    const r = await api('POST', `/api/admin/orders/${t.id}/resolve-dispute`, admin.token, { decision: 'refund_buyer', note: 'test' });
    eq(r.status, 200, 'resolve ' + JSON.stringify(r.body));
    const tx = (await adminDb.collection('transactions').doc(t.id).get()).data()!;
    eq(tx.status, 'REFUNDED', 'status'); eq(tx.payout_status, 'refunded', 'payout_status');
  });

  // ---- Chargeback webhooki (podpisani testni dogodki)
  const whStripe = new Stripe(sk || 'sk_test_dummy');
  async function webhook(type: string, obj: any, badSig = false) {
    const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), object: 'event', type, data: { object: obj } });
    const header = badSig ? 't=1,v1=abc' : whStripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_local' });
    const r = await fetch(base + '/api/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload });
    return r.status;
  }
  const dsp = (pi: string, status = 'needs_response') => ({ id: 'dp_' + pi, object: 'dispute', payment_intent: pi, charge: 'ch_' + pi, amount: 10500, reason: 'fraudulent', status, evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86400 } });
  await test('webhook: napacen podpis -> 400', async () => { eq(await webhook('charge.dispute.created', dsp('pi_x'), true), 400, 'status'); });
  await test('chargeback odprt: izplacilo zamrznjeno + opozorilo', async () => {
    const t = await seedTx({ stripe_payment_intent_id: 'pi_cb1', status: 'COMPLETED', payout_status: 'releasable' });
    eq(await webhook('charge.dispute.created', dsp('pi_cb1')), 200, 'status');
    const tx = (await adminDb.collection('transactions').doc(t.id).get()).data()!;
    eq(tx.payout_status, 'frozen', 'payout_status'); eq(tx.chargeback_open, true, 'chargeback_open');
    eq((await adminDb.collection('admin_alerts').doc('chargeback_dp_pi_cb1').get()).exists, true, 'opozorilo');
  });
  await test('chargeback dobljen: izplacilo spet releasable', async () => {
    eq(await webhook('charge.dispute.closed', dsp('pi_cb1', 'won')), 200, 'status');
    const t = (await adminDb.collection('transactions').where('stripe_payment_intent_id', '==', 'pi_cb1').get()).docs[0].data();
    eq(t.payout_status, 'releasable', 'payout_status'); eq(t.chargeback_open, false, 'chargeback_open');
  });
  await test('chargeback izgubljen pred izplacilom: vracilo in status REFUNDED', async () => {
    const t = await seedTx({ stripe_payment_intent_id: 'pi_cb2', payout_status: 'held', status: 'HELD_IN_ESCROW' });
    await webhook('charge.dispute.created', dsp('pi_cb2'));
    eq(await webhook('charge.dispute.closed', dsp('pi_cb2', 'lost')), 200, 'status');
    const tx = (await adminDb.collection('transactions').doc(t.id).get()).data()!;
    eq(tx.status, 'REFUNDED', 'status'); eq(tx.payout_status, 'refunded', 'payout_status');
  });
  await test('chargeback po izplacilu: dolg prodajalca + blokada izplacil', async () => {
    const t = await seedTx({ stripe_payment_intent_id: 'pi_cb3', payout_status: 'paid_out', status: 'COMPLETED' });
    await webhook('charge.dispute.created', dsp('pi_cb3'));
    const a = (await adminDb.collection('admin_alerts').doc('chargeback_dp_pi_cb3').get()).data()!;
    eq(a.already_paid_out, true, 'already_paid_out');
    eq(await webhook('charge.dispute.closed', dsp('pi_cb3', 'lost')), 200, 'status');
    const s = (await adminDb.collection('users').doc(seller.uid).get()).data()!;
    eq(s.chargeback_debt_cents, 10500, 'chargeback_debt_cents');
  });

  // ---- Ponastavitev testnih podatkov
  await test('reset: brez ALLOW_TEST_DATA_RESET -> 403', async () => {
    delete process.env.ALLOW_TEST_DATA_RESET;
    eq((await api('POST', '/api/admin/reset-test-data', admin.token, { groups: ['orders'], dryRun: true })).status, 403, 'status');
  });
  await test('reset: ne-admin -> 403', async () => {
    process.env.ALLOW_TEST_DATA_RESET = 'true';
    eq((await api('POST', '/api/admin/reset-test-data', buyer.token, { groups: ['orders'], dryRun: true })).status, 403, 'status');
  });
  await test('reset: brez besede IZBRIŠI -> 400', async () => {
    eq((await api('POST', '/api/admin/reset-test-data', admin.token, { groups: ['orders'] })).status, 400, 'status');
  });
  await test('reset: izbris naročil in uporabnikov, admin ostane', async () => {
    const dry = await api('POST', '/api/admin/reset-test-data', admin.token, { groups: ['orders', 'users'], dryRun: true });
    eq(dry.status, 200, 'dryRun ' + JSON.stringify(dry.body));
    const r = await api('POST', '/api/admin/reset-test-data', admin.token, { groups: ['orders', 'users'], confirm: 'IZBRIŠI' });
    eq(r.status, 200, 'status ' + JSON.stringify(r.body));
    eq((await adminDb.collection('transactions').get()).size, 0, 'transakcije');
    eq((await adminDb.collection('users').doc(buyer.uid).get()).exists, false, 'kupec izbrisan');
    eq((await adminDb.collection('users').doc(admin.uid).get()).exists, true, 'admin ostane');
  });

  server.close();
  const lines = results.map(r => `${r.status === 'PASS' ? 'PASS' : r.status === 'SKIP' ? 'SKIP' : 'FAIL'} | ${r.name}${r.detail ? '\n      ' + r.detail : ''}`);
  const summary = `Skupaj: ${results.length}, PASS ${results.filter(r => r.status === 'PASS').length}, FAIL ${results.filter(r => r.status === 'FAIL').length}, SKIP ${results.filter(r => r.status === 'SKIP').length}`;
  const report = lines.join('\n') + '\n\n' + summary + '\n';
  console.log(report);
  fs.writeFileSync('e2e-report.txt', report);
  process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0);
}
main().catch(e => { console.error(e); fs.writeFileSync('e2e-report.txt', 'KRITIČNA NAPAKA: ' + String(e?.stack || e).slice(0, 3000)); process.exit(2); });
