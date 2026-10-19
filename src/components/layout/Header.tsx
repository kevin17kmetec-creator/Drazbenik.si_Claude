import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Check, Star, Search, Globe, ChevronDown, User, PlusCircle, Trophy, Eye, CreditCard, Settings, LogOut, ChevronRight, Gavel, MessageSquare, FileText, Menu, X, MapPin, Tag } from '../icons';
import { ViewState, Region, Category, AuctionItem } from "../../types";
import { Portal } from '../ui/Portal';
import { useChat } from "../../context/ChatContext";
import { SloveniaMap } from "@/src/components/ui/SloveniaMap";
import { getCategoryTranslation } from "../../lib/translations";
import { getUserAuctionCycle, normalizeRegionName } from "../../lib/utils";
import { TERMS_VERSION } from '../../lib/termsVersion';
import { NotificationBell, NotificationItem } from './NotificationBell';

export const Header: React.FC<{ 
  isTermsBarReady?: boolean;
  notifications?: NotificationItem[];
  onMarkNotificationRead?: (id?: string, all?: boolean) => void;
  onSelectNotification?: (notification: NotificationItem) => void;
  onHome: () => void;
  onSearch: (val: string) => void;
  onRegionSelect: (reg: Region | null) => void;
  onCategorySelect: (cat: Category | null) => void;
  onLastChance: () => void;
  onLogin: () => void;
  onRegister?: () => void;
  onLogout: () => void;
  onSettings: (tab?: 'profile' | 'personal' | 'stripe') => void;
  onSubscriptions: () => void;
  onCreateAuction: () => void;
  onMyWinnings: () => void;
  onMyBids: () => void;
  onMySold?: () => void;
  onMyUnsold?: () => void;
  onMyReviews?: () => void;
  onWatchlist: () => void;
  onMessages: () => void;
  onAcceptTerms?: () => void;
  onAdminAccounting?: () => void;
  activeView: ViewState;
  selectedRegion: Region | null;
  selectedRegions?: Region[];
  onRegionsChange?: (regs: Region[]) => void;
  selectedCategory: Category | null;
  isLoggedIn: boolean;
  isAuthLoading?: boolean;
  isVerified: boolean;
  language: string;
  onLanguageChange: (l: string) => void;
  t: (k: string) => string;
  auctions: AuctionItem[];
  newWinningsCount?: number;
  userEmail?: string;
  userProfilePicture?: string;
  userData?: any;
}> = ({ isTermsBarReady = false, notifications = [], onMarkNotificationRead, onSelectNotification, onHome, onSearch, onRegionSelect, onRegionsChange, selectedRegions = [], onCategorySelect, onLastChance, onLogin, onRegister, onLogout, onSettings, onSubscriptions, onCreateAuction, onMyWinnings, onMyBids, onMySold, onMyUnsold, onMyReviews, onWatchlist, onMessages, onAcceptTerms, activeView, selectedRegion, selectedCategory, isLoggedIn, isAuthLoading, isVerified, language, onLanguageChange, t, auctions, newWinningsCount, userEmail, userProfilePicture, userData, onAdminAccounting }) => {
  const { unreadMessageCount } = useChat();

  const [isRegOpen, setIsRegOpen] = useState(false);
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  // Zustand fuer das mobile Navigationsmenue (Drawer)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  // Deutscher Kommentar: Kopfzeile folgt auf Smartphones direkt der Scrollbewegung (ohne Animation, ohne Rand)
  const headerRef = useRef<HTMLElement | null>(null);
  const lastScrollYRef = useRef(0);
  const headerOffsetRef = useRef(0);
  const headerLockedRef = useRef(false);
  const [mobileDrawerRegOpen, setMobileDrawerRegOpen] = useState(false);
  const [mobileDrawerCatOpen, setMobileDrawerCatOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    let ticking = false;

    const applyOffset = (px: number) => {
      headerOffsetRef.current = px;
      if (headerRef.current) {
        headerRef.current.style.transform = px > 0 ? `translate3d(0, -${px}px, 0)` : '';
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        if (!mq.matches) {
          // Deutscher Kommentar: Auf dem Desktop bleibt die Kopfzeile immer fest oben
          if (headerOffsetRef.current !== 0) applyOffset(0);
          return;
        }
        const y = Math.max(0, window.scrollY);
        const delta = y - lastScrollYRef.current;
        lastScrollYRef.current = y;
        if (headerLockedRef.current || y <= 0) {
          if (headerOffsetRef.current !== 0) applyOffset(0);
          return;
        }
        // Deutscher Kommentar: Hoehe plus Schattenreserve, damit nach dem Ausblenden kein Rand sichtbar bleibt
        const maxOffset = (headerRef.current?.offsetHeight || 64) + 24;
        const next = Math.min(maxOffset, Math.max(0, headerOffsetRef.current + delta));
        if (next !== headerOffsetRef.current) applyOffset(next);
      });
    };

    lastScrollYRef.current = Math.max(0, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    const onChange = () => { if (!mq.matches) applyOffset(0); };
    mq.addEventListener('change', onChange);
    return () => {
      window.removeEventListener('scroll', onScroll);
      mq.removeEventListener('change', onChange);
    };
  }, []);

  // Deutscher Kommentar: Bei offenem Menue bleibt die Kopfzeile sichtbar
  useEffect(() => {
    headerLockedRef.current = isMobileDrawerOpen || isUserMenuOpen || isLangOpen;
    if (headerLockedRef.current && headerRef.current) {
      headerOffsetRef.current = 0;
      headerRef.current.style.transform = '';
    }
  }, [isMobileDrawerOpen, isUserMenuOpen, isLangOpen]);

  // Profile badge zeigt nur gewonnene Auktionen
  const wonAuctionsBadge = newWinningsCount || 0;
  let monthlyAuctionsCount = 0;
  let userLimit = 5;
  let cycleResetDate: Date | null = null;
  let isUnlimited = false;
  let activeTier = "FREE";
  let isTierCanceled = false;

  if (userData && auctions) {
      const cycleInfo = getUserAuctionCycle(auctions, userData.id, userData);
      monthlyAuctionsCount = cycleInfo.count;
      userLimit = cycleInfo.userLimit;
      isUnlimited = cycleInfo.isUnlimited;
      cycleResetDate = cycleInfo.resetDate;
      activeTier = cycleInfo.tier;
      isTierCanceled = !!cycleInfo.isCanceled;
  }

  // Deutscher Kommentar: Eigene Bewertung (Durchschnitt und Anzahl) fuer den Schnellzugriff im Profilmenue
  const myRating = Number(userData?.rating) || 0;
  const myReviewCount = Number(userData?.review_count ?? userData?.reviews_count) || 0;

  const userMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const catMenuRef = useRef<HTMLDivElement>(null);
  const regMenuRef = useRef<HTMLDivElement>(null);
  // Deutscher Kommentar: Mehrfachauswahl der Regionen; Fallback auf Einzelauswahl, falls kein Mehrfach-Handler uebergeben wurde
  const activeRegions: Region[] = selectedRegions.length > 0 ? selectedRegions : (selectedRegion ? [selectedRegion] : []);
  const toggleRegion = (r: Region | null) => {
    if (!r) { onRegionsChange ? onRegionsChange([]) : onRegionSelect(null); return; }
    if (!onRegionsChange) { onRegionSelect(r); return; }
    const exists = activeRegions.some(x => x.toLowerCase() === String(r).toLowerCase());
    onRegionsChange(exists ? activeRegions.filter(x => x.toLowerCase() !== String(r).toLowerCase()) : [...activeRegions, r]);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
      if (catMenuRef.current && !catMenuRef.current.contains(event.target as Node)) {
        setIsCatOpen(false);
      }
      if (regMenuRef.current && !regMenuRef.current.contains(event.target as Node)) {
        setIsRegOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Schliessen des mobilen Drawers bei Druck auf Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMobileDrawerOpen(false);
        setIsLangOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const languages = [
      { code: 'SLO', label: 'Slovenščina' },
      { code: 'EN', label: 'English' },
      { code: 'DE', label: 'Deutsch' }
  ];

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(Region).forEach(r => counts[r] = 0);
    const now = Date.now();
    const seenPackages = new Set<string>();

    auctions.forEach(a => {
      const isStatusActive = a.status === 'active';
      const isTimeActive = a.endTime ? new Date(a.endTime).getTime() > now : true;
      if (!isStatusActive || !isTimeActive) return;

      const normReg = normalizeRegionName(a.region || (typeof a.location === 'object' ? a.location?.SLO : a.location));
      const pkgId = a.package_id || (a as any).packageId;

      if (a.is_package && pkgId) {
        if (!seenPackages.has(pkgId)) {
          seenPackages.add(pkgId);
          if (counts[normReg] !== undefined) counts[normReg]++;
          else counts[normReg] = 1;
        }
      } else {
        if (counts[normReg] !== undefined) counts[normReg]++;
        else counts[normReg] = 1;
      }
    });
    return counts;
  }, [auctions]);

  // Leiste fuer aktualisierte Bedingungen nur anzeigen, wenn ein registrierter Benutzer die alten Bedingungen akzeptiert hat
  const showTermsUpdateBar = isTermsBarReady && isLoggedIn && userData && (
    (typeof userData.terms_version === 'string' && userData.terms_version.length > 0 && userData.terms_version !== TERMS_VERSION) ||
    ((!userData.terms_version) && userData.terms_accepted_at)
  );

  return (
    <header ref={headerRef} className="bg-[#0A1128] text-white shadow-2xl border-b-2 border-[#FEBA4F] sticky top-0 z-[500]">
      {showTermsUpdateBar && (
        <div className="bg-[#FEBA4F] text-[#0A1128] px-4 sm:px-6 py-2.5 sm:py-3 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 animate-in fade-in slide-in-from-top duration-500">
          {/* Leiste fuer aktualisierte Bedingungen beim Laden */}
          <p className="text-xs sm:text-sm font-black uppercase tracking-tight text-center sm:text-left">
            Pogoje uporabe smo posodobili. Prosimo, preberite in potrdite jih za nadaljevanje.
          </p>
          <button 
            onClick={onAcceptTerms}
            className="bg-[#0A1128] text-white px-4 py-1.5 sm:px-6 sm:py-2 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-lg min-h-[40px] flex items-center justify-center"
          >
            Preberi in potrdi
          </button>
        </div>
      )}

      {/* Haupt-Kopfzeile: Hoehe maximal 56px (h-14) auf Smartphones, h-28 auf Desktop */}
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-16 md:h-28 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo (auf Handys kompakt, auf Desktop gewohnte Groesse) */}
        <div 
          onClick={() => { onHome(); setIsMobileDrawerOpen(false); }} 
          className="flex items-center cursor-pointer group shrink-0 min-h-[40px]"
        >
          <img 
            src="https://0iwzttasbg0fikhu.public.blob.vercel-storage.com/drazbeniksi-removebg-preview%281%29.png" 
            alt="Drazbenik.si Logo" 
            className="h-11 sm:h-12 md:h-36 object-contain group-hover:scale-105 transition-transform" 
          />
        </div>

        {/* Desktop-Suchleiste */}
        <div className="hidden md:flex flex-1 max-w-xl mx-8 relative">
          <input 
            type="text" 
            placeholder={t('searchPlaceholder')} 
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-5 pr-12 text-sm focus:ring-2 focus:ring-[#FEBA4F] outline-none placeholder-slate-500 font-bold" 
            onChange={(e) => onSearch(e.target.value)} 
          />
          <Search className="absolute right-4 top-3.5 text-slate-500" size={18} />
        </div>

        {/* Desktop-Aktionen (Sprache, Benachrichtigungen, Profil / Login) */}
        <div className="hidden md:flex items-center gap-3">
          {isLoggedIn && (
            <>
              <NotificationBell
                language={language}
                notifications={notifications}
                onMarkRead={onMarkNotificationRead || (() => {})}
                onSelectNotification={onSelectNotification || (() => {})}
              />
              <button 
                onClick={onMessages} 
                className={`relative bg-white/5 p-3 rounded-xl border border-white/10 transition-all text-white flex items-center justify-center min-w-[40px] min-h-[40px] ${activeView === 'messages' ? 'bg-[#FEBA4F] text-[#0A1128] border-transparent' : 'hover:bg-white/10 hover:text-[#FEBA4F]'}`}
              >
                <MessageSquare size={16} />
                {unreadMessageCount !== undefined && unreadMessageCount > 0 && (
                    <span className="absolute -top-2.5 -right-2.5 bg-red-600 text-white text-[11px] font-extrabold w-6 h-6 flex items-center justify-center rounded-full border-2 border-[#0A1128] animate-pulse shadow-lg select-none">
                        {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                )}
              </button>
            </>
          )}

          {/* Desktop Sprachauswahl */}
          <div className="relative h-full flex items-center"
               ref={langMenuRef}>
              <button 
                onClick={() => setIsLangOpen(prev => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isLangOpen}
                className="bg-white/5 px-3.5 py-2.5 rounded-xl border border-white/10 hover:bg-white/10 transition-all font-black text-xs uppercase tracking-wider flex items-center gap-1.5 text-slate-200 hover:text-white min-h-[40px]"
              >
                <Globe size={15} className="text-[#FEBA4F]" /> 
                <span>{language}</span> 
                <ChevronDown size={13} className={`transition-transform duration-200 ${isLangOpen ? 'rotate-180 text-[#FEBA4F]' : ''}`} />
              </button>
              {isLangOpen && (
                  <div className="absolute top-full right-0 mt-1 w-56 bg-[#0A1128] border border-white/10 rounded-2xl shadow-2xl py-3 z-[1000] animate-in overflow-hidden">
                    {languages.map(l => (
                        <button 
                          key={l.code} 
                          onClick={() => { onLanguageChange(l.code); setIsLangOpen(false); }} 
                          className={`w-full text-left px-6 py-3.5 hover:bg-white/5 text-xs font-black uppercase tracking-widest transition-all flex items-center justify-between ${language === l.code ? 'text-[#FEBA4F] bg-white/5' : 'text-slate-300 hover:text-white'}`}
                        >
                            <span>{l.label}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-black ${language === l.code ? 'bg-[#FEBA4F]/20 text-[#FEBA4F]' : 'bg-white/5 text-slate-400'}`}>{l.code}</span>
                        </button>
                    ))}
                  </div>
              )}
          </div>

          {isAuthLoading ? (
            <div className="w-32 h-10 bg-white/10 rounded-2xl animate-pulse flex items-center justify-center text-white/50 text-xs font-bold">Nalaganje...</div>
          ) : isLoggedIn ? (
            <div className="flex items-center gap-3">
              <div className="relative" ref={userMenuRef}>
                <button 
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} 
                  className="flex items-center gap-3 bg-white text-[#0A1128] px-6 py-2.5 rounded-2xl font-black text-sm shadow-xl hover:bg-slate-50 transition-colors min-h-[40px]"
                >
                {wonAuctionsBadge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full animate-pulse">{wonAuctionsBadge > 9 ? '9+' : wonAuctionsBadge}</span>
                )}
                    {userProfilePicture ? (
                    <img 
                      src={userProfilePicture} 
                      alt="Profile" 
                      className="w-5 h-5 rounded-full object-cover" 
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>');
                      }}
                    />
                ) : (
                    <User size={18} />
                )}
                <span>{t('myProfile')}</span>
                <ChevronDown size={14} className={isUserMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'}/>
              </button>
              {isUserMenuOpen && (
                <div className="absolute top-full right-0 mt-3 w-max min-w-[16rem] max-w-[calc(100vw-1.5rem)] bg-white border border-slate-200 rounded-[1.35rem] shadow-2xl py-4 text-[#0A1128] overflow-hidden z-[100] animate-in [&_button]:whitespace-nowrap">
                    {userData && (
                      <div className="px-6 py-4 border-b border-slate-100 mb-2 bg-slate-50">
                          <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-black text-slate-400 uppercase">Objave v ciklu</p>
                              {isUnlimited ? (
                                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                      Brez omejitve
                                  </span>
                              ) : (
                                  <p className="text-xs font-black text-[#0A1128]">
                                      {monthlyAuctionsCount} / {userLimit}
                                  </p>
                              )}
                          </div>
                          {!isUnlimited && (
                              <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                                  <div 
                                      className={`h-full rounded-full transition-all ${monthlyAuctionsCount >= userLimit ? "bg-red-500" : "bg-[#FEBA4F]"}`} 
                                      style={{ width: `${Math.min(100, (monthlyAuctionsCount / userLimit) * 100)}%` }}
                                  ></div>
                              </div>
                          )}
                          {cycleResetDate && (
                              <p className="text-[10px] text-slate-500 mt-2 font-medium">
                                  {activeTier !== 'FREE' 
                                      ? (isTierCanceled ? 'Velja do: ' : 'Naslednja bremenitev: ') 
                                      : 'Ponastavitev: '}
                                  <span className="font-bold text-[#0A1128]">{cycleResetDate.toLocaleDateString('sl-SI')}</span>
                              </p>
                          )}
                          {!cycleResetDate && activeTier === 'FREE' && (
                              <p className="text-[10px] text-slate-400 mt-2 italic">
                                  Cikel se začne ob prvi objavi
                              </p>
                          )}
                      </div>
                    )}
                    <div className="px-6 py-4 border-b border-slate-100 mb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase">{t('loggedInAs')}</p>
                        <p className="font-black text-xs truncate">
                            {(() => {
                                const name = userData?.username || userEmail || 'Uporabnik dražbenik.si';
                                return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
                            })()}
                        </p>
                    </div>
                    {onMyReviews && (
                      <button onClick={() => { onMyReviews(); setIsUserMenuOpen(false); }} className="w-full px-6 py-3 mb-1 hover:bg-slate-50 transition-colors text-left border-b border-slate-100">
                        <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Moje ocene</span>
                        <span className="flex items-center gap-2">
                          <span className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} size={14} className={myReviewCount > 0 && n <= Math.round(myRating) ? 'text-[#FEBA4F] fill-[#FEBA4F]' : 'text-slate-300'} />
                            ))}
                          </span>
                          {myReviewCount > 0 ? (
                            <span className="text-xs font-black text-[#0A1128]">{myRating.toFixed(1).replace('.', ',')} <span className="text-slate-400 font-bold">({myReviewCount})</span></span>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400">Še brez ocen</span>
                          )}
                          <ChevronRight size={14} className="ml-auto text-slate-400" />
                        </span>
                      </button>
                    )}
                    <button onClick={() => { onCreateAuction(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-xs font-black uppercase tracking-widest"><PlusCircle size={18} /> {t('createAuction')}</button>
                    <button onClick={() => { onMyWinnings(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-xs font-black uppercase tracking-widest"><Trophy size={18} /> {t('myWinnings')}
                      {newWinningsCount !== undefined && newWinningsCount > 0 && (
                        <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{newWinningsCount}</span>
                      )}
                    </button>
                    <button onClick={() => { onMyBids(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-xs font-black uppercase tracking-widest"><Gavel size={18} /> {t('myBids')}</button>
                    <button onClick={() => { onMySold?.(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-xs font-black uppercase tracking-widest"><CreditCard size={18} /> {t('soldAuctions')}</button>
                    <button onClick={() => { onMyUnsold?.(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-xs font-black uppercase tracking-widest"><Settings size={18} /> {t('unsoldAuctions')}</button>
                    <button onClick={() => { onWatchlist(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-xs font-black uppercase tracking-widest"><Eye size={18} /> {t('watchlist')}</button>
                    <button onClick={() => { onSubscriptions(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-xs font-black uppercase tracking-widest"><CreditCard size={18} /> {t('subscriptions')}</button>
                    <button onClick={() => { onSettings(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-xs font-black uppercase tracking-widest"><Settings size={18} /> {t('settings')}</button>
                    {((userData?.role === 'admin' || userData?.isAdmin === true || ((import.meta.env.VITE_ADMIN_UIDS as string) || '').split(',').map((s: string) => s.trim()).includes(userData?.id))) && onAdminAccounting && (
                      <button onClick={() => { onAdminAccounting(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-xs font-black uppercase tracking-widest text-[#0A1128] border-t border-slate-100">
                        <FileText size={18} className="text-[#FEBA4F]" /> Računovodstvo
                      </button>
                    )}
                    <button onClick={() => { onLogout(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-red-50 text-red-600 transition-colors text-xs font-black uppercase tracking-widest border-t border-slate-100"><LogOut size={18} /> {t('logout')}</button>
                </div>
              )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <button 
                onClick={onRegister || onLogin} 
                className="text-[#FEBA4F] underline underline-offset-2 text-[11px] font-black uppercase tracking-widest hover:text-white transition-colors"
              >
                Registracija
              </button>
              <button onClick={onLogin} className="bg-[#FEBA4F] text-[#0A1128] px-8 py-2.5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-white transition-all shadow-xl min-h-[40px]">{t('login')}</button>
            </div>
          )}
        </div>

        {/* Mobile-Kopfzeilen-Bedienelemente: Glocke, Nachrichten und Hamburger-Schaltflaeche (mindestens 40px Touch-Target) */}
        <div className="flex md:hidden items-center gap-1.5 sm:gap-2">
          {isLoggedIn && (
            <>
              <NotificationBell
                language={language}
                notifications={notifications}
                onMarkRead={onMarkNotificationRead || (() => {})}
                onSelectNotification={onSelectNotification || (() => {})}
              />
              <button 
                onClick={onMessages} 
                className={`relative bg-white/5 p-2 rounded-xl border border-white/10 text-white min-w-[40px] min-h-[40px] flex items-center justify-center ${activeView === 'messages' ? 'bg-[#FEBA4F] text-[#0A1128] border-transparent' : 'hover:bg-white/10'}`}
                aria-label="Sporočila"
              >
                <MessageSquare size={17} />
                {unreadMessageCount !== undefined && unreadMessageCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-extrabold w-5 h-5 flex items-center justify-center rounded-full border border-[#0A1128] animate-pulse">
                        {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                )}
              </button>
            </>
          )}

          {/* Hamburger-Button fuer mobiles Navigationsmenue */}
          <button 
            onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 min-w-[40px] min-h-[40px] flex items-center justify-center relative transition-colors"
            aria-label="Odpri meni"
          >
            {isMobileDrawerOpen ? <X size={20} /> : <Menu size={20} />}
            {wonAuctionsBadge > 0 && !isMobileDrawerOpen && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full animate-pulse">
                {wonAuctionsBadge > 9 ? '9+' : wonAuctionsBadge}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Zweite Navigationsleiste auf Desktop (fuer Handys in den Drawer integriert) */}
      <div className="hidden md:flex max-w-[1600px] mx-auto px-6 h-14 items-center gap-8 md:gap-12 text-xs md:text-sm font-black uppercase tracking-wider md:tracking-widest border-t border-white/10">
        <button 
            onClick={onHome} 
            className={`flex items-center gap-2 h-full py-3 hover:text-[#FEBA4F] transition-all relative ${
                activeView === 'grid' && activeRegions.length === 0 && !selectedCategory ? 'text-[#FEBA4F]' : 'text-slate-200'
            }`}
        >
            <span>{t('allAuctions')}</span>
            {activeView === 'grid' && activeRegions.length === 0 && !selectedCategory && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FEBA4F] rounded-full shadow-[0_0_8px_#FEBA4F]" />
            )}
        </button>
        
        <div className="relative h-full flex items-center" 
             ref={regMenuRef}
             onMouseEnter={() => setIsRegOpen(true)}
             onMouseLeave={() => setIsRegOpen(false)}>
            <button className={`flex items-center gap-2 h-full py-3 hover:text-[#FEBA4F] transition-all relative ${
                activeRegions.length > 0 ? 'text-[#FEBA4F]' : 'text-slate-200'
            }`}>
                <span>{t('regions')}{activeRegions.length > 0 ? ` (${activeRegions.length})` : ''}</span> 
                <ChevronDown size={14} className={`transition-transform duration-200 ${isRegOpen ? 'rotate-180 text-[#FEBA4F]' : ''}`}/>
                {activeRegions.length > 0 && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FEBA4F] rounded-full shadow-[0_0_8px_#FEBA4F]" />
                )}
            </button>
            {isRegOpen && (
                <div className="absolute top-full left-0 w-[840px] max-w-[95vw] z-[1000] animate-in fade-in zoom-in-95 duration-200 shadow-2xl">
                    <SloveniaMap
                        regionsData={regionCounts}
                        selectedRegions={activeRegions}
                        multi
                        onSelectRegion={(reg) => {
                            // Menue bleibt offen, damit mehrere Regionen gewaehlt werden koennen
                            toggleRegion(reg ? (reg as Region) : null);
                        }}
                        t={t}
                        showTitle={true}
                    />
                </div>
            )}
        </div>

        <div className="relative h-full flex items-center" 
             ref={catMenuRef}
             onMouseEnter={() => setIsCatOpen(true)}
             onMouseLeave={() => setIsCatOpen(false)}>
            <button className={`flex items-center gap-2 h-full py-3 hover:text-[#FEBA4F] transition-all relative ${
                selectedCategory ? 'text-[#FEBA4F]' : 'text-slate-200'
            }`}>
                <span>{t('categories')}</span> 
                <ChevronDown size={14} className={`transition-transform duration-200 ${isCatOpen ? 'rotate-180 text-[#FEBA4F]' : ''}`}/>
                {selectedCategory && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FEBA4F] rounded-full shadow-[0_0_8px_#FEBA4F]" />
                )}
            </button>
            {isCatOpen && (
                <div className="absolute top-full left-0 w-72 bg-[#0A1128] border border-white/10 rounded-b-2xl shadow-2xl py-3 z-[1000] animate-in grid grid-cols-1 max-h-[420px] overflow-y-auto">
                    <button onClick={() => { onCategorySelect(null); setIsCatOpen(false); }} className={`w-full text-left px-6 py-4 hover:bg-white/5 text-xs font-black uppercase tracking-widest transition-all ${!selectedCategory ? 'text-[#FEBA4F] bg-white/5' : 'text-slate-300 hover:text-white'}`}>{t('allCategories')}</button>
                    {Object.values(Category).map(c => (
                        <button key={c} onClick={() => { onCategorySelect(c); setIsCatOpen(false); }} className={`w-full text-left px-6 py-4 hover:bg-white/5 text-xs font-black uppercase tracking-widest transition-all ${selectedCategory === c ? 'text-[#FEBA4F] bg-white/5' : 'text-slate-300 hover:text-white'}`}>{getCategoryTranslation(c, t)}</button>
                    ))}
                </div>
            )}
        </div>

        <button 
            onClick={onLastChance} 
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FEBA4F]/10 border border-[#FEBA4F]/30 hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all text-[#FEBA4F] font-black group shadow-sm text-xs md:text-sm uppercase tracking-wider md:tracking-widest"
        >
            <span>{t('lastChance')}</span> 
            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* Mobiler Navigations-Drawer (Slide-Over-Menue fuer Handys) */}
      {isMobileDrawerOpen && (
        <Portal>
        <div className="fixed inset-0 z-[1000] md:hidden flex justify-end animate-in fade-in duration-200">
          {/* Hintergrund-Overlay (Schliesst Menue beim Tippen ins Freie) */}
          <div 
            className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm" 
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Menue-Inhalt */}
          <div className="relative w-full max-w-[320px] bg-[#0A1128] border-l border-white/10 h-full overflow-y-auto p-5 flex flex-col gap-4 text-white shadow-2xl z-10">
            {/* Kopfzeile des Drawers */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="font-black text-sm uppercase tracking-widest text-[#FEBA4F]">Meni</span>
              <button 
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 min-w-[40px] min-h-[40px] flex items-center justify-center"
                aria-label="Zapri meni"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mobile Suche */}
            <div className="relative">
              <input 
                type="text" 
                placeholder={t('searchPlaceholder')} 
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-4 pr-10 text-xs focus:ring-2 focus:ring-[#FEBA4F] outline-none placeholder-slate-500 font-bold" 
                onChange={(e) => onSearch(e.target.value)} 
              />
              <Search className="absolute right-3 top-3 text-slate-500" size={16} />
            </div>

            {/* Benutzerbereich im mobilen Drawer */}
            {isLoggedIn ? (
              <div className="flex flex-col gap-3">
                {/* Monatszyklus-Zaehler kompakt */}
                {userData && (
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex items-center justify-between text-[11px] font-black mb-1">
                      <span className="text-slate-400 uppercase">Objave v ciklu</span>
                      {isUnlimited ? (
                        <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-[10px]">Brez omejitve</span>
                      ) : (
                        <span className="text-[#FEBA4F]">{monthlyAuctionsCount} / {userLimit}</span>
                      )}
                    </div>
                    {!isUnlimited && (
                      <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${monthlyAuctionsCount >= userLimit ? "bg-red-500" : "bg-[#FEBA4F]"}`}
                          style={{ width: `${Math.min(100, (monthlyAuctionsCount / userLimit) * 100)}%` }}
                        />
                      </div>
                    )}
                    {cycleResetDate && (
                      <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                        Ponastavitev: <span className="text-white font-bold">{cycleResetDate.toLocaleDateString('sl-SI')}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Primaere Aktion: Dražba objaviti */}
                <button 
                  onClick={() => { onCreateAuction(); setIsMobileDrawerOpen(false); }} 
                  className="w-full bg-[#FEBA4F] text-[#0A1128] py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg min-h-[40px]"
                >
                  <PlusCircle size={16} /> {t('createAuction')}
                </button>

                {/* Links zu Benutzerseiten */}
                <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
                  <button 
                    onClick={() => { onMyWinnings(); setIsMobileDrawerOpen(false); }} 
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
                  >
                    <span className="flex items-center gap-2.5"><Trophy size={16} className="text-[#FEBA4F]" /> {t('myWinnings')}</span>
                    {wonAuctionsBadge > 0 && (
                      <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{wonAuctionsBadge}</span>
                    )}
                  </button>

                  <button 
                    onClick={() => { onMyBids(); setIsMobileDrawerOpen(false); }} 
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
                  >
                    <Gavel size={16} className="text-[#FEBA4F]" /> {t('myBids')}
                  </button>

                  <button 
                    onClick={() => { onMySold?.(); setIsMobileDrawerOpen(false); }} 
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
                  >
                    <CreditCard size={16} className="text-[#FEBA4F]" /> {t('soldAuctions')}
                  </button>

                  <button 
                    onClick={() => { onMyReviews?.(); setIsMobileDrawerOpen(false); }} 
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
                  >
                    <Star size={16} className="text-[#FEBA4F]" /> Moje ocene {myReviewCount > 0 ? `(${myRating.toFixed(1).replace('.', ',')} · ${myReviewCount})` : ''}
                  </button>

                  <button 
                    onClick={() => { onMyUnsold?.(); setIsMobileDrawerOpen(false); }} 
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
                  >
                    <Settings size={16} className="text-[#FEBA4F]" /> {t('unsoldAuctions')}
                  </button>

                  <button 
                    onClick={() => { onWatchlist(); setIsMobileDrawerOpen(false); }} 
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
                  >
                    <Eye size={16} className="text-[#FEBA4F]" /> {t('watchlist')}
                  </button>

                  <button 
                    onClick={() => { onSubscriptions(); setIsMobileDrawerOpen(false); }} 
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
                  >
                    <CreditCard size={16} className="text-[#FEBA4F]" /> {t('subscriptions')}
                  </button>

                  <button 
                    onClick={() => { onSettings(); setIsMobileDrawerOpen(false); }} 
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
                  >
                    <Settings size={16} className="text-[#FEBA4F]" /> {t('settings')}
                  </button>

                  {((userData?.role === 'admin' || userData?.isAdmin === true || ((import.meta.env.VITE_ADMIN_UIDS as string) || '').split(',').map((s: string) => s.trim()).includes(userData?.id))) && onAdminAccounting && (
                    <button 
                      onClick={() => { onAdminAccounting(); setIsMobileDrawerOpen(false); }} 
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-[#FEBA4F] min-h-[40px]"
                    >
                      <FileText size={16} /> Računovodstvo
                    </button>
                  )}

                  <button 
                    onClick={() => { onLogout(); setIsMobileDrawerOpen(false); }} 
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-400 text-xs font-black uppercase tracking-wider min-h-[40px] mt-1"
                  >
                    <LogOut size={16} /> {t('logout')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-2xl border border-white/10">
                <button 
                  onClick={() => { onLogin(); setIsMobileDrawerOpen(false); }} 
                  className="w-full bg-[#FEBA4F] text-[#0A1128] py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg min-h-[40px]"
                >
                  {t('login')}
                </button>
                <button 
                  onClick={() => { (onRegister || onLogin)(); setIsMobileDrawerOpen(false); }} 
                  className="w-full bg-white/10 hover:bg-white/15 text-white py-2.5 rounded-xl font-black text-xs uppercase tracking-wider min-h-[40px]"
                >
                  Registracija
                </button>
              </div>
            )}

            {/* Allgemeine Navigation (Alle Auktionen, Letzte Chance, Regionen, Kategorien) */}
            <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
              <button 
                onClick={() => { onHome(); onRegionSelect(null); onCategorySelect(null); setIsMobileDrawerOpen(false); }} 
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
              >
                <span>{t('allAuctions')}</span>
              </button>

              <button 
                onClick={() => { onLastChance(); setIsMobileDrawerOpen(false); }} 
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#FEBA4F]/10 border border-[#FEBA4F]/30 text-[#FEBA4F] text-xs font-black uppercase tracking-wider min-h-[40px]"
              >
                <span>{t('lastChance')}</span>
                <ChevronRight size={14} />
              </button>

              {/* Regionen Klappmenue */}
              <button 
                onClick={() => setMobileDrawerRegOpen(!mobileDrawerRegOpen)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
              >
                <span className="flex items-center gap-2"><MapPin size={15} className="text-[#FEBA4F]" /> {t('regions')}</span>
                <ChevronDown size={14} className={`transition-transform ${mobileDrawerRegOpen ? 'rotate-180 text-[#FEBA4F]' : ''}`} />
              </button>
              {mobileDrawerRegOpen && (
                <div className="pl-4 pr-1 py-1 flex flex-col gap-1 max-h-48 overflow-y-auto">
                  <button 
                    onClick={() => { toggleRegion(null); }} 
                    className="text-left py-1.5 px-2 text-[11px] font-bold text-slate-300 hover:text-[#FEBA4F]"
                  >
                    Vse regije
                  </button>
                  {Object.values(Region).map(r => (
                    <button 
                      key={r} 
                      onClick={() => { toggleRegion(r); }} 
                      className={`text-left py-1.5 px-2 text-[11px] font-bold hover:text-[#FEBA4F] flex items-center justify-between ${activeRegions.some(x => x === r) ? 'text-[#FEBA4F]' : 'text-slate-300'}`}
                    >
                      <span className="flex items-center gap-1.5">{activeRegions.some(x => x === r) ? <Check size={12} strokeWidth={2.5} /> : null}{r}</span>
                      {regionCounts[r] > 0 && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-slate-300">{regionCounts[r]}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Kategorien Klappmenue */}
              <button 
                onClick={() => setMobileDrawerCatOpen(!mobileDrawerCatOpen)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs font-black uppercase tracking-wider text-slate-200 min-h-[40px]"
              >
                <span className="flex items-center gap-2"><Tag size={15} className="text-[#FEBA4F]" /> {t('categories')}</span>
                <ChevronDown size={14} className={`transition-transform ${mobileDrawerCatOpen ? 'rotate-180 text-[#FEBA4F]' : ''}`} />
              </button>
              {mobileDrawerCatOpen && (
                <div className="pl-4 pr-1 py-1 flex flex-col gap-1 max-h-48 overflow-y-auto">
                  <button 
                    onClick={() => { onCategorySelect(null); setIsMobileDrawerOpen(false); }} 
                    className="text-left py-1.5 px-2 text-[11px] font-bold text-slate-300 hover:text-[#FEBA4F]"
                  >
                    {t('allCategories')}
                  </button>
                  {Object.values(Category).map(c => (
                    <button 
                      key={c} 
                      onClick={() => { onCategorySelect(c); setIsMobileDrawerOpen(false); }} 
                      className="text-left py-1.5 px-2 text-[11px] font-bold text-slate-300 hover:text-[#FEBA4F]"
                    >
                      {getCategoryTranslation(c, t)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sprachauswahl im mobilen Drawer */}
            <div className="mt-auto pt-4 border-t border-white/10">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <Globe size={13} className="text-[#FEBA4F]" /> Jezik / Language
              </p>
              <div className="grid grid-cols-3 gap-2">
                {languages.map(l => (
                  <button
                    key={l.code}
                    onClick={() => { onLanguageChange(l.code); }}
                    className={`py-2 rounded-xl text-xs font-black uppercase transition-all min-h-[40px] flex items-center justify-center ${language === l.code ? 'bg-[#FEBA4F] text-[#0A1128]' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                  >
                    {l.code}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </header>
  );
};
