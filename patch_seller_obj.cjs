const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /sellerName: d\.sellerName \|\| sellerName,/;
const replacement = `sellerName: d.sellerName || sellerName,
          seller: { id: d.seller_id || d.sellerId, name: { SLO: sellerName }, photoURL: seller.photoURL || seller.photoUrl || seller.photo_url || null, created_at: seller.created_at || seller.createdAt, sold_count: seller.sold_count, unpaid_penalties: seller.unpaid_penalties },`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', content);
