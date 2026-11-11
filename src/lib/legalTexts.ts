// Deutscher Kommentar: Rechtliche Texte (nur slowenische Fassung ist verbindlich), zentral gepflegt fuer Footer, Cookie-Hinweis und Modals
import { PLATFORM_COMPANY } from './platformCompany';

const LAST_UPDATE = '27. 10. 2026';

export const IMPRINT_TEXT = `PODATKI O PONUDNIKU STORITEV

Ponudnik storitev informacijske družbe (platforma dražbenik.si):
${PLATFORM_COMPANY.name}
${PLATFORM_COMPANY.address}
Slovenija

Matična številka: ${PLATFORM_COMPANY.registrationNumber}
ID za DDV: ${PLATFORM_COMPANY.vatId}
E-pošta za splošna vprašanja, pritožbe in uveljavljanje pravic: info@drazbenik.si

Vloga platforme
Dražbenik.si je spletni posrednik, ki povezuje prodajalce in kupce. Pogodba o nakupu predmeta se sklene neposredno med prodajalcem in kupcem. Pri nakupu od zasebne osebe pravice potrošnika (npr. pravica do odstopa od pogodbe) ne veljajo; pri nakupu od poslovnega prodajalca veljajo pravice potrošnika po Zakonu o varstvu potrošnikov.

Kontaktna točka (Akt o digitalnih storitvah, uredba (EU) 2022/2065)
Za stike z organi držav članic, Komisijo in uporabniki platforme je določena kontaktna točka: info@drazbenik.si. Komuniciramo v slovenščini in angleščini.

Prijava nezakonitih vsebin
Nezakonito vsebino lahko prijavite prek povezave "Obvestila o nezakonitih vsebinah" v nogi spletne strani. Vsako prijavo obravnavamo brez nepotrebnega odlašanja in prijavitelja ter prizadetega uporabnika obvestimo o odločitvi.

Izvensodno reševanje potrošniških sporov
Potrošnik se lahko za izvensodno rešitev spora obrne na pristojni izvajalec izvensodnega reševanja potrošniških sporov v Republiki Sloveniji (seznam objavlja Ministrstvo za gospodarstvo, turizem in šport oz. Tržni inšpektorat RS). Evropska platforma za spletno reševanje sporov (ODR) je s 20. 7. 2025 ukinjena.

Nadzorni organi
Tržni inšpektorat Republike Slovenije (potrošniška zakonodaja), Informacijski pooblaščenec (varstvo osebnih podatkov).`;

export const PRIVACY_TEXT = `POLITIKA ZASEBNOSTI IN VARSTVO OSEBNIH PODATKOV (GDPR)
Zadnja posodobitev: ${LAST_UPDATE}

1. Upravljavec
Upravljavec osebnih podatkov je ${PLATFORM_COMPANY.name}, ${PLATFORM_COMPANY.address}, matična številka ${PLATFORM_COMPANY.registrationNumber}, ID za DDV ${PLATFORM_COMPANY.vatId} (v nadaljevanju: "mi"). Vprašanja in zahteve glede osebnih podatkov nam lahko pošljete na info@drazbenik.si.

2. Katere podatke obdelujemo, zakaj in na kateri podlagi

a) Registracija in uporabniški račun
Podatki: e-poštni naslov, uporabniško ime, geslo (v obliki, ki je ne moremo prebrati) ali prijava z Google računom, ime in priimek, naslov, telefonska številka, letnica rojstva, vrsta uporabnika (ob zagonu platforme samo zasebna oseba), profilna slika.
Namen: ustvarjanje in upravljanje računa, prijava, komunikacija z vami.
Podlaga: izvajanje pogodbe (6. člen, 1. odstavek, točka b GDPR).

b) Verifikacija identitete in preprečevanje zlorab
Podatki: podatki za preverjanje identitete (rezultat preverjanja in letnica rojstva za preverjanje najnižje starosti 16 let), davčna številka (za preprečevanje zlorab hranimo samo zgoščeno, nepovratno šifrirano vrednost), podatki o neplačanih dražbah, blokadah in skupnem znesku nakupov.
Namen: preprečevanje goljufij, zlorab in večkratnih registracij, izpolnjevanje zakonskih obveznosti (npr. davčno poročanje po DAC7, točka i).
Slik osebnega dokumenta in obraza ne prejemamo in ne hranimo; preverjanje izvaja ponudnik plačilnih storitev (Stripe Identity) kot samostojni upravljavec, mi prejmemo le rezultat preverjanja. Podlaga: zakoniti interes (točka f) in zakonska obveznost (točka c). Če je račun blokiran zaradi ponavljajočih se neplačanih dražb, zgoščeno vrednost davčne številke hranimo tudi po izbrisu računa, največ 5 let od blokade.

c) Dražbe, ponudbe, sporočila in naročila
Podatki: objavljeni predmeti (slike, opisi), ponudbe, zgodovina ponudb, sporočila med uporabniki, izbira načina predaje, podatki o dostavi, ocene.
Namen: izvedba dražb, povezovanje kupcev in prodajalcev, predaja predmeta. Po zaključeni dražbi nujne kontaktne podatke in naslov za dostavo posredujemo nasprotni stranki zgolj za izvedbo nakupa.
Podlaga: izvajanje pogodbe (točka b).

d) Plačila, izplačila in računi
Podatki: znesek, način plačila, status plačila, podatki za izplačilo prodajalcu (npr. IBAN) pri ponudniku plačilnih storitev, podatki za izdajo računa, izdani računi. Podatkov o številki plačilne kartice ne prejemamo in jih ne hranimo; kartične podatke vnašate neposredno pri ponudniku plačilnih storitev.
Namen: izvedba in zavarovanje plačil (sredstva se do potrditve predaje zadržijo), izplačila prodajalcem, izdajanje računov, vodenje poslovnih knjig.
Podlaga: izvajanje pogodbe (točka b) in zakonska obveznost (točka c). Račune in računovodske listine hranimo 10 let.

e) Naročnine
Podatki: izbran paket, obdobje, znesek, račun.
Namen in podlaga: izvajanje pogodbe (točka b), zakonska obveznost (točka c).

f) Obvestila po e-pošti in v aplikaciji
Podatki: e-poštni naslov, vsebina obvestila (npr. zmaga na dražbi, plačilo, račun, rok za prevzem).
Namen: obveščanje o stanju vaših dražb in naročil. Ta sporočila so nujna za izvajanje pogodbe. Za dodatna obvestila (npr. priporočila) lahko pošiljanje izklopite v Nastavitvah.

g) Funkcije umetne inteligence (neobvezno)
Če sami izberete funkcijo "polepšaj sliko" ali samodejno branje računa za poštnino, se izbrana slika pošlje v obdelavo ponudniku storitev umetne inteligence in se uporabi samo za to funkcijo. Funkcij ni treba uporabljati. Podlaga: vaša zahteva oz. izvajanje pogodbe (točka b).

h) Varnost in delovanje strani
Podatki: tehnični podatki (IP naslov, vrsta naprave in brskalnika, čas dostopa), varnostni dnevniki, ocena tveganja storitve reCAPTCHA pri registraciji.
Namen: zagotavljanje varnosti, odpravljanje napak, zaščita pred zlorabami ter dokazovanje v primeru spora ali reklamacije pri banki (ob prvi ponudbi, plačilu, potrditvi prejema in prevzemu se zabeležita IP naslov in naprava; hramba 18 mesecev).
Podlaga: zakoniti interes (točka f).

i) Davčno poročanje operaterja platforme (DAC7)
Podatki: podatki za identifikacijo prodajalca (npr. ime, naslov, davčna številka), plačila, ki jih prodajalec prejme prek platforme, provizije, število prodaj in račun, na katerega se plačila izplačajo.
Namen: izpolnitev zakonske obveznosti operaterja platforme do poročanja Finančni upravi RS (direktiva DAC7), ki podatke lahko izmenja z davčnimi organi drugih držav članic EU.
Podlaga: zakonska obveznost (6. člen, 1. odstavek, točka c GDPR).

j) Povpraševanja za nepremičnine
Podatki: vrsta, lokacija, cena, telefonska številka in opis, ki jih vpišete v obrazec za povpraševanje, ter vaši osnovni podatki iz računa.
Namen: obravnava povpraševanja in vzpostavitev stika z vami.
Podlaga: ukrepi pred sklenitvijo pogodbe na vašo zahtevo (točka b).

k) Spori in dokazi
Podatki: opis spora, vaša besedila in fotografije, dokazila o pošiljanju, izid spora, evidenca dogodkov (čas, IP-naslov in naprava ob prvi ponudbi, plačilu, potrditvi prejema in prevzemu) ter število sporov posameznega uporabnika.
Namen: reševanje sporov med uporabniki, uveljavljanje in obramba pravnih zahtevkov, odgovor na ugovor plačila s kartico (chargeback) pri ponudniku plačilnih storitev in odkrivanje zlorab.
Podlaga: zakoniti interes (točka f) in izvajanje pogodbe (točka b).

3. Piškotki in podobne tehnologije
Uporabljamo samo nujne in funkcionalne tehnologije. Podrobnosti so v Politiki piškotkov.

4. Komu podatke posredujemo
Podatke obdelujejo naši izvajalci (obdelovalci) na podlagi pogodb o obdelavi podatkov: ponudnik gostovanja in oblačne infrastrukture (podatkovna baza, prijava, shramba datotek, gostovanje), ponudnik plačilnih storitev (plačila, izplačila prodajalcem, preverjanje identitete), ponudnik storitev e-pošte, ponudnik storitev umetne inteligence (samo ob uporabi neobveznih funkcij) in ponudnik zaščite pred zlorabami (reCAPTCHA). Konkretna imena izvajalcev vam na zahtevo sporočimo na info@drazbenik.si.
Nasprotni stranki (kupcu oz. prodajalcu) posredujemo podatke, ki so nujni za izvedbo nakupa. Javni profil prikazuje samo omejene podatke (npr. uporabniško ime, oceno, status verifikacije).
Podatke prodajalcev za namen DAC7 posredujemo Finančni upravi RS. Podatke lahko posredujemo tudi drugim organom, če to zahteva zakon ali sodna odločba. Podatkov ne prodajamo.

5. Prenos v tretje države
Nekateri izvajalci imajo sedež ali strežnike zunaj EU/EGP (npr. v ZDA). Prenos poteka le na podlagi sklepa o ustreznosti (npr. Okvir za varstvo podatkov EU–ZDA) ali standardnih pogodbenih klavzul iz 46. člena GDPR.

6. Kako dolgo hranimo podatke
- uporabniški račun in profil: dokler račun obstaja; po izbrisu računa izbrišemo ali anonimiziramo podatke, razen tistih, ki jih moramo hraniti po zakonu;
- računi in računovodske listine: 10 let od konca leta, v katerem so nastali;
- podatki, zbrani za poročanje DAC7: 5 let po koncu leta poročanja;
- zgoščena vrednost davčne številke pri blokiranih računih: največ 5 let od blokade;
- sporočila in zgodovina dražb: do izbrisa računa oz. dokler je potrebno za varstvo pravnih zahtevkov;
- evidenca dogodkov za dokazovanje (IP-naslov, naprava, čas): 18 mesecev;
- povpraševanja za nepremičnine: dokler je potrebno za obravnavo povpraševanja;
- dokazila v sporih: dokler je potrebno za uveljavljanje ali obrambo pravnih zahtevkov;
- varnostni dnevniki: le toliko časa, kolikor je nujno za zagotavljanje varnosti in odpravljanje napak.

7. Vaše pravice
Imate pravico do: dostopa do podatkov, popravka, izbrisa, omejitve obdelave, prenosljivosti, ugovora zoper obdelavo na podlagi zakonitega interesa ter preklica privolitve (kjer je obdelava utemeljena s privolitvijo; preklic ne vpliva na zakonitost obdelave pred preklicem). Zahtevo pošljite na info@drazbenik.si; odgovorimo v 30 dneh. Račun in podatke lahko izbrišete tudi sami v Nastavitvah, če ni odprtih obveznosti (npr. nezaključenih plačil).
Imate tudi pravico do pritožbe pri nadzornem organu: Informacijski pooblaščenec, Dunajska cesta 22, 1000 Ljubljana, www.ip-rs.si, gp.ip@ip-rs.si.

8. Obvezni podatki in avtomatizirane odločitve
Podatki, označeni kot obvezni pri registraciji, so potrebni za sklenitev pogodbe; brez njih računa ne moremo odpreti. Ne izvajamo odločanja izključno na podlagi avtomatizirane obdelave, ki bi imelo pravne učinke za vas (profiliranje). Samodejno omejevanje (npr. blokada računa po več neplačanih dražbah, najnižja starost, omejitve za nove prodajalce, števci sporov) temelji na jasnih pravilih iz Splošnih pogojev, vi pa lahko zahtevate človeški pregled na info@drazbenik.si.

9. Mladoletniki
Platforma je namenjena osebam, starim 16 let ali več. Za osebe med 16. in 18. letom je potrebna privolitev staršev ali skrbnikov; uporabnik to potrdi v verifikaciji, mi pa potrditev trajno hranimo (datum, čas, IP, naprava, različica besedila) kot dokazilo o izpolnjeni zakonski zahtevi (zakoniti interes in zakonska obveznost). Do potrditve oddaja ponudb in objava dražb nista mogoči. Zbiramo samo letnico rojstva. Če izvemo, da je račun odprl uporabnik, mlajši od 16 let, ga zapremo.

10. Varnost
Uporabljamo tehnične in organizacijske ukrepe: šifriran prenos (HTTPS), nadzor dostopa, ločevanje občutljivih podatkov, nepovratno shranjevanje občutljivih identifikatorjev. O kršitvah varstva podatkov obvestimo pristojni organ in prizadete osebe v skladu z GDPR.

11. Spremembe
To politiko lahko posodobimo. O bistvenih spremembah vas obvestimo v aplikaciji ali po e-pošti.`;

export const COOKIE_TEXT = `POLITIKA PIŠKOTKOV IN PODOBNIH TEHNOLOGIJ
Zadnja posodobitev: ${LAST_UPDATE}

Kaj uporabljamo
Dražbenik.si uporablja samo tehnologije, ki so nujne za delovanje strani, in funkcionalne nastavitve. Ne uporabljamo analitičnih, oglaševalskih ali sledilnih piškotkov in ne profiliramo obiskovalcev. Zato za nujne tehnologije v skladu z Zakonom o elektronskih komunikacijah (ZEKom-2) in direktivo o zasebnosti in elektronskih komunikacijah privolitev ni potrebna; o njihovi uporabi vas obveščamo s tem obvestilom.

Pregled
1) Prijava in varnost (nujno)
- Firebase Authentication (shramba brskalnika: IndexedDB/localStorage): ohranja vašo prijavo. Trajanje: do odjave.
- reCAPTCHA (storitev Google, www.google.com / www.gstatic.com): zaščita registracije pred roboti. Lahko nastavi piškotek za oceno tveganja. Trajanje določa ponudnik storitve. Več: policies.google.com/privacy.

2) Plačila (nujno, samo ob plačilu)
- Piškotki ponudnika plačilnih storitev: izvedba plačila, preverjanje identitete in preprečevanje goljufij. Nastavijo se šele, ko odprete plačilno okno.

3) Delovanje in udobje (funkcionalno)
- Lokalna shramba brskalnika (IndexedDB, Firestore): predpomnilnik za hitrejše nalaganje profila in dražb.
- remember_me: zapomni izbiro "Zapomni si me". Trajanje: do izbrisa.
- last_active_route, session_tab_active: vrnitev na zadnjo odprto stran. Trajanje: do izbrisa oz. seje.
- drazbenik_show_filters, last_seen_winnings, dontShowTermsAgain: prikaz filtrov in obvestil. Trajanje: do izbrisa.
- drazbe_package_draft_*: osnutek paketa, ki ga pišete. Trajanje: do objave ali izbrisa.
- cookie_notice_ack: shrani, da ste prebrali to obvestilo. Trajanje: 12 mesecev.
- language: izbrani jezik vmesnika. Trajanje: do izbrisa.
- pending_prevzem_qr (sessionStorage): začasen zapis kode za prevzem, da se ne izgubi po prijavi. Trajanje: do konca seje.

Dostop do kamere
Kamero uporabimo samo, če izberete "Fotografiraj". Posnetki se ne shranijo, dokler jih sami ne pošljete. Dostop odobrite ali zavrnete v brskalniku.

Kako jih izbrišete ali blokirate
Shrambo lahko kadar koli izbrišete v nastavitvah brskalnika (npr. "Izbriši podatke o brskanju"). Če nujne tehnologije blokirate, se ne boste mogli prijaviti ali plačati.

Spremembe
Če bomo v prihodnje uvedli analitiko ali oglaševanje, bomo pred uporabo zahtevali vašo izrecno privolitev, ki jo boste lahko kadar koli spremenili.

Kontakt: info@drazbenik.si`;
