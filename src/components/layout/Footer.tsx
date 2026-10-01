import React from 'react';
import { 
    Mail, 
    Phone, 
    MapPin, 
    CreditCard as CardIcon, 
    ShieldCheck, 
    Lock, 
    Zap, 
    CheckCircle2, 
    FlaskConical,
    HelpCircle,
    FileText,
    ExternalLink,
    Gavel,
    Clock,
    PlusCircle,
    Sparkles
} from 'lucide-react';
import { ViewState } from '../../types';

interface FooterProps {
    t: any;
    onLegal: (type: 'terms' | 'privacy' | 'how') => void;
    onTestSandbox?: () => void;
    onNavigate?: (view: ViewState) => void;
}

export const Footer: React.FC<FooterProps> = ({ 
    t, 
    onLegal, 
    onTestSandbox,
    onNavigate 
}) => {
    return (
        <footer className="bg-[#0A1128] text-white border-t border-white/10 mt-auto">
            {/* Main Footer Links & Info */}
            <div className="max-w-[1600px] mx-auto px-6 py-10 md:py-14">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
                    {/* Brand & Socials Column */}
                    <div className="lg:col-span-2 space-y-4">
                        <div 
                            onClick={() => onNavigate ? onNavigate('grid') : window.scrollTo({ top: 0, behavior: 'smooth' })}
                            className="cursor-pointer inline-block group"
                        >
                            <img 
                                src="https://0iwzttasbg0fikhu.public.blob.vercel-storage.com/drazbeniksi-removebg-preview%281%29.png" 
                                alt="Drazbenik.si" 
                                className="h-35 md:h-42 object-contain group-hover:scale-105 transition-transform" 
                            />
                        </div>
                        <p className="text-slate-400 text-xs md:text-sm font-semibold leading-relaxed max-w-sm">
                            Vodilna slovenska platforma za transparentne in varne digitalne dražbe. Pridružite se skupnosti zanesljivih kupcev in prodajalcev.
                        </p>
                        
                        {/* Real, Functional Social Icons */}
                        <div className="flex items-center gap-2.5 pt-1">
                            {/* Facebook Link */}
                            <a 
                                href="https://www.facebook.com" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                aria-label="Obiščite naš Facebook profil"
                                title="Facebook"
                                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:bg-[#FEBA4F] hover:text-[#0A1128] hover:border-[#FEBA4F] transition-all"
                            >
                                <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                </svg>
                            </a>

                            {/* Instagram Link */}
                            <a 
                                href="https://www.instagram.com" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                aria-label="Obiščite naš Instagram profil"
                                title="Instagram"
                                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:bg-[#FEBA4F] hover:text-[#0A1128] hover:border-[#FEBA4F] transition-all"
                            >
                                <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                            </a>

                            {/* LinkedIn Link */}
                            <a 
                                href="https://www.linkedin.com" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                aria-label="Obiščite naš LinkedIn profil"
                                title="LinkedIn"
                                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:bg-[#FEBA4F] hover:text-[#0A1128] hover:border-[#FEBA4F] transition-all"
                            >
                                <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                </svg>
                            </a>

                            {/* Direct Email Button */}
                            <a 
                                href="mailto:info@drazbenik.si" 
                                aria-label="Pošljite nam e-poštno sporočilo"
                                title="Pišite nam"
                                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:bg-[#FEBA4F] hover:text-[#0A1128] hover:border-[#FEBA4F] transition-all"
                            >
                                <Mail size={16} />
                            </a>
                        </div>
                    </div>

                    {/* Platform Navigation */}
                    <div>
                        <h4 className="font-black uppercase tracking-widest text-xs mb-4 text-[#FEBA4F] flex items-center gap-2">
                            <Gavel size={14} /> Dražbe
                        </h4>
                        <ul className="space-y-2.5 text-xs md:text-sm font-semibold text-slate-400">
                            <li>
                                <button 
                                    onClick={() => onNavigate ? onNavigate('grid') : window.scrollTo({ top: 0, behavior: 'smooth' })}
                                    className="hover:text-white transition-colors text-left"
                                >
                                    Vse aktivne dražbe
                                </button>
                            </li>
                            <li>
                                <button 
                                    onClick={() => onNavigate ? onNavigate('lastChance') : window.scrollTo({ top: 0, behavior: 'smooth' })}
                                    className="hover:text-white transition-colors text-left flex items-center gap-1.5"
                                >
                                    <Clock size={13} className="text-[#FEBA4F]" /> Zadnja priložnost
                                </button>
                            </li>
                            <li>
                                <button 
                                    onClick={() => onNavigate ? onNavigate('createAuction') : window.scrollTo({ top: 0, behavior: 'smooth' })}
                                    className="hover:text-white transition-colors text-left flex items-center gap-1.5"
                                >
                                    <PlusCircle size={13} className="text-[#FEBA4F]" /> Objavi dražbo
                                </button>
                            </li>
                            <li>
                                <button 
                                    onClick={() => onNavigate ? onNavigate('subscriptions') : window.scrollTo({ top: 0, behavior: 'smooth' })}
                                    className="hover:text-white transition-colors text-left flex items-center gap-1.5"
                                >
                                    <Sparkles size={13} className="text-[#FEBA4F]" /> Naročniški paketi
                                </button>
                            </li>
                        </ul>
                    </div>

                    {/* Legal & Help */}
                    <div>
                        <h4 className="font-black uppercase tracking-widest text-xs mb-4 text-[#FEBA4F] flex items-center gap-2">
                            <HelpCircle size={14} /> Pomoč & Pravila
                        </h4>
                        <ul className="space-y-2.5 text-xs md:text-sm font-semibold text-slate-400">
                            <li>
                                <button 
                                    onClick={() => onLegal('how')} 
                                    className="hover:text-white transition-colors text-left"
                                >
                                    Kako delujejo dražbe?
                                </button>
                            </li>
                            <li>
                                <button 
                                    onClick={() => onLegal('terms')} 
                                    className="hover:text-white transition-colors text-left"
                                >
                                    Splošni pogoji poslovanja
                                </button>
                            </li>
                            <li>
                                <button 
                                    onClick={() => onLegal('privacy')} 
                                    className="hover:text-white transition-colors text-left"
                                >
                                    Politika zasebnosti
                                </button>
                            </li>
                            {onTestSandbox && (
                                <li>
                                    <button 
                                        onClick={onTestSandbox} 
                                        className="text-[#FEBA4F] hover:text-white transition-colors flex items-center gap-1.5 font-bold pt-0.5"
                                    >
                                        <FlaskConical size={14} /> Testni kotiček (Sandbox)
                                    </button>
                                </li>
                            )}
                        </ul>
                    </div>

                    {/* Contact & Support */}
                    <div>
                        <h4 className="font-black uppercase tracking-widest text-xs mb-4 text-[#FEBA4F] flex items-center gap-2">
                            <Phone size={14} /> Kontakt
                        </h4>
                        <ul className="space-y-2.5 text-xs md:text-sm font-semibold text-slate-400">
                            <li>
                                <a 
                                    href="mailto:info@drazbenik.si" 
                                    className="flex items-center gap-2 hover:text-white transition-colors"
                                >
                                    <Mail size={14} className="text-[#FEBA4F] shrink-0" />
                                    <span>info@drazbenik.si</span>
                                </a>
                            </li>
                            <li>
                                <a 
                                    href="tel:+38612345678" 
                                    className="flex items-center gap-2 hover:text-white transition-colors"
                                >
                                    <Phone size={14} className="text-[#FEBA4F] shrink-0" />
                                    <span>+386 1 234 5678</span>
                                </a>
                            </li>
                            <li className="flex items-start gap-2">
                                <MapPin size={14} className="text-[#FEBA4F] shrink-0 mt-0.5" />
                                <span>Slovenska cesta 1, Ljubljana</span>
                            </li>
                            <li className="text-[11px] text-slate-500 font-medium pt-0.5">
                                Podpora: Pon – Pet 08:00 – 18:00
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Compact Trust, Security & Payment Strip (Between main footer and copyright bar) */}
            <div className="border-t border-white/5 bg-white/[0.015]">
                <div className="max-w-[1600px] mx-auto px-6 py-3.5">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                            <div className="w-7 h-7 rounded-lg bg-[#FEBA4F]/10 border border-[#FEBA4F]/20 flex items-center justify-center text-[#FEBA4F] shrink-0">
                                <ShieldCheck size={15} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-white truncate">Escrow Zaščita</div>
                                <div className="text-[10px] font-medium text-slate-400 truncate">Zadržana sredstva do prevzema</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                            <div className="w-7 h-7 rounded-lg bg-[#FEBA4F]/10 border border-[#FEBA4F]/20 flex items-center justify-center text-[#FEBA4F] shrink-0">
                                <Lock size={14} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-white truncate">256-bit SSL Enkripcija</div>
                                <div className="text-[10px] font-medium text-slate-400 truncate">100% varni prenosi podatkov</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                            <div className="w-7 h-7 rounded-lg bg-[#FEBA4F]/10 border border-[#FEBA4F]/20 flex items-center justify-center text-[#FEBA4F] shrink-0">
                                <CardIcon size={14} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-white truncate">Stripe & Kartice</div>
                                <div className="text-[10px] font-medium text-slate-400 truncate">Visa, Mastercard, Maestro</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                            <div className="w-7 h-7 rounded-lg bg-[#FEBA4F]/10 border border-[#FEBA4F]/20 flex items-center justify-center text-[#FEBA4F] shrink-0">
                                <Zap size={14} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-white truncate">Hitra izplačila</div>
                                <div className="text-[10px] font-medium text-slate-400 truncate">SEPA & Flik bančna nakazila</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Copyright & Verification Strip */}
            <div className="border-t border-white/5 bg-black/25">
                <div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-3 text-center md:text-left">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                        <p className="text-xs font-semibold text-slate-400">
                            © {new Date().getFullYear()} <span className="text-white font-bold">dražbenik.si</span>. Vse pravice pridržane.
                        </p>
                        <div className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-600"></div>
                        <span className="text-xs font-medium text-slate-400">
                            Varno okolje za spletno draženje v Sloveniji
                        </span>
                    </div>

                    <div className="flex items-center gap-4 text-slate-400 text-xs font-semibold">
                        <span className="flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-[#FEBA4F]" /> Preverjeni prodajalci
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Lock size={13} className="text-emerald-400" /> SSL Zaščita
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
};
