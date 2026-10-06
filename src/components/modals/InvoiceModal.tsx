import React, { useRef, useState } from 'react';
import { X, FileText, Download } from 'lucide-react';
import { AuctionItem } from "../../types";
import { getAuthHeaders } from "../../lib/authFetch";
import { calculatePlatformFeeCents } from "../../lib/feeCalculator";
import { Portal } from '../ui/Portal';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  auction: AuctionItem | null;
  seller: any;
  buyer: any;
  feePercentage?: number;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  auction,
  seller,
  buyer,
  feePercentage = 10
}) => {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen || !auction || !seller || !buyer) return null;

  const paymentDate = auction.paid_at ? new Date(auction.paid_at).toLocaleDateString('sl-SI') : new Date().toLocaleDateString('sl-SI');
  const invoiceNumber = `RAČ-${new Date().getFullYear()}-${auction.id.substring(Math.max(0, auction.id.length - 5)).toUpperCase()}`;
  const feeInvoiceNumber = `PROV-${new Date().getFullYear()}-${(auction.id || '00000').substring(Math.max(0, auction.id.length - 5)).toUpperCase()}`;

  const isSellerDeleted = (auction as any)?.is_seller_deleted || seller?.is_deleted || seller?.isDeleted || seller?.company_name === 'Uporabnik je bil izbrisan' || (seller as any)?.sellerName === 'Uporabnik je bil izbrisan';
  const sellerName = isSellerDeleted ? 'Uporabnik je bil izbrisan' : (seller.company_name || seller.companyName || 
    `${seller.first_name || seller.firstName || ''} ${seller.last_name || seller.lastName || ''}`.trim() || 
    (typeof seller.name === 'object' ? seller.name?.SLO : seller.name) || 
    seller.sellerName || 
    'Prodajalec');

  const buyerName = buyer.company_name || buyer.companyName || 
    `${buyer.first_name || buyer.firstName || ''} ${buyer.last_name || buyer.lastName || ''}`.trim() || 
    (typeof buyer.name === 'object' ? buyer.name?.SLO : buyer.name) || 
    'Kupec';

  const getFullAddress = (user: any) => {
    if (!user) return 'Naslov ni na voljo';
    if (typeof user === 'string') return user;

    const street = user.street_address || user.company_street || user.companyStreet || user.address || user.street || '';
    const postal = user.postal_code || user.company_postal_code || user.companyPostalCode || user.postalCode || user.zip || '';
    const city = user.city || user.company_city || user.companyCity || user.place || '';
    
    if (street && postal && city) {
      return `${street}, ${postal} ${city}`;
    } else if (street && city) {
      return `${street}, ${city}`;
    } else if (city) {
      return city;
    }
    return user.address || 'Naslov ni na voljo';
  };

  const getSellerPlace = (user: any) => {
    if (!user) return 'Maribor, Slovenija';
    let raw = user.company_city || user.companyCity || user.city || user.place || '';
    if (!raw && (user.address || user.street_address || user.location?.address)) {
      const addr = user.address || user.street_address || user.location?.address;
      const parts = addr.split(',');
      if (parts.length > 1) {
        raw = parts[parts.length - 1].trim();
        if (raw.toLowerCase() === 'slovenija' && parts.length > 2) {
          raw = parts[parts.length - 2].trim();
        }
      } else {
        raw = addr;
      }
    }
    let cleaned = (raw || 'Maribor')
      .replace(/SI-?\s*\d{4}/gi, '')
      .replace(/\b\d{4}\b/g, '')
      .trim()
      .replace(/^,\s*|,\s*$/g, '');

    if (!cleaned) cleaned = 'Maribor';
    if (!cleaned.toLowerCase().includes('slovenija')) {
      cleaned = `${cleaned}, Slovenija`;
    }
    return cleaned;
  };

  const sellerAddress = getFullAddress(seller);
  const buyerAddress = getFullAddress(buyer);
  const sellerPlace = getSellerPlace(seller);

  const isSellerCompany = seller.user_type === 'business';
  const isBuyerCompany = buyer.user_type === 'business';
  const isSellerIndividual = !isSellerCompany;
  const isC2B = !isSellerCompany && isBuyerCompany;
  
  let relationship = 'C2C';
  if (isSellerCompany && isBuyerCompany) relationship = 'B2B';
  else if (isSellerCompany && !isBuyerCompany) relationship = 'B2C';
  else if (!isSellerCompany && isBuyerCompany) relationship = 'C2B';

  const sellerVatStatus = seller.vat_status || seller.vatStatus || (isSellerCompany ? 'exempt_small' : 'private');

  const sellerTaxId = seller.tax_id || seller.taxId || seller.vat_id || seller.vatId || '';
  const sellerRegNo = seller.registration_number || seller.regNumber || seller.registrationNumber || '';

  const buyerTaxId = buyer.tax_id || buyer.taxId || buyer.vat_id || buyer.vatId || '';
  const buyerRegNo = buyer.registration_number || buyer.regNumber || '';

  const itemPrice = Number(auction.currentBid || (auction as any).current_price || 0);

  let vatRate = 0;
  let vatAmount = 0;
  let vatBase = itemPrice;
  let isVatApplicable = false;
  let isReverseCharge = false;
  let noteText = '';

  const buyerCountry = (buyer.country_code || buyer.countryCode || buyer.country || 'SI').trim().toUpperCase();

  if (relationship === 'C2C' || relationship === 'C2B') {
    vatRate = 0;
    vatAmount = 0;
    vatBase = itemPrice;
    isVatApplicable = false;
    noteText = 'DDV ni obračunan (prodajalec je fizična oseba).';
  } else {
    if (sellerVatStatus === 'payer') {
      isVatApplicable = true;
      if (relationship === 'B2B' && buyerCountry !== 'SI' && ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'ES', 'SE'].includes(buyerCountry) && buyerTaxId) {
        isReverseCharge = true;
        vatRate = 0;
        vatAmount = 0;
        vatBase = itemPrice;
        noteText = 'Obrnjena davčna obveznost / Reverse charge po Direktivi Sveta 2006/112/ES in 76. a členu ZDDV-1.';
      } else {
        vatRate = 22;
        vatBase = Math.round((itemPrice / 1.22) * 100) / 100;
        vatAmount = Math.round((itemPrice - vatBase) * 100) / 100;
        noteText = 'V ceno je vključen 22% DDV v skladu z Zakonom o davku na dodano vrednost (ZDDV-1).';
      }
    } else {
      vatRate = 0;
      vatAmount = 0;
      vatBase = itemPrice;
      isVatApplicable = false;
      noteText = 'DDV ni obračunan na podlagi 1. odstavka 94. člena ZDDV-1 (mali davčni zavezanec).';
    }
  }

  // Platform Fee calculation
  const feeCents = calculatePlatformFeeCents(Math.round(itemPrice * 100), ((buyer as any)?.subscription_tier || 'FREE').toUpperCase() as any);
  const feeBase = feeCents / 100;
  const feeVat = (Math.round(feeCents * 0.22)) / 100;
  const feeTotal = feeBase + feeVat;

  const formatEuro = (val: number) => {
    return val.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const itemTitle = (typeof auction.title === 'object' ? (auction.title?.SLO || auction.title?.EN) : auction.title) || 'Dražbeni predmet';
  const deliveryMethodText = auction.delivery_method === 'post' ? 'Pošiljanje po pošti' : auction.delivery_method === 'pickup' ? 'Osebni prevzem na lokaciji prodajalca' : 'Osebni prevzem ali po dogovoru';

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      // 1. Request signed URL from server
      const response = await fetch(`/api/invoices/download-url?auction_id=${encodeURIComponent(auction.id)}`, {
        headers: await getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          window.open(data.url, '_blank');
          setIsGenerating(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Signed URL fetch error, falling back to print window:', e);
    }

    // 2. Fallback: print window
    try {
      if (invoiceRef.current) {
        const contentHtml = invoiceRef.current.innerHTML;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head>
                <title>Račun - ${invoiceNumber}</title>
                <style>
                  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;900&display=swap');
                  @page {
                    size: A4;
                    margin: 12mm 15mm;
                  }
                  body {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    margin: 0;
                    padding: 0;
                    color: #0A1128;
                    background: #FFFFFF;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                  * { box-sizing: border-box; }
                  table { width: 100%; border-collapse: collapse; }
                  th, td { padding: 8px 4px; text-align: left; }
                  .text-right { text-align: right; }
                  .text-center { text-align: center; }
                  .page-break { page-break-before: always; break-before: page; }
                  .invoice-page {
                    min-height: 270mm;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    background: #FFFFFF;
                  }
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
      }
    } catch (err) {
      console.error('Failed to generate fallback PDF', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-[#0A1128]/80 backdrop-blur-sm" onClick={onClose} />
        
        <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-100 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FEBA4F]/20 rounded-xl flex items-center justify-center text-[#FEBA4F]">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-widest text-[#0A1128]">
                {isC2B ? 'Kupoprodajna pogodba' : isSellerIndividual ? 'Kupoprodajna pogodba / Račun' : 'Predogled računa'}
              </h3>
              <p className="text-xs font-bold text-slate-400">
                {invoiceNumber} &bull; 2 strani (Račun + Provizija)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex items-center gap-2 bg-[#0A1128] text-white px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {isGenerating ? 'Generiranje...' : 'Prenesi PDF'}
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Invoice Preview Container (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar bg-slate-200/70 flex flex-col items-center gap-8">
          
          <div ref={invoiceRef} className="w-full max-w-[210mm] flex flex-col gap-8">
            
            {/* ========================================== */}
            {/* PAGE 1: RAČUN / INVOICE (SELLER -> BUYER) */}
            {/* ========================================== */}
            <div 
              className="w-full p-10 sm:p-14 shadow-lg flex flex-col justify-between rounded-xl invoice-page"
              style={{ minHeight: '297mm', backgroundColor: '#FFFFFF', color: '#0A1128', fontFamily: 'sans-serif' }}
            >
              <div>
                {/* Header: Left title & meta, Right logo */}
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h1 className="text-3xl font-black tracking-tight mb-2 uppercase" style={{ color: '#0A1128' }}>
                      {isC2B ? 'KUPOPRODAJNA POGODBA' : isSellerIndividual ? 'KUPOPRODAJNA POGODBA / RAČUN' : 'RAČUN / INVOICE'}
                    </h1>
                    <p className="font-semibold text-xs text-slate-500">Številka dokumenta: <span className="font-bold text-slate-700">{invoiceNumber}</span></p>
                    <p className="font-semibold text-xs text-slate-500">Kraj izdaje: <span className="font-bold text-slate-700">{sellerPlace}</span></p>
                    <p className="font-semibold text-xs text-slate-500">Datum izdaje / sklenitve: <span className="font-bold text-slate-700">{paymentDate}</span></p>
                    <p className="font-semibold text-xs text-slate-500">Datum opravljene storitve/dobave: <span className="font-bold text-slate-700">{paymentDate}</span></p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black tracking-tighter italic text-slate-400">dražbenik.si</div>
                    <p className="text-[11px] font-semibold text-slate-400">Platforma za posredovanje</p>
                  </div>
                </div>

                {/* Horizontal Divider */}
                <div className="border-t border-slate-200 mb-6" />

                {/* Two Columns: Seller & Buyer */}
                <div className="flex justify-between mb-6 gap-8">
                  {/* Seller */}
                  <div className="w-1/2">
                    <h3 className="text-[11px] font-black uppercase tracking-wider mb-1.5 text-slate-400">
                      IZDAJATELJ (PRODAJALEC)
                    </h3>
                    <p className="font-black text-base text-[#0A1128]">{sellerName}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{sellerAddress}</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Davčna številka: <strong className="text-slate-800">{sellerTaxId || 'Ni navedena'}</strong>
                    </p>
                    {sellerRegNo && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        Matična številka: <strong className="text-slate-800">{sellerRegNo}</strong>
                      </p>
                    )}
                  </div>

                  {/* Buyer */}
                  <div className="w-1/2">
                    <h3 className="text-[11px] font-black uppercase tracking-wider mb-1.5 text-slate-400">
                      PREJEMNIK (KUPEC)
                    </h3>
                    <p className="font-black text-base text-[#0A1128]">{buyerName}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{buyerAddress}</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Davčna številka: <strong className="text-slate-800">{buyerTaxId || 'Ni navedena'}</strong>
                    </p>
                    {buyerRegNo && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        Matična številka: <strong className="text-slate-800">{buyerRegNo}</strong>
                      </p>
                    )}
                  </div>
                </div>

                {/* Horizontal Divider */}
                <div className="border-t border-slate-200 mb-5" />

                {/* Identification callout box */}
                <div className="mb-6 p-2.5 px-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                  <span className="text-blue-600 font-bold">ℹ</span>
                  <span><strong>Identifikacija:</strong> Stranki sta elektronsko identificirani znotraj platforme dražbenik.si.</span>
                </div>

                {/* Items Table */}
                <table className="w-full mb-6 border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#0A1128]">
                      <th className="text-left py-2 text-xs font-black uppercase tracking-wider text-[#0A1128]">Opis</th>
                      <th className="text-center py-2 text-xs font-black uppercase tracking-wider text-[#0A1128] w-20">Količina</th>
                      <th className="text-right py-2 text-xs font-black uppercase tracking-wider text-[#0A1128] w-28">Cena (€)</th>
                      <th className="text-right py-2 text-xs font-black uppercase tracking-wider text-[#0A1128] w-28">Skupaj (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="py-3">
                        <p className="font-bold text-sm text-[#0A1128]">{itemTitle}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">ID dražbe: {auction.id}</p>
                      </td>
                      <td className="py-3 text-center text-sm font-semibold text-[#0A1128]">1</td>
                      <td className="py-3 text-right text-sm text-[#0A1128]">{formatEuro(itemPrice)}</td>
                      <td className="py-3 text-right text-sm font-bold text-[#0A1128]">{formatEuro(itemPrice)}</td>
                    </tr>
                    <tr className="bg-slate-50/80 border-b border-slate-200">
                      <td className="py-2 px-3 text-[11px] text-slate-500 italic" colSpan={4}>
                        Način predaje: {deliveryMethodText}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Totals Box */}
                <div className="flex justify-end mb-8">
                  <div className="w-72">
                    {isVatApplicable ? (
                      <>
                        <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                          <span>Osnova za DDV (22%):</span>
                          <span className="font-semibold text-[#0A1128]">{formatEuro(vatBase)} €</span>
                        </div>
                        <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                          <span>Znesek DDV (22%):</span>
                          <span className="font-semibold text-[#0A1128]">{formatEuro(vatAmount)} €</span>
                        </div>
                        <div className="flex justify-between py-2.5 text-sm font-black uppercase text-[#0A1128] border-t-2 border-[#0A1128] mt-1">
                          <span>Skupaj za plačilo:</span>
                          <span>{formatEuro(itemPrice)} €</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                          <span>Kupnina / Znesek:</span>
                          <span className="font-semibold text-[#0A1128]">{formatEuro(itemPrice)} €</span>
                        </div>
                        <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                          <span>DDV:</span>
                          <span className="font-semibold text-[#0A1128]">Ni obračunan</span>
                        </div>
                        <div className="flex justify-between py-2.5 text-sm font-black uppercase text-[#0A1128] border-t-2 border-[#0A1128] mt-1">
                          <span>Skupaj za plačilo:</span>
                          <span>{formatEuro(itemPrice)} €</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Legal Footer notes */}
              <div className="text-[11px] pt-4 mt-6 space-y-1.5 border-t border-slate-200 text-slate-600">
                <p>
                  <strong className="text-slate-800">Jamstvo za neskladnost blaga (ZVPot-1):</strong> Za blago veljajo zakonska jamstva za neskladnost blaga v skladu z ZVPot-1.
                </p>
                <p>
                  <strong className="text-slate-800">Prenos lastništva:</strong> Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.
                </p>
                <p>
                  <strong className="text-slate-800">Pravna opomba in DDV:</strong>{' '}
                  {noteText}
                </p>
                <p className="text-[10px] text-slate-400 pt-2">
                  Platforma dražbenik.si nastopa izključno kot tehnološki posrednik in ni stranka v prodajni pogodbi. Ta dokument služi kot kupoprodajna pogodba in potrdilo o sklenjenem poslu ter plačilu med prodajalcem in kupcem, generirano samodejno s strani sistema po uspešnem zaključku dražbe.
                </p>
              </div>
            </div>

            {/* ======================================================= */}
            {/* PAGE 2: RAČUN ZA STORITEV (PLATFORM FEE: DIZAIN D.O.O.) */}
            {/* ======================================================= */}
            <div 
              className="w-full p-10 sm:p-14 shadow-lg flex flex-col justify-between rounded-xl invoice-page page-break"
              style={{ minHeight: '297mm', backgroundColor: '#FFFFFF', color: '#0A1128', fontFamily: 'sans-serif' }}
            >
              <div>
                {/* Centered Title */}
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-black uppercase tracking-tight text-[#0A1128]">
                    RAČUN ZA STORITEV / SERVICE INVOICE
                  </h2>
                </div>

                {/* Top Divider */}
                <div className="border-t border-slate-200 mb-6" />

                {/* Two Columns: Issuer Platform & Recipient Buyer */}
                <div className="flex justify-between mb-6 gap-8">
                  {/* Platform Issuer */}
                  <div className="w-1/2">
                    <h3 className="text-[11px] font-black uppercase tracking-wider mb-1.5 text-slate-400">
                      IZDAJATELJ (PLATFORMA)
                    </h3>
                    <p className="font-black text-base text-[#0A1128]">Dizain d.o.o.</p>
                    <p className="text-xs text-slate-600 mt-0.5">Karantanska ulica 28, 2000 Maribor</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Davčna številka: <strong className="text-slate-800">SI57008060</strong>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Matična številka: <strong className="text-slate-800">9093494000</strong>
                    </p>
                  </div>

                  {/* Buyer Recipient */}
                  <div className="w-1/2">
                    <h3 className="text-[11px] font-black uppercase tracking-wider mb-1.5 text-slate-400">
                      PREJEMNIK STORITVE (KUPEC)
                    </h3>
                    <p className="font-black text-base text-[#0A1128]">{buyerName}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{buyerAddress}</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Davčna številka: <strong className="text-slate-800">{buyerTaxId || 'Ni navedena'}</strong>
                    </p>
                    {buyerRegNo && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        Matična številka: <strong className="text-slate-800">{buyerRegNo}</strong>
                      </p>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-200 mb-6" />

                {/* Invoice Meta Information */}
                <div className="mb-6 space-y-1 text-xs text-slate-600">
                  <p>Številka računa: <strong className="text-slate-800">{feeInvoiceNumber}</strong></p>
                  <p>Datum izdaje in opravljene storitve: <strong className="text-slate-800">{paymentDate}</strong></p>
                  <p>Način plačila: <strong className="text-slate-800">Spletno plačilo / Kartica</strong></p>
                  <p>Status plačila: <strong className="text-emerald-700">PLAČANO ({paymentDate})</strong></p>
                </div>

                {/* Table */}
                <table className="w-full mb-6 border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#0A1128]">
                      <th className="text-left py-2 text-xs font-black uppercase tracking-wider text-[#0A1128]">Opis</th>
                      <th className="text-right py-2 text-xs font-black uppercase tracking-wider text-[#0A1128] w-32">Osnova (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="py-3">
                        <p className="font-bold text-sm text-[#0A1128]">Provizija platforme za uporabo sistema</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Dražba: {itemTitle}</p>
                      </td>
                      <td className="py-3 text-right text-sm text-[#0A1128] font-semibold">{formatEuro(feeBase)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-8">
                  <div className="w-72">
                    <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                      <span>Osnova / Base:</span>
                      <span className="font-semibold text-[#0A1128]">{formatEuro(feeBase)} €</span>
                    </div>
                    <div className="flex justify-between py-1.5 text-xs text-slate-600 border-b border-slate-100">
                      <span>DDV / VAT (22%):</span>
                      <span className="font-semibold text-[#0A1128]">{formatEuro(feeVat)} €</span>
                    </div>
                    <div className="flex justify-between py-2.5 text-sm font-black uppercase text-[#0A1128] border-t-2 border-[#0A1128] mt-1">
                      <span>SKUPAJ PROVIZIJA:</span>
                      <span>{formatEuro(feeTotal)} €</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Page 2 Legal Footer */}
              <div className="text-[11px] pt-4 mt-6 space-y-1.5 border-t border-slate-200 text-slate-600">
                <p>
                  Dizain d.o.o. je registriran izdajatelj računa za posredniške storitve platforme dražbenik.si. V ceno storitve je vključen 22% DDV.
                </p>
                <p className="text-[10px] text-slate-400 pt-2">
                  Dokument je generiran elektronsko in je veljaven brez žiga ali podpisa v skladu z ZZEPA ter 84. členom Zakona o davku na dodano vrednost (ZDDV-1).
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </Portal>
  );
};
