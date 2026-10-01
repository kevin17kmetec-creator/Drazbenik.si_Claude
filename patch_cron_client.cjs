const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /\/\/ Fire cron check on mount and every 5 minutes[\s\S]*?checkAuctionsCronAction\(\)\.catch\(console\.error\);\s*const cronInterval = setInterval\(\(\) => {\s*checkAuctionsCronAction\(\)\.catch\(console\.error\);\s*\}, 5 \* 60 \* 1000\);\s*return \(\) => clearInterval\(cronInterval\);/m;

const replacement = `// OPTIMIZACIJA: Odstranjen client-side cron. Vercel cron bo samodejno klical endpoint 1-krat na dan.`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', content);
