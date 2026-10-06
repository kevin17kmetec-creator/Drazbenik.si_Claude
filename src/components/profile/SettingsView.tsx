import React, { useState, useRef, useMemo, useEffect } from 'react';
import { User, Camera, CheckCircle2, AlertCircle, Shield, CreditCard, Building, MapPin, Key, Bell, X, Eye, EyeOff, ShieldAlert, AlertTriangle, ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression';
import { PhoneInput } from "@/src/components/ui/PhoneInput";
import { checkStripeAccountStatusAction, deleteAccountAction } from '@/src/actions/index';
import { auth } from "../../lib/firebase";
import { signOut, GoogleAuthProvider, linkWithPopup, unlink } from "firebase/auth";
import { friendlyError } from '../../lib/friendlyError';
import { Portal } from '../ui/Portal';

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

const PayoutsList: React.FC = () => {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchPayouts = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/seller/payouts', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (active && data.success && data.payouts) {
            setPayouts(data.payouts);
          }
        }
      } catch (err) {
        console.error("Error loading payouts list:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchPayouts();
    return () => {
      active = false;
    };
  }, []);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'held': return "Zadržano do potrditve prejema";
      case 'frozen': return "Zadržano zaradi spora";
      case 'release_waiting_funds': return "Čaka na razpoložljiva sredstva";
      case 'paid_out': return "Izplačano";
      case 'refunded': return "Vrnjeno kupcu";
      case 'release_failed': return "Napaka pri izplačilu (obvestite podporo)";
      default: return status;
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'paid_out': return "text-emerald-600 bg-emerald-50 border-emerald-100";
      case 'held': return "text-blue-600 bg-blue-50 border-blue-100";
      case 'frozen': return "text-amber-600 bg-amber-50 border-amber-100";
      case 'release_waiting_funds': return "text-indigo-600 bg-indigo-50 border-indigo-100";
      case 'refunded': return "text-rose-600 bg-rose-50 border-rose-100";
      case 'release_failed': return "text-red-600 bg-red-50 border-red-100";
      default: return "text-slate-600 bg-slate-50 border-slate-100";
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="w-6 h-6 border-2 border-[#0A1128] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <div className="bg-slate-50 rounded-2xl p-6 text-center text-slate-400 font-bold text-sm border border-slate-100">
        Še nimate izvedenih izplačil.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payouts.map((p) => (
        <div key={p.id} className="bg-white border-2 border-slate-100 rounded-3xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:border-[#FEBA4F]/50">
          <div>
            <h4 className="font-black text-[#0A1128] text-base uppercase tracking-tight">{p.title}</h4>
            <p className="text-xs text-slate-400 font-bold mt-1">
              Prejeto: {p.held_since ? new Date(p.held_since).toLocaleDateString('sl-SI') : '/'}
            </p>
          </div>
          <div className="flex sm:flex-col items-start sm:items-end gap-2 sm:gap-1 w-full sm:w-auto justify-between border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
            <span className="font-black text-[#0A1128] text-lg">€{(p.seller_net_cents / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2 })}</span>
            <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border-2 ${getStatusColorClass(p.payout_status)}`}>
              {getStatusLabel(p.payout_status)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export const SettingsView: React.FC<{ 
  t: any; 
  language: string; 
  user: any; 
  auctions?: any[];
  onSave: (data: any) => Promise<{ emailChangeSent: boolean } | void>; 
  onVerify: () => void; 
  onStripeVerified: () => void;
  onNavigateToPayoutSetup?: () => void;
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
  onNavigateToPayoutSetup,
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
  const [authProvidersRefresh, setAuthProvidersRefresh] = useState(0);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isUnlinkingGoogle, setIsUnlinkingGoogle] = useState(false);

  const providerData = auth.currentUser?.providerData || [];
  const hasPasswordProvider = providerData.some(p => p.providerId === 'password');
  const googleProvider = providerData.find(p => p.providerId === 'google.com');
  const hasGoogleProvider = !!googleProvider;
  const isPasswordUser = hasPasswordProvider;

  const handleLinkGoogle = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const proceed = window.confirm("Priporočamo Google račun z enakim e-poštnim naslovom kot ga uporabljate pri nas.");
    if (!proceed) return;

    setIsLinkingGoogle(true);
    try {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(currentUser, provider);
      await currentUser.reload();
      setAuthProvidersRefresh(prev => prev + 1);
      toast.success("Google račun je povezan. Odslej se lahko prijavite tudi z Googlom.");
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        // No toast when popup was closed or cancelled
      } else if (err?.code === 'auth/credential-already-in-use' || err?.code === 'auth/email-already-in-use') {
        toast.error("Ta Google račun je že povezan z drugim profilom.");
      } else if (err?.code === 'auth/provider-already-linked') {
        toast.error("Google račun je že povezan.");
      } else {
        toast.error(friendlyError(err, "Povezovanje z Google računom ni uspelo. Poskusite znova."));
      }
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    if ((currentUser.providerData?.length || 0) < 2) return;

    const proceed = window.confirm("Ali res želite odvezati Google prijavo?");
    if (!proceed) return;

    setIsUnlinkingGoogle(true);
    try {
      await unlink(currentUser, 'google.com');
      await currentUser.reload();
      setAuthProvidersRefresh(prev => prev + 1);
      toast.success("Google prijava je bila uspešno odvezana.");
    } catch (err: any) {
      toast.error(friendlyError(err, "Napaka pri odvezovanju Google računa."));
    } finally {
      setIsUnlinkingGoogle(false);
    }
  };

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
      toast.error(friendlyError(err, "Prišlo je do napake pri brisanju računa."));
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
    vatStatus: user?.vat_status || user?.vatStatus || 'exempt_small',
    vatId: user?.vat_id || user?.vatId || '',
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
            vatStatus: user.vat_status || user.vatStatus || 'exempt_small',
            vatId: user.vat_id || user.vatId || '',
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
            vatStatus: prev.vatStatus || user.vat_status || user.vatStatus || 'exempt_small',
            vatId: prev.vatId || user.vat_id || user.vatId || '',
            autoInvoiceGeneration: prev.autoInvoiceGeneration ?? user.auto_invoice_generation ?? user.autoInvoiceGeneration ?? true,
          };
        }
      });
    }
  }, [user]);

  const isProfileCompleted = Boolean(user?.profile_completed || user?.is_verified || user?.isVerified);
  const isIdentityVerified = Boolean(user?.identity_verified === true || user?.verified_identity === true || user?.identity_verification_status === 'verified');
  const userType = user?.user_type || user?.userType || 'individual';
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      isFormDirtyRef.current = true;
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.1,
          maxWidthOrHeight: 500,
          useWebWorker: false,
          initialQuality: 0.7
        });
        setPendingAvatarFile(compressed);
        setFormData(prev => {
          if (prev.profilePicture && prev.profilePicture.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(prev.profilePicture);
            } catch {}
          }
          const objectUrl = URL.createObjectURL(compressed);
          return { ...prev, profilePicture: objectUrl };
        });
      } catch (err) {
        console.warn("Avatar compression error:", err);
        toast.error("Slike ni bilo mogoče obdelati. Izberite drugo sliko.");
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      toast.error(t('passwordsNotMatch'));
      return;
    }
    if (formData.newPassword && !formData.oldPassword) {
      toast.error(t('oldPasswordRequired'));
      return;
    }

    if (userType === 'business') {
      if (!formData.vatStatus) {
        toast.error("Prosimo, izberite, ali ste zavezanec za DDV.");
        return;
      }
      if (formData.vatStatus === 'payer') {
        if (!formData.vatId) {
          toast.error("Prosimo, vnesite svojo ID za DDV (z oznako države, npr. SI12345678).");
          return;
        }
        const vatRegex = /^[A-Za-z]{2}\d+$/;
        if (!vatRegex.test(formData.vatId)) {
          toast.error("ID za DDV mora vsebovati oznako države in številke (npr. SI12345678).");
          return;
        }
      }
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const result = await onSave({ ...formData, profilePictureFile: pendingAvatarFile || null });
      setPendingAvatarFile(null);
      isFormDirtyRef.current = false;
      if (result && result.emailChangeSent) {
        toast.success("Podatki so shranjeni. Na nov e-poštni naslov smo poslali potrditveno povezavo.");
      } else {
        toast.success("Podatki so shranjeni.");
      }
    } catch (err: any) {
      console.error("Save profile error:", err);
      setErrorMessage(friendlyError(err, "Podatkov ni bilo mogoče shraniti. Poskusite znova."));
      toast.error(friendlyError(err, "Podatkov ni bilo mogoče shraniti. Poskusite znova."));
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

                {/* Načini prijave (Povezani računi) */}
                <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 mb-8">
                  <h3 className="text-sm font-black uppercase tracking-widest text-[#0A1128] mb-6 flex items-center gap-2">
                    <Shield size={16} className="text-[#FEBA4F]"/> Načini prijave
                  </h3>
                  <div className="space-y-4">
                    {/* Row 1: E-pošta in geslo */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#0A1128] shrink-0">
                          <Key size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-[#0A1128]">E-pošta in geslo</p>
                          <p className="text-[11px] font-bold text-slate-400">Prijava z vašim e-poštnim naslovom in geslom</p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider ${
                          hasPasswordProvider
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {hasPasswordProvider ? 'Povezano' : 'Ni povezano'}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Google */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#0A1128] shrink-0">
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-[#0A1128]">Google</p>
                          <p className="text-[11px] font-bold text-slate-400">Prijava z računom Google</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasGoogleProvider ? (
                          <>
                            <span className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">
                              Povezano{googleProvider?.email ? ` (${googleProvider.email})` : ''}
                            </span>
                            {providerData.length >= 2 && (
                              <button
                                type="button"
                                disabled={isUnlinkingGoogle}
                                onClick={handleUnlinkGoogle}
                                className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              >
                                {isUnlinkingGoogle ? 'Odvezovanje...' : 'Odveži'}
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isLinkingGoogle}
                            onClick={handleLinkGoogle}
                            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-[#0A1128] text-[#FEBA4F] hover:bg-[#142247] transition-all shadow-sm flex items-center gap-2"
                          >
                            {isLinkingGoogle ? 'Povezovanje...' : 'Poveži Google račun'}
                          </button>
                        )}
                      </div>
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
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Ali ste zavezanec za DDV?</label>
                                        <select
                                            value={formData.vatStatus}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    vatStatus: val,
                                                    vatId: val === 'exempt_small' ? '' : prev.vatId
                                                }));
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F] cursor-pointer"
                                        >
                                            <option value="exempt_small">Ne (nisem zavezanec po 94. členu ZDDV-1)</option>
                                            <option value="payer">Da</option>
                                        </select>
                                    </div>
                                    {formData.vatStatus === 'payer' && (
                                        <div className="md:col-span-2">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">ID za DDV (z oznako države, npr. SI12345678)</label>
                                            <input
                                                type="text"
                                                placeholder="npr. SI12345678"
                                                value={formData.vatId}
                                                onChange={e => setFormData({ ...formData, vatId: e.target.value.toUpperCase().replace(/\s/g, '') })}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F]"
                                            />
                                        </div>
                                    )}
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
                <div className="mb-8">
                  <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128] mb-2 flex items-center gap-2">
                    <CreditCard size={20} className="text-[#FEBA4F]"/> Moja izplačila
                  </h3>
                  <p className="text-slate-500 font-bold text-sm mb-6 leading-relaxed">
                    Denar od kupca je že na vašem računu pri Stripe in ga mi ne hranimo. Na bančni račun se izplača po potrditvi prejema.
                  </p>
                  
                  <PayoutsList />
                </div>
                
                <div className="mb-6">
                    <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128] mb-2 flex items-center gap-2">
                        <CreditCard size={20} className="text-[#FEBA4F]"/> {t('stripeBankConnection')}
                    </h3>
                    <p className="text-slate-400 font-bold text-sm mb-6">{t('stripeBankConnectionDesc')}</p>
                </div>

                <div className="bg-slate-50 border-2 border-slate-200 rounded-3xl p-6 mb-6">
                  {user?.stripe_onboarding_complete ? (
                    <div className="flex items-center gap-3 text-emerald-800 font-bold mb-4">
                      <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-black text-base uppercase tracking-tight">Izplačila so urejena</div>
                        <div className="text-xs text-slate-500 font-bold mt-0.5">Vaš račun je pripravljen za prejemanje izplačil.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-amber-800 font-bold mb-4">
                      <AlertCircle size={24} className="text-amber-600 shrink-0" />
                      <div>
                        <div className="font-black text-base uppercase tracking-tight">Izplačila še niso urejena</div>
                        <div className="text-xs text-slate-500 font-bold mt-0.5">Za prodajo na platformi morate urediti račun za izplačila.</div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (onNavigateToPayoutSetup) onNavigateToPayoutSetup();
                    }}
                    className="bg-[#0A1128] text-white px-6 py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-md flex items-center gap-2"
                  >
                    <CreditCard size={18} /> Uredi izplačila
                  </button>
                </div>
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
        <Portal>
          <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
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
        </Portal>
      )}
    </div>
  );
};
