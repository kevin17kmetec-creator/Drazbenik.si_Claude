const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const target = '  useEffect(() => {\n    if (activeView === "createAuction") {';
const replacement = `  useEffect(() => {
    if (activeView !== "createAuction") {
      setCreateMode("choice");
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView === "createAuction") {`;

content = content.replace(target, replacement);
fs.writeFileSync('src/App.tsx', content);
