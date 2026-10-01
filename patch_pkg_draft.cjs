const fs = require('fs');
let content = fs.readFileSync('src/components/auction/CreatePackageForm.tsx', 'utf8');

const declRegex = /export const CreatePackageForm: React\.FC<any> = \(\{([\s\S]*?)\}\) => \{/;
content = content.replace(declRegex, "export const CreatePackageForm: React.FC<any> = ({ initialData, $1}) => {");

const loadRegex = /const loadDraft = async \(\) => \{[\s\S]*?\/\/ 1\. Synchronously read from localStorage/;
content = content.replace(loadRegex, 
`const loadDraft = async () => {
    setIsLoadingDraft(true);
    if (initialData && initialData.type === 'package' && initialData.items) {
       setPackageTitle(initialData.items[0]?.title?.SLO || "Neprodan paket");
       setItems(initialData.items);
       setIsLoadingDraft(false);
       return;
    }

    // 1. Synchronously read from localStorage`);

fs.writeFileSync('src/components/auction/CreatePackageForm.tsx', content);
console.log("Patched CreatePackageForm");
