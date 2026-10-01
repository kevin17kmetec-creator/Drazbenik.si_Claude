const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const replacement = `
        const currentEmail = userData?.email || auth.currentUser?.email || '';
        
        if (data.email && data.email !== currentEmail && auth.currentUser?.providerData.some(p => p.providerId === 'password')) {
          try {
             await fetch('/api/auth/send-email-change', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 email: currentEmail,
                 newEmail: data.email,
                 displayName: userData?.first_name || userData?.username || currentEmail
               })
             });
             toast.success("Na nov e-poštni naslov smo poslali potrditveno povezavo. Sledite ji za dokončanje spremembe.");
          } catch (e: any) {
             toast.error(\`Napaka pri pošiljanju potrditvenega e-poštnega sporočila: \${e.message}\`);
          }
        }

        const updateData: any = {
          email: currentEmail,
`;

const updatedContent = content.replace(
  /const currentEmail = userData\?\.email \|\| auth\.currentUser\?\.email \|\| '';\s*const updateData: any = {\s*email: currentEmail,/g,
  replacement
);

fs.writeFileSync('src/App.tsx', updatedContent);
