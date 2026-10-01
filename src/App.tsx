import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import AuctionView from "@/src/components/auction/AuctionView";
import SellerView from "@/src/components/profile/SellerView";
import { SubscriptionsView } from "@/src/components/profile/SubscriptionsView";
import { VerificationView } from "@/src/components/auth/VerificationView";
import { CreateAuctionForm } from "@/src/components/auction/CreateAuctionForm";
import { CreatePackageForm } from "@/src/components/auction/CreatePackageForm";
import { PackageCard } from "@/src/components/auction/PackageCard";
import { PackageView } from "@/src/components/auction/PackageView";
import { AuthView } from "@/src/components/auth/AuthView";
import { EmailConfirmationView } from "@/src/components/auth/EmailConfirmationView";
import { LegalModal } from "@/src/components/modals/LegalModal";
import { VerificationBanner } from "@/src/components/layout/VerificationBanner";
import { StaticTimer } from "@/src/components/ui/StaticTimer";
import { AuctionCard } from "@/src/components/auction/AuctionCard";
import { HeroCarousel } from "@/src/components/auction/HeroCarousel";
import { Header } from "@/src/components/layout/Header";
import { Footer } from "@/src/components/layout/Footer";
import { CheckoutModal } from "@/src/components/modals/CheckoutModal";
import { SettingsView } from "@/src/components/profile/SettingsView";
import { ConfirmBidModal } from "@/src/components/modals/ConfirmBidModal";
import { MessagesView } from "@/src/components/profile/MessagesView";
import { MissingInvoiceDataModal } from "@/src/components/modals/MissingInvoiceDataModal";
import { CategoryFilterBar, FilterState } from "@/src/components/auction/CategoryFilterBar";
import { checkUserInvoiceData } from "./lib/invoiceDataCheck";
import { getAuthHeaders } from "./lib/authFetch";
import { 
  createAuctionAction, 
  confirmCheckoutSessionAction, 
  notifyOutbidAction,
  checkAuctionsCronAction,
  cancelSubscriptionAction,
  confirmReceiptAction,
  syncUserSubscriptionAction,
  submitReviewAction
} from "@/src/actions/index";
import {
  Search,
  User,
  Globe,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  TrendingUp,
  Gavel,
  ArrowLeft,
  ChevronDown,
  ShieldCheck,
  Building2,
  Eye,
  Plus,
  Minus,
  Lock,
  CheckCircle2,
  Mail,
  Phone,
  CreditCard as CardIcon,
  PlusCircle,
  Settings,
  LogOut,
  Star,
  Camera,
  Landmark,
  FileCheck,
  AlertCircle,
  X,
  Calendar,
  UserCheck,
  MessageSquare,
  History,
  Briefcase,
  Upload,
  Image as ImageIcon,
  ArrowUp,
  Trophy,
  AlertTriangle,
  Info,
  Table,
  Truck,
  Zap,
  Download,
  CreditCard,
  AlertOctagon,
  Trash2,
  Filter,
  LayoutGrid,
  List,
  Scale,
  FileText,
  HelpCircle,
  Languages,
  FileUp,
} from "lucide-react";

import imageCompression from "browser-image-compression";

import { seedDatabase } from "./lib/seed";

import {
  AuctionItem,
  Region,
  ViewState,
  Seller,
  Review,
  SellerType,
  SubscriptionTier,
  PaymentCard,
  WonItem,
  Category,
} from "./types";

import { Toaster } from "sonner";
import { toast } from "@/src/lib/toast";

import { ChatProvider } from "./context/ChatContext";
import { collection, onSnapshot, setDoc, doc, getDocs, getDoc, updateDoc, addDoc, deleteDoc, query, where } from "firebase/firestore";
import { db, auth, storage, safeSignOut, cleanupAllListeners, registerSnapshotListener, isRegisteringAuth } from "./lib/firebase";
import { onAuthStateChanged, updatePassword } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- CONFIGURATION ---

import { translations, getCategoryTranslation } from "./lib/translations";
import {
  getIncrement,
  formatSeconds,
  calculateMarginalPlatformFee,
  normalizeRegionName,
} from "./lib/utils";

const matchesSelectedRegion = (itemRegion: string | undefined | null, selected: string | null): boolean => {
  if (!selected) return true;
  return normalizeRegionName(itemRegion) === normalizeRegionName(selected);
};

// --- MAIN APP COMPONENT ---

import { InvoiceModal } from "@/src/components/modals/InvoiceModal";
import { ReviewModal } from "@/src/components/modals/ReviewModal";
import { TestSandboxView } from "@/src/components/flow/TestSandboxView";
import { 
  mockSandboxPackageId, 
  mockSandboxPackageItems 
} from "./data/mockSandboxData";

// SignedImg component for fetching Supabase signed URLs
const SignedImg = ({
  src,
  alt,
  className,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) => {
  const [signedUrl, setSignedUrl] = useState<string>("");
  useEffect(() => {
    if (!src) return;
    if (src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:")) {
      setSignedUrl(src);
      return;
    }
    setSignedUrl(`https://storage.googleapis.com/auction-images/${src}`);
  }, [src]);
  return (
    <img
      src={signedUrl || src}
      alt={alt}
      loading="lazy"
      className={className}
      onClick={onClick}
      referrerPolicy="no-referrer"
    />
  );
};

import { Timer } from "lucide-react";

const PaymentTimer: React.FC<{ endTime: string | Date }> = ({ endTime }) => {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    const deadline = new Date(endTime).getTime() + 48 * 60 * 60 * 1000;

    const updateTimer = () => {
      const now = new Date().getTime();
      const difference = deadline - now;

      if (difference <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setTimeLeft({
        hours: Math.floor(difference / (1000 * 60 * 60)),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (!timeLeft) return null;

  if (
    timeLeft.hours === 0 &&
    timeLeft.minutes === 0 &&
    timeLeft.seconds === 0
  ) {
    return (
      <span className="text-red-500 font-bold flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
        <Timer size={14} /> Čas za plačilo je potekel (48h)
      </span>
    );
  }

  return (
    <span className="text-amber-500 font-bold flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
      <Timer size={16} /> Čas za plačilo:{" "}
      {String(timeLeft.hours).padStart(2, "0")}:
      {String(timeLeft.minutes).padStart(2, "0")}:
      {String(timeLeft.seconds).padStart(2, "0")}
    </span>
  );
};

// -------------------------------------------------------------
// MULTILINGUAL SLUG MAPPINGS FOR CATEGORIES, REGIONS, & SETTINGS
// -------------------------------------------------------------
const CATEGORY_URL_MAP: Record<Category, Record<string, string>> = {
  [Category.Oblacila]: { SLO: "oblacila", EN: "clothing", DE: "kleidung" },
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

const REGION_URL_MAP: Record<Region, Record<string, string>> = {
  [Region.Pomurska]: { SLO: "pomurska", EN: "pomurska", DE: "pomurska" },
  [Region.Podravska]: { SLO: "podravska", EN: "podravska", DE: "podravska" },
  [Region.Koroska]: { SLO: "koroska", EN: "koroska", DE: "koroska" },
  [Region.Savinjska]: { SLO: "savinjska", EN: "savinjska", DE: "savinjska" },
  [Region.Zasavska]: { SLO: "zasavska", EN: "zasavska", DE: "zasavska" },
  [Region.Posavska]: { SLO: "posavska", EN: "posavska", DE: "posavska" },
  [Region.JugovzhodnaSlovenija]: { SLO: "jugovzhodna-slovenija", EN: "jugovzhodna-slovenija", DE: "jugovzhodna-slovenija" },
  [Region.Osrednjeslovenska]: { SLO: "osrednjeslovenska", EN: "osrednjeslovenska", DE: "osrednjeslovenska" },
  [Region.Gorenjska]: { SLO: "gorenjska", EN: "gorenjska", DE: "gorenjska" },
  [Region.PrimorskoNotranjska]: { SLO: "primorsko-notranjska", EN: "primorsko-notranjska", DE: "primorsko-notranjska" },
  [Region.Goriska]: { SLO: "goriska", EN: "goriska", DE: "goriska" },
  [Region.ObalnoKraska]: { SLO: "obalno-kraska", EN: "obalno-kraska", DE: "obalno-kraska" }
};

const QUERY_PARAM_MAP = {
  category: { SLO: "kategorija", EN: "category", DE: "kategorie" },
  region: { SLO: "regija", EN: "region", DE: "region" },
  tab: { SLO: "zavihek", EN: "tab", DE: "tab" }
};

const SETTINGS_TAB_MAP: Record<'profile' | 'personal' | 'stripe', Record<string, string>> = {
  profile: { SLO: "profil", EN: "profile", DE: "profil" },
  personal: { SLO: "osebno", EN: "personal", DE: "persoenlich" },
  stripe: { SLO: "placila", EN: "billing", DE: "zahlungen" }
};

function slugToCategory(slug: string): Category | null {
  if (!slug) return null;
  const decoded = decodeURIComponent(slug).toLowerCase().trim();
  for (const [cat, langMap] of Object.entries(CATEGORY_URL_MAP)) {
    for (const val of Object.values(langMap)) {
      if (val.toLowerCase() === decoded) {
        return cat as Category;
      }
    }
  }
  return null;
}

function slugToRegion(slug: string): Region | null {
  if (!slug) return null;
  const decoded = decodeURIComponent(slug).toLowerCase().trim();
  for (const [reg, langMap] of Object.entries(REGION_URL_MAP)) {
    for (const val of Object.values(langMap)) {
      if (val.toLowerCase() === decoded) {
        return reg as Region;
      }
    }
  }
  return null;
}

function slugToSettingsTab(slug: string): 'profile' | 'personal' | 'stripe' {
  if (!slug) return "profile";
  const decoded = decodeURIComponent(slug).toLowerCase().trim();
  for (const [tab, langMap] of Object.entries(SETTINGS_TAB_MAP)) {
    for (const val of Object.values(langMap)) {
      if (val.toLowerCase() === decoded) {
        return tab as 'profile' | 'personal' | 'stripe';
      }
    }
  }
  return "profile";
}

const MainApp: React.FC = () => {
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "SLO";
    const path = window.location.pathname;
    if (path.startsWith("/de/") || path === "/de") return "DE";
    if (path.startsWith("/en/") || path === "/en") return "EN";
    if (path.startsWith("/sl/") || path === "/sl") return "SLO";
    
    const isSessionActive = sessionStorage.getItem("session_tab_active");
    if (isSessionActive) {
      const savedRoute = localStorage.getItem("last_active_route");
      if (savedRoute) {
         if (savedRoute.startsWith("/de/") || savedRoute === "/de") return "DE";
         if (savedRoute.startsWith("/en/") || savedRoute === "/en") return "EN";
      }
    }
    return "SLO";
  });
  const t = useCallback(
    (key: string) => {
      const normalizedLang = (language === 'EN' || language === 'en') ? 'EN' : (language === 'DE' || language === 'de') ? 'DE' : 'SLO';
      return translations[normalizedLang]?.[key] || translations['SLO']?.[key] || translations['EN']?.[key] || '';
    },
    [language],
  );

  const [auctions, setAuctions] = useState<AuctionItem[]>(
    [],
  );
  const [lastSeenWinnings, setLastSeenWinnings] = useState(() => Number(localStorage.getItem('last_seen_winnings') || "0"));
  const [activeView, setActiveView] = useState<ViewState>(() => {
    if (typeof window === "undefined") return "grid";
    const isSessionActive = sessionStorage.getItem("session_tab_active");
    if (!isSessionActive) {
      return "grid";
    }
    let path = window.location.pathname;

    let langPrefix = "";
    if (path.startsWith("/de/") || path === "/de") langPrefix = "/de";
    else if (path.startsWith("/en/") || path === "/en") langPrefix = "/en";
    else if (path.startsWith("/sl/") || path === "/sl") langPrefix = "/sl";

    let checkPath = path;
    if ((checkPath === "/" || checkPath === "/de" || checkPath === "/en" || checkPath === "/sl" || checkPath === "/de/" || checkPath === "/en/" || checkPath === "/sl/") && !window.location.search) {
      const savedRoute = localStorage.getItem("last_active_route");
      if (savedRoute && savedRoute !== "/" && !savedRoute.match(/^\/(en|de|sl)\/?$/)) {
        try {
          const url = new URL(savedRoute, window.location.origin);
          checkPath = url.pathname;
          if (checkPath.startsWith("/de/") || checkPath === "/de") langPrefix = "/de";
          else if (checkPath.startsWith("/en/") || checkPath === "/en") langPrefix = "/en";
          else if (checkPath.startsWith("/sl/") || checkPath === "/sl") langPrefix = "/sl";
        } catch (e) {}
      }
    }

    if (langPrefix && checkPath.startsWith(langPrefix)) {
      checkPath = checkPath.slice(langPrefix.length) || "/";
    }

    if (checkPath.startsWith("/sporocila") || checkPath.startsWith("/messages") || checkPath.startsWith("/nachrichten"))
      return "messages";
    if (checkPath.startsWith("/drazba") || checkPath.startsWith("/auction") || checkPath.startsWith("/auktion")) return "detail";
    if (checkPath.startsWith("/drazbe") || checkPath.startsWith("/auctions") || checkPath.startsWith("/auktionen")) return "grid";
    if (checkPath.startsWith("/prodajalec") || checkPath.startsWith("/seller") || checkPath.startsWith("/verkaufer"))
      return "sellerProfile";
    if (
      checkPath.startsWith("/nastavitve") ||
      checkPath.startsWith("/settings") ||
      checkPath.startsWith("/einstellungen")
    )
      return "settings";
    if (
      checkPath.startsWith("/narocnine") ||
      checkPath.startsWith("/subscriptions") ||
      checkPath.startsWith("/abonnements")
    )
      return "subscriptions";
    if (checkPath.startsWith("/prijava") || checkPath.startsWith("/login") || checkPath.startsWith("/anmelden"))
      return "login";
    if (
      checkPath.startsWith("/ustvari-drazbo") ||
      checkPath.startsWith("/create-auction") ||
      checkPath.startsWith("/auktion-erstellen")
    )
      return "createAuction";
    if (
      checkPath.startsWith("/moje-zmage") ||
      checkPath.startsWith("/my-winnings") ||
      checkPath.startsWith("/meine-gewinne")
    )
      return "winnings";
    if (
      checkPath.startsWith("/moje-ponudbe") ||
      checkPath.startsWith("/my-bids") ||
      checkPath.startsWith("/meine-gebote")
    )
      return "myBids";
    if (checkPath.startsWith("/prodano") || checkPath.startsWith("/my-sold") || checkPath.startsWith("/verkauft"))
      return "mySold";
    if (
      checkPath.startsWith("/neprodano") ||
      checkPath.startsWith("/my-unsold") ||
      checkPath.startsWith("/unverkauft")
    )
      return "myUnsold";
    if (
      checkPath.startsWith("/seznam-zelja") ||
      checkPath.startsWith("/watchlist") ||
      checkPath.startsWith("/beobachtungsliste")
    )
      return "watchlist";
    if (
      checkPath.startsWith("/zadnja-priloznost") ||
      checkPath.startsWith("/last-chance") ||
      checkPath.startsWith("/letzte-chance")
    )
      return "lastChance";
    if (
      checkPath.startsWith("/verifikacija") ||
      checkPath.startsWith("/verification") ||
      checkPath.startsWith("/verifizierung")
    )
      return "verification";
    return "grid";
  });

  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => {
    if (typeof window === "undefined") return null;
    const isSessionActive = sessionStorage.getItem("session_tab_active");
    if (!isSessionActive) {
      return null;
    }
    let url = new URL(window.location.href);
    if (url.pathname === "/" && !url.search) {
      const savedRoute = localStorage.getItem("last_active_route");
      if (savedRoute && savedRoute !== "/") {
        try {
          url = new URL(savedRoute, window.location.origin);
        } catch (e) {}
      }
    }

    if (
      url.pathname.startsWith("/sporocila") ||
      url.pathname.startsWith("/messages")
    ) {
      return new URLSearchParams(url.search).get("id") || null;
    }
    return null;
  });
  const [republishData, setRepublishData] = useState<any>(null);
  const [quickRepublishItem, setQuickRepublishItem] = useState<any>(null);
  const [quickRepublishDuration, setQuickRepublishDuration] = useState<number>(3); // days
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [userData, setUserData] = useState({
    id: "",
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    profilePicture: "",
    is_verified: false,
    profile_completed: false,
    identity_verified: false,
    email_verified: false,
    stripe_onboarding_complete: false,
    profile_picture_url: "",
    first_name: "",
    last_name: "",
    wallet_balance: 0,
    available_cents: 0,
    held_cents: 0,
    reserved_cents: 0,
  });
  const bidAuctionIds = useMemo(() => {
    if (!userData?.id) return [];
    return auctions.filter((a: any) => {
      const history = a.bidding_history || a.biddingHistory || [];
      const topBids = a.top_bids || [];
      return history.some((h: any) => h.userId === userData.id || h.user_id === userData.id) ||
             topBids.some((b: any) => b.user_id === userData.id);
    }).map(a => a.id);
  }, [auctions, userData?.id]);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showConfirmBidModal, setShowConfirmBidModal] = useState(false);
  const bidResolverRef = useRef<
    | ((
        value: "ok" | "outbid" | "error" | "login_required" | "cancelled",
      ) => void)
    | null
  >(null);
  const [pendingBid, setPendingBid] = useState<{
    item: AuctionItem;
    amount: number;
  } | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );
  const [categoryFilters, setCategoryFilters] = useState<FilterState>({
    delivery_option: undefined,
    condition: undefined,
    specifications: {}
  });
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [verificationData, setVerificationData] = useState<{ token: string; email?: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const vToken = params.get('verify_token') || params.get('token');
    const vEmail = params.get('email');
    if (vToken) {
      return { token: vToken, email: vEmail || undefined };
    }
    return null;
  });
  const [isVerified, setIsVerified] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showBannerDelayPassed, setShowBannerDelayPassed] = useState(false);
  const [userType, setUserType] = useState<"individual" | "business" | null>(
    null,
  );
  const [watchedIds, setWatchedIds] = useState<string[]>([]);
  const [watchlistSnapshot, setWatchlistSnapshot] = useState<string[]>([]);

  useEffect(() => {
    if (activeView === "watchlist") {
      setWatchlistSnapshot(watchedIds);
    }
  }, [activeView, watchedIds.length === 0]);
  const [isPollingStopped, setIsPollingStopped] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [createMode, setCreateMode] = useState<"choice" | "single" | "package">("choice");
  const [settingsTab, setSettingsTab] = useState<'profile' | 'personal' | 'stripe' | 'notifications'>('profile');
  const [appMissingInvoiceDataModal, setAppMissingInvoiceDataModal] = useState<{
    isOpen: boolean;
    missingFields: any[];
    userType: 'individual' | 'business';
  }>({
    isOpen: false,
    missingFields: [],
    userType: 'individual'
  });
  const [appWakeupTrigger, setAppWakeupTrigger] = useState(0);
  const [invoiceModalData, setInvoiceModalData] = useState<{
    isOpen: boolean;
    auction: AuctionItem | null;
    seller: any;
    buyer: any;
  }>({
    isOpen: false,
    auction: null,
    seller: null,
    buyer: null
  });

  useEffect(() => {
    if (activeView !== "createAuction") {
      setCreateMode("choice");
    } else {
      // Do not auto-switch to package draft if user is republishing
      if (republishData) return;
      const uid = userData?.id || 'guest';
      const stored = localStorage.getItem(`drazbe_package_draft_${uid}`) || localStorage.getItem('drazbe_package_draft_latest');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const creationTime = parsed.createdAt || parsed.updatedAt || Date.now();
          if (Date.now() - creationTime <= 3 * 24 * 60 * 60 * 1000) {
            setCreateMode("package");
          }
        } catch (e) {}
      }
    }
  }, [activeView, userData?.id, republishData]);

  // Robust Universal Navigation History Stack
  interface NavigationEntry {
    view: ViewState;
    selectedItem: AuctionItem | null;
    selectedSeller: Seller | null;
    selectedPackageId: string | null;
    selectedCategory: Category | null;
    selectedRegion: Region | null;
    searchQuery: string;
    settingsTab: 'profile' | 'personal' | 'stripe' | 'notifications';
    activeConversationId: string | null;
    createMode: 'choice' | 'single' | 'package';
    republishData: any;
  }

  const navHistoryRef = useRef<NavigationEntry[]>([]);

  const captureCurrentNavState = useCallback((): NavigationEntry => ({
    view: activeView,
    selectedItem,
    selectedSeller,
    selectedPackageId,
    selectedCategory,
    selectedRegion,
    searchQuery,
    settingsTab,
    activeConversationId,
    createMode,
    republishData,
  }), [
    activeView,
    selectedItem,
    selectedSeller,
    selectedPackageId,
    selectedCategory,
    selectedRegion,
    searchQuery,
    settingsTab,
    activeConversationId,
    createMode,
    republishData,
  ]);

  const navigateTo = useCallback(
    (
      targetView: ViewState,
      overrides?: Partial<NavigationEntry>,
      options?: { replace?: boolean; scrollToTop?: boolean }
    ) => {
      if (!options?.replace) {
        const currentState = captureCurrentNavState();
        const isSame =
          currentState.view === targetView &&
          currentState.selectedItem?.id === overrides?.selectedItem?.id &&
          currentState.selectedPackageId === overrides?.selectedPackageId &&
          currentState.selectedSeller?.id === overrides?.selectedSeller?.id &&
          currentState.createMode === (overrides?.createMode ?? currentState.createMode);
        if (!isSame) {
          navHistoryRef.current.push(currentState);
        }
      }

      if (overrides) {
        if (overrides.selectedItem !== undefined) setSelectedItem(overrides.selectedItem);
        if (overrides.selectedSeller !== undefined) setSelectedSeller(overrides.selectedSeller);
        if (overrides.selectedPackageId !== undefined) setSelectedPackageId(overrides.selectedPackageId);
        if (overrides.selectedCategory !== undefined) setSelectedCategory(overrides.selectedCategory);
        if (overrides.selectedRegion !== undefined) setSelectedRegion(overrides.selectedRegion);
        if (overrides.searchQuery !== undefined) setSearchQuery(overrides.searchQuery);
        if (overrides.settingsTab !== undefined) setSettingsTab(overrides.settingsTab);
        if (overrides.activeConversationId !== undefined) setActiveConversationId(overrides.activeConversationId);
        if (overrides.createMode !== undefined) setCreateMode(overrides.createMode);
        if (overrides.republishData !== undefined) setRepublishData(overrides.republishData);
      }

      setActiveView(targetView);
      if (options?.scrollToTop !== false) {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    },
    [captureCurrentNavState]
  );

  const goBack = useCallback(
    (fallbackView: ViewState = "grid") => {
      const previous = navHistoryRef.current.pop();
      if (previous) {
        setActiveView(previous.view);
        setSelectedItem(previous.selectedItem ?? null);
        setSelectedSeller(previous.selectedSeller ?? null);
        setSelectedPackageId(previous.selectedPackageId ?? null);
        setSelectedCategory(previous.selectedCategory ?? null);
        setSelectedRegion(previous.selectedRegion ?? null);
        setSearchQuery(previous.searchQuery ?? "");
        setSettingsTab(previous.settingsTab ?? "profile");
        setActiveConversationId(previous.activeConversationId ?? null);
        setCreateMode(previous.createMode ?? "choice");
        setRepublishData(previous.republishData ?? null);
      } else {
        setRepublishData(null);
        setCreateMode("choice");
        if (fallbackView === "grid") {
          setSelectedItem(null);
          setSelectedSeller(null);
          setSelectedPackageId(null);
          setActiveConversationId(null);
        }
        setActiveView(fallbackView);
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    []
  );

  // PopState browser Back/Forward integration
  useEffect(() => {
    const handlePopState = () => {
      if (navHistoryRef.current.length > 0) {
        goBack("grid");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [goBack]);

  // URL and Path Preservation Hook
  useEffect(() => {
    if (activeView === 'winnings') {
      const now = Date.now();
      localStorage.setItem('last_seen_winnings', now.toString());
      setLastSeenWinnings(now);
    }
  }, [activeView]);

  useEffect(() => {
    if (isHydrating) return;

    let targetPath = "/";
    let targetSearch = "";

    const localizedPaths: Record<string, Record<string, string>> = {
      messages: { SLO: "/sporocila", EN: "/messages", DE: "/nachrichten" },
      detail: { SLO: "/drazba", EN: "/auction", DE: "/auktion" },
      grid: { SLO: "/drazbe", EN: "/auctions", DE: "/auktionen" },
      sellerProfile: { SLO: "/prodajalec", EN: "/seller", DE: "/verkaufer" },
      settings: { SLO: "/nastavitve", EN: "/settings", DE: "/einstellungen" },
      subscriptions: { SLO: "/narocnine", EN: "/subscriptions", DE: "/abonnements" },
      login: { SLO: "/prijava", EN: "/login", DE: "/anmelden" },
      createAuction: { SLO: "/ustvari-drazbo", EN: "/create-auction", DE: "/auktion-erstellen" },
      winnings: { SLO: "/moje-zmage", EN: "/my-winnings", DE: "/meine-gewinne" },
      myBids: { SLO: "/moje-ponudbe", EN: "/my-bids", DE: "/meine-gebote" },
      mySold: { SLO: "/prodano", EN: "/my-sold", DE: "/verkauft" },
      myUnsold: { SLO: "/neprodano", EN: "/my-unsold", DE: "/unverkauft" },
      watchlist: { SLO: "/seznam-zelja", EN: "/watchlist", DE: "/beobachtungsliste" },
      lastChance: { SLO: "/zadnja-priloznost", EN: "/last-chance", DE: "/letzte-chance" },
      verification: { SLO: "/verifikacija", EN: "/verification", DE: "/verifizierung" }
    };

    if (localizedPaths[activeView]) {
      targetPath = localizedPaths[activeView][language] || localizedPaths[activeView]["SLO"];
    }

    const params = new URLSearchParams();

    if (activeView === "messages" && activeConversationId) {
      params.set("id", activeConversationId);
    } else if (activeView === "detail" && selectedItem?.id) {
      params.set("id", selectedItem.id);
    } else if (activeView === "sellerProfile" && selectedSeller?.id) {
      params.set("id", selectedSeller.id);
    } else if (activeView === "grid") {
      if (selectedCategory) {
        const catKey = QUERY_PARAM_MAP.category[language as 'SLO' | 'EN' | 'DE'] || QUERY_PARAM_MAP.category.SLO;
        const catValue = CATEGORY_URL_MAP[selectedCategory]?.[language as 'SLO' | 'EN' | 'DE'] || CATEGORY_URL_MAP[selectedCategory]?.SLO;
        if (catValue) {
          params.set(catKey, catValue);
        }
      }
      if (selectedRegion) {
        const regKey = QUERY_PARAM_MAP.region[language as 'SLO' | 'EN' | 'DE'] || QUERY_PARAM_MAP.region.SLO;
        const regValue = REGION_URL_MAP[selectedRegion]?.[language as 'SLO' | 'EN' | 'DE'] || REGION_URL_MAP[selectedRegion]?.SLO;
        if (regValue) {
          params.set(regKey, regValue);
        }
      }
    } else if (activeView === "settings") {
      const tabKey = QUERY_PARAM_MAP.tab[language as 'SLO' | 'EN' | 'DE'] || QUERY_PARAM_MAP.tab.SLO;
      const tabValue = SETTINGS_TAB_MAP[settingsTab]?.[language as 'SLO' | 'EN' | 'DE'] || SETTINGS_TAB_MAP[settingsTab]?.SLO;
      if (tabValue) {
        params.set(tabKey, tabValue);
      }
    }

    const searchString = params.toString();
    if (searchString) {
      targetSearch = `?${searchString}`;
    }
    
    // Add language prefix if needed
    if (language === "EN") targetPath = "/en" + targetPath;
    else if (language === "DE") targetPath = "/de" + targetPath;

    const currentUrl = window.location.pathname + window.location.search;
    const newUrl = targetPath + targetSearch;

    if (currentUrl !== newUrl) {
      window.history.pushState(null, "", newUrl);
    }

    // Always persist to local storage for the watchdog
    localStorage.setItem("last_active_route", newUrl);
  }, [activeView, activeConversationId, selectedItem?.id, selectedSeller?.id, language, selectedCategory, selectedRegion, settingsTab]);

  // Initial Hydration from URL or LocalStorage
  useEffect(() => {
    const isSessionActive = sessionStorage.getItem("session_tab_active");
    if (!isSessionActive) {
      sessionStorage.setItem("session_tab_active", "true");
      setActiveView("grid");
      setSelectedCategory(null);
      setSelectedRegion(null);
      setSearchQuery("");
      setSelectedItem(null);
      setSelectedSeller(null);
      setActiveConversationId(null);

      // Determine clean root URL path based on current language
      let cleanPath = "/";
      if (language === "EN") cleanPath = "/en/";
      else if (language === "DE") cleanPath = "/de/";

      window.history.replaceState(null, "", cleanPath);
      localStorage.setItem("last_active_route", cleanPath);
      setTimeout(() => setIsHydrating(false), 50);
      return;
    }

    let pathToRestore = window.location.pathname + window.location.search;
    let currentPath = window.location.pathname;

    if (
      currentPath === "/" || currentPath === "" ||
      currentPath === "/de" || currentPath === "/de/" ||
      currentPath === "/en" || currentPath === "/en/" ||
      currentPath === "/sl" || currentPath === "/sl/"
    ) {
      const savedRoute = localStorage.getItem("last_active_route");
      if (savedRoute && savedRoute !== "/" && savedRoute !== pathToRestore && !savedRoute.match(/^\/(en|de|sl)\/?$/)) {
        window.history.replaceState(null, "", savedRoute);
        pathToRestore = savedRoute;
      }
    }

    const url = new URL(pathToRestore, window.location.origin);
    let path = url.pathname;
    
    // Strip language prefix
    if (path.startsWith("/de/")) path = path.slice(3);
    else if (path === "/de") path = "/";
    else if (path.startsWith("/en/")) path = path.slice(3);
    else if (path === "/en") path = "/";
    else if (path.startsWith("/sl/")) path = path.slice(3);
    else if (path === "/sl") path = "/";

    const searchParams = new URLSearchParams(url.search);
    const id = searchParams.get("id");

    const hydrateState = async () => {
      // Decode and map category, region, settings tab first so state is fully prepared
      let categoryToSet: Category | null = null;
      let regionToSet: Region | null = null;
      let tabToSet: 'profile' | 'personal' | 'stripe' = 'profile';

      for (const [key, value] of searchParams.entries()) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "kategorija" || lowerKey === "category" || lowerKey === "kategorie") {
          const decodedCat = slugToCategory(value);
          if (decodedCat) categoryToSet = decodedCat;
        }
        if (lowerKey === "regija" || lowerKey === "region") {
          const decodedReg = slugToRegion(value);
          if (decodedReg) regionToSet = decodedReg;
        }
        if (lowerKey === "zavihek" || lowerKey === "tab") {
          tabToSet = slugToSettingsTab(value);
        }
      }

      if (categoryToSet) setSelectedCategory(categoryToSet);
      if (regionToSet) setSelectedRegion(regionToSet);
      setSettingsTab(tabToSet);

      if (path.startsWith("/sporocila") || path.startsWith("/messages") || path.startsWith("/nachrichten")) {
        if (id) setActiveConversationId(id);
        setActiveView("messages");
      } else if (path.startsWith("/drazba") || path.startsWith("/auction") || path.startsWith("/auktion")) {
        if (id) {
          let found = [].find((a) => a.id === id);
          if (!found) {
            const snap = await getDoc(doc(db, 'auctions', id));
            const data: any = snap.exists() ? { id: snap.id, ...snap.data() } : null;
            if (data) {
              found = {
                ...data,
                endTime: new Date(data.end_time || data.endTime),
                currentBid: data.current_price || data.currentBid,
                hiddenMaxBid: data.hidden_max_bid || data.hiddenMaxBid,
                bidCount: data.bid_count || data.bidCount,
                winnerId: data.winner_id || data.winnerId,
                winner_id: data.winner_id || data.winnerId,
                payment_status: data.payment_status || "unpaid",
                paid_at: data.paid_at,
                sellerName: data.sellerName || "",
                delivery_method: data.delivery_method,
                buyer_received: data.buyer_received,
              };
            }
          }
          if (found) {
            setSelectedItem(found);
            setActiveView("detail");
          } else {
            setActiveView("grid");
          }
        } else {
          setActiveView("grid");
        }
      } else if (path.startsWith("/drazbe") || path.startsWith("/auctions") || path.startsWith("/auktionen")) {
        setActiveView("grid");
      } else if (path.startsWith("/prodajalec") || path.startsWith("/seller") || path.startsWith("/verkaufer")) {
        if (id) {
          let found = [].find((s) => s.id === id);
          if (!found) {
            const snap = await getDoc(doc(db, 'users', id));
            const data: any = snap.exists() ? { id: snap.id, ...snap.data() } : null;
            if (data) found = data;
          }
          if (found) {
            setSelectedSeller(found);
            setActiveView("sellerProfile");
          } else {
            setActiveView("grid");
          }
        }
      } else if (
        path.startsWith("/nastavitve") ||
        path.startsWith("/settings") ||
        path.startsWith("/einstellungen")
      ) {
        setActiveView("settings");
      } else if (
        path.startsWith("/narocnine") ||
        path.startsWith("/subscriptions") ||
        path.startsWith("/abonnements")
      ) {
        setActiveView("subscriptions");
      } else if (path.startsWith("/prijava") || path.startsWith("/login") || path.startsWith("/anmelden")) {
        setActiveView("login");
      } else if (
        path.startsWith("/ustvari-drazbo") ||
        path.startsWith("/create-auction") ||
        path.startsWith("/auktion-erstellen")
      ) {
        setActiveView("createAuction");
      } else if (
        path.startsWith("/moje-zmage") ||
        path.startsWith("/my-winnings") ||
        path.startsWith("/meine-gewinne")
      ) {
        setActiveView("winnings");
      } else if (
        path.startsWith("/moje-ponudbe") ||
        path.startsWith("/my-bids") ||
        path.startsWith("/meine-gebote")
      ) {
        setActiveView("myBids");
      } else if (path.startsWith("/prodano") || path.startsWith("/my-sold") || path.startsWith("/verkauft")) {
        setActiveView("mySold");
      } else if (
        path.startsWith("/neprodano") ||
        path.startsWith("/my-unsold") ||
        path.startsWith("/unverkauft")
      ) {
        setActiveView("myUnsold");
      } else if (
        path.startsWith("/seznam-zelja") ||
        path.startsWith("/watchlist") ||
        path.startsWith("/beobachtungsliste")
      ) {
        setActiveView("watchlist");
      } else if (
        path.startsWith("/zadnja-priloznost") ||
        path.startsWith("/last-chance") ||
        path.startsWith("/letzte-chance")
      ) {
        setActiveView("lastChance");
      } else if (
        path.startsWith("/verifikacija") ||
        path.startsWith("/verification") ||
        path.startsWith("/verifizierung")
      ) {
        setActiveView("verification");
      } else {
        setActiveView("grid");
      }

      // Delay slightly to ensure state propagation before unlocking the URL preserver
      setTimeout(() => setIsHydrating(false), 50);
    };

    hydrateState();
  }, []);


  const toggleWatch = async (id: string) => {
    const newWatchedIds = watchedIds.includes(id)
      ? watchedIds.filter((i) => i !== id)
      : [...watchedIds, id];

    setWatchedIds(newWatchedIds);

    try {
      const user = auth.currentUser;
      const session = user ? { user: { id: user.uid, email: user.email } } : null;
      if (session?.user) {
        await setDoc(doc(db, 'users', session.user.id), { id: session.user.id, email: session.user.email, watched_auctions: newWatchedIds }, { merge: true });
      }
    } catch (err) {
      console.error("Error updating watched auctions:", err);
    }
  };
  const [activeLegal, setActiveLegal] = useState<
    "terms" | "privacy" | "how" | null
  >(null);
  const [currentPlan, setCurrentPlan] = useState<SubscriptionTier>(
    SubscriptionTier.FREE,
  );
  const [isSubscriptionCanceled, setIsSubscriptionCanceled] = useState(false);
  const [nextBillingDate, setNextBillingDate] = useState<Date | undefined>(undefined);
  const [subscribedAt, setSubscribedAt] = useState<Date | undefined>(undefined);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutData, setCheckoutData] = useState<{
    amount: number;
    title: string;
    onSuccess: () => void;
    metadata?: any;
  } | null>(null);
  const [deliveryMethodModal, setDeliveryMethodModal] = useState<{
    isOpen: boolean;
    auctionId: string;
    deliveryMethod: "pickup" | "post" | null;
  }>({ isOpen: false, auctionId: "", deliveryMethod: null });
  const [receiptConfirmModal, setReceiptConfirmModal] = useState<{
    isOpen: boolean;
    auctionId: string;
    sellerId: string;
  }>({ isOpen: false, auctionId: "", sellerId: "" });
  const [reviewModalData, setReviewModalData] = useState<{
    isOpen: boolean;
    auction: AuctionItem | null;
    sellerName?: string;
  }>({ isOpen: false, auction: null, sellerName: "" });

  const openReviewModal = (auction: AuctionItem) => {
    const sId = auction.sellerId || (auction as any).seller_id;
    const seller = usersMap.get(sId);
    let sName = auction.sellerName;
    if (seller) {
      if (seller.user_type === 'business' && seller.company_name) {
        sName = seller.company_name;
      } else if (seller.first_name) {
        sName = `${seller.first_name} ${seller.last_name || ''}`.trim();
      } else if (seller.username) {
        sName = seller.username;
      }
    }
    setReviewModalData({
      isOpen: true,
      auction,
      sellerName: sName,
    });
  };
  const [deleteUnsoldModal, setDeleteUnsoldModal] = useState<{
    isOpen: boolean;
    item?: any;
    items?: any[];
    title: string;
  } | null>(null);
  const [isQuickRepublishing, setIsQuickRepublishing] = useState<string | null>(null);

  const lastSessionCheckRef = useRef(0);
  const isCheckingSessionRef = useRef(false);
  const [user, setUser] = useState<any>(auth.currentUser);

  useEffect(() => {
    let unsubscribeSnap: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        if (!authUser.emailVerified && authUser.providerData.some(p => p.providerId === "password")) {
          // Ce je registracija se v teku v AuthView, ne prekinjaj procesa shranjevanja podatkov in posiljanja potrditve
          if (isRegisteringAuth()) {
            return;
          }

          // Preveri ali ima uporabnik potrjen status v bazi (Firestore potrditev prek e-mail povezave)
          let hasFirestoreConfirmation = false;
          try {
            const userSnap = await getDoc(doc(db, "users", authUser.uid));
            if (userSnap.exists()) {
              const uData = userSnap.data();
              if (uData.email_verified === true || uData.is_verified === true || uData.registration_confirmed === true) {
                hasFirestoreConfirmation = true;
              }
            }
          } catch (e) {
            console.warn("Preverjanje uporabnikove verifikacije v bazi:", e);
          }

          if (!hasFirestoreConfirmation) {
            cleanupAllListeners();
            await safeSignOut(auth);
            return;
          }
        }
        setUser(authUser);
        setIsLoggedIn(true);
        
        // Optimistic fast update for remembered login
        setUserData((prev: any) => ({
          ...prev,
          id: authUser.uid,
          email: authUser.email || prev.email || '',
        }));

        unsubscribeSnap = registerSnapshotListener(onSnapshot(doc(db, "users", authUser.uid), async (snap) => {
          const data: any = snap.exists() ? { id: snap.id, ...snap.data() } : null;

          if (data) {
            setUserData((prev: any) => ({
              ...prev,
              ...data,
              id: authUser.uid,
              email: authUser.email || data.email || prev.email || '',
              username: data.username || data.userName || prev.username || '',
              userName: data.username || data.userName || prev.username || '',
              first_name: data.first_name || data.firstName || prev.first_name || prev.firstName || '',
              firstName: data.firstName || data.first_name || prev.firstName || prev.first_name || '',
              last_name: data.last_name || data.lastName || prev.last_name || prev.lastName || '',
              lastName: data.lastName || data.last_name || prev.lastName || prev.last_name || '',
              profile_picture_url: data.profile_picture_url || data.profilePicture || prev.profile_picture_url || prev.profilePicture || '',
              profilePicture: data.profilePicture || data.profile_picture_url || prev.profilePicture || prev.profile_picture_url || '',
              phone: data.phone || data.phoneNumber || prev.phone || '',
              street: data.street || prev.street || '',
              city: data.city || prev.city || '',
              postal_code: data.postal_code || data.postalCode || prev.postal_code || prev.postalCode || '',
              postalCode: data.postalCode || data.postal_code || prev.postalCode || prev.postal_code || '',
              company_name: data.company_name || data.companyName || prev.company_name || prev.companyName || '',
              companyName: data.companyName || data.company_name || prev.companyName || prev.company_name || '',
              tax_number: data.tax_number || data.tax_id || data.taxNumber || data.taxId || prev.tax_number || '',
              taxNumber: data.taxNumber || data.tax_number || data.tax_id || data.taxId || prev.taxNumber || '',
              tax_id: data.tax_id || data.tax_number || data.taxId || data.taxNumber || prev.tax_id || '',
              taxId: data.taxId || data.tax_id || data.tax_number || data.taxNumber || prev.taxId || '',
              registration_number: data.registration_number || data.regNumber || prev.registration_number || '',
              regNumber: data.regNumber || data.registration_number || prev.regNumber || '',
              company_street: data.company_street || data.companyStreet || prev.company_street || '',
              companyStreet: data.companyStreet || data.company_street || prev.companyStreet || '',
              company_city: data.company_city || data.companyCity || prev.company_city || '',
              companyCity: data.companyCity || data.company_city || prev.companyCity || '',
              company_postal_code: data.company_postal_code || data.companyPostalCode || prev.company_postal_code || '',
              companyPostalCode: data.companyPostalCode || data.company_postal_code || prev.companyPostalCode || '',
              representative: data.representative || prev.representative || '',
              country_code: data.country_code || data.countryCode || prev.country_code || 'SI',
              countryCode: data.countryCode || data.country_code || prev.countryCode || 'SI',
              is_verified: data.is_verified ?? data.isVerified ?? false,
              isVerified: data.is_verified ?? data.isVerified ?? false,
              profile_completed: data.profile_completed === true,
              identity_verified: data.identity_verified === true,
              email_verified: data.email_verified === true,
              user_type: data.user_type || data.userType || null,
              userType: data.userType || data.user_type || null,
              stripe_onboarding_complete: data.stripe_onboarding_complete ?? data.stripeOnboardingComplete ?? false,
              wallet_balance: data.available_cents !== undefined ? (data.available_cents / 100) : (data.wallet_balance ?? data.walletBalance ?? 0),
              available_cents: data.available_cents !== undefined ? data.available_cents : Math.round(Number(data.wallet_balance ?? data.walletBalance ?? 0) * 100),
              held_cents: data.held_cents || 0,
              reserved_cents: data.reserved_cents || 0,
            }));
            setIsVerified(data.profile_completed === true);
            setUserType(data.user_type || data.userType || null);
            
            const now = new Date();
            let subTier = data.subscription_tier || data.subscription || SubscriptionTier.FREE;
            const isCanceled = !!(data.subscription_canceled || false);
            let validUntilDate: Date | undefined = undefined;

            if (data.subscription_valid_until) {
              validUntilDate = new Date(data.subscription_valid_until);
            } else if (data.subscription_paid_at) {
              const date = new Date(data.subscription_paid_at);
              date.setMonth(date.getMonth() + 1);
              validUntilDate = date;
            }

            // Če je obdobje naročnine poteklo in je bila preklicana ali neaktivna, samodejno preklopimo na FREE
            if (validUntilDate && now.getTime() > validUntilDate.getTime() && (isCanceled || data.subscription_active === false)) {
              subTier = SubscriptionTier.FREE;
            }

            setCurrentPlan(subTier as SubscriptionTier);
            setIsSubscriptionCanceled(isCanceled);
            setNextBillingDate(validUntilDate);

            if (data.subscription_paid_at || data.subscription_started_at) {
              setSubscribedAt(new Date(data.subscription_paid_at || data.subscription_started_at));
            } else {
              setSubscribedAt(undefined);
            }
          } else {
            await setDoc(doc(db, 'users', authUser.uid), {
              id: authUser.uid,
              email: authUser.email,
              is_verified: false,
              subscription: 'FREE'
            }, { merge: true });
            
            setUserData((prev) => ({
              ...prev,
              id: authUser.uid,
              email: authUser.email,
            }));
            setIsVerified(false);
          }
          setIsAuthLoading(false);
        }, (error) => {
          if (error.code === 'permission-denied') {
            console.warn("Dostop do uporabniškega profila ni dovoljen.");
          } else {
            console.error("User snapshot error:", error);
          }
          setIsAuthLoading(false);
        }));
      } else {
        setUser(null);
        setIsLoggedIn(false);
        setIsVerified(false);
        setUserData({
          id: "",
          firstName: "",
          lastName: "",
          username: "",
          email: "",
          profilePicture: "",
          is_verified: false,
          stripe_onboarding_complete: false,
          profile_picture_url: "",
          first_name: "",
          last_name: "",
          wallet_balance: 0
        } as any);
        if (unsubscribeSnap) { unsubscribeSnap(); unsubscribeSnap = null; }
        setIsAuthLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeSnap) unsubscribeSnap();
    };
  }, []);

  const currentUserWinnings = useMemo(() => {
    if (!userData?.id) return [];
    return auctions
      .filter(
        (a) =>
          (((a as any).winner_id === userData.id || a.winnerId === userData.id) || 
           (a.second_highest_bidder_id === userData.id && (a.post_auction_status === 'offered_2nd' || a.post_auction_status === 'awaiting_payment_2nd'))) &&
          (a.status === "completed" || a.endTime.getTime() <= Date.now()),
      )
      .sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
  }, [auctions, userData?.id]);

  // Pagination & Scroll
  const [baseItemsPerPage, setBaseItemsPerPage] = useState(12);
  const [cols, setCols] = useState(4);

  useEffect(() => {
    const updateCols = () => {
      if (window.innerWidth >= 1536) setCols(5);
      else if (window.innerWidth >= 1280) setCols(4);
      else if (window.innerWidth >= 1024) setCols(3);
      else if (window.innerWidth >= 640) setCols(2);
      else setCols(1);
    };
    updateCols();
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, []);

  const itemsPerPage = Math.ceil(baseItemsPerPage / cols) * cols;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedRegion, selectedCategory, searchQuery, activeView]);

  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 350) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Ref for the "Aktualne dražbe" section
  const auctionsSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let title = "dražbenik.si | Prva slovenska digitalna dražba";
    let metaDesc =
      "Najbolj zanesljiva platforma za spletne dražbe v Sloveniji. Pregledno, varno in enostavno.";

    switch (activeView) {
      case "detail":
        if (selectedItem) {
          const itemTitle =
            selectedItem.title[language as keyof typeof selectedItem.title] ||
            selectedItem.title["SLO"];
          title = `${itemTitle} | dražbenik.si`;
        }
        metaDesc = `Licitirajte za stroje, vozila ali nepremičnine. Oddajte svojo ponudbo zdaj.`;
        break;
      case "sellerProfile":
        if (selectedSeller)
          title = `Profil prodajalca: ${selectedSeller.name} | dražbenik.si`;
        metaDesc = `Oglejte si vse aktivne dražbe prodajalca na dražbenik.si.`;
        break;
      case "lastChance":
        title = "Zadnja priložnost | Predmeti, ki se iztekajo | dražbenik.si";
        metaDesc =
          "Zgrabite še zadnjo priložnost za licitacijo. Dražbe se iztekajo.";
        break;
      case "createAuction":
        title = "Objavi novo dražbo | dražbenik.si";
        break;
      case "login":
        title = "Prijava in registracija | dražbenik.si";
        break;
    }

    document.title = title;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", metaDesc);
  }, [activeView, selectedItem, selectedSeller, language]);

  const [usersMap, setUsersMap] = useState<Map<string, any>>(new Map());

  // Private stream: Users
  useEffect(() => {
    // OPTIMIZACIJA: Odstranjen client-side cron. Vercel cron bo samodejno klical endpoint 1-krat na dan.
  }, []);
  
  useEffect(() => {
    if (!user) return;
    const unsubUsers = registerSnapshotListener(onSnapshot(collection(db, 'users'), (snap) => {
      setUsersMap(new Map(snap.docs.map(d => [d.id, d.data()])));
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn("Dostop do uporabnikov ni dovoljen.");
      } else {
        console.error('Users snapshot error:', error);
      }
    }));
    return () => unsubUsers();
  }, [user]);

  // Stream: Auctions (poslušalec se sproži SAMO takrat, ko je uporabnik prijavljen)
  useEffect(() => {
    if (!user) return;
    const unsubscribe = registerSnapshotListener(onSnapshot(collection(db, "auctions"), 
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const fetchedData: AuctionItem[] = data.map((d: any) => {
          const seller = usersMap.get(d.seller_id) || usersMap.get(d.sellerId) || {};
          let sellerName = "";
          const isDeletedUser = d.is_seller_deleted || seller.is_deleted || seller.isDeleted || d.sellerName === "Uporabnik je bil izbrisan";
          if (isDeletedUser) {
            sellerName = "Uporabnik je bil izbrisan";
          } else if (seller.user_type === "business" && seller.company_name) {
            sellerName = seller.company_name;
          } else if (seller.username) {
            sellerName = seller.username;
          } else if (seller.first_name && seller.last_name) {
            sellerName = `${seller.first_name} ${seller.last_name}`;
          }

          const isItemPaid = d.payment_status === "paid" || d.post_auction_status === "paid";

          return {
            ...d,
            region: normalizeRegionName(d.region || (typeof d.location === 'object' ? d.location?.SLO : d.location)),
            endTime: new Date(d.end_time || d.endTime || Date.now()),
            createdAt: d.created_at || d.createdAt || new Date(0).toISOString(),
            currentBid: d.current_price || d.currentBid,
            hiddenMaxBid: d.hidden_max_bid || d.hiddenMaxBid,
            bidCount: d.bid_count || d.bidCount,
            winnerId: d.winner_id || d.winnerId,
            winner_id: d.winner_id || d.winnerId,
            sellerId: d.seller_id || d.sellerId,
            is_seller_deleted: isDeletedUser,
            payment_status: isItemPaid ? "paid" : (d.payment_status || "unpaid"),
            post_auction_status: d.post_auction_status,
            paid_at: d.paid_at,
            sellerName: isDeletedUser ? "Uporabnik je bil izbrisan" : (d.sellerName || sellerName),
            seller: { 
              id: d.seller_id || d.sellerId, 
              name: { SLO: sellerName, EN: isDeletedUser ? 'User deleted' : sellerName, DE: isDeletedUser ? 'Benutzer gelöscht' : sellerName }, 
              is_deleted: isDeletedUser,
              photoURL: isDeletedUser ? null : (seller.photoURL || seller.photoUrl || seller.photo_url || null), 
              created_at: seller.created_at || seller.createdAt, 
              sold_count: seller.sold_count, 
              unpaid_penalties: seller.unpaid_penalties 
            },
            delivery_method: d.delivery_method,
            buyer_received: d.buyer_received,
          };
        });

        setAuctions(fetchedData);
      },
      (error) => {
        if (error.code === 'permission-denied') {
          console.warn("Dostop do dražb ni dovoljen.");
        } else {
          console.error("Firestore napaka:", error);
        }
      }
    ));

    return () => unsubscribe();
  }, [user, usersMap]);

  const fetchAuctions = async () => {
    // OPTIMIZATION: Removed redundant manual getDocs calls. 
    // The active onSnapshot listener (unsubAuctions) already receives all real-time updates instantly.
    // This dramatically reduces Firebase reads and prevents UI blocking/lag.
  };

  const refreshUserData = async (uid?: string) => {
    const id = uid || userData.id;
    if (!id) return;
    try {
      const snap = await getDoc(doc(db, 'users', id));
      if (snap.exists()) {
        const data = snap.data();
        setUserData((prev: any) => ({
          ...prev,
          ...data,
          id,
          email: data.email || prev.email || '',
          username: data.username || data.userName || prev.username || '',
          userName: data.username || data.userName || prev.username || '',
          first_name: data.first_name || data.firstName || prev.first_name || prev.firstName || '',
          firstName: data.firstName || data.first_name || prev.firstName || prev.first_name || '',
          last_name: data.last_name || data.lastName || prev.last_name || prev.lastName || '',
          lastName: data.lastName || data.last_name || prev.lastName || prev.last_name || '',
          profile_picture_url: data.profile_picture_url || data.profilePicture || prev.profile_picture_url || prev.profilePicture || '',
          profilePicture: data.profilePicture || data.profile_picture_url || prev.profilePicture || prev.profile_picture_url || '',
          phone: data.phone || data.phoneNumber || prev.phone || '',
          street: data.street || prev.street || '',
          city: data.city || prev.city || '',
          postal_code: data.postal_code || data.postalCode || prev.postal_code || prev.postalCode || '',
          postalCode: data.postalCode || data.postal_code || prev.postalCode || prev.postal_code || '',
          company_name: data.company_name || data.companyName || prev.company_name || prev.companyName || '',
          companyName: data.companyName || data.company_name || prev.companyName || prev.company_name || '',
          tax_number: data.tax_number || data.tax_id || data.taxNumber || data.taxId || prev.tax_number || '',
          taxNumber: data.taxNumber || data.tax_number || data.tax_id || data.taxId || prev.taxNumber || '',
          tax_id: data.tax_id || data.tax_number || data.taxId || data.taxNumber || prev.tax_id || '',
          taxId: data.taxId || data.tax_id || data.tax_number || data.taxNumber || prev.taxId || '',
          registration_number: data.registration_number || data.regNumber || prev.registration_number || '',
          regNumber: data.regNumber || data.registration_number || prev.regNumber || '',
          company_street: data.company_street || data.companyStreet || prev.company_street || '',
          companyStreet: data.companyStreet || data.company_street || prev.companyStreet || '',
          company_city: data.company_city || data.companyCity || prev.company_city || '',
          companyCity: data.companyCity || data.company_city || prev.companyCity || '',
          company_postal_code: data.company_postal_code || data.companyPostalCode || prev.company_postal_code || '',
          companyPostalCode: data.companyPostalCode || data.company_postal_code || prev.companyPostalCode || '',
          representative: data.representative || prev.representative || '',
          country_code: data.country_code || data.countryCode || prev.country_code || 'SI',
          countryCode: data.countryCode || data.country_code || prev.countryCode || 'SI',
          is_verified: data.is_verified ?? data.isVerified ?? false,
          isVerified: data.is_verified ?? data.isVerified ?? false,
          user_type: data.user_type || data.userType || null,
          userType: data.userType || data.user_type || null,
          stripe_onboarding_complete: data.stripe_onboarding_complete ?? data.stripeOnboardingComplete ?? false,
          wallet_balance: data.available_cents !== undefined ? (data.available_cents / 100) : (data.wallet_balance ?? data.walletBalance ?? 0),
          available_cents: data.available_cents !== undefined ? data.available_cents : Math.round(Number(data.wallet_balance ?? data.walletBalance ?? 0) * 100),
          held_cents: data.held_cents || 0,
          reserved_cents: data.reserved_cents || 0,
        }));
      }
    } catch (e) {
      console.warn("Failed to refresh user data:", e);
    }
  };

  // Listen for Stripe popup completion messages
  useEffect(() => {
    const handlePopupMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'STRIPE_POPUP_CALLBACK') {
        const { status, action, sessionId } = event.data;
        if (status === 'success') {
          if (action === 'stripe_connect') {
            toast.success("Stripe račun je bil uspešno povezan!");
            if (userData?.id) {
              await refreshUserData(userData.id);
            }
          } else {
            toast.success(t("paymentSuccessEmail") || "Plačilo uspešno! Račun in potrdilo sta bila poslana.");
            await fetchAuctions();
            if (userData?.id) {
              await refreshUserData(userData.id);
            }
            setTimeout(() => {
              fetchAuctions();
            }, 1200);
          }
        } else if (status === 'cancel') {
          toast.info("Postopek je bil preklican.");
        }
      }
    };

    window.addEventListener('message', handlePopupMessage);
    return () => window.removeEventListener('message', handlePopupMessage);
  }, [userData, language]);

  // Handle URL redirect returns from Stripe if user completed outside of popup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentParam = params.get('payment');
    const sessionIdParam = params.get('session_id');
    const typeParam = params.get('type');
    const stripeParam = params.get('stripe');

    if (paymentParam === 'success' || sessionIdParam) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      if (sessionIdParam) {
        confirmCheckoutSessionAction({ 
          sessionId: sessionIdParam,
          userId: userData?.id || auth.currentUser?.uid,
          user_id: userData?.id || auth.currentUser?.uid 
        })
          .then((res: any) => {
            fetchAuctions();
            if (userData?.id) refreshUserData(userData.id);
            if (res?.type === 'subscription' || typeParam === 'subscription') {
              toast.success("Naročnina je bila uspešno aktivirana!");
            }
          })
          .catch(console.error);
      } else {
        fetchAuctions();
      }
      toast.success(t("paymentSuccessEmail") || "Plačilo uspešno! Račun in potrdilo sta bila poslana.");
    } else if (stripeParam === 'success') {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      toast.success("Stripe račun je bil uspešno povezan!");
      if (userData?.id) refreshUserData(userData.id);
    }
  }, [userData]);

  const [isSyncingSub, setIsSyncingSub] = useState(false);
  const hasAutoSyncedRef = useRef(false);

  const handleSyncSubscription = useCallback(async (showToast = true) => {
    const uid = auth.currentUser?.uid || userData?.id;
    if (!uid) return;
    setIsSyncingSub(true);
    try {
      const res = await syncUserSubscriptionAction(uid);
      if (res?.data?.synced) {
        toast.success(`Naročnina uspešno posodobljena na ${res.data.subscription_tier}!`);
        if (userData?.id) refreshUserData(userData.id);
      } else if (showToast) {
        if (res?.data?.already_active) {
          toast.info(`Vaša naročnina (${res.data.subscription_tier}) je že aktivna.`);
        } else {
          toast.info("Ni bilo najdenih novih neobdelanih plačil na Stripe.");
        }
      }
    } catch (e) {
      console.warn("Napaka pri preverjanju naročnine:", e);
    } finally {
      setIsSyncingSub(false);
    }
  }, [userData?.id, refreshUserData]);

  useEffect(() => {
    if (userData?.id && currentPlan === SubscriptionTier.FREE && !hasAutoSyncedRef.current) {
      hasAutoSyncedRef.current = true;
      handleSyncSubscription(false);
    }
  }, [userData?.id, currentPlan, handleSyncSubscription]);

  const navigateToSellerProfile = (sellerInput: any, fallbackName?: string) => {
    let targetSeller: any = null;
    
    if (sellerInput && typeof sellerInput === 'object') {
      targetSeller = { ...sellerInput };
    } else if (typeof sellerInput === 'string' && sellerInput.trim() !== '') {
      const foundUser = usersMap.get(sellerInput);
      if (foundUser) {
        targetSeller = {
          id: sellerInput,
          ...foundUser,
        };
      } else {
        const matchingAuction = auctions.find(a => 
          a.sellerId === sellerInput || 
          (a as any).seller_id === sellerInput || 
          a.sellerName === sellerInput
        );
        if (matchingAuction) {
          targetSeller = (matchingAuction as any).seller ? { ...(matchingAuction as any).seller } : {
            id: matchingAuction.sellerId || (matchingAuction as any).seller_id || sellerInput,
            company_name: matchingAuction.sellerName,
            sellerName: matchingAuction.sellerName
          };
        } else {
          targetSeller = {
            id: sellerInput,
            company_name: fallbackName || sellerInput,
            sellerName: fallbackName || sellerInput
          };
        }
      }
    }

    if (!targetSeller) {
      targetSeller = {
        id: 'seller_' + Date.now(),
        company_name: fallbackName || 'Prodajalec',
        sellerName: fallbackName || 'Prodajalec'
      };
    }

    const sellerId = targetSeller.id || targetSeller.sellerId || (targetSeller as any).seller_id;
    const foundUser = sellerId ? usersMap.get(sellerId) : null;
    if (foundUser) {
      targetSeller = {
        ...foundUser,
        ...targetSeller,
      };
    }
    if (sellerId && userData?.id === sellerId) {
      targetSeller = {
        ...userData,
        ...targetSeller,
      };
    }

    const displayName = targetSeller.company_name || 
      targetSeller.username || 
      (targetSeller.first_name ? `${targetSeller.first_name} ${targetSeller.last_name || ''}`.trim() : '') || 
      (typeof targetSeller.name === 'string' ? targetSeller.name : targetSeller.name?.SLO) || 
      targetSeller.sellerName || 
      fallbackName || 
      'Prodajalec';
    
    targetSeller.name = {
      SLO: displayName,
      EN: displayName,
      DE: displayName
    };

    if (!targetSeller.location) {
      targetSeller.location = { SLO: 'Slovenija', EN: 'Slovenia', DE: 'Slowenien' };
    }

    // Resolve real profile photo
    const realPhoto = targetSeller.photoURL || 
      targetSeller.profile_picture_url || 
      targetSeller.profilePicture || 
      targetSeller.avatar_url || 
      targetSeller.photoUrl || 
      foundUser?.profile_picture_url || 
      foundUser?.photoURL || 
      (sellerId === userData?.id ? (userData?.profile_picture_url || (userData as any)?.photoURL) : null) || 
      null;

    targetSeller.photoURL = realPhoto;
    targetSeller.profile_picture_url = realPhoto;
    targetSeller.profilePicture = realPhoto;

    // Real sold auctions calculation
    const sellerAuctions = auctions.filter(a => 
      (sellerId && (a.sellerId === sellerId || (a as any).seller_id === sellerId)) ||
      (targetSeller.sellerName && a.sellerName === targetSeller.sellerName)
    );
    const completedAuctions = sellerAuctions.filter(a => 
      a.status === 'completed' || 
      a.payment_status === 'paid' || 
      ((a.winnerId || (a as any).winner_id) && (new Date(a.endTime).getTime() <= Date.now() || (a as any).status === 'ended'))
    );
    
    targetSeller.totalSold = targetSeller.sold_count !== undefined 
      ? targetSeller.sold_count 
      : completedAuctions.length;

    // Member since date
    const createdAtVal = targetSeller.created_at || targetSeller.createdAt || foundUser?.created_at || foundUser?.createdAt;
    if (createdAtVal) {
      const year = new Date(createdAtVal).getFullYear();
      targetSeller.memberSince = isNaN(year) ? '' : year.toString();
    } else {
      targetSeller.memberSince = '';
    }

    targetSeller.verified = Boolean(targetSeller.is_verified ?? targetSeller.isVerified ?? foundUser?.is_verified ?? foundUser?.isVerified ?? false);
    targetSeller.type = targetSeller.user_type === 'business' || targetSeller.type === 'business' ? 'business' : 'individual';

    navigateTo("sellerProfile", { selectedSeller: targetSeller });

    // Also fetch fresh user document from Firestore if sellerId exists to ensure real-time photo & bio
    if (sellerId) {
      getDoc(doc(db, 'users', sellerId)).then((userDoc) => {
        if (userDoc.exists()) {
          const uData = userDoc.data();
          const freshPhoto = uData.profile_picture_url || uData.profilePicture || uData.photoURL || null;
          setSelectedSeller(prev => {
            if (!prev || (prev.id !== sellerId && (prev as any).sellerId !== sellerId)) return prev;
            return {
              ...prev,
              ...uData,
              photoURL: freshPhoto || (prev as any).photoURL,
              profile_picture_url: freshPhoto || (prev as any).profile_picture_url,
              profilePicture: freshPhoto || (prev as any).profilePicture,
              verified: Boolean(uData.is_verified ?? uData.isVerified ?? (prev as any).verified)
            };
          });
        }
      }).catch((err) => {
        console.warn('Could not fetch seller user doc:', err);
      });
    }
  };

  
  const handlePublishPackage = async (pkg: {title: string, items: any[], packageId: string}) => {
    if (!userData?.id) {
      toast.error(t("loginRequired"));
      return;
    }
    
    const getConditionTranslations = (cond: string) => {
        switch (cond) {
          case "Novo": return { SLO: "Novo", EN: "New", DE: "Neu" };
          case "Kot novo": return { SLO: "Kot novo", EN: "Like New", DE: "Wie Neu" };
          case "Rabljeno": return { SLO: "Rabljeno", EN: "Used", DE: "Gebraucht" };
          case "Potrebno obnove": return { SLO: "Potrebno obnove", EN: "Needs Restoration", DE: "Restaurierungsbedürftig" };
          case "Za dele": return { SLO: "Za dele", EN: "For Parts", DE: "Für Ersatzteile" };
          default: return { SLO: cond, EN: cond, DE: cond };
        }
      };

    try {
      const auctionIds = [];
      for (const itemData of pkg.items) {
          // Skip already published items, but collect their IDs
          if (itemData.is_published && itemData.id) {
              auctionIds.push(itemData.id);
              continue;
          }
          
          const payload = {
            title: { SLO: itemData.title?.SLO || itemData.title, EN: itemData.title?.SLO || itemData.title, DE: itemData.title?.SLO || itemData.title },
            description: { SLO: itemData.description, EN: itemData.description, DE: itemData.description },
            current_price: parseInt(itemData.startingPrice),
            bid_count: 0,
            item_count: 1,
            end_time: itemData.endTime || new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
            location: itemData.location || { SLO: "Neznano", EN: "Unknown", DE: "Unbekannt" },
            region: itemData.region || "Osrednjeslovenska",
            category: itemData.category || "Ostalo",
            condition: getConditionTranslations(itemData.condition || "Rabljeno"),
            specifications: itemData.specifications || {},
            bidding_history: [],
            top_bids: [],
            winner_id: null,
            winnerId: null,
            payment_status: 'unpaid',
            post_auction_status: null,
            images: itemData.images,
            delivery_option: itemData.delivery_option || 'both',
            shipping_fee_type: itemData.shipping_fee_type || 'calculated',
            shipping_cost: itemData.shipping_cost !== undefined ? itemData.shipping_cost : null,
            is_package: true,
            package_id: pkg.packageId,
            package_title: pkg.title,
            created_at: new Date().toISOString()
          };
          
          const res = await createAuctionAction({ itemData: payload, user_id: userData.id });
          if (res.success) {
             auctionIds.push(res.data?.id || itemData.id || crypto.randomUUID());
          } else {
             toast.error(`Napaka pri objavi '${payload.title.SLO}': ${res.error || 'Neznana napaka'}`);
             throw new Error(res.error || "Failed to publish item");
          }
      }
      
      // Upsert package document
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('./lib/firebase');
      const pkgRef = doc(db, 'packages', pkg.packageId);
      await setDoc(pkgRef, {
          id: pkg.packageId,
          title: pkg.title,
          seller_id: userData.id,
          auction_ids: auctionIds,
          status: 'active',
          created_at: new Date().toISOString()
      }, { merge: true });

      toast.success("Zbirka je uspešno objavljena!");
      setActiveView("grid");
      setCreateMode("choice");
      fetchAuctions();
    } catch (e) {
      toast.error("Napaka pri povezavi");
    }
  };

  const handlePublish = async (itemData: any) => {
    if (!userData?.id) {
      toast.error(t("loginRequired"));
      return;
    }

    // Strict validation for mandatory invoice data
    const invoiceCheck = checkUserInvoiceData(userData);
    if (!invoiceCheck.isComplete) {
      setAppMissingInvoiceDataModal({
        isOpen: true,
        missingFields: invoiceCheck.missingFields,
        userType: invoiceCheck.userType
      });
      return;
    }

    try {
      // Remove [EN] and [DE] prefix hardcoding as this looks like test data and is unnecessary
      const simulatedTitle = {
        SLO: itemData.title?.SLO || itemData.title,
        EN: itemData.title?.SLO || itemData.title,
        DE: itemData.title?.SLO || itemData.title,
      };
      const simulatedDescription = {
        SLO: itemData.description,
        EN: itemData.description,
        DE: itemData.description,
      };

      // Construct dynamic condition payload based on Slovene selection
      const getConditionTranslations = (cond: string) => {
        switch (cond) {
          case "Novo":
            return { SLO: "Novo", EN: "New", DE: "Neu" };
          case "Kot novo":
            return { SLO: "Kot novo", EN: "Like New", DE: "Wie Neu" };
          case "Rabljeno":
            return { SLO: "Rabljeno", EN: "Used", DE: "Gebraucht" };
          case "Potrebno obnove":
            return {
              SLO: "Potrebno obnove",
              EN: "Needs Restoration",
              DE: "Restaurierungsbedürftig",
            };
          case "Za dele":
            return { SLO: "Za dele", EN: "For Parts", DE: "Für Ersatzteile" };
          default:
            return { SLO: cond, EN: cond, DE: cond };
        }
      };

      const auctionPayload = {
        id: itemData.id,
        title: simulatedTitle,
        description: simulatedDescription,
        current_price: parseInt(itemData.startingPrice),
        bid_count: 0,
        item_count: 1,
        end_time:
          itemData.endTime ||
          new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        location: itemData.location || {
          SLO: "Neznano",
          EN: "Unknown",
          DE: "Unbekannt",
        },
        region: normalizeRegionName(itemData.region || (typeof itemData.location === 'object' ? itemData.location?.SLO : itemData.location)),
        category: itemData.category || Category.Ostalo,
        condition: getConditionTranslations(itemData.condition || "Rabljeno"),
        specifications: itemData.specifications || {},
        bidding_history: [],
        top_bids: [],
        winner_id: null,
        winnerId: null,
        payment_status: 'unpaid',
        post_auction_status: null,
        images: itemData.images,
        delivery_option: itemData.delivery_option || 'both',
        shipping_fee_type: itemData.shipping_fee_type || 'calculated',
        shipping_cost: itemData.shipping_cost !== undefined ? itemData.shipping_cost : null,
        created_at: new Date().toISOString(),
        is_package: false,
        package_id: null,
        packageId: null,
        package_title: null,
      };

      let publishSuccess = false;

      try {
        const res = await createAuctionAction({ itemData: auctionPayload, user_id: userData.id });
        if (res.success) {
          publishSuccess = true;
        } else if (res.error) {
          // If action reported an explicit error, verify if it's an API route failure where client fallback can handle it
          console.warn("API create returned error, falling back to direct Firestore:", res.error);
          const newDocRef = itemData.id ? doc(db, 'auctions', itemData.id) : doc(collection(db, 'auctions'));
          await setDoc(newDocRef, {
            ...auctionPayload,
            id: newDocRef.id,
            seller_id: userData.id,
            status: "active"
          }, { merge: true });
          publishSuccess = true;
        }
      } catch (fetchErr) {
        console.warn("Direct API create failed, using direct Firestore save fallback:", fetchErr);
        const newDocRef = itemData.id ? doc(db, 'auctions', itemData.id) : doc(collection(db, 'auctions'));
        await setDoc(newDocRef, {
          ...auctionPayload,
          id: newDocRef.id,
          seller_id: userData.id,
          status: "active"
        }, { merge: true });
        publishSuccess = true;
      }

      if (publishSuccess) {
        setActiveView("grid");
        toast.success(t("auctionPublished"));
        fetchAuctions(); // Refresh the list from DB
      }
    } catch (error: any) {
      console.error("HandlePublish Exception:", error);
      toast.error(t("publishError"));
    }
  };

  const handleLogout = useCallback(async () => {
    // Clear state immediately for better UX
    setIsLoggedIn(false);
    setUser(null);
    setIsVerified(false);
    setUserType(null);
    setUserData({
      firstName: "",
      lastName: "",
      email: "",
      profilePicture: "",
    } as any);
    setHasAcceptedTerms(false);
    setActiveView("grid");

    try {
      cleanupAllListeners();
      await safeSignOut(auth);
      toast.success(t("loggedOut"));
    } catch (err) {
      console.error("Error signing out:", err);
    }
  }, [t]);

  const handleStripeVerified = useCallback(async () => {
    if (!userData.id) return;
    const snap = await getDoc(doc(db, 'users', userData.id));
    const data: any = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    if (data) {
      setUserData((prev) => ({
        ...prev,
        stripe_onboarding_complete: data.stripe_onboarding_complete,
        stripe_account_id: data.stripe_account_id,
      }));
      toast.success(
        "Plačila so uspešno nastavljena! Sedaj lahko objavljate dražbe.",
      );
    } else {
      setUserData((prev) => ({ ...prev, stripe_onboarding_complete: true }));
      toast.success(
        "Plačila so uspešno nastavljena! Sedaj lahko objavljate dražbe.",
      );
    }
  }, [userData.id]);

  const handleSubscribe = async (tier: SubscriptionTier) => {
    const prices = {
      [SubscriptionTier.FREE]: 0,
      [SubscriptionTier.BASIC]: 20,
      [SubscriptionTier.PRO]: 50,
    };
    const planNames = {
      [SubscriptionTier.BASIC]: t("basicTier"),
      [SubscriptionTier.PRO]: t("proTier"),
      [SubscriptionTier.FREE]: t("freeTier"),
    };

    const saveSubscription = async (newTier: SubscriptionTier) => {
      setCurrentPlan(newTier);
      setIsSubscriptionCanceled(false);
      try {
        const user = auth.currentUser;
        const session = user ? { user: { id: user.uid, email: user.email } } : null;
        if (session?.user) {
          const now = new Date();
          const validUntil = new Date(now);
          validUntil.setMonth(validUntil.getMonth() + 1);
          await setDoc(doc(db, 'users', session.user.id), { 
            id: session.user.id, 
            email: session.user.email, 
            subscription: newTier,
            subscription_tier: newTier,
            subscription_active: newTier !== SubscriptionTier.FREE,
            subscription_paid_at: now.toISOString(),
            subscription_started_at: now.toISOString(),
            subscription_cycle_started_at: now.toISOString(),
            subscription_valid_until: validUntil.toISOString(),
            subscription_canceled: false
          }, { merge: true });
        }
      } catch (err) {
        console.error("Error saving subscription:", err);
      }
    };

    if (tier === SubscriptionTier.FREE) {
      await saveSubscription(tier);
      toast.success(t("paymentSuccess"));
      return;
    }
    setCheckoutData({
      amount: prices[tier],
      title: `${t("subscription")} - ${planNames[tier]}`,
      metadata: { 
        type: "subscription", 
        tier,
        planId: tier.toLowerCase(),
        package_id: tier,
        user_id: auth.currentUser?.uid || userData?.id || '', 
        buyer_id: auth.currentUser?.uid || userData?.id || '',
        buyer_data: userData 
      },
      onSuccess: async () => {
        setIsCheckoutOpen(false);
        await saveSubscription(tier);
        toast.success(t("paymentSuccess"));
      },
    });
    setIsCheckoutOpen(true);
  };

  const handleSaveSettings = useCallback(
    async (data: any) => {
      console.log("handleSaveSettings called with data:", data);
      const uid = auth.currentUser?.uid || userData?.id;
      if (!uid) {
        console.log("No user ID found in state");
        toast.error("Uporabnik ni prijavljen.");
        return;
      }

      try {
        // Update password if provided
        if (data.newPassword && data.oldPassword) {
          let passError = null;
          try {
            if (auth.currentUser) await updatePassword(auth.currentUser, data.newPassword);
          } catch (e) {
            passError = e;
          }
          if (passError) {
            toast.error(`Napaka pri spremembi gesla: ${passError.message}`);
            return;
          }
        }

        // Update user profile data
        
        const currentEmail = userData?.email || auth.currentUser?.email || '';
        
        if (data.email && data.email !== currentEmail && auth.currentUser?.providerData.some(p => p.providerId === 'password')) {
          try {
             await fetch('/api/auth/send-email-change', {
               method: 'POST',
               headers: await getAuthHeaders(),
               body: JSON.stringify({
                 newEmail: data.email,
                 displayName: userData?.first_name || userData?.username || currentEmail
               })
             });
             toast.success("Na nov e-poštni naslov smo poslali potrditveno povezavo. Sledite ji za dokončanje spremembe.");
          } catch (e: any) {
             toast.error(`Napaka pri pošiljanju potrditvenega e-poštnega sporočila: ${e.message}`);
          }
        }

        const updateData: any = {
          email: currentEmail,

          phone: data.phone ?? '',
          phoneNumber: data.phone ?? '',
          username: data.username ?? '',
          userName: data.username ?? '',
          first_name: data.firstName ?? '',
          firstName: data.firstName ?? '',
          last_name: data.lastName ?? '',
          lastName: data.lastName ?? '',
          street: data.street ?? '',
          city: data.city ?? '',
          postal_code: data.postalCode ?? '',
          postalCode: data.postalCode ?? '',
          company_name: data.companyName ?? '',
          companyName: data.companyName ?? '',
          tax_number: data.taxNumber ?? '',
          taxNumber: data.taxNumber ?? '',
          tax_id: data.taxNumber ?? '',
          taxId: data.taxNumber ?? '',
          registration_number: data.regNumber ?? '',
          regNumber: data.regNumber ?? '',
          company_street: data.companyStreet ?? '',
          companyStreet: data.companyStreet ?? '',
          company_city: data.companyCity ?? '',
          companyCity: data.companyCity ?? '',
          company_postal_code: data.companyPostalCode ?? '',
          companyPostalCode: data.companyPostalCode ?? '',
          representative: data.representative ?? '',
          country_code: data.countryCode || 'SI',
          countryCode: data.countryCode || 'SI',
          auto_invoice_generation: data.autoInvoiceGeneration !== false,
          autoInvoiceGeneration: data.autoInvoiceGeneration !== false,
          email_notifications: data.emailNotifications || { marketing: true, outbid: true, endingSoon: true, won: true, paymentReminder: true, bids: true, messages: true, invoices: true },
          emailNotifications: data.emailNotifications || { marketing: true, outbid: true, endingSoon: true, won: true, paymentReminder: true, bids: true, messages: true, invoices: true },
          address: (userData as any)?.user_type === 'individual' || (!data.companyName && !data.companyStreet)
            ? `${data.street || ''}, ${data.postalCode || ''} ${data.city || ''}`.trim().replace(/^,|,$/g, '').trim()
            : `${data.companyStreet || ''}, ${data.companyPostalCode || ''} ${data.companyCity || ''}`.trim().replace(/^,|,$/g, '').trim(),
        };

        if (
          data.profilePicture &&
          data.profilePicture.startsWith("data:image")
        ) {
            console.log("Processing profile picture...");
            try {
              // Manual base64 to Blob conversion to avoid CSP fetch issues
              const base64Parts = data.profilePicture.split(",");
              const mimeType =
                base64Parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
              const base64Data = base64Parts[1];
              const byteCharacters = atob(base64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: mimeType });
              const file = new File([blob], "profile.jpg", { type: mimeType });

              // Compress image to small footprint (<60KB) for instant, reliable Firestore storage
              const options = {
                maxSizeMB: 0.06,
                maxWidthOrHeight: 500,
                useWebWorker: true,
                initialQuality: 0.6,
              };

              const superCompressed = await imageCompression(file, options);
              const compressedBase64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.onerror = error => reject(error);
                  reader.readAsDataURL(superCompressed);
              });
              updateData.profile_picture_url = compressedBase64;
              updateData.profilePicture = compressedBase64;
              console.log("Profile picture processed successfully");
            } catch (compErr) {
              console.warn("Using direct data url fallback:", compErr);
              updateData.profile_picture_url = data.profilePicture;
              updateData.profilePicture = data.profilePicture;
            }
        } else if (data.profilePicture) {
          updateData.profile_picture_url = data.profilePicture;
          updateData.profilePicture = data.profilePicture;
        } else if ((userData as any)?.profile_picture_url || (userData as any)?.profilePicture) {
          updateData.profile_picture_url = (userData as any)?.profile_picture_url || (userData as any)?.profilePicture;
          updateData.profilePicture = updateData.profile_picture_url;
        } else {
          updateData.profile_picture_url = null;
          updateData.profilePicture = null;
        }

        console.log("Updating database with:", updateData);
        await setDoc(doc(db, "users", uid), updateData, { merge: true });

        const updatedUser = { id: uid, ...updateData };

        if (updatedUser) {
          console.log("User updated successfully:", updatedUser);
          setUserData((prev) => ({ ...prev, ...updatedUser }));
        }

        toast.success(t("saveChanges") + " - " + t("success"));
      } catch (err: any) {
        console.error("Error saving settings:", err);
        if (err.code === "23505" && err.message?.includes("username")) {
          toast.error("To uporabniško ime je že zasedeno. Prosimo, izberite drugega.");
        } else if (err.message === "IMAGE_UPLOAD_FAILED" || (err.code && err.code.startsWith("storage/"))) {
            toast.error("Napaka pri nalaganju profilne slike.");
        } else {
          toast.error(`Napaka pri shranjevanju: ${err.message || err}`);
        }
      }
    },
    [userData?.id, userData?.email, t],
  );

  const getFilteredAuctions = useMemo(() => {
    let filtered = [...auctions];
    const now = new Date();

    if (activeView === "lastChance") {
      filtered = filtered
        .filter((i) => i.status === "active" && new Date(i.endTime) > now)
        .sort((a, b) => a.endTime.getTime() - b.endTime.getTime())
        .slice(0, 200);
    } else {
      filtered = filtered.filter((item) => {
        if (item.status === "completed" || new Date(item.endTime) <= now)
          return false;
        if (selectedRegion && !matchesSelectedRegion(item.region, selectedRegion)) return false;
        if (selectedCategory && item.category !== selectedCategory)
          return false;
        if (categoryFilters.delivery_option) {
          const itemDel = (item as any).delivery_option || item.delivery_method || 'both';
          if (categoryFilters.delivery_option === 'pickup' && itemDel === 'shipping_only') return false;
          if (categoryFilters.delivery_option === 'shipping' && itemDel === 'pickup_only') return false;
        }
        if (categoryFilters.condition) {
          const condText = typeof item.condition === 'string'
            ? item.condition
            : (item.condition?.[language] || item.condition?.['SLO'] || '');
          if (!condText.toLowerCase().includes(categoryFilters.condition.toLowerCase())) return false;
        }
        if (categoryFilters.specifications) {
          for (const [key, val] of Object.entries(categoryFilters.specifications)) {
            if (val) {
              const itemVal = item.specifications?.[key];
              if (!itemVal || !String(itemVal).toLowerCase().includes(String(val).toLowerCase())) {
                return false;
              }
            }
          }
        }
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const titleMatch = (item.title[language] || item.title["SLO"])
            .toLowerCase()
            .includes(q);
          const locationMatch = (
            item.location[language] || item.location["SLO"]
          )
            .toLowerCase()
            .includes(q);
          return titleMatch || locationMatch;
        }
        return true;
      }).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    return filtered;
  }, [
    auctions,
    activeView,
    selectedRegion,
    selectedCategory,
    categoryFilters,
    searchQuery,
    language,
  ]);

  const totalPages = Math.ceil(getFilteredAuctions.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAuctions = getFilteredAuctions.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    const isHomePage =
      activeView === "grid" && !selectedCategory && !searchQuery;

    if (isHomePage && auctionsSectionRef.current) {
      auctionsSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const paginationNumbers = useMemo(() => {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
    if (currentPage >= totalPages - 3)
      return [
        1,
        "...",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    return [
      1,
      "...",
      currentPage - 1,
      currentPage,
      currentPage + 1,
      "...",
      totalPages,
    ];
  }, [currentPage, totalPages]);

  let content;
  switch (activeView) {
    case "package": {
      

      // Allow Sandbox preview package to render properly by intercepting the ID
      const isSandboxPackage = selectedPackageId === mockSandboxPackageId;
      const packageAuctions = isSandboxPackage 
          ? mockSandboxPackageItems 
          : auctions.filter(a => a.package_id === selectedPackageId || (a as any).packageId === selectedPackageId);

      const pkgTitle = (packageAuctions[0] as any)?.package_title || 
        (typeof packageAuctions[0]?.title === 'object' ? packageAuctions[0]?.title[language] || packageAuctions[0]?.title['SLO'] : packageAuctions[0]?.title) || 
        "Večpredmetna dražba";
      content = (
        <PackageView
          packageId={selectedPackageId || ""}
          packageTitle={pkgTitle}
          items={packageAuctions}
          t={t}
          language={language}
          isVerified={isVerified}
          watchlist={watchedIds}
          currentUserId={userData?.id || auth.currentUser?.uid}
          bidAuctionIds={bidAuctionIds}
          onWatchToggle={toggleWatch}
          onBidSubmit={handleBidSubmit}
          onSellerClick={(seller) => navigateToSellerProfile(seller)}
          onAuctionClick={(item) => {
            navigateTo("detail", { selectedItem: item });
          }}
          onBack={() => {
            goBack("grid");
          }}
        />
      );
      break;
    }
    case "login":
      content = (
        <AuthView
          t={t}
          onLoginSuccess={() => {
            setIsLoggedIn(true);
            setSelectedRegion(null);
            setSelectedCategory(null);
            setSearchQuery("");
            goBack("grid");
          }}
          setIsVerified={setIsVerified}
          setAppLoggedIn={(val) => setIsLoggedIn(val)}
        />
      );
      break;
    case "createAuction":
      if (!isLoggedIn) {
        content = (
          <AuthView
            onLoginSuccess={() => navigateTo("createAuction")}
            t={t}
            setIsVerified={setIsVerified}
            setAppLoggedIn={(val) => setIsLoggedIn(val)}
          />
        );
      } else if (!userData.stripe_onboarding_complete) {
        content = (
          <div className="max-w-3xl mx-auto py-32 px-6 flex flex-col items-center text-center animate-in">
            <div className="bg-red-50 text-red-500 w-24 h-24 rounded-full flex items-center justify-center mb-8 border-4 border-red-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <h1 className="text-4xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">
              {t("cannotPublish")}
            </h1>
            <p className="text-lg text-slate-500 mb-8 max-w-xl font-medium">
              {t("connectBankAccountDesc")}
            </p>
            <button
              onClick={() => {
                  navigateTo("settings", { settingsTab: "stripe" });
              }}
              className="bg-[#0A1128] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-colors shadow-xl"
            >
              {t("editPayouts")}
            </button>
          </div>
        );
      } else {
        if (createMode === "choice") {
          content = (
            <div className="max-w-5xl mx-auto p-4 md:p-8 animate-in fade-in">
              <h1 className="text-3xl font-black mb-8 text-center text-[#0A1128]">Kaj želite ustvariti?</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div 
                  onClick={() => setCreateMode("single")}
                  className="bg-white p-8 rounded-3xl shadow-lg border-2 border-transparent hover:border-blue-500 cursor-pointer transition-all hover:-translate-y-1 group"
                >
                  <div className="bg-blue-50 w-20 h-20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <span className="text-4xl">📄</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Enojna dražba</h2>
                  <p className="text-gray-500 line-height-relaxed">
                    Objavite en posamezen predmet. Idealno za večino prodajalcev, ki želijo prodati določen artikel.
                  </p>
                </div>
                
                <div 
                  onClick={() => setCreateMode("package")}
                  className="bg-white p-8 rounded-3xl shadow-lg border-2 border-transparent hover:border-blue-500 cursor-pointer transition-all hover:-translate-y-1 group relative overflow-hidden"
                >
                  <div className="absolute top-6 right-6 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">NOVO</div>
                  <div className="bg-blue-50 w-20 h-20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <span className="text-4xl">📦</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Večpredmetna dražba</h2>
                  <p className="text-gray-500 line-height-relaxed">
                    Združite več artiklov v en paket. Račun za provizijo se obračuna šele, ko poteče ZADNJA dražba v paketu. Vsi zmagani artikli istega kupca se združijo na 1 račun.
                  </p>
                </div>
              </div>
              <div className="mt-8 text-center">
                <button onClick={() => goBack("grid")} className="text-gray-500 hover:text-black font-bold">
                  Nazaj na domačo stran
                </button>
              </div>
            </div>
          );
        } else if (createMode === "single") {
          content = (
            <CreateAuctionForm
              onBack={() => {
                if (republishData) {
                  setRepublishData(null);
                  goBack("myUnsold");
                } else {
                  setCreateMode("choice");
                }
              }}
              t={t}
              language={language}
              onPublish={handlePublish}
              isLoggedIn={isLoggedIn}
              initialData={republishData}
              userData={userData}
              auctions={auctions}
              onNavigateToSettings={(tab) => {
                navigateTo("settings", { settingsTab: tab || 'personal' });
              }}
            />
          );
        } else {
          content = (
            <CreatePackageForm
              initialData={republishData}
              onBack={() => { 
                if (republishData) {
                  setRepublishData(null);
                  goBack("myUnsold");
                } else {
                  setCreateMode("choice");
                }
              }}
              t={t}
              language={language}
              onPublishPackage={handlePublishPackage}
              onPublishItemDirectly={async (itemData: any, pkgTitle: string, packageId: string) => {
                 if (!userData?.id) return;
                 const getConditionTranslations = (cond: string) => {
                    switch (cond) {
                    case "Novo": return { SLO: "Novo", EN: "New", DE: "Neu" };
                    case "Kot novo": return { SLO: "Kot novo", EN: "Like New", DE: "Wie Neu" };
                    case "Rabljeno": return { SLO: "Rabljeno", EN: "Used", DE: "Gebraucht" };
                    case "Potrebno obnove": return { SLO: "Potrebno obnove", EN: "Needs Restoration", DE: "Restaurierungsbedürftig" };
                    case "Za dele": return { SLO: "Za dele", EN: "For Parts", DE: "Für Ersatzteile" };
                    default: return { SLO: cond, EN: cond, DE: cond };
                    }
                 };
                 const payload = {
                    ...itemData,
                    title: { SLO: itemData.title?.SLO || itemData.title, EN: itemData.title?.SLO || itemData.title, DE: itemData.title?.SLO || itemData.title },
                    description: { SLO: itemData.description, EN: itemData.description, DE: itemData.description },
                    current_price: parseInt(itemData.startingPrice),
                    bid_count: 0,
                    item_count: 1,
                    end_time: itemData.endTime,
                    location: itemData.location || { SLO: "Neznano", EN: "Unknown", DE: "Unbekannt" },
                    region: itemData.region || "Osrednjeslovenska",
                    category: itemData.category || "Ostalo",
                    condition: getConditionTranslations(itemData.condition || "Rabljeno"),
                    specifications: {},
                    bidding_history: [],
                    top_bids: [],
                    winner_id: null,
                    winnerId: null,
                    payment_status: 'unpaid',
                    post_auction_status: null,
                    images: itemData.images,
                    delivery_option: itemData.delivery_option || 'both',
                    shipping_fee_type: itemData.shipping_fee_type || 'calculated',
                    shipping_cost: itemData.shipping_cost !== undefined ? itemData.shipping_cost : null,
                    is_package: true,
                    package_id: packageId,
                    package_title: pkgTitle
                 };
                 const res = await createAuctionAction({ itemData: payload, user_id: userData.id });
                 if (!res.success) throw new Error(res.error || "Failed to publish item");
              }}
              isLoggedIn={isLoggedIn}
              userData={userData}
              auctions={auctions}
              onNavigateToSettings={(tab) => {
                navigateTo("settings", { settingsTab: tab || 'personal' });
              }}
            />
          );
        }
      }
      break;
    case "detail":
      if (selectedItem) {
        content = (
          <AuctionView
            item={auctions.find(a => a.id === selectedItem.id) || selectedItem}
            t={t}
            onSellerClick={(sellerInput) => {
              const currentAuction = auctions.find(a => a.id === selectedItem.id) || selectedItem;
              navigateToSellerProfile(sellerInput || (currentAuction as any)?.seller || currentAuction?.sellerId || currentAuction?.sellerName, currentAuction?.sellerName);
            }}
            language={language}
            isVerified={isVerified}
            isWatched={watchedIds.includes(selectedItem.id)}
            onWatchToggle={() => toggleWatch(selectedItem.id)}
            currentPlan={currentPlan}
            currentUserId={userData.id}
            onBack={() => {
              goBack("grid");
            }}
            onBidSubmit={handleBidSubmit}
            onCheckout={(item) => {
              setCheckoutData({
                amount: item.currentBid || item.current_price,
                title:
                  item.title?.[language] ||
                  item.title?.["SLO"] ||
                  t("auctionFallback"),
                onSuccess: async () => {
                  setIsCheckoutOpen(false);
                  toast.success(t("paymentSuccessEmail") || "Plačilo sprejeto. Potrditev lahko traja nekaj sekund.");
                  fetchAuctions();
                  if (userData?.id) refreshUserData(userData.id);
                },
                metadata: {
                  auction_id: item.id,
                  buyer_id: userData.id,
                  seller_id: item.sellerId || item.seller_id,
                  fee_percentage: 10,
                  buyer_data: userData,
                },
              });
              setIsCheckoutOpen(true);
            }}
          />
        );
      }
      break;
    
    case "verification":
      content = (
        <VerificationView
          onBack={() => goBack("grid")}
          t={t}
          isVerified={isVerified}
          userType={userType}
          initialData={userData}
          onVerify={async (type, data) => {
            console.log(
              "Starting verification process for type:",
              type,
              "with data:",
              data,
            );
            try {
              let userId = auth.currentUser?.uid || userData?.id;

              if (!userId) {
                console.log("No userId in state, fetching session...");
                const user = auth.currentUser;
      const session = user ? { user: { id: user.uid, email: user.email } } : null;
                userId = session?.user?.id || "";
                console.log("Session fetched:", userId);
              } else {
                console.log("Using userId from state:", userId);
              }

              if (!userId) {
                throw new Error("Uporabnik ni prijavljen.");
              }

              // Prepare data to override ALL relevant fields
              const updateData: any = {
                id: userId,
                email: data.email,
                profile_completed: true,
                user_type: type,
                userType: type,
                first_name: data.firstName || '',
                firstName: data.firstName || '',
                last_name: data.lastName || '',
                lastName: data.lastName || '',
                street: data.street || '',
                city: data.city || '',
                postal_code: data.postalCode || '',
                postalCode: data.postalCode || '',
                tax_number: data.taxNumber || '',
                taxNumber: data.taxNumber || '',
                tax_id: data.taxNumber || '',
                taxId: data.taxNumber || '',
                registration_number: data.regNumber || '',
                regNumber: data.regNumber || '',
                company_name: data.companyName || '',
                companyName: data.companyName || '',
                company_street: data.companyStreet || '',
                companyStreet: data.companyStreet || '',
                company_city: data.companyCity || '',
                companyCity: data.companyCity || '',
                company_postal_code: data.companyPostalCode || '',
                companyPostalCode: data.companyPostalCode || '',
                representative: data.representative || '',
                address: type === 'individual' 
                  ? `${data.street || ''}, ${data.postalCode || ''} ${data.city || ''}`.trim().replace(/^,|,$/g, '').trim()
                  : `${data.companyStreet || ''}, ${data.companyPostalCode || ''} ${data.companyCity || ''}`.trim().replace(/^,|,$/g, '').trim(),
              };

              console.log("Updating verification data:", updateData);

              const updatePromise = (async () => {
                try {
                  await setDoc(doc(db, 'users', userId), updateData, { merge: true });
                  const snap = await getDoc(doc(db, 'users', userId));
                  return { data: snap.exists() ? { id: snap.id, ...snap.data() } : null, error: null };
                } catch(e) { return { data: null, error: e }; }
              })();

              const timeoutPromise = new Promise<{ data: any; error: any }>(
                (resolve) =>
                  setTimeout(
                    () =>
                      resolve({
                        data: null,
                        error: {
                          message:
                            "Povezava s strežnikom je potekla. Prosimo, osvežite stran in poskusite znova.",
                        },
                      }),
                    8000,
                  ),
              );

              const { data: updatedUser, error } = (await Promise.race([
                updatePromise,
                timeoutPromise,
              ])) as any;

              if (error) {
                console.error("Supabase update error:", error);
                throw new Error(`Napaka pri shranjevanju: ${error.message}`);
              }

              console.log(
                "Verification data saved successfully. Updating state...",
              );
              setIsVerified(true);
              setUserType(type);

              if (updatedUser) {
                console.log("Updated user data fetched:", updatedUser);
                setUserData((prev) => ({
                  ...prev,
                  ...updatedUser,
                  id: userId,
                  profile_completed: true,
                }));
              }

              toast.success("Verifikacija uspešna!");
              return true;
            } catch (err: any) {
              console.error("Detailed verification error:", err);
              toast.error(
                err.message || "Prišlo je do napake pri verifikaciji.",
              );
              throw err;
            }
          }}
        />
      );
      break;
    case "settings":
      content = (
        <SettingsView
          t={t}
          language={language}
          user={userData}
          auctions={auctions}
          onSave={handleSaveSettings}
          onVerify={() => navigateTo("verification")}
          onStripeVerified={handleStripeVerified}
          onRefreshUser={() => refreshUserData(userData.id)}
          activeTab={settingsTab}
          setActiveTab={setSettingsTab}
          onBack={() => goBack("grid")}
        />
      );
      break;
    case "subscriptions":
      content = (
        <SubscriptionsView
          t={t}
          language={language}
          currentPlan={currentPlan}
          onSubscribe={handleSubscribe}
          isVerified={isVerified}
          isCanceled={isSubscriptionCanceled}
          nextBillingDate={nextBillingDate}
          subscribedAt={subscribedAt}
          onBack={() => goBack("grid")}
          onSyncSubscription={() => handleSyncSubscription(true)}
          isSyncing={isSyncingSub}
          onCancelSubscription={async () => {
            const token = await auth.currentUser?.getIdToken();
            if (token) {
              const res = await cancelSubscriptionAction(token);
              if (res.success) {
                setIsSubscriptionCanceled(true);
                toast.success(
                  "Avtomatska bremenitev je preklicana. Naročnina vam ostane veljavna do konca obračunskega obdobja."
                );
              } else {
                toast.error(res.error || "Napaka pri preklicu naročnine.");
              }
            }
          }}
        />
      );
      break;
    case "myBids":
      content = (
        <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
          <button
            onClick={() => goBack("grid")}
            className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
          >
            <ArrowLeft size={16} /> {t("back")}
          </button>
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
            <div className="flex items-center gap-6 mb-12">
              <div className="bg-[#FEBA4F] p-4 rounded-3xl shadow-lg shadow-[#FEBA4F]/20">
                <Gavel size={40} className="text-[#0A1128]" />
              </div>
              <div>
                <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128]">
                  {t("myBids")}
                </h2>
                <p className="text-slate-400 font-bold mt-2">
                  {t("myBidsDesc")}
                </p>
              </div>
            </div>

            <div
              className="grid gap-8 justify-center"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 320px))",
              }}
            >
              {auctions
                .filter(
                  (a) =>
                    a.status === "active" && new Date(a.endTime) > new Date() &&
                    ((a.top_bids && a.top_bids.some((b: any) => b.user_id === userData.id)) || bidAuctionIds.includes(a.id)),
                )
                .map((item) => (
                  <AuctionCard
                    key={item.id}
                    item={item}
                    t={t}
                    language={language}
                    isVerified={isVerified}
                    currentUserId={userData.id}
                    hasBid={true}
                    isWatched={watchedIds.includes(item.id)}
                    onWatchToggle={() => toggleWatch(item.id)}
                    onClick={() => {
                      navigateTo("detail", { selectedItem: item });
                    }}
                    onBidSubmit={handleBidSubmit}
                    onSellerClick={(seller) => {
                      navigateToSellerProfile(seller, item.sellerName);
                    }}
                  />
                ))}
              {auctions
                .filter((a) => bidAuctionIds.includes(a.id))
                .filter(
                  (a) =>
                    a.status === "active" && new Date(a.endTime) > new Date(),
                ).length === 0 && (
                <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                  <Gavel size={48} className="mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500 font-black uppercase tracking-widest text-xs">
                    {t("noBids")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
      break;
    case "sellerProfile":
      if (selectedSeller) {
        content = (
          <SellerView
            seller={selectedSeller}
            onBack={() => goBack("grid")}
            onAuctionClick={(item) => {
              navigateTo("detail", { selectedItem: item });
            }}
            t={t}
            language={language}
            isLoggedIn={isLoggedIn}
            currentUserWinnings={currentUserWinnings}
            auctions={auctions}
          />
        );
      }
      break;
    case "winnings":
      content = (
        <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
          <button
            onClick={() => goBack("grid")}
            className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
          >
            <ArrowLeft size={16} /> Nazaj
          </button>
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
            <div className="flex items-center gap-6 mb-12">
              <div className="bg-[#FEBA4F] p-4 rounded-3xl shadow-lg shadow-[#FEBA4F]/20">
                <Trophy size={40} className="text-[#0A1128]" />
              </div>
              <div>
                <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128]">
                  {t("myWinnings")}
                </h2>
                <p className="text-slate-400 font-bold mt-2">
                  Pregled in plačilo dobljenih dražb
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {currentUserWinnings.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-slate-500 font-black uppercase tracking-widest text-lg">
                    {t("noWinnings")}
                  </p>
                </div>
              ) : (
                currentUserWinnings.map((wonItem) => {
                  const feePercentage =
                    currentPlan === SubscriptionTier.PRO
                      ? 5
                      : currentPlan === SubscriptionTier.BASIC
                        ? 10
                        : 12;
                  const commissionNet = calculateMarginalPlatformFee(
                    wonItem.currentBid,
                    currentPlan,
                  );
                  const totalAmountToPay =
                    wonItem.currentBid + commissionNet * 1.22;

                  const paymentDeadlineMs = new Date((wonItem as any).payment_deadline || wonItem.endTime || (wonItem as any).end_time).getTime() + ((wonItem as any).payment_deadline ? 0 : 48 * 60 * 60 * 1000);
                  const isOverdue = wonItem.payment_status !== "paid" && (
                    wonItem.post_auction_status === "failed_1st" || 
                    wonItem.post_auction_status === "unpaid" || 
                    wonItem.post_auction_status === "unsold" ||
                    Date.now() > paymentDeadlineMs
                  );

                  const userStrikesCount = Math.max(1, Number((userData as any)?.unpaidStrikes ?? (userData as any)?.unpaid_strikes ?? 1));
                  const strikeOrdinal = userStrikesCount === 1 ? "1. opomin (Strike 1/3)" : userStrikesCount === 2 ? "2. opomin (Strike 2/3)" : `${userStrikesCount}. zadnji opomin (Strike 3/3)`;

                  return (
                    <div
                      key={wonItem.id}
                      className={`flex flex-col md:flex-row items-center gap-8 p-6 rounded-[2.5rem] border-2 transition-colors group ${
                        isOverdue 
                          ? "border-red-500 bg-red-50/20 shadow-sm" 
                          : "border-slate-100 hover:border-[#FEBA4F]"
                      }`}
                    >
                      <div
                        className={`w-32 h-32 shrink-0 bg-slate-100 rounded-3xl overflow-hidden shadow-md transition-transform ${
                          isOverdue ? "cursor-not-allowed opacity-80" : "cursor-pointer group-hover:scale-105"
                        }`}
                        onClick={() => {
                          if (isOverdue) return;
                          navigateTo("detail", { selectedItem: wonItem });
                        }}
                      >
                        {wonItem.images &&
                          wonItem.images.length > 0 &&
                          typeof wonItem.images[0] === "string" && (
                            <SignedImg
                              src={
                                wonItem.images[0]
                              }
                              alt="Item"
                              className="w-full h-full object-cover"
                            />
                          )}
                      </div>
                      <div className="flex-1 text-center md:text-left">
                        <h3
                          className={`text-2xl font-black uppercase tracking-tighter mb-2 transition-colors ${
                            isOverdue 
                              ? "text-slate-700 cursor-not-allowed" 
                              : "text-[#0A1128] cursor-pointer hover:text-[#FEBA4F]"
                          }`}
                          onClick={() => {
                            if (isOverdue) return;
                            navigateTo("detail", { selectedItem: wonItem });
                          }}
                        >
                          {wonItem.title[
                            language as keyof typeof wonItem.title
                          ] || wonItem.title.SLO}
                        </h3>
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-bold text-slate-400 mt-2">
                          <span className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                            <Gavel size={16} /> Končni znesek (vklj. s provizijo
                            in DDV):{" "}
                            <span className="text-[#0A1128] font-black">
                              €
                              {totalAmountToPay.toLocaleString("sl-SI", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </span>
                          {wonItem.payment_status !== "paid" && (
                            <PaymentTimer endTime={wonItem.endTime} />
                          )}
                        </div>

                        {/* Overdue alert notice for winner */}
                        {isOverdue && (
                          <div className="mt-3 p-3.5 bg-red-100/70 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-start sm:items-center gap-2.5">
                            <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5 sm:mt-0" />
                            <span>
                              Zaradi neplačila v roku 48 ur ste prejeli <strong className="font-black text-red-800">{strikeOrdinal}</strong>. {(userData as any)?.isBlocked || ((userData as any)?.unpaidStrikes || 0) >= 3 ? "Vaš račun je trajno blokiran za ponujanje na dražbah." : "Pri 3 opominih se račun avtomatsko blokira."}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-3 w-full lg:w-auto shrink-0 mt-4 md:mt-0">
                        {wonItem.payment_status === "paid" ? (
                          <div className="flex flex-col items-center md:items-end gap-3 w-full">
                            <div className="flex flex-col items-center md:items-end gap-1 w-full">
                              <div className="bg-green-50 text-green-600 px-6 py-2 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center gap-2 border-2 border-green-100 w-full justify-center md:w-auto md:justify-end">
                                <CheckCircle2 size={16} /> Plačano
                              </div>
                              {wonItem.paid_at && (
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                  Plačano dne:{" "}
                                  {new Date(wonItem.paid_at).toLocaleDateString(
                                    "sl-SI",
                                  )}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 w-full shrink-0">
                              <div className="flex flex-col gap-3 flex-1 min-w-[140px]">
                                <button
                                  onClick={() => {
                                    navigateTo("detail", { selectedItem: wonItem });
                                  }}
                                  className="bg-slate-100 text-[#0A1128] px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#FEBA4F] transition-all shadow-sm flex items-center justify-center gap-2 h-[42px]"
                                >
                                  Odpri dražbo
                                </button>
                                
                                <button
                                  onClick={() => {
                                    const seller = usersMap.get(wonItem.sellerId);
                                    setInvoiceModalData({
                                      isOpen: true,
                                      auction: wonItem,
                                      seller: seller,
                                      buyer: userData
                                    });
                                  }}
                                  className="bg-slate-100 text-[#0A1128] border-2 border-slate-200 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:border-slate-400 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5 h-[42px] mt-auto"
                                >
                                  <FileText size={14} /> Račun
                                </button>
                              </div>

                              <div className="flex flex-col gap-3 flex-1 min-w-[140px]">
                                {wonItem.delivery_method !== "post" ? (
                                  <button
                                    onClick={() => {
                                      setActiveConversationId(wonItem.id);
                                      setActiveView("messages");
                                      window.scrollTo({
                                        top: 0,
                                        behavior: "instant",
                                      });
                                    }}
                                    className="bg-[#FEBA4F] text-[#0A1128] px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all flex items-center justify-center gap-2 h-[42px]"
                                  >
                                    <MessageSquare size={14} /> Sporočila
                                  </button>
                                ) : (
                                  <div className="h-[42px] hidden sm:block"></div>
                                )}

                                <div className="flex flex-col items-center justify-center gap-2 mt-auto h-[42px] w-full">
                                  {wonItem.buyer_received ? (
                                    <div className="text-green-500 font-bold text-[10px] uppercase flex items-center gap-1 w-full justify-center bg-green-50 py-2 rounded-xl border border-green-100 h-[42px]">
                                      <CheckCircle2 size={12} /> Predmet prejet
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setReceiptConfirmModal({
                                          isOpen: true,
                                          auctionId: wonItem.id,
                                          sellerId: wonItem.sellerId,
                                        })
                                      }
                                      className="bg-white border-2 border-slate-200 text-[#0A1128] px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:border-[#FEBA4F] transition-all w-full h-[42px] flex items-center justify-center"
                                    >
                                      Potrdi prejem
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col gap-3 flex-1 min-w-[140px]">
                                {(wonItem as any).review_submitted ? (
                                  <button
                                    onClick={() => openReviewModal(wonItem)}
                                    className="bg-green-50 text-green-700 border-2 border-green-200 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[11px] hover:bg-green-100 transition-all flex items-center justify-center gap-1.5 h-[42px] shadow-sm"
                                    title="Vaša oddana ocena za prodajalca"
                                  >
                                    <Star size={14} className="text-[#FEBA4F] fill-[#FEBA4F]" />
                                    <span>Ocenjeno ({(wonItem as any).review_rating || 5}★)</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => openReviewModal(wonItem)}
                                    className="bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] border-2 border-[#FEBA4F]/40 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all shadow-md flex items-center justify-center gap-1.5 h-[42px]"
                                    title="Oddajte oceno za prodajalca"
                                  >
                                    <Star size={14} className="fill-current" />
                                    <span>Oceni prodajalca</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : isOverdue ? (
                          <div className="flex flex-col gap-2 w-full lg:w-auto min-w-[220px]">
                            <button
                              disabled
                              className="bg-red-100 text-red-600 border border-red-200 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs cursor-not-allowed flex items-center justify-center gap-2 opacity-80 shadow-none w-full"
                            >
                              <Lock size={16} /> Plačilo zaklenjeno
                            </button>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center py-1">
                              Sporočila onemogočena
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 w-full">
                            {wonItem.post_auction_status !== 'offered_2nd' && wonItem.post_auction_status !== 'rejected_2nd' && (
                              <button
                                onClick={async () => {
                                  setCheckoutData({
                                    amount: parseFloat(
                                      totalAmountToPay.toFixed(2),
                                    ),
                                    title: `${t("paymentFor")}: ${wonItem.title[language as keyof typeof wonItem.title] || wonItem.title.SLO}`,
                                    onSuccess: async () => {
                                      setIsCheckoutOpen(false);
                                      toast.success(t("paymentSuccessEmail") || "Plačilo sprejeto. Potrditev lahko traja nekaj sekund.");
                                      fetchAuctions();
                                      if (userData?.id) refreshUserData(userData.id);
                                    },
                                    metadata: {
                                      auction_id: wonItem.id,
                                      buyer_id: userData.id,
                                      seller_id: wonItem.sellerId,
                                      fee_percentage: feePercentage,
                                      buyer_data: userData,
                                    },
                                  });
                                  setIsCheckoutOpen(true);
                                }}
                                className="bg-[#0A1128] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-2"
                              >
                                <CardIcon size={18} /> Plačaj zdaj
                              </button>
                            )}
                            {wonItem.delivery_method !== "post" && (
                              <button
                                onClick={() => {
                                  setActiveConversationId(wonItem.id);
                                  setActiveView("messages");
                                  window.scrollTo({
                                    top: 0,
                                    behavior: "instant",
                                  });
                                }}
                                className="bg-[#FEBA4F] text-[#0A1128] px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all flex items-center justify-center gap-2"
                              >
                                <MessageSquare size={18} /> Sporočila
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
      break;
    case "mySold":
      const currentUserSold = auctions.filter(
        (a) =>
          (a.sellerId === userData.id ||
            (a as any).seller_id === userData.id) &&
          (a.status === "completed" || new Date(a.endTime) <= new Date()) &&
          !!(a.winnerId || (a as any).winner_id),
      );
      content = (
        <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
          <button
            onClick={() => goBack("grid")}
            className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
          >
            <ArrowLeft size={16} /> Nazaj
          </button>
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
            <div className="flex items-center gap-6 mb-12">
              <div className="bg-[#FEBA4F] p-4 rounded-3xl shadow-lg shadow-[#FEBA4F]/20">
                <CreditCard size={40} className="text-[#0A1128]" />
              </div>
              <div>
                <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128]">
                  Prodane dražbe
                </h2>
                <p className="text-slate-400 font-bold mt-2">
                  Pregled vaših zaključenih in prodanih dražb
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {currentUserSold.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-slate-500 font-black uppercase tracking-widest text-lg">
                    Nimate prodanih dražb
                  </p>
                </div>
              ) : (
                currentUserSold.map((soldItem) => {
                  const winnerId = soldItem.winnerId || (soldItem as any).winner_id || soldItem.second_highest_bidder_id || ((soldItem as any).top_bids && (soldItem as any).top_bids[0]?.bidder_id);
                  const buyer = winnerId ? usersMap.get(winnerId) : null;
                  const isPostalShipping = soldItem.delivery_method === "post" ||
                    soldItem.delivery_method === "shipping" ||
                    (soldItem as any).selected_delivery === "post" ||
                    (soldItem as any).selected_delivery === "shipping" ||
                    (soldItem as any).delivery_option === "shipping_only";

                  const buyerName = buyer?.company_name
                    ? buyer.company_name
                    : buyer?.first_name || buyer?.firstName
                    ? `${buyer.first_name || buyer.firstName} ${buyer.last_name || buyer.lastName || ''}`.trim()
                    : buyer?.username || buyer?.email || "Kupec";
                  const buyerAddress = buyer?.address || buyer?.street_address || "";
                  const buyerPostalCode = buyer?.postal_code || buyer?.postcode || "";
                  const buyerCity = buyer?.city || buyer?.place || "";
                  const buyerPhone = buyer?.phone || buyer?.phone_number || buyer?.telephone || "";
                  const buyerEmail = buyer?.email || "";

                  return (
                    <div
                      key={soldItem.id}
                      className="flex flex-col lg:flex-row items-start lg:items-center gap-8 p-6 sm:p-8 rounded-[2.5rem] border-2 border-slate-100 hover:border-[#FEBA4F] transition-colors group bg-white shadow-sm"
                    >
                      <div
                        className="w-32 h-32 shrink-0 bg-slate-100 rounded-3xl overflow-hidden shadow-md group-hover:scale-105 transition-transform cursor-pointer"
                        onClick={() => {
                          navigateTo("detail", { selectedItem: soldItem });
                        }}
                      >
                        {soldItem.images &&
                          soldItem.images.length > 0 &&
                          typeof soldItem.images[0] === "string" && (
                            <SignedImg
                              src={soldItem.images[0]}
                              alt="Item"
                              className="w-full h-full object-cover"
                            />
                          )}
                      </div>
                      <div className="flex-1 text-left w-full">
                        <h3
                          className="text-2xl font-black uppercase tracking-tighter text-[#0A1128] mb-2 cursor-pointer hover:text-[#FEBA4F] transition-colors"
                          onClick={() => {
                            navigateTo("detail", { selectedItem: soldItem });
                          }}
                        >
                          {soldItem.title[
                            language as keyof typeof soldItem.title
                          ] || soldItem.title.SLO}
                        </h3>
                        <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Gavel size={16} /> Prodajna cena:{" "}
                            <span className="text-[#0A1128] font-black">
                              €
                              {soldItem.currentBid.toLocaleString("sl-SI", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </span>
                          {soldItem.payment_status === "paid" ? (
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                              <CheckCircle2 size={12} /> Plačano
                            </span>
                          ) : soldItem.post_auction_status === "failed_1st" ? (
                            <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                              <AlertCircle size={12} /> Zmagovalec ni plačal
                            </span>
                          ) : soldItem.post_auction_status === "offered_2nd" ? (
                            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                              <Clock size={12} /> Čaka na odločitev 2. ponudnika
                            </span>
                          ) : soldItem.post_auction_status === "awaiting_payment_2nd" ? (
                            <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                              <Clock size={12} /> Čaka na plačilo (2. ponudnik)
                            </span>
                          ) : (
                            <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                              <Clock size={12} /> Čaka na plačilo
                            </span>
                          )}
                        </div>

                        {/* SHIPPING DETAILS BOX (WHEN POSTAL DELIVERY) */}
                        {isPostalShipping && (
                          <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-200">
                              <span className="text-xs font-black uppercase tracking-wider text-[#0A1128] flex items-center gap-1.5">
                                <Truck size={15} className="text-[#FEBA4F]" /> Podatki kupca za pošiljanje po pošti
                              </span>
                              <button
                                onClick={() => {
                                  const text = `${buyerName}\n${buyerAddress}\n${buyerPostalCode} ${buyerCity}\n${buyerPhone ? 'Tel: ' + buyerPhone : ''}\n${buyerEmail ? 'Email: ' + buyerEmail : ''}`;
                                  navigator.clipboard.writeText(text);
                                  toast.success("Naslov kupca je skopiran v odložišče!");
                                }}
                                className="text-[10px] font-black uppercase tracking-wider text-slate-600 hover:text-[#0A1128] bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm transition-colors"
                              >
                                Kopiraj naslov
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-bold text-slate-600">
                              <div>
                                <span className="text-slate-400 font-medium block text-[10px] uppercase">Prejemnik</span>
                                <span className="text-[#0A1128] font-black">{buyerName}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-medium block text-[10px] uppercase">Naslov</span>
                                <span className="text-[#0A1128]">{buyerAddress || "Naslov ni vnesen"}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-medium block text-[10px] uppercase">Kraj in Pošta</span>
                                <span className="text-[#0A1128]">{buyerPostalCode} {buyerCity || "Kraj ni vnesen"}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-medium block text-[10px] uppercase">Kontakt</span>
                                <span className="text-[#0A1128] truncate">{buyerPhone || buyerEmail || "Ni podatka"}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto shrink-0">
                        <div className="flex flex-col gap-3 flex-1 min-w-[180px]">
                        <button
                          onClick={() => {
                            navigateTo("detail", { selectedItem: soldItem });
                          }}
                          className="bg-slate-100 text-[#0A1128] px-4 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                          Odpri dražbo
                        </button>
                        {soldItem.post_auction_status === "failed_1st" && (
                          <>
                            {soldItem.top_bids && soldItem.top_bids.length > 1 ? (
                              <button
                                onClick={() => handleOfferToSecondBidder(soldItem)}
                                className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                              >
                                Ponudi 2. ponudniku
                              </button>
                            ) : (
                              <p className="text-xs text-red-500 font-bold text-center">Ni 2. ponudnika</p>
                            )}
                            <button
                              onClick={() => handleMoveToArchive(soldItem)}
                              className="bg-red-100 text-red-700 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-red-200 transition-all flex items-center justify-center gap-2"
                            >
                              Premakni v arhiv
                            </button>
                          </>
                        )}

                        {soldItem.payment_status === "paid" && (
                          <button
                            onClick={() => {
                              setInvoiceModalData({
                                isOpen: true,
                                auction: soldItem,
                                seller: userData,
                                buyer: buyer
                              });
                            }}
                            className="bg-slate-100 text-[#0A1128] border-2 border-slate-200 px-4 py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm hover:border-slate-400 hover:bg-slate-200 transition-all flex items-center justify-center gap-2 mt-auto"
                          >
                            <FileText size={16} /> Račun
                          </button>
                        )}
                        </div>
                        <div className="flex flex-col gap-3 flex-1 min-w-[180px]">
                        {/* Sporočila button: ONLY shown for personal pickup, NOT for postal shipping */}
                        {!isPostalShipping ? (
                          <button
                            onClick={() => {
                              navigateTo("messages", { activeConversationId: soldItem.id });
                            }}
                            className="bg-[#FEBA4F] text-[#0A1128] px-4 py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all flex items-center justify-center gap-2 shadow-sm"
                          >
                            <MessageSquare size={16} /> Sporočila
                          </button>
                        ) : (
                          <div className="h-[52px] hidden sm:block"></div>
                        )}

                        <div className="flex flex-col items-center gap-2 mt-1">
                          {soldItem.delivery_method ? (
                            <div className="text-xs font-bold text-slate-500 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-100 flex items-center gap-1.5">
                              {soldItem.delivery_method === "pickup" ? (
                                <MapPin size={14} className="text-[#FEBA4F]" />
                              ) : (
                                <Truck size={14} className="text-[#FEBA4F]" />
                              )}
                              {soldItem.delivery_method === "pickup"
                                ? "Osebni prevzem"
                                : "Pošiljanje po pošti"}
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                setDeliveryMethodModal({
                                  isOpen: true,
                                  auctionId: soldItem.id,
                                  deliveryMethod: null,
                                })
                              }
                              className="text-xs font-bold text-[#0A1128] border-2 border-slate-200 px-4 py-2 rounded-xl hover:border-[#FEBA4F] hover:text-[#FEBA4F] transition-colors whitespace-nowrap"
                            >
                              Izberi način predaje
                            </button>
                          )}
                        </div>
                      </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
      break;
    case "myUnsold":
      // Filter: seller is current user, auction has ended AND (no winner OR unpaid/unsold status OR overdue payment)
      // Keep only those whose status is not 'archived'/'deleted'
      const nowMs = Date.now();
      const currentUserUnsoldRaw = auctions.filter(
        (a) =>
          (a.sellerId === userData.id ||
            (a as any).seller_id === userData.id) &&
          (a.status === "completed" || new Date(a.endTime).getTime() <= nowMs) &&
          (
            a.post_auction_status === "unsold" || 
            a.post_auction_status === "unpaid" || 
            a.post_auction_status === "failed_1st" ||
            a.post_auction_status === "failed_2nd" || 
            a.post_auction_status === "rejected_2nd" || 
            (!a.winnerId && !(a as any).winner_id) ||
            (a.payment_status !== 'paid' && nowMs > (new Date((a as any).payment_deadline || a.endTime || (a as any).end_time).getTime() + ((a as any).payment_deadline ? 0 : 48 * 60 * 60 * 1000)))
          ) &&
          (a as any).status !== "archived" && (a as any).status !== "deleted"
      ).filter(a => {
        // Must be within 1 month from end time to be shown here
        const endMs = new Date(a.endTime || (a as any).end_time).getTime();
        const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
        return (nowMs - endMs) <= oneMonthMs;
      });

      // Združevanje v pakete
      const currentUserUnsold: any[] = [];
      const packageMap = new Map<string, any>();
      
      currentUserUnsoldRaw.forEach(item => {
        const pId = item.package_id || (item as any).packageId;
        if (pId) {
          if (!packageMap.has(pId)) {
            packageMap.set(pId, { type: 'package', package_id: pId, items: [] });
          }
          packageMap.get(pId).items.push(item);
        } else {
          currentUserUnsold.push({ type: 'single', item });
        }
      });
      
      packageMap.forEach(pkg => {
        if (pkg.items.length >= 2) {
          currentUserUnsold.push(pkg);
        } else if (pkg.items.length === 1) {
          currentUserUnsold.push({ type: 'single', item: pkg.items[0] });
        }
      });


      content = (
        <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
          <button
            onClick={() => goBack("grid")}
            className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
          >
            <ArrowLeft size={16} /> Nazaj
          </button>

          <div className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
            <div className="flex items-center gap-6 mb-12">
              <div className="bg-slate-100 p-4 rounded-3xl shadow-lg">
                <MessageSquare size={40} className="text-slate-400" />
              </div>
              <div>
                <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128]">
                  {t('unsoldAuctions')}
                </h2>
                <p className="text-slate-400 font-bold mt-2">
                  Dražbe, ki se niso uspešno zaključile s prodajo ali plačilom. Na voljo za ponovno objavo 1 mesec od zaključka.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {currentUserUnsold.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-slate-500 font-black uppercase tracking-widest text-lg">
                    Seznam je prazen
                  </p>
                </div>
              ) : (
                currentUserUnsold.map((entry: any) => {
                  if (entry.type === 'package') {
                    const pkg = entry;
                    const items = pkg.items;
                    const firstItem = items[0];
                    const endMs = new Date(firstItem.endTime || firstItem.end_time).getTime();
                    const expireMs = endMs + 30 * 24 * 60 * 60 * 1000;
                    const daysLeft = Math.max(0, Math.ceil((expireMs - nowMs) / (24 * 60 * 60 * 1000)));

                    return (
                      <div
                        key={pkg.package_id}
                        className="flex flex-col md:flex-row items-center gap-8 p-6 rounded-[2.5rem] border-2 border-slate-100 hover:border-blue-200 bg-blue-50/30 transition-colors group relative"
                      >
                        <button 
                          onClick={() => setDeleteUnsoldModal({
                            isOpen: true,
                            items: items,
                            title: `${items.length} dražb paketa`
                          })}
                          className="absolute top-4 right-4 p-2.5 rounded-2xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-200 hover:border-red-200 transition-all shadow-sm flex items-center justify-center group/btn"
                          title="Dokončno izbriši dražbe paketa"
                        >
                          <Trash2 size={20} className="transition-transform group-hover/btn:scale-110" />
                        </button>
                        <div className="relative w-32 h-32 cursor-pointer group-hover:scale-105 transition-transform" onClick={() => {}}>
                           <SignedImg src={firstItem.images[0]} className="w-full h-full rounded-3xl object-cover shadow-md" alt="Package preview" />
                           <div className="absolute -bottom-3 -right-3 bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-black border-4 border-white">
                             {items.length}
                           </div>
                        </div>
                        <div className="flex-1 text-center md:text-left">
                          <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-full mb-2">Neprodan paket</div>
                          <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-500 mb-2">
                            {items.length} neprodanih predmetov iz paketa
                          </h3>
                          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-bold text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <Calendar size={16} /> Končano: {new Date(firstItem.endTime).toLocaleDateString("sl-SI")}
                            </span>
                            <span className={`flex items-center gap-1.5 ${daysLeft <= 3 ? 'text-red-500' : 'text-[#FEBA4F]'}`}>
                              <Clock size={16} /> Poteče čez: {daysLeft} dni
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3 w-full md:w-auto mt-4 md:mt-0">
                          <button
                            onClick={() => handleDirectQuickRepublishPackage(items)}
                            disabled={isQuickRepublishing === "package"}
                            className="bg-[#FEBA4F] text-[#0A1128] px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <Upload size={16} /> {isQuickRepublishing === "package" ? "Objavljanje..." : "Hitra objava paketa"}
                          </button>
                          <button
                            onClick={() => {
                              navigateTo("createAuction", {
                                createMode: 'package',
                                republishData: { type: 'package', items: items }
                              });
                            }}
                            className="bg-[#0A1128] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-2"
                          >
                            <Upload size={16} /> Uredi in objavi paket
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const soldItem = entry.item;
                  const endMs = new Date(soldItem.endTime || (soldItem as any).end_time).getTime();
                  const expireMs = endMs + 30 * 24 * 60 * 60 * 1000;
                  const daysLeft = Math.max(0, Math.ceil((expireMs - nowMs) / (24 * 60 * 60 * 1000)));
                  const isUnpaidOverdue = (soldItem.winnerId || (soldItem as any).winner_id) && soldItem.payment_status !== 'paid';

                  return (
                    <div
                      key={soldItem.id}
                      className="flex flex-col md:flex-row items-center gap-8 p-6 rounded-[2.5rem] border-2 border-slate-100 hover:border-slate-300 transition-colors group relative"
                    >
                      <button 
                        onClick={() => setDeleteUnsoldModal({
                          isOpen: true,
                          item: soldItem,
                          title: soldItem.title[language as keyof typeof soldItem.title] || soldItem.title.SLO || "dražbo"
                        })}
                        className="absolute top-4 right-4 p-2.5 rounded-2xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-200 hover:border-red-200 transition-all shadow-sm flex items-center justify-center group/btn"
                        title="Dokončno izbriši dražbo"
                      >
                        <Trash2 size={20} className="transition-transform group-hover/btn:scale-110" />
                      </button>
                      <SignedImg
                        src={soldItem.images[0]}
                        alt="Item"
                        className="w-32 h-32 rounded-3xl object-cover shadow-md cursor-pointer group-hover:scale-105 transition-transform"
                        onClick={() => {
                          navigateTo("detail", { selectedItem: soldItem });
                        }}
                      />
                      <div className="flex-1 text-center md:text-left">
                        {isUnpaidOverdue ? (
                          <div className="inline-block px-3 py-1 bg-red-100 text-red-700 text-[10px] font-black uppercase tracking-widest rounded-full mb-2">
                            Neplačano (rok 48h potekel)
                          </div>
                        ) : null}
                        <h3
                          className="text-2xl font-black uppercase tracking-tighter text-slate-500 mb-2 cursor-pointer hover:text-[#0A1128] transition-colors"
                          onClick={() => {
                            navigateTo("detail", { selectedItem: soldItem });
                          }}
                        >
                          {soldItem.title[
                            language as keyof typeof soldItem.title
                          ] || soldItem.title.SLO}
                        </h3>
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-bold text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Calendar size={16} /> Končano:{" "}
                            {new Date(soldItem.endTime).toLocaleDateString(
                              "sl-SI",
                            )}
                          </span>
                          <span className={`flex items-center gap-1.5 ${daysLeft <= 3 ? 'text-red-500' : 'text-[#FEBA4F]'}`}>
                            <Clock size={16} /> Poteče čez: {daysLeft} dni
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 w-full md:w-auto mt-4 md:mt-0">
                        <button
                          onClick={() => handleDirectQuickRepublish(soldItem)}
                          disabled={isQuickRepublishing === soldItem.id}
                          className="bg-[#FEBA4F] text-[#0A1128] px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Upload size={16} /> {isQuickRepublishing === soldItem.id ? "Objavljanje..." : "Hitra objava"}
                        </button>
                        <button
                          onClick={() => {
                            navigateTo("createAuction", {
                              createMode: 'single',
                              republishData: {
                                ...soldItem,
                                is_package: false,
                                package_id: null,
                                packageId: null,
                                package_title: null,
                                region: normalizeRegionName(soldItem.region || (typeof soldItem.location === 'object' ? soldItem.location?.SLO : soldItem.location)),
                              }
                            });
                          }}
                          className="bg-[#0A1128] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-2"
                        >
                          <Upload size={16} /> Uredi in objavi
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
      break;
    case "messages":
      content = (
        <MessagesView
          userId={userData.id}
          t={t}
          language={language}
          initialAuctionId={activeConversationId}
          auctions={auctions}
          onBack={() => {
            goBack("grid");
          }}
          onOpenAuction={(auction) => {
            navigateTo("detail", { selectedItem: auction });
          }}
          onLeaveReview={(auction) => {
            openReviewModal(auction);
          }}
          onPayAuction={(auction) => {
            const currentBid = auction.currentBid || 0;
            const fee = currentPlan === SubscriptionTier.FREE ? 0.05 : 0.03;
            const totalToPay = currentBid * (1 + fee);
            setCheckoutData({
              amount: parseFloat(totalToPay.toFixed(2)),
              title: `${t("paymentFor")}: ${auction.title[language as keyof typeof auction.title] || auction.title.SLO}`,
              onSuccess: async () => {
                setIsCheckoutOpen(false);
                toast.success(t("paymentSuccessEmail") || "Plačilo sprejeto. Potrditev lahko traja nekaj sekund.");
                fetchAuctions();
                if (userData?.id) refreshUserData(userData.id);
              },
              metadata: {
                auction_id: auction.id,
                buyer_id: userData.id,
                seller_id: auction.sellerId || (auction as any).seller_id,
                fee_percentage: fee * 100,
                buyer_data: userData,
              },
            });
            setIsCheckoutOpen(true);
          }}
        />
      );
      break;
    case "watchlist":
      content = (
        <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
          <button
            onClick={() => goBack("grid")}
            className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
          >
            <ArrowLeft size={16} /> Nazaj
          </button>
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
            <div className="flex items-center gap-6 mb-12">
              <div className="bg-[#FEBA4F] p-4 rounded-3xl shadow-lg shadow-[#FEBA4F]/20">
                <Eye size={40} className="text-[#0A1128]" />
              </div>
              <div>
                <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128]">
                  Opazovane dražbe
                </h2>
                <p className="text-slate-400 font-bold mt-2">
                  Dražbe, ki jih spremljate
                </p>
              </div>
            </div>

            <div
              className="grid gap-8 justify-center"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 320px))",
              }}
            >
              {auctions
                .filter((a) => Array.from(new Set([...watchedIds, ...watchlistSnapshot])).includes(a.id))
                .filter(
                  (a) =>
                    a.status === "active" && new Date(a.endTime) > new Date(),
                )
                .map((item) => (
                  <AuctionCard
                    key={item.id}
                    item={item}
                    t={t}
                    language={language}
                    isVerified={isVerified}
                    currentUserId={userData.id}
                    hasBid={bidAuctionIds.includes(item.id)}
                    isWatched={watchedIds.includes(item.id)}
                    onWatchToggle={() => toggleWatch(item.id)}
                    onClick={() => {
                      navigateTo("detail", { selectedItem: item });
                    }}
                    onBidSubmit={handleBidSubmit}
                    onSellerClick={(seller) => {
                      navigateToSellerProfile(seller, item.sellerName);
                    }}
                  />
                ))}
              {auctions
                .filter((a) => Array.from(new Set([...watchedIds, ...watchlistSnapshot])).includes(a.id))
                .filter(
                  (a) =>
                    a.status === "active" && new Date(a.endTime) > new Date(),
                ).length === 0 && (
                <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                  <Eye size={48} className="mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500 font-black uppercase tracking-widest text-xs">
                    Nimate opazovanih dražb
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
      break;
    case "testSandbox":
      content = (
        <TestSandboxView
          onBack={() => goBack("grid")}
          userData={userData}
          onRefreshUserData={fetchAuctions}
          onOpenInvoiceModal={(auction, seller, buyer) => {
            setInvoiceModalData({
              isOpen: true,
              auction,
              seller,
              buyer
            });
          }}
          t={t}
          language={language}
          isVerified={isVerified}
          onAuctionClick={(item) => {
            navigateTo("detail", { selectedItem: item });
          }}
          onSelectPackage={(packageId) => {
            navigateTo("package", { selectedPackageId: packageId });
          }}
          watchlist={watchedIds}
          onWatchToggle={toggleWatch}
          onBidSubmit={handleBidSubmit}
          onSellerClick={(seller) => {
            navigateToSellerProfile(seller);
          }}
        />
      );
      break;
    default:
      content = (
        <div className="animate-in">
          {activeView === "grid" &&
            !selectedCategory &&
            !searchQuery &&
            !selectedRegion && (
              <HeroCarousel
                items={auctions}
                onSelectItem={(item) => {
                  navigateTo("detail", { selectedItem: item });
                }}
                t={t}
                language={language}
              />
            )}
          <div className="max-w-[1600px] mx-auto px-6 py-12">
            <div
              ref={auctionsSectionRef}
              className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12 scroll-mt-32"
            >
              <div className="flex items-center gap-4 flex-wrap">
                <div className="bg-[#FEBA4F] w-2.5 h-10 rounded-full shadow-lg"></div>
                <h2 className="text-3xl font-black text-[#0A1128] uppercase tracking-tighter italic">
                  {activeView === "lastChance"
                    ? t("lastChanceTitle")
                    : selectedRegion
                      ? `${t("regions")}: ${selectedRegion}`
                      : selectedCategory
                        ? `${t("category")}: ${getCategoryTranslation(selectedCategory, t)}`
                        : searchQuery
                          ? `${t("searchResults") || 'Rezultati'}: "${searchQuery}"`
                          : t("activeAuctions")}
                </h2>
                {selectedRegion && (
                  <button
                    onClick={() => setSelectedRegion(null)}
                    className="flex items-center gap-1.5 bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] text-xs font-black uppercase px-3 py-1.5 rounded-full transition-all border border-[#FEBA4F]/30"
                  >
                    <span>{t("clearFilter") || "Počisti regijo"}</span>
                    <X size={14} />
                  </button>
                )}
                {selectedCategory && (
                  <button
                    onClick={() => {
                      setSelectedCategory(null);
                      setCategoryFilters({ delivery_option: undefined, condition: undefined, specifications: {} });
                    }}
                    className="flex items-center gap-1.5 bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] text-xs font-black uppercase px-3 py-1.5 rounded-full transition-all border border-[#FEBA4F]/30"
                  >
                    <span>{t("clearFilter") || "Počisti kategorijo"}</span>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black uppercase text-slate-400">
                  {t("itemsPerPage")}
                </span>
                <select
                  className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2.5 text-xs font-black shadow-sm outline-none focus:border-[#FEBA4F] transition-colors cursor-pointer"
                  value={baseItemsPerPage}
                  onChange={(e) => {
                    setBaseItemsPerPage(parseInt(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="12">{t("showCount")?.replace("{n}", "12") || `${t("show") || "Prikaži"} ~12`}</option>
                  <option value="24">{t("showCount")?.replace("{n}", "24") || `${t("show") || "Prikaži"} ~24`}</option>
                  <option value="48">{t("showCount")?.replace("{n}", "48") || `${t("show") || "Prikaži"} ~48`}</option>
                  <option value="96">{t("showCount")?.replace("{n}", "96") || `${t("show") || "Prikaži"} ~96`}</option>
                </select>
              </div>
            </div>

            {/* Dynamic Category & Specification Filter Bar */}
            <CategoryFilterBar
              category={selectedCategory}
              filters={categoryFilters}
              onFilterChange={(newFilters) => {
                setCategoryFilters(newFilters);
                setCurrentPage(1);
              }}
              onResetFilters={() => {
                setCategoryFilters({ delivery_option: undefined, condition: undefined, specifications: {} });
                setCurrentPage(1);
              }}
              totalResultsCount={getFilteredAuctions.length}
            />
            {(() => {
              const rawPackageMap = new Map<string, { title: string; items: AuctionItem[] }>();
              const standaloneItems: AuctionItem[] = [];

              currentAuctions.forEach(item => {
                const pkgId = item.package_id || (item as any).packageId;
                if (item.is_package && pkgId) {
                  if (!rawPackageMap.has(pkgId)) {
                    const pkgTitle = (item as any).package_title || 
                      (typeof item.title === 'object' ? item.title[language] || item.title['SLO'] : item.title) || 
                      "Večpredmetna dražba";
                    const allPkgItems = auctions.filter(a => (a.package_id === pkgId || (a as any).packageId === pkgId) && a.status === 'active' && new Date(a.endTime).getTime() > Date.now());
                    rawPackageMap.set(pkgId, {
                      title: pkgTitle,
                      items: allPkgItems.length > 0 ? allPkgItems : [item]
                    });
                  }
                } else {
                  standaloneItems.push(item);
                }
              });

              const packageMap = new Map<string, { title: string; items: AuctionItem[] }>();
              rawPackageMap.forEach((pkgData, pkgId) => {
                if (pkgData.items.length >= 2) {
                  packageMap.set(pkgId, pkgData);
                } else {
                  pkgData.items.forEach(singleItem => {
                    standaloneItems.push({
                      ...singleItem,
                      is_package: false,
                      package_id: null
                    });
                  });
                }
              });

              return (
                <div className="space-y-10">
                  {/* Render Packages */}
                  {Array.from(packageMap.entries()).map(([pkgId, pkgData]) => (
                    <PackageCard
                      key={pkgId}
                      packageId={pkgId}
                      title={pkgData.title}
                      sellerName={pkgData.items[0]?.sellerName}
                      items={pkgData.items}
                      t={t}
                      language={language}
                      isVerified={isVerified}
                      currentUserId={userData?.id || auth.currentUser?.uid}
                      bidAuctionIds={bidAuctionIds}
                      onSelectPackage={(id) => {
                        navigateTo("package", { selectedPackageId: id });
                      }}
                      onAuctionClick={(item) => {
                        navigateTo("detail", { selectedItem: item });
                      }}
                      onSellerClick={(seller) => {
                        navigateToSellerProfile(seller, pkgData.items[0]?.sellerName);
                      }}
                    />
                  ))}

                  {/* Render Standalone Auctions */}
                  <div
                    className="grid gap-8 justify-center"
                    style={{
                      gridTemplateColumns: "repeat(auto-fit, minmax(320px, 320px))",
                    }}
                  >
                    {standaloneItems.map((item) => (
                      <AuctionCard
                        key={item.id}
                        item={item}
                        t={t}
                        language={language}
                        isVerified={isVerified}
                        currentUserId={userData.id}
                        hasBid={bidAuctionIds.includes(item.id)}
                        isWatched={watchedIds.includes(item.id)}
                        onWatchToggle={() => toggleWatch(item.id)}
                        onClick={() => {
                          navigateTo("detail", { selectedItem: item });
                        }}
                        onBidSubmit={handleBidSubmit}
                        onSellerClick={(seller) => {
                          navigateToSellerProfile(seller, item.sellerName);
                        }}
                        onTimeUp={(auctionId) => {
                          // Force a re-render so activeAuctions filter recalculates and removes this item
                          setAuctions((prev) => [...prev]);
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
            {totalPages > 1 && (
              <div className="mt-20 flex flex-col md:flex-row items-center justify-between gap-8 border-t-2 border-slate-100 pt-12">
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {t("showing")} {indexOfFirstItem + 1} -{" "}
                    {Math.min(indexOfLastItem, getFilteredAuctions.length)}{" "}
                    {t("of")} {getFilteredAuctions.length} {t("auctions")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`p-4 rounded-2xl border-2 transition-all ${currentPage === 1 ? "border-slate-50 text-slate-200" : "border-slate-100 text-[#0A1128] hover:border-[#FEBA4F]"}`}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="flex items-center gap-2">
                    {paginationNumbers.map((p, idx) =>
                      typeof p === "string" ? (
                        <span
                          key={idx}
                          className="px-3 text-slate-400 font-bold"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={idx}
                          onClick={() => handlePageChange(p as number)}
                          className={`w-12 h-12 rounded-2xl font-black text-sm transition-all shadow-sm ${currentPage === p ? "bg-[#0A1128] text-white scale-110" : "bg-white border-2 border-slate-50 text-slate-400 hover:border-slate-200"}`}
                        >
                          {p}
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`p-4 rounded-2xl border-2 transition-all ${currentPage === totalPages ? "border-slate-50 text-slate-200" : "border-slate-100 text-[#0A1128] hover:border-[#FEBA4F]"}`}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowBannerDelayPassed(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Banner is active if user is logged in, not verified, auth data has finished loading, and 3s have passed
  const isBannerActive = showBannerDelayPassed && !isAuthLoading && isLoggedIn && !isVerified;

  // Sync isVerified state with userData as a fallback
  useEffect(() => {
    const userDataVerified = !!userData.profile_completed;
    if (isLoggedIn && isVerified !== userDataVerified) {
      setIsVerified(userDataVerified);
    }
  }, [userData.profile_completed, isLoggedIn, isVerified]);

  const [dontShowTermsAgain, setDontShowTermsAgain] = useState(false);

  async function handleBidSubmit(item: any, amount: number): Promise<"ok" | "outbid" | "error" | "login_required" | "cancelled"> {
    if (!isLoggedIn) {
      toast.error(t("login")); setActiveView("login"); return "login_required";
    }
    const itemSellerId = item.sellerId || (item as any).seller_id || ((item as any).seller && (((item as any).seller as any).id || (item as any).seller.id));
    if (itemSellerId && (itemSellerId === userData?.id || itemSellerId === auth.currentUser?.uid)) {
      toast.error("Kot avtor dražbe ne morete oddajati ponudb na lasten predmet.");
      return "error";
    }
    if ((userData as any).isBlocked || (userData as any).unpaidStrikes >= 3) {
      toast.error("Vaš račun je blokiran za ponujanje zaradi preveč neplačanih dražb (3 opomini).");
      return "error";
    }
    setPendingBid({ item, amount });
    return new Promise((resolve) => {
      bidResolverRef.current = resolve;
      if (!hasAcceptedTerms && !localStorage.getItem("dontShowTermsAgain")) {
        setShowTermsModal(true);
      } else {
        setShowConfirmBidModal(true);
      }
    });
  };

  function handleCancelTerms() {
    setShowTermsModal(false);
    setPendingBid(null);
    if (bidResolverRef.current) bidResolverRef.current("cancelled");
  };

  function handleAcceptTerms() {
    setHasAcceptedTerms(true);
    if (dontShowTermsAgain) {
      localStorage.setItem("dontShowTermsAgain", "true");
    }
    setShowTermsModal(false);
    setShowConfirmBidModal(true);
  }

  function handleCancelConfirmBid() {
    setShowConfirmBidModal(false);
    setPendingBid(null);
    if (bidResolverRef.current) bidResolverRef.current("cancelled");
  };

  async function handleConfirmBid(confirmedAmount?: number) {
    if (!pendingBid) {
      if (bidResolverRef.current) bidResolverRef.current("error");
      return;
    }
    const item = pendingBid.item;
    const itemSellerId = item.sellerId || (item as any).seller_id || ((item as any).seller && (((item as any).seller as any).id || (item as any).seller.id));
    if (itemSellerId && (itemSellerId === userData?.id || itemSellerId === auth.currentUser?.uid)) {
      toast.error("Kot avtor dražbe ne morete oddajati ponudb na lasten predmet.");
      if (bidResolverRef.current) bidResolverRef.current("error");
      return;
    }
    const amount = confirmedAmount !== undefined && !isNaN(confirmedAmount) && confirmedAmount > 0 
      ? confirmedAmount 
      : pendingBid.amount;
    
    setShowConfirmBidModal(false);
    try {
      const response = await fetch('/api/place-bid', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          auction_id: item.id,
          amount,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg = data.error || "Napaka pri oddaji ponudbe";
        toast.error(errorMsg);
        if (bidResolverRef.current) bidResolverRef.current("error");
        setPendingBid(null);
        return;
      }

      const resultStatus: "ok" | "outbid" = data.resultStatus === "outbid" ? "outbid" : "ok";
      if (resultStatus === "outbid") {
        toast.error(t('bidOutbid') || "Ponudba je bila že presežena.");
      } else {
        toast.success("Ponudba uspešno oddana!");
      }

      if (bidResolverRef.current) bidResolverRef.current(resultStatus);
      fetchAuctions();
    } catch (e: any) {
      console.error("Bid submission error:", e);
      toast.error(e.message || "Error submitting bid");
      if (bidResolverRef.current) bidResolverRef.current("error");
    }
    setPendingBid(null);
  };

  
  const handleDirectQuickRepublish = async (item: any) => {
    try {
      setIsQuickRepublishing(item.id);
      const originalCreated = new Date(item.created_at || item.createdAt || Date.now() - 7 * 24 * 60 * 60 * 1000).getTime();
      const originalEnd = new Date(item.end_time || item.endTime || Date.now()).getTime();
      let durationMs = originalEnd - originalCreated;
      if (isNaN(durationMs) || durationMs <= 60 * 1000) {
        durationMs = 7 * 24 * 60 * 60 * 1000;
      }
      const now = new Date();
      const newEndTime = new Date(now.getTime() + durationMs);
      const initialPrice = Number(item.startingPrice || item.starting_price || item.currentBid || item.current_price || 1);

      await updateDoc(doc(db, 'auctions', item.id), {
        status: 'active',
        created_at: now.toISOString(),
        createdAt: now.toISOString(),
        end_time: newEndTime.toISOString(),
        endTime: newEndTime.toISOString(),
        current_price: initialPrice,
        currentBid: initialPrice,
        starting_price: initialPrice,
        startingPrice: initialPrice,
        bid_count: 0,
        bidCount: 0,
        bidding_history: [],
        biddingHistory: [],
        top_bids: [],
        winner_id: null,
        winnerId: null,
        payment_status: 'unpaid',
        post_auction_status: null,
        delivery_method: null,
        selected_delivery: null,
        paid_at: null,
        invoice_url: null,
        current_proxy_bid: null,
        currentProxyBid: null,
        hidden_max_bid: null,
        hiddenMaxBid: null,
        is_package: false,
        package_id: null,
        packageId: null,
        package_title: null,
        package_description: null,
        region: normalizeRegionName(item.region || (typeof item.location === 'object' ? item.location?.SLO : item.location)),
      });

      toast.success("Dražba je bila uspešno ponovno objavljena!");
      fetchAuctions();
    } catch (e: any) {
      console.error("Napaka pri hitri objavi:", e);
      toast.error(e.message || "Napaka pri ponovni objavi");
    } finally {
      setIsQuickRepublishing(null);
    }
  };

  const handleDirectQuickRepublishPackage = async (items: any[]) => {
    try {
      setIsQuickRepublishing("package");
      const now = new Date();
      const isSingleOnly = items.length < 2;

      for (const item of items) {
        const originalCreated = new Date(item.created_at || item.createdAt || Date.now() - 7 * 24 * 60 * 60 * 1000).getTime();
        const originalEnd = new Date(item.end_time || item.endTime || Date.now()).getTime();
        let durationMs = originalEnd - originalCreated;
        if (isNaN(durationMs) || durationMs <= 60 * 1000) {
          durationMs = 7 * 24 * 60 * 60 * 1000;
        }
        const newEndTime = new Date(now.getTime() + durationMs);
        const initialPrice = Number(item.startingPrice || item.starting_price || item.currentBid || item.current_price || 1);

        await updateDoc(doc(db, 'auctions', item.id), {
          status: 'active',
          created_at: now.toISOString(),
          createdAt: now.toISOString(),
          end_time: newEndTime.toISOString(),
          endTime: newEndTime.toISOString(),
          current_price: initialPrice,
          currentBid: initialPrice,
          starting_price: initialPrice,
          startingPrice: initialPrice,
          bid_count: 0,
          bidCount: 0,
          bidding_history: [],
          biddingHistory: [],
          top_bids: [],
          winner_id: null,
          winnerId: null,
          payment_status: 'unpaid',
          post_auction_status: null,
          delivery_method: null,
          selected_delivery: null,
          paid_at: null,
          invoice_url: null,
          current_proxy_bid: null,
          currentProxyBid: null,
          hidden_max_bid: null,
          hiddenMaxBid: null,
          is_package: !isSingleOnly,
          package_id: isSingleOnly ? null : (item.package_id || (item as any).packageId),
          packageId: isSingleOnly ? null : (item.package_id || (item as any).packageId),
          package_title: isSingleOnly ? null : (item.package_title || null),
          package_description: isSingleOnly ? null : (item.package_description || null),
          region: normalizeRegionName(item.region || (typeof item.location === 'object' ? item.location?.SLO : item.location)),
        });
      }
      toast.success("Vsi predmeti paketa so bili uspešno ponovno objavljeni!");
      fetchAuctions();
    } catch (e: any) {
      console.error("Napaka pri hitri objavi paketa:", e);
      toast.error(e.message || "Napaka pri ponovni objavi");
    } finally {
      setIsQuickRepublishing(null);
    }
  };

  
  const handleOfferToSecondBidder = async (auction: any) => {
    try {
      const topBids = auction.top_bids || [];
      const secondBid = topBids.length > 1 ? topBids[1] : null;
      if (!secondBid) {
        toast.error("Ni 2. najvišjega ponudnika za to dražbo.");
        return;
      }
      
      const now = new Date();
      const deadline = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
      const auctionRef = doc(db, 'auctions', auction.id);
      
      await updateDoc(auctionRef, {
        post_auction_status: 'offered_2nd',
        second_highest_bidder_id: secondBid.user_id,
        second_chance_deadline: deadline,
        currentBid: secondBid.amount,
        current_price: secondBid.amount
      });
      
      toast.success("Dražba je bila ponujena 2. najvišjemu ponudniku. Ima 48 ur, da jo sprejme.");
      fetchAuctions();
    } catch (e: any) {
      toast.error("Napaka pri ponujanju dražbe: " + e.message);
    }
  };

  const handleMoveToArchive = async (auction: any) => {
    try {
      const auctionRef = doc(db, 'auctions', auction.id);
      await updateDoc(auctionRef, {
        post_auction_status: 'archived'
      });
      toast.success("Dražba premaknjena v arhiv.");
      fetchAuctions();
    } catch (e: any) {
      toast.error("Napaka pri premikanju: " + e.message);
    }
  };

  
  const handleAcceptSecondChance = async (auction: any) => {
    try {
      const now = new Date();
      const paymentDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
      const auctionRef = doc(db, 'auctions', auction.id);
      await updateDoc(auctionRef, {
        post_auction_status: 'awaiting_payment_2nd',
        payment_deadline: paymentDeadline,
        winner_id: userData.id, // Update winner so it looks like they won
        winnerId: userData.id
      });
      toast.success("Sprejeli ste ponudbo! Imate 48 ur za plačilo.");
      fetchAuctions();
    } catch (e: any) {
      toast.error("Napaka: " + e.message);
    }
  };

  const handleRejectSecondChance = async (auction: any) => {
    try {
      const auctionRef = doc(db, 'auctions', auction.id);
      await updateDoc(auctionRef, {
        post_auction_status: 'rejected_2nd'
      });
      toast.success("Zavrnili ste ponudbo. Dražba je zaključena.");
      fetchAuctions();
    } catch (e: any) {
      toast.error("Napaka: " + e.message);
    }
  };

  async function handleDeliveryMethodSubmit() {
    if (!deliveryMethodModal.auctionId || !deliveryMethodModal.deliveryMethod) return;
    try {
      await updateDoc(doc(db, 'auctions', deliveryMethodModal.auctionId), {
        delivery_method: deliveryMethodModal.deliveryMethod,
        selected_delivery: deliveryMethodModal.deliveryMethod,
      });
      toast.success("Način predaje je bil uspešno posodobljen.");
    } catch (e: any) {
      console.error("Napaka pri posodabljanju načina predaje:", e);
      toast.error("Napaka pri shranjevanju načina predaje: " + e.message);
    } finally {
      setDeliveryMethodModal({ isOpen: false, auctionId: "", deliveryMethod: null });
      fetchAuctions();
    }
  };

  async function handleReceiptConfirmSubmit() {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await confirmReceiptAction({ auction_id: receiptConfirmModal.auctionId }, token);
      if (res.success) {
        toast.success("Prejem uspešno potrjen. Sredstva so sproščena prodajalcu.");
      } else {
        toast.error(res.error || "Napaka pri potrditvi prejema.");
      }
    } catch (e) {
      toast.error("Napaka pri potrditvi prejema.");
    } finally {
      setReceiptConfirmModal(prev => ({ ...prev, isOpen: false }));
      fetchAuctions();
    }
  };

  const handleReviewSubmit = async (
    auctionId: string,
    sellerId: string,
    rating: number,
    comment: string
  ): Promise<boolean> => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error("Za oddajo ocene morate biti prijavljeni.");
        return false;
      }
      const res = await submitReviewAction({
        auction_id: auctionId,
        seller_id: sellerId,
        rating,
        comment,
        would_recommend: rating >= 4,
      }, token);

      if (res.success) {
        toast.success("Hvala! Vaša ocena je bila uspešno oddana.");
        setReviewModalData({ isOpen: false, auction: null, sellerName: "" });
        fetchAuctions();
        if (userData?.id) refreshUserData(userData.id);
        return true;
      } else {
        // Fallback: direct write to firestore if server action had an issue
        try {
          const authorName = (userData as any)?.company_name || 
            `${(userData as any)?.first_name || ''} ${(userData as any)?.last_name || ''}`.trim() || 
            (userData as any)?.username || 
            'Preverjen kupec';
          
          await addDoc(collection(db, 'reviews'), {
            seller_id: sellerId,
            sellerId: sellerId,
            author: authorName,
            author_id: auth.currentUser?.uid || '',
            rating,
            comment: comment.trim(),
            auction_id: auctionId,
            auctionId: auctionId,
            auction_title: typeof reviewModalData.auction?.title === 'object' 
              ? (reviewModalData.auction?.title?.SLO || 'Dražba') 
              : (reviewModalData.auction?.title || 'Dražba'),
            date: new Date().toLocaleDateString('sl-SI'),
            created_at: new Date().toISOString(),
            isVerified: true,
            wouldRecommend: rating >= 4
          });

          await setDoc(doc(db, 'auctions', auctionId), {
            review_submitted: true,
            review_rating: rating,
            review_comment: comment.trim(),
            review_submitted_at: new Date().toISOString()
          }, { merge: true });

          toast.success("Hvala! Vaša ocena je bila uspešno oddana.");
          setReviewModalData({ isOpen: false, auction: null, sellerName: "" });
          fetchAuctions();
          return true;
        } catch (fbErr: any) {
          toast.error(res.error || "Napaka pri oddaji ocene.");
          return false;
        }
      }
    } catch (err: any) {
      console.error("Error submitting review:", err);
      toast.error("Napaka pri oddaji ocene.");
      return false;
    }
  };

  if (isHydrating) {
    return (
      <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#0A1128] border-t-[#FEBA4F] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ChatProvider userId={userData.id} auctions={auctions} appWakeupTrigger={appWakeupTrigger}>
      <div className="min-h-screen flex flex-col bg-[#f3f4f6] font-sans selection:bg-[#FEBA4F] selection:text-[#0A1128] overflow-x-hidden">
        <Toaster
          position="top-center"
          duration={4000}
          richColors
          closeButton
          expand={true}
          visibleToasts={5}
          gap={12}
          toastOptions={{
            style: {
              background: "#0A1128",
              color: "#ffffff",
              border: "1px solid #FEBA4F",
              borderRadius: "1rem",
              padding: "16px 20px",
              fontSize: "14px",
              fontWeight: "bold",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            },
            className: "shadow-2xl",
          }}
        />
        <VerificationBanner
          isVisible={isBannerActive}
          onAction={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            setActiveView("verification");
          }}
          t={t}
        />
        {isPollingStopped && (
          <div className="bg-red-500 text-white text-center py-2 px-4 shadow-md font-bold text-sm sticky top-0 z-[6000] flex justify-center items-center gap-4 animate-in slide-in-from-top fade-in duration-300">
            <span>Povezava s strežnikom je prekinjena.</span>
            <button
              onClick={() => window.location.reload()}
              className="bg-white text-red-500 hover:bg-red-50 px-3 py-1 rounded-full text-xs uppercase tracking-wider transition-colors focus:ring-2 focus:ring-white focus:outline-none"
            >
              Osveži stran
            </button>
          </div>
        )}
        <Header
          onHome={() => {
            setCategoryFilters({ delivery_option: undefined, condition: undefined, specifications: {} });
            navigateTo("grid", {
              selectedRegion: null,
              selectedCategory: null,
              searchQuery: ""
            });
          }}
          onSearch={(val) => {
            setSearchQuery(val);
            if (activeView !== "grid") {
              navigateTo("grid", { searchQuery: val });
            }
          }}
          onRegionSelect={(reg) => {
            navigateTo("grid", { selectedRegion: reg });
          }}
          onCategorySelect={(cat) => {
            setCategoryFilters({ delivery_option: undefined, condition: undefined, specifications: {} });
            navigateTo("grid", { selectedCategory: cat });
          }}
          onLastChance={() => {
            navigateTo("lastChance", { selectedRegion: null, selectedCategory: null });
          }}
          onLogin={() => {
            navigateTo("login");
          }}
          onLogout={handleLogout}
          onSettings={(tab) => {
            navigateTo("settings", { settingsTab: tab || 'profile' });
          }}
          onSubscriptions={() => {
            navigateTo("subscriptions");
          }}
          onCreateAuction={() => {
            navigateTo("createAuction", { createMode: 'choice', republishData: null });
          }}
          onMyWinnings={() => {
            navigateTo("winnings");
          }}
          onMyBids={() => {
            navigateTo("myBids");
          }}
          onMySold={() => {
            navigateTo("mySold");
          }}
          onMyUnsold={() => {
            navigateTo("myUnsold");
          }}
          onWatchlist={() => {
            navigateTo("watchlist");
          }}
          onMessages={() => {
            navigateTo("messages");
          }}
          activeView={activeView}
          selectedRegion={selectedRegion}
          selectedCategory={selectedCategory}
          isLoggedIn={isLoggedIn}
          isAuthLoading={isAuthLoading}
          isVerified={isVerified}
          language={language}
          onLanguageChange={setLanguage}
          t={t}
          auctions={auctions}
          userEmail={userData.email}
          userProfilePicture={
            userData.profile_picture_url || userData.profilePicture
          }
          userWalletBalance={userData.wallet_balance || 0}
          userData={userData}
        />
        <main className="flex-1 flex flex-col">{content}</main>
        {activeView !== "login" && (
          <Footer
            t={t}
            onLegal={setActiveLegal}
            onNavigate={(view) => navigateTo(view)}
            onTestSandbox={() => {
              navigateTo("testSandbox");
            }}
          />
        )}
        {showTermsModal && (
          <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-6 animate-in">
            <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 lg:p-14 shadow-2xl relative">
              <button
                onClick={handleCancelTerms}
                className="absolute top-8 right-8 text-slate-400 hover:text-[#0A1128] transition-colors"
              >
                <X size={24} />
              </button>
              <div className="bg-[#FEBA4F] w-20 h-20 rounded-3xl flex items-center justify-center mb-8 shadow-lg shadow-[#FEBA4F]/20">
                <ShieldCheck size={40} className="text-[#0A1128]" />
              </div>
              <h2 className="text-3xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">
                Splošni pogoji poslovanja
              </h2>
              <p className="text-slate-500 font-bold leading-relaxed mb-6">
                Z oddajo ponudbe potrjujete, da se strinjate s splošnimi pogoji
                poslovanja platforme dražbenik.si. Vaša ponudba je pravno
                zavezujoča. V primeru, da zmagate na dražbi, ste dolžni predmet
                prevzeti in plačati v skladu s pogoji prodajalca.
              </p>
              <label className="flex items-center gap-3 mb-10 cursor-pointer group">
                <div
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${dontShowTermsAgain ? "bg-[#FEBA4F] border-[#FEBA4F]" : "border-slate-300 group-hover:border-[#FEBA4F]"}`}
                >
                  {dontShowTermsAgain && (
                    <CheckCircle2 size={16} className="text-[#0A1128]" />
                  )}
                </div>
                <span className="text-sm font-bold text-slate-600 select-none">
                  Ne prikaži več tega obvestila
                </span>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={dontShowTermsAgain}
                  onChange={(e) => setDontShowTermsAgain(e.target.checked)}
                />
              </label>
              <button
                onClick={handleAcceptTerms}
                className="w-full bg-[#0A1128] text-white py-6 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl"
              >
                Strinjam se in potrjujem ponudbo
              </button>
            </div>
          </div>
        )}
        {pendingBid && (
          <ConfirmBidModal
            isOpen={showConfirmBidModal}
            onClose={handleCancelConfirmBid}
            item={pendingBid.item}
            initialBidAmount={pendingBid.amount}
            currentPlan={currentPlan}
            t={t}
            onConfirm={handleConfirmBid}
            userData={userData}
          />
        )}
        {activeLegal && (
          <LegalModal
            type={activeLegal}
            onClose={() => setActiveLegal(null)}
            t={t}
          />
        )}

        {/* Modal for Unsold Auction Permanent Deletion */}
        {deleteUnsoldModal && deleteUnsoldModal.isOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 bg-[#0A1128]/80 backdrop-blur-sm animate-in fade-in"
              onClick={() => setDeleteUnsoldModal(null)}
            />
            <div className="relative bg-white rounded-[2.5rem] p-8 sm:p-10 max-w-md w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 z-10">
              <div className="w-16 h-16 rounded-3xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center mb-6 mx-auto shadow-inner">
                <Trash2 size={32} />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight text-[#0A1128] text-center mb-2">
                Dokončen izbris dražbe
              </h3>
              <p className="text-sm font-bold text-slate-500 text-center mb-8 leading-relaxed">
                Ali ste prepričani, da želite dokončno izbrisati <span className="text-[#0A1128] font-black">"{deleteUnsoldModal.title}"</span>? Te akcije ni mogoče razveljaviti in dražba bo trajno odstranjena.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setDeleteUnsoldModal(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-[#0A1128] px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all"
                >
                  Prekliči
                </button>
                <button
                  onClick={async () => {
                    try {
                      if (deleteUnsoldModal.items) {
                        for (const it of deleteUnsoldModal.items) {
                          await deleteDoc(doc(db, 'auctions', it.id));
                        }
                        toast.success("Dražbe paketa so bile uspešno izbrisane.");
                      } else if (deleteUnsoldModal.item) {
                        await deleteDoc(doc(db, 'auctions', deleteUnsoldModal.item.id));
                        toast.success("Dražba je bila uspešno izbrisana.");
                      }
                      setDeleteUnsoldModal(null);
                      fetchAuctions();
                    } catch (err: any) {
                      toast.error("Napaka pri brisanju: " + err.message);
                    }
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} /> Izbriši
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modals for delivery and rating */}
        {deliveryMethodModal.isOpen && (
          <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-6 animate-in">
            <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl relative">
              <button
                onClick={() =>
                  setDeliveryMethodModal({
                    isOpen: false,
                    auctionId: "",
                    deliveryMethod: null,
                  })
                }
                className="absolute top-8 right-8 text-slate-400 hover:text-[#0A1128] transition-colors"
              >
                <X size={24} />
              </button>
              <h2 className="text-2xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">
                Način predaje
              </h2>
              <p className="text-slate-500 font-bold mb-8">
                Izberite, na kakšen način boste predmet predali kupcu.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <button
                  onClick={() =>
                    setDeliveryMethodModal((prev) => ({
                      ...prev,
                      deliveryMethod: "pickup",
                    }))
                  }
                  className={`p-6 rounded-2xl border-4 transition-all flex flex-col items-center gap-3 ${deliveryMethodModal.deliveryMethod === "pickup" ? "border-[#FEBA4F] bg-[#FEBA4F]/10" : "border-slate-100 hover:border-slate-200 bg-white"}`}
                >
                  <MapPin
                    size={32}
                    className={
                      deliveryMethodModal.deliveryMethod === "pickup"
                        ? "text-[#FEBA4F]"
                        : "text-slate-400"
                    }
                  />
                  <span className="font-bold text-sm text-[#0A1128]">
                    Osebni prevzem
                  </span>
                </button>
                <button
                  onClick={() =>
                    setDeliveryMethodModal((prev) => ({
                      ...prev,
                      deliveryMethod: "post",
                    }))
                  }
                  className={`p-6 rounded-2xl border-4 transition-all flex flex-col items-center gap-3 ${deliveryMethodModal.deliveryMethod === "post" ? "border-[#FEBA4F] bg-[#FEBA4F]/10" : "border-slate-100 hover:border-slate-200 bg-white"}`}
                >
                  <Truck
                    size={32}
                    className={
                      deliveryMethodModal.deliveryMethod === "post"
                        ? "text-[#FEBA4F]"
                        : "text-slate-400"
                    }
                  />
                  <span className="font-bold text-sm text-[#0A1128]">
                    Pošiljanje po pošti
                  </span>
                </button>
              </div>
              <button
                onClick={handleDeliveryMethodSubmit}
                disabled={!deliveryMethodModal.deliveryMethod}
                className="w-full bg-[#0A1128] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Potrdi izbiro
              </button>
            </div>
          </div>
        )}

        {receiptConfirmModal.isOpen && (
          <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-6 animate-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl relative text-center">
              <button
                onClick={() =>
                  setReceiptConfirmModal({
                    isOpen: false,
                    auctionId: "",
                    sellerId: "",
                  })
                }
                className="absolute top-8 right-8 text-slate-400 hover:text-[#0A1128] transition-colors"
              >
                <X size={24} />
              </button>
              <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={40} className="text-green-600" />
              </div>
              <h2 className="text-2xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">
                Potrditev prejema
              </h2>
              <p className="text-slate-500 font-bold mb-8">
                S potrditvijo izjavljate, da ste predmet uspešno prevzeli.
                Dejanja ni mogoče razveljaviti.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleReceiptConfirmSubmit}
                  className="w-full bg-[#0A1128] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all"
                >
                  Dokončno potrdi prejem
                </button>
                <button
                  onClick={() =>
                    setReceiptConfirmModal({
                      isOpen: false,
                      auctionId: "",
                      sellerId: "",
                    })
                  }
                  className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-slate-200 transition-all"
                >
                  Prekliči
                </button>
              </div>
            </div>
          </div>
        )}

        <ReviewModal
          isOpen={reviewModalData.isOpen}
          onClose={() => setReviewModalData({ isOpen: false, auction: null, sellerName: "" })}
          auction={reviewModalData.auction}
          sellerName={reviewModalData.sellerName}
          language={language}
          t={t}
          onSubmitReview={handleReviewSubmit}
        />

        {isCheckoutOpen && checkoutData && (
          <CheckoutModal
            isOpen={isCheckoutOpen}
            t={t}
            language={language}
            amount={checkoutData.amount}
            title={checkoutData.title}
            onClose={() => setIsCheckoutOpen(false)}
            onSuccess={checkoutData.onSuccess}
            metadata={checkoutData.metadata}
            userWalletBalance={userData.wallet_balance || 0}
          />
        )}
        <MissingInvoiceDataModal
          isOpen={appMissingInvoiceDataModal.isOpen}
          onClose={() => setAppMissingInvoiceDataModal((prev) => ({ ...prev, isOpen: false }))}
          onNavigateToSettings={() => {
            setAppMissingInvoiceDataModal((prev) => ({ ...prev, isOpen: false }));
            setSettingsTab('personal');
            setActiveView("settings");
          }}
          missingFields={appMissingInvoiceDataModal.missingFields}
          userType={appMissingInvoiceDataModal.userType}
          t={t}
        />

        <InvoiceModal
          isOpen={invoiceModalData.isOpen}
          onClose={() => setInvoiceModalData((prev) => ({ ...prev, isOpen: false }))}
          auction={invoiceModalData.auction}
          seller={invoiceModalData.seller}
          buyer={invoiceModalData.buyer}
        />

        {verificationData && (
          <EmailConfirmationView
            token={verificationData.token}
            email={verificationData.email}
            onGoToLogin={(confirmedEmail) => {
              setVerificationData(null);
              const cleanUrl = window.location.pathname;
              window.history.replaceState({}, document.title, cleanUrl);
              setActiveView('login');
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
            onClose={() => {
              setVerificationData(null);
              const cleanUrl = window.location.pathname;
              window.history.replaceState({}, document.title, cleanUrl);
            }}
          />
        )}

        {showBackToTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 right-6 bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] p-3.5 rounded-2xl shadow-2xl hover:scale-110 transition-all z-50 border-2 border-[#FEBA4F]/40 cursor-pointer flex items-center justify-center group"
            aria-label="Nazaj na vrh"
            title="Nazaj na vrh"
          >
            <ArrowUp size={20} strokeWidth={2.5} className="group-hover:-translate-y-0.5 transition-transform" />
          </button>
        )}
      </div>
    </ChatProvider>
  );
};

// --- ADDITIONAL COMPONENTS ---

export default MainApp;
