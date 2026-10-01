import React, { useState, useRef } from 'react';
import { Loader2, Package, Truck, Check, Upload, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { doc, updateDoc } from 'firebase/firestore';
import { db, storage } from "../../lib/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { analyzeReceiptAction } from '@/src/actions/index';

export const CheckoutFlow: React.FC<{ auction: any, currentUserId: string }> = ({ auction, currentUserId }) => {
    const isSeller = auction.userId === currentUserId;
    const isBuyer = auction.currentBidder === currentUserId;
    
    // Only show if the auction is finished and the user is either the buyer or the seller
    if (auction.status !== 'finished' && auction.status !== 'sold' && auction.status !== 'paid') {
        return null;
    }
    
    if (!isSeller && !isBuyer) {
        return null; // Don't show to third parties
    }

    const deliveryOption = auction.delivery_option || 'both'; // both, pickup_only, shipping_only
    const feeType = auction.shipping_fee_type || 'fixed'; // fixed, calculated
    const isLocked = auction.is_delivery_locked;
    const selectedDelivery = auction.selected_delivery;
    
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [localSelected, setLocalSelected] = useState(selectedDelivery || (deliveryOption !== 'both' ? (deliveryOption === 'pickup_only' ? 'pickup' : 'shipping') : null));
    
    // For Seller uploading receipt
    const [fileUrl, setFileUrl] = useState(auction.shipping_receipt_url || null);
    const [cost, setCost] = useState(auction.shipping_cost || 0);

    const handleConfirmBuyer = async () => {
        if (!localSelected) return toast.error("Izberite način prevzema");
        
        setLoading(true);
        setErrorMessage(null);
        try {
            await updateDoc(doc(db, 'auctions', auction.id), {
                selected_delivery: localSelected,
                is_delivery_locked: localSelected === 'pickup' ? true : (feeType === 'fixed' ? true : false)
            });
            toast.success("Način predaje potrjen");
        } catch (e: any) {
            setErrorMessage(e?.message || "Napaka pri shranjevanju");
            toast.error("Napaka pri shranjevanju");
        } finally {
            setLoading(false);
        }
    };

    const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setLoading(true);
        setErrorMessage(null);
        try {
            const fRef = storageRef(storage, `receipts/${auction.id}_${Date.now()}`);
            await uploadBytes(fRef, file);
            const url = await getDownloadURL(fRef);
            setFileUrl(url);
            
            // Call Gemini API via Server Action
            const res = await analyzeReceiptAction({ imageUrl: url });
            
            if (res.success && res.data?.shipping_cost !== undefined && res.data?.shipping_cost !== null) {
                setCost(res.data.shipping_cost);
                toast.success("Znesek uspešno odčitan z računa!");
            } else {
                toast.error("Zneska ni bilo mogoče prepoznati. Prosimo, vnesite ga ročno.");
            }
        } catch (e: any) {
            setErrorMessage(e?.message || "Napaka pri nalaganju in analizi računa");
            toast.error("Napaka pri nalaganju in analizi računa");
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmSellerReceipt = async () => {
        if (!fileUrl) return toast.error("Naložite račun!");
        if (cost <= 0) return toast.error("Znesek poštnine mora biti večji od 0");
        
        setLoading(true);
        setErrorMessage(null);
        try {
            await updateDoc(doc(db, 'auctions', auction.id), {
                shipping_receipt_url: fileUrl,
                shipping_cost: Number(cost),
                is_delivery_locked: true
            });
            toast.success("Račun poslan kupcu in zaklenjen");
        } catch (e: any) {
            setErrorMessage(e?.message || "Napaka pri potrjevanju računa");
            toast.error("Napaka pri potrjevanju računa");
        } finally {
            setLoading(false);
        }
    };

    if (isLocked) {
        return (
            <div className="bg-green-50 border-2 border-green-200 rounded-[2rem] p-6 mb-6 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center">
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 size={24} />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-black text-green-800 uppercase tracking-wider mb-1">Način predaje je zaklenjen</h3>
                    <p className="text-sm font-bold text-green-700">
                        Dogovor: {selectedDelivery === 'pickup' ? 'Osebni prevzem' : 'Pošiljanje po pošti'}
                        {selectedDelivery === 'shipping' && (
                            <span className="ml-2 bg-white px-2 py-1 rounded-lg text-xs border border-green-200 shadow-sm">
                                Poštnina: {auction.shipping_cost ? `€${Number(auction.shipping_cost).toFixed(2)}` : 'Po obračunu'}
                            </span>
                        )}
                    </p>
                </div>
                {selectedDelivery === 'shipping' && auction.shipping_receipt_url && (
                    <a href={auction.shipping_receipt_url} target="_blank" rel="noreferrer" className="bg-white border border-green-200 text-green-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-green-100 transition-colors">
                        Poglej račun
                    </a>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white border-2 border-[#FEBA4F] rounded-[2rem] p-6 mb-6 shadow-sm">
            <h3 className="text-sm font-black text-[#0A1128] uppercase tracking-wider mb-4">Dogovor o predaji predmeta</h3>
            
            {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0 text-red-500" />
                    <span>{errorMessage}</span>
                </div>
            )}
            
            {/* BUYER VIEW */}
            {isBuyer && !selectedDelivery && deliveryOption === 'both' && (
                <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-500">Prodajalec ponuja obe možnosti. Izberite način prevzema:</p>
                    <div className="flex gap-4">
                        <button onClick={() => setLocalSelected('pickup')} className={`flex-1 py-4 rounded-xl border-2 font-black text-xs uppercase tracking-wider transition-all ${localSelected === 'pickup' ? 'bg-[#FEBA4F]/10 border-[#FEBA4F] text-[#0A1128]' : 'border-slate-100 text-slate-400 hover:border-[#FEBA4F]/50'}`}>
                            <Package className="mx-auto mb-2" />
                            Osebni prevzem
                        </button>
                        <button onClick={() => setLocalSelected('shipping')} className={`flex-1 py-4 rounded-xl border-2 font-black text-xs uppercase tracking-wider transition-all ${localSelected === 'shipping' ? 'bg-[#FEBA4F]/10 border-[#FEBA4F] text-[#0A1128]' : 'border-slate-100 text-slate-400 hover:border-[#FEBA4F]/50'}`}>
                            <Truck className="mx-auto mb-2" />
                            Pošiljanje po pošti
                        </button>
                    </div>
                    {localSelected && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-4 text-center space-y-3">
                            <p className="text-xs font-bold text-red-500">Opozorilo: Ko potrdite izbiro, sprememba načina predaje ne bo več mogoča.</p>
                            <button onClick={handleConfirmBuyer} disabled={loading} className="bg-[#0A1128] text-white px-8 py-3 rounded-full text-xs font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all w-full flex items-center justify-center gap-2">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                Potrdi način predaje
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* BUYER WAITING FOR SELLER RECEIPT */}
            {isBuyer && selectedDelivery === 'shipping' && feeType === 'calculated' && !isLocked && (
                <div className="text-center py-4 space-y-3">
                    <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 animate-pulse">
                        <Truck size={24} />
                    </div>
                    <p className="text-sm font-bold text-slate-500">Čakamo prodajalca, da naloži račun pošte in potrdi znesek poštnine...</p>
                </div>
            )}

            {/* SELLER UPLOADING RECEIPT */}
            {isSeller && selectedDelivery === 'shipping' && feeType === 'calculated' && !isLocked && (
                <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-500 mb-3">Kupec je izbral pošiljanje. Naložite sliko računa iz pošte, da samodejno odčitamo znesek in ga zaračunamo kupcu.</p>
                        
                        {!fileUrl ? (
                            <label className="border-2 border-dashed border-slate-300 hover:border-[#FEBA4F] bg-white p-6 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all">
                                <input type="file" accept="image/*" onChange={handleUploadReceipt} className="hidden" disabled={loading} />
                                {loading ? (
                                    <div className="text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={24}/> Analiziram račun z AI...</div>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 bg-[#FEBA4F]/10 text-[#FEBA4F] rounded-full flex items-center justify-center"><Upload size={20} /></div>
                                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Naloži sliko računa</span>
                                    </>
                                )}
                            </label>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
                                    <img src={fileUrl} alt="Račun" className="w-16 h-16 object-cover rounded-lg" />
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black uppercase text-slate-400">Znesek poštnine (€)</label>
                                        <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(Number(e.target.value))} className="w-full font-bold text-lg bg-transparent outline-none border-b border-slate-200 py-1 focus:border-[#FEBA4F]" />
                                    </div>
                                </div>
                                <button onClick={handleConfirmSellerReceipt} disabled={loading} className="bg-[#0A1128] text-white px-8 py-3 rounded-full text-xs font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all w-full flex items-center justify-center gap-2">
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    Pošlji kupcu in potrdi
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* SELLER WAITING FOR BUYER TO CHOOSE */}
            {isSeller && !selectedDelivery && deliveryOption === 'both' && (
                <div className="text-center py-4 space-y-3">
                    <p className="text-sm font-bold text-slate-500">Čakamo kupca, da izbere način predaje...</p>
                </div>
            )}
            
            {/* NO ACTION NEEDED / PROCESSING FIX */}
            {((isBuyer || isSeller) && (!localSelected && deliveryOption !== 'both' && !selectedDelivery)) && (
                <div className="text-center space-y-4">
                   <p className="text-xs font-bold text-slate-500">Način predaje: {deliveryOption === 'pickup_only' ? 'Samo osebni prevzem' : 'Samo pošiljanje'}</p>
                   {isBuyer && (
                       <button onClick={handleConfirmBuyer} disabled={loading} className="bg-[#0A1128] text-white px-8 py-3 rounded-full text-xs font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all w-full flex items-center justify-center gap-2">
                           {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                           Potrdi dogovor
                       </button>
                   )}
                </div>
            )}
        </div>
    );
};
