const fs = require('fs');
let content = fs.readFileSync('src/components/auction/CreateAuctionForm.tsx', 'utf8');

const target = `const defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() + 7);
    const defaultDateStr = getLocalDateStr(defaultEndDate);
    const defaultTimeStr = "20:00";`;

const replacement = `const defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() + 7);
    const defaultDateStr = getLocalDateStr(defaultEndDate);
    const nowLocal = new Date();
    const currentHour = String(nowLocal.getHours()).padStart(2, '0');
    const currentMinute = String(nowLocal.getMinutes()).padStart(2, '0');
    const defaultTimeStr = \`\${currentHour}:\${currentMinute}\`;`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/auction/CreateAuctionForm.tsx', content);
