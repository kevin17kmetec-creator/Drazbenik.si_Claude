const fs = require('fs');
let content = fs.readFileSync('src/server/app.ts', 'utf8');

// Revert the wrong patch
content = content.replace(/    \/\/ VARNOSTNI PREGLED \(SECURITY PATCH\): Preprečimo zlonameren vnos občutljivih polj\s*if \(itemData\) {\s*delete itemData\.winner_id;\s*delete itemData\.winnerId;\s*delete itemData\.top_bids;\s*delete itemData\.bidding_history;\s*delete itemData\.payment_status;\s*delete itemData\.post_auction_status;\s*}\s*const userDoc = await safeGetDoc\(adminDb\.collection\('users'\)\.doc\(user_id\)\);/m, 
"const userDoc = await safeGetDoc(adminDb.collection('users').doc(user_id));");

fs.writeFileSync('src/server/app.ts', content);
