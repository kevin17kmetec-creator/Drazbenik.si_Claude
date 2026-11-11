# READ – stanje platforme pred prenovo v „samo zasebni prodajalci“

Dokument je napisan za bralca brez zgodovine pogovora. Vsebuje, kaj ta kopija vsebuje, kako deluje denarni tok in katere odločitve so bile sprejete.

## 1. Kaj je ta mapa

- Točna kopija vseh sledenih datotek repozitorija `Drazbe.si-Novi-` na stanju commita `f38b4d932ca78855cd630846d5866f738a61fdd9` (21. 10. 2026, ob tem commitu so vsa izvorna koda in konfiguracija, brez `node_modules`, `dist` in skrivnosti).
- Mapa je izključena iz tipske kontrole (`tsconfig.json` → `exclude: archive`) in iz Vercel deploya (`.vercelignore`). Nič ne vpliva na delovanje strani.
- Obnova: kopiraj vsebino mape čez koren repozitorija (`cp -r archive/drazbe-novi/. .`) ali uporabi `git checkout f38b4d9 -- .`.
- Redizajn (paper tema, Fraunces in Schibsted Grotesk, lastne ikone) je v ločenem repozitoriju `Drazbenik.si_Claude`; ta kopija je še pred njim.

## 2. Tehnični sklad

React 19/Vite + Tailwind v4 (frontend), Express v `src/server/app.ts` (~11.500 vrstic, strežnik in API), Firebase (Firestore, Auth, Storage), Stripe Connect (Express računi) za plačila, Resend za e-pošto, Vercel za gostovanje (`api/_app.cjs` nastane z `npm run build`). Pravila Firestore in Storage: `security/`.

## 3. Denarni tok (preverjeno iz kode in Stripe nadzorne plošče 21. 10. 2026)

1. Kupec plača kartico (ali bančno nakazilo prek Stripe) na **platformi** (`create-checkout-session`, `create-payment-intent`). Uporabljen je **destination charge**: `application_fee_amount` (provizija + DDV na provizijo) in `transfer_data.destination` (prodajalčev Express račun), `transfer_group: auction_<id>`; `on_behalf_of` ni uporabljen.
2. Sredstva se takoj pripišejo **saldu prodajalčevega povezanega računa**. Račun ima urnik izplačil `Manual – 7 day rolling` in samo zmožnosti Payouts in Transfers (nima `card_payments`).
3. V Express nadzorni plošči so **izklopljene** funkcije Manual payouts, Edit payout schedule, View payments, Issue refunds, Manage disputes. Prodajalec zato **ne more** sam izplačati, vračati ali urejati urnika. Zadržek je tako dejansko izveden pri Stripe, ne samo v Firebase.
4. Izplačilo sproži izključno strežnik (`stripe.payouts.create(..., { stripeAccount })`, `executeSellerBatchPayout`, okoli vrstice 1573 v `app.ts`), ko je transakcija `releasable`.
5. Platforma nosi chargeback in vračila za te plačila (lastnost destination charges po dokumentaciji Stripe).

Polje `payout_status` v kolekciji `transactions` je samo evidenca: `held` → `releasable` → `payout_pending` → `paid_out`; stranske veje: `frozen`, `refunded`. Samo po sebi ne zadrži denarja.

Pravila časov (`src/server/escrowConfig.ts`): rok odpreme 7 dni (opomniki 3. in 6. dan), samodejna sprostitev 7 dni po odpremi (14 za tujino), obvestilo kupcu 48 h pred sprostitvijo, opozorilo o zadržku po 60 dneh, trda meja 75 dni, najmanjše izplačilo 10 €, samodejno izplačilo po 30 dneh, največ 5 poskusov izplačila.

Interna denarnica (`walletService.ts`, polja `available_cents`) je **onemogočena**: `wallet-pay-auction` in `wallet-pay-subscription` vračata 410, v vmesniku ni več denarnice.

## 4. Provizije in računi

- Provizijo plača **kupec povrh cene**, stopnje po naročniškem paketu kupca (Free 10/6/4,5 %, Basic 7/5/4 %, Pro 5/4/3,2 % pri ≤1000 / 1000–5000 / >5000 €), najmanj 1 €. DDV 22 % na provizijo; reverse charge za podjetja v EU z veljavnim VIES, brez DDV zunaj EU (`src/lib/feeCalculator.ts`, `taxLogic.ts`).
- Naročnine: Basic 20 €, Pro 50 €; limit oglasov na cikel 5 / 20 / neomejeno.
- Računi: platforma izda račun za prodajo v imenu in za račun prodajalca (pogoji 12.1) ter svoj račun za provizijo. Podatki o dokumentih so v kolekcijah `documents`, `accounting_documents` (`/api/invoices/*`, `/api/admin/accounting/*`, `AccountingView.tsx`).
- Poslovni uporabniki: `user_type === 'business'`, `company_name`, `tax_id`/`vat_id`, preverjanje VIES (`getBuyerTaxContext`, ~vrstice 215–400 v `app.ts`).

## 5. Pomembne kolekcije Firestore

`users`, `auctions`, `auctions_private`, `transactions`, `transaction_secrets`, `documents`, `accounting_documents`, `disputes`, `reviews`, `messages`, `conversations`, `notifications`, `seller_strikes`, `identity_locks`, `terms_acceptances`, `admin_alerts`, `admin_logs`, `aml_reservations`, `wallet_transactions` (legacy), `packages`, `public_profiles`.

## 6. Cron in ključne poti

`/api/cron/check-auctions` (zaključek dražb), `process-shipping-deadlines`, `process-escrow-completions`, `process-subscription-renewals`, `reconcile-bank-transfers`. Spori: `/api/orders/:id/open-dispute`, `/api/admin/orders/:id/resolve-dispute`. Prevzem: `pickup-pin`, `verify-pickup-pin`, `verify-pickup-qr`. Webhook Stripe: `/api/webhook`.

## 7. Pravna besedila

`src/lib/legalTexts.ts` (impressum, zasebnost, piškotki; ZADNJA POSODOBITEV 13. 10. 2026), `legalTextsEn.ts`, `legalTextsDe.ts`, splošni pogoji in navodila v `src/lib/translations.ts` (`termsText`, `howText`). Različica pogojev: **2026-10-v2** (ostane, dokler lastnik ne odloči drugače). Operater: Dizain d.o.o., Maribor.

## 8. Odločitve 21. 10. 2026 (pogovor z lastnikom)

- **Zagon samo z zasebniki**; podjetja (računi, DDV, VIES, tip prodajalca) se ob zagonu ne uporabljajo. Status se hrani pri vsakem uporabniku.
- Sum, da je zasebnik v resnici trgovec: samodejno opozorilo in ročni pregled (admin).
- Pooblastilo prodajalca platformi za naročanje izplačila in vračila: besedilo se pripravi za pregled, **verzija pogojev ostane 2026-10-v2**.
- Tveganje zadrževanja denarja ob zagonu sprejeto; pravna presoja po ZPlaSSIED (čl. 3 in 5) ostaja odprta (vprašanje za odvetnika / Banko Slovenije).
- Plačilni ponudnik: najprej raziskovanje Mollie in Payaut, kode plačil se ne spreminja.
- Odprta točka DAC7: poročanje FURS za prodajalce z ≥30 prodajami ali >2.000 € letno; zbiranje podatkov od začetka, registracija na eDavki je ročna naloga lastnika.

## 9. Odprta vprašanja (pravna)

1. Ali je zadržanje izplačil pri destination charges „nadzor nad sredstvi“ po ZPlaSSIED čl. 5; velja kakšna izjema iz čl. 3?
2. Besedilo čl. 8 direktive 2024/2853 (rok prenosa 9. 12. 2026) glede zasebnih prodajalcev.
3. Ali je potrebna dodatna razkritja po ZVPot-1 čl. 50 in 131 (status prodajalca, razdelitev obveznosti).

## 10. Posebnosti kode

- `AGENTS.md`: iskati `TESTPHASE` v `src/server/app.ts` in `CreateAuctionForm.tsx` (začasno odstranjena omejitev trajanja dražb 3–14 dni).
- Komentarji v kodi so po dogovoru izključno v nemščini; sporočila uporabnikom v slovenščini z EN/DE v `src/lib/uiCatalog.ts`.

## 11. Spremembe po arhivu (21. 10. 2026, zasebni uporabniki; popravek istega dne: kartica 500 €, 3D Secure vedno, novi prodajalci do 500 € na dražbo, podjetja izklopljena z `BUSINESS_USERS_ENABLED=false` v `src/lib/featureFlags.ts`, povpraševanje o nepremičninah prek `/api/real-estate-inquiry`)

Ta mapa je stanje PRED temi spremembami. Spremembe v živi kodi:

- Starost: obvezna letnica rojstva (`birth_year`, nespremenljiva po prvem vnosu), minimum 16 let (`MIN_USER_AGE` v `escrowConfig.ts`); preverjanje v `assertVerifiedUser` (ponudbe, objava, plačilo, izplačilo) in v `/api/profile/update`.
- Kartica do 500 € skupnega zneska za kupca (`CARD_MAX_AMOUNT_CENTS` v `src/lib/bankTransfer.ts`); nad tem samo bančno nakazilo (checkout in payment intent zavrneta kartico; ponovitev nakazila je nad limitom dovoljena).
- Nepremičnine: strežnik zavrne objavo (`REAL_ESTATE_NOT_ALLOWED`), obrazec prikaže opozorilo; povpraševanje je ročni proces.
- Vozila (`src/lib/restrictedListings.ts`): samo osebni prevzem (`pickup_only` vsiljen na strežniku), PIN, `auto_release_at = null` (brez samodejne sprostitve).
- Pogoji (SL/EN/DE): točke 1.3, 4.6, 7.5, 7.10 in odstavek v navodilih; verzija ostaja 2026-10-v2.
- Obnova poslovnih uporabnikov: koda je še v repozitoriju (`user_type === 'business'`), v tej seji je bilo samo odločeno, da se ob zagonu ne uporablja; skritje za zastavico še ni narejeno.
- Chargebacki: `charge.dispute.created` zamrzne izplačilo, `charge.dispute.closed` ga sprosti (won) ali zapiše dolg prodajalca `chargeback_debt_cents` (lost, izplačilo že opravljeno). Izplačila so blokirana ob dolgu ali odprtem sporu. Dnevni opomnik: `/api/cron/chargeback-reminders` (06:00 UTC, vercel.json). Admin: `/api/admin/me` (strežnik odloča, ali je uporabnik admin; ADMIN_UIDS ni vidna odjemalcu).
- Spori: kupec odpre spor z opisom razlike in fotografijami (do 5, `dispute-evidence/` v Storage), pri osebnem prevzemu tudi v stanju HELD_IN_ESCROW; admin: zavihka Spori (filtri status/vrsta/iskanje) in Opozorila (`/api/admin/alerts`, odprti chargebacki, dolgovi).
- Dokazi za spore: zbirka `evidence_log` (samo strežnik, hramba 18 mesecev, čiščenje v dnevnem cronu) beleži IP, napravo in čas ob prvi ponudbi, začetku plačila, ogledu in potrditvi PIN-a ter potrditvi prejema. Potrditev prejema zahteva izjavo (`acknowledged`), shrani `receipt_confirmation` (ujemanje IP/naprave) in pošlje e-pošto kupcu. Ob `charge.dispute.created` se paket dokazov sestavi in kot osnutek naloži v Stripe (`buildChargebackEvidence`); admin ga odda z gumbom v zavihku Opozorila.

- 22. 10. 2026: Pogoji, politika zasebnosti in piškotki posodobljeni (SL/EN/DE): letnica rojstva, najnižja starost 16, samo zasebne osebe, prag 10.000 €, izjava ob potrditvi prejema, nepremičninska povpraševanja, spori in dokazi (hramba 18 mesecev), kamera, ključa language in pending_prevzem_qr. Odvetnik naj preveri: hramba IP 18 mesecev, privolitev staršev, točka 3.5 (sum trgovca).

- 22. 10. 2026: Pregled sporov (koda, brez živega Stripe/Firebase): odpravljeni napaki: (1) odprtje spora je naložilo fotografije še pred zavrnitvijo (osirotele datoteke), (2) odločitev »sprosti prodajalcu« je pustila naročilo v statusu DISPUTED in ni sprožila COMPLETED/ocene/e-pošte. Dodano polje letnice rojstva v nastavitvah.

- 22. 10. 2026: E2E testi sporov (`tests/e2e/disputes.ts`, workflow `.github/workflows/e2e-disputes.yml`): Firebase emulator (nikoli produkcija) + Stripe testni način (secret `STRIPE_SECRET_KEY`, sk_test_). Zagon: GitHub → Actions → »E2E spori« → Run workflow; rezultat se zapiše v vejo `results-<številka>` (datoteka e2e-report.txt). Stanje: 25/25 PASS (validacije, osebni prevzem, potrditev prejema, sprostitev, vračilo prek Stripe, chargeback webhooki).
