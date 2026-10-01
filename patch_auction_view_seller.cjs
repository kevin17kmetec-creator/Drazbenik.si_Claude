const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<AuctionView\s*item=\{auctions\.find\(a => a\.id === selectedItem\.id\) \|\| selectedItem\}\s*t=\{t\}/;
const replacement = `<AuctionView
            item={auctions.find(a => a.id === selectedItem.id) || selectedItem}
            t={t}
            onSellerClick={(sellerId) => {
              const itemToUse = auctions.find(a => a.id === selectedItem.id) || selectedItem;
              if ((itemToUse as any).seller) {
                 setSelectedSeller((itemToUse as any).seller);
                 setActiveView("sellerProfile");
              }
            }}`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', content);
console.log("Patched AuctionView prop");
