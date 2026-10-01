const fs = require('fs');
let content = fs.readFileSync('src/types/index.ts', 'utf8');

const target = `export enum Category {
  Oblacila = 'Oblačila',
  Racunalniki = 'Računalniki',
  ProstiCasInSport = 'Prosti čas in šport',
  DomInVrt = 'Dom in vrt',
  Avtomobilizem = 'Avtomobilizem',
  Nepremicnine = 'Nepremičnine',
  LepotaInZdravje = 'Lepota in zdravje',
  OtroškaOprema = 'Otroška oprema',
  Kmetijstvo = 'Kmetijstvo',
  Umetnine = 'Umetnine',
  Glasbila = 'Glasbila',
  Zbirateljstvo = 'Zbirateljstvo',
  Ostalo = 'Ostalo'
}`;

const replacement = `export enum Category {
  Oblacila = 'Oblačila',
  Racunalniki = 'Računalniki',
  ProstiCasInSport = 'Prosti čas in šport',
  DomInVrt = 'Dom in vrt',
  Avtomobilizem = 'Avtomobilizem',
  Nepremicnine = 'Nepremičnine',
  LepotaInZdravje = 'Lepota in zdravje',
  OtroškaOprema = 'Otroška oprema',
  Kmetijstvo = 'Kmetijstvo',
  Umetnine = 'Umetnine',
  Glasbila = 'Glasbila',
  Zbirateljstvo = 'Zbirateljstvo',
  Orodja = 'Orodja in stroji',
  Elektronika = 'Zabavna elektronika',
  Knjige = 'Knjige in revije',
  Zivali = 'Živali in oprema',
  Navtika = 'Navtika',
  Gostinstvo = 'Gostinska oprema',
  Gradbenistvo = 'Gradbeništvo',
  Starine = 'Starine in umetnine',
  Ostalo = 'Ostalo'
}`;

content = content.replace(target, replacement);
fs.writeFileSync('src/types/index.ts', content);
