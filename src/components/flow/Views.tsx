
import React, { useState, useRef } from 'react';
import { 
  ArrowLeft, Eye, EyeOff, Trophy, Gavel, Clock, CreditCard as CardIcon, 
  Lock, Zap, Settings, Camera, User, Building2, CheckCircle2, AlertCircle, Trash2
} from 'lucide-react';
import { AuctionItem, SubscriptionTier, Seller, Category, Region } from '../../types';
import { AuctionCard } from "@/src/components/auction/AuctionCard";
import AuctionView from "@/src/components/auction/AuctionView";
import { HeroCarousel } from "@/src/components/auction/HeroCarousel";
import { auth, db } from "../../lib/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { toast } from 'sonner';

export const WatchlistView = ({ 
  watchlist, auctions, onAuctionClick, onWatchToggle, t, language, onBack, isVerified 
}: { 
  watchlist: string[], auctions: AuctionItem[], onAuctionClick: (a: AuctionItem) => void, onWatchToggle: (id: string) => void, t: any, language: string, onBack: () => void, isVerified: boolean 
}) => {
  const watchedAuctions = auctions.filter(a => watchlist.includes(a.id));

  return (
    <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"><ArrowLeft size={16}/> {t('back')}</button>
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
        <div className="flex items-center gap-6 mb-12">
          <div className="bg-[#FEBA4F] p-4 rounded-3xl shadow-lg shadow-[#FEBA4F]/20">
            <Eye size={40} className="text-[#0A1128]" />
          </div>
          <div>
            <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128]">{t('watchlistTitle')}</h2>
            <p className="text-slate-400 font-bold mt-2">{t('watchlistDesc')}</p>
          </div>
        </div>
        
        <div className="grid gap-8 justify-center" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 320px))' }}>
          {watchedAuctions.map(item => (
            <AuctionCard 
              key={item.id} 
              item={item} 
              t={t} 
              language={language} 
              isVerified={isVerified}
              isWatched={true}
              onWatchToggle={() => onWatchToggle(item.id)}
              onClick={() => onAuctionClick(item)} 
            />
          ))}
          {watchedAuctions.length === 0 && (
            <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <Eye size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500 font-black uppercase tracking-widest text-xs">{t('noWatchlist')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const VerificationView = ({ profile, onVerify, t }: { profile: any, onVerify: () => void, t: any }) => {
    const [type, setType] = useState<'individual' | 'business'>(profile?.user_type || 'individual');
    const [step, setStep] = useState(profile?.is_verified ? 2 : 1);
    const [loading, setLoading] = useState(false);

    const handleVerify = async () => {
        setLoading(true);
        try {
          onVerify();
          setStep(2);
        } catch (err: any) {
          console.error("Error verifying profile:", err);
          const errorMsg = err.message || JSON.stringify(err);
          toast.error(`${t('verificationError')} ${errorMsg}`, { duration: Infinity, closeButton: true });
        } finally {
          setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-16 px-6 animate-in">
            <div className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-100">
                <h2 className="text-4xl font-black mb-4 uppercase tracking-tighter italic">{t('identityVerification')}</h2>
                <p className="text-slate-400 font-bold mb-12">{t('verificationRequired')}</p>

                {step === 1 ? (
                    <div className="space-y-12">
                        <div className="flex gap-4 p-2 bg-slate-50 rounded-[2.5rem]">
                            <button 
                                onClick={() => setType('individual')} 
                                className={`flex-1 flex items-center justify-center gap-3 py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest transition-all ${type === 'individual' ? 'bg-[#0A1128] text-white shadow-xl' : 'text-slate-400 hover:text-[#0A1128]'}`}>
                                <User size={18} /> {t('individual')}
                            </button>
                            <button 
                                onClick={() => setType('business')} 
                                className={`flex-1 flex items-center justify-center gap-3 py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest transition-all ${type === 'business' ? 'bg-[#0A1128] text-white shadow-xl' : 'text-slate-400 hover:text-[#0A1128]'}`}>
                                <Building2 size={18} /> {t('business')}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {type === 'individual' ? (
                                <>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('firstName')}</label><input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('lastName')}</label><input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('address')}</label><input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('emso')}</label><input type="text" inputMode="numeric" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" maxLength={13} onChange={e => e.target.value = e.target.value.replace(/\D/g, '')} /></div>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('companyName')}</label><input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('taxNumber')}</label><input type="text" inputMode="numeric" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold" onChange={e => e.target.value = e.target.value.replace(/\D/g, '')} /></div>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('companyAddress')}</label><input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('representative')}</label><input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                </>
                            )}
                        </div>

                        <button onClick={handleVerify} disabled={loading} className="w-full bg-[#0A1128] text-white py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl disabled:opacity-50">
                          {loading ? t('processing') : t('verifyBtn')}
                        </button>
                    </div>
                ) : (
                    <div className="text-center py-12 space-y-8">
                        <div className="w-24 h-24 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-sm border border-green-100"><CheckCircle2 size={48} /></div>
                        <div>
                            <h3 className="text-2xl font-black text-[#0A1128] uppercase italic mb-2">{t('verifiedStatus')}</h3>
                            <p className="text-slate-400 font-bold">{t('profileVerifiedAs')} <span className="text-[#0A1128]">{type === 'individual' ? t('individual') : t('business')}</span>. {t('accountTypeChangeNotPossible')}</p>
                        </div>
                        <div className="pt-8 border-t border-slate-100 grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-6 rounded-3xl text-left"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">{t('verificationDate')}</p><p className="font-bold">{new Date().toLocaleDateString('sl-SI')}</p></div>
                            <div className="bg-slate-50 p-6 rounded-3xl text-left"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">{t('status')}</p><p className="font-bold text-green-600">{t('active')}</p></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const MyWinningsView = ({ wonItems, onCheckout, t, language }: { wonItems: any[], onCheckout: (item: any) => void, t: any, language: string }) => {
    return (
        <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
            <div className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-100 min-h-[500px]">
                <div className="flex items-center gap-6 mb-12">
                    <div className="bg-[#FEBA4F] p-4 rounded-3xl shadow-lg shadow-[#FEBA4F]/20">
                        <Trophy size={40} className="text-[#0A1128]" />
                    </div>
                    <div>
                        <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128]">{t('myWinnings')}</h2>
                        <p className="text-slate-400 font-bold mt-2">{t('checkoutDesc')}</p>
                    </div>
                </div>
                
                <div className="space-y-6">
                    {wonItems.map(item => (
                      <div key={item.id} className="flex flex-col md:flex-row items-center gap-8 p-6 rounded-[2.5rem] border-2 border-slate-100 hover:border-[#FEBA4F] transition-colors group">
                          <img src={item.images[0]} alt="Item" className="w-32 h-32 rounded-3xl object-cover shadow-md group-hover:scale-105 transition-transform" />
                          <div className="flex-1 text-center md:text-left">
                              <h3 className="text-2xl font-black uppercase tracking-tighter text-[#0A1128] mb-2">{item.title[language] || item.title.SLO}</h3>
                              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-bold text-slate-400">
                                  <span className="flex items-center gap-1.5"><Gavel size={16}/> {t('finalPrice')}: <span className="text-[#0A1128] font-black">€{item.currentBid.toLocaleString('sl-SI')}</span></span>
                              </div>
                          </div>
                          <div className="flex flex-col gap-3 w-full md:w-auto">
                              <button 
                                  onClick={() => onCheckout(item)}
                                  className="bg-[#0A1128] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-2"
                              >
                                  <CardIcon size={18} /> {t('payNow')}
                              </button>
                          </div>
                      </div>
                    ))}
                    {wonItems.length === 0 && (
                      <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                        <Trophy size={48} className="mx-auto mb-4 text-slate-300" />
                        <p className="text-slate-500 font-black uppercase tracking-widest text-xs">{t('noWinnings')}</p>
                      </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const SubscriptionsView = ({ currentPlan, onSubscribe, t }: { currentPlan: SubscriptionTier, onSubscribe: (tier: SubscriptionTier) => void, t: any }) => {
  const plans = [
    { tier: SubscriptionTier.FREE, name: t('freeTier'), price: 0, desc: t('freeDesc'), color: 'bg-slate-100 text-slate-600' },
    { tier: SubscriptionTier.BASIC, name: t('basicTier'), price: 20, desc: t('basicDesc'), color: 'bg-[#FEBA4F] text-[#0A1128]' },
    { tier: SubscriptionTier.PRO, name: t('proTier'), price: 50, desc: t('proDesc'), color: 'bg-[#0A1128] text-white' }
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128] mb-12">{t('subscriptions')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map(plan => (
          <div key={plan.tier} className={`rounded-[3rem] p-10 flex flex-col ${plan.color} ${currentPlan === plan.tier ? 'ring-4 ring-offset-4 ring-[#FEBA4F]' : ''}`}>
            {currentPlan === plan.tier && <div className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-80">{t('currentPlan')}</div>}
            <h3 className="text-3xl font-black uppercase tracking-tighter mb-2">{plan.name}</h3>
            <div className="text-5xl font-black mb-6">€{plan.price}<span className="text-lg opacity-60">/mo</span></div>
            <p className="font-bold opacity-80 mb-10 flex-1">{plan.desc}</p>
            <button 
              onClick={() => onSubscribe(plan.tier)}
              disabled={currentPlan === plan.tier}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${currentPlan === plan.tier ? 'bg-black/10 opacity-50 cursor-not-allowed' : 'bg-white text-[#0A1128] hover:scale-105 shadow-xl'}`}
            >
              {currentPlan === plan.tier ? t('currentPlan') : t('subscribe')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SettingsView = ({ profile, onUpdate, t }: { profile: any, onUpdate: () => void, t: any }) => {
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    email: profile?.email || '',
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    avatar_url: profile?.avatar_url || ''
  });
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let error = null;
      try { await setDoc(doc(db, 'profiles', profile.id), { full_name: formData.full_name }, { merge: true }); } catch (e) { error = e; }
      
      if (error) throw error;
      
      onUpdate();
      toast.success(t('success'));
    } catch (err: any) {
      console.error("Error saving settings:", err);
      const errorMsg = err.message || JSON.stringify(err);
      toast.error(`Napaka pri shranjevanju: ${errorMsg}`, { duration: Infinity, closeButton: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128] mb-12">{t('settings')}</h2>
      <form onSubmit={handleSave} className="bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100">
        <div className="grid grid-cols-1 gap-6 mb-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('fullName')}</label>
            <input type="text" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('email')}</label>
            <input type="email" value={formData.email} disabled className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold opacity-50" />
          </div>
        </div>

        <button type="submit" disabled={loading} className="w-full bg-[#0A1128] text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl disabled:opacity-50">
          {loading ? t('processing') : t('saveChanges')}
        </button>
      </form>
    </div>
  );
};

export const AuthView = ({ mode, setMode, onAuthSuccess, t }: { mode: 'login' | 'register', setMode: (m: 'login' | 'register') => void, onAuthSuccess: () => void, t: any }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') {
          let error = null;
          try { await signInWithEmailAndPassword(auth, email, password); } catch (e) { error = e; }
          if (error) throw error;
      } else {
          let error = null;
          try { 
            const userCred = await createUserWithEmailAndPassword(auth, email, password); 
            try {
              await sendEmailVerification(userCred.user);
            } catch (emailErr) {
              console.warn("Verifikacijski mail ni bil poslan:", emailErr);
            }
          } catch (e) { 
            error = e; 
          }
          if (error) throw error;
      }
      onAuthSuccess();
    } catch (err: any) { 
      setError(err.message);
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-20 animate-in flex justify-center">
      <div className="bg-white w-full max-w-xl rounded-[4rem] p-10 lg:p-16 shadow-2xl border border-slate-100">
        <div className="text-center mb-10">
            <div className="bg-[#FEBA4F] w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-lg"><User size={40} className="text-[#0A1128]" /></div>
            <h2 className="text-4xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">{mode === 'login' ? t('login') : t('register')}</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6 mb-8">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm font-bold flex items-center gap-2">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          <input type="email" required className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold focus:ring-2 focus:ring-[#FEBA4F] outline-none" placeholder={t('email')} onChange={e => setEmail(e.target.value)} />
          <div className="relative">
            <input 
              type={showPassword ? "text" : "password"} 
              required 
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-6 pr-14 font-bold focus:ring-2 focus:ring-[#FEBA4F] outline-none" 
              placeholder={t('password')} 
              value={password}
              onChange={e => setPassword(e.target.value)} 
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => !prev)}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-[#0A1128] transition-colors focus:outline-none"
              aria-label={showPassword ? "Skrij geslo" : "Pokaži geslo"}
              title={showPassword ? "Skrij geslo" : "Pokaži geslo"}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-[#0A1128] text-white py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] transition-all shadow-xl">{loading ? t('processing') : (mode === 'login' ? t('login') : t('createAccount'))}</button>
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="w-full text-xs font-black uppercase tracking-widest text-slate-400 hover:text-[#0A1128] mt-4">{mode === 'login' ? t('noAccountRegister') : t('haveAccountLogin')}</button>
        </form>
      </div>
    </div>
  );
};

