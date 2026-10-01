const fs = require('fs');
let content = fs.readFileSync('src/lib/translations.ts', 'utf8');

const target = `export const CATEGORY_TRANSLATION_KEYS: Record<string, string> = {
  'Oblačila': 'cat_clothing',
  'Računalniki': 'cat_computers',
  'Prosti čas in šport': 'cat_leisure',
  'Dom in vrt': 'cat_home',
  'Avtomobilizem': 'cat_auto',
  'Nepremičnine': 'cat_realestate',
  'Lepota in zdravje': 'cat_health',
  'Otroška oprema': 'cat_kids',
  'Kmetijstvo': 'cat_agriculture',
  'Umetnine': 'cat_art',
  'Glasbila': 'cat_instruments',
  'Zbirateljstvo': 'cat_collecting',
  'Ostalo': 'cat_other',
};`;

const newTarget = `export const CATEGORY_TRANSLATION_KEYS: Record<string, string> = {
  'Oblačila': 'cat_clothing',
  'Računalniki': 'cat_computers',
  'Prosti čas in šport': 'cat_leisure',
  'Dom in vrt': 'cat_home',
  'Avtomobilizem': 'cat_auto',
  'Nepremičnine': 'cat_realestate',
  'Lepota in zdravje': 'cat_health',
  'Otroška oprema': 'cat_kids',
  'Kmetijstvo': 'cat_agriculture',
  'Umetnine': 'cat_art',
  'Glasbila': 'cat_instruments',
  'Zbirateljstvo': 'cat_collecting',
  'Orodja in stroji': 'cat_tools',
  'Zabavna elektronika': 'cat_electronics',
  'Knjige in revije': 'cat_books',
  'Živali in oprema': 'cat_animals',
  'Navtika': 'cat_nautical',
  'Gostinska oprema': 'cat_catering',
  'Gradbeništvo': 'cat_construction',
  'Starine in umetnine': 'cat_antiques',
  'Ostalo': 'cat_other',
};`;

content = content.replace(target, newTarget);

const targetSLO = `    cat_other: "Ostalo",`;
const newSLO = `    cat_other: "Ostalo",
    cat_tools: "Orodja in stroji",
    cat_electronics: "Zabavna elektronika",
    cat_books: "Knjige in revije",
    cat_animals: "Živali in oprema",
    cat_nautical: "Navtika",
    cat_catering: "Gostinska oprema",
    cat_construction: "Gradbeništvo",
    cat_antiques: "Starine in umetnine",`;

content = content.replace(targetSLO, newSLO);

const targetEN = `    cat_other: "Other",`;
const newEN = `    cat_other: "Other",
    cat_tools: "Tools & Machinery",
    cat_electronics: "Consumer Electronics",
    cat_books: "Books & Magazines",
    cat_animals: "Animals & Pet Supplies",
    cat_nautical: "Nautical",
    cat_catering: "Catering Equipment",
    cat_construction: "Construction",
    cat_antiques: "Antiques & Art",`;

content = content.replace(targetEN, newEN);

const targetDE = `    cat_other: "Sonstiges",`;
const newDE = `    cat_other: "Sonstiges",
    cat_tools: "Werkzeuge & Maschinen",
    cat_electronics: "Unterhaltungselektronik",
    cat_books: "Bücher & Zeitschriften",
    cat_animals: "Tiere & Tierbedarf",
    cat_nautical: "Nautik",
    cat_catering: "Gastronomiebedarf",
    cat_construction: "Bauwesen",
    cat_antiques: "Antiquitäten & Kunst",`;

content = content.replace(targetDE, newDE);

fs.writeFileSync('src/lib/translations.ts', content);
