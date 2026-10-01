const fs = require('fs');
const content = fs.readFileSync('src/server/app.ts', 'utf8');

const regex = /if \(!isDocSnapshotExists\(auctionDoc\)\) {\s*throw new Error\("Dražba ne obstaja\."\);\s*}/;
const replacement = `if (!isDocSnapshotExists(auctionDoc)) {
        throw new Error("Dražba ne obstaja.");
      }
      const data = getDocSnapshotData(auctionDoc) || {};
      
      // VARNOSTNI PREGLED (SECURITY PATCH): Preprečimo lastniku dražbe, da bi licitiral na lasten predmet (Shill bidding)
      if (data.seller_id === user_id || data.sellerId === user_id) {
        throw new Error("Ne morete oddati ponudbe na lastno dražbo.");
      }
`;

const newContent = content.replace(regex, replacement);

if (newContent !== content) {
    fs.writeFileSync('src/server/app.ts', newContent);
    console.log("place bid patched successfully.");
} else {
    console.log("Could not find place bid to patch.");
}
