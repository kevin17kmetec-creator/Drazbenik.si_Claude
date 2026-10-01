const fs = require('fs');
let content = fs.readFileSync('src/server/app.ts', 'utf8');

const regex = /if \(itemData\) {\s*if \(itemData\.title\) itemData\.title = sanitizeString\(itemData\.title\);\s*if \(itemData\.description\) itemData\.description = sanitizeString\(itemData\.description\);\s*if \(itemData\.category\) itemData\.category = sanitizeString\(itemData\.category\);\s*if \(itemData\.region\) itemData\.region = sanitizeString\(itemData\.region\);\s*if \(itemData\.location\) itemData\.location = sanitizeString\(itemData\.location\);\s*}/;

const replacement = `if (itemData) {
      if (itemData.title) itemData.title = sanitizeString(itemData.title);
      if (itemData.description) itemData.description = sanitizeString(itemData.description);
      if (itemData.category) itemData.category = sanitizeString(itemData.category);
      if (itemData.region) itemData.region = sanitizeString(itemData.region);
      if (itemData.location) itemData.location = sanitizeString(itemData.location);
      
      // VARNOSTNI PREGLED (SECURITY PATCH): Preprečimo zlonameren vnos občutljivih polj
      delete itemData.winner_id;
      delete itemData.winnerId;
      delete itemData.top_bids;
      delete itemData.bidding_history;
      delete itemData.payment_status;
      delete itemData.post_auction_status;
    }`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/server/app.ts', content);
