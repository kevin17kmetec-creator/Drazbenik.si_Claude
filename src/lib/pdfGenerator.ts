import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

let cachedRegularFont: Buffer | null = null;
let cachedBoldFont: Buffer | null = null;

function loadFontBuffer(filename: string): Buffer | null {
  const searchPaths = [
    path.join(process.cwd(), 'public', 'fonts', filename),
    path.join(process.cwd(), 'dist', 'fonts', filename),
    path.join(__dirname, '..', '..', 'public', 'fonts', filename),
    path.join(__dirname, '..', 'public', 'fonts', filename),
    path.join(__dirname, 'public', 'fonts', filename),
    path.join(__dirname, 'fonts', filename),
    path.resolve('public', 'fonts', filename),
    path.resolve('dist', 'fonts', filename),
    path.resolve('/app/applet/public/fonts', filename)
  ];

  for (const p of searchPaths) {
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        if (buf && buf.length > 1000) {
          return buf;
        }
      }
    } catch {
      // Continue search
    }
  }
  return null;
}

function getRegularFont(): Buffer | null {
  if (!cachedRegularFont) {
    cachedRegularFont = loadFontBuffer('Roboto-Regular.ttf');
  }
  return cachedRegularFont;
}

function getBoldFont(): Buffer | null {
  if (!cachedBoldFont) {
    cachedBoldFont = loadFontBuffer('Roboto-Bold.ttf');
  }
  return cachedBoldFont;
}

function formatEuro(amount: number): string {
  const num = isNaN(amount) ? 0 : amount;
  return num.toLocaleString('sl-SI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getSafeAddress(user: any): string {
  if (!user) return 'Naslov ni na voljo';
  if (typeof user === 'string') return user;

  const street = user.street_address || user.company_street || user.companyStreet || user.address || user.street || '';
  const postal = user.postal_code || user.company_postal_code || user.companyPostalCode || user.postalCode || user.zip || '';
  const city = user.city || user.company_city || user.companyCity || user.place || '';

  if (street && postal && city) {
    return `${street}, ${postal} ${city}`;
  } else if (street && city) {
    return `${street}, ${city}`;
  } else if (street) {
    return street;
  } else if (city) {
    return city;
  }
  return user.address || 'Naslov ni na voljo';
}

function getSafePlace(user: any): string {
  if (!user) return 'Maribor, Slovenija';
  let raw = user.company_city || user.companyCity || user.city || user.place || '';
  if (!raw && user.address) {
    const parts = user.address.split(',');
    if (parts.length > 1) {
      raw = parts[parts.length - 1].trim();
      if (raw.toLowerCase() === 'slovenija' && parts.length > 2) {
        raw = parts[parts.length - 2].trim();
      }
    } else {
      raw = user.address;
    }
  }
  let cleaned = (raw || 'Maribor')
    .replace(/SI-?\s*\d{4}/gi, '')
    .replace(/\b\d{4}\b/g, '')
    .trim()
    .replace(/^,\s*|,\s*$/g, '');

  if (!cleaned) cleaned = 'Maribor';
  if (!cleaned.toLowerCase().includes('slovenija')) {
    cleaned = `${cleaned}, Slovenija`;
  }
  return cleaned;
}

export async function generateInvoicePDF(
  transaction: any = {},
  buyer: any = {},
  seller: any = {},
  auction: any = {},
  salesInvoiceNo?: string,
  commissionInvoiceNo?: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers: Buffer[] = [];

    const regBuf = getRegularFont();
    const boldBuf = getBoldFont();
    const hasCustomFonts = Boolean(regBuf && boldBuf);

    if (hasCustomFonts) {
      doc.registerFont('Roboto', regBuf!);
      doc.registerFont('Roboto-Bold', boldBuf!);
      doc.font('Roboto');
    }

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });
    doc.on('error', (err) => reject(err));

    // Data normalizations
    const activeBuyer = transaction.buyer_snapshot || buyer || {};
    const activeSeller = transaction.seller_snapshot || seller || {};

    const sType = activeSeller.user_type || activeSeller.userType || 'individual';
    const isSellerBusiness = sType === 'business';
    const sellerVatStatus = activeSeller.vat_status || activeSeller.vatStatus || (isSellerBusiness ? 'exempt_small' : 'private');

    const bType = activeBuyer.user_type || activeBuyer.userType || 'individual';
    const isBuyerBusiness = bType === 'business';

    let relationship = 'C2C';
    if (isSellerBusiness && isBuyerBusiness) relationship = 'B2B';
    else if (isSellerBusiness && !isBuyerBusiness) relationship = 'B2C';
    else if (!isSellerBusiness && isBuyerBusiness) relationship = 'C2B';

    // Helper to format address
    const getSafeAddressLoc = (u: any) => {
      if (!u) return 'Naslov ni na voljo';
      if (typeof u === 'string') return u;
      const street = u.street_address || u.street || u.company_street || u.companyStreet || u.address || '';
      const postal = u.postal_code || u.postalCode || u.company_postal_code || u.companyPostalCode || u.zip || '';
      const city = u.city || u.company_city || u.companyCity || u.place || '';
      if (street && postal && city) return `${street}, ${postal} ${city}`;
      if (street && city) return `${street}, ${city}`;
      if (street) return street;
      if (city) return city;
      return u.address || 'Naslov ni na voljo';
    };

    // Required fields check:
    const checkRequiredFields = () => {
      const missing: string[] = [];
      const isEmpty = (v: any) => !v || String(v).trim().length === 0;

      // Seller validation
      if (relationship === 'C2C' || relationship === 'C2B') {
        const sName = `${activeSeller.first_name || activeSeller.firstName || ''} ${activeSeller.last_name || activeSeller.lastName || ''}`.trim() || activeSeller.name || '';
        if (isEmpty(sName)) missing.push('seller.name');
        
        const sAddress = getSafeAddressLoc(activeSeller);
        if (isEmpty(sAddress) || sAddress === 'Naslov ni na voljo') missing.push('seller.address');
        
        const sPostal = activeSeller.postal_code || activeSeller.postalCode || '';
        if (isEmpty(sPostal)) missing.push('seller.postal_code');
        
        const sCity = activeSeller.city || '';
        if (isEmpty(sCity)) missing.push('seller.city');
        
        const sCountry = activeSeller.country_code || activeSeller.countryCode || activeSeller.country || '';
        if (isEmpty(sCountry)) missing.push('seller.country_code');
      } else {
        const sCompName = activeSeller.company_name || activeSeller.companyName || '';
        if (isEmpty(sCompName)) missing.push('seller.company_name');
        
        const sAddress = getSafeAddressLoc(activeSeller);
        if (isEmpty(sAddress) || sAddress === 'Naslov ni na voljo') missing.push('seller.address');
        
        const sPostal = activeSeller.postal_code || activeSeller.postalCode || activeSeller.company_postal_code || activeSeller.companyPostalCode || '';
        if (isEmpty(sPostal)) missing.push('seller.postal_code');
        
        const sCity = activeSeller.city || activeSeller.company_city || activeSeller.companyCity || '';
        if (isEmpty(sCity)) missing.push('seller.city');
        
        const sCountry = activeSeller.country_code || activeSeller.countryCode || activeSeller.country || '';
        if (isEmpty(sCountry)) missing.push('seller.country_code');
        
        const sReg = activeSeller.registration_number || activeSeller.regNumber || activeSeller.registrationNumber || '';
        if (isEmpty(sReg)) missing.push('seller.registration_number');
        
        const sTax = activeSeller.tax_id || activeSeller.taxId || activeSeller.tax_number || activeSeller.taxNumber || '';
        if (isEmpty(sTax)) missing.push('seller.tax_id');
        
        if (sellerVatStatus === 'payer') {
          const sVat = activeSeller.vat_id || activeSeller.vatId || '';
          if (isEmpty(sVat)) missing.push('seller.vat_id');
        }
      }

      // Buyer validation
      if (relationship === 'C2C' || relationship === 'B2C') {
        const bName = `${activeBuyer.first_name || activeBuyer.firstName || ''} ${activeBuyer.last_name || activeBuyer.lastName || ''}`.trim() || activeBuyer.name || '';
        if (isEmpty(bName)) missing.push('buyer.name');
        
        const bAddress = getSafeAddressLoc(activeBuyer);
        if (isEmpty(bAddress) || bAddress === 'Naslov ni na voljo') missing.push('buyer.address');
        
        const bPostal = activeBuyer.postal_code || activeBuyer.postalCode || '';
        if (isEmpty(bPostal)) missing.push('buyer.postal_code');
        
        const bCity = activeBuyer.city || '';
        if (isEmpty(bCity)) missing.push('buyer.city');
        
        const bCountry = activeBuyer.country_code || activeBuyer.countryCode || activeBuyer.country || '';
        if (isEmpty(bCountry)) missing.push('buyer.country_code');
      } else {
        const bCompName = activeBuyer.company_name || activeBuyer.companyName || '';
        if (isEmpty(bCompName)) missing.push('buyer.company_name');
        
        const bAddress = getSafeAddressLoc(activeBuyer);
        if (isEmpty(bAddress) || bAddress === 'Naslov ni na voljo') missing.push('buyer.address');
        
        const bPostal = activeBuyer.postal_code || activeBuyer.postalCode || activeBuyer.company_postal_code || activeBuyer.companyPostalCode || '';
        if (isEmpty(bPostal)) missing.push('buyer.postal_code');
        
        const bCity = activeBuyer.city || activeBuyer.company_city || activeBuyer.companyCity || '';
        if (isEmpty(bCity)) missing.push('buyer.city');
        
        const bCountry = activeBuyer.country_code || activeBuyer.countryCode || activeBuyer.country || '';
        if (isEmpty(bCountry)) missing.push('buyer.country_code');
        
        const bTax = activeBuyer.tax_id || activeBuyer.taxId || activeBuyer.tax_number || activeBuyer.taxNumber || '';
        if (isEmpty(bTax)) missing.push('buyer.tax_id');
        
        const bReg = activeBuyer.registration_number || activeBuyer.regNumber || activeBuyer.registrationNumber || '';
        if (isEmpty(bReg)) missing.push('buyer.registration_number');
      }

      return missing;
    };

    const missingFields = checkRequiredFields();
    if (missingFields.length > 0) {
      reject(new Error(`MISSING_REQUIRED_INVOICE_FIELDS: ${missingFields.join(', ')}`));
      return;
    }

    const docNo = salesInvoiceNo || `INV-${(transaction.id || auction.id || '000000').substring(0, 8).toUpperCase()}`;
    const todayStr = new Date().toLocaleDateString('sl-SI');
    const paymentDate = auction.paid_at ? new Date(auction.paid_at).toLocaleDateString('sl-SI') : todayStr;

    const sellerName = isSellerBusiness 
      ? (activeSeller.company_name || activeSeller.companyName || 'Prodajalec d.o.o.')
      : `${activeSeller.first_name || activeSeller.firstName || ''} ${activeSeller.last_name || activeSeller.lastName || ''}`.trim() || 'Prodajalec';

    const buyerName = isBuyerBusiness
      ? (activeBuyer.company_name || activeBuyer.companyName || 'Kupec d.o.o.')
      : `${activeBuyer.first_name || activeBuyer.firstName || ''} ${activeBuyer.last_name || activeBuyer.lastName || ''}`.trim() || 'Kupec';

    const sellerAddress = getSafeAddressLoc(activeSeller);
    const buyerAddress = getSafeAddressLoc(activeBuyer);
    const sellerPlace = getSafePlace(activeSeller);

    const sellerTaxId = activeSeller.tax_id || activeSeller.taxId || activeSeller.vat_id || activeSeller.vatId || '';
    const sellerRegNo = activeSeller.registration_number || activeSeller.regNumber || activeSeller.registrationNumber || '';

    const buyerTaxId = activeBuyer.tax_id || activeBuyer.taxId || activeBuyer.vat_id || activeBuyer.vatId || '';
    const buyerRegNo = activeBuyer.registration_number || activeBuyer.regNumber || activeBuyer.registrationNumber || '';

    const itemPrice = Number(transaction.item_price ?? (transaction.item_amount ?? (transaction.item_cents ? transaction.item_cents / 100 : (auction.currentBid || auction.current_price || 0))));

    let vatRate = 0;
    let vatAmount = 0;
    let vatBase = itemPrice;
    let isVatApplicable = false;
    let noteText = '';
    let isReverseCharge = false;

    const buyerCountry = (activeBuyer.country_code || activeBuyer.countryCode || activeBuyer.country || 'SI').trim().toUpperCase();

    if (relationship === 'C2C' || relationship === 'C2B') {
      vatRate = 0;
      vatAmount = 0;
      vatBase = itemPrice;
      isVatApplicable = false;
      noteText = 'DDV ni obračunan (prodajalec je fizična oseba).';
    } else {
      if (sellerVatStatus === 'payer') {
        isVatApplicable = true;
        if (relationship === 'B2B' && buyerCountry !== 'SI' && ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'ES', 'SE'].includes(buyerCountry) && buyerTaxId) {
          isReverseCharge = true;
          vatRate = 0;
          vatAmount = 0;
          vatBase = itemPrice;
          noteText = 'Obrnjena davčna obveznost / Reverse charge po Direktivi Sveta 2006/112/ES in 76. a členu ZDDV-1.';
        } else {
          vatRate = 22;
          vatBase = Math.round((itemPrice / 1.22) * 100) / 100;
          vatAmount = Math.round((itemPrice - vatBase) * 100) / 100;
          noteText = 'V ceno je vključen 22% DDV v skladu z Zakonom o davku na dodano vrednost (ZDDV-1).';
        }
      } else {
        vatRate = 0;
        vatAmount = 0;
        vatBase = itemPrice;
        isVatApplicable = false;
        noteText = 'DDV ni obračunan na podlagi 1. odstavka 94. člena ZDDV-1 (mali davčni zavezanec).';
      }
    }

    const itemTitle = (typeof auction.title === 'object' ? (auction.title?.SLO || auction.title?.EN) : auction.title) || 'Dražbeni predmet';
    const auctionId = auction.id || transaction.auction_id || 'ni podatka';
    const deliveryMethod = auction.delivery_method === 'post' ? 'Dostava po pošti' : auction.delivery_method === 'pickup' ? 'Osebni prevzem na lokaciji prodajalca' : 'Osebni prevzem ali po dogovoru';

    // Theme colors
    const colorDark = '#0A1128';
    const colorMuted = '#64748B';
    const colorLight = '#94A3B8';
    const colorBorder = '#E2E8F0';

    // Helper font setters
    const setBold = () => {
      if (hasCustomFonts) doc.font('Roboto-Bold');
      else doc.font('Helvetica-Bold');
    };
    const setRegular = () => {
      if (hasCustomFonts) doc.font('Roboto');
      else doc.font('Helvetica');
    };

    // ==========================================
    // PAGE 1: RAČUN / INVOICE (PRODAJALEC -> KUPEC)
    // ==========================================

    // Top Header: Title on Left, Logo on Right
    setBold();
    const docTitle = (relationship === 'C2C')
      ? 'POTRDILO O NAKUPU (C2C)'
      : (relationship === 'C2B')
        ? 'KUPOPRODAJNA POGODBA'
        : 'RAČUN / INVOICE';
    doc.fontSize(20).fillColor(colorDark).text(docTitle, 40, 42);

    // Right logo: dražbenik.si
    setBold();
    doc.fontSize(18).fillColor(colorLight).text('dražbenik.si', 360, 42, { width: 195, align: 'right' });
    setRegular();
    doc.fontSize(8.5).fillColor(colorLight).text('Platforma za posredovanje', 360, 65, { width: 195, align: 'right' });

    // Meta below title
    let yPos = 72;
    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted);
    
    setRegular();
    doc.fillColor(colorMuted).text('Številka dokumenta: ', 40, yPos, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(docNo);
    yPos += 13;

    setRegular();
    doc.fillColor(colorMuted).text('Kraj izdaje: ', 40, yPos, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(sellerPlace);
    yPos += 13;

    setRegular();
    doc.fillColor(colorMuted).text('Datum izdaje / sklenitve: ', 40, yPos, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(paymentDate);
    yPos += 13;

    setRegular();
    doc.fillColor(colorMuted).text('Datum opravljene storitve/dobave: ', 40, yPos, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(paymentDate);

    // Horizontal Divider Line
    yPos += 20;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, yPos).lineTo(555, yPos).stroke();

    // Two Columns: IZDAJATELJ and PREJEMNIK
    yPos += 14;
    const colLeft = 40;
    const colRight = 310;

    setBold();
    doc.fontSize(7.5).fillColor(colorLight).text('IZDAJATELJ (PRODAJALEC)', colLeft, yPos);
    doc.text('PREJEMNIK (KUPEC)', colRight, yPos);

    yPos += 13;
    setBold();
    doc.fontSize(10.5).fillColor(colorDark).text(sellerName, colLeft, yPos, { width: 240 });
    doc.text(buyerName, colRight, yPos, { width: 240 });

    yPos += 15;
    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted).text(sellerAddress, colLeft, yPos, { width: 240 });
    doc.text(buyerAddress, colRight, yPos, { width: 240 });

    yPos += 13;
    doc.text(`Davčna številka: ${sellerTaxId ? sellerTaxId : 'Ni navedena'}`, colLeft, yPos);
    doc.text(`Davčna številka: ${buyerTaxId ? buyerTaxId : 'Ni navedena'}`, colRight, yPos);

    if (sellerRegNo || buyerRegNo) {
      yPos += 12;
      if (sellerRegNo) doc.text(`Matična številka: ${sellerRegNo}`, colLeft, yPos);
      if (buyerRegNo) doc.text(`Matična številka: ${buyerRegNo}`, colRight, yPos);
    }

    // Horizontal Divider
    yPos += 18;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, yPos).lineTo(555, yPos).stroke();

    // Identification note box (crisp vector badge)
    yPos += 12;
    doc.roundedRect(40, yPos, 515, 24, 4).fillAndStroke('#F8FAFC', '#E2E8F0');
    
    // Draw small blue circle badge
    const badgeCenterX = 53;
    const badgeCenterY = yPos + 12;
    doc.circle(badgeCenterX, badgeCenterY, 5.5).fillColor('#2563EB').fill();
    setBold();
    doc.fontSize(7).fillColor('#FFFFFF').text('i', badgeCenterX - 1.8, badgeCenterY - 4, { lineBreak: false });

    setBold();
    doc.fontSize(8).fillColor(colorDark).text('Identifikacija: ', 66, yPos + 7, { continued: true });
    setRegular();
    doc.fillColor(colorMuted).text('Stranki sta elektronsko identificirani znotraj platforme dražbenik.si.');

    // Table Header
    yPos += 38;
    setBold();
    doc.fontSize(8).fillColor(colorDark);
    doc.text('OPIS', 40, yPos);
    doc.text('KOLIČINA', 260, yPos, { width: 70, align: 'center' });
    doc.text('CENA (€)', 355, yPos, { width: 85, align: 'right' });
    doc.text('SKUPAJ (€)', 455, yPos, { width: 100, align: 'right' });

    yPos += 13;
    doc.strokeColor(colorDark).lineWidth(1.5).moveTo(40, yPos).lineTo(555, yPos).stroke();

    // Item Row
    yPos += 10;
    setBold();
    doc.fontSize(9.5).fillColor(colorDark).text(itemTitle, 40, yPos, { width: 220 });
    setRegular();
    doc.fontSize(9).text('1', 260, yPos, { width: 70, align: 'center' });
    doc.text(formatEuro(itemPrice), 355, yPos, { width: 85, align: 'right' });
    setBold();
    doc.text(formatEuro(itemPrice), 455, yPos, { width: 100, align: 'right' });

    yPos += 13;
    setRegular();
    doc.fontSize(7.5).fillColor(colorLight).text(`ID dražbe: ${auctionId}`, 40, yPos);

    // Delivery method banner
    yPos += 15;
    doc.roundedRect(40, yPos, 515, 18, 3).fill('#F8FAFC');
    doc.fontSize(8).fillColor(colorMuted).text(`Način predaje: ${deliveryMethod}`, 50, yPos + 5);

    yPos += 24;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, yPos).lineTo(555, yPos).stroke();

    // Subtotals Box (Right aligned)
    yPos += 14;
    const totalsLeft = 325;
    const totalsValueRight = 555;

    if (isVatApplicable) {
      setRegular();
      doc.fontSize(8.5).fillColor(colorMuted).text('Osnova za DDV (22%):', totalsLeft, yPos);
      setBold();
      doc.fontSize(8.5).fillColor(colorDark).text(`${formatEuro(vatBase)} €`, totalsLeft + 120, yPos, { width: 110, align: 'right' });
      yPos += 15;

      setRegular();
      doc.fontSize(8.5).fillColor(colorMuted).text('Znesek DDV (22%):', totalsLeft, yPos);
      setBold();
      doc.fontSize(8.5).fillColor(colorDark).text(`${formatEuro(vatAmount)} €`, totalsLeft + 120, yPos, { width: 110, align: 'right' });
      yPos += 15;
    } else {
      setRegular();
      doc.fontSize(8.5).fillColor(colorMuted).text('Kupnina / Znesek:', totalsLeft, yPos);
      setBold();
      doc.fontSize(8.5).fillColor(colorDark).text(`${formatEuro(itemPrice)} €`, totalsLeft + 120, yPos, { width: 110, align: 'right' });
      yPos += 15;

      setRegular();
      doc.fontSize(8.5).fillColor(colorMuted).text('DDV:', totalsLeft, yPos);
      setBold();
      doc.fontSize(8.5).fillColor(colorDark).text('Ni obračunan', totalsLeft + 120, yPos, { width: 110, align: 'right' });
      yPos += 15;
    }

    doc.strokeColor(colorDark).lineWidth(1.5).moveTo(totalsLeft, yPos).lineTo(totalsValueRight, yPos).stroke();
    yPos += 7;

    setBold();
    doc.fontSize(10).fillColor(colorDark).text('SKUPAJ ZA PLAČILO:', totalsLeft, yPos);
    doc.fontSize(10.5).text(`${formatEuro(itemPrice)} €`, totalsLeft + 120, yPos, { width: 110, align: 'right' });

    // Legal Footer at bottom of Page 1
    const footerY = 665;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, footerY).lineTo(555, footerY).stroke();

    let footY = footerY + 11;
    setBold();
    doc.fontSize(7.5).fillColor(colorDark).text('Jamstvo za neskladnost blaga (ZVPot-1): ', 40, footY, { continued: true });
    setRegular();
    doc.fillColor(colorMuted).text('Za blago veljajo zakonska jamstva za neskladnost blaga v skladu z ZVPot-1.');

    footY += 13;
    setBold();
    doc.fontSize(7.5).fillColor(colorDark).text('Prenos lastništva: ', 40, footY, { continued: true });
    setRegular();
    doc.fillColor(colorMuted).text('Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.');

    footY += 13;
    setBold();
    doc.fontSize(7.5).fillColor(colorDark).text('Pravna opomba in DDV: ', 40, footY, { continued: true });
    setRegular();
    doc.fillColor(colorMuted).text(noteText);

    footY += 15;
    setRegular();
    doc.fontSize(7).fillColor(colorLight).text(
      'Platforma dražbenik.si nastopa izključno kot tehnološki posrednik in ni stranka v prodajni pogodbi. Ta dokument služi kot kupoprodajna pogodba in potrdilo o sklenjenem poslu ter plačilu med prodajalcem in kupcem, generirano samodejno s strani sistema po uspešnem zaključku dražbe.',
      40,
      footY,
      { width: 515 }
    );

    // ==========================================
    // PAGE 2: RAČUN ZA STORITEV / SERVICE INVOICE (PLATFORMA -> KUPEC)
    // ==========================================
    doc.addPage({ margin: 40, size: 'A4' });

    const feeDocNo = commissionInvoiceNo || `PROV-${(transaction.id || auction.id || '000000').substring(0, 8).toUpperCase()}`;
    const feeBase = Number(transaction.platform_fee ?? (itemPrice * 0.10) / 1.22);
    const feeVatRate = transaction.vat_rate !== undefined ? Number(transaction.vat_rate) : 22;
    const feeVat = Number(transaction.vat_amount ?? feeBase * (feeVatRate / 100));
    isReverseCharge = Boolean(transaction.is_reverse_charge);
    const feeTotal = feeBase + feeVat;

    // Centered Title
    setBold();
    doc.fontSize(16).fillColor(colorDark).text('RAČUN ZA STORITEV / SERVICE INVOICE', 40, 42, { width: 515, align: 'center' });

    // Top Divider Line
    let p2Y = 75;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, p2Y).lineTo(555, p2Y).stroke();

    // Two Columns: IZDAJATELJ (PLATFORMA) & PREJEMNIK STORITVE (KUPEC)
    p2Y += 13;
    setBold();
    doc.fontSize(7.5).fillColor(colorLight).text('IZDAJATELJ (PLATFORMA)', colLeft, p2Y);
    doc.text('PREJEMNIK STORITVE (KUPEC)', colRight, p2Y);

    p2Y += 13;
    setBold();
    doc.fontSize(10.5).fillColor(colorDark).text('Dizain d.o.o.', colLeft, p2Y, { width: 240 });
    doc.text(buyerName, colRight, p2Y, { width: 240 });

    p2Y += 15;
    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted).text('Karantanska ulica 28, 2000 Maribor', colLeft, p2Y, { width: 240 });
    doc.text(buyerAddress, colRight, p2Y, { width: 240 });

    p2Y += 13;
    doc.text('Davčna številka: SI57008060', colLeft, p2Y);
    doc.text(`Davčna številka: ${buyerTaxId ? buyerTaxId : 'Ni navedena'}`, colRight, p2Y);

    p2Y += 12;
    doc.text('Matična številka: 9093494000', colLeft, p2Y);
    if (buyerRegNo) {
      doc.text(`Matična številka: ${buyerRegNo}`, colRight, p2Y);
    }

    // Bottom Divider Line
    p2Y += 18;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, p2Y).lineTo(555, p2Y).stroke();

    // Invoice Meta Information
    p2Y += 14;
    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted).text('Številka računa: ', colLeft, p2Y, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(feeDocNo);

    p2Y += 13;
    setRegular();
    doc.fillColor(colorMuted).text('Datum izdaje in opravljene storitve: ', colLeft, p2Y, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(paymentDate);

    p2Y += 13;
    setRegular();
    doc.fillColor(colorMuted).text('Način plačila: ', colLeft, p2Y, { continued: true });
    setBold();
    doc.fillColor(colorDark).text('Spletno plačilo / Kartica');

    p2Y += 13;
    setRegular();
    doc.fillColor(colorMuted).text('Status plačila: ', colLeft, p2Y, { continued: true });
    setBold();
    doc.fillColor('#059669').text(`PLAČANO (${paymentDate})`);

    // Table Header
    p2Y += 28;
    setBold();
    doc.fontSize(8).fillColor(colorDark);
    doc.text('OPIS', 40, p2Y);
    doc.text('OSNOVA (€)', 455, p2Y, { width: 100, align: 'right' });

    p2Y += 13;
    doc.strokeColor(colorDark).lineWidth(1.5).moveTo(40, p2Y).lineTo(555, p2Y).stroke();

    // Service Row
    p2Y += 10;
    setBold();
    doc.fontSize(9.5).fillColor(colorDark).text('Provizija platforme za uporabo sistema', 40, p2Y, { width: 350 });
    setRegular();
    doc.fontSize(9).text(formatEuro(feeBase), 455, p2Y, { width: 100, align: 'right' });

    yPos += 13;
    setRegular();
    doc.fontSize(7.5).fillColor(colorLight).text(`Dražba: ${itemTitle}`, 40, p2Y + 14);

    p2Y += 28;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, p2Y).lineTo(555, p2Y).stroke();

    // Platform Fee Totals Box (Right aligned)
    p2Y += 15;
    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted).text('Osnova / Base:', totalsLeft, p2Y);
    setBold();
    doc.fontSize(8.5).fillColor(colorDark).text(`${formatEuro(feeBase)} €`, totalsLeft + 120, p2Y, { width: 110, align: 'right' });

    p2Y += 15;
    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted).text(`DDV / VAT (${feeVatRate}%):`, totalsLeft, p2Y);
    setBold();
    doc.fontSize(8.5).fillColor(colorDark).text(`${formatEuro(feeVat)} €`, totalsLeft + 120, p2Y, { width: 110, align: 'right' });

    if (isReverseCharge) {
      p2Y += 15;
      setBold();
      doc.fontSize(8).fillColor('#D97706').text('Obrnjena davčna obveznost / Reverse charge', totalsLeft, p2Y, { width: 230 });
    }

    p2Y += 15;
    doc.strokeColor(colorDark).lineWidth(1.5).moveTo(totalsLeft, p2Y).lineTo(totalsValueRight, p2Y).stroke();
    p2Y += 7;

    setBold();
    doc.fontSize(10).fillColor(colorDark).text('SKUPAJ PROVIZIJA:', totalsLeft, p2Y);
    doc.fontSize(10.5).text(`${formatEuro(feeTotal)} €`, totalsLeft + 120, p2Y, { width: 110, align: 'right' });

    // Footer on Page 2
    const p2FooterY = 690;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, p2FooterY).lineTo(555, p2FooterY).stroke();

    let p2FootY = p2FooterY + 12;
    setRegular();
    doc.fontSize(7.5).fillColor(colorMuted).text(
      'Dizain d.o.o. je registriran izdajatelj računa za posredniške storitve platforme dražbenik.si. V ceno storitve je vključen 22% DDV.',
      40,
      p2FootY,
      { width: 515 }
    );
    p2FootY += 13;
    doc.fontSize(7).fillColor(colorLight).text(
      'Dokument je generiran elektronsko in je veljaven brez žiga ali podpisa v skladu z ZZEPA ter 84. členom Zakona o davku na dodano vrednost (ZDDV-1).',
      40,
      p2FootY,
      { width: 515 }
    );

    doc.end();
  });
}

export async function generateCertificatePDF(transaction: any, buyer: any, seller: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers: Buffer[] = [];

    const regBuf = getRegularFont();
    const boldBuf = getBoldFont();
    const hasCustomFonts = Boolean(regBuf && boldBuf);

    if (hasCustomFonts) {
      doc.registerFont('Roboto', regBuf!);
      doc.registerFont('Roboto-Bold', boldBuf!);
      doc.font('Roboto');
    }

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });
    doc.on('error', (err) => reject(err));

    const setBold = () => {
      if (hasCustomFonts) doc.font('Roboto-Bold');
      else doc.font('Helvetica-Bold');
    };
    const setRegular = () => {
      if (hasCustomFonts) doc.font('Roboto');
      else doc.font('Helvetica');
    };

    setBold();
    doc.fontSize(18).fillColor('#0A1128').text('POTRDILO O NAKUPU / PURCHASE CERTIFICATE', { align: 'center' });
    setRegular();
    doc.moveDown();

    doc.fontSize(10).fillColor('#94A3B8').text('dražbenik.si', { align: 'center' });
    doc.moveDown();

    setRegular();
    doc.fontSize(9).fillColor('#475569');
    doc.text(`Številka potrdila / Certificate No: CERT-${(transaction.id || '').substring(0, 8).toUpperCase()}`);
    doc.text(`Datum / Date: ${new Date().toLocaleDateString('sl-SI')}`);
    doc.moveDown();

    setBold();
    doc.fontSize(11).fillColor('#0A1128').text('Kupec / Buyer:');
    setRegular();
    doc.fontSize(9.5).fillColor('#475569').text(`${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || buyer.name || 'Kupec');
    doc.moveDown();

    setBold();
    doc.fontSize(11).fillColor('#0A1128').text('Prodajalec / Seller:');
    setRegular();
    doc.fontSize(9.5).fillColor('#475569').text(`${seller.first_name || ''} ${seller.last_name || ''}`.trim() || seller.name || 'Prodajalec');
    if (seller.company_status === 'company') {
      doc.text(`Podjetje / Company: ${seller.company_name || 'N/A'}`);
    }
    doc.moveDown();

    const amount = Number(transaction.amount_total || 0);
    setBold();
    doc.fontSize(11).fillColor('#0A1128').text('Podrobnosti transakcije / Transaction Details:');
    setRegular();
    doc.fontSize(9.5).fillColor('#475569').text(`Znesek nakupa / Purchase Amount: €${amount.toFixed(2)}`);

    doc.moveDown();
    doc.fontSize(8.5).fillColor('#94A3B8').text('To potrdilo služi kot informativni dokaz o uspešno zaključeni dražbi in plačilu.');

    doc.end();
  });
}

export async function generateSubscriptionInvoicePDF(
  params: {
    invoiceNo: string;
    user: any;
    planId: string; // 'basic' | 'pro'
    amount: number; // e.g. 20 or 50
    paymentDate?: string;
    paymentMethod?: string;
    periodStart?: Date;
    periodEnd?: Date;
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers: Buffer[] = [];

    const regBuf = getRegularFont();
    const boldBuf = getBoldFont();
    const hasCustomFonts = Boolean(regBuf && boldBuf);

    if (hasCustomFonts) {
      doc.registerFont('Roboto', regBuf!);
      doc.registerFont('Roboto-Bold', boldBuf!);
      doc.font('Roboto');
    }

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });
    doc.on('error', (err) => reject(err));

    const setBold = () => {
      if (hasCustomFonts) doc.font('Roboto-Bold');
      else doc.font('Helvetica-Bold');
    };
    const setRegular = () => {
      if (hasCustomFonts) doc.font('Roboto');
      else doc.font('Helvetica');
    };

    const colorDark = '#0A1128';
    const colorMuted = '#64748B';
    const colorLight = '#94A3B8';
    const colorBorder = '#E2E8F0';

    const {
      invoiceNo,
      user = {},
      planId = 'basic',
      amount = 20,
      paymentDate = new Date().toLocaleDateString('sl-SI'),
      paymentMethod = 'Spletno plačilo / Kartica (Stripe)'
    } = params;

    const startDate = params.periodStart || new Date();
    const endDate = params.periodEnd || new Date(new Date(startDate).setMonth(startDate.getMonth() + 1));
    const periodStr = `${startDate.toLocaleDateString('sl-SI')} - ${endDate.toLocaleDateString('sl-SI')}`;

    const isCompany = user.company_status === 'company' || user.user_type === 'business' || Boolean(user.company_name);
    const buyerName = user.company_name || 
      `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim() || 
      user.name || 
      user.username || 
      user.email || 
      'Naročnik';

    const buyerAddress = getSafeAddress(user);
    const buyerTaxId = user.tax_id || user.taxId || user.vat_id || '';
    const buyerRegNo = user.registration_number || user.regNumber || '';

    // Check Reverse Charge for EU B2B outside Slovenia
    const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'ES', 'SE'];
    const userCountry = (user.country_code || user.country || 'SI').toUpperCase();
    const isReverseCharge = isCompany && buyerTaxId && euCountries.includes(userCountry) && userCountry !== 'SI';

    const totalAmount = Number(amount || (planId.toLowerCase().includes('pro') ? 50 : 20));
    const vatRate = isReverseCharge ? 0 : 0.22;
    const baseAmount = isReverseCharge ? totalAmount : Math.round((totalAmount / 1.22) * 100) / 100;
    const vatAmount = isReverseCharge ? 0 : Math.round((totalAmount - baseAmount) * 100) / 100;

    const isPro = planId.toLowerCase().includes('pro');
    const planTitle = isPro ? 'Mesečna naročnina - Paket NAPREDNI' : 'Mesečna naročnina - Paket OSNOVNI';
    const planDesc = isPro
      ? 'Aktivna naročnina za profesionalne prodajalce: neomejeno objavljenih dražb, znižana 4% provizija platforme, prednostna izpostavljenost.'
      : 'Aktivna naročnina za redne prodajalce: do 20 objavljenih dražb mesečno, znižana 6% provizija platforme.';

    const colLeft = 40;
    const colRight = 310;

    // Header
    setBold();
    doc.fontSize(16).fillColor(colorDark).text('RAČUN ZA NAROČNINO / SUBSCRIPTION INVOICE', 40, 42, { width: 515, align: 'center' });

    // Top Divider Line
    let yPos = 75;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, yPos).lineTo(555, yPos).stroke();

    // Two Columns: IZDAJATELJ & NAROČNIK
    yPos += 13;
    setBold();
    doc.fontSize(7.5).fillColor(colorLight).text('IZDAJATELJ (PLATFORMA)', colLeft, yPos);
    doc.text('NAROČNIK / PREJEMNIK RAČUNA', colRight, yPos);

    yPos += 13;
    setBold();
    doc.fontSize(10.5).fillColor(colorDark).text('Dizain d.o.o.', colLeft, yPos, { width: 240 });
    doc.text(buyerName, colRight, yPos, { width: 240 });

    yPos += 15;
    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted).text('Karantanska ulica 28, 2000 Maribor, Slovenija', colLeft, yPos, { width: 240 });
    doc.text(buyerAddress, colRight, yPos, { width: 240 });

    yPos += 13;
    doc.text('Davčna številka: SI57008060', colLeft, yPos);
    doc.text(`Davčna številka: ${buyerTaxId ? buyerTaxId : 'Ni navedena'}`, colRight, yPos);

    yPos += 12;
    doc.text('Matična številka: 9093494000', colLeft, yPos);
    if (buyerRegNo) {
      doc.text(`Matična številka: ${buyerRegNo}`, colRight, yPos);
    } else if (user.email) {
      doc.text(`E-pošta: ${user.email}`, colRight, yPos);
    }

    // Bottom Divider Line
    yPos += 18;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, yPos).lineTo(555, yPos).stroke();

    // Invoice Meta Information
    yPos += 14;
    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted).text('Številka računa: ', colLeft, yPos, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(invoiceNo);

    yPos += 13;
    setRegular();
    doc.fillColor(colorMuted).text('Datum izdaje in opravljene storitve: ', colLeft, yPos, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(paymentDate);

    yPos += 13;
    setRegular();
    doc.fillColor(colorMuted).text('Obračunsko obdobje naročnine: ', colLeft, yPos, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(periodStr);

    yPos += 13;
    setRegular();
    doc.fillColor(colorMuted).text('Način plačila: ', colLeft, yPos, { continued: true });
    setBold();
    doc.fillColor(colorDark).text(paymentMethod);

    yPos += 13;
    setRegular();
    doc.fillColor(colorMuted).text('Status plačila: ', colLeft, yPos, { continued: true });
    setBold();
    doc.fillColor('#059669').text(`PLAČANO (${paymentDate})`);

    // Table Header
    yPos += 28;
    setBold();
    doc.fontSize(8).fillColor(colorDark);
    doc.text('OPIS STORITVE', 40, yPos);
    doc.text('KOLIČINA', 300, yPos, { width: 50, align: 'center' });
    doc.text('OSNOVA (€)', 360, yPos, { width: 85, align: 'right' });
    doc.text('SKUPAJ (€)', 455, yPos, { width: 100, align: 'right' });

    yPos += 13;
    doc.strokeColor(colorDark).lineWidth(1.5).moveTo(40, yPos).lineTo(555, yPos).stroke();

    // Service Row
    yPos += 10;
    setBold();
    doc.fontSize(9.5).fillColor(colorDark).text(planTitle, 40, yPos, { width: 250 });
    setRegular();
    doc.fontSize(9).text('1 mesec', 300, yPos, { width: 50, align: 'center' });
    doc.text(formatEuro(baseAmount), 360, yPos, { width: 85, align: 'right' });
    setBold();
    doc.text(formatEuro(totalAmount), 455, yPos, { width: 100, align: 'right' });

    yPos += 14;
    setRegular();
    doc.fontSize(7.5).fillColor(colorLight).text(planDesc, 40, yPos, { width: 250 });

    yPos += 26;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, yPos).lineTo(555, yPos).stroke();

    // Platform Fee Totals Box (Right aligned)
    yPos += 15;
    const totalsLeft = 325;
    const totalsValueRight = 555;

    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted).text('Osnova za DDV:', totalsLeft, yPos);
    setBold();
    doc.fontSize(8.5).fillColor(colorDark).text(`${formatEuro(baseAmount)} €`, totalsLeft + 120, yPos, { width: 110, align: 'right' });

    yPos += 15;
    setRegular();
    doc.fontSize(8.5).fillColor(colorMuted).text(isReverseCharge ? 'DDV (Obrnjena davčna obv.):' : 'DDV (22%):', totalsLeft, yPos);
    setBold();
    doc.fontSize(8.5).fillColor(colorDark).text(`${formatEuro(vatAmount)} €`, totalsLeft + 120, yPos, { width: 110, align: 'right' });

    yPos += 15;
    doc.strokeColor(colorDark).lineWidth(1.5).moveTo(totalsLeft, yPos).lineTo(totalsValueRight, yPos).stroke();
    yPos += 7;

    setBold();
    doc.fontSize(10).fillColor(colorDark).text('SKUPAJ ZA PLAČILO:', totalsLeft, yPos);
    doc.fontSize(10.5).text(`${formatEuro(totalAmount)} €`, totalsLeft + 120, yPos, { width: 110, align: 'right' });

    // Footer
    const footerY = 680;
    doc.strokeColor(colorBorder).lineWidth(1).moveTo(40, footerY).lineTo(555, footerY).stroke();

    let footY = footerY + 12;
    setRegular();
    doc.fontSize(7.5).fillColor(colorMuted);
    if (isReverseCharge) {
      doc.text(
        'Dizain d.o.o. je davčni zavezanec za DDV v Sloveniji (ID za DDV: SI57008060). Obrnjena davčna obveznost / Reverse charge po Direktivi Sveta 2006/112/ES in 76. a členu ZDDV-1.',
        40,
        footY,
        { width: 515 }
      );
    } else {
      doc.text(
        'Dizain d.o.o. je davčni zavezanec za DDV v Sloveniji (ID za DDV: SI57008060). V ceno storitve je vključen 22% DDV v skladu z Zakonom o davku na dodano vrednost (ZDDV-1).',
        40,
        footY,
        { width: 515 }
      );
    }

    footY += 16;
    doc.fontSize(7).fillColor(colorLight).text(
      'Dokument je bil izdan elektronsko s strani platforme dražbenik.si / drazbe.si in je pravno veljaven brez podpisa in žiga. Za morebitna vprašanja glede naročnine se obrnite na podpora@drazbe.si.',
      40,
      footY,
      { width: 515 }
    );

    doc.end();
  });
}

