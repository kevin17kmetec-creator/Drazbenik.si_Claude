const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<CreatePackageForm\s*onBack=\{\(\) => setCreateMode\("choice"\)\}/;
const replacement = `<CreatePackageForm
              initialData={republishData}
              onBack={() => { setCreateMode("choice"); setRepublishData(null); }}`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', content);
console.log("App.tsx prop updated");
