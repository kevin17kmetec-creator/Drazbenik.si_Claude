// Deutscher Kommentar: Modell-Kataloge je Marke (Marke -> Modelle). Neuere Modelle koennen ueber "Drugo" frei eingegeben werden.

const DRUGO = 'Drugo';

export const PHONE_MODELS: Record<string, string[]> = {
  Apple: [
    'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone Air', 'iPhone 17',
    'iPhone 16e', 'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
    'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
    'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
    'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 13 mini',
    'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 mini',
    'iPhone SE (3. generacija, 2022)', 'iPhone SE (2. generacija, 2020)', 'iPhone SE (1. generacija)',
    'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
    'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
    'iPhone 8 Plus', 'iPhone 8', 'iPhone 7 Plus', 'iPhone 7',
    'iPhone 6s Plus', 'iPhone 6s', 'iPhone 6 Plus', 'iPhone 6', 'iPhone 5s / 5c / 5', DRUGO
  ],
  Samsung: [
    'Galaxy S25 Ultra', 'Galaxy S25+', 'Galaxy S25 Edge', 'Galaxy S25', 'Galaxy S25 FE',
    'Galaxy S24 Ultra', 'Galaxy S24+', 'Galaxy S24', 'Galaxy S24 FE',
    'Galaxy S23 Ultra', 'Galaxy S23+', 'Galaxy S23', 'Galaxy S23 FE',
    'Galaxy S22 Ultra', 'Galaxy S22+', 'Galaxy S22',
    'Galaxy S21 Ultra', 'Galaxy S21+', 'Galaxy S21', 'Galaxy S21 FE',
    'Galaxy S20 Ultra', 'Galaxy S20+', 'Galaxy S20', 'Galaxy S20 FE',
    'Galaxy S10 / S10+ / S10e', 'Galaxy S9 / S9+', 'Galaxy S8 / S8+',
    'Galaxy Z Fold7', 'Galaxy Z Flip7', 'Galaxy Z Fold6', 'Galaxy Z Flip6', 'Galaxy Z Fold5', 'Galaxy Z Flip5',
    'Galaxy Z Fold4', 'Galaxy Z Flip4', 'Galaxy Z Fold3', 'Galaxy Z Flip3',
    'Galaxy Note20 Ultra', 'Galaxy Note20', 'Galaxy Note10 / Note10+', 'Galaxy Note9',
    'Galaxy A56', 'Galaxy A55', 'Galaxy A54', 'Galaxy A53', 'Galaxy A52 / A52s', 'Galaxy A51',
    'Galaxy A36', 'Galaxy A35', 'Galaxy A34', 'Galaxy A33', 'Galaxy A32',
    'Galaxy A26', 'Galaxy A25', 'Galaxy A24', 'Galaxy A23', 'Galaxy A22',
    'Galaxy A17', 'Galaxy A16', 'Galaxy A15', 'Galaxy A14', 'Galaxy A13', 'Galaxy A12',
    'Galaxy A06 / A05 / A04', 'Galaxy A (starejši modeli)',
    'Galaxy M serija', 'Galaxy XCover', DRUGO
  ],
  Xiaomi: [
    'Xiaomi 15 Ultra', 'Xiaomi 15', 'Xiaomi 14T Pro', 'Xiaomi 14T', 'Xiaomi 14 Ultra', 'Xiaomi 14',
    'Xiaomi 13T Pro', 'Xiaomi 13T', 'Xiaomi 13 Ultra', 'Xiaomi 13 Pro', 'Xiaomi 13', 'Xiaomi 13 Lite',
    'Xiaomi 12T Pro', 'Xiaomi 12T', 'Xiaomi 12 Pro', 'Xiaomi 12', 'Xiaomi 11T Pro', 'Xiaomi 11T', 'Mi 11 / Mi 11 Ultra', 'Mi 10 / Mi 10T',
    'Redmi Note 14 Pro+', 'Redmi Note 14 Pro', 'Redmi Note 14',
    'Redmi Note 13 Pro+', 'Redmi Note 13 Pro', 'Redmi Note 13',
    'Redmi Note 12 Pro+', 'Redmi Note 12 Pro', 'Redmi Note 12', 'Redmi Note 11 / 10 / 9',
    'Redmi 14C / 13C / 13', 'Redmi 12C / 12', 'Redmi A serija',
    'POCO F7 Pro', 'POCO F7', 'POCO F6 Pro', 'POCO F6', 'POCO F5 Pro', 'POCO F5', 'POCO F4 / F3',
    'POCO X7 Pro', 'POCO X7', 'POCO X6 Pro', 'POCO X6', 'POCO X5 Pro', 'POCO X4 Pro', 'POCO M serija', 'POCO C serija', DRUGO
  ],
  Huawei: [
    'Pura 70 Ultra', 'Pura 70 Pro', 'Pura 70', 'P60 Pro', 'P50 Pro', 'P40 Pro', 'P40', 'P40 Lite', 'P30 Pro', 'P30', 'P30 Lite', 'P20 Pro',
    'Mate 60 Pro', 'Mate 50 Pro', 'Mate 40 Pro', 'Mate 30 Pro', 'Mate 20 Pro', 'Mate X serija',
    'Nova 12', 'Nova 11', 'Nova 10', 'Nova Y serija', 'Honor (stari modeli)', DRUGO
  ],
  'Google (Pixel)': [
    'Pixel 10 Pro XL', 'Pixel 10 Pro', 'Pixel 10 Pro Fold', 'Pixel 10',
    'Pixel 9 Pro XL', 'Pixel 9 Pro Fold', 'Pixel 9 Pro', 'Pixel 9', 'Pixel 9a',
    'Pixel 8 Pro', 'Pixel 8', 'Pixel 8a', 'Pixel 7 Pro', 'Pixel 7', 'Pixel 7a',
    'Pixel 6 Pro', 'Pixel 6', 'Pixel 6a', 'Pixel 5 / 5a', 'Pixel 4 / 4 XL / 4a', 'Pixel 3 / 3a', 'Pixel Fold', DRUGO
  ],
  OnePlus: [
    'OnePlus 13', 'OnePlus 13R', 'OnePlus 12', 'OnePlus 12R', 'OnePlus 11', 'OnePlus 10 Pro', 'OnePlus 10T', 'OnePlus 9 Pro', 'OnePlus 9', 'OnePlus 8 / 8 Pro / 8T',
    'OnePlus Nord 4', 'OnePlus Nord CE4', 'OnePlus Nord 3', 'OnePlus Nord CE3', 'OnePlus Nord 2 / 2T', 'OnePlus Nord N serija', 'OnePlus Open', DRUGO
  ],
  Motorola: [
    'Razr 60 Ultra', 'Razr 50 Ultra', 'Razr 50', 'Razr 40 Ultra', 'Razr 40',
    'Edge 60 Pro', 'Edge 50 Ultra', 'Edge 50 Pro', 'Edge 50 Fusion', 'Edge 40 Pro', 'Edge 40 Neo', 'Edge 30 serija',
    'Moto G85', 'Moto G84', 'Moto G75', 'Moto G55', 'Moto G54', 'Moto G53', 'Moto G34', 'Moto G24', 'Moto G14', 'Moto G (starejši)', 'Moto E serija', DRUGO
  ],
  Nokia: ['Nokia G60', 'Nokia G42', 'Nokia G22', 'Nokia G11', 'Nokia X30', 'Nokia X20', 'Nokia XR21', 'Nokia C serija', 'Nokia 8.3 / 7.2 / 6.2', 'Nokia 3310', 'Nokia 105 / 110 / 130', 'Nokia 225 / 230', 'Nokia 2660 / 2780 Flip', 'Nokia 8110', DRUGO],
  Sony: ['Xperia 1 VII', 'Xperia 1 VI', 'Xperia 1 V', 'Xperia 1 IV', 'Xperia 5 V', 'Xperia 5 IV', 'Xperia 10 VII', 'Xperia 10 VI', 'Xperia 10 V', 'Xperia 10 IV', 'Xperia Pro-I', 'Xperia XZ serija', DRUGO],
  Oppo: ['Find X8 Pro', 'Find X8', 'Find X7 Ultra', 'Find X6 Pro', 'Find X5 Pro', 'Find N3 / N3 Flip', 'Reno 13', 'Reno 12', 'Reno 11', 'Reno 10', 'Reno 8 / 7 / 6', 'A serija', DRUGO],
  Realme: ['GT 7 Pro', 'GT 6', 'GT 5 Pro', 'Realme 14 Pro+', 'Realme 13 Pro+', 'Realme 12 Pro+', 'Realme 11 Pro+', 'Realme C serija', 'Realme Narzo', 'Realme Note', DRUGO],
  Honor: ['Magic7 Pro', 'Magic6 Pro', 'Magic5 Pro', 'Magic V3 / V2', 'Honor 400', 'Honor 200 Pro', 'Honor 200', 'Honor 90', 'Honor 70', 'Honor X9 / X8 / X7', DRUGO],
  Nothing: ['Phone (3)', 'Phone (3a) Pro', 'Phone (3a)', 'Phone (2a) Plus', 'Phone (2a)', 'Phone (2)', 'Phone (1)', 'CMF Phone 2 Pro', 'CMF Phone 1', DRUGO],
  Asus: ['ROG Phone 9 Pro', 'ROG Phone 9', 'ROG Phone 8', 'ROG Phone 7', 'ROG Phone 6', 'Zenfone 11 Ultra', 'Zenfone 10', 'Zenfone 9', DRUGO],
  Vivo: ['X200 Pro', 'X200', 'X100 Pro', 'X100', 'X90 Pro', 'V40', 'V30', 'V29', 'Y serija', DRUGO],
  Fairphone: ['Fairphone 5', 'Fairphone 4', 'Fairphone 3 / 3+', DRUGO],
  'Drugo': [DRUGO]
};

export const ELECTRONICS_MODELS: Record<string, string[]> = {
  Apple: ['iPad Pro', 'iPad Air', 'iPad (osnovni)', 'iPad mini', 'Apple Watch Ultra', 'Apple Watch Series 10 / 9 / 8', 'Apple Watch SE', 'AirPods Pro', 'AirPods Max', 'AirPods (osnovne)', 'Apple TV', 'HomePod', 'AirTag', DRUGO],
  Samsung: ['Televizor QLED / Neo QLED', 'Televizor OLED', 'Televizor Crystal UHD', 'Galaxy Tab S10 / S9 / S8', 'Galaxy Tab A serija', 'Galaxy Watch 7 / 6 / 5', 'Galaxy Buds3 / Buds2 / Buds FE', 'Soundbar', DRUGO],
  Xiaomi: ['Pametna ura / Watch', 'Smart Band', 'Redmi Buds / Xiaomi Buds', 'Pad (tablica)', 'TV serija', 'Robotski sesalnik', 'Električni skiro', DRUGO],
  Huawei: ['MatePad', 'Watch GT / Watch Fit', 'FreeBuds', 'Band', DRUGO],
  'Google (Pixel)': ['Pixel Tablet', 'Pixel Watch 3 / 2 / 1', 'Pixel Buds Pro / A', 'Nest', 'Chromecast', DRUGO],
  Sony: ['PlayStation 5 Pro', 'PlayStation 5 (disk)', 'PlayStation 5 Digital', 'PlayStation 5 Slim', 'PlayStation 4 Pro', 'PlayStation 4 Slim', 'PlayStation 4', 'PlayStation 3 / 2', 'PS VR2 / PS VR', 'DualSense / DualShock', 'WH-1000XM6 / XM5 / XM4', 'WF-1000XM5 / XM4', 'Alpha A7 serija', 'Alpha A6000 serija', 'ZV-E serija', 'Bravia TV', 'Walkman', DRUGO],
  LG: ['OLED TV (C / G / B serija)', 'QNED / NanoCell TV', 'Soundbar', 'Monitor UltraGear / UltraWide', 'Tone Free', DRUGO],
  JBL: ['Flip 6 / 5', 'Charge 5 / 4', 'Xtreme 4 / 3', 'Boombox 3 / 2', 'Clip 5 / 4', 'Go 4 / 3', 'PartyBox', 'Tune / Live / Tour slušalke', 'Soundbar', DRUGO],
  Garmin: ['Fenix 8 / 7 / 6', 'Forerunner 965 / 265 / 255 / 55', 'Venu 3 / 2', 'Instinct 3 / 2', 'Vivoactive 5 / 4', 'Edge (kolesarski)', 'Epix', 'Enduro', 'Navigacija DriveSmart', DRUGO],
  PlayStation: ['PlayStation 5 Pro', 'PlayStation 5 (disk)', 'PlayStation 5 Digital', 'PlayStation 5 Slim', 'PlayStation 4 Pro', 'PlayStation 4 Slim', 'PlayStation 4', 'PlayStation 3', 'PlayStation Portal', 'PS VR2 / PS VR', 'Kontroler DualSense', DRUGO],
  Nintendo: ['Switch 2', 'Switch OLED', 'Switch (standardna)', 'Switch Lite', '3DS / 2DS', 'Wii U / Wii', 'Game Boy', 'Joy-Con / Pro kontroler', DRUGO],
  Xbox: ['Xbox Series X', 'Xbox Series S', 'Xbox One X', 'Xbox One S', 'Xbox One', 'Xbox 360', 'Kontroler', DRUGO],
  Canon: ['EOS R5 / R6 / R7 / R8 / R10', 'EOS R50 / RP', 'EOS 5D / 6D', 'EOS 90D / 80D / 7D', 'EOS 250D / 850D / 2000D', 'PowerShot G7X / G5X', 'Objektiv RF', 'Objektiv EF / EF-S', 'Video kamera', DRUGO],
  Nikon: ['Z9 / Z8', 'Z6 / Z7 (II / III)', 'Z5 / Z f / Z fc', 'Z50 / Z30', 'D850 / D810 / D780', 'D750 / D7500 / D500', 'D5600 / D3500', 'Objektiv Z', 'Objektiv F', 'Coolpix', DRUGO],
  GoPro: ['Hero 13 Black', 'Hero 12 Black', 'Hero 11 Black / Mini', 'Hero 10 / 9 Black', 'Hero 8 / 7', 'Max', 'Dodatki', DRUGO],
  Bose: ['QuietComfort Ultra slušalke', 'QuietComfort 45 / 35', 'QuietComfort Earbuds', 'SoundLink Flex / Micro / Revolve', 'Soundbar', 'Smart Speaker', DRUGO],
  Marshall: ['Emberton', 'Stanmore', 'Woburn', 'Acton', 'Kilburn', 'Tufton', 'Major / Monitor / Motif slušalke', DRUGO],
  'Drugo': [DRUGO]
};

export const COMPUTER_MODELS: Record<string, string[]> = {
  'Apple (MacBook / iMac)': ['MacBook Air M4', 'MacBook Air M3', 'MacBook Air M2', 'MacBook Air M1', 'MacBook Air (Intel)', 'MacBook Pro 16" (M4 / M3 / M2 / M1)', 'MacBook Pro 14" (M4 / M3 / M2 / M1)', 'MacBook Pro 13" (M2 / M1)', 'MacBook Pro (Intel)', 'iMac 24"', 'iMac (Intel)', 'Mac mini', 'Mac Studio', 'Mac Pro', DRUGO],
  'Lenovo (ThinkPad / Legion)': ['ThinkPad X1 Carbon', 'ThinkPad X1 Yoga', 'ThinkPad T serija', 'ThinkPad E serija', 'ThinkPad L serija', 'ThinkPad P serija', 'ThinkPad X serija', 'Legion 9 / 7 / 5', 'Legion Go', 'LOQ', 'IdeaPad', 'Yoga', 'ThinkCentre', DRUGO],
  'HP (Pavilion / Omen / EliteBook)': ['EliteBook', 'ProBook', 'ZBook', 'Spectre x360', 'Envy', 'Pavilion', 'Omen', 'Victus', '250 / 255 serija', 'Dragonfly', 'EliteDesk / ProDesk', DRUGO],
  'Dell (XPS / Latitude / Alienware)': ['XPS 13', 'XPS 15', 'XPS 17', 'Latitude', 'Precision', 'Inspiron', 'Vostro', 'G15 / G16', 'Alienware m / x serija', 'Alienware Aurora', 'OptiPlex', DRUGO],
  'Asus (ROG / ZenBook)': ['ROG Strix', 'ROG Zephyrus', 'ROG Flow', 'ROG Ally', 'TUF Gaming', 'ZenBook', 'VivoBook', 'ExpertBook', 'ProArt', DRUGO],
  'Acer (Predator / Swift)': ['Predator Helios', 'Predator Triton', 'Nitro', 'Swift', 'Aspire', 'TravelMate', 'Spin', 'Chromebook', DRUGO],
  MSI: ['Titan', 'Raider', 'Stealth', 'Vector', 'Katana', 'Cyborg', 'Thin', 'Prestige', 'Modern', DRUGO],
  'Custom / Lastna sestava': [DRUGO],
  'Drugo': [DRUGO]
};

export const CAR_MODELS: Record<string, string[]> = {
  Volkswagen: ['Golf', 'Passat', 'Polo', 'Tiguan', 'T-Roc', 'T-Cross', 'Touran', 'Touareg', 'Caddy', 'Transporter / Multivan', 'Arteon', 'Up!', 'ID.3', 'ID.4', 'ID.5', 'ID. Buzz', 'Jetta', 'Scirocco', 'Sharan', DRUGO],
  Renault: ['Clio', 'Megane', 'Captur', 'Kadjar', 'Scenic', 'Twingo', 'Zoe', 'Kangoo', 'Trafic', 'Master', 'Austral', 'Arkana', 'Laguna', 'Espace', 'Talisman', 'Duster (Dacia)', DRUGO],
  BMW: ['Serija 1', 'Serija 2', 'Serija 3', 'Serija 4', 'Serija 5', 'Serija 6', 'Serija 7', 'Serija 8', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'i3', 'i4', 'iX', 'iX3', 'M modeli', DRUGO],
  Audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'e-tron', 'TT', 'R8', 'S / RS modeli', DRUGO],
  'Mercedes-Benz': ['A-razred', 'B-razred', 'C-razred', 'E-razred', 'S-razred', 'CLA', 'CLS', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'G-razred', 'V-razred / Vito', 'Sprinter', 'EQA / EQB / EQC', 'EQE / EQS', 'SLK / SL', 'AMG modeli', DRUGO],
  'Škoda': ['Fabia', 'Octavia', 'Superb', 'Rapid', 'Scala', 'Kamiq', 'Karoq', 'Kodiaq', 'Enyaq', 'Citigo', 'Yeti', 'Roomster', DRUGO],
  Peugeot: ['107 / 108', '206', '207', '208', '2008', '301', '307', '308', '3008', '407', '408', '508', '5008', 'Partner / Rifter', 'Expert / Traveller', 'Boxer', 'e-208 / e-2008', DRUGO],
  Ford: ['Fiesta', 'Focus', 'Mondeo', 'Kuga', 'Puma', 'EcoSport', 'Mustang', 'Mustang Mach-E', 'C-Max / Grand C-Max', 'S-Max', 'Galaxy', 'Transit', 'Transit Custom / Connect', 'Ranger', 'Ka / Ka+', 'Explorer', DRUGO],
  Toyota: ['Yaris', 'Yaris Cross', 'Corolla', 'Auris', 'Avensis', 'Camry', 'C-HR', 'RAV4', 'Highlander', 'Land Cruiser', 'Hilux', 'Aygo / Aygo X', 'Prius', 'bZ4X', 'Verso', 'GT86 / GR86', 'Supra', DRUGO],
  Hyundai: ['i10', 'i20', 'i30', 'i40', 'Kona', 'Tucson', 'Santa Fe', 'Bayon', 'ix20 / ix35', 'Ioniq', 'Ioniq 5', 'Ioniq 6', 'Getz / Accent / Elantra', 'H-1 / Staria', DRUGO],
  Kia: ['Picanto', 'Rio', 'Ceed / Pro Ceed', 'XCeed', 'Stonic', 'Niro', 'Sportage', 'Sorento', 'Stinger', 'Optima / K5', 'Soul', 'EV6', 'EV9', 'Carens / Venga', DRUGO],
  Honda: ['Jazz', 'Civic', 'Accord', 'CR-V', 'HR-V', 'ZR-V', 'e', 'Insight', 'Legend', 'S2000', DRUGO],
  Opel: ['Corsa', 'Astra', 'Insignia', 'Mokka', 'Crossland', 'Grandland', 'Zafira', 'Meriva', 'Adam', 'Karl', 'Combo', 'Vivaro', 'Movano', 'Vectra / Omega', DRUGO],
  'Citroën': ['C1', 'C3', 'C3 Aircross', 'C4', 'C4 Cactus', 'C5', 'C5 Aircross', 'C-Elysée', 'Berlingo', 'Jumpy / Dispatch', 'Jumper', 'DS3 / DS4 / DS5', 'Xsara / Saxo', DRUGO],
  Fiat: ['500', '500X', '500L', 'Panda', 'Tipo', 'Punto / Grande Punto', 'Bravo', 'Doblo', 'Ducato', 'Fiorino', 'Qubo', 'Stilo / Brava', 'Seicento', DRUGO],
  Volvo: ['V40', 'V50', 'V60', 'V70', 'V90', 'S40', 'S60', 'S80', 'S90', 'XC40', 'XC60', 'XC70', 'XC90', 'C30 / C70', 'EX30 / EX90', DRUGO],
  Mazda: ['Mazda2', 'Mazda3', 'Mazda5', 'Mazda6', 'CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-7', 'CX-9', 'MX-5', 'MX-30', 'RX-8', DRUGO],
  Seat: ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco', 'Alhambra', 'Altea', 'Toledo', 'Mii', 'Cupra Formentor', 'Cupra Born', 'Cupra Leon', DRUGO],
  Nissan: ['Micra', 'Note', 'Juke', 'Qashqai', 'X-Trail', 'Leaf', 'Ariya', 'Navara', 'Primera / Almera', 'Pulsar', '350Z / 370Z', 'GT-R', 'Patrol', DRUGO],
  Tesla: ['Model 3', 'Model S', 'Model X', 'Model Y', 'Cybertruck', DRUGO],
  'Yamaha (Moto)': ['MT-07', 'MT-09', 'MT-03 / MT-125', 'YZF-R1', 'YZF-R6', 'YZF-R7', 'YZF-R125 / R3', 'Tracer 7 / 9', 'Ténéré 700', 'XSR 700 / 900', 'Tmax', 'XMAX', 'NMAX', 'Aerox', 'Drugi motor / skuter', DRUGO],
  'Honda (Moto)': ['CBR 600 / 650 / 1000', 'CB 500 / 650 / 1000', 'Africa Twin', 'NC750', 'Transalp', 'Hornet', 'Forza / SH / PCX', 'Gold Wing', 'Rebel', 'CRF (enduro / cross)', 'Drugi motor / skuter', DRUGO],
  'Kawasaki (Moto)': ['Ninja 400 / 650 / 1000', 'Ninja ZX-6R / ZX-10R', 'Z650 / Z900 / Z1000', 'Versys', 'Vulcan', 'KLX / KX', 'Drugi motor', DRUGO],
  'Drugo': [DRUGO]
};

// Deutscher Kommentar: Vereinigung aller Modelle eines Katalogs (Fallback und Gueltigkeitspruefung)
export const flattenModels = (catalog: Record<string, string[]>): string[] =>
  Array.from(new Set(Object.values(catalog).flat()));
