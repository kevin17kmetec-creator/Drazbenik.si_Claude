import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { DialogHost } from './components/ui/DialogHost';
import { setDomLanguage } from "./lib/domTranslator";
import { translateText } from "./lib/translateUi";
import { setStripeConnectLanguage } from "./lib/stripeConnect";
import AuctionView from "@/src/components/auction/AuctionView";
import SellerView from "@/src/components/profile/SellerView";
import { SubscriptionsView } from "@/src/components/profile/SubscriptionsView";
import { VerificationView } from "@/src/components/auth/VerificationView";
import { CreateAuctionForm } from "@/src/components/auction/CreateAuctionForm";
import { CreatePackageForm } from "@/src/components/auction/CreatePackageForm";
import { PackageCard } from "@/src/components/auction/PackageCard";
import { PackageView } from "@/src/components/auction/PackageView";
import { AuthView } from "@/src/components/auth/AuthView";
import { LegalModal } from "@/src/components/modals/LegalModal";
import { LoadingButton, Spinner } from "@/src/components/ui/Common";
import { VerificationBanner } from "@/src/components/layout/VerificationBanner";
import { StaticTimer } from "@/src/components/ui/StaticTimer";
import { AuctionCard } from "@/src/components/auction/AuctionCard";
import { HeroCarousel } from "@/src/components/auction/HeroCarousel";
import { Header } from "@/src/components/layout/Header";
import { Footer } from "@/src/components/layout/Footer";
import { CookieNotice } from "@/src/components/layout/CookieNotice";
import { CheckoutModal } from "@/src/components/modals/CheckoutModal";
import { SettingsView } from "@/src/components/profile/SettingsView";
import { AccountingView } from "@/src/components/admin/AccountingView";
import { ConfirmBidModal } from "@/src/components/modals/ConfirmBidModal";
import { MessagesView } from "@/src/components/profile/MessagesView";
import { MissingInvoiceDataModal } from "@/src/components/modals/MissingInvoiceDataModal";
import { CategoryFilterBar, FilterState } from "@/src/components/auction/CategoryFilterBar";
import { useNotifications } from "@/src/hooks/useNotifications";
import { Portal } from "@/src/components/ui/Portal";
import { TermsUpdateView } from "@/src/components/auth/TermsUpdateView";
import { MarkShippedModal } from "@/src/components/modals/MarkShippedModal";
import { PaymentTimeline } from "@/src/components/orders/PaymentTimeline";
import { TERMS_VERSION } from "./lib/termsVersion";
import { getSellerSetupStep } from "./lib/sellerSetup";
import { checkUserInvoiceData } from "./lib/invoiceDataCheck";
import { getAuthHeaders } from "./lib/authFetch";
import { cancelBankTransferPayment } from "./lib/bankTransfer";
import { friendlyError } from "./lib/friendlyError";
import { sendEmailVerificationAction } from "@/src/actions/auth-emails";
import { canLeaveReview } from "./lib/reviewEligibility";
import { WinnerActions } from "./components/auction/WinnerActions";
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
  Copy,
  Zap,
  Download,
  CreditCard,
  ExternalLink,
  AlertOctagon,
  Trash2,
  Filter,
  LayoutGrid,
  List,
  Scale,
  FileText,
  Check,
  Package,
  HelpCircle,
  Languages,
  FileUp,
  Key,
  QrCode,
} from './components/icons';

import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

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
import { CATEGORY_URL_MAP } from "./lib/urlMaps";
import { collection, onSnapshot, setDoc, doc, getDocs, getDoc, updateDoc, addDoc, deleteDoc, query, where, orderBy, limit } from "firebase/firestore";
import { db, auth, storage, safeSignOut, cleanupAllListeners, registerSnapshotListener, isRegisteringAuth } from "./lib/firebase";
import { onAuthStateChanged, updatePassword } from "firebase/auth";
import { logoutStripeConnect } from "./lib/stripeConnect";


// --- CONFIGURATION ---

import { translations, getCategoryTranslation } from "./lib/translations";
import {
  getIncrement,
  formatSeconds,
  normalizeRegionName,
  getUserAuctionCycle,
} from "./lib/utils";
import { openCenteredPopup } from "./lib/popup";
import { watchBankTransferPopup } from "./lib/bankTransferWatcher";
import { useFeePreview } from "./lib/useFeePreview";

const matchesSelectedRegion = (itemRegion: string | undefined | null, selected: string | null): boolean => {
  if (!selected) return true;
  return normalizeRegionName(itemRegion) === normalizeRegionName(selected);
};

// --- MAIN APP COMPONENT ---

import { InvoiceModal } from "@/src/components/modals/InvoiceModal";
import { ReviewModal } from "@/src/components/modals/ReviewModal";
import { QrScannerModal } from "@/src/components/modals/QrScannerModal";

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

import { Timer } from './components/icons';

const PaymentTimer: React.FC<{ endTime: string | Date; deadlineAt?: string | Date | null }> = ({ endTime, deadlineAt }) => {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    const deadline = deadlineAt ? new Date(deadlineAt).getTime() : new Date(endTime).getTime() + 48 * 60 * 60 * 1000;

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
  }, [endTime, deadlineAt]);

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
// Kategorie-URL-Zuordnung liegt in src/lib/urlMaps.ts

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
}

// Hilfsfunktion zur Pruefung, ob eine Auktion geoeffnet werden darf (DEL E)
export function canViewAuction(auction: any, currentUser: any, currentUserData?: any): boolean {
  if (!auction) return false;

  // Pruefen, ob die Auktion beendet bzw. abgeschlossen ist
  const status = auction.status ? String(auction.status).toLowerCase() : '';
  const isStatusEnded = ['completed', 'cancelled', 'paid', 'sold', 'unsold'].includes(status);

  const endTimeMs = auction.endTime
    ? new Date(auction.endTime).getTime()
    : (auction.end_time ? new Date(auction.end_time).getTime() : 0);
  const isTimeEnded = endTimeMs > 0 && Date.now() > endTimeMs;

  const isAuctionClosed = isStatusEnded || isTimeEnded;

  // Aktive Auktionen duerfen von allen Nutzern (auch Gaesten) geoeffnet werden
  if (!isAuctionClosed) {
    return true;
  }

  // Bei geschlossenen Auktionen duerfen nur Verkaeufer, Gewinner oder Administratoren die Detailansicht oeffnen
  if (!currentUser && !currentUserData) {
    return false;
  }

  const userId = currentUser?.uid || currentUser?.id || currentUserData?.id;
  if (!userId) {
    return false;
  }

  // Verkaeufer-Pruefung
  const sellerId = auction.sellerId || auction.seller_id || (typeof auction.seller === 'string' ? auction.seller : null);
  if (sellerId && sellerId === userId) {
    return true;
  }

  // Gewinner-Pruefung
  const winnerId = auction.winner_id || auction.winnerId || auction.highestBidder;
  if (winnerId && winnerId === userId) {
    return true;
  }

  // Administrator-Pruefung (VITE_ADMIN_UIDS oder Rollen-Attribut)
  const envAdminUids = ((import.meta.env.VITE_ADMIN_UIDS as string) || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const isAdmin = envAdminUids.includes(userId) || currentUserData?.role === 'admin' || currentUserData?.isAdmin === true || currentUser?.role === 'admin';
  if (isAdmin) {
    return true;
  }

  return false;
}

const WonAuctionItem: React.FC<{
  wonItem: any;
  language: string;
  t: any;
  userData: any;
  navigateTo: (view: string, data?: any) => void;
  setCheckoutData: (data: any) => void;
  setIsCheckoutOpen: (open: boolean) => void;
  fetchAuctions: () => void;
  refreshUserData: (uid: string) => void;
  transactionPartners: Map<string, any>;
  setTransactionPartners: React.Dispatch<React.SetStateAction<Map<string, any>>>;
  setInvoiceModalData: (data: any) => void;
  setActiveConversationId: (id: string) => void;
  setActiveView: any;
  setReceiptConfirmModal: (data: any) => void;
  openReviewModal: (item: any) => void;
  setTimelineModalAuctionId: (id: string | null) => void;
  user: any;
  setDeliveryMethodModal?: (data: any) => void;
}> = ({
  wonItem,
  language,
  t,
  userData,
  navigateTo,
  setCheckoutData,
  setIsCheckoutOpen,
  fetchAuctions,
  refreshUserData,
  transactionPartners,
  setTransactionPartners,
  setInvoiceModalData,
  setActiveConversationId,
  setActiveView,
  setReceiptConfirmModal,
  openReviewModal,
  setTimelineModalAuctionId,
  user,
  setDeliveryMethodModal
}) => {
  const isPaid = wonItem.payment_status === "paid";
  const [pickupPin, setPickupPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [openingInstructions, setOpeningInstructions] = useState(false);
  const [cancellingBt, setCancellingBt] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Deutscher Kommentar: Bricht die anstehende Bankueberweisung ueber die gemeinsame Hilfsfunktion ab
  const handleCancelBankTransfer = async () => {
    if (!user || !wonItem?.id) return;
    setCancellingBt(true);
    try {
      const res = await cancelBankTransferPayment({ auctionId: wonItem.id, user });
      if (res.success) {
        setShowCancelConfirm(false);
        toast.success("Nakazilo je preklicano. Dražbo lahko zdaj plačate s kartico.");
        fetchAuctions();
        if (userData?.id) refreshUserData(userData.id);
      } else {
        toast.error(res.error || "Napaka pri preklicu nakazila.");
      }
    } catch (err: any) {
      toast.error(err.message || "Napaka pri preklicu.");
    } finally {
      setCancellingBt(false);
    }
  };

  // Deutscher Kommentar: Ruft die Zahlungsanweisungen fuer die Bankueberweisung des gewonnenen Artikels ab
  const handleOpenBankTransferInstructions = async () => {
    if (!user || !wonItem?.id) return;
    setOpeningInstructions(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/checkout/bank-transfer-instructions?auction_id=${encodeURIComponent(wonItem.id)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data?.url) {
        const instrPopup = openCenteredPopup(data.url, '_blank', 560, 820);
        watchBankTransferPopup(instrPopup, wonItem.id, () => { fetchAuctions(); });
      } else {
        toast.error(data?.error || "Navodila za nakazilo trenutno niso na voljo.");
      }
    } catch (err: any) {
      toast.error(err.message || "Napaka pri odpiranju navodil.");
    } finally {
      setOpeningInstructions(false);
    }
  };

  const { data: preview, loading: previewLoading, error: previewError } = useFeePreview({
    auctionId: wonItem.id,
    enabled: !isPaid
  });

  const rawItemPrice = Number(wonItem.currentBid || wonItem.current_price || wonItem.starting_price || 0);
  const totalAmountToPay = preview?.totalCents ? preview.totalCents / 100 : 0;

  // Deutscher Kommentar: Rolle des Nutzers - 2. Bieter mit aktivem Verkaeuferangebot hat eine eigene Frist
  const myId = (userData as any)?.id || user?.uid;
  const isSecondOffer = (wonItem as any).post_auction_status === 'offered_2nd' && (wonItem as any).second_winner_id === myId;
  const secondDeadline = (wonItem as any).second_chance_deadline as string | undefined;
  const paymentDeadlineMs = isSecondOffer && secondDeadline
    ? new Date(secondDeadline).getTime()
    : new Date((wonItem as any).payment_deadline || wonItem.endTime || (wonItem as any).end_time).getTime() + ((wonItem as any).payment_deadline ? 0 : 48 * 60 * 60 * 1000);
  const isOverdue = !isPaid && (
    isSecondOffer
      ? Date.now() > paymentDeadlineMs
      : (
        wonItem.post_auction_status === "failed_1st" ||
        wonItem.post_auction_status === "failed_2nd" ||
        wonItem.post_auction_status === "unpaid" ||
        wonItem.post_auction_status === "unsold" ||
        Date.now() > paymentDeadlineMs
      )
  );
  const strikeApplied = (wonItem as any).second_unpaid_strike_applied === true || (wonItem as any).unpaid_strike_applied === true;
  const [respondingOffer, setRespondingOffer] = useState(false);

  const handleAcceptOffer = async () => {
    if (!user) return;
    setRespondingOffer(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/auctions/second-chance-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ auction_id: wonItem.id, action: 'accept' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Napaka pri sprejemu ponudbe.');
      toast.success(data.message || 'Ponudbo ste sprejeli. Imate 24 ur za plačilo.');
      fetchAuctions();
    } catch (e: any) {
      toast.error(e.message || 'Napaka pri sprejemu ponudbe.');
    } finally {
      setRespondingOffer(false);
    }
  };

  const handleRejectOffer = async () => {
    if (!user) return;
    setRespondingOffer(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/auctions/second-chance-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ auction_id: wonItem.id, action: 'reject' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Napaka pri zavrnitvi ponudbe.');
      toast.success('Ponudbo ste zavrnili. Opomin ne bo izdan.');
      fetchAuctions();
    } catch (e: any) {
      toast.error(e.message || 'Napaka pri zavrnitvi ponudbe.');
    } finally {
      setRespondingOffer(false);
    }
  };

  const userStrikesCount = Math.max(1, Number((userData as any)?.unpaidStrikes ?? (userData as any)?.unpaid_strikes ?? 1));
  const strikeOrdinal = userStrikesCount === 1 ? "1. opomin (Strike 1/3)" : userStrikesCount === 2 ? "2. opomin (Strike 2/3)" : `${userStrikesCount}. zadnji opomin (Strike 3/3)`;

  return (
    <div
      key={wonItem.id}
      className={`flex flex-col md:flex-row items-center gap-4 md:gap-8 p-4 sm:p-6 rounded-3xl md:rounded-[1.35rem] border-2 transition-colors group ${
        isOverdue 
          ? "border-red-500 bg-red-50/20 shadow-sm" 
          : "border-slate-100 hover:border-[#FEBA4F]"
      }`}
    >
      <div
        className={`w-24 h-24 md:w-32 md:h-32 shrink-0 bg-slate-100 rounded-2xl md:rounded-3xl overflow-hidden shadow-md transition-transform ${
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
          className={`text-xl md:text-2xl font-black uppercase tracking-tighter mb-2 transition-colors ${
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
        
        {isPaid ? (
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 md:gap-4 text-sm font-bold text-slate-400 mt-2">
            <span className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <Gavel size={16} /> Plačani znesek:{" "}
              <span className="text-[#0A1128] font-black">
                €{(Number(wonItem.amount_total || wonItem.currentBid || 0)).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
          </div>
        ) : (
          <div className="mt-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs text-slate-600 font-bold">
            <div className="flex justify-between">
              <span>Cena predmeta:</span>
              <span className="text-[#0A1128]">
                €{(preview ? preview.itemPriceCents / 100 : rawItemPrice).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{preview?.feeIsMinimum ? "Provizija platforme (minimalna)" : `Provizija platforme (${preview ? `${preview.feePercent} %` : "..."}):`}</span>
              <span className="text-[#0A1128]">
                {preview ? `€${(preview.feeCents / 100).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "..."}
              </span>
            </div>
            {preview?.feeIsMinimum && (
              <p className="text-[10px] text-slate-400 -mt-1">
                Uporabljena je minimalna provizija 1,00 €.
              </p>
            )}
            <div className="flex justify-between">
              <span>DDV {preview ? `${preview.vatRate} %` : "..."}:</span>
              <span className="text-[#0A1128]">
                {preview
                  ? preview.isReverseCharge
                    ? "Obrnjena davčna obveznost (0 %)"
                    : `€${(preview.vatCents / 100).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "..."}
              </span>
            </div>
            <div className="flex justify-between text-sm font-black text-[#0A1128] pt-2 border-t border-slate-200">
              <span>Skupaj za plačilo:</span>
              <span>
                {preview ? `€${(preview.totalCents / 100).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "..."}
              </span>
            </div>
          </div>
        )}

        {!isPaid && (
          <div className="mt-2 flex items-center justify-center md:justify-start">
            <PaymentTimer endTime={wonItem.endTime} deadlineAt={isSecondOffer ? secondDeadline : ((wonItem as any).post_auction_status === 'awaiting_payment_2nd' ? (wonItem as any).payment_deadline : undefined)} />
          </div>
        )}

        {isSecondOffer && !isOverdue && (
          <div className="mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-bold text-amber-900 leading-relaxed">
            Prodajalec vam ponuja ta predmet po vaši ponudbi <strong>€{rawItemPrice.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>. Ponudbo morate sprejeti v roku 24 ur (glejte odštevanje). Ko jo sprejmete, imate za plačilo še 24 ur. Če ponudbe ne želite, jo zavrnite ali ne storite ničesar – opomin ne bo izdan; opomin prejmete le, če ponudbo sprejmete in ne plačate.
          </div>
        )}

        {/* Overdue alert notice for winner */}
        {isOverdue && (
          <div className="mt-3 p-3.5 bg-red-100/70 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-start sm:items-center gap-2.5">
            <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              {strikeApplied ? (
                <>Zaradi neplačila v roku 48 ur ste prejeli <strong className="font-black text-red-800">{strikeOrdinal}</strong>. {(userData as any)?.isBlocked || ((userData as any)?.unpaidStrikes || 0) >= 3 ? "Vaš račun je trajno blokiran za ponujanje na dražbah." : "Pri 3 opominih se račun avtomatsko blokira."}</>
              ) : (
                <>Rok za plačilo je potekel.</>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 w-full lg:w-auto shrink-0 mt-4 md:mt-0">
        {isPaid ? (
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

            {/* Gemeinsame WinnerActions-Komponente fuer den Gewinner (DEL D) */}
            <WinnerActions
              wonItem={wonItem}
              user={user}
              isPaid={isPaid}
              setReceiptConfirmModal={setReceiptConfirmModal}
              openReviewModal={openReviewModal}
              canLeaveReview={canLeaveReview}
              onRefreshWonItems={fetchAuctions}
              onOpenMessages={(auctionId) => {
                setActiveConversationId(auctionId);
                setActiveView("messages");
                window.scrollTo({
                  top: 0,
                  behavior: "instant",
                });
              }}
              onOpenInvoice={async () => {
                let seller = transactionPartners.get(wonItem.id);
                if (!seller) {
                  try {
                    const token = await user?.getIdToken();
                    const res = await fetch(`/api/transactions/partner-info?auction_id=${wonItem.id}`, {
                      headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                      const data = await res.json();
                      if (data?.success && data?.partner) {
                        seller = data.partner;
                        setTransactionPartners(prev => {
                          const next = new Map(prev);
                          next.set(wonItem.id, data.partner);
                          return next;
                        });
                      }
                    }
                  } catch (e) {
                    console.warn("Error fetching seller details:", e);
                  }
                }
                setInvoiceModalData({
                  isOpen: true,
                  auction: wonItem,
                  seller: seller || null,
                  buyer: userData
                });
              }}
              onOpenDetail={(item) => {
                navigateTo("detail", { selectedItem: item });
              }}
              onOpenTimeline={(auctionId) => {
                setTimelineModalAuctionId(auctionId);
              }}
              onOpenDeliveryChooser={setDeliveryMethodModal ? (auctionId) => {
                setDeliveryMethodModal({
                  isOpen: true,
                  auctionId,
                  deliveryMethod: null,
                });
              } : undefined}
              layout="card"
            />
          </div>
        ) : isOverdue ? (
          <div className="flex flex-col gap-2 w-full lg:w-auto lg:min-w-[220px]">
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
              <div className="flex flex-col gap-1.5 w-full">
                {wonItem.bank_transfer_final_chance === true && wonItem.bank_transfer_pending !== true && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-left">
                    <p className="text-red-600 text-xs font-black uppercase tracking-wider">
                      Zadnja priložnost: plačilo s kartico do {new Date(wonItem.payment_deadline).toLocaleString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
                {wonItem.bank_transfer_pending === true ? (
                  <div className="bg-amber-500/10 border border-[#FEBA4F]/20 rounded-2xl p-4 text-left">
                    <p className="text-[#FEBA4F] text-xs font-black uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <ShieldCheck size={14} /> Plačilo v obdelavi
                    </p>
                    <p className="text-slate-500 text-xs font-bold leading-normal mb-3">
                      Plačilo z bančnim nakazilom (SEPA) je v obdelavi. Počakajte na potrditev s strani našega plačilnega partnerja.
                    </p>
                    <button
                      onClick={handleOpenBankTransferInstructions}
                      disabled={openingInstructions}
                      className="w-full text-xs bg-[#0A1128] hover:bg-[#FEBA4F] hover:text-[#0A1128] text-white font-black uppercase tracking-wider py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {openingInstructions ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          <span>Nalaganje navodil...</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink size={14} />
                          <span>Odpri navodila za nakazilo</span>
                        </>
                      )}
                    </button>
                    <LoadingButton
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={cancellingBt}
                      loading={cancellingBt}
                      loadingText="Prekinjam..."
                      className="w-full text-xs bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-wider py-3 px-4 rounded-xl border border-slate-700 transition-all disabled:opacity-50 cursor-pointer mt-2"
                    >
                      Raje plačam s kartico
                    </LoadingButton>
                    <p className="text-[11px] text-slate-400 font-bold leading-snug mt-2.5 text-center">
                      Če nakazila še niste poslali, ga lahko kadarkoli zamenjate s plačilom s kartico.
                    </p>
                  </div>
                ) : (
                  <LoadingButton
                    disabled={previewLoading || !preview}
                    loadingText="Odpiram plačilo..."
                    onClick={async () => {
                      setCheckoutData({
                        amount: totalAmountToPay,
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
                          buyer_data: userData,
                          payment_deadline: wonItem.payment_deadline,
                          endTime: wonItem.endTime || wonItem.end_time,
                          bank_transfer_used: wonItem.bank_transfer_used
                        },
                      });
                      setIsCheckoutOpen(true);
                    }}
                    className={`px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm transition-all shadow-xl flex items-center justify-center gap-2 ${
                      previewLoading || !preview
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-[#0A1128] text-white hover:bg-[#FEBA4F] hover:text-[#0A1128]'
                    }`}
                  >
                    {previewLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        <span>Nalaganje izračuna...</span>
                      </>
                    ) : (
                      <>
                        <CardIcon size={18} /> Plačaj zdaj
                      </>
                    )}
                  </LoadingButton>
                )}
                {!isPaid && !previewLoading && !preview && previewError && (
                  <p className="text-red-500 text-xs font-bold text-center mt-1">
                    Izračuna zneska ni bilo mogoče pridobiti. Osvežite stran.
                  </p>
                )}
              </div>
            )}
            {isSecondOffer && (
              <LoadingButton
                loading={respondingOffer}
                loadingText="Sprejemam..."
                onClick={handleAcceptOffer}
                className="bg-[#0A1128] text-white hover:bg-[#FEBA4F] hover:text-[#0A1128] px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm flex items-center justify-center gap-2"
              >
                Sprejmi ponudbo
              </LoadingButton>
            )}
            {isSecondOffer && (
              <LoadingButton
                loading={respondingOffer}
                loadingText="Zavračam..."
                onClick={handleRejectOffer}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 md:px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"
              >
                Zavrni ponudbo
              </LoadingButton>
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
                className="bg-[#FEBA4F] text-[#0A1128] px-4 md:px-8 py-3 md:py-3 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all flex items-center justify-center gap-2"
              >
                <MessageSquare size={18} /> Sporočila
              </button>
            )}
          </div>
        )}
      </div>

      {showCancelConfirm && (
        <Portal>
          {/* Deutscher Kommentar: Responsives Bestaetigungsmodal fuer Stornierung der Bankueberweisung */}
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4">
            <div 
              className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" 
              onClick={() => { if (!cancellingBt) setShowCancelConfirm(false); }} 
            />
            <div className="relative bg-white border border-slate-200 rounded-3xl p-5 sm:p-8 max-w-md w-full shadow-2xl text-center z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[92dvh] overflow-y-auto">
              <div className="bg-amber-100 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-5 text-amber-600">
                <AlertCircle size={28} />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#0A1128] uppercase tracking-tighter mb-2 sm:mb-3">
                Preklic bančnega nakazila
              </h3>
              <p className="text-slate-600 font-bold mb-5 sm:mb-6 text-xs sm:text-sm leading-relaxed">
                Nakazilo bo preklicano. Če ste denar že nakazali, plačila ne preklicujte. Nadaljujem?
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleCancelBankTransfer}
                  disabled={cancellingBt}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 px-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-wider text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg min-h-[44px]"
                >
                  {cancellingBt ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Prekinjam...</span>
                    </>
                  ) : (
                    <span>Prekliči nakazilo</span>
                  )}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancellingBt}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-wider text-xs transition-all disabled:opacity-50 cursor-pointer min-h-[40px] flex items-center justify-center"
                >
                  Nazaj
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};

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

  const [rawAuctions, setRawAuctions] = useState<any[]>([]);
  const [extraAuctions, setExtraAuctions] = useState<any[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());
  const profilesMapRef = useRef(profilesMap);
  profilesMapRef.current = profilesMap;

  // Deutscher Kommentar: State fuer geladene Liefermethoden aus den Transaktionen
  const [deliveryMethodsMap, setDeliveryMethodsMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const curUser = auth.currentUser;
    if (!curUser) {
      setDeliveryMethodsMap({});
      return;
    }
    let isMounted = true;
    async function fetchDeliveryMethods() {
      try {
        const token = await curUser?.getIdToken();
        const res = await fetch('/api/orders/delivery-methods', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data && typeof data === 'object') {
            setDeliveryMethodsMap(data);
          }
        }
      } catch (e) {
        console.warn("Error fetching delivery-methods:", e);
      }
    }
    fetchDeliveryMethods();
    return () => { isMounted = false; };
  }, []);

  const auctions = useMemo(() => {
    const combinedMap = new Map<string, any>();
    extraAuctions.forEach((item) => {
      if (item && item.id) combinedMap.set(item.id, item);
    });
    rawAuctions.forEach((item) => {
      if (item && item.id) combinedMap.set(item.id, item);
    });
    const combinedList = Array.from(combinedMap.values());

    return combinedList.map((d: any) => {
      const sellerId = d.seller_id || d.sellerId;
      const seller = profilesMap.get(sellerId) || {};
      const isDeletedUser = Boolean(d.is_seller_deleted || seller.is_deleted || d.sellerName === "Uporabnik je bil izbrisan");
      const sellerName = isDeletedUser
        ? "Uporabnik je bil izbrisan"
        : (seller.display_name || d.sellerName || seller.username || "Prodajalec");

      const isItemPaid = d.payment_status === "paid" || d.post_auction_status === "paid";

      return {
        ...d,
        region: normalizeRegionName(d.region || (typeof d.location === 'object' ? d.location?.SLO : d.location)),
        endTime: new Date(d.end_time || d.endTime || Date.now()),
        createdAt: d.created_at || d.createdAt || new Date(0).toISOString(),
        currentBid: d.current_price || d.currentBid,
        bidCount: d.bid_count || d.bidCount,
        winnerId: d.winner_id || d.winnerId,
        winner_id: d.winner_id || d.winnerId,
        sellerId: sellerId,
        is_seller_deleted: isDeletedUser,
        payment_status: isItemPaid ? "paid" : (d.payment_status || "unpaid"),
        post_auction_status: d.post_auction_status,
        paid_at: d.paid_at,
        delivery_method: d.delivery_method || d.selected_delivery || deliveryMethodsMap[d.id],
        selected_delivery: d.selected_delivery || deliveryMethodsMap[d.id],
        sellerName: sellerName,
        seller: { 
          id: sellerId, 
          name: { SLO: sellerName, EN: isDeletedUser ? 'User deleted' : sellerName, DE: isDeletedUser ? 'Benutzer gelöscht' : sellerName }, 
          is_deleted: isDeletedUser,
          photoURL: isDeletedUser ? null : (seller.photo_url || null), 
          created_at: seller.created_at, 
          sold_count: seller.sold_count || 0,
          unpaid_penalties: seller.unpaid_penalties || 0,
          identity_verified: Boolean(seller.identity_verified),
          user_type: seller.user_type || seller.userType || 'individual'
        }
      } as AuctionItem;
    });
  }, [rawAuctions, extraAuctions, profilesMap, deliveryMethodsMap]);
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
    if (
      checkPath.startsWith("/admin/racunovodstvo") ||
      checkPath.startsWith("/admin/accounting") ||
      checkPath.startsWith("/admin/buchhaltung")
    )
      return "adminAccounting";
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
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
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
  const [myBidsMap, setMyBidsMap] = useState<Map<string, number>>(new Map());
  const [bankTransferUsedMap, setBankTransferUsedMap] = useState<Record<string, boolean>>({});
  const bidAuctionIds = useMemo(() => {
    if (!userData?.id) return [];
    return Array.from(myBidsMap.keys());
  }, [myBidsMap, userData?.id]);
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
  // Regionen- und Kategoriefilter als Arrays für Mehrfachauswahl
  const [selectedRegions, setSelectedRegions] = useState<Region[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<FilterState>({
    delivery_options: [],
    conditions: [],
    specifications: {}
  });
  const [showFilters, setShowFilters] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem("drazbenik_show_filters");
      if (stored !== null) return stored === "true";
      return window.innerWidth >= 1024;
    } catch {
      return true;
    }
  });
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Zählung der aktiven Filter für Badges
  const activeCategoryFilterCount = useMemo(() => {
    return (
      selectedCategories.length +
      selectedRegions.length +
      (categoryFilters.delivery_options?.length || 0) +
      (categoryFilters.conditions?.length || 0) +
      Object.values(categoryFilters.specifications || {}).reduce((acc, vals) => acc + (vals?.length || 0), 0)
    );
  }, [selectedCategories, selectedRegions, categoryFilters]);
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Deutscher Kommentar: Listener fuer aktive Auktionen ist begrenzt (zuerst die am schnellsten endenden); bei Suche/Filter wird automatisch bis 600 geladen
  const AUCTIONS_PAGE_SIZE = 200;
  const AUCTIONS_MAX_WITH_FILTERS = 600;
  const [auctionsLimit, setAuctionsLimit] = useState(AUCTIONS_PAGE_SIZE);
  const [auctionsUnlimited, setAuctionsUnlimited] = useState(false);
  const hasActiveListFilters = searchQuery.trim().length > 0 || activeCategoryFilterCount > 0;
  const effectiveAuctionsLimit = hasActiveListFilters ? Math.max(auctionsLimit, AUCTIONS_MAX_WITH_FILTERS) : auctionsLimit;
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showBannerDelayPassed, setShowBannerDelayPassed] = useState(false);
  const [userType, setUserType] = useState<"individual" | "business" | null>(
    null,
  );
  const [watchedIds, setWatchedIds] = useState<string[]>([]);
  const [watchlistSnapshot, setWatchlistSnapshot] = useState<string[]>([]);
  const [watchedLoaded, setWatchedLoaded] = useState(false);
  const watchedIdsRef = useRef<string[]>([]);
  watchedIdsRef.current = watchedIds;

  useEffect(() => {
    if (activeView === "watchlist" && watchedLoaded) {
      setWatchlistSnapshot(watchedIdsRef.current);
    }
  }, [activeView, watchedLoaded]);
  const [isPollingStopped, setIsPollingStopped] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [createMode, setCreateMode] = useState<"choice" | "single" | "package">("choice");
  const [settingsTab, setSettingsTab] = useState<'profile' | 'personal' | 'stripe' | 'notifications' | 'invoices'>('profile');
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
  // Robuster Navigationsverlauf mit Mehrfachauswahl-Filtern
  interface NavigationEntry {
    view: ViewState;
    selectedItem: AuctionItem | null;
    selectedSeller: Seller | null;
    selectedPackageId: string | null;
    selectedCategories: Category[];
    selectedRegions: Region[];
    searchQuery: string;
    settingsTab: 'profile' | 'personal' | 'stripe' | 'notifications' | 'invoices';
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
    selectedCategories,
    selectedRegions,
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
    selectedCategories,
    selectedRegions,
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
        if (overrides.selectedCategories !== undefined) setSelectedCategories(overrides.selectedCategories);
        if (overrides.selectedRegions !== undefined) setSelectedRegions(overrides.selectedRegions);
        if (overrides.searchQuery !== undefined) setSearchQuery(overrides.searchQuery);
        if (overrides.settingsTab !== undefined) setSettingsTab(overrides.settingsTab);
        if (overrides.activeConversationId !== undefined) setActiveConversationId(overrides.activeConversationId);
        if (overrides.createMode !== undefined) setCreateMode(overrides.createMode);
        if (overrides.republishData !== undefined) setRepublishData(overrides.republishData);
      }

      // Zugriffsschutz fuer geschlossene Auktionen (DEL E)
      if (targetView === "detail") {
        const itemToCheck = overrides?.selectedItem !== undefined ? overrides.selectedItem : selectedItem;
        if (itemToCheck && !canViewAuction(itemToCheck, auth.currentUser, userData)) {
          toast.info("Dražba je zaključena.");
          setActiveView("grid");
          return;
        }
      }

      setActiveView(targetView);
      if (options?.scrollToTop !== false) {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    },
    [captureCurrentNavState, userData, selectedItem]
  );

  // Weiterleitung zur Zustimmung, wenn der Server TERMS_REQUIRED meldet
  useEffect(() => {
    const handler = () => {
      toast.error("Za to dejanje morate sprejeti posodobljene pogoje uporabe.");
      navigateTo("acceptTerms");
    };
    window.addEventListener('terms-required', handler);
    return () => window.removeEventListener('terms-required', handler);
  }, [navigateTo]);

  const goBack = useCallback(
    (fallbackView: ViewState = "grid") => {
      const previous = navHistoryRef.current.pop();
      if (previous) {
        setActiveView(previous.view);
        setSelectedItem(previous.selectedItem ?? null);
        setSelectedSeller(previous.selectedSeller ?? null);
        setSelectedPackageId(previous.selectedPackageId ?? null);
        setSelectedCategories(previous.selectedCategories ?? []);
        setSelectedRegions(previous.selectedRegions ?? []);
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
      verification: { SLO: "/verifikacija", EN: "/verification", DE: "/verifizierung" },
      adminAccounting: { SLO: "/admin/racunovodstvo", EN: "/admin/accounting", DE: "/admin/buchhaltung" }
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
      if (selectedCategories.length > 0) {
        const catKey = QUERY_PARAM_MAP.category[language as 'SLO' | 'EN' | 'DE'] || QUERY_PARAM_MAP.category.SLO;
        const catValues = selectedCategories.map(c => CATEGORY_URL_MAP[c]?.[language as 'SLO' | 'EN' | 'DE'] || CATEGORY_URL_MAP[c]?.SLO).filter(Boolean);
        if (catValues.length > 0) {
          params.set(catKey, catValues.join(','));
        }
      }
      if (selectedRegions.length > 0) {
        const regKey = QUERY_PARAM_MAP.region[language as 'SLO' | 'EN' | 'DE'] || QUERY_PARAM_MAP.region.SLO;
        const regValues = selectedRegions.map(r => REGION_URL_MAP[r]?.[language as 'SLO' | 'EN' | 'DE'] || REGION_URL_MAP[r]?.SLO).filter(Boolean);
        if (regValues.length > 0) {
          params.set(regKey, regValues.join(','));
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
  }, [activeView, activeConversationId, selectedItem?.id, selectedSeller?.id, language, selectedCategories, selectedRegions, settingsTab]);

  // Initial Hydration from URL or LocalStorage
  useEffect(() => {
    // Deutscher Kommentar: Wenn ein QR-Abholvorgang aussteht, Route-Wiederherstellung ueberspringen
    const hasPendingQr = (() => {
      try { return !!sessionStorage.getItem('pending_prevzem_qr'); } catch (e) { return false; }
    })();

    const isSessionActive = sessionStorage.getItem("session_tab_active");
    if (!isSessionActive) {
      sessionStorage.setItem("session_tab_active", "true");
      setActiveView("grid");
      setSelectedCategories([]);
      setSelectedRegions([]);
      setSearchQuery("");
      setSelectedItem(null);
      setSelectedSeller(null);
      setActiveConversationId(null);

      // Determine clean root URL path based on current language
      let cleanPath = "/";
      if (language === "EN") cleanPath = "/en/";
      else if (language === "DE") cleanPath = "/de/";

      if (!hasPendingQr) {
        window.history.replaceState(null, "", cleanPath);
        localStorage.setItem("last_active_route", cleanPath);
      }
      setTimeout(() => setIsHydrating(false), 50);
      return;
    }

    if (hasPendingQr) {
      setActiveView("grid");
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
      let categoriesToSet: Category[] = [];
      let regionsToSet: Region[] = [];
      let tabToSet: 'profile' | 'personal' | 'stripe' = 'profile';

      for (const [key, value] of searchParams.entries()) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "kategorija" || lowerKey === "category" || lowerKey === "kategorie") {
          const parts = value.split(',');
          for (const p of parts) {
            const decodedCat = slugToCategory(p.trim());
            if (decodedCat && !categoriesToSet.includes(decodedCat)) categoriesToSet.push(decodedCat);
          }
        }
        if (lowerKey === "regija" || lowerKey === "region") {
          const parts = value.split(',');
          for (const p of parts) {
            const decodedReg = slugToRegion(p.trim());
            if (decodedReg && !regionsToSet.includes(decodedReg)) regionsToSet.push(decodedReg);
          }
        }
        if (lowerKey === "zavihek" || lowerKey === "tab") {
          tabToSet = slugToSettingsTab(value);
        }
      }

      if (categoriesToSet.length > 0) setSelectedCategories(categoriesToSet);
      if (regionsToSet.length > 0) setSelectedRegions(regionsToSet);
      setSettingsTab(tabToSet);

      const drazbaQueryId = searchParams.get("drazba");
      const isAuctionPath = path.startsWith("/drazba") || path.startsWith("/auction") || path.startsWith("/auktion");
      const targetAuctionId = isAuctionPath ? id : (drazbaQueryId || null);

      if (path.startsWith("/sporocila") || path.startsWith("/messages") || path.startsWith("/nachrichten")) {
        if (id) setActiveConversationId(id);
        setActiveView("messages");
      } else if (isAuctionPath || drazbaQueryId) {
        if (targetAuctionId) {
          let found = [].find((a) => a.id === targetAuctionId);
          if (!found) {
            const snap = await getDoc(doc(db, 'auctions', targetAuctionId));
            const data: any = snap.exists() ? { id: snap.id, ...snap.data() } : null;
            if (data) {
              found = {
                ...data,
                endTime: new Date(data.end_time || data.endTime),
                currentBid: data.current_price || data.currentBid,
                bidCount: data.bid_count || data.bidCount,
                winnerId: data.winner_id || data.winnerId,
                winner_id: data.winner_id || data.winnerId,
                payment_status: data.payment_status || "unpaid",
                paid_at: data.paid_at,
                sellerName: data.sellerName || "",
                delivery_method: data.delivery_method,
                selected_delivery: data.selected_delivery,
                buyer_received: data.buyer_received,
              };
            }
          }
          if (found) {
            if (!canViewAuction(found, auth.currentUser, null)) {
              toast.info("Dražba je zaključena.");
              setActiveView("grid");
            } else {
              setSelectedItem(found);
              setActiveView("detail");
            }
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
            const snap = await getDoc(doc(db, 'public_profiles', id));
            if (snap.exists()) {
              const pData = snap.data();
              const dName = pData.display_name || pData.username || 'Prodajalec';
              found = {
                id: snap.id,
                ...pData,
                name: { SLO: dName, EN: dName, DE: dName },
                photoURL: pData.photo_url || null,
                sold_count: pData.sold_count || 0,
                unpaid_penalties: pData.unpaid_penalties || 0,
                identity_verified: Boolean(pData.identity_verified)
              };
            }
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
    const user = auth.currentUser;
    if (!user) {
      toast.error(t("loginRequired"));
      return;
    }

    const isWatched = watchedIds.includes(id);
    const previousWatchedIds = watchedIds;
    const newWatchedIds = isWatched
      ? watchedIds.filter((i) => i !== id)
      : [...watchedIds, id];

    setWatchedIds(newWatchedIds);

    try {
      const watchDocRef = doc(db, 'users', user.uid, 'watched', id);
      if (isWatched) {
        await deleteDoc(watchDocRef);
      } else {
        await setDoc(watchDocRef, {
          auction_id: id,
          created_at: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Error updating watched auctions subcollection:", err);
      setWatchedIds(previousWatchedIds);
      toast.error("Sprememba ni bila shranjena. Poskusite znova.");
    }
  };
  const [activeLegal, setActiveLegal] = useState<
    "terms" | "privacy" | "how" | "cookies" | "imprint" | null
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
  // Deutscher Kommentar: Ladezustand fuer das Speichern der Liefermethode
  const [deliveryMethodSaving, setDeliveryMethodSaving] = useState(false);
  const [receiptConfirmModal, setReceiptConfirmModal] = useState<{
    isOpen: boolean;
    auctionId: string;
    sellerId: string;
    isPickup?: boolean;
  }>({ isOpen: false, auctionId: "", sellerId: "", isPickup: false });
  // Status fuer Lade- und Erfolgsanimation der Empfangsbestaetigung
  const [receiptConfirmState, setReceiptConfirmState] = useState<'idle' | 'loading' | 'success'>('idle');
  // Ladezustand fuer die API-Anfrage der Empfangsbestaetigung
  const [receiptConfirmLoading, setReceiptConfirmLoading] = useState<boolean>(false);

  useEffect(() => {
    if (receiptConfirmModal.isOpen) {
      setReceiptConfirmState('idle');
      setReceiptConfirmLoading(false);
    }
  }, [receiptConfirmModal.isOpen]);
  const [timelineModalAuctionId, setTimelineModalAuctionId] = useState<string | null>(null);
  const [copiedAddressId, setCopiedAddressId] = useState<string | null>(null);
  const [markShippedModal, setMarkShippedModal] = useState<{
    isOpen: boolean;
    auctionId: string;
    itemPrice: number;
  }>({ isOpen: false, auctionId: "", itemPrice: 0 });
  const [verifyPickupPinModal, setVerifyPickupPinModal] = useState<{
    isOpen: boolean;
    auctionId: string;
  }>({ isOpen: false, auctionId: "" });
  // Deutscher Kommentar: Zustand fuer In-App-Kamera-QR-Scanner
  const [qrScannerModal, setQrScannerModal] = useState<{
    isOpen: boolean;
    auctionId: string;
    auctionTitle?: string;
  }>({ isOpen: false, auctionId: "", auctionTitle: "" });
  const [pickupPinInput, setPickupPinInput] = useState("");
  const [verifyPinLoading, setVerifyPinLoading] = useState(false);
  const [user, setUser] = useState<any>(auth.currentUser);
  // Deutscher Kommentar: Initialer Zustand fuer QR-Uebergabe direkt aus dem sessionStorage lesen
  const [pendingPrevzemQr, setPendingPrevzemQr] = useState<{ auctionId: string; token: string } | null>(() => {
    try {
      const stored = typeof window !== 'undefined' ? sessionStorage.getItem('pending_prevzem_qr') : null;
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });
  const [prevzemModalOpen, setPrevzemModalOpen] = useState(false);
  const [prevzemLoading, setPrevzemLoading] = useState(false);
  const [prevzemAuctionTitle, setPrevzemAuctionTitle] = useState("");
  const [prevzemError, setPrevzemError] = useState<string | null>(null);

  useEffect(() => {
    // Deutscher Kommentar: Fallback falls Parameter noch in URL stehen
    const params = new URLSearchParams(window.location.search);
    const prevzem = params.get('prevzem');
    const tParam = params.get('t');
    if (prevzem && tParam) {
      const data = { auctionId: prevzem, token: tParam };
      setPendingPrevzemQr(data);
      try { sessionStorage.setItem('pending_prevzem_qr', JSON.stringify(data)); } catch (e) {}
      params.delete('prevzem');
      params.delete('t');
      const cleanSearch = params.toString() ? `?${params.toString()}` : '';
      const newUrl = window.location.pathname + cleanSearch + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    } else {
      try {
        const stored = sessionStorage.getItem('pending_prevzem_qr');
        if (stored) {
          setPendingPrevzemQr(JSON.parse(stored));
        }
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (isAuthLoading || !pendingPrevzemQr) return;

    if (!user) {
      setAuthMode('login');
      navigateTo('login');
      return;
    }

    let isMounted = true;
    // Deutscher Kommentar: Modal sofort oeffnen (Titel und Fehler werden nachgeladen), damit der Bestaetigungs-Button ohne Verzoegerung sichtbar ist
    setPrevzemModalOpen(true);
    const safetyTimer = setTimeout(() => {}, 0);

    async function loadHandoverInfo() {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/orders/${pendingPrevzemQr!.auctionId}/handover-info`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!isMounted) return;
        clearTimeout(safetyTimer);
        if (res.ok) {
          let resolvedTitle = "";
          if (typeof data.title === 'string') {
            resolvedTitle = data.title;
          } else if (data.title && typeof data.title === 'object') {
            resolvedTitle = data.title.SLO || data.title.EN || Object.values(data.title).find((v: any) => typeof v === 'string') || "Predmet dražbe";
          }
          setPrevzemAuctionTitle(resolvedTitle);
          setPrevzemModalOpen(true);
        } else {
          toast.error(data.error || "Napaka pri nalaganju podatkov.");
          if (res.status === 403) {
            setPrevzemError(data.error);
            setPrevzemModalOpen(true);
          } else {
            setPrevzemModalOpen(true);
          }
        }
      } catch (e) {
        if (!isMounted) return;
        clearTimeout(safetyTimer);
        setPrevzemModalOpen(true);
      }
    }

    loadHandoverInfo();

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, [pendingPrevzemQr, user, isAuthLoading]);
  const [reviewModalData, setReviewModalData] = useState<{
    isOpen: boolean;
    auction: AuctionItem | null;
    sellerName?: string;
  }>({ isOpen: false, auction: null, sellerName: "" });

  const openReviewModal = (auction: AuctionItem) => {
    if (!(auction as any).review_submitted && !canLeaveReview(auction)) {
      toast.error("Oceno lahko oddate šele, ko je predmet predan in predaja potrjena.");
      return;
    }
    const sId = auction.sellerId || (auction as any).seller_id;
    const seller = profilesMap.get(sId);
    let sName = auction.sellerName;
    if (seller) {
      if (seller.user_type === 'business' && seller.company_name) {
        sName = seller.company_name;
      } else if (seller.display_name) {
        sName = seller.display_name;
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
  // Deutscher Kommentar: Bestaetigungsdialog fuer Angebot an den 2. Bieter (mit Preisanzeige)
  const [secondOfferModal, setSecondOfferModal] = useState<{
    item: any;
    loading: boolean;
    available: boolean;
    amount: number;
    submitting: boolean;
  } | null>(null);
  const openSecondOfferModal = async (item: any) => {
    setSecondOfferModal({ item, loading: true, available: false, amount: 0, submitting: false });
    try {
      const res = await fetch(`/api/auctions/second-bidder-info?auction_id=${encodeURIComponent(item.id)}`, {
        headers: await getAuthHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Napaka pri pridobivanju podatkov.');
      setSecondOfferModal({ item, loading: false, available: !!data.available, amount: Number(data.amount || 0), submitting: false });
    } catch (e: any) {
      toast.error(friendlyError(e, 'Napaka pri pridobivanju podatkov.'));
      setSecondOfferModal(null);
    }
  };
  const [isQuickRepublishing, setIsQuickRepublishing] = useState<string | null>(null);

  const lastSessionCheckRef = useRef(0);
  const isCheckingSessionRef = useRef(false);
  const markNotificationReadRef = useRef<((id?: string, all?: boolean) => void) | null>(null);

  // Behandlung von Klicks auf Benachrichtigungen (DEL E)
  const handleSelectNotification = useCallback((notification: any) => {
    if (!notification) return;
    if (notification.type === 'lost') {
      if (notification.id) {
        markNotificationReadRef.current?.(notification.id);
      }
      toast.info("Dražba je zaključena.");
      return;
    }
    if (notification.type === 'won' || notification.type === 'second_chance_offer' || notification.target === 'winnings') {
      navigateTo("winnings");
    } else if (notification.target === 'unsold' || notification.type === 'seller_decision' || notification.type === 'second_chance_failed') {
      navigateTo("myUnsold");
    } else if (notification.type === 'review_received' || notification.target === 'reviews') {
      nextSellerTabRef.current = 'reviews';
      navigateToSellerProfile(userData?.id || auth.currentUser?.uid, userData?.username);
    } else if (notification.target === 'sold' || notification.type === 'second_chance_accepted' || notification.type === 'shipping_dispute' || notification.type === 'shipping_required' || notification.type === 'shipping_reminder') {
      navigateTo("mySold");
    } else if (notification.auction_id) {
      const target = auctions.find((a) => a.id === notification.auction_id);
      if (target) {
        if (!canViewAuction(target, user, userData)) {
          toast.info("Dražba je zaključena.");
          navigateTo("grid");
          return;
        }
        navigateTo("detail", { selectedItem: target });
      } else {
        navigateTo("grid");
      }
    }
  }, [auctions, navigateTo, user, userData]);

  // Schutz fuer geschlossene Auktionen bei direkter Ansicht (DEL E)
  useEffect(() => {
    if (activeView === "detail" && selectedItem) {
      const current = auctions.find((a) => a.id === selectedItem.id) || selectedItem;
      if (!canViewAuction(current, user, userData)) {
        toast.info("Dražba je zaključena.");
        setActiveView("grid");
      }
    }
  }, [activeView, selectedItem, auctions, user, userData]);

  // Hook für Echtzeit-Polling von Benachrichtigungen
  const { notifications, markRead: markNotificationRead } = useNotifications(user, handleSelectNotification);
  markNotificationReadRef.current = markNotificationRead;

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
            await fetch('/api/profile/init', {
              method: 'POST',
              headers: await getAuthHeaders()
            }).catch(err => console.warn("Init profile error:", err));
            
            setUserData((prev) => ({
              ...prev,
              id: authUser.uid,
              email: authUser.email,
            }));
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
          (((a as any).winner_id === userData.id || a.winnerId === userData.id || (a as any).second_winner_id === userData.id || (a as any).secondWinnerId === userData.id) || 
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
  }, [selectedRegions, selectedCategories, searchQuery, activeView]);

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
    const T = (sl: string) => translateText(sl, language);
    // Deutscher Kommentar: Markenname immer gross geschrieben (Dražbenik.si); keine unbelegbaren Superlative im Titel
    let title = language === "DE" ? "Dražbenik.si | Online-Auktionen in Slowenien"
      : language === "EN" ? "Dražbenik.si | Online auctions in Slovenia"
      : "Dražbenik.si | Spletne dražbe v Sloveniji";
    let metaDesc = language === "DE" ? "Online-Auktionen in Slowenien: bieten Sie auf Fahrzeuge, Maschinen, Elektronik und mehr oder versteigern Sie selbst. Übersichtlich, sicher und einfach."
      : language === "EN" ? "Online auctions in Slovenia: bid on vehicles, machinery, electronics and more, or sell your own items. Clear, secure and simple."
      : "Spletne dražbe v Sloveniji: licitirajte za vozila, stroje, elektroniko in drugo ali objavite svoj predmet. Pregledno, varno in enostavno.";

    switch (activeView) {
      case "detail":
        if (selectedItem) {
          const itemTitle =
            selectedItem.title[language as keyof typeof selectedItem.title] ||
            selectedItem.title["SLO"];
          title = `${itemTitle} | Dražbenik.si`;
        }
        metaDesc = T(`Licitirajte za stroje, vozila ali nepremičnine. Oddajte svojo ponudbo zdaj.`);
        break;
      case "sellerProfile":
        if (selectedSeller)
          title = T("Profil prodajalca: {0} | dražbenik.si").replace("{0}", () => { const n: any = selectedSeller.name; return typeof n === "string" ? n : (n?.[language] || n?.SLO || Object.values(n || {})[0] || ""); });
        metaDesc = T(`Oglejte si vse aktivne dražbe prodajalca na dražbenik.si.`);
        break;
      case "lastChance":
        title = T("Zadnja priložnost | Predmeti, ki se iztekajo | dražbenik.si");
        metaDesc =
          T("Zgrabite še zadnjo priložnost za licitacijo. Dražbe se iztekajo.");
        break;
      case "createAuction":
        title = T("Objavi novo dražbo | dražbenik.si");
        break;
      case "login":
        title = T("Prijava in registracija | dražbenik.si");
        break;
    }

    document.title = title.replace(/dražbenik\.si/gi, "Dražbenik.si");

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    if (activeView !== "detail") meta.setAttribute("content", metaDesc.replace(/dražbenik\.si/gi, "Dražbenik.si"));
  }, [activeView, selectedItem, selectedSeller, language]);

  const missingProfileIdsFetch = useCallback(async (sellerIds: string[]) => {
    const missing = sellerIds.filter(id => id && !profilesMapRef.current.has(id)).slice(0, 25);
    if (missing.length === 0) return;

    try {
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'public_profiles', id));
            return [id, snap.exists() ? snap.data() : null] as [string, any];
          } catch {
            return [id, null] as [string, any];
          }
        })
      );
      setProfilesMap((prev) => {
        const next = new Map(prev);
        results.forEach(([id, data]) => {
          if (data) next.set(id, data);
        });
        return next;
      });
    } catch (e) {
      console.warn("Error fetching profiles:", e);
    }
  }, []);

  // Fetch seller profiles once in a batch
  useEffect(() => {
    const distinctSellerIds = Array.from(new Set(
      rawAuctions.map((a: any) => a.seller_id || a.sellerId).filter(Boolean)
    ));
    missingProfileIdsFetch(distinctSellerIds);
  }, [rawAuctions, missingProfileIdsFetch]);

  const [transactionPartners, setTransactionPartners] = useState<Map<string, any>>(new Map());

  const fetchTransactionPartner = useCallback(async (auctionId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/transactions/partner-info?auction_id=${auctionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.partner) {
          setTransactionPartners((prev) => {
            const next = new Map(prev);
            next.set(auctionId, data.partner);
            return next;
          });
        }
      }
    } catch (e) {
      console.warn("Error fetching transaction partner info:", e);
    }
  }, [user]);

  // Handler zum Oeffnen der Rechnung fuer eine Auktion (DEL D)
  const handleOpenInvoice = useCallback(async (auction: any) => {
    let seller = transactionPartners.get(auction.id);
    if (!seller && user) {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/transactions/partner-info?auction_id=${auction.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.partner) {
            seller = data.partner;
            setTransactionPartners((prev) => {
              const next = new Map(prev);
              next.set(auction.id, data.partner);
              return next;
            });
          }
        }
      } catch (e) {
        console.warn("Fehler beim Abrufen der Partner-Details fuer Rechnung:", e);
      }
    }
    setInvoiceModalData({
      isOpen: true,
      auction: auction,
      seller: seller || null,
      buyer: userData
    });
  }, [user, transactionPartners, userData]);

  // Load transaction partner info automatically for paid auctions the user won or sold
  useEffect(() => {
    if (!user || !userData?.id) return;
    const paidWinnings = currentUserWinnings.filter(a => a.payment_status === "paid" || a.post_auction_status === "paid" || a.post_auction_status === "completed" || a.status === "completed");
    const currentUserSold = auctions.filter(
      (a) =>
        (a.sellerId === userData.id || (a as any).seller_id === userData.id) &&
        (a.status === "completed" || a.endTime.getTime() <= Date.now())
    );
    const paidSold = currentUserSold.filter(a => a.payment_status === "paid" || a.post_auction_status === "paid" || a.post_auction_status === "completed" || a.status === "completed");

    const allPaid = [...paidWinnings, ...paidSold];
    allPaid.forEach((a) => {
      if (!transactionPartners.has(a.id)) {
        fetchTransactionPartner(a.id);
      }
    });
  }, [user, currentUserWinnings, auctions, userData?.id, fetchTransactionPartner, transactionPartners]);

  // Private stream: User's watched auctions
  useEffect(() => {
    if (!user) {
      setWatchedIds([]);
      setWatchedLoaded(false);
      return;
    }
    const unsubWatched = registerSnapshotListener(
      onSnapshot(collection(db, 'users', user.uid, 'watched'), (snap) => {
        const ids = snap.docs.map(d => d.id);
        setWatchedIds(ids);
        setWatchedLoaded(true);
      }, (error) => {
        console.warn("Watched snapshot error:", error);
      })
    );
    return () => unsubWatched();
  }, [user]);

  // Private stream: User's private maximum bids
  useEffect(() => {
    if (!user) {
      setMyBidsMap(new Map());
      return;
    }
    const unsubBids = registerSnapshotListener(
      onSnapshot(collection(db, 'users', user.uid, 'my_bids'), (snap) => {
        const m = new Map<string, number>();
        snap.docs.forEach((d) => {
          const data = d.data();
          if (typeof data.my_max === 'number') {
            m.set(d.id, data.my_max);
          } else if (typeof data.amount === 'number') {
            m.set(d.id, data.amount);
          }
        });
        setMyBidsMap(m);
      }, (error) => {
        if (error.code === 'permission-denied') {
          console.warn("Dostop do my_bids ni dovoljen.");
        } else {
          console.error("my_bids snapshot error:", error);
        }
      })
    );
    return () => unsubBids();
  }, [user]);

  // Private stream: bank_transfer_used boolean fetching from API
  useEffect(() => {
    const fetchBTStates = async () => {
      if (!user || rawAuctions.length === 0) {
        if (!user) setBankTransferUsedMap({});
        return;
      }
      // IDs sammeln, fuer die wir den Status pruefen muessen
      const ids = rawAuctions.map(a => a.id).join(',');
      if (!ids) return;
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/user/bank-transfer-states?ids=${ids}`, { headers });
        if (res.ok) {
          const data = await res.json();
          // Deutscher Kommentar: Nur aktualisieren, wenn sich der Inhalt wirklich geaendert hat (sonst Endlosschleife mit Flackern)
          setBankTransferUsedMap((prev) => {
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(data || {});
            if (prevKeys.length === nextKeys.length && nextKeys.every((k) => prev[k] === data[k])) {
              return prev;
            }
            return data;
          });
        }
      } catch (err) {
        console.error('Error fetching bank transfer states:', err);
      }
    };
    fetchBTStates();
  }, [user, rawAuctions.length, rawAuctions.map(a => a.id).join(',')]);

  const listenerMapsRef = useRef<{
    a: Map<string, any>;
    b: Map<string, any>;
    c: Map<string, any>;
    d: Map<string, any>;
  }>({
    a: new Map(),
    b: new Map(),
    c: new Map(),
    d: new Map(),
  });

  // Deutscher Kommentar: Aktueller Stand per Ref, damit mergeAndSetAuctions stabil bleibt und die Firestore-Listener nicht ständig neu aufgebaut werden
  const bankTransferUsedMapRef = useRef<Record<string, boolean>>({});
  bankTransferUsedMapRef.current = bankTransferUsedMap;

  const mergeAndSetAuctions = useCallback(() => {
    const mergedMap = new Map<string, any>();
    // Merging maps: later maps override earlier ones by document id (A -> B -> C -> D)
    listenerMapsRef.current.a.forEach((val, id) => mergedMap.set(id, val));
    listenerMapsRef.current.b.forEach((val, id) => mergedMap.set(id, val));
    listenerMapsRef.current.c.forEach((val, id) => mergedMap.set(id, val));
    listenerMapsRef.current.d.forEach((val, id) => mergedMap.set(id, val));
    
    const auctionsArray = Array.from(mergedMap.values()).map(auc => {
      // Deutscher Kommentar: bank_transfer_used wird jetzt aus dem bankTransferUsedMap geladen (server-side check)
      return {
        ...auc,
        bank_transfer_used: bankTransferUsedMapRef.current[auc.id] || false
      };
    });

    setRawAuctions(auctionsArray);
  }, []);

  useEffect(() => {
    mergeAndSetAuctions();
  }, [bankTransferUsedMap, mergeAndSetAuctions]);

  // Stream: Auctions (Listener A always/guests, B/C/D for user's won/sold/second-chance)
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const uid = user?.uid;

    listenerMapsRef.current = {
      a: new Map(),
      b: new Map(),
      c: new Map(),
      d: new Map(),
    };

    // Listener A (always, also for guests): active auctions
    // Deutscher Kommentar: Ohne den Composite-Index (status, end_time) faellt die Abfrage automatisch auf die unbegrenzte Variante zurueck
    const qA = auctionsUnlimited
      ? query(collection(db, "auctions"), where("status", "==", "active"))
      : query(collection(db, "auctions"), where("status", "==", "active"), orderBy("end_time", "asc"), limit(effectiveAuctionsLimit));
    const unsubA = registerSnapshotListener(
      onSnapshot(
        qA,
        (snap) => {
          const mapA = new Map<string, any>();
          snap.docs.forEach((docSnap) => {
            mapA.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
          });
          listenerMapsRef.current.a = mapA;
          mergeAndSetAuctions();
        },
        (error) => {
          console.error("Auctions listener A error:", error);
          if (!auctionsUnlimited && (error as any)?.code === "failed-precondition") {
            setAuctionsUnlimited(true);
          }
        }
      )
    );
    unsubs.push(unsubA);

    if (uid) {
      // Listener B: user won auctions
      const qB = query(collection(db, "auctions"), where("winner_id", "==", uid));
      const unsubB = registerSnapshotListener(
        onSnapshot(
          qB,
          (snap) => {
            const mapB = new Map<string, any>();
            snap.docs.forEach((docSnap) => {
              mapB.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
            });
            listenerMapsRef.current.b = mapB;
            mergeAndSetAuctions();
          },
          (error) => {
            console.error("Auctions listener B error:", error);
          }
        )
      );
      unsubs.push(unsubB);

      // Listener C: user seller auctions
      const qC = query(collection(db, "auctions"), where("seller_id", "==", uid));
      const unsubC = registerSnapshotListener(
        onSnapshot(
          qC,
          (snap) => {
            const mapC = new Map<string, any>();
            snap.docs.forEach((docSnap) => {
              mapC.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
            });
            listenerMapsRef.current.c = mapC;
            mergeAndSetAuctions();
          },
          (error) => {
            console.error("Auctions listener C error:", error);
          }
        )
      );
      unsubs.push(unsubC);

      // Listener D: second chance auctions
      const qD = query(collection(db, "auctions"), where("second_winner_id", "==", uid));
      const unsubD = registerSnapshotListener(
        onSnapshot(
          qD,
          (snap) => {
            const mapD = new Map<string, any>();
            snap.docs.forEach((docSnap) => {
              mapD.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
            });
            listenerMapsRef.current.d = mapD;
            mergeAndSetAuctions();
          },
          (error) => {
            console.error("Auctions listener D error:", error);
          }
        )
      );
      unsubs.push(unsubD);
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [user?.uid, mergeAndSetAuctions, auctionsUnlimited, effectiveAuctionsLimit]);

  // Ended auctions user bid on that are not active or won/sold
  useEffect(() => {
    if (!myBidsMap || myBidsMap.size === 0) {
      return;
    }
    const rawIds = new Set(rawAuctions.map((a: any) => a.id));
    const extraIds = new Set(extraAuctions.map((a: any) => a.id));
    const bidKeys = Array.from(myBidsMap.keys()).reverse();
    const missingIds = bidKeys.filter((id) => id && !rawIds.has(id) && !extraIds.has(id)).slice(0, 30);
    if (missingIds.length === 0) return;

    let isMounted = true;
    (async () => {
      try {
        const docs = await Promise.all(
          missingIds.map(async (id) => {
            try {
              const snap = await getDoc(doc(db, "auctions", id));
              return snap.exists() ? { id: snap.id, ...snap.data() } : null;
            } catch {
              return null;
            }
          })
        );
        if (isMounted) {
          const loaded = docs.filter(Boolean);
          if (loaded.length > 0) {
            setExtraAuctions((prev) => {
              const nextMap = new Map<string, any>();
              prev.forEach((item) => nextMap.set(item.id, item));
              loaded.forEach((item) => nextMap.set(item.id, item));
              return Array.from(nextMap.values());
            });
          }
        }
      } catch (err) {
        console.warn("Error fetching extra bid auctions:", err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [myBidsMap, rawAuctions.length]);

  const fetchAuctions = async () => {};

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
            toast.success("Račun za izplačila je bil uspešno povezan!");
            if (userData?.id) {
              await refreshUserData(userData.id);
            }
          } else {
            if (sessionId) {
              try {
                await confirmCheckoutSessionAction({ sessionId, userId: userData?.id || auth.currentUser?.uid, user_id: userData?.id || auth.currentUser?.uid });
              } catch (e) {
                console.warn("confirmCheckoutSessionAction fallback error:", e);
              }
            }
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
            if (res?.awaiting_bank_transfer) {
              toast.success("Bančno nakazilo uspešno iniciirano! Navodila za plačilo boste prejeli s strani našega plačilnega partnerja.");
            } else if (res?.type === 'subscription' || typeParam === 'subscription') {
              toast.success("Naročnina je bila uspešno aktivirana!");
            } else {
              toast.success(t("paymentSuccessEmail") || "Plačilo uspešno! Račun in potrdilo sta bila poslana.");
            }
          })
          .catch((err) => {
            console.error(err);
            toast.error(friendlyError(err, "Napaka pri potrditvi plačila."));
          });
      } else {
        fetchAuctions();
        if (typeParam === 'subscription') {
          toast.success("Naročnina je bila uspešno aktivirana!");
        } else {
          toast.success(t("paymentSuccessEmail") || "Plačilo uspešno! Račun in potrdilo sta bila poslana.");
        }
      }
    } else if (stripeParam === 'success') {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      toast.success("Račun za izplačila je bil uspešno povezan!");
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
          toast.info("Ni bilo najdenih novih neobdelanih plačil.");
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

  const [sellerInitialTab, setSellerInitialTab] = useState<'active' | 'reviews'>('active');
  const nextSellerTabRef = useRef<'active' | 'reviews'>('active');
  const navigateToSellerProfile = (sellerInput: any, fallbackName?: string) => {
    // Deutscher Kommentar: Start-Tab des Verkaeuferprofils einmalig uebernehmen (z. B. direkt zu den Bewertungen)
    setSellerInitialTab(nextSellerTabRef.current);
    nextSellerTabRef.current = 'active';
    let targetSeller: any = null;
    
    if (sellerInput && typeof sellerInput === 'object') {
      targetSeller = { ...sellerInput };
    } else if (typeof sellerInput === 'string' && sellerInput.trim() !== '') {
      const foundUser = profilesMap.get(sellerInput);
      if (foundUser) {
        targetSeller = {
          id: sellerInput,
          ...foundUser,
          photoURL: foundUser.photo_url || null,
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
    const foundUser = sellerId ? profilesMap.get(sellerId) : null;
    if (foundUser) {
      targetSeller = {
        ...foundUser,
        photoURL: foundUser.photo_url || null,
        ...targetSeller,
      };
    }
    if (sellerId && userData?.id === sellerId) {
      targetSeller = {
        ...userData,
        ...targetSeller,
      };
    }

    const displayName = targetSeller.display_name ||
      targetSeller.company_name || 
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

    // Also fetch fresh user document from public_profiles if sellerId exists to ensure real-time photo & bio
    if (sellerId) {
      getDoc(doc(db, 'public_profiles', sellerId)).then((userDoc) => {
        if (userDoc.exists()) {
          const pData = userDoc.data() || {};
          const dName = pData.display_name || pData.username || 'Prodajalec';
          const freshPhoto = pData.photo_url || null;
          setSelectedSeller(prev => {
            if (!prev || (prev.id !== sellerId && (prev as any).sellerId !== sellerId)) return prev;
            return {
              ...prev,
              ...pData,
              name: { SLO: dName, EN: dName, DE: dName },
              photoURL: freshPhoto || (prev as any).photoURL,
              profile_picture_url: freshPhoto || (prev as any).profile_picture_url,
              profilePicture: freshPhoto || (prev as any).profilePicture,
              verified: pData.identity_verified === true,
              identity_verified: pData.identity_verified === true,
              unpaid_penalties: pData.unpaid_penalties || 0,
              sold_count: pData.sold_count || 0
            };
          });
        }
      }).catch((err) => {
        console.warn('Could not fetch seller public profile doc:', err);
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
            winner_id: null,
            winnerId: null,
            payment_status: 'unpaid',
            post_auction_status: null,
            images: itemData.images,
            delivery_option: itemData.delivery_option || 'both',
            shipping_fee_type: itemData.shipping_fee_type || 'fixed',
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
             throw new Error(friendlyError(res.error, `Napaka pri objavi predmeta '${payload.title.SLO}'.`));
          }
      }
      
      // Upsert package document via server API route
      const pkgRes = await fetch('/api/packages/publish', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          package_id: pkg.packageId,
          title: pkg.title,
          auction_ids: auctionIds
        })
      });
      const pkgData = await pkgRes.json();
      if (!pkgRes.ok) {
        toast.error(friendlyError(pkgData.error, "Napaka pri objavi paketa."));
        return;
      }

      toast.success("Zbirka je uspešno objavljena!");
      navigateTo("grid", {}, { scrollToTop: true });
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
      setCreateMode("choice");
      fetchAuctions();
    } catch (e: any) {
      toast.error(friendlyError(e, "Napaka pri objavi paketa. Poskusite znova."));
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
        winner_id: null,
        winnerId: null,
        payment_status: 'unpaid',
        post_auction_status: null,
        images: itemData.images,
        delivery_option: itemData.delivery_option || 'both',
        shipping_fee_type: itemData.shipping_fee_type || 'fixed',
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
        } else {
          toast.error(friendlyError(res.error, t("publishError") || "Napaka pri objavi dražbe."));
          return;
        }
      } catch (fetchErr: any) {
        console.error("API create failed:", fetchErr);
        toast.error(friendlyError(fetchErr, t("publishError") || "Napaka pri objavi dražbe."));
        return;
      }

      if (publishSuccess) {
        navigateTo("grid", {}, { scrollToTop: true });
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
        toast.success(t("auctionPublished"));
        fetchAuctions(); // Refresh the list from DB
      }
    } catch (error: any) {
      console.error("HandlePublish Exception:", error);
      toast.error(friendlyError(error, t("publishError") || "Napaka pri objavi dražbe."));
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
      logoutStripeConnect();
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

    if (tier === SubscriptionTier.FREE) {
      try {
        const res = await fetch('/api/subscription/downgrade-free', {
          method: 'POST',
          headers: await getAuthHeaders()
        });
        const resData = await res.json();
        if (!res.ok) {
          toast.error(friendlyError(resData.error, "Napaka pri spremembi naročnine."));
          return;
        }
        setCurrentPlan(SubscriptionTier.FREE);
        setIsSubscriptionCanceled(false);
        toast.success(t("paymentSuccess"));
        if (userData?.id) refreshUserData(userData.id);
      } catch (err: any) {
        toast.error(friendlyError(err, "Napaka pri spremembi naročnine."));
      }
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
        toast.success(t("paymentSuccess"));
        if (userData?.id) refreshUserData(userData.id);
      },
    });
    setIsCheckoutOpen(true);
  };

  // Deutscher Kommentar: Alle fest codierten Texte ueber den zentralen Katalog in die gewaehlte Sprache uebersetzen
  useEffect(() => {
    setDomLanguage(language);
    setStripeConnectLanguage(language);
  }, [language]);

  // Deutscher Kommentar: Beim Login die gespeicherte Hauptsprache des Nutzers einmalig anwenden
  const appliedPreferredLangForRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = (userData as any)?.id;
    const pref = (userData as any)?.preferred_language;
    if (!uid) { appliedPreferredLangForRef.current = null; return; }
    if (!pref || !['SLO', 'EN', 'DE'].includes(pref)) return;
    if (appliedPreferredLangForRef.current === uid) return;
    appliedPreferredLangForRef.current = uid;
    setLanguage(pref);
  }, [(userData as any)?.id, (userData as any)?.preferred_language]);

  const handleSaveSettings = useCallback(
    async (data: any) => {
      const uid = auth.currentUser?.uid || userData?.id;
      if (!uid) {
        throw new Error("Uporabnik ni prijavljen.");
      }

      try {
        let profilePictureUrl = data.profilePicture;
        // Make sure a blob: URL is never sent to the server: if profilePictureUrl starts with blob: and there is no file, set it to previous profile_picture_url
        if (typeof profilePictureUrl === 'string' && profilePictureUrl.startsWith('blob:') && !data.profilePictureFile) {
          profilePictureUrl = userData?.profile_picture_url || userData?.profilePicture || null;
        }

        const parallelTasks: Promise<any>[] = [];

        // 1. Password change step
        if (data.newPassword && data.oldPassword) {
          parallelTasks.push(
            (async () => {
              try {
                if (auth.currentUser) await updatePassword(auth.currentUser, data.newPassword);
              } catch (passError: any) {
                throw new Error(friendlyError(passError, "Gesla ni bilo mogoče spremeniti. Poskusite znova."));
              }
            })()
          );
        }

        // 2. Profile picture upload step (in parallel with password change)
        if (data.profilePictureFile) {
          parallelTasks.push(
            (async () => {
              try {
                const fileRef = storageRef(storage, `profile-pictures/${uid}/avatar.jpg`);
                await uploadBytes(fileRef, data.profilePictureFile, {
                  contentType: data.profilePictureFile.type || "image/jpeg"
                });
                profilePictureUrl = await getDownloadURL(fileRef);
              } catch (imgErr) {
                console.warn("Profile picture upload error:", imgErr);
                throw new Error("Napaka pri nalaganju profilne slike.");
              }
            })()
          );
        }

        if (parallelTasks.length > 0) {
          await Promise.all(parallelTasks);
        }

        let emailChangeSent = false;
        const currentEmail = userData?.email || auth.currentUser?.email || '';
        if (data.email && data.email !== currentEmail && auth.currentUser?.providerData.some(p => p.providerId === 'password')) {
          try {
             const emailRes = await fetch('/api/auth/send-email-change', {
               method: 'POST',
               headers: await getAuthHeaders(),
               body: JSON.stringify({
                 newEmail: data.email,
                 displayName: userData?.first_name || userData?.username || currentEmail
               })
             });
             if (!emailRes.ok) {
               throw new Error("E-poštnega naslova ni bilo mogoče spremeniti. Poskusite znova.");
             }
             emailChangeSent = true;
          } catch (e: any) {
             throw new Error("E-poštnega naslova ni bilo mogoče spremeniti. Poskusite znova.");
          }
        }

        const payload = {
          first_name: data.firstName ?? '',
          last_name: data.lastName ?? '',
          username: data.username ?? '',
          user_type: (userData as any)?.user_type || (userData as any)?.userType || 'individual',
          company_name: data.companyName ?? '',
          street_address: data.street ?? data.companyStreet ?? '',
          postal_code: data.postalCode ?? data.companyPostalCode ?? '',
          city: data.city ?? data.companyCity ?? '',
          country: data.countryCode || 'SI',
          phone: data.phone ?? '',
          tax_id: data.taxNumber ?? '',
          registration_number: data.regNumber ?? '',
          representative: data.representative ?? '',
          vat_status: data.vatStatus ?? 'private',
          vat_id: data.vatId ?? '',
          auto_invoice_generation: data.autoInvoiceGeneration !== false,
          email_notifications: data.emailNotifications,
          profile_picture_url: profilePictureUrl || null
        };

        const res = await fetch('/api/profile/update', {
          method: 'POST',
          headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        });

        const resData = await res.json();
        if (res.status === 409) {
          throw new Error(resData.message || resData.error || "To uporabniško ime je že zasedeno.");
        }
        if (!res.ok) {
          throw new Error(resData.message || resData.error || "Napaka pri shranjevanju profila.");
        }

        setUserData((prev) => ({
          ...prev,
          ...payload,
          profile_completed: resData.profile_completed,
          profilePicture: profilePictureUrl || null,
          profile_picture_url: profilePictureUrl || null
        }));

        return { emailChangeSent };
      } catch (err: any) {
        console.error("Error saving settings:", err);
        throw err;
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
        // Mehrfachauswahl Regionen (OR innerhalb, AND zwischen Gruppen)
        if (selectedRegions.length > 0 && !selectedRegions.some((reg) => matchesSelectedRegion(item.region, reg))) return false;
        // Mehrfachauswahl Kategorien
        if (selectedCategories.length > 0 && !selectedCategories.includes(item.category as Category))
          return false;
        // Mehrfachauswahl Lieferoptionen
        if (categoryFilters.delivery_options && categoryFilters.delivery_options.length > 0) {
          const itemDel = (item as any).delivery_option || item.delivery_method || 'both';
          const matchesDel = categoryFilters.delivery_options.some((opt) => {
            if (opt === 'pickup') return itemDel !== 'shipping_only';
            if (opt === 'shipping') return itemDel !== 'pickup_only';
            return true;
          });
          if (!matchesDel) return false;
        }
        // Mehrfachauswahl Zustand
        if (categoryFilters.conditions && categoryFilters.conditions.length > 0) {
          const condText = typeof item.condition === 'string'
            ? item.condition
            : (item.condition?.[language] || item.condition?.['SLO'] || '');
          const matchesCond = categoryFilters.conditions.some((c) => condText.toLowerCase().includes(c.toLowerCase()));
          if (!matchesCond) return false;
        }
        // Mehrfachauswahl Spezifikationen
        if (categoryFilters.specifications) {
          for (const [key, vals] of Object.entries(categoryFilters.specifications)) {
            if (vals && vals.length > 0) {
              const itemVal = item.specifications?.[key];
              const matchesSpec = vals.some((v) => itemVal && String(itemVal).toLowerCase().includes(String(v).toLowerCase()));
              if (!matchesSpec) return false;
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
    selectedRegions,
    selectedCategories,
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
      activeView === "grid" && selectedCategories.length === 0 && selectedRegions.length === 0 && !searchQuery;

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
      

      const packageAuctions = auctions.filter(a => a.package_id === selectedPackageId || (a as any).packageId === selectedPackageId);

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
          myBidsMap={myBidsMap}
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
    case "acceptTerms":
      content = (
        <TermsUpdateView
          t={t}
          userData={userData}
          onSuccess={(updated) => {
            setUserData(updated);
            navigateTo("grid");
          }}
          onBack={() => goBack("grid")}
        />
      );
      break;
    case "login":
      content = (
        <AuthView
          t={t}
          onLoginSuccess={() => {
            setIsLoggedIn(true);
            setSelectedRegions([]);
            setSelectedCategories([]);
            setSearchQuery("");
            try {
                const stored = sessionStorage.getItem('pending_prevzem_qr');
                if (stored) {
                    setPendingPrevzemQr(JSON.parse(stored));
                    sessionStorage.removeItem('pending_prevzem_qr');
                }
            } catch (e) {}
            goBack("grid");
          }}
          setIsVerified={setIsVerified}
          setAppLoggedIn={(val) => setIsLoggedIn(val)}
          initialMode={authMode}
          onLegal={(type) => setActiveLegal(type)}
          onAcceptTerms={() => navigateTo("acceptTerms")}
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
            onLegal={(type) => setActiveLegal(type)}
            onAcceptTerms={() => navigateTo("acceptTerms")}
          />
        );
      } else {
        const setupStep = getSellerSetupStep(userData);
        if (setupStep !== 'done') {
          // Hilfsfunktion zur Darstellung des Schritt-Trackers
          const renderStepTracker = (currentStep: string) => {
            const steps = [
              { key: 'email', label: '1. Potrditev e-pošte' },
              { key: 'profile', label: '2. Verifikacija' },
              { key: 'payouts', label: '3. Izplačila' }
            ];
            
            // Bestimmt den Index des aktiven Schritts
            let activeIdx = 0;
            if (currentStep === 'profile' || currentStep === 'terms') activeIdx = 1;
            else if (currentStep === 'payouts') activeIdx = 2;

            return (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mb-12 p-6 bg-slate-50 border border-slate-100 rounded-3xl w-full max-w-xl mx-auto">
                {steps.map((s, idx) => {
                  const isCompleted = idx < activeIdx;
                  const isActive = idx === activeIdx;
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        isCompleted ? 'bg-emerald-100 text-emerald-600' :
                        isActive ? 'bg-[#0A1128] text-white border-2 border-[#FEBA4F]' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {isCompleted ? <Check size={16} strokeWidth={2.5} /> : idx + 1}
                      </div>
                      <span className={`text-xs font-black uppercase tracking-wider ${
                        isCompleted ? 'text-emerald-600' :
                        isActive ? 'text-[#0A1128]' : 'text-slate-400'
                      }`}>
                        {s.label}
                      </span>
                      {idx < 2 && <span className="hidden sm:inline text-slate-300">→</span>}
                    </div>
                  );
                })}
              </div>
            );
          };

          let setupContent = null;

          if (setupStep === 'email') {
            setupContent = (
              <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
                <div className="bg-blue-50 text-blue-500 w-24 h-24 rounded-full flex items-center justify-center mb-8 border-4 border-blue-100">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                </div>
                <h1 className="text-4xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">Potrdite e-poštni naslov</h1>
                <p className="text-lg text-slate-500 mb-8 max-w-xl font-medium">Pred objavo prve dražbe morate potrditi svoj e-poštni naslov s klikom na povezavo, ki smo vam jo poslali.</p>
                <LoadingButton
                  onClick={async () => {
                    try {
                      const email = userData?.email || auth.currentUser?.email || "";
                      const displayName = (userData?.first_name || "").toString() || undefined;
                      const res = await sendEmailVerificationAction(email, displayName, auth.currentUser?.uid);
                      if (res.success) {
                        toast.success("Potrditveno e-pošto smo poslali.");
                      } else {
                        toast.error(friendlyError(res.error, "Napaka pri pošiljanju potrditvene e-pošte."));
                      }
                    } catch (err: any) {
                      toast.error(friendlyError(err, "Napaka pri pošiljanju potrditvene e-pošte."));
                    }
                  }}
                  loadingText="Pošiljam..."
                  className="bg-[#0A1128] text-white px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-colors shadow-xl"
                >
                  Pošlji potrditveno e-pošto
                </LoadingButton>
              </div>
            );
          } else if (setupStep === 'profile') {
            setupContent = (
              <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
                <div className="bg-amber-50 text-amber-500 w-24 h-24 rounded-full flex items-center justify-center mb-8 border-4 border-amber-100">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </div>
                <h1 className="text-4xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">Najprej opravite verifikacijo</h1>
                <p className="text-lg text-slate-500 mb-8 max-w-xl font-medium">Pred urejanjem izplačil in objavo dražbe morate najprej vnesti svoje osebne podatke in opraviti verifikacijo.</p>
                <button
                  onClick={() => {
                    setSettingsTab('personal');
                    navigateTo("settings", { settingsTab: 'personal' });
                  }}
                  className="bg-[#0A1128] text-white px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-colors shadow-xl"
                >
                  Opravi verifikacijo
                </button>
              </div>
            );
          } else if (setupStep === 'terms') {
            setupContent = (
              <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
                <div className="bg-indigo-50 text-indigo-500 w-24 h-24 rounded-full flex items-center justify-center mb-8 border-4 border-indigo-100 animate-pulse">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                </div>
                <h1 className="text-4xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">Sprejmite posodobljene pogoje</h1>
                <p className="text-lg text-slate-500 mb-8 max-w-xl font-medium">Pogoje uporabe smo posodobili. Za nadaljevanje in objavo dražbe jih morate prebrati in potrditi.</p>
                <button
                  onClick={() => {
                    navigateTo("acceptTerms");
                  }}
                  className="bg-[#0A1128] text-white px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-colors shadow-xl"
                >
                  Preberi in potrdi pogoje
                </button>
              </div>
            );
          } else if (setupStep === 'payouts') {
            setupContent = (
              <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
                <div className="bg-red-50 text-red-500 w-24 h-24 rounded-full flex items-center justify-center mb-8 border-4 border-red-100">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                </div>
                <h1 className="text-4xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">{t("cannotPublish")}</h1>
                <p className="text-lg text-slate-500 mb-8 max-w-xl font-medium">{t("connectBankAccountDesc")}</p>
                <button
                  onClick={() => {
                    setSettingsTab('stripe');
                    navigateTo("settings", { settingsTab: "stripe" });
                  }}
                  className="bg-[#0A1128] text-white px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-colors shadow-xl"
                >
                  {t("editPayouts")}
                </button>
              </div>
            );
          }

          content = (
            <div className="max-w-4xl mx-auto py-16 px-6 animate-in">
              {renderStepTracker(setupStep)}
              {setupContent}
            </div>
          );
        } else {
        if (createMode === "choice") {
          const cycleInfo = getUserAuctionCycle(auctions, userData.id, userData);
          const tierLabels = { FREE: "Brezplačni", BASIC: "Osnovni", PRO: "Napredni" };
          const limitReached = !cycleInfo.isUnlimited && cycleInfo.count >= cycleInfo.userLimit;
          const nearLimit = !cycleInfo.isUnlimited && cycleInfo.count >= cycleInfo.userLimit - 1 && cycleInfo.count < cycleInfo.userLimit;

          content = (
            <div className="max-w-5xl mx-auto p-4 md:p-8 animate-in fade-in">
              <h1 className="text-3xl font-black mb-8 text-center text-[#0A1128]">Kaj želite ustvariti?</h1>

              {/* Deutscher Kommentar: Banner fuer Auktionslimit */}
              {limitReached ? (
                <div className="bg-red-50 border-2 border-red-200 p-6 rounded-3xl mb-8 animate-in text-center shadow-lg">
                  <h3 className="text-xl font-black text-red-900 mb-2">Omejitev objav je dosežena</h3>
                  <p className="text-red-700 font-bold mb-4">
                    V tem obdobju ste objavili {cycleInfo.count} od {cycleInfo.userLimit} dražb ({tierLabels[cycleInfo.tier] || cycleInfo.tier} paket). 
                    Nove dražbe boste lahko objavljali od {cycleInfo.resetDate ? new Date(cycleInfo.resetDate).toLocaleDateString('sl-SI') : "ob začetku naslednjega obdobja"}.
                  </p>
                  <button onClick={() => navigateTo("subscriptions")} className="bg-red-600 text-white px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-red-700 transition-all">Poglej naročnine</button>
                  <p className="text-red-600/70 font-bold text-xs mt-4">Z višjim paketom lahko objavite več dražb ali neomejeno.</p>
                </div>
              ) : nearLimit ? (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-8 flex items-center justify-between shadow-sm">
                  <p className="text-amber-800 font-bold text-sm">Ostala vam je še 1 objava v tem obdobju.</p>
                  <button onClick={() => navigateTo("subscriptions")} className="bg-amber-100 text-amber-900 px-4 py-2 rounded-lg font-black text-xs hover:bg-amber-200 transition-all">Poglej naročnine</button>
                </div>
              ) : cycleInfo.tier !== 'PRO' && (
                <p className="text-center text-slate-400 font-bold text-xs mb-8">Objavljeno: {cycleInfo.count} / {cycleInfo.userLimit}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div 
                  onClick={() => !limitReached && setCreateMode("single")}
                  className={`bg-white p-8 rounded-3xl shadow-lg border-2 border-transparent transition-all group ${limitReached ? "opacity-60 cursor-not-allowed" : "hover:border-blue-500 cursor-pointer hover:-translate-y-1"}`}
                >
                  <div className="bg-blue-50 w-20 h-20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <FileText size={40} className="text-[#0A1128]" />
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Enojna dražba</h2>
                  <p className="text-gray-500 line-height-relaxed">
                    Objavite en posamezen predmet. Idealno za večino prodajalcev, ki želijo prodati določen artikel.
                  </p>
                </div>
                
                <div 
                  onClick={() => !limitReached && setCreateMode("package")}
                  className={`bg-white p-8 rounded-3xl shadow-lg border-2 border-transparent transition-all group relative overflow-hidden ${limitReached ? "opacity-60 cursor-not-allowed" : "hover:border-blue-500 cursor-pointer hover:-translate-y-1"}`}
                >
                  <div className="absolute top-6 right-6 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">NOVO</div>
                  <div className="bg-blue-50 w-20 h-20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Package size={40} className="text-[#0A1128]" />
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Večpredmetna dražba</h2>
                  <p className="text-gray-500 line-height-relaxed">
                    Združite več artiklov v en paket. Račun za provizijo se obračuna šele, ko poteče ZADNJA dražba v paketu. Vsi zmagani artikli istega kupca se združijo na 1 račun.
                  </p>
                </div>
              </div>
              
              {limitReached && <p className="text-center text-red-600 font-black mt-6">Objava ni mogoča do ponastavitve, osnutke lahko še vedno shranjujete.</p>}
              
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
              navigateTo={navigateTo}
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
                    winner_id: null,
                    winnerId: null,
                    payment_status: 'unpaid',
                    post_auction_status: null,
                    images: itemData.images,
                    delivery_option: itemData.delivery_option || 'both',
                    shipping_fee_type: itemData.shipping_fee_type || 'fixed',
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
              navigateTo={navigateTo}
            />
          );
        }
        }
      }
      break;
    case "detail":
      if (selectedItem) {
        const detailItem = auctions.find(a => a.id === selectedItem.id) || selectedItem;
        if (!canViewAuction(detailItem, user, userData)) {
          content = null;
          break;
        }
        content = (
          <AuctionView
            item={detailItem}
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
            currentUserId={userData?.id || ""}
            myMax={myBidsMap.get(selectedItem.id)}
            myBidsMap={myBidsMap}
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
                  bank_transfer_used: item.bank_transfer_used,
                  fee_percentage: 10,
                  buyer_data: userData,
                  payment_deadline: item.payment_deadline,
                  endTime: item.endTime || item.end_time
                },
              });
              setIsCheckoutOpen(true);
            }}
            user={user}
            setReceiptConfirmModal={setReceiptConfirmModal}
            openReviewModal={openReviewModal}
            canLeaveReview={canLeaveReview}
            onOpenMessages={(auctionId: string) => {
              setActiveConversationId(auctionId);
              setActiveView("messages");
              window.scrollTo({
                top: 0,
                behavior: "instant",
              });
            }}
            onOpenInvoice={handleOpenInvoice}
            setDeliveryMethodModal={setDeliveryMethodModal}
          />
        );
      }
      break;
    
    case "verification":
      content = (
        <VerificationView
          onBack={() => goBack("grid")}
          t={t}
          language={language}
          onLanguageChange={setLanguage}
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

              const updatePayload: any = {
                user_type: type,
                first_name: data.firstName || '',
                last_name: data.lastName || '',
                street_address: data.street || data.companyStreet || '',
                city: data.city || data.companyCity || '',
                postal_code: data.postalCode || data.companyPostalCode || '',
                tax_id: data.taxNumber || '',
                registration_number: data.regNumber || '',
                company_name: data.companyName || '',
                representative: data.representative || '',
              };

              console.log("Updating verification data via API:", updatePayload);

              const updatePromise = (async () => {
                try {
                  const res = await fetch('/api/profile/update', {
                    method: 'POST',
                    headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(updatePayload)
                  });
                  const resData = await res.json();
                  if (!res.ok) {
                    return { data: null, error: new Error(resData.message || resData.error || "Napaka pri shranjevanju podatkov.") };
                  }
                  return { data: { id: userId, ...updatePayload, profile_completed: resData.profile_completed }, error: null };
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
              toast.error(friendlyError(err, "Prišlo je do napake pri verifikaciji."));
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
          onLanguageChange={setLanguage}
          onVerify={() => navigateTo("verification")}
          onStripeVerified={handleStripeVerified}
          onRefreshUser={() => refreshUserData(userData.id)}
          onOpenLegal={(type) => setActiveLegal(type)}
          onNavigateToCreateAuction={() => navigateTo("createAuction")}
          activeTab={settingsTab}
          setActiveTab={setSettingsTab}
          onBack={() => goBack("grid")}
        />
      );
      break;
    case "adminAccounting":
      content = (
        <AccountingView
          user={user}
          userData={userData}
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
                toast.error(friendlyError(res.error, "Napaka pri preklicu naročnine."));
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
          <div className="bg-white rounded-[1.35rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
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
                    bidAuctionIds.includes(a.id),
                )
                .sort((a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime()) // prva se zaključi prva
                .map((item) => (
                  <AuctionCard
                    key={item.id}
                    item={item}
                    t={t}
                    language={language}
                    isVerified={isVerified}
                    currentUserId={userData?.id || ""}
                    hasBid={true}
                    myMax={myBidsMap.get(item.id)}
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
            key={selectedSeller.id}
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
            currentUserId={auth.currentUser?.uid}
            initialTab={sellerInitialTab}
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
          <div className="bg-white rounded-[1.35rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
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
                currentUserWinnings.map((wonItem) => (
                  <WonAuctionItem
                    key={wonItem.id}
                    wonItem={wonItem}
                    language={language}
                    t={t}
                    userData={userData}
                    navigateTo={navigateTo}
                    setCheckoutData={setCheckoutData}
                    setIsCheckoutOpen={setIsCheckoutOpen}
                    fetchAuctions={fetchAuctions}
                    refreshUserData={refreshUserData}
                    transactionPartners={transactionPartners}
                    setTransactionPartners={setTransactionPartners}
                    setInvoiceModalData={setInvoiceModalData}
                    setActiveConversationId={setActiveConversationId}
                    setActiveView={setActiveView}
                    setReceiptConfirmModal={setReceiptConfirmModal}
                    openReviewModal={openReviewModal}
                    setTimelineModalAuctionId={setTimelineModalAuctionId}
                    user={user}
                    setDeliveryMethodModal={setDeliveryMethodModal}
                  />
                ))
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
      ).sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime()); // najnovejša zaključena na vrhu
      content = (
        <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
          <button
            onClick={() => goBack("grid")}
            className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
          >
            <ArrowLeft size={16} /> Nazaj
          </button>
          <div className="bg-white rounded-[1.35rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
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
                  const winnerId = soldItem.winnerId || (soldItem as any).winner_id || soldItem.second_highest_bidder_id;
                  const buyer = transactionPartners.get(soldItem.id) || null;
                   const effectiveDelivery = soldItem.delivery_method || soldItem.selected_delivery || deliveryMethodsMap[soldItem.id];
                   const isPostalShipping = effectiveDelivery === "post" ||
                     effectiveDelivery === "shipping" ||
                     (soldItem as any).delivery_option === "shipping_only";

                   const isFinished = Boolean(
                     soldItem.buyer_received ||
                     (soldItem as any).receipt_confirmed_at ||
                     (soldItem as any).received_at ||
                     ["DELIVERED", "COMPLETED"].includes(soldItem.post_auction_status)
                   );

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
                      className="grid grid-cols-1 sm:grid-cols-[7rem_minmax(0,1fr)] lg:grid-cols-[8.5rem_minmax(0,1fr)_19rem] items-start gap-4 lg:gap-6 p-4 sm:p-6 rounded-3xl md:rounded-[1.35rem] border-2 border-slate-100 hover:border-[#FEBA4F] transition-colors group bg-white shadow-sm"
                    >
                      <div
                        className="w-24 h-24 md:w-32 md:h-32 shrink-0 bg-slate-100 rounded-2xl md:rounded-3xl overflow-hidden shadow-md group-hover:scale-105 transition-transform cursor-pointer"
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
                      <div className="min-w-0 text-left w-full">
                        <h3
                          className="text-xl md:text-2xl font-black uppercase tracking-tighter text-[#0A1128] mb-2 cursor-pointer hover:text-[#FEBA4F] transition-colors"
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
                              <AlertCircle size={12} /> Zmagovalec ni plačal – čaka na vašo odločitev
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
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-200">
                              <span className="text-xs font-black uppercase tracking-wider text-[#0A1128] flex items-center gap-1.5">
                                <Truck size={15} className="text-[#FEBA4F]" /> Podatki kupca za pošiljanje po pošti
                              </span>
                              <button
                                onClick={() => {
                                  // Deutscher Kommentar: Nur die Postadresse kopieren (Name, Strasse, PLZ Ort), damit sie direkt in ein Adressfeld passt
                                  const text = [buyerName, buyerAddress, `${buyerPostalCode} ${buyerCity}`.trim()].filter(Boolean).join('\n');
                                  navigator.clipboard.writeText(text);
                                  toast.success("Naslov kupca je skopiran v odložišče!");
                                  setCopiedAddressId(soldItem.id);
                                  setTimeout(() => setCopiedAddressId((cur) => (cur === soldItem.id ? null : cur)), 2000);
                                }}
                                className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border shadow-sm transition-all flex items-center gap-1.5 ${copiedAddressId === soldItem.id ? 'bg-emerald-500 border-emerald-500 text-white scale-105' : 'bg-white border-slate-200 text-slate-600 hover:text-[#0A1128] hover:border-[#FEBA4F]'}`}
                              >
                                {copiedAddressId === soldItem.id ? <><CheckCircle2 size={12} /> Skopirano</> : <><Copy size={12} /> Kopiraj naslov</>}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm font-bold text-slate-600">
                              <div className="min-w-0">
                                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider">Prejemnik</span>
                                <span className="text-[#0A1128] font-black break-words">{buyerName}</span>
                              </div>
                              <div className="min-w-0">
                                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider">Naslov</span>
                                <span className="text-[#0A1128] break-words">{buyerAddress || "Naslov ni vnesen"}</span>
                              </div>
                              <div className="min-w-0">
                                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider">Kraj in pošta</span>
                                <span className="text-[#0A1128] break-words">{buyerPostalCode} {buyerCity || "Kraj ni vnesen"}</span>
                              </div>
                              <div className="min-w-0">
                                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider">Kontakt</span>
                                {buyerPhone && <span className="text-[#0A1128] block break-words">{buyerPhone}</span>}
                                {buyerEmail && <span className="text-[#0A1128] block break-all">{buyerEmail}</span>}
                                {!buyerPhone && !buyerEmail && <span className="text-[#0A1128]">Ni podatka</span>}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 w-full sm:col-span-2 lg:col-span-1">
                        <div className="contents">
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
                            {(soldItem.has_second_bidder || (soldItem as any).hasSecondBidder) ? (
                              <LoadingButton
                                onClick={() => openSecondOfferModal(soldItem)}
                                loadingText="Nalaganje..."
                                className="col-span-2 bg-blue-600 text-white px-4 md:px-8 py-3 md:py-3 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                              >
                                Ponudi 2. ponudniku
                              </LoadingButton>
                            ) : (
                              <p className="text-xs text-red-500 font-bold text-center">Ni 2. ponudnika</p>
                            )}
                            <LoadingButton
                              onClick={() => handleMoveToArchive(soldItem)}
                              loadingText="Premikam..."
                              className="col-span-2 bg-red-100 text-red-700 px-4 md:px-8 py-3 md:py-3 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-red-200 transition-all flex items-center justify-center gap-2"
                            >
                              Premakni v arhiv
                            </LoadingButton>
                          </>
                        )}

                        {soldItem.payment_status === "paid" && (
                          <>
                            <LoadingButton
                              onClick={async () => {
                              let b = transactionPartners.get(soldItem.id);
                              if (!b) {
                                try {
                                  const token = await user?.getIdToken();
                                  const res = await fetch(`/api/transactions/partner-info?auction_id=${soldItem.id}`, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    if (data?.success && data?.partner) {
                                      b = data.partner;
                                      setTransactionPartners(prev => {
                                        const next = new Map(prev);
                                        next.set(soldItem.id, data.partner);
                                        return next;
                                      });
                                    }
                                  }
                                } catch (e) {
                                  console.warn("Error fetching buyer details:", e);
                                }
                              }
                              setInvoiceModalData({
                                isOpen: true,
                                auction: soldItem,
                                seller: userData,
                                buyer: b || null
                              });
                            }}
                            loadingText="Nalagam..."
                            className="bg-slate-100 text-[#0A1128] border-2 border-slate-200 px-4 py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm hover:border-slate-400 hover:bg-slate-200 transition-all flex items-center justify-center gap-2 mt-auto"
                          >
                            <FileText size={16} /> Račun
                          </LoadingButton>
                          
                          <button
                            onClick={() => setTimelineModalAuctionId(soldItem.id)}
                            className="bg-slate-100 text-[#0A1128] border-2 border-slate-200 px-4 py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm hover:border-[#FEBA4F] transition-all flex items-center justify-center gap-2 mt-2"
                          >
                            <Clock size={16} /> Status plačila
                          </button>

                          {soldItem.payment_status === "paid" && ((soldItem as any).delivery_method === "post" || (soldItem as any).selected_delivery === "post") && !(soldItem as any).shipped_at && (
                            <div className={`col-span-2 mt-2 p-3 rounded-2xl border text-[11px] font-bold leading-relaxed ${soldItem.currentBid > 20 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                              {soldItem.currentBid > 20
                                ? 'Znesek je nad 20 €: pošiljka mora biti oddana s sledenjem. Sledilno številko vpišite pri označitvi odpreme. Pošiljke brez sledenja ne oddajajte.'
                                : 'Pošiljka do 20 € je lahko brez sledenja, vendar tveganje izgube nosite sami. S sledenjem ste zaščiteni pred neutemeljenimi prijavami.'}
                            </div>
                          )}

                          {soldItem.payment_status === "paid" && ((soldItem as any).delivery_method === "post" || (soldItem as any).selected_delivery === "post") && (soldItem as any).shipped_at && !soldItem.buyer_received && (
                            <div className="col-span-2 flex items-center justify-center gap-2 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-xs">
                              <CheckCircle2 size={16} /> Poslano {new Date((soldItem as any).shipped_at).toLocaleDateString('sl-SI')} – čaka na prejem
                            </div>
                          )}

                          {soldItem.payment_status === "paid" && ((soldItem as any).delivery_method === "post" || (soldItem as any).selected_delivery === "post") && !(soldItem as any).shipped_at && (
                            <button
                              onClick={() => setMarkShippedModal({ isOpen: true, auctionId: soldItem.id, itemPrice: soldItem.currentBid })}
                              className="col-span-2 bg-[#0A1128] text-white px-4 py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all flex items-center justify-center gap-2 mt-2 shadow-lg"
                            >
                              <Truck size={16} /> Označi kot poslano
                            </button>
                          )}

                          {soldItem.payment_status === "paid" && ((soldItem as any).delivery_method === "pickup" || (soldItem as any).selected_delivery === "pickup") && !soldItem.buyer_received && (
                            <>
                              {/* Deutscher Kommentar: Button zum manuellen Eingeben des Abhol-PINs */}
                              <button
                                onClick={() => {
                                  setPickupPinInput("");
                                  setVerifyPickupPinModal({ isOpen: true, auctionId: soldItem.id });
                                }}
                                className="col-span-2 bg-[#0A1128] text-white px-4 py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all flex items-center justify-center gap-2 mt-2 shadow-lg"
                              >
                                <Key size={16} /> Vnesi kodo za predajo
                              </button>

                              {/* Deutscher Kommentar: Button zum Scannen des QR-Codes mit der Kamera */}
                              <button
                                onClick={() => {
                                  const titleText = typeof soldItem.title === 'string'
                                    ? soldItem.title
                                    : soldItem.title?.SLO || soldItem.title?.EN || "Predmet dražbe";
                                  setQrScannerModal({
                                    isOpen: true,
                                    auctionId: soldItem.id,
                                    auctionTitle: titleText,
                                  });
                                }}
                                className="col-span-2 bg-[#FEBA4F] text-[#0A1128] px-4 py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all flex items-center justify-center gap-2 mt-2 shadow-lg"
                              >
                                <QrCode size={16} /> Skeniraj kodo
                              </button>
                            </>
                          )}
                        </>
                        )}
                        </div>
                        <div className="contents">
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
                          null
                        )}

                        <div className="col-span-2 flex flex-col items-center gap-2 mt-1">
                          {effectiveDelivery ? (
                            <div className="text-xs font-bold text-slate-500 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-100 flex items-center gap-1.5">
                              {effectiveDelivery === "pickup" ? (
                                <MapPin size={14} className="text-[#FEBA4F]" />
                              ) : (
                                <Truck size={14} className="text-[#FEBA4F]" />
                              )}
                              {effectiveDelivery === "pickup"
                                ? "Osebni prevzem"
                                : "Pošiljanje po pošti"}
                            </div>
                          ) : !isFinished ? (
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
                          ) : null}
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
      // Deutscher Kommentar: Neueste (zuletzt beendete) Auktion zuerst, Pakete nach ihrem juengsten Artikel
      const unsoldEndMs = (e: any) => e.type === 'package'
        ? Math.max(...e.items.map((i: any) => new Date(i.endTime || i.end_time).getTime()))
        : new Date(e.item.endTime || e.item.end_time).getTime();
      currentUserUnsold.sort((x, y) => unsoldEndMs(y) - unsoldEndMs(x));


      content = (
        <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
          <button
            onClick={() => goBack("grid")}
            className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
          >
            <ArrowLeft size={16} /> Nazaj
          </button>

          <div className="bg-white rounded-[1.35rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
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
                        className="flex flex-col md:flex-row items-center gap-4 md:gap-8 p-4 sm:p-6 rounded-3xl md:rounded-[1.35rem] border-2 border-slate-100 hover:border-blue-200 bg-blue-50/30 transition-colors group relative"
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
                            className="bg-[#FEBA4F] text-[#0A1128] px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
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
                            className="bg-[#0A1128] text-white px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-2"
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
                      className="flex flex-col md:flex-row items-center gap-4 md:gap-8 p-4 sm:p-6 rounded-3xl md:rounded-[1.35rem] border-2 border-slate-100 hover:border-slate-300 transition-colors group relative"
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
                        {soldItem.post_auction_status === "failed_1st" && (
                          <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-bold text-amber-900 leading-relaxed">
                            Čaka na vašo odločitev: zmagovalec ni plačal. Dražbo lahko ponudite 2. ponudniku (ob potrditvi vidite ceno) ali jo objavite ponovno / izbrišete.
                          </div>
                        )}
                        {soldItem.post_auction_status === "failed_2nd" && (
                          <div className="mb-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 leading-relaxed">
                            Tudi 2. ponudnik ni kupil predmeta. Dražbo lahko objavite ponovno ali izbrišete.
                          </div>
                        )}
                        {soldItem.post_auction_status === "rejected_2nd" && (
                          <div className="mb-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 leading-relaxed">
                            2. ponudnik je ponudbo zavrnil. Dražbo lahko objavite ponovno ali izbrišete.
                          </div>
                        )}
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
                        {soldItem.post_auction_status === "failed_1st" && (
                          <button
                            onClick={() => openSecondOfferModal(soldItem)}
                            className="bg-blue-600 text-white px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-blue-700 transition-all shadow-xl flex items-center justify-center gap-2"
                          >
                            Ponudi 2. ponudniku
                          </button>
                        )}
                        <button
                          onClick={() => handleDirectQuickRepublish(soldItem)}
                          disabled={isQuickRepublishing === soldItem.id}
                          className="bg-[#FEBA4F] text-[#0A1128] px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
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
                          className="bg-[#0A1128] text-white px-4 md:px-8 py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-2"
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
          userId={userData?.id || ""}
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
                payment_deadline: auction.payment_deadline,
                endTime: auction.endTime || auction.end_time,
                bank_transfer_used: auction.bank_transfer_used
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
          <div className="bg-white rounded-[1.35rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
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
                .sort((a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime()) // prva se zaključi prva
                .map((item) => (
                  <AuctionCard
                    key={item.id}
                    item={item}
                    t={t}
                    language={language}
                    isVerified={isVerified}
                    currentUserId={userData?.id || ""}
                    hasBid={bidAuctionIds.includes(item.id)}
                    myMax={myBidsMap.get(item.id)}
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
    default:
      content = (
        <div className="animate-in">
          {activeView === "grid" &&
            selectedCategories.length === 0 &&
            !searchQuery &&
            selectedRegions.length === 0 && (
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
                <span className="w-12 h-12 rounded-full bg-[#0A1128] text-[#FEBA4F] flex items-center justify-center shadow-lg ring-2 ring-offset-2 ring-offset-[#F5EFE2] ring-[#FEBA4F]/60"><Gavel size={22} /></span>
                <h2 className="text-3xl sm:text-4xl text-[#0A1128]">
                  {activeView === "lastChance"
                    ? t("lastChanceTitle")
                    : selectedRegions.length > 0
                      ? (selectedRegions.length === 1 ? `${t("regions")}: ${selectedRegions[0]}` : `${t("regions")}: ${selectedRegions.length} izbranih`)
                      : selectedCategories.length > 0
                        ? (selectedCategories.length === 1 ? `${t("category")}: ${getCategoryTranslation(selectedCategories[0], t)}` : `${t("category")}: ${selectedCategories.length} izbranih`)
                        : searchQuery
                          ? `${t("searchResults") || 'Rezultati'}: "${searchQuery}"`
                          : t("activeAuctions")}
                </h2>
                {selectedRegions.length > 0 && (
                  <button
                    onClick={() => setSelectedRegions([])}
                    className="flex items-center gap-1.5 bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] text-xs font-black uppercase px-3 py-1.5 rounded-full transition-all border border-[#FEBA4F]/30"
                  >
                    <span>{t("clearFilter") || "Počisti regije"}</span>
                    <X size={14} />
                  </button>
                )}
                {selectedCategories.length > 0 && (
                  <button
                    onClick={() => {
                      setSelectedCategories([]);
                      setCategoryFilters({ delivery_options: [], conditions: [], specifications: {} });
                    }}
                    className="flex items-center gap-1.5 bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] text-xs font-black uppercase px-3 py-1.5 rounded-full transition-all border border-[#FEBA4F]/30"
                  >
                    <span>{t("clearFilter") || "Počisti kategorije"}</span>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4">
                {/* Toggle button "Filtri" with badge */}
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                      setIsMobileFiltersOpen(true);
                    } else {
                      setShowFilters((prev) => {
                        const next = !prev;
                        try {
                          localStorage.setItem('drazbenik_show_filters', String(next));
                        } catch {}
                        return next;
                      });
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-black text-xs uppercase tracking-wider transition-all shadow-sm ${
                    showFilters || activeCategoryFilterCount > 0
                      ? "bg-[#0A1128] text-white border-[#0A1128] hover:bg-[#142247]"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Filter size={14} className={activeCategoryFilterCount > 0 ? "text-[#FEBA4F]" : ""} />
                  <span>Filtri</span>
                  {activeCategoryFilterCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-[#FEBA4F] text-[#0A1128] text-[10px] font-black flex items-center justify-center">
                      {activeCategoryFilterCount}
                    </span>
                  )}
                </button>

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

            {/* Dynamic Category & Specification Filter Bar & Auction Grid */}
            <div className={showFilters ? "lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 items-start" : "w-full"}>
              <CategoryFilterBar
                category={selectedCategories.length === 1 ? selectedCategories[0] : null}
                selectedCategories={selectedCategories}
                selectedRegions={selectedRegions}
                onCategoriesChange={(cats) => {
                  setSelectedCategories(cats);
                  setCurrentPage(1);
                }}
                onRegionsChange={(regs) => {
                  setSelectedRegions(regs);
                  setCurrentPage(1);
                }}
                filters={categoryFilters}
                onFilterChange={(newFilters) => {
                  setCategoryFilters(newFilters);
                  setCurrentPage(1);
                }}
                onResetFilters={() => {
                  setSelectedCategories([]);
                  setSelectedRegions([]);
                  setCategoryFilters({ delivery_options: [], conditions: [], specifications: {} });
                  setCurrentPage(1);
                }}
                totalResultsCount={getFilteredAuctions.length}
                showDesktopPanel={showFilters}
                isMobileOpen={isMobileFiltersOpen}
                onCloseMobile={() => setIsMobileFiltersOpen(false)}
                auctions={auctions}
              />

              <div className="w-full min-w-0">
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
                            currentUserId={userData?.id || ""}
                            hasBid={bidAuctionIds.includes(item.id)}
                            myMax={myBidsMap.get(item.id)}
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
                              setRawAuctions((prev) => [...prev]);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {!auctionsUnlimited && !hasActiveListFilters && rawAuctions.length >= auctionsLimit && auctionsLimit < AUCTIONS_MAX_WITH_FILTERS && currentPage === totalPages && (
                  <div className="mt-10 flex justify-center">
                    <button
                      onClick={() => setAuctionsLimit((l) => Math.min(l + AUCTIONS_PAGE_SIZE, AUCTIONS_MAX_WITH_FILTERS))}
                      className="px-8 py-4 rounded-2xl border-2 border-slate-100 text-[#0A1128] font-black text-xs uppercase tracking-widest hover:border-[#FEBA4F] transition-all"
                    >
                      {t("loadMoreAuctions")}
                    </button>
                  </div>
                )}

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
    const userDataVerified = Boolean(userData.profile_completed && (userData.email_verified || auth.currentUser?.emailVerified));
    if (isLoggedIn && isVerified !== userDataVerified) {
      setIsVerified(userDataVerified);
    }
  }, [userData.profile_completed, userData.email_verified, isLoggedIn, isVerified]);

  const [dontShowTermsAgain, setDontShowTermsAgain] = useState(false);

  // Hinweis mit Aktionsknopf statt automatischer Weiterleitung
  function showActionNotice(
    message: string,
    actionLabel: string,
    onAction: () => void,
    secondary?: { label: string; onClick: () => void }
  ) {
    toast.warning(message, {
      duration: 12000,
      action: { label: actionLabel, onClick: onAction },
      ...(secondary ? { cancel: { label: secondary.label, onClick: secondary.onClick } } : {})
    });
  }

  async function handleBidSubmit(item: any, amount: number): Promise<"ok" | "outbid" | "error" | "login_required" | "cancelled"> {
    if (!isLoggedIn) {
      showActionNotice(
        "Za oddajo ponudbe se morate prijaviti.",
        "Prijava",
        () => {
          setAuthMode('login');
          navigateTo("login");
        },
        {
          label: "Registracija",
          onClick: () => {
            setAuthMode('register');
            navigateTo("login");
          }
        }
      );
      return "login_required";
    }
    if (!(auth.currentUser?.emailVerified || userData?.email_verified)) {
      showActionNotice(
        "Za oddajo ponudbe morate potrditi svoj e-poštni naslov.",
        "Pošlji potrditveno e-pošto",
        async () => {
          try {
            const email = userData?.email || auth.currentUser?.email || "";
            const displayName = (userData?.first_name || "").toString() || undefined;
            const res = await sendEmailVerificationAction(email, displayName, auth.currentUser?.uid);
            if (res.success) {
              toast.success("Potrditveno e-pošto smo poslali.");
            } else {
              toast.error(friendlyError(res.error, "Napaka pri pošiljanju potrditvene e-pošte."));
            }
          } catch (err: any) {
            toast.error(friendlyError(err, "Napaka pri pošiljanju potrditvene e-pošte."));
          }
        }
      );
      return "error";
    }
    if (!userData?.profile_completed) {
      showActionNotice(
        "Za oddajo ponudbe morate dopolniti svoj profil.",
        "Dopolni profil",
        () => {
          setSettingsTab('personal');
          navigateTo("settings", { settingsTab: 'personal' });
        }
      );
      return "error";
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

  async function handleConfirmBid(confirmedAmount?: number, taxData?: any, acceptedBidTerms?: boolean) {
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
          accepted_bid_terms: acceptedBidTerms === true
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 403 && data.code === 'TERMS_REQUIRED') {
          // wird vom globalen Handler behandelt
        } else if (response.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
          showActionNotice(
            "Za oddajo ponudbe morate potrditi svoj e-poštni naslov.",
            "Pošlji potrditveno e-pošto",
            async () => {
              try {
                const email = userData?.email || auth.currentUser?.email || "";
                const displayName = (userData?.first_name || "").toString() || undefined;
                const res = await sendEmailVerificationAction(email, displayName, auth.currentUser?.uid);
                if (res.success) {
                  toast.success("Potrditveno e-pošto smo poslali.");
                } else {
                  toast.error(friendlyError(res.error, "Napaka pri pošiljanju potrditvene e-pošte."));
                }
              } catch (err: any) {
                toast.error(friendlyError(err, "Napaka pri pošiljanju potrditvene e-pošte."));
              }
            }
          );
        } else if (response.status === 403 && data.code === 'PROFILE_INCOMPLETE') {
          showActionNotice(
            "Za oddajo ponudbe morate dopolniti svoj profil.",
            "Dopolni profil",
            () => {
              setSettingsTab('personal');
              navigateTo("settings", { settingsTab: 'personal' });
            }
          );
        } else {
          const errorMsg = friendlyError(data.error, "Napaka pri oddaji ponudbe.");
          toast.error(errorMsg);
        }
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
      toast.error(friendlyError(e, "Napaka pri oddaji ponudbe. Poskusite znova."));
      if (bidResolverRef.current) bidResolverRef.current("error");
    }
    setPendingBid(null);
  };

  
  const handleDirectQuickRepublish = async (item: any) => {
    try {
      setIsQuickRepublishing(item.id);
      const res = await fetch('/api/auctions/republish', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ auction_id: item.id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Napaka pri ponovni objavi.");
      }
      toast.success(data.message || "Dražba je bila uspešno ponovno objavljena!");
      fetchAuctions();
    } catch (e: any) {
      console.error("Napaka pri hitri objavi:", e);
      toast.error(friendlyError(e, "Napaka pri ponovni objavi"));
    } finally {
      setIsQuickRepublishing(null);
    }
  };

  const handleDirectQuickRepublishPackage = async (items: any[]) => {
    try {
      setIsQuickRepublishing("package");
      for (const item of items) {
        const res = await fetch('/api/auctions/republish', {
          method: 'POST',
          headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ auction_id: item.id })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Napaka pri ponovni objavi predmeta ${item.id}`);
        }
      }
      toast.success("Vsi predmeti paketa so bili uspešno ponovno objavljeni!");
      fetchAuctions();
    } catch (e: any) {
      console.error("Napaka pri hitri objavi paketa:", e);
      toast.error(friendlyError(e, "Napaka pri ponovni objavi paketa."));
    } finally {
      setIsQuickRepublishing(null);
    }
  };

  const handleOfferToSecondBidder = async (auction: any) => {
    try {
      const res = await fetch('/api/auctions/offer-second-chance', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ auction_id: auction.id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Napaka pri ponujanju dražbe.");
      }
      toast.success(data.message || "Dražba je bila ponujena 2. najvišjemu ponudniku.");
      fetchAuctions();
    } catch (e: any) {
      toast.error(friendlyError(e, "Napaka pri ponujanju dražbe."));
    }
  };

  const handleMoveToArchive = async (auction: any) => {
    try {
      const res = await fetch('/api/auctions/archive', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          auction_id: auction.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Napaka pri premikanju v arhiv.");
      }
      toast.success(data.message || "Dražba premaknjena v arhiv.");
      fetchAuctions();
    } catch (e: any) {
      toast.error(friendlyError(e, "Napaka pri premikanju v arhiv."));
    }
  };

  const handleAcceptSecondChance = async (auction: any) => {
    try {
      const res = await fetch('/api/auctions/second-chance-respond', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          auction_id: auction.id,
          action: 'accept',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Napaka pri sprejemu ponudbe.");
      }
      toast.success(data.message || "Sprejeli ste ponudbo! Imate 24 ur za plačilo.");
      fetchAuctions();
    } catch (e: any) {
      toast.error(friendlyError(e, "Napaka pri sprejemu ponudbe."));
    }
  };

  const handleRejectSecondChance = async (auction: any) => {
    try {
      const res = await fetch('/api/auctions/second-chance-respond', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          auction_id: auction.id,
          action: 'reject',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Napaka pri zavrnitvi ponudbe.");
      }
      toast.success(data.message || "Zavrnili ste ponudbo. Dražba je zaključena.");
      fetchAuctions();
    } catch (e: any) {
      toast.error(friendlyError(e, "Napaka pri zavrnitvi ponudbe."));
    }
  };

  async function handleDeliveryMethodSubmit() {
    // Deutscher Kommentar: Schutz vor Mehrfachklicks und fehlender Auswahl
    if (!deliveryMethodModal.auctionId || !deliveryMethodModal.deliveryMethod || deliveryMethodSaving) return;
    setDeliveryMethodSaving(true);
    try {
      const res = await fetch('/api/auctions/set-delivery-method', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          auction_id: deliveryMethodModal.auctionId,
          delivery_method: deliveryMethodModal.deliveryMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Napaka pri shranjevanju načina predaje.");
      }
      toast.success(data.message || "Način predaje je bil uspešno posodobljen.");
      setDeliveryMethodModal({ isOpen: false, auctionId: "", deliveryMethod: null });
      fetchAuctions();
    } catch (e: any) {
      console.error("Napaka pri posodabljanju načina predaje:", e);
      toast.error(friendlyError(e, "Napaka pri shranjevanju načina predaje."));
      setDeliveryMethodModal({ isOpen: false, auctionId: "", deliveryMethod: null });
    } finally {
      setDeliveryMethodSaving(false);
    }
  };

  async function handleReceiptConfirmSubmit() {
    // Verhindert mehrfaches Absenden, wenn bereits geladen oder erfolgreich
    if (receiptConfirmLoading || receiptConfirmState === 'success') return;
    setReceiptConfirmState('loading');
    setReceiptConfirmLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setReceiptConfirmState('idle');
        setReceiptConfirmLoading(false);
        toast.error("Niste prijavljeni.");
        return;
      }
      const res = await confirmReceiptAction({ auction_id: receiptConfirmModal.auctionId }, token);
      if (res.success) {
        setReceiptConfirmState('success');
        setReceiptConfirmLoading(false);
        setTimeout(() => {
          setReceiptConfirmModal({ isOpen: false, auctionId: "", sellerId: "", isPickup: false });
          setReceiptConfirmState('idle');
          fetchAuctions();
        }, 1500);
      } else {
        setReceiptConfirmState('idle');
        setReceiptConfirmLoading(false);
        toast.error(friendlyError(res.error, "Napaka pri potrditvi prejema."));
      }
    } catch (e) {
      setReceiptConfirmState('idle');
      setReceiptConfirmLoading(false);
      toast.error(friendlyError(e, "Napaka pri potrditvi prejema."));
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
        toast.error(friendlyError(res.error, "Napaka pri oddaji ocene."));
        return false;
      }
    } catch (err: any) {
      console.error("Error submitting review:", err);
      toast.error(friendlyError(err, "Napaka pri oddaji ocene."));
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
    <ChatProvider userId={userData?.id || ""} auctions={auctions} appWakeupTrigger={appWakeupTrigger}>
      <div className="min-h-screen flex flex-col bg-[#f3f4f6] font-sans selection:bg-[#FEBA4F] selection:text-[#0A1128] overflow-x-hidden">
        <DialogHost />
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
            setCategoryFilters({ delivery_options: [], conditions: [], specifications: {} });
            navigateTo("grid", {
              selectedRegions: [],
              selectedCategories: [],
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
            navigateTo("grid", { selectedRegions: reg ? [reg] : [] });
          }}
          onRegionsChange={(regs) => {
            navigateTo("grid", { selectedRegions: regs });
          }}
          onCategorySelect={(cat) => {
            setCategoryFilters({ delivery_options: [], conditions: [], specifications: {} });
            navigateTo("grid", { selectedCategories: cat ? [cat] : [] });
          }}
          onLastChance={() => {
            navigateTo("lastChance", { selectedRegions: [], selectedCategories: [] });
          }}
          onLogin={() => {
            setAuthMode('login');
            navigateTo("login");
          }}
          onRegister={() => {
            setAuthMode('register');
            navigateTo("login");
          }}
          onLogout={handleLogout}
          onSettings={(tab) => {
            navigateTo("settings", { settingsTab: tab || 'profile' });
          }}
          onSubscriptions={() => {
            navigateTo("subscriptions");
          }}
          onAdminAccounting={() => {
            navigateTo("adminAccounting");
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
          onMyReviews={() => {
            nextSellerTabRef.current = 'reviews';
            navigateToSellerProfile(userData?.id || auth.currentUser?.uid, userData?.username);
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
          onAcceptTerms={() => navigateTo("acceptTerms")}
          notifications={notifications}
          onMarkNotificationRead={markNotificationRead}
          onSelectNotification={handleSelectNotification}
          isTermsBarReady={showBannerDelayPassed && !isAuthLoading}
          activeView={activeView}
          selectedRegion={selectedRegions[0] ?? null}
          selectedRegions={selectedRegions}
          selectedCategory={selectedCategories[0] ?? null}
          isLoggedIn={isLoggedIn}
          isAuthLoading={isAuthLoading}
          isVerified={isVerified}
          language={language}
          onLanguageChange={setLanguage}
          t={t}
          auctions={auctions}
          userEmail={userData?.email || ""}
          userProfilePicture={
            userData?.profile_picture_url || userData?.profilePicture || ""
          }
          userData={userData}
        />
        <main className="flex-1 flex flex-col">{content}</main>
        {activeView !== "login" && (
          <Footer
            t={t}
            onLegal={setActiveLegal}
            onNavigate={(view) => navigateTo(view)}
          />
        )}
        {showTermsModal && (
          <Portal>
            {/* Deutscher Kommentar: Responsives Splosni pogoji poslovanja Modal fuer mobile Geraete */}
            <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-6 animate-in">
              <div className="bg-white w-full max-w-xl rounded-3xl sm:rounded-[1.35rem] p-5 sm:p-10 lg:p-14 shadow-2xl relative max-h-[92dvh] overflow-y-auto">
                <button
                  onClick={handleCancelTerms}
                  className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 text-slate-400 hover:text-[#0A1128] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label="Zapri"
                >
                  <X size={24} />
                </button>
                <div className="bg-[#FEBA4F] w-14 h-14 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl flex items-center justify-center mb-5 sm:mb-8 shadow-lg shadow-[#FEBA4F]/20">
                  <ShieldCheck size={32} className="text-[#0A1128]" />
                </div>
                <h2 className="text-xl sm:text-3xl font-black text-[#0A1128] uppercase tracking-tighter mb-3 sm:mb-4">
                  Splošni pogoji poslovanja
                </h2>
                <p className="text-slate-500 font-bold leading-relaxed mb-5 sm:mb-6 text-xs sm:text-base">
                  Z oddajo ponudbe potrjujete, da se strinjate s splošnimi pogoji
                  poslovanja platforme dražbenik.si. Vaša ponudba je pravno
                  zavezujoča. V primeru, da zmagate na dražbi, ste dolžni predmet
                  prevzeti in plačati v skladu s pogoji prodajalca.
                </p>
                <label className="flex items-center gap-3 mb-6 sm:mb-10 cursor-pointer group min-h-[40px]">
                  <div
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${dontShowTermsAgain ? "bg-[#FEBA4F] border-[#FEBA4F]" : "border-slate-300 group-hover:border-[#FEBA4F]"}`}
                  >
                    {dontShowTermsAgain && (
                      <CheckCircle2 size={16} className="text-[#0A1128]" />
                    )}
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-slate-600 select-none">
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
                  className="w-full bg-[#0A1128] text-white py-3.5 sm:py-6 rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl min-h-[44px] flex items-center justify-center"
                >
                  Strinjam se in potrjujem ponudbo
                </button>
              </div>
            </div>
          </Portal>
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
            onOpenTerms={() => setActiveLegal('terms')}
          />
        )}
        <CookieNotice onOpenPolicy={() => setActiveLegal("cookies")} />
        {activeLegal && (
          <LegalModal
            type={activeLegal}
            onClose={() => setActiveLegal(null)}
            t={t}
            language={language}
          />
        )}

        {/* Modal: Angebot an 2. Bieter bestaetigen */}
        {secondOfferModal && (
          <Portal>
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4">
              <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={() => { if (!secondOfferModal.submitting) setSecondOfferModal(null); }} />
              <div className="relative bg-white rounded-3xl p-5 sm:p-8 max-w-md w-full shadow-2xl text-center z-10 max-h-[92dvh] overflow-y-auto">
                <h3 className="text-lg sm:text-xl font-black text-[#0A1128] uppercase tracking-tighter mb-3">Ponudba 2. ponudniku</h3>
                {secondOfferModal.loading ? (
                  <p className="text-sm font-bold text-slate-500 py-6">Nalaganje...</p>
                ) : !secondOfferModal.available ? (
                  <p className="text-sm font-bold text-red-600 py-4">Za to dražbo ni 2. ponudnika. Dražbo lahko objavite ponovno.</p>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-600 leading-relaxed mb-3">
                      Predmet bo ponujen 2. najvišjemu ponudniku po njegovi ponudbi:
                    </p>
                    <p className="text-3xl font-black text-[#0A1128] mb-3">€{secondOfferModal.amount.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-xs font-bold text-slate-500 leading-relaxed mb-5">
                      Ponudnik bo o ponudbi obveščen po e-pošti in na spletni strani. Ima 24 ur za sprejem ponudbe in nato še 24 ur za plačilo. Če ponudbe ne sprejme, dražba preide med neprodane brez opomina; če jo sprejme in ne plača v roku, prejme opomin in dražba preide med neprodane in jo lahko objavite ponovno.
                    </p>
                  </>
                )}
                <div className="flex flex-col gap-2.5">
                  {!secondOfferModal.loading && secondOfferModal.available && (
                    <button
                      disabled={secondOfferModal.submitting}
                      onClick={async () => {
                        setSecondOfferModal((m) => (m ? { ...m, submitting: true } : m));
                        await handleOfferToSecondBidder(secondOfferModal.item);
                        setSecondOfferModal(null);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 px-4 rounded-2xl font-black uppercase tracking-wider text-xs disabled:opacity-50 min-h-[44px]"
                    >
                      {secondOfferModal.submitting ? "Pošiljam..." : "Potrdi in ponudi"}
                    </button>
                  )}
                  <button
                    disabled={secondOfferModal.submitting}
                    onClick={() => setSecondOfferModal(null)}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-2xl font-black uppercase tracking-wider text-xs min-h-[40px]"
                  >
                    Prekliči
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* Modal for Unsold Auction Permanent Deletion */}
        {deleteUnsoldModal && deleteUnsoldModal.isOpen && (
          <Portal>
            {/* Deutscher Kommentar: Responsives Modal fuer Loeschung unverkaufter Auktionen */}
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4">
              <div 
                className="absolute inset-0 bg-[#0A1128]/80 backdrop-blur-sm animate-in fade-in"
                onClick={() => setDeleteUnsoldModal(null)}
              />
              <div className="relative bg-white rounded-3xl sm:rounded-[1.35rem] p-5 sm:p-8 md:p-10 max-w-md w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 z-10 max-h-[92dvh] overflow-y-auto">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center mb-4 sm:mb-6 mx-auto shadow-inner">
                  <Trash2 size={28} />
                </div>
                <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-[#0A1128] text-center mb-2">
                  Dokončen izbris dražbe
                </h3>
                <p className="text-xs sm:text-sm font-bold text-slate-500 text-center mb-6 sm:mb-8 leading-relaxed">
                  Ali ste prepričani, da želite dokončno izbrisati <span className="text-[#0A1128] font-black">"{deleteUnsoldModal.title}"</span>? Te akcije ni mogoče razveljaviti in dražba bo trajno odstranjena.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <button
                    onClick={() => setDeleteUnsoldModal(null)}
                    className="bg-slate-100 hover:bg-slate-200 text-[#0A1128] px-4 sm:px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[11px] sm:text-xs transition-all min-h-[44px] flex items-center justify-center"
                  >
                    Prekliči
                  </button>
                  <LoadingButton
                    onClick={async () => {
                      try {
                        const idsToDelete = deleteUnsoldModal.items
                          ? deleteUnsoldModal.items.map((it: any) => it.id)
                          : deleteUnsoldModal.item
                          ? [deleteUnsoldModal.item.id]
                          : [];
                        if (idsToDelete.length === 0) return;

                        const res = await fetch('/api/auctions/delete-unsold', {
                          method: 'POST',
                          headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
                          body: JSON.stringify({ auction_ids: idsToDelete }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          throw new Error(data.error || "Napaka pri izbrisu dražb.");
                        }
                        toast.success(data.message || "Dražbe so bile uspešno izbrisane.");
                        setDeleteUnsoldModal(null);
                        fetchAuctions();
                      } catch (err: any) {
                        toast.error(friendlyError(err, "Napaka pri brisanju."));
                      }
                    }}
                    loadingText="Brišem..."
                    className="bg-red-600 hover:bg-red-700 text-white px-4 sm:px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[11px] sm:text-xs transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px]"
                  >
                    <Trash2 size={16} /> Izbriši
                  </LoadingButton>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* Modals for delivery and rating */}
        {deliveryMethodModal.isOpen && (
          <Portal>
            {/* Deutscher Kommentar: Responsives Versandart-Auswahl-Modal */}
            <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-6 animate-in">
              <div className="bg-white w-full max-w-lg rounded-3xl sm:rounded-[1.35rem] p-5 sm:p-10 shadow-2xl relative max-h-[92dvh] overflow-y-auto">
                <button
                  onClick={() =>
                    setDeliveryMethodModal({
                      isOpen: false,
                      auctionId: "",
                      deliveryMethod: null,
                    })
                  }
                  className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 text-slate-400 hover:text-[#0A1128] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label="Zapri"
                >
                  <X size={24} />
                </button>
                <h2 className="text-xl sm:text-2xl font-black text-[#0A1128] uppercase tracking-tighter mb-2 sm:mb-4">
                  Način predaje
                </h2>
                <p className="text-slate-500 font-bold mb-6 sm:mb-8 text-xs sm:text-sm">
                  Izberite želeni način predaje ali prevzema predmeta.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
                  <button
                    disabled={deliveryMethodSaving}
                    onClick={() =>
                      setDeliveryMethodModal((prev) => ({
                        ...prev,
                        deliveryMethod: "pickup",
                      }))
                    }
                    className={`p-4 sm:p-6 rounded-2xl border-2 sm:border-4 transition-all flex flex-col items-center gap-2 sm:gap-3 disabled:opacity-50 disabled:cursor-not-allowed ${deliveryMethodModal.deliveryMethod === "pickup" ? "border-[#FEBA4F] bg-[#FEBA4F]/10" : "border-slate-100 hover:border-slate-200 bg-white"}`}
                  >
                    <MapPin
                      size={28}
                      className={
                        deliveryMethodModal.deliveryMethod === "pickup"
                          ? "text-[#FEBA4F]"
                          : "text-slate-400"
                      }
                    />
                    <span className="font-bold text-xs sm:text-sm text-[#0A1128] text-center">
                      Osebni prevzem
                    </span>
                  </button>
                  <button
                    disabled={deliveryMethodSaving}
                    onClick={() =>
                      setDeliveryMethodModal((prev) => ({
                        ...prev,
                        deliveryMethod: "post",
                      }))
                    }
                    className={`p-4 sm:p-6 rounded-2xl border-2 sm:border-4 transition-all flex flex-col items-center gap-2 sm:gap-3 disabled:opacity-50 disabled:cursor-not-allowed ${deliveryMethodModal.deliveryMethod === "post" ? "border-[#FEBA4F] bg-[#FEBA4F]/10" : "border-slate-100 hover:border-slate-200 bg-white"}`}
                  >
                    <Truck
                      size={28}
                      className={
                        deliveryMethodModal.deliveryMethod === "post"
                          ? "text-[#FEBA4F]"
                          : "text-slate-400"
                      }
                    />
                    <span className="font-bold text-xs sm:text-sm text-[#0A1128] text-center">
                      Pošiljanje po pošti
                    </span>
                  </button>
                </div>
                <LoadingButton
                  onClick={handleDeliveryMethodSubmit}
                  loading={deliveryMethodSaving}
                  loadingText="Shranjujem..."
                  disabled={!deliveryMethodModal.deliveryMethod || deliveryMethodSaving}
                  className="w-full bg-[#0A1128] text-white py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  Potrdi izbiro
                </LoadingButton>
              </div>
            </div>
          </Portal>
        )}

        {receiptConfirmModal.isOpen && (
          <Portal>
            {/* Deutscher Kommentar: Responsives Bestaetigungsmodal fuer Empfang */}
            <div 
              className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-6 animate-in"
              onClick={() => {
                // Schließen des Modals nur erlauben, wenn kein Ladevorgang läuft
                if (receiptConfirmState === 'idle' && !receiptConfirmLoading) {
                  setReceiptConfirmModal({ isOpen: false, auctionId: "", sellerId: "", isPickup: false });
                }
              }}
            >
              <div 
                className="bg-white w-full max-w-md rounded-3xl sm:rounded-[1.35rem] p-5 sm:p-10 shadow-2xl relative text-center max-h-[92dvh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {receiptConfirmState !== 'loading' && receiptConfirmState !== 'success' && !receiptConfirmLoading && (
                  <button
                    onClick={() =>
                      setReceiptConfirmModal({
                        isOpen: false,
                        auctionId: "",
                        sellerId: "",
                        isPickup: false,
                      })
                    }
                    className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 text-slate-400 hover:text-[#0A1128] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                    aria-label="Zapri"
                  >
                    <X size={24} />
                  </button>
                )}
                <div className="bg-green-100 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <CheckCircle2 size={32} className={`text-green-600 ${receiptConfirmState === 'success' ? 'animate-in zoom-in duration-300' : ''}`} />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-[#0A1128] uppercase tracking-tighter mb-2 sm:mb-4">
                  {receiptConfirmState === 'success' ? "Prejem potrjen!" : "Potrditev prejema"}
                </h2>
                <p className="text-slate-500 font-bold mb-6 sm:mb-8 text-xs sm:text-sm">
                  {receiptConfirmState === 'success'
                    ? "Izplačilo prodajalcu je sproženo."
                    : receiptConfirmModal.isPickup
                    ? "Sredstva bodo takoj sprejeta prodajalcu. Potrdite samo, če ste predmet že prejeli in preverili."
                    : "S potrditvijo prejema potrjujete, da ste predmet pregledali, da je skladen z opisom in vsemi podatki prodajalca ter da ga sprejemate. Posel je s tem zaključen in izplačilo prodajalcu se sprosti takoj. Nadaljujem?"}
                </p>
                {receiptConfirmState !== 'success' && (
                  <div className="flex flex-col gap-2.5 sm:gap-3">
                    <LoadingButton
                      onClick={handleReceiptConfirmSubmit}
                      disabled={receiptConfirmLoading}
                      loading={receiptConfirmLoading}
                      loadingText="Potrjujem..."
                      className="w-full bg-[#0A1128] text-white py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
                    >
                      <span>Potrdi prejem</span>
                    </LoadingButton>
                    <button
                      onClick={() =>
                        setReceiptConfirmModal({
                          isOpen: false,
                          auctionId: "",
                          sellerId: "",
                          isPickup: false,
                        })
                      }
                      disabled={receiptConfirmLoading}
                      className="w-full bg-slate-100 text-slate-600 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center"
                    >
                      Prekliči
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Portal>
        )}

        {timelineModalAuctionId && (
          <Portal>
            {/* Deutscher Kommentar: Responsives Timeline-Modal */}
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-2.5 sm:p-4">
              <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={() => setTimelineModalAuctionId(null)}></div>
              <div className="relative bg-white w-full max-w-4xl rounded-3xl sm:rounded-[1.35rem] p-1 shadow-2xl animate-in border-2 sm:border-2 border-[#FEBA4F] max-h-[92dvh] overflow-hidden flex flex-col">
                 <div className="p-4 sm:p-8 pb-3 sm:pb-4 flex justify-between items-center border-b border-slate-100">
                    <h3 className="text-lg sm:text-2xl font-black text-[#0A1128] uppercase tracking-tighter">Status plačila in dostave</h3>
                    <button onClick={() => setTimelineModalAuctionId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 min-w-[40px] min-h-[40px] flex items-center justify-center" aria-label="Zapri"><X size={22} /></button>
                 </div>
                 <div className="p-4 sm:p-8 overflow-y-auto custom-scrollbar flex-1">
                    <PaymentTimeline auctionId={timelineModalAuctionId} />
                 </div>
                 <div className="p-4 sm:p-8 pt-3 sm:pt-4 border-t border-slate-100 flex justify-end">
                    <button onClick={() => setTimelineModalAuctionId(null)} className="w-full sm:w-auto bg-[#0A1128] text-white px-6 sm:px-8 py-3 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-lg min-h-[44px] flex items-center justify-center">Zapri</button>
                 </div>
              </div>
            </div>
          </Portal>
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

        <MarkShippedModal
          isOpen={markShippedModal.isOpen}
          onClose={() => setMarkShippedModal(prev => ({ ...prev, isOpen: false }))}
          auctionId={markShippedModal.auctionId}
          itemPrice={markShippedModal.itemPrice}
          onSuccess={fetchAuctions}
        />

        {verifyPickupPinModal.isOpen && (
          <Portal>
            {/* Deutscher Kommentar: Responsives Modal fuer PIN-Uebergabebestaetigung */}
            <div
              className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-6 animate-in"
              onClick={() => {
                if (!verifyPinLoading) {
                  setVerifyPickupPinModal({ isOpen: false, auctionId: "" });
                }
              }}
            >
              <div
                className="bg-white w-full max-w-md rounded-3xl sm:rounded-[1.35rem] p-5 sm:p-10 shadow-2xl relative text-center max-h-[92dvh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setVerifyPickupPinModal({ isOpen: false, auctionId: "" })}
                  disabled={verifyPinLoading}
                  className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 text-slate-400 hover:text-[#0A1128] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label="Zapri"
                >
                  <X size={24} />
                </button>
                <div className="bg-amber-100 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <Key size={32} className="text-amber-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-[#0A1128] uppercase tracking-tighter mb-2 sm:mb-3">
                  Potrditev predaje
                </h2>
                <p className="text-slate-500 font-bold mb-5 sm:mb-6 text-xs sm:text-sm">
                  Vnesite 6-mestno kodo, ki vam jo pokaže kupec ob predaji predmeta.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const cleanPin = pickupPinInput.trim();
                    if (!/^\d{6}$/.test(cleanPin)) {
                      toast.error("Vnesite 6-mestno številčno kodo.");
                      return;
                    }
                    setVerifyPinLoading(true);
                    try {
                      const token = await user?.getIdToken();
                      const res = await fetch(`/api/orders/${verifyPickupPinModal.auctionId}/verify-pickup-pin`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ pin: cleanPin })
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok && data?.success) {
                        toast.success("Predaja potrjena. Izplačilo je sproženo.");
                        setVerifyPickupPinModal({ isOpen: false, auctionId: "" });
                        fetchAuctions();
                        refreshUserData();
                      } else {
                        toast.error(data?.error || "Napačna koda.");
                      }
                    } catch (err: any) {
                      toast.error(err?.message || "Napaka pri preverjanju kode.");
                    } finally {
                      setVerifyPinLoading(false);
                    }
                  }}
                  className="flex flex-col gap-4"
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={pickupPinInput}
                    onChange={(e) => setPickupPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                    className="w-full text-center text-2xl sm:text-3xl font-mono font-black tracking-[0.3em] sm:tracking-[0.4em] py-3 sm:py-3.5 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl sm:rounded-2xl focus:border-[#FEBA4F] focus:bg-white outline-none transition-all"
                  />
                  <div className="flex flex-col gap-2.5 mt-2">
                    <LoadingButton
                      type="submit"
                      loading={verifyPinLoading}
                      loadingText="Preverjanje..."
                      disabled={verifyPinLoading || pickupPinInput.length !== 6}
                      className="w-full bg-[#0A1128] text-white py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
                    >
                      Potrdi predajo
                    </LoadingButton>
                    <button
                      type="button"
                      onClick={() => setVerifyPickupPinModal({ isOpen: false, auctionId: "" })}
                      disabled={verifyPinLoading}
                      className="w-full bg-slate-100 text-slate-600 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-slate-200 transition-all min-h-[40px]"
                    >
                      Zapri
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Portal>
        )}

        {qrScannerModal.isOpen && (
          <QrScannerModal
            isOpen={qrScannerModal.isOpen}
            auctionId={qrScannerModal.auctionId}
            auctionTitle={qrScannerModal.auctionTitle}
            onClose={() => setQrScannerModal({ isOpen: false, auctionId: "", auctionTitle: "" })}
            onScanSuccess={(data) => {
              setQrScannerModal({ isOpen: false, auctionId: "", auctionTitle: "" });
              setPendingPrevzemQr(data);
              try { sessionStorage.setItem('pending_prevzem_qr', JSON.stringify(data)); } catch (e) {}
              if (qrScannerModal.auctionTitle) {
                setPrevzemAuctionTitle(qrScannerModal.auctionTitle);
              }
              setPrevzemModalOpen(true);
            }}
            onSwitchToPin={() => {
              const currentAuctionId = qrScannerModal.auctionId;
              setQrScannerModal({ isOpen: false, auctionId: "", auctionTitle: "" });
              setPickupPinInput("");
              setVerifyPickupPinModal({ isOpen: true, auctionId: currentAuctionId });
            }}
          />
        )}

        {prevzemModalOpen && pendingPrevzemQr && (
          <Portal>
            {/* Deutscher Kommentar: Responsives Modal fuer QR-Uebergabebestaetigung */}
            <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-6 animate-in" onClick={(e) => e.stopPropagation()}>
              <div className="bg-white w-full max-w-md rounded-3xl sm:rounded-[1.35rem] p-5 sm:p-10 shadow-2xl relative text-center max-h-[92dvh] overflow-y-auto">
                <div className="bg-amber-100 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <Key size={32} className="text-amber-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-[#0A1128] uppercase tracking-tighter mb-2 sm:mb-3">
                  Potrditev predaje
                </h2>
                {prevzemAuctionTitle && (
                  <p className="text-xs sm:text-sm font-bold text-[#0A1128] mb-2 bg-slate-100 py-2 px-3 sm:px-4 rounded-xl">
                    {prevzemAuctionTitle}
                  </p>
                )}
                {prevzemError ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-red-500 font-bold mb-4 sm:mb-6 text-xs sm:text-sm">{prevzemError}</p>
                    <button
                      onClick={() => {
                        setPrevzemModalOpen(false);
                        setPendingPrevzemQr(null);
                        setPrevzemError(null);
                        sessionStorage.removeItem('pending_prevzem_qr');
                      }}
                      className="w-full bg-[#0A1128] text-white py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all min-h-[44px]"
                    >
                      Zapri
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-slate-500 font-bold mb-4 sm:mb-6 text-xs sm:text-sm">
                      Potrdite samo, če ste predmet izročili kupcu.
                    </p>
                    <LoadingButton
                      onClick={async () => {
                        setPrevzemLoading(true);
                        try {
                          const token = await user?.getIdToken();
                          const res = await fetch(`/api/orders/${pendingPrevzemQr!.auctionId}/verify-pickup-qr`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ token: pendingPrevzemQr!.token })
                          });
                          const data = await res.json().catch(() => ({}));
                          if (res.ok && data?.success) {
                            toast.success("Predaja potrjena. Izplačilo je sproženo.");
                            setPrevzemModalOpen(false);
                            setPendingPrevzemQr(null);
                            sessionStorage.removeItem('pending_prevzem_qr');
                            fetchAuctions();
                            if (userData?.id) refreshUserData(userData.id);
                          } else {
                            toast.error(data?.error || "Napaka pri potrditvi predaje.");
                          }
                        } catch (err: any) {
                          toast.error(err?.message || "Napaka pri potrditvi predaje.");
                        } finally {
                          setPrevzemLoading(false);
                        }
                      }}
                      loading={prevzemLoading}
                      loadingText="Potrjevanje..."
                      disabled={prevzemLoading}
                      className="w-full bg-[#0A1128] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      Potrdi predajo
                    </LoadingButton>
                    <button
                      onClick={() => {
                        setPrevzemModalOpen(false);
                        setPendingPrevzemQr(null);
                        sessionStorage.removeItem('pending_prevzem_qr');
                      }}
                      disabled={prevzemLoading}
                      className="w-full bg-slate-100 text-slate-600 py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-slate-200 transition-all"
                    >
                      Prekliči
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Portal>
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
