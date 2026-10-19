import React, { useState, useEffect } from 'react';
import { X, FileText, Download, ExternalLink, Loader2 } from '../icons';
import { AuctionItem } from "../../types";
import { getAuthHeaders } from "../../lib/authFetch";
import { Portal } from '../ui/Portal';
import { LoadingButton } from '../ui/Common';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  auction: AuctionItem | null;
  seller?: any;
  buyer?: any;
  feePercentage?: number;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  auction
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [invoiceFileName, setInvoiceFileName] = useState<string>('racun.pdf');

  // Erkennung mobiler Endgeraete fuer optimierte Anzeige
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const fetchPdf = async () => {
    if (!auction?.id) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/invoices/file?auction_id=${encodeURIComponent(auction.id)}&inline=1`, {
        headers
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Račun še ni na voljo. Poskusite znova čez nekaj minut.");
      }

      // Dateinamen aus dem Content-Disposition-Header extrahieren
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match ? match[1] : `racun_${auction.id}.pdf`;
      setInvoiceFileName(filename);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch (err: any) {
      setError(err?.message || "Račun še ni na voljo. Poskusite znova čez nekaj minut.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && auction?.id) {
      fetchPdf();
    } else {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError(null);
      setLoading(false);
    }

    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [isOpen, auction?.id]);

  if (!isOpen || !auction) return null;

  // Echter Download der PDF-Datei ohne window.open (DEL A)
  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = invoiceFileName || `racun_${auction.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Oeffnen in einem neuen Tab fuer mobile Browser
  const handleOpenInTab = () => {
    if (!blobUrl) return;
    window.open(blobUrl, '_blank');
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-2 sm:p-6">
        <div className="absolute inset-0 bg-[#0A1128]/80 backdrop-blur-sm" onClick={onClose} />

        {/* Deutsches Kommentar: Rechnungsmodal mit max-h-[92dvh] auf mobilen Geraeten */}
        <div className="relative w-full max-w-5xl h-[92dvh] max-h-[92dvh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Kopfzeile des Modals */}
          <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-4 bg-white border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#FEBA4F]/20 rounded-xl flex items-center justify-center text-[#FEBA4F] shrink-0">
                <FileText size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-lg font-black uppercase tracking-wider text-[#0A1128] truncate">
                  Račun in pogodba
                </h3>
                <p className="text-xs font-bold text-slate-400 truncate">
                  {invoiceFileName} &bull; Uradni račun
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Oeffnen-Button auf mobilen Geraeten */}
              {isMobile && blobUrl && (
                <button
                  type="button"
                  onClick={handleOpenInTab}
                  className="flex items-center gap-1.5 bg-slate-100 text-[#0A1128] px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-all border border-slate-200"
                  title="Odpri račun v novem zavihku"
                >
                  <ExternalLink size={14} />
                  <span className="hidden sm:inline">Odpri</span>
                </button>
              )}

              {/* Download-Button */}
              <LoadingButton
                type="button"
                onClick={handleDownload}
                loading={loading}
                loadingText="Pripravljam..."
                disabled={!blobUrl}
                className="flex items-center gap-2 bg-[#0A1128] text-white px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              >
                <Download size={16} />
                <span>Prenesi PDF</span>
              </LoadingButton>

              {/* Schliessen-Button */}
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-[#0A1128] transition-colors"
                title="Zapri"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Hauptbereich mit eingebettetem PDF oder Hinweisen */}
          <div className="flex-1 w-full h-full relative bg-slate-100 flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 text-slate-500 py-12">
                <Loader2 size={36} className="text-[#FEBA4F] animate-spin" />
                <p className="text-xs font-black uppercase tracking-widest text-[#0A1128]">
                  Pripravljam...
                </p>
              </div>
            )}

            {!loading && error && (
              <div className="max-w-md mx-auto text-center p-8 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <FileText size={24} />
                </div>
                <h4 className="text-base font-black uppercase tracking-tight text-[#0A1128]">
                  Račun ni na voljo
                </h4>
                <p className="text-xs text-slate-600 font-bold leading-relaxed">
                  {error}
                </p>
                <LoadingButton
                  type="button"
                  onClick={fetchPdf}
                  loading={loading}
                  loadingText="Pripravljam..."
                  className="mt-2 bg-[#0A1128] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-sm"
                >
                  Poskusi znova
                </LoadingButton>
              </div>
            )}

            {!loading && !error && blobUrl && (
              <div className="w-full h-full flex flex-col">
                {isMobile && (
                  <div className="sm:hidden mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-amber-900">
                      Predogled na telefonu:
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenInTab}
                      className="text-[11px] font-black uppercase tracking-wider text-[#0A1128] bg-[#FEBA4F] px-3 py-1 rounded-lg"
                    >
                      Odpri račun
                    </button>
                  </div>
                )}
                <iframe
                  src={`${blobUrl}#toolbar=1`}
                  className="w-full flex-1 border-0 rounded-2xl shadow-inner bg-white"
                  title="Račun PDF"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};
