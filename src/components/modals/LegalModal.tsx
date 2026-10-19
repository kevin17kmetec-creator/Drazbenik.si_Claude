import React from 'react';
import { X } from '../icons';
import { Portal } from '../ui/Portal';
import { PRIVACY_TEXT, COOKIE_TEXT, IMPRINT_TEXT } from '../../lib/legalTexts';
import { PRIVACY_TEXT_EN, COOKIE_TEXT_EN, IMPRINT_TEXT_EN } from '../../lib/legalTextsEn';
import { PRIVACY_TEXT_DE, COOKIE_TEXT_DE, IMPRINT_TEXT_DE } from '../../lib/legalTextsDe';

export type LegalType = 'terms' | 'privacy' | 'how' | 'cookies' | 'imprint';

export const LegalModal: React.FC<{ type: LegalType; onClose: () => void; t: any; language?: string }> = ({ type, onClose, t, language }) => {
    const lang = language === 'EN' || language === 'DE' ? language : 'SLO';
    const titles: Record<LegalType, string> = { terms: t('legalTerms'), privacy: t('legalPrivacy'), how: t('legalHow'), cookies: { SLO: 'Politika piškotkov', EN: 'Cookie Policy', DE: 'Cookie-Richtlinie' }[lang], imprint: { SLO: 'Podatki o ponudniku', EN: 'Provider information', DE: 'Anbieterinformationen' }[lang] };
    // Deutscher Kommentar: Datenschutz-, Cookie- und Impressumstext je nach Sprache (nur die slowenische Fassung ist verbindlich)
    const content: Record<LegalType, string> = {
        terms: t('termsText'),
        privacy: lang === 'EN' ? PRIVACY_TEXT_EN : lang === 'DE' ? PRIVACY_TEXT_DE : PRIVACY_TEXT,
        how: t('howText'),
        cookies: lang === 'EN' ? COOKIE_TEXT_EN : lang === 'DE' ? COOKIE_TEXT_DE : COOKIE_TEXT,
        imprint: lang === 'EN' ? IMPRINT_TEXT_EN : lang === 'DE' ? IMPRINT_TEXT_DE : IMPRINT_TEXT
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-[3000] flex items-center justify-center p-2.5 sm:p-4">
                <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={onClose}></div>
                {/* Deutsches Kommentar: Rechtliches Modal mit max-h-[92dvh] und Touch-Target von 40px fuer Schliessen */}
                <div className="relative bg-white w-full max-w-4xl rounded-3xl sm:rounded-[1.35rem] p-5 sm:p-10 lg:p-14 shadow-2xl animate-in border-2 border-[#FEBA4F] max-h-[92dvh] overflow-y-auto custom-scrollbar">
                    <button onClick={onClose} className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 min-w-[40px] min-h-[40px] flex items-center justify-center"><X size={24} /></button>
                    <h3 className="text-xl sm:text-3xl font-black text-[#0A1128] uppercase tracking-tighter mb-4 sm:mb-8">{titles[type]}</h3>
                    <div className="text-slate-600 font-bold leading-relaxed text-xs sm:text-sm md:text-base whitespace-pre-line mb-6 sm:mb-10 text-justify">
                        {content[type]}
                    </div>
                    <button onClick={onClose} className="w-full bg-[#0A1128] text-white py-3.5 sm:py-5 rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl min-h-[44px] flex items-center justify-center" data-no-translate>{{ SLO: 'Razumem', EN: 'Got it', DE: 'Verstanden' }[lang]}</button>
                </div>
            </div>
        </Portal>
    );
};
