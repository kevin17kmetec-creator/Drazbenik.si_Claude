import React from 'react';
import { X } from 'lucide-react';

export const LegalModal: React.FC<{ type: 'terms' | 'privacy' | 'how'; onClose: () => void; t: any }> = ({ type, onClose, t }) => {
    const titles = { terms: t('legalTerms'), privacy: t('legalPrivacy'), how: t('legalHow') };
    const content = {
        terms: t('termsText'),
        privacy: t('privacyText'),
        how: t('howText')
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-white w-full max-w-4xl rounded-[3rem] p-10 lg:p-14 shadow-2xl animate-in border-4 border-[#FEBA4F] max-h-[90vh] overflow-y-auto custom-scrollbar">
                <button onClick={onClose} className="absolute top-8 right-8 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
                <h3 className="text-3xl font-black text-[#0A1128] uppercase tracking-tighter mb-8">{titles[type]}</h3>
                <div className="text-slate-600 font-bold leading-relaxed text-sm md:text-base whitespace-pre-line mb-10 text-justify">
                    {content[type]}
                </div>
                <button onClick={onClose} className="w-full bg-[#0A1128] text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl">Razumem</button>
            </div>
        </div>
    );
};
