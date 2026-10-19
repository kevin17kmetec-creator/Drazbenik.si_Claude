import React, { useState, useEffect } from 'react';
import { confirmDialog } from '../../lib/dialog';
import { FileText, Download, RefreshCw, Calendar, Filter, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { getAuthHeaders } from '../../lib/authFetch';
import { toast } from '../../lib/toast';
import { LoadingButton } from '../ui/Common';
import { AdminDisputesPanel } from './AdminDisputesPanel';
import { AdminUsersPanel, AdminAuctionsPanel } from './AdminLookupPanels';

interface AccountingDoc {
  id: string;
  invoice_no: string;
  type: 'SALES' | 'COMMISSION' | 'SUBSCRIPTION';
  year: number;
  month: string;
  issued_at: string;
  net_cents: number;
  vat_cents: number;
  gross_cents: number;
  vat_rate: number;
  buyer_id: string;
  seller_id?: string;
  issuer: string;
}

interface Totals {
  totalNetCents: number;
  totalVatCents: number;
  totalGrossCents: number;
  count: number;
}

interface AccountingViewProps {
  user: any;
  userData: any;
  onBack?: () => void;
}

// Deutscher Kommentar: Hauptkomponente fuer die buchhalterische Uebersicht und den ZIP-Export
export const AccountingView: React.FC<AccountingViewProps> = ({ user, userData, onBack }) => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>(String(currentDate.getMonth() + 1).padStart(2, '0'));
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [adminTab, setAdminTab] = useState<'accounting' | 'disputes' | 'users' | 'auctions'>('accounting');
  const [lookupUserId, setLookupUserId] = useState<string | null>(null);

  const [documents, setDocuments] = useState<AccountingDoc[]>([]);
  const [totals, setTotals] = useState<Totals>({ totalNetCents: 0, totalVatCents: 0, totalGrossCents: 0, count: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [backfilling, setBackfilling] = useState<boolean>(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Deutscher Kommentar: Pruefung auf Administratorberechtigung
  const envAdminUids = ((import.meta.env.VITE_ADMIN_UIDS as string) || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const isAdmin = envAdminUids.includes(user?.uid) || userData?.role === 'admin' || userData?.isAdmin === true;

  const months = [
    { value: '01', label: 'Januar (01)' },
    { value: '02', label: 'Februar (02)' },
    { value: '03', label: 'Marec (03)' },
    { value: '04', label: 'April (04)' },
    { value: '05', label: 'Maj (05)' },
    { value: '06', label: 'Junij (06)' },
    { value: '07', label: 'Julij (07)' },
    { value: '08', label: 'Avgust (08)' },
    { value: '09', label: 'September (09)' },
    { value: '10', label: 'Oktober (10)' },
    { value: '11', label: 'November (11)' },
    { value: '12', label: 'December (12)' }
  ];

  const years = [2024, 2025, 2026, 2027];

  const fetchDocuments = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        year: String(selectedYear),
        month: selectedMonth,
        type: selectedType
      });
      const res = await fetch(`/api/admin/accounting/documents?${params.toString()}`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Napaka pri nalaganju računovodskih dokumentov');
      }
      const data = await res.json();
      setDocuments(data.documents || []);
      setTotals(data.totals || { totalNetCents: 0, totalVatCents: 0, totalGrossCents: 0, count: 0 });
    } catch (err: any) {
      console.error('Napaka pri pridobivanju dokumentov:', err);
      toast.error(err.message || 'Napaka pri pridobivanju podatkov.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [selectedYear, selectedMonth, selectedType, isAdmin]);

  // Deutscher Kommentar: Exportiert den ausgewaehlten Monat als ZIP-Datei
  const handleExportZip = async () => {
    setExporting(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        year: String(selectedYear),
        month: selectedMonth,
        type: selectedType
      });
      const res = await fetch(`/api/admin/accounting/export?${params.toString()}`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Napaka pri izvozu arhiva');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `racunovodstvo_${selectedYear}_${selectedMonth}${selectedType !== 'ALL' ? `_${selectedType}` : ''}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success('ZIP arhiv z računi in pregled.csv je bil uspešno prenesen.');
    } catch (err: any) {
      console.error('Napaka pri izvozu ZIP:', err);
      toast.error(err.message || 'Napaka pri izvozu arhiva.');
    } finally {
      setExporting(false);
    }
  };

  // Deutscher Kommentar: Fuehrt den Backfill fuer aeltere Dokumente aus
  const handleBackfill = async () => {
    if (!(await confirmDialog('Ali želite pognati uskladitev obstoječih računov v novi računovodski arhiv?'))) {
      return;
    }
    setBackfilling(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/accounting/backfill', {
        method: 'POST',
        headers
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Napaka pri uskladitvi');
      }
      const result = await res.json();
      toast.success(`Uskladitev končana! Obdelanih dokumentov: ${result.processedCount}, arhiviranih novih: ${result.archivedCount}.`);
      await fetchDocuments();
    } catch (err: any) {
      console.error('Napaka pri uskladitvi:', err);
      toast.error(err.message || 'Napaka pri zagonu uskladitve.');
    } finally {
      setBackfilling(false);
    }
  };

  // Deutscher Kommentar: Einzelne Rechnungs-PDF herunterladen
  const handleDownloadInvoice = async (invoiceNo: string) => {
    setDownloadingId(invoiceNo);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/accounting/file?invoice_no=${encodeURIComponent(invoiceNo)}`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Napaka pri prenosu PDF');
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `racun_${invoiceNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error('Napaka pri prenosu posameznega računa:', err);
      toast.error(err.message || 'Napaka pri prenosu računa.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-2xl font-black text-[#0A1128] uppercase mb-2">Dostop zavrnjen</h2>
        <p className="text-slate-600 mb-6">Ta stran je namenjena izključno administratorjem platforme.</p>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0A1128] text-white font-bold rounded-xl hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-colors"
          >
            <ArrowLeft size={18} /> Nazaj na osnovno stran
          </button>
        )}
      </div>
    );
  }

  const formatEuro = (cents: number) => {
    return (cents / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const tabBtn = (id: 'accounting' | 'disputes' | 'users' | 'auctions', label: string) => (
    <button key={id} onClick={() => { setLookupUserId(null); setAdminTab(id); }} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border-2 ${adminTab === id ? 'bg-[#0A1128] text-white border-[#0A1128]' : 'border-slate-200 text-slate-500'}`}>{label}</button>
  );
  const tabBar = (
    <div className="flex flex-wrap gap-2 mb-6">
      {tabBtn('accounting', 'Računovodstvo')}
      {tabBtn('disputes', 'Spori')}
      {tabBtn('users', 'Uporabniki')}
      {tabBtn('auctions', 'Dražbe')}
    </div>
  );

  if (adminTab !== 'accounting') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {tabBar}
        {adminTab === 'disputes' && <AdminDisputesPanel />}
        {adminTab === 'users' && <AdminUsersPanel key={lookupUserId || 'list'} initialId={lookupUserId} />}
        {adminTab === 'auctions' && <AdminAuctionsPanel onOpenUser={(id) => { setLookupUserId(id); setAdminTab('users'); }} />}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {tabBar}
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
                title="Nazaj"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h1 className="text-2xl sm:text-3xl font-black uppercase text-[#0A1128] tracking-tight">
              Računovodski arhiv
            </h1>
          </div>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            Ločeno shranjevanje in izvoz izdanih računov za računovodstvo in FURS
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#0A1128] rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={backfilling ? 'animate-spin' : ''} />
            {backfilling ? 'Usklajujem...' : 'Uskladi arhiv (Backfill)'}
          </button>

          <button
            onClick={handleExportZip}
            disabled={exporting || documents.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0A1128] hover:bg-[#FEBA4F] hover:text-[#0A1128] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            {exporting ? 'Pripravljam ZIP...' : 'Izvozi mesec (ZIP)'}
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-[#FEBA4F]" />
          <span className="text-xs font-bold uppercase text-slate-500">Leto:</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-slate-50 border border-slate-200 text-[#0A1128] font-bold text-sm rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#FEBA4F]"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500">Mesec:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-[#0A1128] font-bold text-sm rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#FEBA4F]"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Filter size={18} className="text-[#FEBA4F]" />
          <span className="text-xs font-bold uppercase text-slate-500">Vrsta:</span>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-[#0A1128] font-bold text-sm rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#FEBA4F]"
          >
            <option value="ALL">Vsi dokumenti</option>
            <option value="SALES">SALES (Prodaja)</option>
            <option value="COMMISSION">COMMISSION (Provizija)</option>
            <option value="SUBSCRIPTION">SUBSCRIPTION (Naročnine)</option>
          </select>
        </div>

        <button
          onClick={fetchDocuments}
          disabled={loading}
          className="ml-auto p-2 text-slate-400 hover:text-[#0A1128] rounded-xl transition-colors"
          title="Osveži podatke"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Število dokumentov</p>
          <p className="text-2xl font-black text-[#0A1128] mt-1">{totals.count}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Skupaj neto osnova</p>
          <p className="text-2xl font-black text-[#0A1128] mt-1">{formatEuro(totals.totalNetCents)} €</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Skupaj DDV</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{formatEuro(totals.totalVatCents)} €</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm bg-gradient-to-br from-white to-amber-50/30">
          <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Skupaj bruto</p>
          <p className="text-2xl font-black text-[#0A1128] mt-1">{formatEuro(totals.totalGrossCents)} €</p>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4">Številka računa</th>
                <th className="py-3.5 px-4">Datum izdaje</th>
                <th className="py-3.5 px-4">Vrsta</th>
                <th className="py-3.5 px-4">Kupec</th>
                <th className="py-3.5 px-4 text-right">Neto (€)</th>
                <th className="py-3.5 px-4 text-right">DDV (€)</th>
                <th className="py-3.5 px-4 text-right">Bruto (€)</th>
                <th className="py-3.5 px-4 text-center">Akcija</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#FEBA4F]" />
                    Nalagam računovodske dokumente...
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                    Za izbrano obdobje in filter ni najdenih računovodskih dokumentov.
                  </td>
                </tr>
              ) : (
                documents.map((doc) => {
                  const typeBadgeClass =
                    doc.type === 'SALES'
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : doc.type === 'COMMISSION'
                        ? 'bg-amber-100 text-amber-900 border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-200';

                  const typeLabel =
                    doc.type === 'SALES'
                      ? 'SALES (Prodaja)'
                      : doc.type === 'COMMISSION'
                        ? 'COMMISSION (Provizija)'
                        : 'SUBSCRIPTION (Naročnina)';

                  const isDownloadingThis = downloadingId === doc.invoice_no;

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-[#0A1128] whitespace-nowrap">
                        {doc.invoice_no}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap text-xs">
                        {doc.issued_at ? new Date(doc.issued_at).toLocaleDateString('sl-SI') : '-'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-block text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${typeBadgeClass}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 text-xs truncate max-w-[150px]">
                        {doc.buyer_id}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-700 whitespace-nowrap">
                        {formatEuro(doc.net_cents)} €
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600 whitespace-nowrap">
                        {formatEuro(doc.vat_cents)} €
                        {doc.vat_rate !== undefined && (
                          <span className="text-[10px] text-slate-400 ml-1">({doc.vat_rate}%)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-[#0A1128] whitespace-nowrap">
                        {formatEuro(doc.gross_cents)} €
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <LoadingButton
                          onClick={() => handleDownloadInvoice(doc.invoice_no)}
                          loading={isDownloadingThis}
                          loadingText="..."
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-100 hover:bg-[#FEBA4F] hover:text-[#0A1128] text-slate-700 transition-colors"
                          title="Prenesi PDF račun"
                        >
                          <Download size={13} /> PDF
                        </LoadingButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
