const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// The code is around:
// const currentUserUnsold = auctions.filter( ... ).filter(a => ... );
// Let's replace the content block for `case "myUnsold":` to perform grouping.

const regex = /const currentUserUnsold = auctions\.filter\([\s\S]*?\}\);/m;
const replacement = `const currentUserUnsoldRaw = auctions.filter(
        (a) =>
          (a.sellerId === userData.id ||
            (a as any).seller_id === userData.id) &&
          (a.status === "completed" || new Date(a.endTime) <= new Date()) &&
          (a.post_auction_status === "unsold" || a.post_auction_status === "unpaid" || a.post_auction_status === "failed_2nd" || a.post_auction_status === "rejected_2nd" || (!a.winnerId && !(a as any).winner_id)) &&
          (a as any).status !== "archived" && (a as any).status !== "deleted"
      ).filter(a => {
        // Must be within 1 month from end time to be shown here
        const endMs = new Date(a.endTime || (a as any).end_time).getTime();
        const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
        return (nowMs - endMs) <= oneMonthMs;
      });

      // Združevanje v pakete
      const currentUserUnsold: any[] = [];
      const packageMap = new Map<string, any>();
      
      currentUserUnsoldRaw.forEach(item => {
        const pId = item.package_id || (item as any).packageId;
        if (pId) {
          if (!packageMap.has(pId)) {
            packageMap.set(pId, { type: 'package', package_id: pId, items: [] });
          }
          packageMap.get(pId).items.push(item);
        } else {
          currentUserUnsold.push({ type: 'single', item });
        }
      });
      
      packageMap.forEach(pkg => {
        if (pkg.items.length >= 2) {
          currentUserUnsold.push(pkg);
        } else if (pkg.items.length === 1) {
          currentUserUnsold.push({ type: 'single', item: pkg.items[0] });
        }
      });
`;

let newContent = content.replace(regex, replacement);

fs.writeFileSync('src/App.tsx', newContent);
console.log(newContent !== content ? "Grouped successfully" : "Failed to replace");
