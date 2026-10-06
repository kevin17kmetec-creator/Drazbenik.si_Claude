import React, { useState, useRef } from 'react';
import { 
  ArrowLeft, 
  FileText, 
  Mail, 
  Wallet, 
  RefreshCw, 
  Download, 
  Eye, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  PlusCircle, 
  Building2, 
  User, 
  Clock, 
  Trophy, 
  AlertTriangle, 
  ExternalLink,
  Receipt,
  FileCheck,
  Package,
  Layers,
  LayoutGrid,
  Sliders,
  Sparkles,
  ChevronRight,
  Gavel,
  ShieldCheck,
  Globe
} from 'lucide-react';
import { toast } from 'sonner';
import { PackageCard } from "@/src/components/auction/PackageCard";
import { AuctionCard } from "@/src/components/auction/AuctionCard";
import { AuctionItem } from '../../types';
import { 
  mockSandboxPackageId, 
  mockSandboxPackageItems, 
  mockSandboxStandaloneItems 
} from "../../data/mockSandboxData";
import { auth } from "../../lib/firebase";
import { getAuthHeaders } from "../../lib/authFetch";

interface TestSandboxViewProps {
  onBack: () => void;
  userData: any;
  onRefreshUserData?: () => void;
  onOpenInvoiceModal?: (auction: any, seller: any, buyer: any) => void;
  t: (key: string) => string;
  language?: string;
  isVerified?: boolean;
  onAuctionClick?: (item: any) => void;
  onSelectPackage?: (packageId: string) => void;
  watchlist?: string[];
  onWatchToggle?: (id: string) => void;
  onBidSubmit?: (item: any, amount: number) => Promise<any> | void;
  onSellerClick?: (seller: any) => void;
}

type RelationshipType = 'individual_individual' | 'company_individual' | 'individual_company' | 'company_company';

export const TestSandboxView: React.FC<TestSandboxViewProps> = ({
  onBack,
  userData,
  onRefreshUserData,
  onOpenInvoiceModal,
  t,
  language = 'SLO',
  isVerified = true,
  onAuctionClick,
  onSelectPackage,
  watchlist = [],
  onWatchToggle,
  onBidSubmit,
  onSellerClick
}) => {
  // --- SECTION 0: SANDBOX TABS & VISUAL PLAYGROUND STATE ---
  const [activeTab, setActiveTab] = useState<'auctions' | 'invoices' | 'emails' | 'wallet' | 'cron' | 'all'>('auctions');
  const [filterMode, setFilterMode] = useState<'all' | 'package' | 'standalone'>('all');
  const [columnMode, setColumnMode] = useState<'auto' | '3cols' | '4cols'>('auto');
  const [testLanguage, setTestLanguage] = useState<string>(language);
  const [testIsVerified, setTestIsVerified] = useState<boolean>(isVerified);
  const [showPackageInspector, setShowPackageInspector] = useState<boolean>(true);

  // Live state for interactive preview
  const [packageItems, setPackageItems] = useState<AuctionItem[]>(mockSandboxPackageItems);
  const [standaloneItems, setStandaloneItems] = useState<AuctionItem[]>(mockSandboxStandaloneItems);
  const [localWatchlist, setLocalWatchlist] = useState<string[]>(watchlist);

  const handleLocalWatchToggle = (id: string) => {
    setLocalWatchlist(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    if (onWatchToggle) onWatchToggle(id);
  };

  const handleLocalBidSubmit = async (item: AuctionItem, amount: number) => {
    if (onBidSubmit) {
      const res = await onBidSubmit(item, amount);
      if (res === 'ok') {
        // Also update local copy for immediate reactivity
        if (item.is_package) {
          setPackageItems(prev => prev.map(a => a.id === item.id ? {
            ...a,
            currentBid: amount,
            bidCount: (a.bidCount || 0) + 1,
            biddingHistory: [
              { id: 'b_new_' + Date.now(), bidderId: userData?.id || 'usr_me', bidderName: userData?.first_name || 'Vi (Kupec)', amount, timestamp: new Date() },
              ...a.biddingHistory
            ]
          } : a));
        } else {
          setStandaloneItems(prev => prev.map(a => a.id === item.id ? {
            ...a,
            currentBid: amount,
            bidCount: (a.bidCount || 0) + 1,
            biddingHistory: [
              { id: 'b_new_' + Date.now(), bidderId: userData?.id || 'usr_me', bidderName: userData?.first_name || 'Vi (Kupec)', amount, timestamp: new Date() },
              ...a.biddingHistory
            ]
          } : a));
        }
      }
      return res;
    }
    // Fallback local update
    if (item.is_package) {
      setPackageItems(prev => prev.map(a => a.id === item.id ? {
        ...a,
        currentBid: amount,
        bidCount: (a.bidCount || 0) + 1,
        biddingHistory: [
          { id: 'b_new_' + Date.now(), bidderId: userData?.id || 'usr_me', bidderName: userData?.first_name || 'Vi (Kupec)', amount, timestamp: new Date() },
          ...a.biddingHistory
        ]
      } : a));
    } else {
      setStandaloneItems(prev => prev.map(a => a.id === item.id ? {
        ...a,
        currentBid: amount,
        bidCount: (a.bidCount || 0) + 1,
        biddingHistory: [
          { id: 'b_new_' + Date.now(), bidderId: userData?.id || 'usr_me', bidderName: userData?.first_name || 'Vi (Kupec)', amount, timestamp: new Date() },
          ...a.biddingHistory
        ]
      } : a));
    }
    toast.success(`Testna ponudba ${amount} € uspešno oddana!`);
    return 'ok';
  };

  // --- SECTION 1: PDF INVOICE STATE ---
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('company_individual');
  const [itemTitle, setItemTitle] = useState('Industrijski CNC obdelovalni center Haas VF-2');
  const [itemPrice, setItemPrice] = useState(1250);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'post'>('pickup');
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isServerPdfDownloading, setIsServerPdfDownloading] = useState(false);

  // Dynamic party data based on relationship
  const [sellerData, setSellerData] = useState({
    name: 'Strojegradnja d.o.o.',
    address: 'Industrijska cona 5, 2000 Maribor',
    taxId: 'SI12345678',
    regNo: '8876543000',
    isCompany: true
  });

  const [buyerData, setBuyerData] = useState({
    name: 'Ana Novak',
    address: 'Titova cesta 8, 2000 Maribor',
    taxId: '',
    regNo: '',
    isCompany: false
  });

  const invoicePreviewRef = useRef<HTMLDivElement>(null);

  // Handle relationship switch preset
  const handleRelationshipChange = (type: RelationshipType) => {
    setRelationshipType(type);
    if (type === 'individual_individual') {
      setSellerData({
        name: 'Marko Horvat',
        address: 'Celjska cesta 42, 3000 Celje',
        taxId: '',
        regNo: '',
        isCompany: false
      });
      setBuyerData({
        name: 'Luka Kovačič',
        address: 'Tržaška cesta 12, 1000 Ljubljana',
        taxId: '',
        regNo: '',
        isCompany: false
      });
    } else if (type === 'company_individual') {
      setSellerData({
        name: 'Strojegradnja d.o.o.',
        address: 'Industrijska cona 5, 2000 Maribor',
        taxId: 'SI12345678',
        regNo: '8876543000',
        isCompany: true
      });
      setBuyerData({
        name: 'Ana Novak',
        address: 'Titova cesta 8, 2000 Maribor',
        taxId: '',
        regNo: '',
        isCompany: false
      });
    } else if (type === 'individual_company') {
      setSellerData({
        name: 'Janez Kranjc',
        address: 'Cesta v Gorice 14, 1000 Ljubljana',
        taxId: '54892147',
        regNo: '',
        isCompany: false
      });
      setBuyerData({
        name: 'TechTrade d.o.o.',
        address: 'Letališka cesta 33, 1000 Ljubljana',
        taxId: 'SI87654321',
        regNo: '9988776000',
        isCompany: true
      });
    } else if (type === 'company_company') {
      setSellerData({
        name: 'MetalOpus d.o.o.',
        address: 'Obrtna cona 12, 4000 Kranj',
        taxId: 'SI98765432',
        regNo: '7766554000',
        isCompany: true
      });
      setBuyerData({
        name: 'AvtoTech Solutions d.o.o.',
        address: 'Šmartinska cesta 152, 1000 Ljubljana',
        taxId: 'SI45678901',
        regNo: '5544332000',
        isCompany: true
      });
    }
  };

  // Download client-rendered PDF (matches InvoiceModal exactly)
  const handleDownloadClientPDF = async () => {
    if (!invoicePreviewRef.current) return;
    setIsPdfGenerating(true);
    try {
      // Dynamically import required libraries on button click (Task 27)
      const [html2canvasModule, jspdfModule, jspdfAutotableModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      const html2canvas = html2canvasModule.default;
      const jsPDF = jspdfModule.default;

      // Instead of html2canvas which fails on some CSS, we use a hidden iframe or print window to generate a clean vector PDF
      const contentHtml = invoicePreviewRef.current.innerHTML;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Račun</title>
              <style>
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;900&display=swap');
                body {
                  font-family: 'Plus Jakarta Sans', sans-serif;
                  padding: 20px;
                  color: #0A1128;
                }
                * {
                  box-sizing: border-box;
                }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 12px; text-align: left; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .flex { display: flex; }
                .justify-between { justify-content: space-between; }
                .mb-10 { margin-bottom: 40px; }
                .mb-12 { margin-bottom: 48px; }
                .p-12 { padding: 48px; }
                .font-black { font-weight: 900; }
                .font-bold { font-weight: 700; }
                .text-sm { font-size: 14px; }
                .text-xs { font-size: 12px; }
                .uppercase { text-transform: uppercase; }
              </style>
            </head>
            <body>
              ${contentHtml}
              <script>
                window.onload = () => {
                  setTimeout(() => {
                    window.print();
                    window.close();
                  }, 500);
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
      toast.success('PDF račun uspešno prenesen!');
    } catch (err: any) {
      console.error('PDF error', err);
      toast.error('Napaka pri generiranju PDF: ' + err.message);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  // Download server-rendered PDF
  const handleDownloadServerPDF = async (docType: 'invoice' | 'certificate') => {
    setIsServerPdfDownloading(true);
    try {
      const response = await fetch('/api/test/generate-pdf', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          relationshipType,
          sellerData: {
            first_name: sellerData.name.split(' ')[0],
            last_name: sellerData.name.split(' ')[1] || '',
            company_name: sellerData.isCompany ? sellerData.name : undefined,
            address: sellerData.address,
            tax_id: sellerData.taxId,
            registration_number: sellerData.regNo,
            company_status: sellerData.isCompany ? 'company' : 'individual',
            user_type: sellerData.isCompany ? 'business' : 'individual'
          },
          buyerData: {
            first_name: buyerData.name.split(' ')[0],
            last_name: buyerData.name.split(' ')[1] || '',
            company_name: buyerData.isCompany ? buyerData.name : undefined,
            address: buyerData.address,
            tax_id: buyerData.taxId,
            registration_number: buyerData.regNo,
            company_status: buyerData.isCompany ? 'company' : 'individual',
            user_type: buyerData.isCompany ? 'business' : 'individual'
          },
          itemTitle,
          itemPrice,
          docType
        })
      });

      if (!response.ok) {
        throw new Error('Strežnik je vrnil napako pri generiranju PDF.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = docType === 'certificate' ? `Testno_Potrdilo_${relationshipType}.pdf` : `Testni_Racun_Server_${relationshipType}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(docType === 'certificate' ? 'Potrdilo o nakupu preneseno!' : 'Uradni račun prenesen!');
    } catch (err: any) {
      console.error('Server PDF error:', err);
      toast.error(err.message || 'Napaka pri prenosu strežniškega PDF');
    } finally {
      setIsServerPdfDownloading(false);
    }
  };

  // --- SECTION 2: EMAIL SUITE STATE ---
  const [targetEmail, setTargetEmail] = useState(userData?.email || 'kevin17kmetec@gmail.com');
  const [emailStatus, setEmailStatus] = useState<{ [key: string]: 'idle' | 'loading' | 'success' | 'error' }>({});
  const [emailLogs, setEmailLogs] = useState<any[]>([]);

  const handleSendTestEmail = async (type: 'outbid' | 'ending_soon' | 'won' | 'payment_reminder' | 'receipt_invoice', label: string) => {
    if (!targetEmail || !targetEmail.includes('@')) {
      toast.error('Prosimo, vpišite veljaven e-poštni naslov.');
      return;
    }

    setEmailStatus(prev => ({ ...prev, [type]: 'loading' }));
    try {
      const response = await fetch('/api/test/send-email', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          toEmail: targetEmail,
          type,
          recipientName: userData?.first_name ? `${userData.first_name} ${userData.last_name || ''}` : 'Kevin Kmetec',
          auctionId: `AUC-TEST-${Date.now().toString().substring(7)}`,
          auctionTitle: itemTitle,
          currentPrice: itemPrice,
        })
      });

      let data: any;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Strežnik je vrnil neveljaven odgovor (${response.status}): ${text.slice(0, 150)}`);
      }

      if (!response.ok || !data.success) {
        const errorMsg = data.error || data.details?.error || data.message || 'Napaka pri pošiljanju.';
        throw new Error(errorMsg);
      }

      setEmailStatus(prev => ({ ...prev, [type]: 'success' }));
      toast.success(`E-mail (${label}) uspešno poslan na ${targetEmail}!`);
      setEmailLogs(prev => [
        {
          id: Date.now(),
          type,
          label,
          toEmail: targetEmail,
          time: new Date().toLocaleTimeString('sl-SI'),
          status: 'success',
          resendConfigured: data.resendConfigured,
          details: data.details
        },
        ...prev
      ]);
    } catch (err: any) {
      console.error('Send email error:', err);
      setEmailStatus(prev => ({ ...prev, [type]: 'error' }));
      toast.error(err.message || 'Napaka pri pošiljanju e-pošte');
      setEmailLogs(prev => [
        {
          id: Date.now(),
          type,
          label,
          toEmail: targetEmail,
          time: new Date().toLocaleTimeString('sl-SI'),
          status: 'error',
          error: err.message
        },
        ...prev
      ]);
    }
  };

  // --- SECTION 3: WALLET PAYOUT STATE ---
  const [payoutAmount, setPayoutAmount] = useState(50);
  const [isExecutingRealPayout, setIsExecutingRealPayout] = useState(false);
  const [isPayoutRunning, setIsPayoutRunning] = useState(false);
  const [payoutLogs, setPayoutLogs] = useState<string[]>([]);
  const [isAddingFunds, setIsAddingFunds] = useState(false);

  const handleTestPayout = async () => {
    if (!userData?.id) {
      toast.error('Uporabnik ni prijavljen ali nima ID-ja.');
      return;
    }

    setIsPayoutRunning(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          if (token) headers['Authorization'] = `Bearer ${token}`;
        } catch (_) {}
      }

      const response = await fetch('/api/test/test-payout', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          user_id: userData.id,
          amount: payoutAmount,
          executeReal: isExecutingRealPayout
        })
      });

      let data: any;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Strežnik (${response.status}): ${text.slice(0, 150)}`);
      }

      if (!response.ok || !data.success) {
        setPayoutLogs(data.logs || [data.error || 'Neznana napaka']);
        throw new Error(data.error || 'Izplačilo ni uspelo');
      }

      setPayoutLogs(data.logs || []);
      toast.success(isExecutingRealPayout ? `Izplačilo ${payoutAmount} € uspešno izvedeno!` : `Diagnostika izplačila uspešno končana!`);
      if (onRefreshUserData) onRefreshUserData();
    } catch (err: any) {
      console.error('Test payout error:', err);
      toast.error(err.message || 'Napaka pri izplačilu');
    } finally {
      setIsPayoutRunning(false);
    }
  };

  const handleAddTestFunds = async () => {
    if (!userData?.id) return;
    setIsAddingFunds(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          if (token) headers['Authorization'] = `Bearer ${token}`;
        } catch (_) {}
      }

      const clientKey = `fund_${userData.id}_${Date.now()}`;
      const res = await fetch('/api/test/add-test-funds', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          user_id: userData.id,
          amount: 100,
          idempotencyKey: clientKey
        })
      });
      let data: any;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Strežnik (${res.status}): ${text.slice(0, 150)}`);
      }
      if (!res.ok) throw new Error(data.error || 'Napaka pri testnem plačilu');
      const piSnippet = data.stripe_payment_intent_id ? ` (Stripe: ${data.stripe_payment_intent_id.slice(0, 12)}...)` : '';
      toast.success(`Stripe testno plačilo uspešno! Dodano +100,00 € dobroimetja${piSnippet}`);
      if (onRefreshUserData) onRefreshUserData();
    } catch (e: any) {
      toast.error(e.message || 'Napaka pri dodajanju testnih sredstev');
    } finally {
      setIsAddingFunds(false);
    }
  };

  // --- SECTION 4: CRON TRIGGER ---
  const [isCronRunning, setIsCronRunning] = useState(false);
  const [cronReport, setCronReport] = useState<any>(null);

  const handleRunCron = async () => {
    setIsCronRunning(true);
    try {
      const res = await fetch('/api/admin/run-cron', {
        method: 'POST',
        headers: await getAuthHeaders()
      });
      let data: any;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Strežnik (${res.status}): ${text.slice(0, 150)}`);
      }
      setCronReport(data);
      toast.success('Cron opravila uspešno izvedena!');
    } catch (e: any) {
      console.error('Cron error:', e);
      toast.error('Napaka pri zagonu Cron: ' + e.message);
    } finally {
      setIsCronRunning(false);
    }
  };

  const isB2B = relationshipType === 'company_company';
  const isB2C = relationshipType === 'company_individual' || (sellerData.isCompany && !buyerData.isCompany);
  const isC2B = relationshipType === 'individual_company' || (!sellerData.isCompany && buyerData.isCompany);
  const isC2C = relationshipType === 'individual_individual' || (!sellerData.isCompany && !buyerData.isCompany);
  const isSellerIndividual = !sellerData.isCompany;
  const isSellerVatPayer = sellerData.isCompany;

  const vatRate = 0.22;
  const isVatApplicable = (isB2C || isB2B) && isSellerVatPayer;
  const vatBase = isVatApplicable ? itemPrice / (1 + vatRate) : itemPrice;
  const vatAmount = isVatApplicable ? itemPrice - vatBase : 0;

  const getCleanSellerPlace = (addressStr: string) => {
    if (!addressStr) return 'Slovenija';
    const parts = addressStr.split(',');
    let raw = parts.length > 1 ? parts[parts.length - 1].trim() : addressStr;
    if (raw.toLowerCase() === 'slovenija' && parts.length > 2) {
      raw = parts[parts.length - 2].trim();
    }
    let cleaned = (raw || 'Ljubljana')
      .replace(/SI-?\s*\d{4}/gi, '')
      .replace(/\b\d{4}\b/g, '')
      .trim()
      .replace(/^,\s*|,\s*$/g, '');

    if (!cleaned) cleaned = 'Ljubljana';
    if (!cleaned.toLowerCase().includes('slovenija')) {
      cleaned = `${cleaned}, Slovenija`;
    }
    return cleaned;
  };

  return (
    <div className="max-w-[1600px] mx-auto py-12 px-4 sm:px-6 lg:px-8 animate-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10 pb-6 border-b border-slate-200">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 mb-4 font-black uppercase text-xs tracking-widest hover:text-[#0A1128] transition-colors group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Nazaj na platformo
          </button>
          <div className="flex items-center gap-3">
            <span className="bg-[#FEBA4F] text-[#0A1128] text-xs font-black uppercase px-3 py-1 rounded-full">
              Testni laboratorij
            </span>
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-[#0A1128]">
              Nadzorna plošča za testiranje funkcij
            </h1>
          </div>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Preverite generiranje PDF računov, e-poštnih obvestil, izplačil denarnice ter samodejnih procesov ob zaključku dražb.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <Wallet className="text-[#FEBA4F]" size={20} />
          <div>
            <div className="text-[10px] font-black uppercase text-slate-400">Vaša denarnica</div>
            <div className="text-sm font-black text-[#0A1128]">
              {(Number(userData?.wallet_balance) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2 })} €
            </div>
          </div>
        </div>
      </div>

      {/* Top Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 border-b border-slate-200 scrollbar-none">
        <button
          onClick={() => setActiveTab('auctions')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'auctions'
              ? 'bg-[#0A1128] text-[#FEBA4F] shadow-lg scale-102'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <LayoutGrid size={16} />
          <span>1. Predogled dražb & Zbirk (7 v zbirki)</span>
          <span className="bg-[#FEBA4F] text-[#0A1128] text-[10px] px-2 py-0.5 rounded-full font-black">NOVO</span>
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'invoices'
              ? 'bg-[#0A1128] text-[#FEBA4F] shadow-lg scale-102'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Receipt size={16} />
          <span>2. PDF Računi & Pogodbe</span>
        </button>

        <button
          onClick={() => setActiveTab('emails')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'emails'
              ? 'bg-[#0A1128] text-[#FEBA4F] shadow-lg scale-102'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Mail size={16} />
          <span>3. E-poštna obvestila</span>
        </button>

        <button
          onClick={() => setActiveTab('wallet')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'wallet'
              ? 'bg-[#0A1128] text-[#FEBA4F] shadow-lg scale-102'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Wallet size={16} />
          <span>4. Izplačila denarnice</span>
        </button>

        <button
          onClick={() => setActiveTab('cron')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'cron'
              ? 'bg-[#0A1128] text-[#FEBA4F] shadow-lg scale-102'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock size={16} />
          <span>5. Cron opravila</span>
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-[#0A1128] text-[#FEBA4F] shadow-lg scale-102'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers size={16} />
          <span>Vsi moduli skupaj</span>
        </button>
      </div>

      <div className="space-y-16">
        {/* ========================================================================= */}
        {/* MODUL 0: VIZUALNI PREDOGLED DRAŽB & 7-DELNEGA PAKETA (PLAYGROUND) */}
        {/* ========================================================================= */}
        {(activeTab === 'auctions' || activeTab === 'all') && (
          <section className="bg-white rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-xl">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <LayoutGrid size={28} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-800 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                      Vizualni laboratorij
                    </span>
                    <span className="text-xs text-slate-400 font-bold">
                      1 zbirka s 7 artikli + 3 samostojne dražbe
                    </span>
                  </div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-[#0A1128] mt-1">
                    Predogled postavitve dražb (Posamične & Zbirke dražb)
                  </h2>
                  <p className="text-slate-500 text-sm font-medium">
                    Preverite enoten izgled kartic, testirajte odpiranje podstrani z enim klikom ter preizkušajte različne postavitve in nastavitve.
                  </p>
                </div>
              </div>

              {/* Action summary badge */}
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 shrink-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs">
                  ✓
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase text-slate-400">Interaktivno testiranje</div>
                  <div className="text-xs font-black text-[#0A1128]">Klik na dražbo odpre pravo podstran</div>
                </div>
              </div>
            </div>

            {/* Layout Controls & Toolbar */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-10 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Filter Mode */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase text-slate-500 mr-2 flex items-center gap-1.5">
                    <Sliders size={14} /> Prikaz:
                  </span>
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      filterMode === 'all'
                        ? 'bg-[#0A1128] text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    Vse dražbe (Zbirka + Posamične)
                  </button>
                  <button
                    onClick={() => setFilterMode('package')}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      filterMode === 'package'
                        ? 'bg-[#0A1128] text-[#FEBA4F] shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    Samo Zbirka (7 artiklov)
                  </button>
                  <button
                    onClick={() => setFilterMode('standalone')}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      filterMode === 'standalone'
                        ? 'bg-[#FEBA4F] text-[#0A1128] shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    Samo Posamične dražbe
                  </button>
                </div>

                {/* Column Layout Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-slate-500 mr-1">Mreža:</span>
                  <button
                    onClick={() => setColumnMode('auto')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      columnMode === 'auto'
                        ? 'bg-[#0A1128] text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    Auto (320px)
                  </button>
                  <button
                    onClick={() => setColumnMode('3cols')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      columnMode === '3cols'
                        ? 'bg-[#0A1128] text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    3 stolpci
                  </button>
                  <button
                    onClick={() => setColumnMode('4cols')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      columnMode === '4cols'
                        ? 'bg-[#0A1128] text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    4 stolpci
                  </button>
                </div>
              </div>

              {/* Secondary Controls: Language & Verification Status */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200/70 text-xs">
                <div className="flex items-center gap-4">
                  {/* Language */}
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-slate-400" />
                    <span className="font-bold text-slate-500 uppercase text-[10px]">Testni jezik:</span>
                    <div className="flex rounded-lg overflow-hidden border border-slate-300">
                      {['SLO', 'EN', 'DE'].map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setTestLanguage(lang)}
                          className={`px-2.5 py-1 text-xs font-bold ${
                            testLanguage === lang
                              ? 'bg-[#0A1128] text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Verification Toggle */}
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-slate-400" />
                    <span className="font-bold text-slate-500 uppercase text-[10px]">Stanje uporabnika:</span>
                    <button
                      onClick={() => setTestIsVerified(!testIsVerified)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                        testIsVerified
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-amber-50 text-amber-800 border-amber-300'
                      }`}
                    >
                      {testIsVerified ? 'Overjen račun (Verified)' : 'Neoverjen račun'}
                    </button>
                  </div>
                </div>

                {/* Toggle 7 items drawer */}
                <button
                  onClick={() => setShowPackageInspector(!showPackageInspector)}
                  className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors"
                >
                  <Layers size={14} className="text-[#FEBA4F]" />
                  <span>{showPackageInspector ? 'Skrij vseh 7 artiklov zbirke' : 'Prikaži vseh 7 artiklov v zbirki (Standardne kartice)'}</span>
                </button>
              </div>
            </div>

            {/* LIVE PREVIEW CANVAS */}
            <div className="space-y-12">
              {/* 1. PACKAGE AUCTION PREVIEW */}
              {(filterMode === 'all' || filterMode === 'package') && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#FEBA4F] animate-pulse" />
                      <h3 className="text-lg font-black uppercase tracking-tight text-[#0A1128]">
                        Zbirka dražb (Poenotena tematska kartica)
                      </h3>
                    </div>
                    <span className="text-xs text-slate-400 font-bold">
                      7 povezanih artiklov istega prodajalca
                    </span>
                  </div>

                  <PackageCard
                    packageId={mockSandboxPackageId}
                    title="Zbirka delavniške opreme in strojev (7 artiklov)"
                    sellerName="Orodje & Stroji Pro d.o.o."
                    items={packageItems}
                    t={t}
                    language={testLanguage}
                    isVerified={testIsVerified}
                    onSelectPackage={(pkgId) => {
                      if (onSelectPackage) {
                        onSelectPackage(pkgId);
                      } else {
                        toast.info(`Odpri zbirko: ${pkgId}`);
                      }
                    }}
                    onAuctionClick={(item) => {
                      if (onAuctionClick) {
                        onAuctionClick(item);
                      } else {
                        toast.info(`Odpri dražbo: ${typeof item.title === 'object' ? item.title[testLanguage] || item.title.SLO : item.title}`);
                      }
                    }}
                  />
                </div>
              )}

              {/* 2. DETAILED 7-ITEM PACKAGE INSPECTOR (ALL 7 ITEMS DISPLAYED AS STANDARD AUCTION CARDS) */}
              {showPackageInspector && (filterMode === 'all' || filterMode === 'package') && (
                <div className="bg-slate-50 border border-slate-200 rounded-[2.5rem] p-6 sm:p-8 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                    <div>
                      <div className="flex items-center gap-2 text-[#0A1128] text-xs font-black uppercase tracking-wider">
                        <Layers size={16} className="text-[#FEBA4F]" />
                        <span>Celotna zbirka &bull; Vseh 7 artiklov (Identifikacija in kartice)</span>
                      </div>
                      <h4 className="text-xl font-black text-[#0A1128] mt-1">
                        Zbirka: Delavniška oprema in stroji (Orodje & Stroji Pro d.o.o.)
                      </h4>
                    </div>
                    <button
                      onClick={() => onSelectPackage && onSelectPackage(mockSandboxPackageId)}
                      className="bg-[#0A1128] hover:bg-[#FEBA4F] hover:text-[#0A1128] text-[#FEBA4F] font-black uppercase text-xs tracking-wider px-5 py-3 rounded-2xl transition-all shadow-lg flex items-center gap-2"
                    >
                      <span>Odpri namenski pogled zbirke (PackageView)</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div 
                    className="grid gap-8 justify-center mt-8"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 320px))' }}
                  >
                    {packageItems.map((item) => (
                      <AuctionCard
                        key={item.id}
                        item={item}
                        t={t}
                        language={testLanguage}
                        isVerified={testIsVerified}
                        currentUserId={userData?.id}
                        hasBid={false}
                        isWatched={localWatchlist.includes(item.id)}
                        onWatchToggle={() => handleLocalWatchToggle(item.id)}
                        onClick={() => {
                          if (onAuctionClick) onAuctionClick(item);
                          else toast.info(`Odpri dražbo: ${typeof item.title === 'object' ? item.title[testLanguage] || item.title.SLO : item.title}`);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 3. STANDALONE AUCTIONS PREVIEW */}
              {(filterMode === 'all' || filterMode === 'standalone') && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#FEBA4F] animate-pulse" />
                      <h3 className="text-lg font-black uppercase tracking-tight text-[#0A1128]">
                        Posamične / Samostojne dražbe (Standardne kartice)
                      </h3>
                    </div>
                    <span className="text-xs text-slate-400 font-bold">
                      Standardni prikaz posameznih dražb
                    </span>
                  </div>

                  <div
                    className={
                      columnMode === '3cols'
                        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-center'
                        : columnMode === '4cols'
                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-center'
                        : 'grid gap-8 justify-center'
                    }
                    style={columnMode === 'auto' ? { gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 320px))' } : undefined}
                  >
                    {standaloneItems.map((item) => (
                      <AuctionCard
                        key={item.id}
                        item={item}
                        t={t}
                        language={testLanguage}
                        isVerified={testIsVerified}
                        currentUserId={userData?.id}
                        hasBid={false}
                        isWatched={localWatchlist.includes(item.id)}
                        onWatchToggle={() => handleLocalWatchToggle(item.id)}
                        onClick={() => {
                          if (onAuctionClick) onAuctionClick(item);
                        }}
                        onBidSubmit={handleLocalBidSubmit}
                        onSellerClick={onSellerClick}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* MODUL 1: TESTNI PDF RAČUN IN POGODBE */}
        {/* ========================================================================= */}
        {(activeTab === 'invoices' || activeTab === 'all') && (
        <section className="bg-white rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-[#FEBA4F]/20 rounded-2xl flex items-center justify-center text-[#0A1128]">
                <Receipt size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-[#0A1128]">
                  1. Testni generator PDF računov in pogodb
                </h2>
                <p className="text-slate-500 text-sm font-medium">
                  Preverite točnost vseh podatkov, davčnih stopenj in pravnih klavzul za vsa 4 razmerja med strankama.
                </p>
              </div>
            </div>

            {/* Relationship Dropdown */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                Pravno razmerje:
              </label>
              <select
                value={relationshipType}
                onChange={(e) => handleRelationshipChange(e.target.value as RelationshipType)}
                className="bg-slate-50 border-2 border-slate-200 text-[#0A1128] font-bold text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#FEBA4F] transition-colors"
              >
                <option value="individual_individual">👤 Fizična oseba ➔ 👤 Fizična oseba (C2C)</option>
                <option value="company_individual">🏢 Podjetje ➔ 👤 Fizična oseba (B2C)</option>
                <option value="individual_company">👤 Fizična oseba ➔ 🏢 Podjetje (C2B)</option>
                <option value="company_company">🏢 Podjetje ➔ 🏢 Podjetje (B2B)</option>
              </select>
            </div>
          </div>

          {/* Configuration Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                Naslov artikla / predmeta dražbe
              </label>
              <input
                type="text"
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-[#0A1128] focus:outline-none focus:border-[#FEBA4F]"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                Končni znesek dražbe (€)
              </label>
              <input
                type="number"
                value={itemPrice}
                onChange={(e) => setItemPrice(Number(e.target.value) || 0)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-[#0A1128] focus:outline-none focus:border-[#FEBA4F]"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                Način prevzema / dostave
              </label>
              <select
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value as 'pickup' | 'post')}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-[#0A1128] focus:outline-none focus:border-[#FEBA4F]"
              >
                <option value="pickup">📍 Osebni prevzem</option>
                <option value="post">📦 Pošiljanje po pošti</option>
              </select>
            </div>
          </div>

          {/* Seller / Buyer Details Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Seller */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2 mb-4 text-[#0A1128] font-black text-sm uppercase">
                {sellerData.isCompany ? <Building2 size={18} className="text-[#FEBA4F]" /> : <User size={18} className="text-[#FEBA4F]" />}
                Izdajatelj / Prodajalec ({sellerData.isCompany ? 'Podjetje' : 'Fizična oseba'})
              </div>
              <div className="space-y-3 text-xs font-bold">
                <div>
                  <label className="text-slate-400 uppercase text-[10px]">Ime / Naziv podjetja:</label>
                  <input
                    type="text"
                    value={sellerData.name}
                    onChange={(e) => setSellerData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1128]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 uppercase text-[10px]">Naslov:</label>
                  <input
                    type="text"
                    value={sellerData.address}
                    onChange={(e) => setSellerData(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1128]"
                  />
                </div>
                {sellerData.isCompany ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-400 uppercase text-[10px]">ID za DDV:</label>
                      <input
                        type="text"
                        value={sellerData.taxId}
                        onChange={(e) => setSellerData(prev => ({ ...prev, taxId: e.target.value }))}
                        className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1128]"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 uppercase text-[10px]">Matična št.:</label>
                      <input
                        type="text"
                        value={sellerData.regNo}
                        onChange={(e) => setSellerData(prev => ({ ...prev, regNo: e.target.value }))}
                        className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1128]"
                      />
                    </div>
                  </div>
                ) : isC2B ? (
                  <div>
                    <label className="text-slate-400 uppercase text-[10px]">Davčna številka prodajalca (obvezno za C2B):</label>
                    <input
                      type="text"
                      value={sellerData.taxId}
                      placeholder="npr. 54892147"
                      onChange={(e) => setSellerData(prev => ({ ...prev, taxId: e.target.value }))}
                      className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1128]"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* Buyer */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2 mb-4 text-[#0A1128] font-black text-sm uppercase">
                {buyerData.isCompany ? <Building2 size={18} className="text-[#FEBA4F]" /> : <User size={18} className="text-[#FEBA4F]" />}
                Prejemnik / Kupec ({buyerData.isCompany ? 'Podjetje' : 'Fizična oseba'})
              </div>
              <div className="space-y-3 text-xs font-bold">
                <div>
                  <label className="text-slate-400 uppercase text-[10px]">Ime / Naziv kupca:</label>
                  <input
                    type="text"
                    value={buyerData.name}
                    onChange={(e) => setBuyerData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1128]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 uppercase text-[10px]">Naslov:</label>
                  <input
                    type="text"
                    value={buyerData.address}
                    onChange={(e) => setBuyerData(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1128]"
                  />
                </div>
                {buyerData.isCompany && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-400 uppercase text-[10px]">ID za DDV:</label>
                      <input
                        type="text"
                        value={buyerData.taxId}
                        onChange={(e) => setBuyerData(prev => ({ ...prev, taxId: e.target.value }))}
                        className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1128]"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 uppercase text-[10px]">Matična št.:</label>
                      <input
                        type="text"
                        value={buyerData.regNo}
                        onChange={(e) => setBuyerData(prev => ({ ...prev, regNo: e.target.value }))}
                        className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1128]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Download Buttons */}
          <div className="flex flex-wrap gap-4 mb-8">
            <button
              onClick={handleDownloadClientPDF}
              disabled={isPdfGenerating}
              className="bg-[#0A1128] text-white px-6 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Download size={16} />
              {isPdfGenerating ? 'Generiranje...' : 'Prenesi PDF Račun (Client)'}
            </button>

            <button
              onClick={() => handleDownloadServerPDF('invoice')}
              disabled={isServerPdfDownloading}
              className="bg-slate-100 text-[#0A1128] border-2 border-slate-200 px-6 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest hover:border-slate-400 hover:bg-slate-200 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <FileCheck size={16} />
              {isServerPdfDownloading ? 'Prenašanje...' : 'Prenesi Strežniški PDF (Server Kit)'}
            </button>

            {!buyerData.isCompany && (
              <button
                onClick={() => handleDownloadServerPDF('certificate')}
                disabled={isServerPdfDownloading}
                className="bg-slate-100 text-[#0A1128] border-2 border-slate-200 px-6 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest hover:border-slate-400 hover:bg-slate-200 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <FileText size={16} />
                Prenesi Potrdilo o nakupu (Certifikat)
              </button>
            )}

            {onOpenInvoiceModal && (
              <button
                onClick={() => {
                  onOpenInvoiceModal(
                    {
                      id: 'test-auction-mock-id',
                      title: { SLO: itemTitle, EN: itemTitle },
                      currentBid: itemPrice,
                      paid_at: new Date().toISOString(),
                      delivery_method: deliveryMethod
                    },
                    {
                      company_name: sellerData.isCompany ? sellerData.name : undefined,
                      first_name: sellerData.isCompany ? '' : sellerData.name,
                      address: sellerData.address,
                      taxId: sellerData.taxId,
                      company_status: sellerData.isCompany ? 'company' : 'individual'
                    },
                    {
                      company_name: buyerData.isCompany ? buyerData.name : undefined,
                      first_name: buyerData.isCompany ? '' : buyerData.name,
                      address: buyerData.address,
                      taxId: buyerData.taxId,
                      company_status: buyerData.isCompany ? 'company' : 'individual'
                    }
                  );
                }}
                className="bg-[#FEBA4F]/20 text-[#0A1128] border border-[#FEBA4F] px-6 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-[#FEBA4F] transition-all flex items-center gap-2 ml-auto"
              >
                <Eye size={16} />
                Odpri v uradnem Modalnem oknu
              </button>
            )}
          </div>

          {/* Live Invoice Preview Box */}
          <div className="border border-slate-200 rounded-3xl p-6 bg-slate-100/50 overflow-x-auto flex justify-center">
            <div
              ref={invoicePreviewRef}
              className="w-full max-w-[210mm] p-10 bg-white shadow-xl text-[#0A1128] font-sans"
              style={{ minHeight: '297mm', color: '#0A1128', backgroundColor: '#FFFFFF' }}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-12">
                <div>
                  <h1 className="text-3xl font-black tracking-tight mb-2 uppercase" style={{ color: '#0A1128' }}>
                    {isSellerIndividual ? 'KUPOPRODAJNA POGODBA' : 'RAČUN / INVOICE'}
                  </h1>
                  <p className="font-bold text-sm text-slate-500">Številka dokumenta: RAC-TEST-000001</p>
                  <p className="font-bold text-sm text-slate-500">
                    Kraj izdaje: {getCleanSellerPlace(sellerData.address)}
                  </p>
                  <p className="font-bold text-sm text-slate-500">Datum izdaje / sklenitve: {new Date().toLocaleDateString('sl-SI')}</p>
                  <p className="font-bold text-sm text-slate-500">Datum opravljene storitve/dobave: {new Date().toLocaleDateString('sl-SI')}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black tracking-tight italic text-slate-400">dražbenik.si</div>
                  <p className="text-xs font-bold text-slate-400">Platforma za posredovanje</p>
                </div>
              </div>

              {/* Parties */}
              <div className="flex justify-between mb-12 gap-8 border-y border-slate-200 py-6">
                {/* Seller */}
                <div className="w-1/2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                    Izdajatelj (Prodajalec)
                  </h3>
                  <p className="font-black text-base text-[#0A1128]">{sellerData.name}</p>
                  <p className="text-sm text-slate-600">{sellerData.address}</p>
                  <p className="text-xs text-slate-600 mt-1">Davčna številka: <strong>{sellerData.taxId || 'Ni navedena'}</strong></p>
                  {sellerData.regNo && <p className="text-xs text-slate-600">Matična številka: {sellerData.regNo}</p>}
                </div>

                {/* Buyer */}
                <div className="w-1/2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                    Prejemnik (Kupec)
                  </h3>
                  <p className="font-black text-base text-[#0A1128]">{buyerData.name}</p>
                  <p className="text-sm text-slate-600">{buyerData.address}</p>
                  <p className="text-xs text-slate-600 mt-1">Davčna številka: <strong>{buyerData.taxId || 'Ni navedena'}</strong></p>
                  {buyerData.regNo && <p className="text-xs text-slate-600">Matična številka: {buyerData.regNo}</p>}
                </div>
              </div>

              {/* Electronic Identification Note if tax numbers are not public/available */}
              {(!sellerData.taxId || !buyerData.taxId) && (
                <div className="mb-8 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                  <span className="text-[#FEBA4F] font-bold">ℹ</span>
                  <span><strong>Identifikacija:</strong> Stranki sta elektronsko identificirani znotraj platforme dražbenik.si.</span>
                </div>
              )}

              {/* Items Table */}
              <table className="w-full mb-8 border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#0A1128]">
                    <th className="text-left py-3 text-xs font-black uppercase tracking-wider">Opis</th>
                    <th className="text-center py-3 text-xs font-black uppercase tracking-wider w-20">Količina</th>
                    <th className="text-right py-3 text-xs font-black uppercase tracking-wider w-32">Cena (€)</th>
                    <th className="text-right py-3 text-xs font-black uppercase tracking-wider w-32">Skupaj (€)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-4">
                      <p className="font-bold text-sm">{itemTitle}</p>
                      <p className="text-xs text-slate-400">ID dražbe: AUC-TEST-{Date.now().toString().substring(8)}</p>
                    </td>
                    <td className="py-4 text-center font-bold text-sm">1</td>
                    <td className="py-4 text-right font-bold text-sm">{itemPrice.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-4 text-right font-black text-sm">{itemPrice.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <td colSpan={4} className="py-2.5 px-2 text-xs italic text-slate-500">
                      Način predaje: {deliveryMethod === 'post' ? 'Pošiljanje po pošti' : 'Osebni prevzem'}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end mb-10">
                <div className="w-72 space-y-2">
                  {isVatApplicable ? (
                    <>
                      <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                        <span>Osnova za DDV (22%):</span>
                        <span className="font-bold">{vatBase.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      </div>
                      <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                        <span>Znesek DDV (22%):</span>
                        <span className="font-bold">{vatAmount.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      </div>
                      <div className="flex justify-between py-3 text-base font-black uppercase border-t-2 border-[#0A1128] text-[#0A1128]">
                        <span>Skupaj za plačilo:</span>
                        <span>{itemPrice.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                        <span>Kupnina / Znesek:</span>
                        <span className="font-bold">{itemPrice.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      </div>
                      <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                        <span>DDV:</span>
                        <span className="font-bold">Ni obračunan</span>
                      </div>
                      <div className="flex justify-between py-3 text-base font-black uppercase border-t-2 border-[#0A1128] text-[#0A1128]">
                        <span>Za plačilo:</span>
                        <span>{itemPrice.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Legal Notes */}
              <div className="text-[11px] text-slate-600 pt-6 border-t border-slate-200 space-y-2">
                {isB2C ? (
                  <>
                    <p>
                      <strong>Jamstvo za neskladnost blaga (ZVPot-1):</strong> Za blago veljajo zakonska jamstva za neskladnost blaga v skladu z ZVPot-1.
                    </p>
                    <p>
                      <strong>Prenos lastništva:</strong> Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.
                    </p>
                    <p>
                      <strong>Pravna opomba in DDV:</strong> V ceno je vključen 22% DDV v skladu z Zakonom o davku na dodano vrednost (ZDDV-1).
                    </p>
                  </>
                ) : isB2B ? (
                  <>
                    <p>
                      <strong>Izjava o DDV in stanje opreme:</strong> V ceno je vključen 22% DDV v skladu z ZDDV-1. Za rabljeno opremo velja dogovorjeno stanje ob prevzemu (videno-kupljeno).
                    </p>
                    <p>
                      <strong>Prenos lastništva:</strong> Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.
                    </p>
                  </>
                ) : isC2B ? (
                  <>
                    <p>
                      <strong>Videno-kupljeno:</strong> Predmet se prodaja po načelu "videno-kupljeno". Prodajalec ne odgovarja za stvarne napake predmeta po njegovem prevzemu.
                    </p>
                    <p>
                      <strong>Prenos lastništva:</strong> Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.
                    </p>
                    <p>
                      <strong>Pravna opomba in DDV:</strong> Prodajalec je fizična oseba (C2B). DDV se v skladu z ZDDV-1 ne obračunava. Dokument služi kot kupoprodajna pogodba in dokazilo o plačilu.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>Videno-kupljeno:</strong> Predmet se prodaja po načelu "videno-kupljeno". Prodajalec ne odgovarja za stvarne napake predmeta po njegovem prevzemu.
                    </p>
                    <p>
                      <strong>Prenos lastništva:</strong> Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.
                    </p>
                    <p>
                      <strong>Pravna opomba in DDV:</strong> Prodajalec je fizična oseba (C2C). DDV se v skladu z ZDDV-1 ne obračunava. Dokument služi kot dokazilo o sklenjeni pogodbi in plačilu.
                    </p>
                  </>
                )}
                <p className="text-[10px] text-slate-400">
                  Platforma dražbenik.si nastopa izključno kot tehnološki posrednik. Dokument je pravno veljaven brez žiga ali podpisa v skladu z ZZEPA.
                </p>
              </div>
            </div>
            
            {/* PAGE 2: PLATFORM FEE INVOICE PREVIEW */}
            <div
              className="w-full max-w-[210mm] p-10 bg-white shadow-xl text-[#0A1128] font-sans ml-8 border-l-4 border-dashed border-slate-300"
              style={{ minHeight: '297mm', color: '#0A1128', backgroundColor: '#FFFFFF' }}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-12">
                <div className="w-full text-center">
                  <h1 className="text-3xl font-black tracking-tight mb-2 uppercase" style={{ color: '#0A1128' }}>
                    RAČUN ZA STORITEV / SERVICE INVOICE
                  </h1>
                </div>
              </div>

              {/* Parties */}
              <div className="flex justify-between mb-12 gap-8 border-y border-slate-200 py-6">
                {/* Platform (Dizain) */}
                <div className="w-1/2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                    Izdajatelj (Platforma)
                  </h3>
                  <p className="font-black text-base text-[#0A1128]">Dizain d.o.o.</p>
                  <p className="text-sm text-slate-600">Karantanska ulica 28, 2000 Maribor</p>
                  <p className="text-xs text-slate-600 mt-1">Davčna številka: <strong>SI57008060</strong></p>
                  <p className="text-xs text-slate-600">Matična številka: 9093494000</p>
                </div>

                {/* Buyer */}
                <div className="w-1/2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                    Prejemnik storitve (Kupec)
                  </h3>
                  <p className="font-black text-base text-[#0A1128]">{buyerData.name}</p>
                  <p className="text-sm text-slate-600">{buyerData.address}</p>
                  {buyerData.taxId && <p className="text-xs text-slate-600 mt-1">Davčna številka: <strong>{buyerData.taxId}</strong></p>}
                  {buyerData.regNo && <p className="text-xs text-slate-600">Matična številka: {buyerData.regNo}</p>}
                </div>
              </div>

              <div className="mb-12">
                <p className="font-bold text-sm text-slate-500">Številka računa: PROV-TEST-000001</p>
                <p className="font-bold text-sm text-slate-500">Datum izdaje in opravljene storitve: {new Date().toLocaleDateString('sl-SI')}</p>
                <p className="font-bold text-sm text-slate-500">Način plačila: Spletno plačilo / Kartica</p>
                <p className="font-bold text-sm text-slate-500">Status plačila: PLAČANO ({new Date().toLocaleDateString('sl-SI')})</p>
              </div>

              {/* Items Table */}
              <table className="w-full mb-8 border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#0A1128]">
                    <th className="text-left py-3 text-xs font-black uppercase tracking-wider">Opis</th>
                    <th className="text-right py-3 text-xs font-black uppercase tracking-wider w-32">Osnova (€)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-4">
                      <p className="font-bold text-sm">Provizija platforme za uporabo sistema</p>
                      <p className="text-xs text-slate-400">Dražba: {itemTitle}</p>
                    </td>
                    <td className="py-4 text-right font-bold text-sm">{(itemPrice * 0.05).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end mb-10">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                    <span>Osnova / Base:</span>
                    <span className="font-bold">{(itemPrice * 0.05).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                  </div>
                  {relationshipType === 'company_company' ? (
                    <>
                      <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                        <span>DDV / VAT (0% - Reverse Charge):</span>
                        <span className="font-bold">0,00 €</span>
                      </div>
                      <div className="py-1.5 text-[10px] text-slate-500 italic">
                        Obrnjena davčna obveznost v skladu z 1. točko 25. člena ZDDV-1.
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                      <span>DDV / VAT (22%):</span>
                      <span className="font-bold">{(itemPrice * 0.05 * 0.22).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 text-base font-black uppercase border-t-2 border-[#0A1128] text-[#0A1128]">
                    <span>Skupaj Provizija:</span>
                    <span>{(relationshipType === 'company_company' ? itemPrice * 0.05 : itemPrice * 0.05 * 1.22).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* ========================================================================= */}
        {/* MODUL 2: TESTIRANJE E-POŠTNIH OBVESTIL */}
        {/* ========================================================================= */}
        {(activeTab === 'emails' || activeTab === 'all') && (
        <section className="bg-white rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-xl">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <Mail size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-[#0A1128]">
                2. Testni center vseh E-poštnih obvestil (Resend)
              </h2>
              <p className="text-slate-500 text-sm font-medium">
                Pošljite realna testna e-poštna sporočila in preverite delovanje predlog, povezav in priponk v vašem poštnem predalu.
              </p>
            </div>
          </div>

          {/* Email target input */}
          <div className="max-w-xl mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
              Prejemni e-poštni naslov za testiranje:
            </label>
            <div className="flex gap-3">
              <input
                type="email"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                placeholder="vnesite@email.si"
                className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold text-[#0A1128] focus:outline-none focus:border-[#FEBA4F]"
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Nastavljeno na privzeti račun: <strong>{targetEmail}</strong>
            </p>
          </div>

          {/* Email Test Buttons Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* 1. Outbid */}
            <div className="p-6 rounded-2xl border-2 border-slate-100 hover:border-[#FEBA4F] transition-all bg-white flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-black text-xs">
                    ⚡
                  </div>
                  <h4 className="font-black text-sm uppercase text-[#0A1128]">
                    1. Presežena ponudba (Outbid)
                  </h4>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Sproži se takoj, ko drug ponudnik preseže trenutno vodilno ponudbo. Vsebuje gumb za takojšnjo ponovno oddajo ponudbe.
                </p>
              </div>
              <button
                onClick={() => handleSendTestEmail('outbid', 'Presežena ponudba')}
                disabled={emailStatus['outbid'] === 'loading'}
                className="w-full bg-[#0A1128] text-white py-3 rounded-xl font-black uppercase text-xs tracking-wider hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {emailStatus['outbid'] === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                Pošlji Outbid E-mail
              </button>
            </div>

            {/* 2. Ending Soon (30 min) */}
            <div className="p-6 rounded-2xl border-2 border-slate-100 hover:border-[#FEBA4F] transition-all bg-white flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center font-black text-xs">
                    ⏳
                  </div>
                  <h4 className="font-black text-sm uppercase text-[#0A1128]">
                    2. Opomnik 30 min pred iztekom
                  </h4>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Cron opravilo obvesti uporabnike, ki spremljajo dražbo ali so oddali ponudbo, ko je do zaključka le še 30 minut.
                </p>
              </div>
              <button
                onClick={() => handleSendTestEmail('ending_soon', 'Iztek čez 30 min')}
                disabled={emailStatus['ending_soon'] === 'loading'}
                className="w-full bg-[#0A1128] text-white py-3 rounded-xl font-black uppercase text-xs tracking-wider hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {emailStatus['ending_soon'] === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                Pošlji 30-min Opomnik
              </button>
            </div>

            {/* 3. Won Auction */}
            <div className="p-6 rounded-2xl border-2 border-slate-100 hover:border-[#FEBA4F] transition-all bg-white flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-black text-xs">
                    🏆
                  </div>
                  <h4 className="font-black text-sm uppercase text-[#0A1128]">
                    3. Zmaga na dražbi (Winner)
                  </h4>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Obvesti zmagovalca z neposredno povezavo do blagajne za varno plačilo v roku 24 ur.
                </p>
              </div>
              <button
                onClick={() => handleSendTestEmail('won', 'Zmaga na dražbi')}
                disabled={emailStatus['won'] === 'loading'}
                className="w-full bg-[#0A1128] text-white py-3 rounded-xl font-black uppercase text-xs tracking-wider hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {emailStatus['won'] === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                Pošlji Winner E-mail
              </button>
            </div>

            {/* 4. Payment Reminder (2h remaining) */}
            <div className="p-6 rounded-2xl border-2 border-slate-100 hover:border-[#FEBA4F] transition-all bg-white flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-black text-xs">
                    ⏰
                  </div>
                  <h4 className="font-black text-sm uppercase text-[#0A1128]">
                    4. Zadnji opomnik za plačilo (2h)
                  </h4>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Zadnje opozorilo zmagovalcu 2 uri pred iztekom 24-urnega roka pred prenosom ponudbe na 2. ponudnika.
                </p>
              </div>
              <button
                onClick={() => handleSendTestEmail('payment_reminder', 'Opomnik za plačilo 2h')}
                disabled={emailStatus['payment_reminder'] === 'loading'}
                className="w-full bg-[#0A1128] text-white py-3 rounded-xl font-black uppercase text-xs tracking-wider hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {emailStatus['payment_reminder'] === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                Pošlji Opomnik za plačilo
              </button>
            </div>

            {/* 5. Payment Receipt & PDF Invoices */}
            <div className="p-6 rounded-2xl border-2 border-slate-100 hover:border-[#FEBA4F] transition-all bg-white flex flex-col justify-between shadow-sm md:col-span-2">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center font-black text-xs">
                    🧾
                  </div>
                  <h4 className="font-black text-sm uppercase text-[#0A1128]">
                    5. Potrdilo o plačilu & PDF račun v priponki (Receipt & Attachments)
                  </h4>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Generira realen PDF račun in potrdilo o nakupu ter ju kot priponki pošlje na e-mail prek storitve Resend ob uspešnem plačilu.
                </p>
              </div>
              <button
                onClick={() => handleSendTestEmail('receipt_invoice', 'Potrdilo in PDF priponka')}
                disabled={emailStatus['receipt_invoice'] === 'loading'}
                className="w-full bg-[#FEBA4F] text-[#0A1128] py-3.5 rounded-xl font-black uppercase text-xs tracking-wider hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
              >
                {emailStatus['receipt_invoice'] === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                Pošlji Potrdilo o plačilu z računom v priponki
              </button>
            </div>
          </div>

          {/* Email Activity Log */}
          {emailLogs.length > 0 && (
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <h5 className="font-black uppercase text-xs text-slate-400 mb-3 tracking-wider">
                Dnevnik poslanih testnih sporočil
              </h5>
              <div className="space-y-2">
                {emailLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 text-xs font-bold">
                    <div className="flex items-center gap-3">
                      {log.status === 'success' ? (
                        <CheckCircle2 size={16} className="text-green-600" />
                      ) : (
                        <AlertCircle size={16} className="text-red-500" />
                      )}
                      <span>{log.label}</span>
                      <span className="text-slate-400">➔ {log.toEmail}</span>
                    </div>
                    <span className="text-slate-400 text-[10px]">{log.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        )}

        {/* ========================================================================= */}
        {/* MODUL 3: TEST IZPLAČILA IZ DENARNICE (WALLET PAYOUT) */}
        {/* ========================================================================= */}
        {(activeTab === 'wallet' || activeTab === 'all') && (
        <section className="bg-white rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-xl">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
            <div className="w-14 h-14 bg-amber-50 text-[#FEBA4F] rounded-2xl flex items-center justify-center">
              <Wallet size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-[#0A1128]">
                3. Testiranje izplačila denarnice (Wallet Payout Test)
              </h2>
              <p className="text-slate-500 text-sm font-medium">
                Preverite celoten proces izplačila dobroimetja iz denarnice, Stripe Connect povezavo in vodenje stanja.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Balance Overview */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-xs font-black uppercase text-slate-400">Trenutno stanje</span>
                <div className="text-3xl font-black text-[#0A1128] mt-1">
                  {((userData?.available_cents !== undefined ? userData.available_cents / 100 : Number(userData?.wallet_balance)) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2 })} €
                </div>
                {Boolean(userData?.held_cents) && (
                  <p className="text-[11px] font-semibold text-amber-600 mt-1">
                    Zadržano: {((userData?.held_cents || 0) / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2 })} €
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-2">
                  Uporabnik: <strong>{userData?.first_name || userData?.email || 'Testni račun'}</strong>
                </p>
              </div>

              <button
                onClick={handleAddTestFunds}
                disabled={isAddingFunds}
                className="mt-4 w-full bg-slate-200 text-slate-800 py-2.5 rounded-xl font-black uppercase text-xs hover:bg-slate-300 transition-colors flex items-center justify-center gap-2"
              >
                <PlusCircle size={14} />
                {isAddingFunds ? 'Dodajanje...' : '+ Dodaj 100 € testnega stanja'}
              </button>
            </div>

            {/* Payout amount input */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
                  Znesek testnega izplačila (€):
                </label>
                <input
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(Number(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-lg font-black text-[#0A1128] focus:outline-none focus:border-[#FEBA4F]"
                />
              </div>

              <label className="flex items-center gap-2 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isExecutingRealPayout}
                  onChange={(e) => setIsExecutingRealPayout(e.target.checked)}
                  className="w-4 h-4 rounded text-[#FEBA4F]"
                />
                <span className="text-xs font-bold text-slate-700">
                  Dejansko odštej iz stanja baze
                </span>
              </label>
            </div>

            {/* Execute Button */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col justify-center">
              <button
                onClick={handleTestPayout}
                disabled={isPayoutRunning}
                className="w-full bg-[#0A1128] text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isPayoutRunning ? <RefreshCw size={16} className="animate-spin" /> : <Wallet size={16} />}
                {isPayoutRunning ? 'Obdelava...' : 'Izvedi testno izplačilo'}
              </button>
              <p className="text-[11px] text-slate-400 text-center mt-3">
                Preveri KYC status, Stripe povezavo ter ustvari transakcijski zapis.
              </p>
            </div>
          </div>

          {/* Diagnostics Console */}
          {payoutLogs.length > 0 && (
            <div className="bg-[#0A1128] text-emerald-400 p-6 rounded-2xl font-mono text-xs space-y-1.5 shadow-inner">
              <div className="text-slate-400 font-sans font-black uppercase text-[10px] tracking-wider mb-2">
                Diagnostični dnevnik izplačila
              </div>
              {payoutLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">
                  {log}
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {/* ========================================================================= */}
        {/* MODUL 4: TEST CRON OPRAVIL (MANUAL CRON TRIGGER) */}
        {/* ========================================================================= */}
        {(activeTab === 'cron' || activeTab === 'all') && (
        <section className="bg-white rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-6 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                <Clock size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-[#0A1128]">
                  4. Ročni zagon Vercel Cron opravil
                </h2>
                <p className="text-slate-500 text-sm font-medium">
                  Preverite stanje vseh aktivnih dražb, 30-minutna opozorila, zaključke in neplačane roke.
                </p>
              </div>
            </div>

            <button
              onClick={handleRunCron}
              disabled={isCronRunning}
              className="bg-[#0A1128] text-white px-6 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 shrink-0"
            >
              <RefreshCw size={16} className={isCronRunning ? 'animate-spin' : ''} />
              {isCronRunning ? 'Izvajanje preverjanja...' : 'Zaženi Cron preverjanje (/api/admin/run-cron)'}
            </button>
          </div>

          {cronReport && (
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <h4 className="font-black uppercase text-xs text-slate-500 mb-4 tracking-wider">
                Rezultat preverjanja dražb ({new Date(cronReport.timestamp).toLocaleString('sl-SI')})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 mb-6">
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                  <div className="text-2xl font-black text-[#0A1128]">{cronReport.actions?.reminders30mSent ?? 0}</div>
                  <div className="text-[10px] font-black uppercase text-slate-400 mt-1">30m Opomniki</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                  <div className="text-2xl font-black text-[#0A1128]">{cronReport.actions?.auctionsEnded ?? 0}</div>
                  <div className="text-[10px] font-black uppercase text-slate-400 mt-1">Zaključene dražbe</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                  <div className="text-2xl font-black text-emerald-600">{cronReport.actions?.winnersNotified ?? 0}</div>
                  <div className="text-[10px] font-black uppercase text-slate-400 mt-1">Obveščeni zmagovalci</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                  <div className="text-2xl font-black text-slate-600">{cronReport.actions?.unsoldUpdated ?? 0}</div>
                  <div className="text-[10px] font-black uppercase text-slate-400 mt-1">Neprodano</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                  <div className="text-2xl font-black text-orange-500">{cronReport.actions?.paymentRemindersSent ?? 0}</div>
                  <div className="text-[10px] font-black uppercase text-slate-400 mt-1">2h Opomniki</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                  <div className="text-2xl font-black text-red-500">{cronReport.actions?.expired1stProcessed ?? 0}</div>
                  <div className="text-[10px] font-black uppercase text-slate-400 mt-1">Potekel rok (24h)</div>
                </div>
              </div>

              {cronReport.details && cronReport.details.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1 text-xs font-mono text-slate-600 max-h-48 overflow-y-auto">
                  {cronReport.details.map((d: string, i: number) => (
                    <div key={i}>{d}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  );
};
