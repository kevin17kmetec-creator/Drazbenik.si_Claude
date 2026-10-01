const fs = require('fs');
let content = fs.readFileSync('src/components/auction/CreatePackageForm.tsx', 'utf8');

const importTarget = `import { toast } from 'sonner';`;
const importNew = `import { toast } from 'sonner';
import { db } from "@/src/lib/firebase";
import { doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { useEffect } from 'react';`;

content = content.replace(importTarget, importNew);

const stateTarget = `  const [packageId] = useState(() => crypto.randomUUID());
  const [packageTitle, setPackageTitle] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);`;

const stateNew = `  const [packageId, setPackageId] = useState(() => crypto.randomUUID());
  const [packageTitle, setPackageTitle] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);

  // Load draft from DB
  useEffect(() => {
    if (!userData?.id) return;
    const loadDraft = async () => {
      try {
        const docRef = doc(db, 'package_drafts', userData.id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const draftTime = data.updatedAt || data.createdAt || 0;
          if (Date.now() - draftTime > 3 * 24 * 60 * 60 * 1000) {
            await deleteDoc(docRef);
          } else {
            setPackageTitle(data.packageTitle || "");
            setItems(data.items || []);
            if (data.packageId) setPackageId(data.packageId);
          }
        }
      } catch (e) {
        console.error("Napaka pri nalaganju osnutka", e);
      } finally {
        setIsLoadingDraft(false);
      }
    };
    loadDraft();
  }, [userData?.id]);

  // Save draft to DB
  useEffect(() => {
    if (isLoadingDraft || !userData?.id) return;
    const saveDraft = async () => {
      if (items.length === 0 && !packageTitle) return;
      try {
        await setDoc(doc(db, 'package_drafts', userData.id), {
          packageId,
          packageTitle,
          items,
          updatedAt: Date.now(),
          createdAt: items.length === 1 ? Date.now() : undefined
        }, { merge: true });
      } catch (e) {
        console.error("Napaka pri shranjevanju osnutka", e);
      }
    };
    const timer = setTimeout(saveDraft, 1000);
    return () => clearTimeout(timer);
  }, [items, packageTitle, isLoadingDraft, userData?.id]);
  
  const handleClearDraft = async () => {
    if (!userData?.id) return;
    if (confirm("Ste prepričani, da želite izbrisati celoten osnutek večpredmetne dražbe?")) {
        try {
            await deleteDoc(doc(db, 'package_drafts', userData.id));
            setItems([]);
            setPackageTitle("");
            setPackageId(crypto.randomUUID());
            toast.success("Osnutek je bil uspešno izbrisan.");
        } catch (e) {
            toast.error("Napaka pri brisanju osnutka.");
        }
    }
  };`;

content = content.replace(stateTarget, stateNew);
fs.writeFileSync('src/components/auction/CreatePackageForm.tsx', content);
