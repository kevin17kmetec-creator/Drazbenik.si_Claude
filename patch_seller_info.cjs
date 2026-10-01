const fs = require('fs');
let content = fs.readFileSync('src/components/profile/SellerView.tsx', 'utf8');

const profilePicRegex = /\{seller\.type === 'business' \? \([\s\S]*?\}[\s\n]*<div className="absolute bottom-4 right-4 bg-green-500 text-white p-2 rounded-2xl shadow-lg">/m;
const profilePicReplacement = `{(seller as any).photoURL ? (
                <img src={(seller as any).photoURL} alt="Profile" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              ) : seller.type === 'business' ? (
                <Building2 size={64} className="text-slate-300 group-hover:scale-110 transition-transform" />
              ) : (
                <User size={64} className="text-slate-300 group-hover:scale-110 transition-transform" />
              )}
              <div className="absolute bottom-4 right-4 bg-green-500 text-white p-2 rounded-2xl shadow-lg">`;

content = content.replace(profilePicRegex, profilePicReplacement);

const statsRegex = /<span className="flex items-center gap-2"><MapPin size=\{18\} className="text-\[\#FEBA4F\]" \/> \{seller\?\.location\?\.\[language\] \|\| seller\?\.location\?\.\['SLO'\] \|\| 'Neznano'\}<\/span>/;
const statsReplacement = `<span className="flex items-center gap-2"><MapPin size={18} className="text-[#FEBA4F]" /> {seller?.location?.[language] || seller?.location?.['SLO'] || 'Neznano'}</span>
              {(seller as any).created_at && (
                <span className="flex items-center gap-2"><Calendar size={18} className="text-[#FEBA4F]" /> Član od: {new Date((seller as any).created_at).toLocaleDateString('sl-SI')}</span>
              )}
              <span className="flex items-center gap-2 text-green-500"><Award size={18} /> Prodanih dražb: {(seller as any).sold_count || pastAuctions.length || 0}</span>
              {(seller as any).unpaid_penalties > 0 && (
                <span className="flex items-center gap-2 text-red-500"><AlertCircle size={18} /> Neplačane dražbe (Penali): {(seller as any).unpaid_penalties} / 3</span>
              )}`;

content = content.replace(statsRegex, statsReplacement);

fs.writeFileSync('src/components/profile/SellerView.tsx', content);
