const fs = require('fs');
let content = fs.readFileSync('src/lib/translations.ts', 'utf8');

content = content.replace(
  'top10: "TOP 10 DRAŽB DNEVA",',
  'auctionPaid: "Dražba plačana",\n    top10: "TOP 10 DRAŽB DNEVA",'
);

content = content.replace(
  'top10: "TOP 10 AUCTIONS OF THE DAY",',
  'auctionPaid: "Auction Paid",\n    top10: "TOP 10 AUCTIONS OF THE DAY",'
);

content = content.replace(
  'top10: "TOP 10 AUKTIONEN DES TAGES",',
  'auctionPaid: "Auktion bezahlt",\n    top10: "TOP 10 AUKTIONEN DES TAGES",'
);

fs.writeFileSync('src/lib/translations.ts', content);
