import React, { useState, useEffect } from 'react';
import { CreateAuctionForm } from "@/src/components/auction/CreateAuctionForm";
import { Layers, Plus, Trash2, ArrowLeft, CheckCircle, Edit3 } from 'lucide-react';
import { toast } from 'sonner';
import { db, auth } from "@/src/lib/firebase";
import { doc, setDoc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { getUserAuctionCycle } from "../../lib/utils";

export const CreatePackageForm: React.FC<any> = ({ initialData,  onBack, t, language, onPublishPackage, onPublishItemDirectly, isLoggedIn, userData, auctions, onNavigateToSettings }) => {
  const [packageId, setPackageId] = useState(() => crypto.randomUUID());
  const [packageTitle, setPackageTitle] = useState("");
  const [showTitleError, setShowTitleError] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);

  const [isPublishing, setIsPublishing] = useState(false);
  const [draftCreatedAt, setDraftCreatedAt] = useState<number | null>(null);
  const [timeLeftStr, setTimeLeftStr] = useState("");

  useEffect(() => {
    if (!draftCreatedAt) return;
    const updateCountdown = () => {
      const remaining = 3 * 24 * 60 * 60 * 1000 - (Date.now() - draftCreatedAt);
      if (remaining <= 0) {
         setTimeLeftStr("Osnutek je potekel");
         return;
      }
      const d = Math.floor(remaining / (1000 * 60 * 60 * 24));
      const h = Math.floor((remaining / (1000 * 60 * 60)) % 24);
      const m = Math.floor((remaining / 1000 / 60) % 60);
      setTimeLeftStr(`Osnutek poteče čez: ${d}d ${h}h ${m}m`);
    };
    updateCountdown();
    const int = setInterval(updateCountdown, 60000);
    return () => clearInterval(int);
  }, [draftCreatedAt]);

  // Robust draft persistence helper
  const persistDraft = async (
    pkgId: string,
    title: string,
    itemList: any[],
    createdVal?: number | null
  ) => {
    const userId = userData?.id || auth?.currentUser?.uid || 'guest';
    const now = Date.now();
    const cTime = createdVal || draftCreatedAt || now;
    if (!draftCreatedAt && itemList.length > 0) {
      setDraftCreatedAt(cTime);
    }

    const payload = {
      packageId: pkgId,
      packageTitle: title,
      items: itemList,
      createdAt: cTime,
      updatedAt: now,
    };

    // 1. Immediately save synchronously to localStorage
    try {
      localStorage.setItem(`drazbe_package_draft_${userId}`, JSON.stringify(payload));
      localStorage.setItem('drazbe_package_draft_latest', JSON.stringify({ ...payload, userId }));
    } catch (e) {
      console.warn("LocalStorage save error:", e);
    }

    // 2. Persist to Firestore asynchronously
    if (userId && userId !== 'guest') {
      try {
        const sanitized = JSON.parse(JSON.stringify(payload, (k, v) => (v === undefined ? null : v)));
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { package_draft: sanitized }).catch(() => null);
        const draftDocRef = doc(db, 'package_drafts', userId);
        await setDoc(draftDocRef, sanitized, { merge: true }).catch(() => null);
      } catch (e) {
        console.warn("Firestore draft save error:", e);
      }
    }
  };

  // Load draft immediately from localStorage and sync from Firestore
  useEffect(() => {
    const userId = userData?.id || auth?.currentUser?.uid || 'guest';
    
    // 1. Synchronously read from localStorage
    let localData: any = null;
    try {
      const stored = localStorage.getItem(`drazbe_package_draft_${userId}`) || localStorage.getItem('drazbe_package_draft_latest');
      if (stored) {
        const parsed = JSON.parse(stored);
        const creationTime = parsed.createdAt || parsed.updatedAt || Date.now();
        if (Date.now() - creationTime > 3 * 24 * 60 * 60 * 1000) {
          localStorage.removeItem(`drazbe_package_draft_${userId}`);
          localStorage.removeItem('drazbe_package_draft_latest');
        } else {
          localData = parsed;
          setPackageTitle(parsed.packageTitle || "");
          setItems(parsed.items || []);
          if (parsed.packageId) setPackageId(parsed.packageId);
          setDraftCreatedAt(creationTime);
        }
      }
    } catch (e) {
      console.warn("LocalStorage load error:", e);
    }

    // 2. Fetch from Firestore to sync cloud data
    if (userId && userId !== 'guest') {
      const loadRemoteDraft = async () => {
        try {
          let remoteData: any = null;
          try {
            const snap = await getDoc(doc(db, 'package_drafts', userId));
            if (snap.exists()) remoteData = snap.data();
          } catch (e) {}

          if (!remoteData) {
            try {
              const uSnap = await getDoc(doc(db, 'users', userId));
              if (uSnap.exists() && uSnap.data()?.package_draft) {
                remoteData = uSnap.data().package_draft;
              }
            } catch (e) {}
          }

          if (remoteData) {
            const creationTime = remoteData.createdAt || remoteData.updatedAt || Date.now();
            if (Date.now() - creationTime > 3 * 24 * 60 * 60 * 1000) {
              await deleteDoc(doc(db, 'package_drafts', userId)).catch(() => null);
              await updateDoc(doc(db, 'users', userId), { package_draft: null }).catch(() => null);
              localStorage.removeItem(`drazbe_package_draft_${userId}`);
              localStorage.removeItem('drazbe_package_draft_latest');
            } else {
              const remoteUpdated = remoteData.updatedAt || 0;
              const localUpdated = localData?.updatedAt || 0;
              if (remoteUpdated >= localUpdated) {
                setPackageTitle(remoteData.packageTitle || "");
                setItems(remoteData.items || []);
                if (remoteData.packageId) setPackageId(remoteData.packageId);
                setDraftCreatedAt(creationTime);
                try {
                  localStorage.setItem(`drazbe_package_draft_${userId}`, JSON.stringify(remoteData));
                } catch (e) {}
              }
            }
          }
        } catch (e) {
          console.error("Napaka pri nalaganju osnutka", e);
        } finally {
          setIsLoadingDraft(false);
        }
      };
      loadRemoteDraft();
    } else {
      setIsLoadingDraft(false);
    }
  }, [userData?.id]);

  // Debounced auto-save on package title changes
  useEffect(() => {
    if (isLoadingDraft) return;
    if (items.length === 0 && !packageTitle) return;
    const timer = setTimeout(() => {
      persistDraft(packageId, packageTitle, items, draftCreatedAt);
    }, 800);
    return () => clearTimeout(timer);
  }, [packageTitle]);
  
  const handleClearDraft = async () => {
    const userId = userData?.id || auth?.currentUser?.uid || 'guest';
    if (confirm("Ste prepričani, da želite izbrisati celoten osnutek večpredmetne dražbe?")) {
      try {
        localStorage.removeItem(`drazbe_package_draft_${userId}`);
        localStorage.removeItem('drazbe_package_draft_latest');
        if (userId && userId !== 'guest') {
          await deleteDoc(doc(db, 'package_drafts', userId)).catch(() => null);
          await updateDoc(doc(db, 'users', userId), { package_draft: null }).catch(() => null);
        }
        setItems([]);
        setPackageTitle("");
        setPackageId(crypto.randomUUID());
        setDraftCreatedAt(null);
        toast.success("Osnutek je bil uspešno izbrisan.");
      } catch (e) {
        toast.error("Napaka pri brisanju osnutka.");
      }
    }
  };
  
  const validateEndTime = (newItemEndTime: string, skipIndex?: number) => {
      const newTime = new Date(newItemEndTime).getTime();
      if (isNaN(newTime)) throw new Error("Neveljaven čas dražbe.");
      
      const allTimes = items.filter((_, idx) => idx !== skipIndex).map(i => new Date(i.endTime).getTime());
      allTimes.sort((a, b) => a - b);
      
      const generateCorrection = (highestTime: number, baseMessage: string) => {
          const nextAvailable = new Date(highestTime + 2 * 60 * 1000); // add 2 mins to highest
          const y = nextAvailable.getFullYear();
          const mo = String(nextAvailable.getMonth() + 1).padStart(2, '0');
          const d = String(nextAvailable.getDate()).padStart(2, '0');
          const h = String(nextAvailable.getHours()).padStart(2, '0');
          const m = String(nextAvailable.getMinutes()).padStart(2, '0');
          
          const correctedTimeStr = `${h}:${m}`;
          const correctedDateStr = `${y}-${mo}-${d}`;
          
          const err = new Error(`${baseMessage} Ura je bila avtomatsko popravljena na ${correctedDateStr} ${correctedTimeStr}.`);
          (err as any).correctedTimeStr = correctedTimeStr;
          (err as any).correctedDateStr = correctedDateStr;
          return err;
      };

      for (const t of allTimes) {
          if (Math.abs(t - newTime) < 2 * 60 * 1000) {
              const highestTime = allTimes.length > 0 ? allTimes[allTimes.length - 1] : newTime;
              throw generateCorrection(highestTime, "Razmik mora biti vsaj 2 minuti.");
          }
      }
      
      // 2. Max 10-min gap between consecutive
      const sorted = [...allTimes, newTime].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] - sorted[i-1] > 10 * 60 * 1000) {
              const highestTime = allTimes.length > 0 ? allTimes[allTimes.length - 1] : newTime;
              throw generateCorrection(highestTime, "Dražbe v zbirki ne smejo biti narazen več kot 10 minut.");
          }
      }
      
      // 3. Overall duration constraint
      if (sorted.length > 1) {
          const totalDuration = sorted[sorted.length - 1] - sorted[0];
          if (totalDuration > sorted.length * 10 * 60 * 1000) {
               throw new Error("Skupno trajanje zbirke presega dovoljeno glede na število dražb.");
          }
      }
  };

    const handlePublishItemLocally = async (item: any) => {
    validateEndTime(item.endTime, editingItemIndex !== null ? editingItemIndex : undefined);
    
    try {
        if (onPublishItemDirectly) {
            await onPublishItemDirectly(item, packageTitle || "Neimenovana zbirka", packageId);
        }
        let newItems: any[];
        if (editingItemIndex !== null) {
            newItems = [...items];
            newItems[editingItemIndex] = { ...item, is_published: true };
            setEditingItemIndex(null);
        } else {
            newItems = [...items, { ...item, is_published: true }];
            setIsAddingItem(false);
        }
        setItems(newItems);
        await persistDraft(packageId, packageTitle, newItems, draftCreatedAt || Date.now());
        toast.success("Dražba je objavljena v živo in dodana v zbirko!");
    } catch (e: any) {
        toast.error("Napaka pri objavi dražbe.");
        throw e;
    }
  };
  
    const handleSaveDraftLocally = async (item: any) => {
      validateEndTime(item.endTime, editingItemIndex !== null ? editingItemIndex : undefined);
      
      let newItems: any[];
      if (editingItemIndex !== null) {
          newItems = [...items];
          newItems[editingItemIndex] = { ...item, is_published: false };
          setEditingItemIndex(null);
      } else {
          newItems = [...items, { ...item, is_published: false }];
          setIsAddingItem(false);
      }
      setItems(newItems);
      await persistDraft(packageId, packageTitle, newItems, draftCreatedAt || Date.now());
      toast.success("Dražba uspešno shranjena v osnutek zbirke.");
  };

  const handleSubmitPackage = async () => {
    if (userData && auctions) {
        const cycleInfo = getUserAuctionCycle(auctions, userData.id, userData);
        const newItemsCount = items.length;
        if (!cycleInfo.isUnlimited && cycleInfo.count + newItemsCount > cycleInfo.userLimit) {
            toast.error(`Z objavo te zbirke boste presegli omejitev objav v trenutnem ciklu (${cycleInfo.userLimit}). Objavite lahko še največ ${Math.max(0, cycleInfo.userLimit - cycleInfo.count)} predmetov. Nadgradite paket.`);
            return;
        }
    }

    if (items.length < 2) {
      toast.error("Zbirka mora vsebovati vsaj 2 dražbi.");
      return;
    }
    if (!packageTitle) {
      toast.error("Vnesite ime zbirke dražb.");
      return;
    }
    
    setIsPublishing(true);
    try {
      await onPublishPackage({ title: packageTitle, items, packageId });
      const userId = userData?.id || auth?.currentUser?.uid || 'guest';
      localStorage.removeItem(`drazbe_package_draft_${userId}`);
      localStorage.removeItem('drazbe_package_draft_latest');
      if (userId && userId !== 'guest') {
        await deleteDoc(doc(db, 'package_drafts', userId)).catch(() => null);
        await updateDoc(doc(db, 'users', userId), { package_draft: null }).catch(() => null);
      }
    } catch (error) {
      toast.error("Prišlo je do napake pri objavi.");
    } finally {
      setIsPublishing(false);
    }
  };
  
  const handleDeleteItem = async (idx: number) => {
      const item = items[idx];
      if (item.is_published) {
          toast.error("Objavljene dražbe ne morete izbrisati iz zbirke tukaj.");
          return;
      }
      const newItems = items.filter((_, i) => i !== idx);
      setItems(newItems);
      await persistDraft(packageId, packageTitle, newItems, draftCreatedAt);
  };

  if (isAddingItem || editingItemIndex !== null) {
    return (
      <div className="bg-slate-50 min-h-screen">
        <div className="p-4 border-b bg-white flex justify-between items-center sticky top-0 z-50 shadow-sm">
          <h2 className="text-xl font-bold flex items-center gap-2 text-[#0A1128]">
            <Layers className="text-[#FEBA4F]" />
            {items.length > 0 ? "Dodaj naslednjo dražbo v zbirko" : "Dodaj prvo dražbo v zbirko"}
          </h2>
          <button onClick={() => { setIsAddingItem(false); setEditingItemIndex(null); }} className="text-red-500 font-bold px-4 py-2 hover:bg-red-50 rounded-xl transition-colors text-xs uppercase tracking-wider">
             Prekliči dodajanje
          </button>
        </div>
        <CreateAuctionForm 
          onBack={() => { setIsAddingItem(false); setEditingItemIndex(null); }}
          t={t}
          language={language}
          onPublish={handlePublishItemLocally}
          onSaveDraft={handleSaveDraftLocally}
          isPackageMode={true}
          isLoggedIn={isLoggedIn}
          userData={userData}
          auctions={auctions}
          onNavigateToSettings={onNavigateToSettings}
          initialData={editingItemIndex !== null ? items[editingItemIndex] : (items.length > 0 ? {
              category: items[0].category,
              condition: items[0].condition,
              region: items[0].region,
              location: items[0].location,
              delivery_option: items[0].delivery_option,
              shipping_fee_type: items[0].shipping_fee_type,
              shipping_cost: items[0].shipping_cost
          } : undefined)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 animate-in fade-in">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-3 bg-white hover:bg-slate-100 rounded-2xl border border-slate-200 transition-colors shadow-sm text-[#0A1128]">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3 text-[#0A1128]">
            <Layers className="text-[#FEBA4F]" size={32} />
            Ustvari zbirko dražb
          </h1>
          <p className="text-slate-500 font-medium mt-1">Združite več tematskih dražb v enotno zbirko.</p>
          {draftCreatedAt && (
            <div className="flex items-center gap-3 mt-2">
              <p className="text-sm font-bold text-red-500 bg-red-50 inline-block px-3 py-1 rounded-full border border-red-100">{timeLeftStr}</p>
              <button onClick={handleClearDraft} className="text-xs font-bold text-slate-400 hover:text-red-500 underline transition-colors">
                Počisti osnutek
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 mb-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-[#FEBA4F]"></div>
        <label className="block text-xs font-black uppercase tracking-widest text-[#0A1128] mb-3">Naslov zbirke</label>
        <input 
          type="text" 
          className={`w-full border-2 rounded-2xl p-4 outline-none text-lg font-bold text-[#0A1128] transition-colors shadow-inner ${showTitleError ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-[#FEBA4F]'}`} 
          placeholder="Npr. Zbirka delavniške opreme in orodja" 
          value={packageTitle}
          onChange={e => {
            setPackageTitle(e.target.value);
            setShowTitleError(false);
          }}
        />
      </div>

      <div className="mb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
          <h2 className="text-2xl font-black text-[#0A1128]">Dražbe v zbirki ({items.length})</h2>
          <button 
            onClick={() => {
                if (!packageTitle && items.length === 0) {
                    toast.error("Prosimo, najprej vnesite naslov zbirke.");
                    setShowTitleError(true);
                    return;
                }
                setIsAddingItem(true);
            }} 
            className="px-5 py-3 bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-md"
          >
            <Plus size={16} /> Dodaj dražbo
          </button>
        </div>
        
        {items.length === 0 && (
          <div className="text-center p-12 bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-bold text-base">V zbirki še ni dražb. Zbirka mora vsebovati vsaj 2 dražbi.</p>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {items.map((item, idx) => (
            <div key={idx} className={"bg-white text-[#0A1128] rounded-[2rem] p-5 flex gap-5 shadow-lg border-2 transition-all " + (item.is_published ? "border-green-400" : "border-slate-200 hover:border-[#FEBA4F]")}>
               <img src={item.images[0]} className="w-24 h-24 object-cover rounded-2xl border border-slate-200" alt="Item" />
               <div className="flex-1 flex flex-col justify-center">
                 <h3 className="font-black text-base line-clamp-1">{item.title.SLO}</h3>
                 <p className="text-[#0A1128] font-black text-lg mt-1">€{Number(item.startingPrice || 1).toLocaleString('sl-SI')}</p>
                 <div className="flex items-center gap-2 mt-2">
                     {item.is_published ? (
                         <span className="bg-green-100 text-green-700 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md flex items-center gap-1"><CheckCircle size={12}/> V živo</span>
                     ) : (
                         <span className="bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md">Osnutek</span>
                     )}
                 </div>
               </div>
               {!item.is_published && (
                 <div className="flex">
                   <button onClick={() => setEditingItemIndex(idx)} className="text-slate-400 hover:text-blue-500 p-2 transition-colors self-center bg-slate-50 hover:bg-blue-50 rounded-xl mr-2">
                     <Edit3 size={20} />
                   </button>
                   <button onClick={() => handleDeleteItem(idx)} className="text-slate-400 hover:text-red-500 p-2 transition-colors self-center bg-slate-50 hover:bg-red-50 rounded-xl">
                     <Trash2 size={20} />
                   </button>
                 </div>
               )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-slate-200">
        <button 
          onClick={handleSubmitPackage} 
          disabled={items.length < 2 || !packageTitle || isPublishing} 
          className="px-10 py-4 bg-[#FEBA4F] text-[#0A1128] hover:bg-[#0A1128] hover:text-[#FEBA4F] rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl hover:shadow-2xl flex items-center justify-center min-w-[200px]"
        >
          {isPublishing ? (
            <div className="w-5 h-5 border-2 border-[#0A1128] border-t-transparent rounded-full animate-spin"></div>
          ) : items.some(i => !i.is_published) ? "Objavi zbirko (" + items.filter(i => !i.is_published).length + " novih)" : "Shrani zbirko"}
        </button>
      </div>
    </div>
  );
};
