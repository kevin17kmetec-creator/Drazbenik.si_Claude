const fs = require('fs');
let content = fs.readFileSync('src/lib/pdfGenerator.ts', 'utf8');

// I will completely replace generateInvoicePDF with a nicely styled version.

// Need to match export async function generateInvoicePDF(...): Promise<Buffer> { ... }
const regex = /export async function generateInvoicePDF[\s\S]*?export async function generateCertificatePDF/m;

const replacement = `export async function generateInvoicePDF(
  transaction: any,
  buyer: any,
  seller: any,
  auction: any,
  salesInvoiceNo?: string,
  commissionInvoiceNo?: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers: Buffer[] = [];

    const regularFont = getFontPath('Roboto-Regular.ttf');
    const boldFont = getFontPath('Roboto-Bold.ttf');

    if (regularFont && boldFont) {
      doc.registerFont('Roboto', regularFont);
      doc.registerFont('Roboto-Bold', boldFont);
      doc.font('Roboto');
    }

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    const isSellerBusiness = seller.company_status === 'company' || seller.user_type === 'business' || seller.isCompany;
    const isBuyerBusiness = buyer.company_status === 'company' || buyer.user_type === 'business' || buyer.isCompany;
    const isB2C = isSellerBusiness && !isBuyerBusiness;
    const isB2B = isSellerBusiness && isBuyerBusiness;
    const isC2B = !isSellerBusiness && isBuyerBusiness;

    const documentTitle = isSellerBusiness ? 'RAČUN / INVOICE' : 'KUPOPRODAJNA POGODBA';
    const docNo = salesInvoiceNo || \`INV-\${(transaction.id || '').substring(0, 8).toUpperCase()}\`;
    const todayStr = new Date().toLocaleDateString('sl-SI');

    const primaryColor = '#0A1128';
    const secondaryColor = '#64748B';
    const accentColor = '#FEBA4F';
    const borderColor = '#E2E8F0';

    const drawHeader = (title: string, subtitle: string) => {
      doc.rect(0, 0, doc.page.width, 100).fill(primaryColor);
      
      if (boldFont) doc.font('Roboto-Bold');
      doc.fillColor(accentColor).fontSize(24).text('Drazba.si', 50, 40);
      
      doc.fillColor('#FFFFFF').fontSize(20).text(title, 50, 35, { align: 'right' });
      if (regularFont) doc.font('Roboto');
      doc.fontSize(10).fillColor('#94A3B8').text(subtitle, 50, 65, { align: 'right' });
    };

    // PAGE 1: SELLER -> BUYER (Sales Invoice or Contract)
    drawHeader(documentTitle, \`Št. dokumenta: \${docNo}  |  Datum: \${todayStr}\`);

    // Reset position and color
    doc.y = 130;
    doc.fillColor(primaryColor);

    // Addresses
    const sellerTaxId = seller.tax_id || seller.taxId || seller.vat_id || seller.vatId;
    const buyerTaxId = buyer.tax_id || buyer.taxId || buyer.vat_id || buyer.vatId;

    if (boldFont) doc.font('Roboto-Bold');
    doc.fontSize(10).fillColor(secondaryColor).text('PRODAJALEC / SELLER:', 50, doc.y);
    doc.text('KUPEC / BUYER:', 300, doc.y);
    
    doc.moveDown(0.5);
    doc.fillColor(primaryColor).fontSize(12);
    
    let currentY = doc.y;
    
    // Seller Details
    if (isSellerBusiness) {
      doc.text(seller.company_name || 'N/A', 50, currentY);
      doc.text(seller.address || 'Naslov ni na voljo', 50, currentY + 15);
      if (sellerTaxId) doc.text(\`Davčna št.: \${sellerTaxId}\`, 50, currentY + 30);
    } else {
      doc.text(\`\${seller.first_name || ''} \${seller.last_name || ''}\`.trim() || seller.name || 'Neznan', 50, currentY);
      if (seller.address) doc.text(seller.address, 50, currentY + 15);
    }

    // Buyer Details
    if (isBuyerBusiness) {
      doc.text(buyer.company_name || 'N/A', 300, currentY);
      doc.text(\`\${buyer.first_name || ''} \${buyer.last_name || ''}\`.trim(), 300, currentY + 15);
      doc.text(buyer.address || 'Naslov ni na voljo', 300, currentY + 30);
      if (buyerTaxId) doc.text(\`Davčna št.: \${buyerTaxId}\`, 300, currentY + 45);
    } else {
      doc.text(\`\${buyer.first_name || ''} \${buyer.last_name || ''}\`.trim() || buyer.name || 'Neznan', 300, currentY);
      if (buyer.address) doc.text(buyer.address, 300, currentY + 15);
    }

    doc.y = Math.max(doc.y, currentY + 70);
    doc.moveDown(2);

    // Table Header
    doc.rect(50, doc.y, doc.page.width - 100, 2).fill(primaryColor);
    doc.moveDown(0.5);
    doc.fillColor(primaryColor);
    if (boldFont) doc.font('Roboto-Bold');
    doc.fontSize(10);
    doc.text('Opis', 50, doc.y, { continued: true });
    doc.text('Količina', 300, doc.y, { width: 50, align: 'center', continued: true });
    doc.text('Cena (€)', 380, doc.y, { width: 60, align: 'right', continued: true });
    doc.text('Skupaj (€)', 470, doc.y, { width: 75, align: 'right' });
    doc.moveDown(0.5);
    
    // Table Line
    doc.rect(50, doc.y, doc.page.width - 100, 1).fill(borderColor);
    doc.moveDown();

    // Table Row
    const itemAmount = Number(transaction.amount_total || (auction?.currentBid || auction?.current_price || auction?.buy_now_price || transaction.item_amount || 0));
    const isVatApplicable = isB2C || isB2B;
    const vatRate = 0.22;
    const vatBase = isVatApplicable ? itemAmount / (1 + vatRate) : itemAmount;
    const vatVal = isVatApplicable ? itemAmount - vatBase : 0;

    if (boldFont) doc.font('Roboto-Bold');
    doc.fillColor(primaryColor).fontSize(11).text(auction?.title?.SLO || auction?.title?.EN || 'Dražbeni predmet', 50, doc.y, { width: 240, continued: true });
    
    if (regularFont) doc.font('Roboto');
    doc.fontSize(10);
    doc.text('1', 300, doc.y, { width: 50, align: 'center', continued: true });
    doc.text(itemAmount.toFixed(2), 380, doc.y, { width: 60, align: 'right', continued: true });
    doc.text(itemAmount.toFixed(2), 470, doc.y, { width: 75, align: 'right' });
    
    doc.moveDown(0.5);
    doc.fillColor(secondaryColor).fontSize(8).text(\`ID dražbe: \${auction?.id || 'N/A'}\`, 50, doc.y);
    doc.moveDown(0.5);
    
    // Delivery note
    doc.rect(50, doc.y, doc.page.width - 100, 20).fill('#F8FAFC');
    doc.fillColor(secondaryColor).fontSize(9).text(\`Način predaje: \${auction?.delivery_method === 'post' ? 'Pošiljanje po pošti' : auction?.delivery_method === 'pickup' ? 'Osebni prevzem' : 'Po dogovoru'}\`, 55, doc.y - 15, { font: 'Roboto-Italic' });
    
    doc.rect(50, doc.y, doc.page.width - 100, 1).fill(borderColor);
    doc.moveDown(2);

    // Totals
    const rightAlignStart = doc.page.width - 250;
    
    if (isVatApplicable) {
      doc.fillColor(secondaryColor).fontSize(10).text('Osnova za DDV (22%):', rightAlignStart, doc.y, { width: 120, continued: true });
      if (boldFont) doc.font('Roboto-Bold');
      doc.fillColor(primaryColor).text(\`\${vatBase.toFixed(2)} €\`, rightAlignStart + 120, doc.y, { width: 80, align: 'right' });
      doc.moveDown(0.5);
      
      doc.rect(rightAlignStart, doc.y, 200, 1).fill(borderColor);
      doc.moveDown(0.5);
      
      if (regularFont) doc.font('Roboto');
      doc.fillColor(secondaryColor).text('Znesek DDV (22%):', rightAlignStart, doc.y, { width: 120, continued: true });
      if (boldFont) doc.font('Roboto-Bold');
      doc.fillColor(primaryColor).text(\`\${vatVal.toFixed(2)} €\`, rightAlignStart + 120, doc.y, { width: 80, align: 'right' });
      doc.moveDown(0.5);
    } else {
      doc.fillColor(secondaryColor).fontSize(10).text('Kupnina / Znesek:', rightAlignStart, doc.y, { width: 120, continued: true });
      if (boldFont) doc.font('Roboto-Bold');
      doc.fillColor(primaryColor).text(\`\${itemAmount.toFixed(2)} €\`, rightAlignStart + 120, doc.y, { width: 80, align: 'right' });
      doc.moveDown(0.5);
      
      doc.rect(rightAlignStart, doc.y, 200, 1).fill(borderColor);
      doc.moveDown(0.5);
      
      if (regularFont) doc.font('Roboto');
      doc.fillColor(secondaryColor).text('DDV:', rightAlignStart, doc.y, { width: 120, continued: true });
      if (boldFont) doc.font('Roboto-Bold');
      doc.fillColor(primaryColor).text('Ni obračunan', rightAlignStart + 120, doc.y, { width: 80, align: 'right' });
      doc.moveDown(0.5);
    }
    
    doc.rect(rightAlignStart, doc.y, 200, 2).fill(primaryColor);
    doc.moveDown(0.5);
    
    if (boldFont) doc.font('Roboto-Bold');
    doc.fontSize(12).text(isVatApplicable ? 'Skupaj za plačilo:' : 'Za plačilo:', rightAlignStart, doc.y, { width: 120, continued: true });
    doc.text(\`\${itemAmount.toFixed(2)} €\`, rightAlignStart + 120, doc.y, { width: 80, align: 'right' });
    
    // Legal notes (Footer)
    doc.y = doc.page.height - 180;
    doc.rect(50, doc.y, doc.page.width - 100, 1).fill(borderColor);
    doc.moveDown();
    
    if (regularFont) doc.font('Roboto');
    doc.fillColor(secondaryColor).fontSize(8);
    
    if (isB2C) {
      doc.text('• Jamstvo za neskladnost blaga (ZVPot-1): Za blago veljajo zakonska jamstva za neskladnost blaga v skladu z ZVPot-1.');
      doc.text('• Prenos lastništva: Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.');
      doc.text('• Izjava o DDV: V ceno je vključen 22% DDV v skladu z Zakonom o davku na dodano vrednost (ZDDV-1).');
    } else if (isB2B) {
      doc.text('• Izjava o DDV in stanje opreme: V ceno je vključen 22% DDV v skladu z ZDDV-1. Za rabljeno opremo velja dogovorjeno stanje ob prevzemu (videno-kupljeno).');
      doc.text('• Prenos lastništva: Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.');
    } else if (isC2B) {
      doc.text('• Videno-kupljeno: Predmet se prodaja po načelu "videno-kupljeno". Prodajalec ne odgovarja za stvarne napake predmeta po njegovem prevzemu.');
      doc.text('• Prenos lastništva: Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.');
      doc.text('• Pravna opomba in DDV: Prodajalec je fizična oseba (C2B). DDV se v skladu z ZDDV-1 ne obračunava. Dokument služi kot kupoprodajna pogodba in dokazilo o plačilu.');
    } else {
      doc.text('• Videno-kupljeno: Predmet se prodaja po načelu "videno-kupljeno". Prodajalec ne odgovarja za stvarne napake predmeta po njegovem prevzemu.');
      doc.text('• Prenos lastništva: Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.');
      doc.text('• Izjava o DDV: Prodajalec je fizična oseba in ni davčni zavezanec po Zakonu o davku na dodano vrednost (ZDDV-1), zato DDV ni obračunan.');
    }
    
    doc.moveDown(0.5);
    doc.fillColor('#94A3B8').fontSize(7).text('Platforma dražbenik.si nastopa izključno kot tehnološki posrednik in ni stranka v prodajni pogodbi. Ta dokument služi kot kupoprodajna pogodba in potrdilo o sklenjenem poslu ter plačilu med prodajalcem in kupcem, generirano samodejno s strani sistema po uspešnem zaključku dražbe.');

    // ==========================================
    // PAGE 2: INVOICE FOR PLATFORM FEE (Platform -> Buyer)
    // ==========================================
    doc.addPage();
    const feeDocNo = commissionInvoiceNo || \`FEE-\${(transaction.id || '').substring(0, 8).toUpperCase()}\`;
    
    drawHeader('RAČUN ZA STORITEV', \`Št. računa: \${feeDocNo}  |  Datum: \${todayStr}\`);
    
    doc.y = 130;
    
    if (boldFont) doc.font('Roboto-Bold');
    doc.fontSize(10).fillColor(secondaryColor).text('IZDAJATELJ / ISSUER:', 50, doc.y);
    doc.text('PREJEMNIK / RECIPIENT:', 300, doc.y);
    
    doc.moveDown(0.5);
    doc.fillColor(primaryColor).fontSize(12);
    
    currentY = doc.y;
    
    // Platform
    doc.text('Dizain d.o.o.', 50, currentY);
    doc.text('Karantanska ulica 28, 2000 Maribor', 50, currentY + 15);
    doc.text('Davčna št. / VAT ID: SI57008060', 50, currentY + 30);
    doc.text('Matična št. / Reg. No.: 9093494000', 50, currentY + 45);
    
    // Buyer
    if (isBuyerBusiness) {
      doc.text(buyer.company_name || 'N/A', 300, currentY);
      doc.text(\`\${buyer.first_name || ''} \${buyer.last_name || ''}\`.trim(), 300, currentY + 15);
      doc.text(buyer.address || 'Naslov ni na voljo', 300, currentY + 30);
      if (buyerTaxId) doc.text(\`Davčna št.: \${buyerTaxId}\`, 300, currentY + 45);
    } else {
      doc.text(\`\${buyer.first_name || ''} \${buyer.last_name || ''}\`.trim() || buyer.name || 'Neznan', 300, currentY);
      if (buyer.address) doc.text(buyer.address, 300, currentY + 15);
    }
    
    doc.y = Math.max(doc.y, currentY + 70);
    doc.moveDown(2);
    
    // Status
    const paymentMethodText = transaction.payment_method === 'wallet' ? 'Sredstva na dražbenik.si (Wallet)' : 'Spletno plačilo / Kartica';
    const paidAtDateStr = transaction.paid_at ? new Date(transaction.paid_at).toLocaleDateString('sl-SI') : todayStr;
    
    doc.rect(50, doc.y, doc.page.width - 100, 40).fill('#F0FDF4');
    doc.fillColor('#166534').fontSize(10);
    if (boldFont) doc.font('Roboto-Bold');
    doc.text(\`STATUS PLAČILA: PLAČANO (\${paidAtDateStr})\`, 65, doc.y - 30);
    if (regularFont) doc.font('Roboto');
    doc.text(\`Način plačila: \${paymentMethodText}\`, 65, doc.y - 15);
    
    doc.y += 20;

    // Table Header
    doc.rect(50, doc.y, doc.page.width - 100, 2).fill(primaryColor);
    doc.moveDown(0.5);
    doc.fillColor(primaryColor);
    if (boldFont) doc.font('Roboto-Bold');
    doc.fontSize(10);
    doc.text('Opis storitve', 50, doc.y, { continued: true });
    doc.text('Cena (€)', 380, doc.y, { width: 60, align: 'right', continued: true });
    doc.text('Skupaj (€)', 470, doc.y, { width: 75, align: 'right' });
    doc.moveDown(0.5);
    
    // Table Line
    doc.rect(50, doc.y, doc.page.width - 100, 1).fill(borderColor);
    doc.moveDown();

    // Table Row
    const feeAmount = transaction.platform_fee || 0;
    const feeVatAmount = transaction.vat_amount || 0;
    const feeTotalAmount = feeAmount + feeVatAmount;
    
    if (boldFont) doc.font('Roboto-Bold');
    doc.fillColor(primaryColor).fontSize(11).text(\`Provizija platforme za uporabo sistema (Dražba: \${auction?.title?.SLO || 'Neznano'})\`, 50, doc.y, { width: 300, continued: true });
    if (regularFont) doc.font('Roboto');
    doc.fontSize(10).text(feeAmount.toFixed(2), 380, doc.y, { width: 60, align: 'right', continued: true });
    doc.text(feeAmount.toFixed(2), 470, doc.y, { width: 75, align: 'right' });
    
    doc.moveDown(2);

    // Totals
    const rightAlignStart2 = doc.page.width - 250;
    
    doc.fillColor(secondaryColor).fontSize(10).text('Osnova (Base):', rightAlignStart2, doc.y, { width: 120, continued: true });
    if (boldFont) doc.font('Roboto-Bold');
    doc.fillColor(primaryColor).text(\`\${feeAmount.toFixed(2)} €\`, rightAlignStart2 + 120, doc.y, { width: 80, align: 'right' });
    doc.moveDown(0.5);
    
    doc.rect(rightAlignStart2, doc.y, 200, 1).fill(borderColor);
    doc.moveDown(0.5);
    
    if (transaction.is_reverse_charge) {
      if (regularFont) doc.font('Roboto');
      doc.fillColor(secondaryColor).text('DDV (0% - Reverse Charge):', rightAlignStart2, doc.y, { width: 140, continued: true });
      if (boldFont) doc.font('Roboto-Bold');
      doc.fillColor(primaryColor).text('0.00 €', rightAlignStart2 + 120, doc.y, { width: 80, align: 'right' });
      doc.moveDown();
      doc.fillColor(secondaryColor).fontSize(8).text('Obrnjena davčna obveznost v skladu z 1. točko 25. člena ZDDV-1.', rightAlignStart2, doc.y, { width: 200, align: 'right' });
    } else {
      if (regularFont) doc.font('Roboto');
      doc.fillColor(secondaryColor).text(\`DDV (\${transaction.vat_rate || 22}%):\`, rightAlignStart2, doc.y, { width: 120, continued: true });
      if (boldFont) doc.font('Roboto-Bold');
      doc.fillColor(primaryColor).text(\`\${feeVatAmount.toFixed(2)} €\`, rightAlignStart2 + 120, doc.y, { width: 80, align: 'right' });
    }
    doc.moveDown(0.5);
    
    doc.rect(rightAlignStart2, doc.y, 200, 2).fill(primaryColor);
    doc.moveDown(0.5);
    
    if (boldFont) doc.font('Roboto-Bold');
    doc.fontSize(12).text('SKUPAJ ZA PLAČILO:', rightAlignStart2, doc.y, { width: 120, continued: true });
    doc.text(\`\${feeTotalAmount.toFixed(2)} €\`, rightAlignStart2 + 120, doc.y, { width: 80, align: 'right' });

    doc.end();
  });
}
export async function generateCertificatePDF`;

let newContent = content.replace(regex, replacement);
fs.writeFileSync('src/lib/pdfGenerator.ts', newContent);
console.log(newContent !== content ? "Upgraded pdfGenerator.ts layout" : "Failed");
