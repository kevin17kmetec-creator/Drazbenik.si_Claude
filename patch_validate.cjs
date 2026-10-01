const fs = require('fs');
let content = fs.readFileSync('src/components/auction/CreatePackageForm.tsx', 'utf8');

const validateTarget = `  const validateEndTime = (newItemEndTime: string) => {
      const newTime = new Date(newItemEndTime).getTime();
      if (isNaN(newTime)) throw new Error("Neveljaven čas dražbe.");
      
      const allTimes = items.map(i => new Date(i.endTime).getTime());
      
      // 1. Min 2-min gap
      for (const t of allTimes) {
          if (Math.abs(t - newTime) < 2 * 60 * 1000) {
              throw new Error("Dve dražbi ne smeta imeti iste ure zaključka. Razmik mora biti vsaj 2 minuti.");
          }
      }`;

const validateNew = `  const validateEndTime = (newItemEndTime: string) => {
      const newTime = new Date(newItemEndTime).getTime();
      if (isNaN(newTime)) throw new Error("Neveljaven čas dražbe.");
      
      const allTimes = items.map(i => new Date(i.endTime).getTime());
      allTimes.sort((a, b) => a - b);
      
      let correctedTimeStr = null;
      for (const t of allTimes) {
          if (Math.abs(t - newTime) < 2 * 60 * 1000) {
              // Find the next available time slot (+2 minutes from the highest)
              const highestTime = allTimes.length > 0 ? allTimes[allTimes.length - 1] : newTime;
              const nextAvailable = new Date(highestTime + 2 * 60 * 1000);
              
              const h = String(nextAvailable.getHours()).padStart(2, '0');
              const m = String(nextAvailable.getMinutes()).padStart(2, '0');
              correctedTimeStr = \`\${h}:\${m}\`;
              
              const err = new Error(\`Razmik mora biti vsaj 2 minuti. Ura je bila avtomatsko popravljena na \${correctedTimeStr}.\`);
              (err as any).correctedTimeStr = correctedTimeStr;
              throw err;
          }
      }`;

content = content.replace(validateTarget, validateNew);
fs.writeFileSync('src/components/auction/CreatePackageForm.tsx', content);
