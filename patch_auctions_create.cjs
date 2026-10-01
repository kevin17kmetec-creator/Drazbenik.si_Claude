const fs = require('fs');
const content = fs.readFileSync('src/server/app.ts', 'utf8');

const regex = /const userDoc = await safeGetDoc\(adminDb\.collection\('users'\)\.doc\(user_id\)\);/;
const replacement = `
    // VARNOSTNI PREGLED (SECURITY PATCH): Preprečimo zlonameren vnos občutljivih polj
    if (itemData) {
      delete itemData.winner_id;
      delete itemData.winnerId;
      delete itemData.top_bids;
      delete itemData.bidding_history;
      delete itemData.payment_status;
      delete itemData.post_auction_status;
    }
    
    const userDoc = await safeGetDoc(adminDb.collection('users').doc(user_id));`;

const newContent = content.replace(regex, replacement);

if (newContent !== content) {
    fs.writeFileSync('src/server/app.ts', newContent);
    console.log("auctions create patched successfully.");
} else {
    console.log("Could not find auctions create to patch.");
}
