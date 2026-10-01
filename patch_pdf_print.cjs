const fs = require('fs');

function patchFile(filepath, refName) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Replace html2canvas logic with a reliable print-based PDF generation
  const regex = /const canvas = await html2canvas[\s\S]*?pdf\.save[^;]*;/;
  const replacement = `// Instead of html2canvas which fails on some CSS, we use a hidden iframe or print window to generate a clean vector PDF
      const contentHtml = ${refName}.current.innerHTML;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(\`
          <html>
            <head>
              <title>Račun</title>
              <style>
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;900&display=swap');
                body {
                  font-family: 'Plus Jakarta Sans', sans-serif;
                  padding: 20px;
                  color: #0A1128;
                }
                * {
                  box-sizing: border-box;
                }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 12px; text-align: left; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .flex { display: flex; }
                .justify-between { justify-content: space-between; }
                .mb-10 { margin-bottom: 40px; }
                .mb-12 { margin-bottom: 48px; }
                .p-12 { padding: 48px; }
                .font-black { font-weight: 900; }
                .font-bold { font-weight: 700; }
                .text-sm { font-size: 14px; }
                .text-xs { font-size: 12px; }
                .uppercase { text-transform: uppercase; }
              </style>
            </head>
            <body>
              \${contentHtml}
              <script>
                window.onload = () => {
                  setTimeout(() => {
                    window.print();
                    window.close();
                  }, 500);
                };
              </script>
            </body>
          </html>
        \`);
        printWindow.document.close();
      }`;

  content = content.replace(regex, replacement);
  fs.writeFileSync(filepath, content);
}

patchFile('src/components/modals/InvoiceModal.tsx', 'invoiceRef');
patchFile('src/components/flow/TestSandboxView.tsx', 'invoicePreviewRef');

console.log("Patched PDF download");
