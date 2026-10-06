
export enum SellerType {
  PRIVATE = 'private',
  BUSINESS = 'business'
}

export enum SubscriptionTier {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PRO = 'PRO'
}

export interface PaymentCard {
  id: string;
  last4: string;
  brand: 'visa' | 'mastercard' | 'amex';
  expiry: string;
  isDefault: boolean;
}

export interface WonItem extends AuctionItem {
  winDate: Date;
  paymentStatus: 'paid' | 'pending' | 'overdue';
  invoiceUrl?: string; // Mock PDF link
  totalAmount: number;
}

export interface Seller {
  id: string;
  type: SellerType;
  name: Record<string, string>;
  companyName?: string; // Only for business
  taxId?: string; // Only for business
  location: Record<string, string>;
  memberSince: string;
  rating: number;
  reviewCount: number;
  totalSold: number;
  positiveFeedback: number;
  description: Record<string, string>;
  subscriptionPlan: SubscriptionTier;
  unpaidStrikes: number; // 0-3
  isBlocked: boolean;
  savedCards: PaymentCard[];
  stripe_account_id?: string;
  stripe_onboarding_complete?: boolean;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
  isVerified: boolean;
  wouldRecommend: boolean;
  auction_id?: string;
  auction_title?: string;
  auction_image?: string;
  author_id?: string;
  seller_id?: string;
  created_at?: string;
}

export interface AuctionItem {
  id: string;
  title: Record<string, string>;
  category: string; 
  currentBid: number;
  bidCount: number;
  itemCount: number; 
  images: string[];
  endTime: Date;
  location: Record<string, string>;
  region: Region; 
  description: Record<string, string>;
  condition: Record<string, string>;
  specifications?: Record<string, any>;
  biddingHistory: BidHistory[];
  sellerId: string;
  sellerName?: string;
  status: 'active' | 'completed' | 'cancelled';
  payment_status?: 'unpaid' | 'paid';
  post_auction_status?: 'pending_payment' | 'paid' | 'passed_to_second' | 'cancelled' | 'second_offer' | 'relisted' | string;
  second_highest_bidder_id?: string;
  top_bids?: Array<{ bidder_id: string; amount: number }>;
  paid_at?: string;
  winnerId?: string;
  winner_id?: string;
  has_second_bidder?: boolean;
  hasSecondBidder?: boolean;
  hiddenMaxBid?: number; // For proxy bidding logic
  delivery_method?: 'pickup' | 'post' | 'shipping';
  delivery_option?: 'both' | 'pickup_only' | 'shipping_only' | string;
  selected_delivery?: 'pickup' | 'post' | 'shipping' | string;
  buyer_received?: boolean;
  is_package?: boolean;
  package_id?: string;
  createdAt?: string | number | Date;
  created_at?: string | number | Date;
}

export interface AuctionPackage {
  id: string;
  title: string;
  seller_id: string;
  status: 'active' | 'ended' | 'paid';
  created_at: number | string;
  end_time?: number | string;
  auction_ids: string[];
}

export interface BidHistory {
  id: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  timestamp: Date;
}

export enum Category {
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
}

export enum Region {
  Pomurska = 'Pomurska',
  Podravska = 'Podravska',
  Koroska = 'Koroška',
  Savinjska = 'Savinjska',
  Zasavska = 'Zasavska',
  Posavska = 'Posavska',
  JugovzhodnaSlovenija = 'Jugovzhodna Slovenija',
  Osrednjeslovenska = 'Osrednjeslovenska',
  Gorenjska = 'Gorenjska',
  PrimorskoNotranjska = 'Primorsko-notranjska',
  Goriska = 'Goriška',
  ObalnoKraska = 'Obalno-kraška'
}

export type ViewState = 'grid' | 'detail' | 'login' | 'sellerProfile' | 'createAuction' | 'settings' | 'verification' | 'winnings' | 'lastChance' | 'subscriptions' | 'watchlist' | 'myBids' | 'mySold' | 'messages' | 'myUnsold' | 'myArchive' | 'testSandbox' | 'package' | 'payoutSetup' | 'acceptTerms';
