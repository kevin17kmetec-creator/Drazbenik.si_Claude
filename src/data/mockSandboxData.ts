import { AuctionItem, Region, SubscriptionTier } from "../types";

export const mockSandboxPackageId = 'pkg_sandbox_delavnica_7';

export const mockSandboxPackageItems: AuctionItem[] = [
  {
    id: 'mock_pkg_item_1',
    title: {
      SLO: 'Industrijski vijačni kompresor Elektro Maschinen 200L / 10 bar',
      EN: 'Industrial Screw Compressor Elektro Maschinen 200L / 10 bar',
      DE: 'Industrieller Schraubenkompressor Elektro Maschinen 200L / 10 bar'
    },
    description: {
      SLO: 'Profesionalni trifazni kompresor z jermenskim pogonom, litoželezno glavo in 200-litrsko tlačno posodo. Redno servisiran, pripravljen za takojšnje delo v avtomehanični ali mizarski delavnici.',
      EN: 'Professional 3-phase compressor with belt drive and 200L tank. Fully serviced.',
      DE: 'Professioneller 3-Phasen-Kompressor mit Riemenantrieb und 200L Kessel. Voll funktionsfähig.'
    },
    category: 'Dom in vrt',
    currentBid: 380,
    bidCount: 16,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 42), // 5 days 42 min
    location: { SLO: 'Celje (Industrijska cona)', EN: 'Celje', DE: 'Cilli' },
    region: Region.Osrednjeslovenska,
    condition: { SLO: 'Kot novo', EN: 'Like New', DE: 'Wie Neu' },
    specifications: {
      'Tehnični podatki': {
        'Znamka': 'Elektro Maschinen',
        'Kapaciteta': '200 L',
        'Maks. pritisk': '10 bar',
        'Moč motorja': '3.0 kW (Trifazni 400V)',
        'Letnik': '2022'
      }
    },
    biddingHistory: [
      { id: 'b1', bidderId: 'usr_1', bidderName: 'Marko K.', amount: 380, timestamp: new Date(Date.now() - 1000 * 60 * 20) },
      { id: 'b2', bidderId: 'usr_2', bidderName: 'Robert P.', amount: 360, timestamp: new Date(Date.now() - 1000 * 60 * 60) },
      { id: 'b3', bidderId: 'usr_3', bidderName: 'Janez D.', amount: 320, timestamp: new Date(Date.now() - 1000 * 60 * 180) }
    ],
    sellerId: 'seller_sandbox_company',
    sellerName: 'Orodje & Stroji Pro d.o.o.',
    status: 'active',
    is_package: true,
    package_id: mockSandboxPackageId,
    delivery_option: 'both',
    delivery_method: 'pickup'
  },
  {
    id: 'mock_pkg_item_2',
    title: {
      SLO: 'Inverterski varilni aparat TIG/MMA 200A Pulse digitalni',
      EN: 'Inverter Welding Machine TIG/MMA 200A Pulse Digital',
      DE: 'Inverter-Schweißgerät WIG/MMA 200A Puls Digital'
    },
    description: {
      SLO: 'Digitalni inverterski varilnik z visokofrekvenčnim vžigom (HF) in pulzno funkcijo za varjenje nerjavečega jekla ter aluminija. V kompletu s TIG gorilnikom WP-26 in masnim kablom.',
      EN: 'Digital inverter welder with HF ignition and pulse function. Includes torch and cables.',
      DE: 'Digitales Inverter-Schweißgerät mit HF-Zündung und Pulsfunktion. Inklusive Brenner.'
    },
    category: 'Dom in vrt',
    currentBid: 195,
    bidCount: 11,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 42),
    location: { SLO: 'Celje (Industrijska cona)', EN: 'Celje', DE: 'Cilli' },
    region: Region.Osrednjeslovenska,
    condition: { SLO: 'Novo', EN: 'New', DE: 'Neu' },
    specifications: {
      'Tehnični podatki': {
        'Znamka': 'Stamos Germany Pro',
        'Varilni tok': '10 - 200 A',
        'Vžig': 'HF Visokofrekvenčni',
        'Hlajenje': 'Zračno z avtomatskim ventilatorjem',
        'Garancija': '12 mesecev'
      }
    },
    biddingHistory: [
      { id: 'b4', bidderId: 'usr_4', bidderName: 'Andrej M.', amount: 195, timestamp: new Date(Date.now() - 1000 * 60 * 45) },
      { id: 'b5', bidderId: 'usr_1', bidderName: 'Marko K.', amount: 180, timestamp: new Date(Date.now() - 1000 * 60 * 120) }
    ],
    sellerId: 'seller_sandbox_company',
    sellerName: 'Orodje & Stroji Pro d.o.o.',
    status: 'active',
    is_package: true,
    package_id: mockSandboxPackageId,
    delivery_option: 'both',
    delivery_method: 'post'
  },
  {
    id: 'mock_pkg_item_3',
    title: {
      SLO: 'Set akumulatorskega orodja Makita 18V LXT 4-delni + 3x 5.0Ah baterije',
      EN: 'Makita 18V LXT 4-Piece Cordless Tool Combo Kit + 3x 5.0Ah Batteries',
      DE: 'Makita 18V LXT 4-tlg. Akku-Werkzeugset + 3x 5,0Ah Akkus'
    },
    description: {
      SLO: 'Vrhunski komplet v Makpac kovčku: Udarni vrtalnik DHP484, vijačnik DTD153, kotni brusilnik DGA504 in sabljasta žaga DJR186. Priložene 3 originalne baterije 5.0Ah in hitri dvojni polnilec DC18RD.',
      EN: 'Top combo kit in Makpac: DHP484 drill, DTD153 impact driver, grinder, reciprocating saw, 3x 5.0Ah batteries.',
      DE: 'Top Makpac Set: Schlagbohrer, Schlagschrauber, Winkelschleifer, Säbelsäge und 3 Akkus.'
    },
    category: 'Dom in vrt',
    currentBid: 310,
    bidCount: 24,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 42),
    location: { SLO: 'Celje (Industrijska cona)', EN: 'Celje', DE: 'Cilli' },
    region: Region.Osrednjeslovenska,
    condition: { SLO: 'Novo', EN: 'New', DE: 'Neu' },
    specifications: {
      'Tehnični podatki': {
        'Znamka': 'Makita',
        'Model': 'DLX4104TX1',
        'Napetost': '18V Li-Ion LXT',
        'Baterije': '3x BL1850B (5.0 Ah)',
        'Kovčki': '3x Makpac sistemski kovček'
      }
    },
    biddingHistory: [
      { id: 'b6', bidderId: 'usr_5', bidderName: 'Peter Z.', amount: 310, timestamp: new Date(Date.now() - 1000 * 60 * 10) },
      { id: 'b7', bidderId: 'usr_2', bidderName: 'Robert P.', amount: 290, timestamp: new Date(Date.now() - 1000 * 60 * 80) }
    ],
    sellerId: 'seller_sandbox_company',
    sellerName: 'Orodje & Stroji Pro d.o.o.',
    status: 'active',
    is_package: true,
    package_id: mockSandboxPackageId,
    delivery_option: 'both',
    delivery_method: 'post'
  },
  {
    id: 'mock_pkg_item_4',
    title: {
      SLO: 'Nizkoprofilna hidravlična delavniška dvigalka 3.5 Tone z dvojno črpalko',
      EN: 'Low Profile 3.5 Ton Hydraulic Service Jack with Dual Pump',
      DE: 'Flachbett Hydraulischer Rangierheber 3,5 Tonnen mit Doppelkolben'
    },
    description: {
      SLO: 'Masivna jeklena avtodvigalka z minimalno višino le 75 mm (odlična za športna in spuščena vozila). Dvojni bat omogoča hiter dvig do maksimalne višine 505 mm.',
      EN: 'Heavy duty low profile floor jack with 75mm min height and dual rapid pump pistons.',
      DE: 'Robuster flacher Wagenheber mit 75 mm Mindesthöhe und Doppelkolben-Schnellhub.'
    },
    category: 'Avtomobilizem',
    currentBid: 110,
    bidCount: 8,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 42),
    location: { SLO: 'Celje (Industrijska cona)', EN: 'Celje', DE: 'Cilli' },
    region: Region.Osrednjeslovenska,
    condition: { SLO: 'Kot novo', EN: 'Like New', DE: 'Wie Neu' },
    specifications: {
      'Tehnični podatki': {
        'Nosilnost': '3.500 kg (3.5T)',
        'Minimalna višina': '75 mm',
        'Maksimalna višina': '505 mm',
        'Teža dvigalke': '34 kg',
        'Konstrukcija': 'Ojačano jeklo'
      }
    },
    biddingHistory: [
      { id: 'b8', bidderId: 'usr_6', bidderName: 'Boštjan L.', amount: 110, timestamp: new Date(Date.now() - 1000 * 60 * 95) }
    ],
    sellerId: 'seller_sandbox_company',
    sellerName: 'Orodje & Stroji Pro d.o.o.',
    status: 'active',
    is_package: true,
    package_id: mockSandboxPackageId,
    delivery_option: 'both',
    delivery_method: 'pickup'
  },
  {
    id: 'mock_pkg_item_5',
    title: {
      SLO: 'Masivna delavniška miza 200x80cm z bukovo ploščo 40mm in primežem 150mm',
      EN: 'Heavy Duty Workshop Workbench 200x80cm with 40mm Solid Beech Top & Vise',
      DE: 'Schwere Werkbank 200x80cm mit 40mm Buche-Massivplatte und Schraubstock'
    },
    description: {
      SLO: 'Izjemno stabilna profesionalna miza z nosilnostjo do 1000 kg. Vgrajen rotacijski primež York 150 mm in 4 zaklepni predali s krogličnimi vodili.',
      EN: 'Heavy duty workbench with 1000kg load capacity, York 150mm bench vise, and 4 lockable drawers.',
      DE: 'Schwere Werkbank mit 1000 kg Tragkraft, 150mm Schraubstock und 4 Schubladen.'
    },
    category: 'Dom in vrt',
    currentBid: 240,
    bidCount: 14,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 42),
    location: { SLO: 'Celje (Industrijska cona)', EN: 'Celje', DE: 'Cilli' },
    region: Region.Osrednjeslovenska,
    condition: { SLO: 'Rabljeno', EN: 'Used', DE: 'Gebraucht' },
    specifications: {
      'Tehnični podatki': {
        'Dimenzije': '2000 x 800 x 900 mm',
        'Delovna plošča': 'Masivna bukev 40 mm (oljena)',
        'Število predalov': '4 (z centralnim zaklepanjem)',
        'Primež': 'York 150 mm z nakovalom'
      }
    },
    biddingHistory: [
      { id: 'b9', bidderId: 'usr_1', bidderName: 'Marko K.', amount: 240, timestamp: new Date(Date.now() - 1000 * 60 * 15) }
    ],
    sellerId: 'seller_sandbox_company',
    sellerName: 'Orodje & Stroji Pro d.o.o.',
    status: 'active',
    is_package: true,
    package_id: mockSandboxPackageId,
    delivery_option: 'pickup_only',
    delivery_method: 'pickup'
  },
  {
    id: 'mock_pkg_item_6',
    title: {
      SLO: 'Digitalno merilno orodje Mitutoyo Digimatic (Pomično merilo 150mm + Mikrometer 0-25mm)',
      EN: 'Mitutoyo Digimatic Precision Tool Set (150mm Caliper + 0-25mm Micrometer)',
      DE: 'Mitutoyo Digimatic Präzisionsmesszeug-Set (150mm Messschieber + 0-25mm Mikrometer)'
    },
    description: {
      SLO: 'Originalno japonsko precizno orodje z IP67 zaščito pred emulzijo in prahom. Natančnost 0.001 mm / 0.01 mm, kalibrirano s certifikatom.',
      EN: 'Genuine Japanese precision measuring tools with IP67 coolant proof rating and calibration certificate.',
      DE: 'Original japanische Präzisionsmesszeuge mit IP67 Schutz und Kalibrierzertifikat.'
    },
    category: 'Dom in vrt',
    currentBid: 145,
    bidCount: 9,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 42),
    location: { SLO: 'Celje (Industrijska cona)', EN: 'Celje', DE: 'Cilli' },
    region: Region.Osrednjeslovenska,
    condition: { SLO: 'Kot novo', EN: 'Like New', DE: 'Wie Neu' },
    specifications: {
      'Tehnični podatki': {
        'Proizvajalec': 'Mitutoyo Japan',
        'Zaščita': 'IP67 Coolant Proof',
        'Merilno območje': '0 - 150 mm / 0 - 25 mm',
        'Ločljivost': '0.01 mm / 0.001 mm',
        'Embalaža': 'Originalna lesena in plastična škatlica'
      }
    },
    biddingHistory: [
      { id: 'b10', bidderId: 'usr_7', bidderName: 'Gorazd T.', amount: 145, timestamp: new Date(Date.now() - 1000 * 60 * 50) }
    ],
    sellerId: 'seller_sandbox_company',
    sellerName: 'Orodje & Stroji Pro d.o.o.',
    status: 'active',
    is_package: true,
    package_id: mockSandboxPackageId,
    delivery_option: 'both',
    delivery_method: 'post'
  },
  {
    id: 'mock_pkg_item_7',
    title: {
      SLO: 'Pnevmatski udarni vijačnik Hazet 9012M 1/2" Twin Turbo (1100 Nm)',
      EN: 'Pneumatic Impact Wrench Hazet 9012M 1/2" Twin Turbo (1100 Nm)',
      DE: 'Druckluft-Schlagschrauber Hazet 9012M 1/2" Twin Turbo (1100 Nm)'
    },
    description: {
      SLO: 'Kompaktni ultra močni pnevmatski udarni vijačnik nemškega proizvajalca Hazet. Dolžina le 92 mm, navor odvijanja do 1100 Nm. Idealen za tesne prostore okrog podvozij in motorjev.',
      EN: 'Ultra compact high power impact wrench by Hazet Germany. 92mm length, 1100 Nm max loosening torque.',
      DE: 'Ultra kompakter Hochleistungs-Schlagschrauber von Hazet. 92 mm kurz, 1100 Nm max. Lösemoment.'
    },
    category: 'Avtomobilizem',
    currentBid: 85,
    bidCount: 18,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 42),
    location: { SLO: 'Celje (Industrijska cona)', EN: 'Celje', DE: 'Cilli' },
    region: Region.Osrednjeslovenska,
    condition: { SLO: 'Novo', EN: 'New', DE: 'Neu' },
    specifications: {
      'Tehnični podatki': {
        'Znamka': 'Hazet (Nemčija)',
        'Model': '9012M Twin Turbo',
        'Vpetje': '1/2" (12.5 mm)',
        'Maksimalni navor': '1100 Nm',
        'Skupna dolžina': '92 mm',
        'Teža': '1.24 kg'
      }
    },
    biddingHistory: [
      { id: 'b11', bidderId: 'usr_5', bidderName: 'Peter Z.', amount: 85, timestamp: new Date(Date.now() - 1000 * 60 * 5) },
      { id: 'b12', bidderId: 'usr_3', bidderName: 'Janez D.', amount: 75, timestamp: new Date(Date.now() - 1000 * 60 * 30) }
    ],
    sellerId: 'seller_sandbox_company',
    sellerName: 'Orodje & Stroji Pro d.o.o.',
    status: 'active',
    is_package: true,
    package_id: mockSandboxPackageId,
    delivery_option: 'both',
    delivery_method: 'post'
  }
];

export const mockSandboxStandaloneItems: AuctionItem[] = [
  {
    id: 'mock_standalone_item_1',
    title: {
      SLO: 'Apple MacBook Pro 16" M3 Max (36GB RAM / 1TB SSD / Space Black)',
      EN: 'Apple MacBook Pro 16" M3 Max (36GB RAM / 1TB SSD / Space Black)',
      DE: 'Apple MacBook Pro 16" M3 Max (36GB RAM / 1TB SSD / Space Schwarz)'
    },
    description: {
      SLO: 'Brezhibno ohranjen prenosnik v originalni škatli z Apple 140W USB-C polnilcem. Baterija 99% zdravja, le 24 ciklov polnjenja. Garancija veljavna do decembra 2025.',
      EN: 'Pristine condition MacBook Pro 16" M3 Max in original box. Battery health 99%.',
      DE: 'Neuwertiges MacBook Pro 16" M3 Max in OVP. Akku 99% Restkapazität.'
    },
    category: 'Računalniki',
    currentBid: 1850,
    bidCount: 34,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 48 + 1000 * 60 * 15), // 2 days 15 min
    location: { SLO: 'Ljubljana (Center)', EN: 'Ljubljana', DE: 'Laibach' },
    region: Region.Osrednjeslovenska,
    condition: { SLO: 'Kot novo', EN: 'Like New', DE: 'Wie Neu' },
    specifications: {
      'Konfiguracija': {
        'Procesor': 'Apple M3 Max (14-core CPU, 30-core GPU)',
        'Delovni pomnilnik': '36 GB enotnega pomnilnika',
        'Disk': '1 TB Superfast SSD',
        'Zaslon': '16.2" Liquid Retina XDR (120Hz ProMotion)',
        'Barva': 'Space Black (Vesoljsko črna)'
      }
    },
    biddingHistory: [
      { id: 'sb1', bidderId: 'usr_9', bidderName: 'Tomaž B.', amount: 1850, timestamp: new Date(Date.now() - 1000 * 60 * 12) },
      { id: 'sb2', bidderId: 'usr_8', bidderName: 'Denis K.', amount: 1800, timestamp: new Date(Date.now() - 1000 * 60 * 75) }
    ],
    sellerId: 'seller_sandbox_mac',
    sellerName: 'DigitalTech Store d.o.o.',
    status: 'active',
    is_package: false,
    delivery_option: 'both',
    delivery_method: 'post'
  },
  {
    id: 'mock_standalone_item_2',
    title: {
      SLO: 'Električno polnovzmeteno gorsko kolo Specialized Turbo Levo Comp 2023 (Velikost L)',
      EN: 'Specialized Turbo Levo Comp 2023 Full Suspension e-MTB (Size L)',
      DE: 'Specialized Turbo Levo Comp 2023 E-Fully Mountainbike (Größe L)'
    },
    description: {
      SLO: 'Vrhunsko e-MTB kolo z motorjem Specialized 2.2 (90Nm navora) in 700Wh baterijo. Vzmetenje Fox 36 Rhythm 160mm in Fox Float X Performance. Prevoženih le 640 km.',
      EN: 'Top spec Specialized Turbo Levo Comp with 700Wh battery, Fox 36 160mm fork, 90Nm motor.',
      DE: 'Top E-Fully mit 700Wh Akku, Fox 36 Federgabel und 90Nm Motor. Sehr gepflegt.'
    },
    category: 'Prosti čas in šport',
    currentBid: 2450,
    bidCount: 22,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 28 + 1000 * 60 * 5), // 1 day 4 hours
    location: { SLO: 'Kranj (Gorenjska)', EN: 'Kranj', DE: 'Krainburg' },
    region: Region.Gorenjska,
    condition: { SLO: 'Kot novo', EN: 'Like New', DE: 'Wie Neu' },
    specifications: {
      'Specifikacije': {
        'Okvir': 'Specialized M5 Premium Alloy, 150mm hoda',
        'Motor': 'Specialized 2.2 Custom Rx Trail Tuned (90 Nm)',
        'Baterija': 'Specialized M3-700 (700 Wh)',
        'Menjalnik': 'SRAM GX Eagle 12-prestav',
        'Zavore': 'SRAM Code R 4-batne (220/200mm)'
      }
    },
    biddingHistory: [
      { id: 'sb3', bidderId: 'usr_10', bidderName: 'Klemen P.', amount: 2450, timestamp: new Date(Date.now() - 1000 * 60 * 8) }
    ],
    sellerId: 'seller_sandbox_bike',
    sellerName: 'Gorski Športi d.o.o.',
    status: 'active',
    is_package: false,
    delivery_option: 'pickup_only',
    delivery_method: 'pickup'
  },
  {
    id: 'mock_standalone_item_3',
    title: {
      SLO: 'Vintage avtomatska ročna ura Omega Seamaster Automatic Cal. 565 (Letnik 1971)',
      EN: 'Vintage Omega Seamaster Automatic Cal. 565 Watch (1971)',
      DE: 'Vintage Omega Seamaster Automatik Cal. 565 Uhr (1971)'
    },
    description: {
      SLO: 'Kolekcionarski primerek z legendarnim avtomatskim mehanizmom Omega Calibre 565 z datumom. Ohišje iz nerjavečega jekla 36mm, originalna krona z logotipom Omega in nov usnjen pas.',
      EN: 'Collector grade vintage Omega Seamaster with Cal. 565 movement, 36mm steel case, serviced.',
      DE: 'Sammleruhr Omega Seamaster mit Kaliber 565 Automatikwerk, 36mm Stahlgehäuse, frisch revidiert.'
    },
    category: 'Umetnine',
    currentBid: 920,
    bidCount: 29,
    itemCount: 1,
    images: [
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1000&q=80'
    ],
    endTime: new Date(Date.now() + 1000 * 60 * 185), // 3 hours 5 min
    location: { SLO: 'Maribor', EN: 'Maribor', DE: 'Marburg' },
    region: Region.Osrednjeslovenska,
    condition: { SLO: 'Kot novo', EN: 'Like New', DE: 'Wie Neu' },
    specifications: {
      'Podatki o uri': {
        'Znamka': 'Omega',
        'Model': 'Seamaster Automatic Date',
        'Mehanizem': 'In-house Omega Cal. 565 (24 rubinov, avtomatski)',
        'Premer': '36 mm (brez krone)',
        'Servis': 'Opravljen kompletni servis in ultrazvočno čiščenje (avgust 2024)'
      }
    },
    biddingHistory: [
      { id: 'sb4', bidderId: 'usr_11', bidderName: 'Simon V.', amount: 920, timestamp: new Date(Date.now() - 1000 * 60 * 2) },
      { id: 'sb5', bidderId: 'usr_12', bidderName: 'Matjaž L.', amount: 890, timestamp: new Date(Date.now() - 1000 * 60 * 14) }
    ],
    sellerId: 'seller_sandbox_watch',
    sellerName: 'Antikvitete & Ure d.o.o.',
    status: 'active',
    is_package: false,
    delivery_option: 'both',
    delivery_method: 'post'
  }
];

export const allMockSandboxItems = [...mockSandboxPackageItems, ...mockSandboxStandaloneItems];
