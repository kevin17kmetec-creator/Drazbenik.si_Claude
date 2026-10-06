import { Category } from '../types';

export interface AttributeFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  options: string[];
  dependsOn?: { key: string; value: string };
}

export const CATEGORY_ATTRIBUTE_DEFINITIONS: Partial<Record<Category, AttributeFieldDef[]>> = {
  [Category.Oblacila]: [
    {
      key: 'clothing_type',
      label: 'Vrsta oblačila / obutve',
      options: [
        'Moška oblačila',
        'Ženska oblačila',
        'Otroška oblačila',
        'Moška obutev',
        'Ženska obutev',
        'Otroška obutev',
        'Športna oprema in dresi',
        'Modni dodatki (torbice, pasovi, kape)',
        'Drugo'
      ]
    },
    {
      key: 'size_clothing',
      label: 'Velikost oblačil',
      options: [
        'XXS',
        'XS',
        'S',
        'M',
        'L',
        'XL',
        'XXL',
        '3XL',
        '4XL',
        '5XL',
        'Univerzalna (Ena velikost)',
        'Otroška 50-68 (0-6m)',
        'Otroška 74-92 (6-24m)',
        'Otroška 98-116 (2-6 let)',
        'Otroška 122-140 (6-10 let)',
        'Otroška 146-164 (10-14 let)',
        'Drugo'
      ]
    },
    {
      key: 'size_footwear',
      label: 'Velikost obutve (EU številka)',
      options: [
        '16-24 (otroška)',
        '25-30 (otroška)',
        '31-35 (otroška)',
        '36',
        '37',
        '37.5',
        '38',
        '38.5',
        '39',
        '40',
        '40.5',
        '41',
        '42',
        '42.5',
        '43',
        '44',
        '44.5',
        '45',
        '46',
        '47',
        '48',
        '49+',
        'Drugo'
      ]
    },
    {
      key: 'brand',
      label: 'Znamka',
      options: [
        'Nike',
        'Adidas',
        'Zara',
        'H&M',
        'Tommy Hilfiger',
        'Hugo Boss',
        'Puma',
        'Levi\'s',
        'Calvin Klein',
        'Guess',
        'Under Armour',
        'New Balance',
        'The North Face',
        'Gucci',
        'Prada',
        'Lego Wear',
        'Brez znamke',
        'Drugo'
      ]
    },
    {
      key: 'material',
      label: 'Material',
      options: [
        '100% Bombaž',
        'Naravno usnje',
        'Umetno usnje / Eko usnje',
        'Džins / Denim',
        'Volna / Kašmir',
        'Sintetika / Poliester',
        'Svila / Saten',
        'Lan',
        'Gore-Tex / Tehnični material',
        'Drugo'
      ]
    }
  ],

  [Category.Elektronika]: [
    {
      key: 'device_type',
      label: 'Vrsta naprave',
      options: [
        'Pametni telefon',
        'Tablični računalnik',
        'Pametna ura / Zapestnica',
        'Brezžične slušalke',
        'Naglavne slušalke',
        'Prenosni Bluetooth zvočnik',
        'Hi-Fi & Domači kino',
        'Televizor (TV)',
        'Fotoaparat in objektivi',
        'Igralna konzola',
        'Dron in dodatki',
        'Drugo'
      ]
    },
    {
      key: 'brand',
      label: 'Znamka',
      options: [
        'Apple',
        'Samsung',
        'Xiaomi',
        'Huawei',
        'Google (Pixel)',
        'Sony',
        'LG',
        'JBL',
        'Garmin',
        'PlayStation',
        'Nintendo',
        'Xbox',
        'Canon',
        'Nikon',
        'GoPro',
        'Bose',
        'Marshall',
        'Drugo'
      ]
    },
    {
      key: 'model',
      label: 'Model telefona / naprave',
      placeholder: 'Npr. iPhone 15 Pro, Galaxy S24 Ultra, Pixel 8...',
      options: [
        'iPhone 16 / 16 Pro / Pro Max',
        'iPhone 15 / 15 Pro / Pro Max',
        'iPhone 14 / 14 Pro',
        'iPhone 13 / 13 Pro / Mini',
        'iPhone 12 / 11 / SE',
        'Samsung Galaxy S24 / Ultra',
        'Samsung Galaxy S23 / S22',
        'Samsung Galaxy Z Flip / Fold',
        'Samsung Galaxy A serija',
        'Xiaomi 14 / 13 / Redmi Note',
        'Google Pixel 8 / 7 / 6',
        'Sony PlayStation 5',
        'Nintendo Switch / OLED',
        'Drugo'
      ]
    },
    {
      key: 'storage',
      label: 'Velikost pomnilnika (Shramba)',
      options: [
        '32 GB',
        '64 GB',
        '128 GB',
        '256 GB',
        '512 GB',
        '1 TB',
        '2 TB+',
        'Drugo'
      ]
    },
    {
      key: 'charger_type',
      label: 'Vrsta / Velikost polnilnika in priključek',
      options: [
        'USB-C (Hitri polnilec)',
        'USB-C (Brez adapterja, samo kabel)',
        'Apple Lightning (Kabel + adapter)',
        'Apple Lightning (Samo kabel)',
        'Apple MagSafe / Brezžično polnjenje',
        'Micro-USB',
        'Originalni napajalnik priložen',
        'Brez polnilnika',
        'Drugo'
      ]
    }
  ],

  [Category.Racunalniki]: [
    {
      key: 'computer_type',
      label: 'Vrsta računalnika / opreme',
      options: [
        'Prenosni računalnik (Laptop)',
        'Gaming prenosnik',
        'Namizni računalnik (PC)',
        'Gaming namizni PC',
        'All-in-One računalnik',
        'Računalniški monitor',
        'Grafična kartica (GPU)',
        'Procesor (CPU) / Matična plošča',
        'Tiskalnik / Skener',
        'Omrežna oprema (Usmerjevalnik/Switch)',
        'Drugo'
      ]
    },
    {
      key: 'brand',
      label: 'Znamka',
      options: [
        'Apple (MacBook / iMac)',
        'Lenovo (ThinkPad / Legion)',
        'HP (Pavilion / Omen / EliteBook)',
        'Dell (XPS / Latitude / Alienware)',
        'Asus (ROG / ZenBook)',
        'Acer (Predator / Swift)',
        'MSI',
        'Custom / Lastna sestava',
        'Drugo'
      ]
    },
    {
      key: 'processor',
      label: 'Procesor (CPU)',
      options: [
        'Apple M3 / M4 (Pro / Max)',
        'Apple M1 / M2 (Pro / Max)',
        'Intel Core i9',
        'Intel Core i7',
        'Intel Core i5',
        'Intel Core i3',
        'AMD Ryzen 9',
        'AMD Ryzen 7',
        'AMD Ryzen 5',
        'AMD Ryzen 3',
        'Drugo'
      ]
    },
    {
      key: 'ram',
      label: 'Delovni pomnilnik (RAM)',
      options: [
        '4 GB',
        '8 GB',
        '16 GB',
        '32 GB',
        '64 GB',
        '128 GB+',
        'Drugo'
      ]
    },
    {
      key: 'storage_capacity',
      label: 'Kapaciteta diska (SSD / HDD)',
      options: [
        '128 GB SSD',
        '256 GB SSD',
        '512 GB NVMe SSD',
        '1 TB NVMe SSD',
        '2 TB NVMe SSD',
        '1 TB HDD',
        '2 TB+ HDD',
        'Kombinacija SSD + HDD',
        'Drugo'
      ]
    },
    {
      key: 'screen_size',
      label: 'Velikost zaslona',
      options: [
        '13" - 13.6"',
        '14" - 14.5"',
        '15.6"',
        '16" - 16.2"',
        '17"+',
        'Monitor 24" (Full HD)',
        'Monitor 27" (QHD 2K / 4K)',
        'Monitor 32"+ (4K / Ultrawide)',
        'Drugo'
      ]
    }
  ],

  [Category.Avtomobilizem]: [
    {
      key: 'vehicle_type',
      label: 'Tip vozila / artikla',
      options: [
        'Osebno vozilo',
        'Motorno kolo / Skuter',
        'Dostavno / Gospodarsko vozilo',
        'Prikolica / Vleka',
        'Avtodom / Počitniška prikolica',
        'Pnevmatike in platišča',
        'Avtodeli in elektronika',
        'Avtoakustika in navigacija',
        'Dodatna oprema (strešni kovčki, nosilci)',
        'Drugo'
      ]
    },
    {
      key: 'brand',
      label: 'Znamka vozila',
      options: [
        'Volkswagen',
        'Renault',
        'BMW',
        'Audi',
        'Mercedes-Benz',
        'Škoda',
        'Peugeot',
        'Ford',
        'Toyota',
        'Hyundai',
        'Kia',
        'Honda',
        'Opel',
        'Citroën',
        'Fiat',
        'Volvo',
        'Mazda',
        'Seat',
        'Nissan',
        'Tesla',
        'Yamaha (Moto)',
        'Honda (Moto)',
        'Kawasaki (Moto)',
        'Drugo'
      ]
    },
    {
      key: 'fuel_type',
      label: 'Vrsta goriva / pogona',
      options: [
        'Diesel',
        'Bencin',
        'Hibrid (Bencin + Elektro)',
        'Električni pogon (EV)',
        'Plin (LPG / CNG)',
        'Drugo'
      ]
    },
    {
      key: 'transmission',
      label: 'Menjalnik',
      options: [
        'Ročni menjalnik',
        'Avtomatski menjalnik (DSG / S-Tronic / Steptronic)',
        'Brezstopenjski menjalnik (CVT)',
        'Drugo'
      ]
    },
    {
      key: 'year',
      label: 'Letnik izdelave',
      options: [
        '2025 - 2026',
        '2022 - 2024',
        '2018 - 2021',
        '2014 - 2017',
        '2010 - 2013',
        '2005 - 2009',
        '2000 - 2004',
        'Pred letom 2000 (Starodobnik)',
        'Drugo'
      ]
    }
  ],

  [Category.DomInVrt]: [
    {
      key: 'home_area',
      label: 'Področje / Prostor',
      options: [
        'Dnevna soba & Sedežne garniture',
        'Spalnica & Postelje',
        'Kuhinja & Jedilnica',
        'Vrt, terasa in žari',
        'Bela tehnika & Gospodinjski aparati',
        'Kopalniška oprema',
        'Razsvetljava in svetila',
        'Dekoracija in preproge',
        'Drugo'
      ]
    },
    {
      key: 'material',
      label: 'Glavni material',
      options: [
        'Masivni les (Hrast, Bukev, Bor)',
        'Leseni furnir / MDF / Iveral',
        'Kovina / Jeklo / Aluminij',
        'Naravno usnje',
        'Umetno usnje / Eko usnje',
        'Kakovostna tkanina / Tekstil',
        'Kaljeno steklo',
        'Kamen / Keramika / Marmor',
        'Drugo'
      ]
    },
    {
      key: 'brand',
      label: 'Znamka / Proizvajalec',
      options: [
        'Ikea',
        'Jysk',
        'Lesnina / XXXLutz',
        'Mömax',
        'Gorenje',
        'Bosch',
        'Beko',
        'Philips',
        'Gardena',
        'Brez znamke / Ročno delo',
        'Drugo'
      ]
    }
  ],

  [Category.ProstiCasInSport]: [
    {
      key: 'sport_type',
      label: 'Zvrst športa / aktivnosti',
      options: [
        'Kolesarstvo (Gorsko, Cestno, E-kolo)',
        'Fitnes, uteži in kardio naprave',
        'Pohodništvo, plezanje in gorništvo',
        'Tek in atletska oprema',
        'Smučanje, deskanje in zimski športi',
        'Vodni športi, SUP in plavanje',
        'Tenis, badminton in loparji',
        'Kampiranje in bivanje v naravi',
        'Ekipni športi (Nogomet, Košarka)',
        'Ribolov in lov',
        'Drugo'
      ]
    },
    {
      key: 'sport_size',
      label: 'Velikost / Okvir / Dimenzija',
      options: [
        'Velikost S (Okvir 15"-16" / 50-52cm)',
        'Velikost M (Okvir 17"-18" / 53-55cm)',
        'Velikost L (Okvir 19"-20" / 56-58cm)',
        'Velikost XL (Okvir 21"+ / 59cm+)',
        'Moška velikost',
        'Ženska velikost',
        'Otroška velikost',
        'Univerzalna dimenzija',
        'Drugo'
      ]
    },
    {
      key: 'brand',
      label: 'Znamka športne opreme',
      options: [
        'Salomon',
        'Elan',
        'Scott',
        'Specialized',
        'Trek',
        'Garmin',
        'Shimano',
        'Head',
        'Fischer',
        'Atomic',
        'Kettler',
        'Decathlon / Quechua',
        'Drugo'
      ]
    }
  ],

  [Category.Orodja]: [
    {
      key: 'tool_type',
      label: 'Vrsta orodja / stroja',
      options: [
        'Akumulatorski vijačnik / vrtalnik',
        'Kotni brusilnik (Fleksarica)',
        'Krožna / Vbodna / Potezna žaga',
        'Motorna žaga & Obrezovalnik',
        'Varilni aparat & Oprema',
        'Visokotlačni čistilec (Štrajfiks)',
        'Kompresor in pnevmatsko orodje',
        'Komplet ročnega orodja (Ključi, klešče)',
        'Laserski merilnik in nivelir',
        'Generatorska oprema (Agregat)',
        'Drugo'
      ]
    },
    {
      key: 'brand',
      label: 'Znamka orodja',
      options: [
        'Makita',
        'Bosch Professional (Moder)',
        'Bosch Home & Garden (Zelen)',
        'DeWalt',
        'Milwaukee',
        'Parkside / Performance',
        'Stihl',
        'Husqvarna',
        'Unior',
        'Einhell',
        'Festool',
        'Kärcher',
        'Drugo'
      ]
    },
    {
      key: 'power_source',
      label: 'Vir napajanja',
      options: [
        'Akumulatorsko (Baterija)',
        'Električno omrežje (230V)',
        'Bencinski motor',
        'Pnevmatsko (Zrak)',
        'Ročno orodje',
        'Drugo'
      ]
    }
  ],

  [Category.Nepremicnine]: [
    {
      key: 'property_type',
      label: 'Vrsta nepremičnine',
      options: [
        'Stanovanje (Garsonjera / 1-sobno)',
        'Stanovanje (2-sobno / 3-sobno)',
        'Stanovanje (4-sobno ali več / Penthouse)',
        'Hiša (Samostojna / Dvojček / Vrstna)',
        'Vikend / Počitniški objekt',
        'Gradbena parcela / Zemljišče',
        'Kmetijsko zemljišče / Gozd',
        'Poslovni prostor / Pisarna / Delavnica',
        'Garaža / Parkirno mesto',
        'Drugo'
      ]
    },
    {
      key: 'property_size',
      label: 'Kvadratura (m²)',
      options: [
        'Do 35 m²',
        '36 m² - 55 m²',
        '56 m² - 75 m²',
        '76 m² - 100 m²',
        '101 m² - 150 m²',
        '151 m² - 250 m²',
        '250 m² ali več',
        'Parcela: do 500 m²',
        'Parcela: 500 m² - 1.500 m²',
        'Parcela: nad 1.500 m²',
        'Drugo'
      ]
    },
    {
      key: 'transaction_type',
      label: 'Vrsta posla / Stanje',
      options: [
        'Prodaja',
        'Oddaja / Najem',
        'Novogradnja',
        'V celoti obnovljeno',
        'Potrebno obnove',
        'Drugo'
      ]
    }
  ],

  [Category.OtroškaOprema]: [
    {
      key: 'item_type',
      label: 'Vrsta otroške opreme',
      options: [
        'Otroški voziček (1v1, 2v1, 3v1 ali marela)',
        'Otroški avtosedež (Lupinica ali jahač)',
        'Otroška posteljica & Vzmetnica',
        'Stolček za hranjenje',
        'Igrače in družabne igre',
        'Gugalnik in stajica',
        'Nosilka ali pestunja',
        'Drugo'
      ]
    },
    {
      key: 'brand',
      label: 'Znamka',
      options: [
        'Cybex',
        'Maxi-Cosi',
        'Chicco',
        'Kinderkraft',
        'Bugaboo',
        'Stokke',
        'Joie',
        'Lego',
        'FreeON',
        'Drugo'
      ]
    },
    {
      key: 'age_group',
      label: 'Starostna skupina',
      options: [
        'Novorojenček (0 - 6 mesecev)',
        'Dojenček (6 - 12 mesecev)',
        'Malček (1 - 3 leta)',
        'Predšolski otrok (3 - 6 let)',
        'Šolski otrok (6+ let)',
        'Vse starosti',
        'Drugo'
      ]
    }
  ],

  [Category.Glasbila]: [
    {
      key: 'instrument_type',
      label: 'Vrsta glasbila',
      options: [
        'Akustična / Klasična kitara',
        'Električna kitara / Bas kitara',
        'Klavir / Digitalni električni klavir',
        'Sintetizator / MIDI klaviatura',
        'Bobni / Elektronski set bobnov',
        'Harmonika (Frajtonarica / Klavirska)',
        'Pihala in trobila (Saksofon, Flavta, Trobenta)',
        'Godala (Violina, Čelo)',
        'Ojačevalec & Zvočniški boks',
        'Drugo'
      ]
    },
    {
      key: 'brand',
      label: 'Znamka glasbila',
      options: [
        'Yamaha',
        'Fender / Squier',
        'Gibson / Epiphone',
        'Ibanez',
        'Roland',
        'Korg',
        'Casio',
        'Marshall',
        'Boss',
        'Zupan / Rutar (Harmonike)',
        'Drugo'
      ]
    },
    {
      key: 'instrument_skill_level',
      label: 'Stopnja / Namen',
      options: [
        'Za začetnike / Učence',
        'Za nadaljevalce',
        'Profesionalno / Koncertno',
        'Otroško glasbilo',
        'Vintage / Zbirateljsko',
        'Drugo'
      ]
    }
  ],

  [Category.Zbirateljstvo]: [
    {
      key: 'collectible_type',
      label: 'Zvrst zbirateljstva',
      options: [
        'Kovanci in medalje (Numizmatika)',
        'Bankovci (Notafilija)',
        'Poštne znamke (Filatelija)',
        'Zbirateljske kartice (Pokemon, Športne, Magic)',
        'Modelčki in makete (Vozila, Vlaki, Letala)',
        'Vojaški in zgodovinski predmeti (Militarija)',
        'Stare razglednice in fotografije',
        'Stripovske izdaje & Zbirateljske knjige',
        'Vintage igrače',
        'Drugo'
      ]
    },
    {
      key: 'period',
      label: 'Zgodovinsko obdobje / Izvor',
      options: [
        'Sodobno (2000 - danes)',
        'Jugoslavija / 20. stoletje (1945 - 1991)',
        'Medvojno / 2. svetovna vojna (1939 - 1945)',
        'Avstro-Ogrska & Zgodnje 20. stoletje',
        '19. stoletje ali starejše',
        'Antika / Srednji vek',
        'Drugo'
      ]
    },
    {
      key: 'collectible_condition_grading',
      label: 'Ohranjenost / Certifikat',
      options: [
        'Novo / Neuporabljeno (Mint)',
        'Odlično ohranjeno',
        'Zmerno ohranjeno',
        'Gradirano / Certificirano (PSA, NGC, PCGS)',
        'Z originalno embalažo',
        'Drugo'
      ]
    }
  ],

  [Category.Umetnine]: [
    {
      key: 'art_type',
      label: 'Zvrst umetnine',
      options: [
        'Slika na platnu (Olje, Akril)',
        'Akvarel / Risba / Grafika',
        'Kip / Skulptura (Bron, Les, Kamen)',
        'Fotografija z omejeno naklado',
        'Unikatna keramika in steklo',
        'Drugo'
      ]
    },
    {
      key: 'author_or_school',
      label: 'Avtor / Umetnik / Slog',
      options: [
        'Znan slovenski avtor',
        'Tuji priznani avtor',
        'Akademski slikar',
        'Ljubiteljski / Samouki umetnik',
        'Impresionizem / Realizem',
        'Moderna / Abstraktna umetnost',
        'Neznan avtor / Podpisana umetnina',
        'Drugo'
      ]
    },
    {
      key: 'art_framing',
      label: 'Uokvirjenost & Certifikat',
      options: [
        'Uokvirjeno s steklom',
        'Uokvirjeno (klasičen okvir)',
        'Neuokvirjeno / Platno na podokvirju',
        'Priložen certifikat pristnosti',
        'Podpisano s strani avtorja',
        'Drugo'
      ]
    }
  ],

  [Category.LepotaInZdravje]: [
    {
      key: 'beauty_type',
      label: 'Vrsta izdelka',
      options: [
        'Parfumi in dišave',
        'Nega obraza',
        'Nega telesa',
        'Ličila / Make-up',
        'Nega las',
        'Medicinski in terapevtski pripomočki',
        'Drugo'
      ]
    },
    {
      key: 'beauty_brand',
      label: 'Znamka',
      options: [
        'Chanel',
        'Dior',
        'Lancôme',
        'L\'Oréal',
        'Nivea',
        'Philips',
        'Braun',
        'Oral-B',
        'Brez znamke',
        'Drugo'
      ]
    },
    {
      key: 'target_group',
      label: 'Namenjeno za',
      options: [
        'Ženske',
        'Moške',
        'Univerzalno / Unisex',
        'Otroke'
      ]
    }
  ],

  [Category.Kmetijstvo]: [
    {
      key: 'agri_type',
      label: 'Vrsta opreme / mehanizacije',
      options: [
        'Traktorji',
        'Kmetijski priključki',
        'Kosilnice in mulčerji',
        'Obdelava tal (plug, brana)',
        'Vinogradništvo in sadjarstvo',
        'Gozdarska oprema',
        'Krma in pridelki',
        'Drugo'
      ]
    },
    {
      key: 'agri_brand',
      label: 'Znamka / Proizvajalec',
      options: [
        'John Deere',
        'Claas',
        'New Holland',
        'Deutz-Fahr',
        'Fendt',
        'SIP Šempeter',
        'Krone',
        'Tomo Vinkovič',
        'Štore',
        'IMT',
        'Drugo'
      ]
    },
    {
      key: 'power_class',
      label: 'Moč motorja',
      options: [
        'Do 40 KM',
        '40 - 70 KM',
        '70 - 100 KM',
        'Nad 100 KM',
        'Brez motorja (priključek)'
      ]
    }
  ],

  [Category.Knjige]: [
    {
      key: 'genre',
      label: 'Žanr / Zvrst',
      options: [
        'Leposlovje in romani',
        'Kriminalke in trilerji',
        'Znanstvena fantastika & Fantazija',
        'Zgodovina in biografije',
        'Priročniki in kulinarika',
        'Otroške knjige in slikanice',
        'Učbeniki in strokovna literatura',
        'Stripi in mange',
        'Revije in periodika',
        'Drugo'
      ]
    },
    {
      key: 'language',
      label: 'Jezik',
      options: [
        'Slovenščina',
        'Angleščina',
        'Nemščina',
        'Hrvaščina / Srbščina',
        'Italijanščina',
        'Drugi jeziki'
      ]
    },
    {
      key: 'binding',
      label: 'Vezava',
      options: [
        'Trda vezava',
        'Mehka vezava',
        'Žepna izdaja',
        'Drugo'
      ]
    }
  ],

  [Category.Zivali]: [
    {
      key: 'animal_type',
      label: 'Vrsta živali',
      options: [
        'Psi',
        'Mačke',
        'Ptice',
        'Glodavci in kunci',
        'Ribe in akvaristika',
        'Plazilci in teraristika',
        'Konji in jahanje',
        'Kmetijske živali',
        'Drugo'
      ]
    },
    {
      key: 'equipment_type',
      label: 'Vrsta opreme',
      options: [
        'Bivališča, kletke in akvariji',
        'Ležišča in ute',
        'Povodci, ovratnice in oprsnice',
        'Igrače in nega',
        'Hrana in prehranski dodatki',
        'Transportni boksi',
        'Drugo'
      ]
    },
    {
      key: 'size_fit',
      label: 'Velikost',
      options: [
        'Majhne živali (do 10 kg)',
        'Srednje živali (10-25 kg)',
        'Velike živali (nad 25 kg)',
        'Univerzalno'
      ]
    }
  ],

  [Category.Navtika]: [
    {
      key: 'vessel_type',
      label: 'Vrsta plovila / opreme',
      options: [
        'Gumenjak',
        'Motorni čoln',
        'Jadrnica',
        'Kajak / Kanu / SUP',
        'Izvenkrmni motor',
        'Navtična elektronika in oprema',
        'Prikolica za plovilo',
        'Drugo'
      ]
    },
    {
      key: 'vessel_length',
      label: 'Dolžina',
      options: [
        'Do 3 metre',
        '3 - 5 metrov',
        '5 - 7 metrov',
        '7 - 10 metrov',
        'Nad 10 metrov',
        'Samo oprema / motor'
      ]
    },
    {
      key: 'engine_type',
      label: 'Pogon / Motor',
      options: [
        'Brez motorja (vesla / jadra)',
        '2-taktni bencinski',
        '4-taktni bencinski',
        'Dizelski vgradni',
        'Električni motor'
      ]
    }
  ],

  [Category.Gostinstvo]: [
    {
      key: 'catering_type',
      label: 'Vrsta gostinske opreme',
      options: [
        'Termična oprema (štedilniki, peči, friteze)',
        'Hladilna tehnika (hladilniki, zamrzovalniki, ledomati)',
        'Pomivalni stroji in pomivalna tehnika',
        'Kavni aparati in mlinčki',
        'Točilni pulti in šanki',
        'Inox pohištvo in delovne mize',
        'Drobni inventar in posoda',
        'Drugo'
      ]
    },
    {
      key: 'power_supply',
      label: 'Priključek / Napajanje',
      options: [
        'Elektrika 230V',
        'Trifazni tok 400V',
        'Plin',
        'Kombinirano / Ročno'
      ]
    },
    {
      key: 'material',
      label: 'Material',
      options: [
        'Nerjaveče jeklo (Inox)',
        'Kombinirano',
        'Drugo'
      ]
    }
  ],

  [Category.Gradbenistvo]: [
    {
      key: 'construction_type',
      label: 'Vrsta opreme / materiala',
      options: [
        'Gradbeni stroji (bager, viličar, valjar)',
        'Gradbeni odri, lestve in opaži',
        'Mešalci betona in vibratorji',
        'Gradbeni materiali (opeka, izolacija, les)',
        'Rezalke in diamantna orodja',
        'Osebna zaščitna oprema',
        'Drugo'
      ]
    },
    {
      key: 'drive_type',
      label: 'Pogon',
      options: [
        'Dizelski motor',
        'Bencinski motor',
        'Električni 230V / 400V',
        'Baterijski / Akumulatorski',
        'Ročno orodje'
      ]
    },
    {
      key: 'usage_intent',
      label: 'Namen uporabe',
      options: [
        'Profesionalna gradbena oprema',
        'Za domačo rabo',
        'Gradbeni material (ostanki gradnje)'
      ]
    }
  ],

  [Category.Starine]: [
    {
      key: 'antique_category',
      label: 'Zvrst starine',
      options: [
        'Starinsko pohištvo',
        'Ure (stenske, žepne, namizne)',
        'Srebrnina, baker in medenina',
        'Porcelan, keramika in steklo',
        'Militarije in staro orožje',
        'Svetila in lestenci',
        'Stari kmečki predmeti in orodja',
        'Drugo'
      ]
    },
    {
      key: 'period',
      label: 'Obdobje',
      options: [
        'Pred letom 1900',
        '1900 - 1945 (1. in 2. svetovna vojna)',
        '1945 - 1980 (Retro / Vintage)',
        'Neznano obdobje'
      ]
    },
    {
      key: 'origin',
      label: 'Poreklo',
      options: [
        'Slovenija / Avstro-Ogrska',
        'Srednja Evropa',
        'Balkan',
        'Drugo / Neznano'
      ]
    }
  ],

  [Category.Ostalo]: [
    {
      key: 'general_category',
      label: 'Kategorija artikla',
      options: [
        'Šolske in pisarniške potrebščine',
        'Darila in zabava',
        'Kuponi, kartice in vstopnice',
        'Rastline, sadike in semena',
        'Razno'
      ]
    },
    {
      key: 'item_packaging',
      label: 'Pakiranje',
      options: [
        'Originalno zapakirano',
        'Odprto / Brez embalaže',
        'Drugo'
      ]
    },
    {
      key: 'brand_or_maker',
      label: 'Znamka / Poreklo',
      options: [
        'Brez znamke / Domača izdelava',
        'Znana blagovna znamka',
        'Slovenski izdelek',
        'Uvoženo',
        'Drugo'
      ]
    }
  ]
};

// Generic fallback attributes for any category not explicitly defined above
export const GENERIC_ATTRIBUTE_DEFINITIONS: AttributeFieldDef[] = [
  {
    key: 'brand',
    label: 'Znamka / Proizvajalec / Avtor',
    placeholder: 'Vnesite znamko ali proizvajalca',
    options: ['Brez znamke / Unikat', 'Priznana znamka', 'Drugo']
  },
  {
    key: 'model_or_type',
    label: 'Model / Tip / Izvedba',
    placeholder: 'Vnesite model ali tip',
    options: ['Standardna izvedba', 'Posebna serija', 'Drugo']
  },
  {
    key: 'dimensions_or_size',
    label: 'Velikost / Dimenzije / Količina',
    placeholder: 'Npr. 50x70 cm, 2 kg, komplet 5 kosov...',
    options: ['Standardna velikost', 'Univerzalno', 'Drugo']
  }
];

export const getAttributeDefinitionsForCategory = (category?: Category | string): AttributeFieldDef[] => {
  if (!category) return GENERIC_ATTRIBUTE_DEFINITIONS;
  const match = Object.entries(CATEGORY_ATTRIBUTE_DEFINITIONS).find(([cat]) => cat === category);
  return match ? match[1] : GENERIC_ATTRIBUTE_DEFINITIONS;
};

export const formatAttributeLabel = (key: string): string => {
  const map: Record<string, string> = {
    clothing_type: 'Vrsta oblačila / obutve',
    size_clothing: 'Velikost oblačil',
    size_footwear: 'Velikost obutve',
    brand: 'Znamka',
    material: 'Material',
    device_type: 'Vrsta naprave',
    model: 'Model',
    storage: 'Shramba / Pomnilnik',
    charger_type: 'Polnilnik in priključek',
    computer_type: 'Vrsta računalnika',
    processor: 'Procesor (CPU)',
    ram: 'Delovni pomnilnik (RAM)',
    storage_capacity: 'Kapaciteta diska',
    screen_size: 'Velikost zaslona',
    vehicle_type: 'Tip vozila / artikla',
    fuel_type: 'Gorivo / Pogon',
    transmission: 'Menjalnik',
    year: 'Letnik izdelave',
    home_area: 'Področje / Prostor',
    sport_type: 'Zvrst športa',
    sport_size: 'Velikost / Okvir',
    tool_type: 'Vrsta orodja',
    property_type: 'Vrsta nepremičnine',
    property_size: 'Kvadratura (m²)',
    item_type: 'Vrsta artikla',
    collectible_type: 'Zvrst zbirateljstva',
    period: 'Obdobje / Leto',
    art_type: 'Zvrst umetnine',
    author_or_school: 'Avtor / Umetnik',
    model_or_type: 'Model / Tip',
    dimensions_or_size: 'Dimenzije / Velikost',
    brand_or_author: 'Znamka / Avtor',
    beauty_type: 'Vrsta izdelka',
    beauty_brand: 'Znamka',
    target_group: 'Namenjeno za',
    agri_type: 'Vrsta opreme / mehanizacije',
    agri_brand: 'Znamka / Proizvajalec',
    power_class: 'Moč motorja',
    genre: 'Žanr / Zvrst',
    language: 'Jezik',
    binding: 'Vezava',
    animal_type: 'Vrsta živali',
    equipment_type: 'Vrsta opreme',
    size_fit: 'Velikost',
    vessel_type: 'Vrsta plovila / opreme',
    vessel_length: 'Dolžina',
    engine_type: 'Pogon / Motor',
    catering_type: 'Vrsta gostinske opreme',
    power_supply: 'Priključek / Napajanje',
    construction_type: 'Vrsta opreme / materiala',
    drive_type: 'Pogon',
    usage_intent: 'Namen uporabe',
    antique_category: 'Zvrst starine',
    origin: 'Poreklo',
    general_category: 'Kategorija artikla',
    item_packaging: 'Pakiranje',
    power_source: 'Vir napajanja',
    transaction_type: 'Vrsta posla / Stanje',
    age_group: 'Starostna skupina',
    instrument_skill_level: 'Stopnja / Namen',
    collectible_condition_grading: 'Ohranjenost / Certifikat',
    art_framing: 'Uokvirjenost & Certifikat',
    brand_or_maker: 'Znamka / Poreklo'
  };
  return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};
