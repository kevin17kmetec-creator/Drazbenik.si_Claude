import 'dotenv/config';
import fs from 'fs';
import Stripe from 'stripe';

// Deutscher Kommentar: Laedt die Umgebungsvariablen aus .env.local, falls die Datei existiert
if (fs.existsSync('.env.local')) {
  const envConfig = fs.readFileSync('.env.local', 'utf8');
  for (const line of envConfig.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...vals] = trimmed.split('=');
      const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
      if (key.trim() && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

// Deutscher Kommentar: Ueberpruefung des geheimen Schluessels auf Testmodus
const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey || !secretKey.startsWith('sk_test_')) {
  console.error('NAPAKA: STRIPE_SECRET_KEY mora obstajati in se začeti z sk_test_');
  process.exit(1);
}

// Deutscher Kommentar: Initialisierung des Stripe-Clients
const stripe = new Stripe(secretKey);

// Deutscher Kommentar: Verarbeiten der Kommandozeilenargumente
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const nextArg = process.argv[i + 1];
    if (nextArg && !nextArg.startsWith('--')) {
      args[key] = nextArg;
      i++;
    } else {
      args[key] = true;
    }
  }
}

async function run() {
  // Deutscher Kommentar: Modus zum Ueberpruefen des Transaktionsstatus und der Betragsaufteilung
  if (args.check) {
    let targetId = args.check;
    console.log(`Preverjanje stanja za ID: ${targetId}`);
    try {
      let paymentIntentId = targetId;
      if (targetId.startsWith('cs_')) {
        const sessionObj = await stripe.checkout.sessions.retrieve(targetId);
        if (sessionObj.payment_intent) {
          paymentIntentId = typeof sessionObj.payment_intent === 'string'
            ? sessionObj.payment_intent
            : sessionObj.payment_intent.id;
        } else {
          console.log(`Status seje: ${sessionObj.status}`);
          console.log(`Plačilni namen za to sejo še ni bil ustvarjen v vmesniku.`);
          console.log('\nPREIZKUS NI USPEL: Plačilni namen ni bil ustvarjen.');
          return;
        }
      }

      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      console.log(`Status plačilnega namena: ${pi.status}`);
      console.log(`Skupni znesek: ${pi.amount} centov (${(pi.amount / 100).toFixed(2)} €)`);
      console.log(`Provizija platforme (application_fee_amount): ${pi.application_fee_amount ?? 'ni nastavljena'} centov`);
      console.log(`Ciljni račun (transfer_data.destination): ${pi.transfer_data?.destination ?? 'ni nastavljen'}`);

      const latestChargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
      console.log(`Zadnje dobroimetje/bremenitev (latest_charge): ${latestChargeId ?? 'ni še ustvarjeno'}`);

      let transferObj = null;
      let appFeeObj = null;

      if (latestChargeId) {
        const charge = await stripe.charges.retrieve(latestChargeId);
        if (charge.transfer) {
          const transferId = typeof charge.transfer === 'string' ? charge.transfer : charge.transfer.id;
          transferObj = await stripe.transfers.retrieve(transferId);
          console.log(`Nakazilo na povezan račun (transfer ID): ${transferObj.id}`);
          console.log(`Znesek nakazila na povezan račun: ${transferObj.amount} centov`);
          console.log(`Ciljni račun nakazila: ${transferObj.destination}`);
        }

        if (charge.application_fee) {
          const feeId = typeof charge.application_fee === 'string' ? charge.application_fee : charge.application_fee.id;
          appFeeObj = await stripe.applicationFees.retrieve(feeId);
          console.log(`Uveljavljena provizija (application_fee ID): ${appFeeObj.id}`);
          console.log(`Znesek uveljavljene provizije: ${appFeeObj.amount} centov`);
        }
      }

      const appFeeCents = appFeeObj ? appFeeObj.amount : (pi.application_fee_amount || 0);
      const netSellerCents = (transferObj ? transferObj.amount : pi.amount) - appFeeCents;

      console.log(`\nIzračunana razdelitev: Net prodajalcu = ${netSellerCents} centov (${(netSellerCents / 100).toFixed(2)} €), Provizija platforme = ${appFeeCents} centov (${(appFeeCents / 100).toFixed(2)} €)`);

      if (pi.status === 'succeeded' && netSellerCents === 9000 && appFeeCents === 1000) {
        console.log('\nPREIZKUS USPEL');
      } else if (pi.status !== 'succeeded') {
        console.log(`\nPREIZKUS NI USPEL: Plačilni namen je v stanju '${pi.status}' in še ni zaključen.`);
      } else {
        console.log(`\nPREIZKUS NI USPEL: Razdelitev ne ustreza pričakovanim 90,00 € za prodajalca in 10,00 € provizije.`);
      }
    } catch (err) {
      console.error(`Napaka pri preverjanju: ${err.message}`);
      console.log('\nPREIZKUS NI USPEL');
    }
    return;
  }

  // Deutscher Kommentar: Modus zum Simulieren von Kunden-Guthaben (Finanzierung)
  if (args.fund) {
    const customerId = args.fund;
    const amount = parseInt(args.amount || '10000', 10);
    let reference = args.reference;

    if (!reference) {
      try {
        const instructions = await stripe.customers.retrieveFundingInstructions(customerId, {
          bank_transfer: { type: 'eu_bank_transfer' },
          currency: 'eur',
        });
        const bt = instructions.funding_instructions?.bank_transfer;
        reference = bt?.financial_addresses?.[0]?.supported_networks?.[0] || bt?.reference;
      } catch (e) {
        // Deutscher Kommentar: Falls retrieveFundingInstructions fehlschlaegt, wird keine Referenz angegeben
      }
    }

    console.log(`Simulacija SEPA nakazila za kupca: ${customerId}`);
    console.log(`Znesek: ${amount} centov (${(amount / 100).toFixed(2)} €)`);
    if (reference) {
      console.log(`Referenca: ${reference}`);
    }

    try {
      const fundParams = { amount, currency: 'eur' };
      if (reference) {
        fundParams.reference = reference;
      }
      const res = await stripe.testHelpers.customers.fundCashBalance(customerId, fundParams);
      console.log(`Dobroimetje uspešno dodano kupcu! Stanje:`);
      console.log(JSON.stringify(res, null, 2));
    } catch (err) {
      console.error(`Napaka pri simulaciji nakazila: ${err.message}`);
    }
    return;
  }

  // Deutscher Kommentar: Hauptablauf: Erstellung von Kunde, Zielkonto und Checkout-Session
  console.log('--- Zapenjanje preizkusa SEPA razdelitve zneska in provizije ---');

  // Deutscher Kommentar: Schritt 1: Erstellung eines Test-Kunden
  let customer;
  try {
    customer = await stripe.customers.create({ email: 'sepa-test@example.com' });
    console.log(`1. Ustvarjen testni kupec: ${customer.id}`);
  } catch (err) {
    console.error(`Napaka pri ustvarjanju kupca: ${err.message}`);
    process.exit(1);
  }

  // Deutscher Kommentar: Schritt 2: Verknuepftes Verkaeuferkonto bestimmen oder erstellen
  let destination = args.destination;
  if (!destination) {
    console.log('\nNAVODILO / OPOZORILO: Za uporabo obstoječega računa prodajalca iz nadzorne plošče navedite argument --destination acct_xxx.');
    console.log('Ustvarjam nov testni povezan račun prodajalca za ta preizkus...');
    try {
      const account = await stripe.accounts.create({
        type: 'custom',
        country: 'DE',
        business_type: 'individual',
        individual: {
          first_name: 'Test',
          last_name: 'Seller',
          dob: { day: 1, month: 1, year: 1990 },
          address: { line1: 'Test Str. 1', city: 'Berlin', postal_code: '10115', country: 'DE' },
        },
        external_account: 'btok_de',
        capabilities: {
          transfers: { requested: true },
        },
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: '127.0.0.1',
        },
      });
      destination = account.id;
      console.log(`2. Ustvarjen testni povezan račun prodajalca: ${destination}`);
    } catch (err) {
      console.error(`Napaka pri ustvarjanju povezanega računa: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log(`2. Uporabljen navedeni povezan račun prodajalca: ${destination}`);
  }

  // Deutscher Kommentar: Schritt 3: Erstellung der Checkout-Session fuer SEPA-Auszahlung
  console.log('\n3. Ustvarjam Checkout sejo za SEPA nakazilo s transfer_data in application_fee_amount...');
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customer.id,
      payment_method_types: ['customer_balance'],
      payment_method_options: {
        customer_balance: {
          funding_type: 'bank_transfer',
          bank_transfer: {
            type: 'eu_bank_transfer',
            eu_bank_transfer: { country: 'DE' },
          },
        },
      },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'SEPA Test Predmet' },
            unit_amount: 10000, // 100,00 €
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: 1000, // 10,00 €
        transfer_data: {
          destination: destination,
        },
      },
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
    });

    console.log('\nCheckout seja je bila USPEŠNO ustvarjena!');
    console.log(`Session ID: ${session.id}`);
    console.log(`Session URL: ${session.url}`);
    console.log(`Payment Intent ID: ${session.payment_intent ?? '(se ustvari ob odprtju vmesnika / plačilu)'}`);
    console.log(`Customer ID: ${customer.id}`);

    console.log('\n--- NAVODILA ZA NASLEDNJE KORAKE ---');
    console.log(`1. Za simulacijo prispelega SEPA nakazila v testnem okolju izvedite:`);
    console.log(`   node scripts/test-sepa-split.mjs --fund ${customer.id} --amount 10000`);
    console.log(`2. Po opravljenem nakazilu preverite pravilnost razdelitve z ukazom:`);
    console.log(`   node scripts/test-sepa-split.mjs --check ${session.payment_intent || session.id}`);
  } catch (err) {
    console.error('\nREZULTAT PREIZKUSA: Izvajalnik plačil je vrnil napako!');
    console.error(`Koda napake: ${err.code || 'brez_kode'}`);
    console.error(`Sporočilo napake: ${err.message}`);
    console.log('\nRazlaga: Kombinacija customer_balance z application_fee_amount in transfer_data ni podprta s strani plačilnega partnerja ali pa zahteva specifično konfiguracijo računa.');
  }
}

run();
