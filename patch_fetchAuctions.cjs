const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const fetchAuctions = async \(\) => {[\s\S]*?console\.warn\("Manual fetch auctions warning:", e\);\s*\}\s*};/m;

const replacement = `const fetchAuctions = async () => {
    // OPTIMIZATION: Removed redundant manual getDocs calls. 
    // The active onSnapshot listener (unsubAuctions) already receives all real-time updates instantly.
    // This dramatically reduces Firebase reads and prevents UI blocking/lag.
  };`;

const newContent = content.replace(regex, replacement);

if (newContent !== content) {
    fs.writeFileSync('src/App.tsx', newContent);
    console.log("fetchAuctions patched successfully.");
} else {
    console.log("Could not find fetchAuctions to patch.");
}
