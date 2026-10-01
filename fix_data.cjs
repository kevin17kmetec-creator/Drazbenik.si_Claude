const fs = require('fs');
let content = fs.readFileSync('src/server/app.ts', 'utf8');

content = content.replace(/}\s*const data = getDocSnapshotData\(auctionDoc\) \|\| {};\s*\/\/ VARNOSTNI PREGLED[\s\S]*?throw new Error\("Ne morete oddati ponudbe na lastno dražbo\."\);\s*}\s*const data = getDocSnapshotData\(auctionDoc\) \|\| {};/m, 
`}
      const data = getDocSnapshotData(auctionDoc) || {};
      
      // VARNOSTNI PREGLED (SECURITY PATCH): Preprečimo lastniku dražbe, da bi licitiral na lasten predmet (Shill bidding)
      if (data.seller_id === user_id || data.sellerId === user_id) {
        throw new Error("Ne morete oddati ponudbe na lastno dražbo.");
      }`);

fs.writeFileSync('src/server/app.ts', content);
