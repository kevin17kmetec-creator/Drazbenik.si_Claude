import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Building2, CheckCircle2, AlertCircle } from 'lucide-react';

export const VerificationView: React.FC<{ onBack: () => void; t: any; onVerify: (type: 'individual' | 'business', data: any) => void; isVerified: boolean; userType: any; initialData?: any }> = ({ onBack, t, onVerify, isVerified, userType, initialData }) => {
    const [type, setType] = useState<'individual' | 'business'>(userType || 'individual');
    const [step, setStep] = useState(isVerified ? 2 : 1);
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [individualData, setIndividualData] = useState({
        firstName: initialData?.first_name || initialData?.firstName || '',
        lastName: initialData?.last_name || initialData?.lastName || '',
        email: initialData?.email || '',
        street: initialData?.street || '',
        city: initialData?.city || '',
        postalCode: initialData?.postal_code || initialData?.postalCode || '',
        taxNumber: initialData?.tax_number || initialData?.tax_id || initialData?.taxNumber || initialData?.taxId || ''
    });

    const [businessData, setBusinessData] = useState({
        companyName: initialData?.company_name || initialData?.companyName || '',
        email: initialData?.email || '',
        taxNumber: initialData?.tax_number || initialData?.tax_id || initialData?.taxNumber || initialData?.taxId || '',
        regNumber: initialData?.registration_number || initialData?.regNumber || '',
        companyStreet: initialData?.company_street || initialData?.companyStreet || '',
        companyCity: initialData?.company_city || initialData?.companyCity || '',
        companyPostalCode: initialData?.company_postal_code || initialData?.companyPostalCode || '',
        representative: initialData?.representative || ''
    });

    useEffect(() => {
        if (userType) {
            setType(userType);
        }
        if (isVerified) {
            setStep(2);
        }
    }, [userType, isVerified]);

    useEffect(() => {
        if (initialData) {
            setIndividualData(prev => ({
                firstName: prev.firstName || initialData.first_name || initialData.firstName || '',
                lastName: prev.lastName || initialData.last_name || initialData.lastName || '',
                email: prev.email || initialData.email || '',
                street: prev.street || initialData.street || '',
                city: prev.city || initialData.city || '',
                postalCode: prev.postalCode || initialData.postal_code || initialData.postalCode || '',
                taxNumber: prev.taxNumber || initialData.tax_number || initialData.tax_id || initialData.taxNumber || initialData.taxId || ''
            }));
            setBusinessData(prev => ({
                companyName: prev.companyName || initialData.company_name || initialData.companyName || '',
                email: prev.email || initialData.email || '',
                taxNumber: prev.taxNumber || initialData.tax_number || initialData.tax_id || initialData.taxNumber || initialData.taxId || '',
                regNumber: prev.regNumber || initialData.registration_number || initialData.regNumber || '',
                companyStreet: prev.companyStreet || initialData.company_street || initialData.companyStreet || '',
                companyCity: prev.companyCity || initialData.company_city || initialData.companyCity || '',
                companyPostalCode: prev.companyPostalCode || initialData.company_postal_code || initialData.companyPostalCode || '',
                representative: prev.representative || initialData.representative || ''
            }));
        }
    }, [initialData]);

    const validateEmail = (email: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const validateTaxNumber = (tax: string) => {
        // Slovenian tax numbers are 8 or 9 digits
        return /^\d{8,9}$/.test(tax);
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        const data = type === 'individual' ? individualData : businessData;
        
        // Client-side validation
        if (!validateEmail(data.email)) {
            setError("Prosimo, vnesite veljaven e-poštni naslov.");
            return;
        }

        if (!validateTaxNumber(data.taxNumber)) {
            setError("Davčna številka mora vsebovati 8 ali 9 številk.");
            return;
        }

        setIsVerifying(true);
        setError(null);

        try {
            await onVerify(type, data);
            onBack();
        } catch (error: any) {
            console.error("Verification failed:", error);
            setError(error.message || "Prišlo je do napake pri shranjevanju podatkov.");
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-16 px-6 animate-in">
            <button onClick={onBack} className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"><ArrowLeft size={16}/> {t('back')}</button>
            <div className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-100">
                <h2 className="text-4xl font-black mb-4 uppercase tracking-tighter italic">{t('identityVerification')}</h2>
                <p className="text-slate-400 font-bold mb-12">V skladu z 18. členom SP je za sodelovanje na dražbi obvezna verifikacija podatkov.</p>

                {error && (
                    <div className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl font-bold text-sm animate-in fade-in slide-in-from-top-4">
                        {error}
                    </div>
                )}

                {step === 1 ? (
                    <form onSubmit={handleVerify} className="space-y-12">
                        <div className="flex gap-4 p-2 bg-slate-50 rounded-[2.5rem]">
                            <button 
                                type="button"
                                disabled={isVerified}
                                onClick={() => setType('individual')} 
                                className={`flex-1 flex items-center justify-center gap-3 py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest transition-all ${type === 'individual' ? 'bg-[#0A1128] text-white shadow-xl' : 'text-slate-400 hover:text-[#0A1128]'}`}>
                                <User size={18} /> {t('individual')}
                            </button>
                            <button 
                                type="button"
                                disabled={isVerified}
                                onClick={() => setType('business')} 
                                className={`flex-1 flex items-center justify-center gap-3 py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest transition-all ${type === 'business' ? 'bg-[#0A1128] text-white shadow-xl' : 'text-slate-400 hover:text-[#0A1128]'}`}>
                                <Building2 size={18} /> {t('business')}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {type === 'individual' ? (
                                <>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('firstName')}</label><input type="text" required value={individualData.firstName} onChange={e => setIndividualData({...individualData, firstName: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('lastName')}</label><input type="text" required value={individualData.lastName} onChange={e => setIndividualData({...individualData, lastName: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">E-poštni naslov</label><input type="email" required value={individualData.email} onChange={e => setIndividualData({...individualData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('streetAddress')}</label><input type="text" required value={individualData.street} onChange={e => setIndividualData({...individualData, street: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('city')}</label><input type="text" required value={individualData.city} onChange={e => setIndividualData({...individualData, city: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('postalCode')}</label><input type="text" required value={individualData.postalCode} onChange={e => setIndividualData({...individualData, postalCode: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('taxNumber')}</label><input type="text" required value={individualData.taxNumber} onChange={e => setIndividualData({...individualData, taxNumber: e.target.value.replace(/\D/g, '')})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('companyName')}</label><input type="text" required value={businessData.companyName} onChange={e => setBusinessData({...businessData, companyName: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">E-poštni naslov podjetja</label><input type="email" required value={businessData.email} onChange={e => setBusinessData({...businessData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('taxNumber')}</label><input type="text" required value={businessData.taxNumber} onChange={e => setBusinessData({...businessData, taxNumber: e.target.value.replace(/\D/g, '')})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">Matična številka</label><input type="text" required value={businessData.regNumber} onChange={e => setBusinessData({...businessData, regNumber: e.target.value.replace(/\D/g, '')})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">Ulica in hišna številka (Sedež podjetja)</label><input type="text" required value={businessData.companyStreet} onChange={e => setBusinessData({...businessData, companyStreet: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('companyCity')}</label><input type="text" required value={businessData.companyCity} onChange={e => setBusinessData({...businessData, companyCity: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('companyPostalCode')}</label><input type="text" required value={businessData.companyPostalCode} onChange={e => setBusinessData({...businessData, companyPostalCode: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold" /></div>
                                    <div className="space-y-3 md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-400 ml-2">Zastopnik (Ime in priimek)</label><input type="text" required value={businessData.representative} onChange={e => setBusinessData({...businessData, representative: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 font-bold" /></div>
                                </>
                            )}
                        </div>

                        <button 
                            type="submit" 
                            disabled={isVerifying}
                            className="w-full bg-[#0A1128] text-white py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                        >
                            {isVerifying ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Procesiranje...
                                </>
                            ) : (
                                'Potrdi verifikacijo'
                            )}
                        </button>
                    </form>
                ) : (
                    <div className="text-center py-12 space-y-8">
                        <div className="w-24 h-24 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-sm border border-green-100"><CheckCircle2 size={48} /></div>
                        <div>
                            <h3 className="text-2xl font-black text-[#0A1128] uppercase italic mb-2">{t('verifiedStatus')}</h3>
                            <p className="text-slate-400 font-bold">Vaš profil je verificiran kot <span className="text-[#0A1128]">{type === 'individual' ? t('individual') : t('business')}</span>. Sprememba tipa računa po verifikaciji ni več mogoča.</p>
                        </div>
                        <div className="pt-8 border-t border-slate-100 grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-6 rounded-3xl text-left"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">{t('verificationDate')}</p><p className="font-bold">{new Date().toLocaleDateString(window.localStorage.getItem('language') === 'SLO' ? 'sl-SI' : window.localStorage.getItem('language') === 'EN' ? 'en-US' : 'de-DE')}</p></div>
                            <div className="bg-slate-50 p-6 rounded-3xl text-left"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">{t('statusText')}</p><p className="font-bold text-green-600">{t('statusActive')}</p></div>
                        </div>
                        <button onClick={onBack} className="w-full bg-[#0A1128] text-white py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] transition-all">{t('backToAuctions')}</button>
                    </div>
                )}
            </div>
        </div>
    );
};
