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
    brand_or_author: 'Znamka / Avtor'
  };
  return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};
