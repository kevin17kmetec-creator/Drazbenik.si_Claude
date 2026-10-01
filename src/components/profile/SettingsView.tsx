import React, { useState, useRef, useMemo, useEffect } from 'react';
import { User, Camera, CheckCircle2, AlertCircle, Shield, CreditCard, Building, MapPin, Key, Bell, X, Eye, EyeOff, ShieldAlert, AlertTriangle, ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression';
import { StripeConnectOnboarding } from "@/src/components/profile/StripeConnectOnboarding";
import { PhoneInput } from "@/src/components/ui/PhoneInput";
import { requestPayoutAction, checkStripeAccountStatusAction, deleteAccountAction } from '@/src/actions/index';
import { auth } from "../../lib/firebase";
import { signOut } from "firebase/auth";

const COUNTRIES = [
  { code: 'AT', name: 'Avstrija / Austria' },
  { code: 'BE', name: 'Belgija / Belgium' },
  { code: 'BG', name: 'Bolgarija / Bulgaria' },
  { code: 'HR', name: 'Hrvaška / Croatia' },
  { code: 'CY', name: 'Ciper / Cyprus' },
  { code: 'CZ', name: 'Češka / Czech Republic' },
  { code: 'DK', name: 'Danska / Denmark' },
  { code: 'EE', name: 'Estonija / Estonia' },
  { code: 'FI', name: 'Finska / Finland' },
  { code: 'FR', name: 'Francija / France' },
  { code: 'DE', name: 'Nemčija / Germany' },
  { code: 'GR', name: 'Grčija / Greece' },
  { code: 'HU', name: 'Madžarska / Hungary' },
  { code: 'IE', name: 'Irska / Ireland' },
  { code: 'IT', name: 'Italija / Italy' },
  { code: 'LV', name: 'Latvija / Latvia' },
  { code: 'LT', name: 'Litva / Lithuania' },
  { code: 'LU', name: 'Luksemburg / Luxembourg' },
  { code: 'MT', name: 'Malta / Malta' },
  { code: 'NL', name: 'Nizozemska / Netherlands' },
  { code: 'PL', name: 'Poljska / Poland' },
  { code: 'PT', name: 'Portugalska / Portugal' },
  { code: 'RO', name: 'Romunija / Romania' },
  { code: 'SK', name: 'Slovaška / Slovakia' },
  { code: 'SI', name: 'Slovenija / Slovenia' },
  { code: 'ES', name: 'Španija / Spain' },
  { code: 'SE', name: 'Švedska / Sweden' },
  { code: 'CH', name: 'Švica / Switzerland' },
  { code: 'GB', name: 'Velika Britanija / UK' },
  { code: 'US', name: 'Združene države / USA' },
].sort((a, b) => a.name.localeCompare(b.name));

export const SettingsView: React.FC<{ 
  t: any; 
  language: string; 
  user: any; 
  auctions?: any[];
  onSave: (data: any) => Promise<void>; 
  onVerify: () => void; 
  onStripeVerified: () => void;
  onRefreshUser?: () => Promise<void>;
  activeTab?: 'profile' | 'personal' | 'stripe' | 'notifications';
  setActiveTab?: (tab: 'profile' | 'personal' | 'stripe' | 'notifications') => void;
  onBack?: () => void;
}> = ({ 
  t, 
  language, 
  user, 
  auctions,
  onSave, 
  onVerify, 
  onStripeVerified,
  onRefreshUser,
  activeTab: propActiveTab,
  setActiveTab: propSetActiveTab,
  onBack
}) => {
  const [localActiveTab, setLocalActiveTab] = useState<'profile' | 'personal' | 'stripe' | 'notifications'>('profile');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<number | ''>('');
  const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab;
  const setActiveTab = propSetActiveTab !== undefined ? propSetActiveTab : setLocalActiveTab;
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stripeStatusChecked, setStripeStatusChecked] = useState(false);
  const isPasswordUser = auth.currentUser?.providerData?.some(p => p.providerId === 'password');

  // Password visibility states
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Account deletion states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');

  const handleDeleteAccount = async () => {
    if (deleteConfirmationInput.trim().toUpperCase() !== 'IZBRIŠI') return;
    try {
      setIsDeleting(true);
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Uporabnik ni prijavljen');
      const token = await currentUser.getIdToken();
      const res = await deleteAccountAction(token);
      if (!res.success) {
        throw new Error(res.error || 'Napaka pri brisanju profila.');
      }
      toast.success("Vaš profil in vsi podatki so bili uspešno izbrisani.");
      await signOut(auth);
      window.location.href = '/';
    } catch (err: any) {
      toast.error(err.message || "Prišlo je do napake pri brisanju računa.");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  useEffect(() => {
     if (user?.id && !stripeStatusChecked && activeTab === 'stripe') {
         setStripeStatusChecked(true);
         // Dynamically check Stripe onboarding status when they switch to this tab
         (async () => {
           try {
             const token = await auth.currentUser?.getIdToken();
             const res = await checkStripeAccountStatusAction({ user_id: user.id }, token);
             if (res.success && res.data?.complete && !user.stripe_onboarding_complete) {
               onStripeVerified(); // trigger parent update if needed
             }
           } catch (err) {
             console.error(err);
           }
         })();
     }
  }, [user?.id, activeTab, stripeStatusChecked, user?.stripe_onboarding_complete, onStripeVerified]);

  const [formData, setFormData] = useState({
    username: user?.username || user?.userName || '',
    firstName: user?.first_name || user?.firstName || '',
    lastName: user?.last_name || user?.lastName || '',
    email: user?.email || '',
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    profilePicture: user?.profile_picture_url || user?.profilePicture || '',
    phone: user?.phone || user?.phoneNumber || '',
    
    // Individual data
    street: user?.street || '',
    city: user?.city || '',
    postalCode: user?.postal_code || user?.postalCode || '',

    // Business data
    companyName: user?.company_name || user?.companyName || '',
    taxNumber: user?.tax_number || user?.tax_id || user?.taxNumber || user?.taxId || '',
    regNumber: user?.registration_number || user?.regNumber || '',
    companyStreet: user?.company_street || user?.companyStreet || '',
    companyCity: user?.company_city || user?.companyCity || '',
    companyPostalCode: user?.company_postal_code || user?.companyPostalCode || '',
    representative: user?.representative || '',
    countryCode: user?.country_code || user?.countryCode || 'SI',
    autoInvoiceGeneration: user?.auto_invoice_generation !== false, // default true
    emailNotifications: user?.email_notifications || user?.emailNotifications || {
      marketing: true, outbid: true, endingSoon: true, won: true, paymentReminder: true,
      bids: true,
      messages: true,
      invoices: true
    },
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFormDirtyRef = useRef(false);

  useEffect(() => {
    if (user && user.id) {
      setFormData(prev => {
        if (!isFormDirtyRef.current) {
          return {
            username: user.username || user.userName || '',
            firstName: user.first_name || user.firstName || '',
            lastName: user.last_name || user.lastName || '',
            email: user.email || prev.email || '',
            oldPassword: prev.oldPassword,
            newPassword: prev.newPassword,
            confirmPassword: prev.confirmPassword,
            profilePicture: user.profile_picture_url || user.profilePicture || '',
            phone: user.phone || user.phoneNumber || '',
            street: user.street || '',
            city: user.city || '',
            postalCode: user.postal_code || user.postalCode || '',
            companyName: user.company_name || user.companyName || '',
            taxNumber: user.tax_number || user.tax_id || user.taxNumber || user.taxId || '',
            regNumber: user.registration_number || user.regNumber || '',
            companyStreet: user.company_street || user.companyStreet || '',
            companyCity: user.company_city || user.companyCity || '',
            companyPostalCode: user.company_postal_code || user.companyPostalCode || '',
            representative: user.representative || '',
            countryCode: user.country_code || user.countryCode || 'SI',
            autoInvoiceGeneration: user.auto_invoice_generation ?? user.autoInvoiceGeneration ?? true,
            emailNotifications: user.email_notifications || user.emailNotifications || { marketing: true, outbid: true, endingSoon: true, won: true, paymentReminder: true, bids: true, messages: true, invoices: true }
          };
        } else {
          return {
            ...prev,
            username: prev.username || user.username || user.userName || '',
            firstName: prev.firstName || user.first_name || user.firstName || '',
            lastName: prev.lastName || user.last_name || user.lastName || '',
            email: prev.email || user.email || '',
            profilePicture: prev.profilePicture || user.profile_picture_url || user.profilePicture || '',
            phone: prev.phone || user.phone || user.phoneNumber || '',
            street: prev.street || user.street || '',
            city: prev.city || user.city || '',
            postalCode: prev.postalCode || user.postal_code || user.postalCode || '',
            companyName: prev.companyName || user.company_name || user.companyName || '',
            taxNumber: prev.taxNumber || user.tax_number || user.tax_id || user.taxNumber || user.taxId || '',
            regNumber: prev.regNumber || user.registration_number || user.regNumber || '',
            companyStreet: prev.companyStreet || user.company_street || user.companyStreet || '',
            companyCity: prev.companyCity || user.company_city || user.companyCity || '',
            companyPostalCode: prev.companyPostalCode || user.company_postal_code || user.companyPostalCode || '',
            representative: prev.representative || user.representative || '',
            countryCode: prev.countryCode || user.country_code || user.countryCode || 'SI',
            autoInvoiceGeneration: prev.autoInvoiceGeneration ?? user.auto_invoice_generation ?? user.autoInvoiceGeneration ?? true,
          };
        }
      });
    }
  }, [user]);

  const isProfileCompleted = Boolean(user?.profile_completed || user?.is_verified || user?.isVerified);
  const isIdentityVerified = Boolean(user?.identity_verified === true || user?.verified_identity === true || user?.identity_verification_status === 'verified');
  const userType = user?.user_type || user?.userType || 'individual';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      isFormDirtyRef.current = true;
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.07,
          maxWidthOrHeight: 600,
          useWebWorker: true,
          initialQuality: 0.6
        });
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, profilePicture: reader.result as string }));
        };
        reader.readAsDataURL(compressed);
      } catch (err) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, profilePicture: reader.result as string }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Settings form submitted with data:", formData);
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      toast.error(t('passwordsNotMatch'));
      return;
    }
    if (formData.newPassword && !formData.oldPassword) {
      toast.error(t('oldPasswordRequired'));
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSave(formData);
      isFormDirtyRef.current = false;
      toast.success(t('profileSaved') || "Nastavitve so bile uspešno shranjene.");
    } catch (err: any) {
      console.error("Save profile error:", err);
      setErrorMessage(err?.message || "Napaka pri shranjevanju podatkov.");
      toast.error(err?.message || "Napaka pri shranjevanju podatkov.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-12 animate-in">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 mb-8 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
        >
          <ArrowLeft size={16} /> {t('back') || 'Nazaj'}
        </button>
      )}
      <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128] mb-12">{t('settings')}</h2>
      
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Sidebar Navigation */}
        <div className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-white rounded-[2rem] p-4 shadow-xl border border-slate-100 flex flex-col gap-2">
            <button 
                onClick={() => setActiveTab('profile')}
                className={`flex items-center gap-4 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all w-full text-left ${activeTab === 'profile' ? 'bg-[#0A1128] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 hover:text-[#0A1128]'}`}
            >
                <User size={18} /> {t('tabProfileSecurity')}
            </button>
            <button 
                onClick={() => setActiveTab('personal')}
                className={`flex items-center gap-4 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all w-full text-left ${activeTab === 'personal' ? 'bg-[#0A1128] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 hover:text-[#0A1128]'}`}
            >
                <MapPin size={18} /> {t('tabPersonalData')}
            </button>
            <button 
                onClick={() => setActiveTab('stripe')}
                className={`flex items-center gap-4 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all w-full text-left ${activeTab === 'stripe' ? 'bg-[#0A1128] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 hover:text-[#0A1128]'}`}
            >
                <CreditCard size={18} /> {t('tabPaymentsPayouts')}
            </button>
            <button 
                onClick={() => setActiveTab('notifications')}
                className={`flex items-center gap-4 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all w-full text-left ${activeTab === 'notifications' ? 'bg-[#0A1128] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 hover:text-[#0A1128]'}`}
            >
                <Bell size={18} /> {t('tabNotifications')}
            </button>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1">
          <form onSubmit={handleSave} className="bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100">
            {errorMessage && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm font-bold flex items-center gap-3">
                <AlertCircle size={20} className="shrink-0 text-red-500" />
                <span>{errorMessage}</span>
              </div>
            )}
            {activeTab === 'profile' && (
              <div className="animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between mb-10 pb-10 border-b border-slate-100">
                    <div className="flex items-center gap-6">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept="image/*" 
                        className="hidden" 
                      />
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center relative group cursor-pointer"
                      >
                        {formData.profilePicture ? (
                          <img src={formData.profilePicture} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User size={40} className="text-slate-300" />
                        )}
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Camera className="text-white" size={24} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('profilePicture')}</p>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-black uppercase tracking-widest text-[#FEBA4F] hover:text-[#0A1128] transition-colors">{t('changePicture')}</button>
                      </div>
                    </div>

                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('verificationStatus')}</p>
                        {isProfileCompleted ? (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-full text-xs font-black uppercase tracking-widest border border-green-100">
                                <CheckCircle2 size={16} /> {t('verified')} ({userType === 'business' ? t('business') : t('individual')})
                            </div>
                        ) : (
                            <div className="flex flex-col items-end gap-3">
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 rounded-full text-xs font-black uppercase tracking-widest border border-red-100">
                                    <AlertCircle size={16} /> {t('notVerified')}
                                </div>
                                <button 
                                    type="button" 
                                    onClick={onVerify}
                                    className="text-[10px] font-black uppercase tracking-widest bg-[#0A1128] text-white px-4 py-2 rounded-xl hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-lg"
                                >
                                    {t('verifyNow')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3 Strikes / Unpaid Auctions System Card */}
                {(() => {
                  const strikesCount = Number(user?.unpaidStrikes ?? user?.unpaid_strikes ?? 0);
                  const isBlocked = !!user?.isBlocked || strikesCount >= 3;
                  return (
                    <div className="mb-10 p-6 sm:p-8 bg-slate-50 border-2 border-slate-200 rounded-[2.5rem] shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                          <div className="flex items-center gap-2">
                            <ShieldAlert size={22} className={isBlocked ? "text-red-600" : strikesCount > 0 ? "text-amber-500" : "text-green-600"} />
                            <h4 className="text-sm font-black uppercase tracking-widest text-[#0A1128]">
                              Zanesljivost plačil (3 Strikes sistem)
                            </h4>
                          </div>
                          <p className="text-xs text-slate-500 font-bold mt-1.5 max-w-xl leading-relaxed">
                            Po zmagi na dražbi ima kupec <span className="text-[#0A1128] font-black">48 ur</span> za poravnavo plačila. V primeru neplačila prejme 1 opomin (Strike X). Ob 3. opominu se račun trajno blokira za sodelovanje in oddajo novih ponudb.
                          </p>
                        </div>
                        <div className={`px-5 py-3 rounded-2xl border text-center shrink-0 ${
                          isBlocked 
                            ? "bg-red-500/10 border-red-500/30 text-red-600" 
                            : strikesCount > 0 
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-700" 
                              : "bg-green-500/10 border-green-500/30 text-green-700"
                        }`}>
                          <span className="text-[10px] font-black uppercase tracking-widest block mb-0.5">Status računa</span>
                          <span className="text-xs font-black">
                            {isBlocked ? "Račun blokiran (3/3)" : strikesCount === 0 ? "Brez opominov (0/3)" : `${strikesCount}/3 opominov`}
                          </span>
                        </div>
                      </div>

                      {/* 3 Visual Strike Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[1, 2, 3].map((slot) => {
                          const isStrikeGiven = strikesCount >= slot;
                          return (
                            <div 
                              key={slot} 
                              className={`p-5 rounded-2xl border-2 flex items-center gap-4 transition-all ${
                                isStrikeGiven 
                                  ? "bg-red-50 border-red-300 text-red-900 shadow-sm" 
                                  : "bg-white border-slate-200 text-slate-400"
                              }`}
                            >
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 ${
                                isStrikeGiven 
                                  ? "bg-red-600 text-white shadow-md shadow-red-500/30" 
                                  : "bg-slate-100 text-slate-400"
                              }`}>
                                {isStrikeGiven ? "X" : slot}
                              </div>
                              <div>
                                <p className={`text-xs font-black uppercase tracking-wider ${isStrikeGiven ? "text-red-700" : "text-slate-600"}`}>
                                  {slot}. Opomin {slot === 3 ? "(Blokada)" : ""}
                                </p>
                                <p className="text-[11px] font-bold mt-0.5">
                                  {isStrikeGiven 
                                    ? (slot === 3 ? "Blokirano ponujanje" : "Prejet opomin (neplačano)") 
                                    : "Ni opomina (prosto)"}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* EU Compliance & Annual Purchasing Limit Card */}
                <div className="mb-10 p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-[#0A1128] mb-1">
                        {t('annualPurchaseLimitTitle')}
                      </h4>
                      <p className="text-xs text-slate-500 font-bold max-w-md">
                        {isIdentityVerified 
                          ? t('annualLimitVerified')
                          : t('annualLimitUnverified')}
                      </p>
                    </div>
                    <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 text-left sm:text-right w-full sm:w-auto">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{t('spendingInYear')} {new Date().getFullYear()}</p>
                      <p className="text-base font-black text-[#0A1128]">
                        €{((user?.yearly_spent_by_year && user.yearly_spent_by_year[new Date().getFullYear()]) || (user?.yearly_spent_year === new Date().getFullYear() ? user?.yearly_spent : 0) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-slate-400 text-xs font-normal"> / {isIdentityVerified ? '∞' : '€10.000,00'}</span>
                      </p>
                    </div>
                  </div>
                  {userType === 'individual' && auctions && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      {(() => {
                        const currentYear = new Date().getFullYear();
                        const firstDayOfYear = new Date(currentYear, 0, 1).getTime();
                        const annualAuctions = auctions.filter(a => 
                            a.sellerId === user?.id && 
                            new Date((a as any).createdAt || (a as any).created_at || a.endTime).getTime() >= firstDayOfYear
                        );
                        const soldAuctions = annualAuctions.filter(a => ['SOLD', 'COMPLETED', 'PAID'].includes(a.status));
                        const annualVolume = soldAuctions.reduce((sum, a) => sum + (a.currentBid || 0), 0);
                        return (
                            <div className="flex flex-col gap-2 text-xs font-bold text-slate-600">
                                <div className="flex justify-between items-center bg-white px-4 py-2 rounded-xl border border-slate-200">
                                    <span>Prodano predmetov v letu {currentYear}:</span>
                                    <span className={soldAuctions.length >= 30 ? "text-red-500 font-black" : "font-black text-[#0A1128]"}>{soldAuctions.length} / 30</span>
                                </div>
                                <div className="flex justify-between items-center bg-white px-4 py-2 rounded-xl border border-slate-200">
                                    <span>Skupna vrednost prodanih predmetov:</span>
                                    <span className={annualVolume >= 2000 ? "text-red-500 font-black" : "font-black text-[#0A1128]"}>{annualVolume.toFixed(2)} € / 2.000 €</span>
                                </div>
                            </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="mb-10">
                    <h3 className="text-sm font-black uppercase tracking-widest text-[#0A1128] mb-6 flex items-center gap-2"><User size={16} className="text-[#FEBA4F]"/> {t('basicData')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('usernameLabel')}</label>
                        <input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" placeholder="" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('email')}</label>
                        <input 
                          type="email" 
                          value={formData.email} 
                          disabled={!isPasswordUser}
                          onChange={e => isPasswordUser && setFormData({...formData, email: e.target.value})}
                          className={`w-full border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none transition-colors ${!isPasswordUser ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:border-[#FEBA4F]'}`} 
                        />
                      </div>
                    </div>
                </div>

                <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 mb-8">
                  <h3 className="text-sm font-black uppercase tracking-widest text-[#0A1128] mb-6 flex items-center gap-2"><Key size={16} className="text-[#FEBA4F]"/> {t('changePassword')}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('oldPassword')}</label>
                      <div className="relative">
                        <input 
                          type={showOldPassword ? "text" : "password"} 
                          placeholder="••••••••" 
                          value={formData.oldPassword} 
                          onChange={e => setFormData({...formData, oldPassword: e.target.value})} 
                          autoComplete="new-password" 
                          data-lpignore="true" 
                          className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-12 py-3 font-bold outline-none focus:border-[#FEBA4F]" 
                        />
                        <button
                          type="button"
                          onClick={() => setShowOldPassword(prev => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-[#0A1128] transition-colors focus:outline-none"
                          aria-label={showOldPassword ? "Skrij geslo" : "Pokaži geslo"}
                          title={showOldPassword ? "Skrij geslo" : "Pokaži geslo"}
                        >
                          {showOldPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('newPassword')}</label>
                      <div className="relative">
                        <input 
                          type={showNewPassword ? "text" : "password"} 
                          placeholder="••••••••" 
                          value={formData.newPassword} 
                          onChange={e => setFormData({...formData, newPassword: e.target.value})} 
                          autoComplete="new-password" 
                          data-lpignore="true" 
                          className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-12 py-3 font-bold outline-none focus:border-[#FEBA4F]" 
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(prev => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-[#0A1128] transition-colors focus:outline-none"
                          aria-label={showNewPassword ? "Skrij geslo" : "Pokaži geslo"}
                          title={showNewPassword ? "Skrij geslo" : "Pokaži geslo"}
                        >
                          {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('confirmNewPassword')}</label>
                      <div className="relative">
                        <input 
                          type={showConfirmPassword ? "text" : "password"} 
                          placeholder="••••••••" 
                          value={formData.confirmPassword} 
                          onChange={e => setFormData({...formData, confirmPassword: e.target.value})} 
                          autoComplete="new-password" 
                          data-lpignore="true" 
                          className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-12 py-3 font-bold outline-none focus:border-[#FEBA4F]" 
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(prev => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-[#0A1128] transition-colors focus:outline-none"
                          aria-label={showConfirmPassword ? "Skrij geslo" : "Pokaži geslo"}
                          title={showConfirmPassword ? "Skrij geslo" : "Pokaži geslo"}
                        >
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={isSaving} className="w-full bg-[#0A1128] text-white py-5 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-3">
                  {isSaving ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      {t('processing')}
                    </>
                  ) : (
                    t('saveChanges')
                  )}
                </button>

                {/* IZBRIS RAČUNA */}
                <div className="mt-14 pt-10 border-t border-slate-200">
                  <div className="bg-red-50/70 border-2 border-red-200 rounded-[2.5rem] p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row items-start gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                        <Trash2 size={24} />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-black uppercase tracking-tight text-[#0A1128] mb-1">
                          Izbris uporabniškega profila
                        </h4>
                        <p className="text-xs font-bold text-slate-600 mb-6 leading-relaxed">
                          Dokončen izbris profila in podatkov.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteConfirmationInput('');
                            setShowDeleteModal(true);
                          }}
                          className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                        >
                          <Trash2 size={16} /> Izbriši profil
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'personal' && (
              <div className="animate-in fade-in slide-in-from-right-4">
                {!isProfileCompleted ? (
                    <div className="text-center py-20 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex flex-col items-center justify-center mx-auto mb-6 text-red-500">
                            <AlertCircle size={32} />
                        </div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128] mb-2">{t('notVerified')}</h3>
                        <p className="text-slate-500 font-bold max-w-sm mx-auto mb-8">{t('personalDataVerificationNotice')}</p>
                        <button 
                            type="button" 
                            onClick={onVerify}
                            className="text-xs font-black uppercase tracking-widest bg-[#0A1128] text-white px-8 py-4 rounded-xl hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-lg"
                        >
                            {t('verifyNow')}
                        </button>
                    </div>
                ) : (
                    <div className="mb-8">
                        <h3 className="text-sm font-black uppercase tracking-widest text-[#0A1128] mb-6 flex items-center gap-2">
                            {userType === 'business' ? <Building size={16} className="text-[#FEBA4F]"/> : <User size={16} className="text-[#FEBA4F]"/>} 
                            {t('verificationData')} ({userType === 'business' ? t('business') : t('individual')})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
                            {userType === 'individual' ? (
                                <>
                                    <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('firstName')}</label><input type="text" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('lastName')}</label><input type="text" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('street')}</label><input type="text" value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('city')}</label><input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('postalCode')}</label><input type="text" value={formData.postalCode} onChange={e => setFormData({...formData, postalCode: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('taxNumber')}</label><input type="text" value={formData.taxNumber} onChange={e => setFormData({...formData, taxNumber: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('country')}</label>
                                        <select value={formData.countryCode} onChange={e => setFormData({...formData, countryCode: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F] cursor-pointer">
                                            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('phoneNumber')}</label><PhoneInput value={formData.phone} onChange={val => setFormData({...formData, phone: val})} /></div>
                                </>
                            ) : (
                                <>
                                    <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('companyName')}</label><input type="text" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('taxNumber')}</label><input type="text" value={formData.taxNumber} onChange={e => setFormData({...formData, taxNumber: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Matična številka</label><input type="text" value={formData.regNumber} onChange={e => setFormData({...formData, regNumber: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('country')}</label>
                                        <select value={formData.countryCode} onChange={e => setFormData({...formData, countryCode: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F] cursor-pointer">
                                            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('phoneNumber')}</label><PhoneInput value={formData.phone} onChange={val => setFormData({...formData, phone: val})} /></div>
                                    <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('companyStreet')}</label><input type="text" value={formData.companyStreet} onChange={e => setFormData({...formData, companyStreet: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('companyCity')}</label><input type="text" value={formData.companyCity} onChange={e => setFormData({...formData, companyCity: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('companyPostalCode')}</label><input type="text" value={formData.companyPostalCode} onChange={e => setFormData({...formData, companyPostalCode: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('representative')}</label><input type="text" value={formData.representative} onChange={e => setFormData({...formData, representative: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]" /></div>
                                    <div className="md:col-span-2 flex items-center gap-2 mt-4 pt-4 border-t border-slate-200">
                                        <input type="checkbox" id="autoInvoice" checked={formData.autoInvoiceGeneration} onChange={e => setFormData({...formData, autoInvoiceGeneration: e.target.checked})} className="w-4 h-4 text-[#FEBA4F] bg-white border-slate-200 rounded focus:ring-[#FEBA4F] cursor-pointer" />
                                        <label htmlFor="autoInvoice" className="text-xs font-bold text-slate-500 cursor-pointer">{t('autoInvoiceGeneration')}</label>
                                    </div>
                                </>
                            )}
                        </div>
                        <button type="submit" disabled={isSaving} className="w-full mt-8 bg-[#0A1128] text-white py-5 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-3">
                            {isSaving ? (
                                <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                {t('processing')}
                                </>
                            ) : (
                                t('saveChanges')
                            )}
                        </button>
                    </div>
                )}
              </div>
            )}

            {activeTab === 'stripe' && (
              <div className="animate-in fade-in slide-in-from-right-4">
                {withdrawModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A1128]/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128]">Zahtevaj izplačilo</h3>
                        <button onClick={() => setWithdrawModalOpen(false)} className="text-slate-400 hover:text-[#0A1128] transition-colors">
                          <X size={24} />
                        </button>
                      </div>
                      <p className="text-sm font-bold text-slate-500 mb-6">
                        Vnesite znesek za izplačilo. Na voljo imate €{((user?.available_cents !== undefined ? user.available_cents / 100 : Number(user?.wallet_balance)) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.
                      </p>
                      
                      <div className="mb-6 relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">€</span>
                        <input 
                          type="number" 
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value === '' ? '' : Number(e.target.value))}
                          max={(user?.available_cents !== undefined ? user.available_cents / 100 : Number(user?.wallet_balance || 0))}
                          min={1}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-4 font-black text-lg outline-none focus:border-[#FEBA4F]" 
                        />
                      </div>

                      <div className="flex gap-4 mb-8">
                        <button 
                          type="button"
                          onClick={() => setWithdrawAmount(Number(((user?.available_cents !== undefined ? user.available_cents / 100 : Number(user?.wallet_balance || 0)) * 0.5).toFixed(2)))} 
                          className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-[#0A1128] rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                        >
                          50% zneska
                        </button>
                        <button 
                          type="button"
                          onClick={() => setWithdrawAmount(Number((user?.available_cents !== undefined ? user.available_cents / 100 : Number(user?.wallet_balance || 0)).toFixed(2)))} 
                          className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-[#0A1128] rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                        >
                          100% zneska
                        </button>
                      </div>

                      <button 
                        disabled={isWithdrawing || withdrawAmount === '' || Number(withdrawAmount) <= 0 || Number(withdrawAmount) > (user?.available_cents !== undefined ? user.available_cents / 100 : Number(user?.wallet_balance || 0))}
                        onClick={async () => {
                          setIsWithdrawing(true);
                          try {
                            const token = await auth.currentUser?.getIdToken();
                            const res = await requestPayoutAction({
                              user_id: user?.id,
                              amount: Number(withdrawAmount),
                            }, token);
                            if (!res.success) {
                              throw new Error(res.error || "Napaka pri izplačilu");
                            }
                            toast.success(t('payoutRequestSuccess') || "Zahtevek za izplačilo je bil uspešno izveden.");
                            setWithdrawModalOpen(false);
                            if (onRefreshUser) {
                              await onRefreshUser();
                            } else if (onStripeVerified) {
                              onStripeVerified();
                            }
                          } catch (err: any) {
                            console.error("Payout error:", err);
                            toast.error(err.message || "Napaka pri izplačilu.");
                          } finally {
                            setIsWithdrawing(false);
                          }
                        }}
                        className="w-full bg-[#FEBA4F] text-[#0A1128] py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all hover:bg-[#0A1128] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                      >
                        {isWithdrawing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-[#0A1128]/30 border-t-current rounded-full animate-spin" />
                            <span>{t('loading') || 'Nalaganje...'}</span>
                          </>
                        ) : 'Potrdi izplačilo'}
                      </button>
                    </div>
                  </div>
                )}
                <div className="mb-6">
                    <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128] mb-2 flex items-center gap-2">
                        <CreditCard size={20} className="text-[#FEBA4F]"/> {t('walletFunds')}
                    </h3>
                    <p className="text-slate-400 font-bold text-sm mb-6">{t('walletDesc')}</p>
                    
                    <div className="bg-[#0A1128] text-white p-8 rounded-3xl shadow-xl flex items-center justify-between mb-8 border-4 border-[#FEBA4F]/20 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                        <CreditCard size={100} />
                      </div>
                      <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#FEBA4F] mb-1">{t('currentBalance')}</p>
                        <p className="text-5xl font-black">€{((user?.available_cents !== undefined ? user.available_cents / 100 : Number(user?.wallet_balance)) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {Boolean(user?.held_cents) && (
                          <p className="text-xs font-semibold text-slate-300 mt-1">
                            (Zadržano: €{((user.held_cents || 0) / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2 })})
                          </p>
                        )}
                      </div>
                      <div className="relative z-10">
                        <button 
                          type="button"
                          disabled={isWithdrawing}
                          onClick={() => {
                            const balance = user?.available_cents !== undefined ? user.available_cents / 100 : Number(user?.wallet_balance || 0);
                            if (balance <= 0) {
                              toast.error(t('insufficientFunds') || "Ni zadostnih sredstev za izplačilo.");
                              return;
                            }
                            if (!user?.stripe_onboarding_complete) {
                              toast.error(t('connectStripeForPayout') || "Najprej povežite Stripe račun za prejem izplačil.");
                              return;
                            }
                            setWithdrawAmount(balance);
                            setWithdrawModalOpen(true);
                          }}
                          className={`bg-[#FEBA4F] text-[#0A1128] px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-xl flex items-center gap-2 ${isWithdrawing ? 'opacity-70 cursor-not-allowed' : 'hover:bg-white'}`}
                        >
                          {isWithdrawing ? (
                            <>
                              <div className="w-4 h-4 border-2 border-[#0A1128]/30 border-t-[#0A1128] rounded-full animate-spin" />
                              <span>{t('loading') || 'Nalaganje...'}</span>
                            </>
                          ) : (
                            t('requestPayout')
                          )}
                        </button>
                      </div>
                    </div>
                </div>
                
                <div className="mb-6">
                    <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128] mb-2 flex items-center gap-2">
                        <CreditCard size={20} className="text-[#FEBA4F]"/> {t('stripeBankConnection')}
                    </h3>
                    <p className="text-slate-400 font-bold text-sm mb-8">{t('stripeBankConnectionDesc')}</p>
                </div>
                <StripeConnectOnboarding 
                  userId={user?.id || ''} 
                  isComplete={!!user?.stripe_onboarding_complete} 
                  onComplete={onStripeVerified} 
                  t={t}
                  language={language}
                />
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="animate-in fade-in slide-in-from-right-4">
                <div className="mb-6">
                    <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128] mb-2 flex items-center gap-2">
                        <Bell size={20} className="text-[#FEBA4F]"/> Obvestila
                    </h3>
                    <p className="text-slate-400 font-bold text-sm mb-8">Upravljajte s prejemanjem e-poštnih obvestil.</p>
                </div>
                
                <div className="space-y-6">
                    
                    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-[#FEBA4F]/30 transition-colors">
                        <div>
                            <span className="block font-black text-[#0A1128] uppercase tracking-widest text-sm mb-1">Ponudbe na mojih dražbah</span>
                            <span className="block text-slate-500 text-sm">Prejmite e-pošto, ko nekdo odda ponudbo na vaši dražbi.</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={formData.emailNotifications?.bids !== false}
                            onClick={() => {
                                setFormData(prev => ({
                                    ...prev,
                                    emailNotifications: {
                                        ...prev.emailNotifications,
                                        bids: !(prev.emailNotifications?.bids !== false)
                                    }
                                }));
                                isFormDirtyRef.current = true;
                            }}
                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none ${formData.emailNotifications?.bids !== false ? 'bg-[#FEBA4F]' : 'bg-slate-300'}`}
                        >
                            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${formData.emailNotifications?.bids !== false ? 'translate-x-7' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-[#FEBA4F]/30 transition-colors">
                        <div>
                            <span className="block font-black text-[#0A1128] uppercase tracking-widest text-sm mb-1">Nova sporočila</span>
                            <span className="block text-slate-500 text-sm">Prejmite e-pošto, ko vam uporabnik pošlje sporočilo.</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={formData.emailNotifications?.messages !== false}
                            onClick={() => {
                                setFormData(prev => ({
                                    ...prev,
                                    emailNotifications: {
                                        ...prev.emailNotifications,
                                        messages: !(prev.emailNotifications?.messages !== false)
                                    }
                                }));
                                isFormDirtyRef.current = true;
                            }}
                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none ${formData.emailNotifications?.messages !== false ? 'bg-[#FEBA4F]' : 'bg-slate-300'}`}
                        >
                            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${formData.emailNotifications?.messages !== false ? 'translate-x-7' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-[#FEBA4F]/30 transition-colors">
                        <div>
                            <span className="block font-black text-[#0A1128] uppercase tracking-widest text-sm mb-1">Marketing in novice</span>
                            <span className="block text-slate-500 text-sm">Prejmite e-pošto o novostih in akcijah.</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={formData.emailNotifications?.marketing !== false}
                            onClick={() => {
                                setFormData(prev => ({
                                    ...prev,
                                    emailNotifications: {
                                        ...prev.emailNotifications,
                                        marketing: !(prev.emailNotifications?.marketing !== false)
                                    }
                                }));
                                isFormDirtyRef.current = true;
                            }}
                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none ${formData.emailNotifications?.marketing !== false ? 'bg-[#FEBA4F]' : 'bg-slate-300'}`}
                        >
                            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${formData.emailNotifications?.marketing !== false ? 'translate-x-7' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-6 bg-slate-100 rounded-2xl border border-slate-200 opacity-80 cursor-not-allowed">
                        <div>
                            <span className="block font-black text-[#0A1128] uppercase tracking-widest text-sm mb-1">Računi (Obvezno)</span>
                            <span className="block text-slate-500 text-sm">Prejmite e-pošto z računom ob nakupu paketa ali uspešni prodaji. Tega obvestila ni mogoče izklopiti.</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={true}
                            disabled={true}
                            className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none bg-[#FEBA4F] opacity-50 cursor-not-allowed"
                        >
                            <span className="inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm translate-x-7" />
                        </button>
                    </div>


                    <div className="flex justify-end mt-8">
                        <button type="submit" disabled={isSaving} className="bg-[#FEBA4F] text-[#0A1128] px-12 py-4 rounded-[2rem] font-black uppercase tracking-widest text-sm hover:bg-[#0A1128] hover:text-white transition-all shadow-xl flex items-center justify-center min-w-[250px]">
                            {isSaving ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                "Shrani obvestila"
                            )}
                        </button>
                    </div>
                </div>
              </div>
            )}

          </form>
        </div>
      </div>

      {/* MODAL ZA POTRDITEV IZBRISA PROFILA */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] max-w-lg w-full p-8 shadow-2xl border border-red-100 relative">
            <div className="w-14 h-14 rounded-3xl bg-red-100 border-2 border-red-200 flex items-center justify-center text-red-600 mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>

            <h3 className="text-2xl font-black uppercase tracking-tight text-center text-[#0A1128] mb-2">
              Trajni izbris profila
            </h3>
            
            <p className="text-sm font-bold text-slate-500 text-center mb-6 leading-relaxed">
              Dokončen izbris profila in podatkov.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 text-xs text-slate-600 font-bold space-y-2">
              <p>• Kupci vaših predhodno zaključenih in prodanih dražb bodo še vedno videli podatke o zmagani dražbi.</p>
              <p>• Namesto vašega imena bo prikazano »Uporabnik je bil izbrisan«.</p>
            </div>

            <div className="mb-6">
              <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Za potrditev vpišite <strong className="text-red-600">IZBRIŠI</strong>:
              </label>
              <input
                type="text"
                value={deleteConfirmationInput}
                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                placeholder="IZBRIŠI"
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-center tracking-widest text-red-600 outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-[#0A1128] rounded-2xl font-black uppercase tracking-wider text-xs transition-colors"
              >
                Prekliči
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmationInput.trim().toUpperCase() !== 'IZBRIŠI' || isDeleting}
                className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-wider text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Brisanje...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} /> Potrdi izbris
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
