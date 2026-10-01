const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Fix the useEffect so it doesn't overwrite createMode when republishing
content = content.replace(
`  useEffect(() => {
    if (activeView !== "createAuction") {
      setCreateMode("choice");
    } else {
      const uid = userData?.id || 'guest';
      const stored = localStorage.getItem(\`drazbe_package_draft_\${uid}\`) || localStorage.getItem('drazbe_package_draft_latest');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const creationTime = parsed.createdAt || parsed.updatedAt || Date.now();
          if (Date.now() - creationTime <= 3 * 24 * 60 * 60 * 1000) {
            setCreateMode("package");
          }
        } catch (e) {}
      }
    }
  }, [activeView, userData?.id]);`,
`  useEffect(() => {
    if (activeView !== "createAuction") {
      setCreateMode("choice");
    } else {
      // Do not auto-switch to package draft if user is republishing
      if (republishData) return;
      const uid = userData?.id || 'guest';
      const stored = localStorage.getItem(\`drazbe_package_draft_\${uid}\`) || localStorage.getItem('drazbe_package_draft_latest');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const creationTime = parsed.createdAt || parsed.updatedAt || Date.now();
          if (Date.now() - creationTime <= 3 * 24 * 60 * 60 * 1000) {
            setCreateMode("package");
          }
        } catch (e) {}
      }
    }
  }, [activeView, userData?.id, republishData]);`
);

fs.writeFileSync('src/App.tsx', content);
