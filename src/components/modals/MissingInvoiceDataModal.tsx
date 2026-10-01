import React from 'react';
import { AlertTriangle, ArrowRight, X, ShieldAlert, FileText, CheckCircle2 } from 'lucide-react';
import { MissingField } from "../../lib/invoiceDataCheck";

interface MissingInvoiceDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToSettings: () => void;
  missingFields: MissingField[];
  userType: 'individual' | 'business';
  t: any;
}

export const MissingInvoiceDataModal: React.FC<MissingInvoiceDataModalProps> = ({
  isOpen,
  onClose,
  onNavigateToSettings,
  missingFields,
  userType,
  t
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-[2.5rem] p-8 md:p-10 max-w-lg w-full shadow-2xl border border-slate-100 relative overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-[#0A1128] transition-colors flex items-center justify-center"
          aria-label="Zapri"
        >
          <X size={20} />
        </button>

        {/* Warning Icon Badge */}
        <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 mb-6 shadow-sm">
          <FileText size={32} />
        </div>

        {/* Title & Subtitle */}
        <h3 className="text-2xl font-black uppercase tracking-tight text-[#0A1128] mb-3">
          Podatki za račun niso popolni
        </h3>
        <p className="text-sm font-medium text-slate-500 mb-6 leading-relaxed">
          Pred objavo dražbe morate v profilu izpolniti vse zahtevane podatke. Ti podatki so zakonsko obvezni za izdajo računov in sklenitev kupoprodajne pogodbe ob prodaji.
        </p>

        {/* Missing Fields List */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 mb-8 space-y-3 max-h-60 overflow-y-auto">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Manjkajoči podatki ({userType === 'business' ? 'Podjetje' : 'Fizična oseba'}):
          </p>
          <div className="space-y-2">
            {missingFields.map((field) => (
              <div 
                key={field.key} 
                className="flex items-start gap-3 bg-white p-3 rounded-xl border border-amber-100 shadow-sm"
              >
                <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0" />
                <div className="text-left">
                  <span className="text-xs font-bold text-[#0A1128] block">
                    {field.label}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {field.description}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateToSettings();
            }}
            className="flex-1 bg-[#0A1128] hover:bg-[#FEBA4F] text-white hover:text-[#0A1128] py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2 group"
          >
            <span>Izpolni podatke v nastavitvah</span>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-colors"
          >
            Prekliči
          </button>
        </div>
      </div>
    </div>
  );
};
