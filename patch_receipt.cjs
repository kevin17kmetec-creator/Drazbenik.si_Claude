const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const target = `  function handleReceiptConfirmSubmit() {
    setReceiptConfirmModal(prev => ({ ...prev, isOpen: false }));
    fetchAuctions();
  };`;

const replacement = `  async function handleReceiptConfirmSubmit() {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await confirmReceiptAction({ auction_id: receiptConfirmModal.auctionId }, token);
      if (res.success) {
        toast.success("Prejem uspešno potrjen. Sredstva so sproščena prodajalcu.");
      } else {
        toast.error(res.error || "Napaka pri potrditvi prejema.");
      }
    } catch (e) {
      toast.error("Napaka pri potrditvi prejema.");
    } finally {
      setReceiptConfirmModal(prev => ({ ...prev, isOpen: false }));
      fetchAuctions();
    }
  };`;

content = content.replace(target, replacement);

const importTarget = `  cancelSubscriptionAction
} from "@/src/actions/index";`;

const importNew = `  cancelSubscriptionAction,
  confirmReceiptAction
} from "@/src/actions/index";`;

content = content.replace(importTarget, importNew);

fs.writeFileSync('src/App.tsx', content);
