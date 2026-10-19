// Deutscher Kommentar: Gemeinsame URL-Zuordnung der Kategorien (Client-Routing und serverseitiges SEO)
import { Category } from '../types';

export const CATEGORY_URL_MAP: Record<Category, Record<string, string>> = {
  [Category.Oblacila]: { SLO: "oblacila", EN: "clothing", DE: "kleidung" },
  [Category.Telefoni]: { SLO: "telefoni", EN: "phones", DE: "handys" },
  [Category.Racunalniki]: { SLO: "racunalniki", EN: "computers", DE: "computer" },
  [Category.ProstiCasInSport]: { SLO: "prosti-cas-in-sport", EN: "leisure-and-sport", DE: "freizeit-und-sport" },
  [Category.DomInVrt]: { SLO: "dom-in-vrt", EN: "home-and-garden", DE: "haus-und-garten" },
  [Category.Avtomobilizem]: { SLO: "avtomobilizem", EN: "automotive", DE: "automobil" },
  [Category.Nepremicnine]: { SLO: "nepremicnine", EN: "real-estate", DE: "immobilien" },
  [Category.LepotaInZdravje]: { SLO: "lepota-in-zdravje", EN: "health-and-beauty", DE: "gesundheit-und-schonheit" },
  [Category.OtroškaOprema]: { SLO: "otroska-oprema", EN: "kids-equipment", DE: "kinderausstattung" },
  [Category.Kmetijstvo]: { SLO: "kmetijstvo", EN: "agriculture", DE: "landwirtschaft" },
  [Category.Umetnine]: { SLO: "umetnine", EN: "art", DE: "kunst" },
  [Category.Glasbila]: { SLO: "glasbila", EN: "musical-instruments", DE: "musikinstrumente" },
  [Category.Zbirateljstvo]: { SLO: "zbirateljstvo", EN: "collecting", DE: "sammeln" },
  [Category.Orodja]: { SLO: "orodja-in-stroji", EN: "tools-and-machinery", DE: "werkzeuge-und-maschinen" },
  [Category.Elektronika]: { SLO: "zabavna-elektronika", EN: "consumer-electronics", DE: "unterhaltungselektronik" },
  [Category.Knjige]: { SLO: "knjige-in-revije", EN: "books-and-magazines", DE: "buecher-und-zeitschriften" },
  [Category.Zivali]: { SLO: "zivali-in-oprema", EN: "animals-and-pet-supplies", DE: "tiere-und-tierbedarf" },
  [Category.Navtika]: { SLO: "navtika", EN: "nautical", DE: "nautik" },
  [Category.Gostinstvo]: { SLO: "gostinska-oprema", EN: "catering-equipment", DE: "gastronomiebedarf" },
  [Category.Gradbenistvo]: { SLO: "gradbenistvo", EN: "construction", DE: "bauwesen" },
  [Category.Starine]: { SLO: "starine-in-umetnine", EN: "antiques-and-art", DE: "antiquitaeten-und-kunst" },
  [Category.Ostalo]: { SLO: "ostalo", EN: "other", DE: "sonstiges" }
};
