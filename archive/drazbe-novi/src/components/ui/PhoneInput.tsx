import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';

const COUNTRY_CODES = [
  { code: 'SI', name: 'Slovenija', dial_code: '+386', flag: '🇸🇮' },
  { code: 'AT', name: 'Avstrija', dial_code: '+43', flag: '🇦🇹' },
  { code: 'HR', name: 'Hrvaška', dial_code: '+385', flag: '🇭🇷' },
  { code: 'IT', name: 'Italija', dial_code: '+39', flag: '🇮🇹' },
  { code: 'HU', name: 'Madžarska', dial_code: '+36', flag: '🇭🇺' },
  { code: 'DE', name: 'Nemčija', dial_code: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'Francija', dial_code: '+33', flag: '🇫🇷' },
  { code: 'ES', name: 'Španija', dial_code: '+34', flag: '🇪🇸' },
  { code: 'GB', name: 'Združeno kraljestvo', dial_code: '+44', flag: '🇬🇧' },
  { code: 'US', name: 'ZDA', dial_code: '+1', flag: '🇺🇸' },
  { code: 'RS', name: 'Srbija', dial_code: '+381', flag: '🇷🇸' },
  { code: 'BA', name: 'Bosna in Hercegovina', dial_code: '+387', flag: '🇧🇦' },
  { code: 'MK', name: 'Severna Makedonija', dial_code: '+389', flag: '🇲🇰' },
  { code: 'ME', name: 'Črna gora', dial_code: '+382', flag: '🇲🇪' },
  { code: 'AL', name: 'Albanija', dial_code: '+355', flag: '🇦🇱' },
  { code: 'BG', name: 'Bolgarija', dial_code: '+359', flag: '🇧🇬' },
  { code: 'RO', name: 'Romunija', dial_code: '+40', flag: '🇷🇴' },
  { code: 'GR', name: 'Grčija', dial_code: '+30', flag: '🇬🇷' },
  { code: 'CZ', name: 'Češka', dial_code: '+420', flag: '🇨🇿' },
  { code: 'SK', name: 'Slovaška', dial_code: '+421', flag: '🇸🇰' },
  { code: 'PL', name: 'Poljska', dial_code: '+48', flag: '🇵🇱' },
  { code: 'NL', name: 'Nizozemska', dial_code: '+31', flag: '🇳🇱' },
  { code: 'BE', name: 'Belgija', dial_code: '+32', flag: '🇧🇪' },
  { code: 'SE', name: 'Švedska', dial_code: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norveška', dial_code: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Danska', dial_code: '+45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finska', dial_code: '+358', flag: '🇫🇮' },
  { code: 'IE', name: 'Irska', dial_code: '+353', flag: '🇮🇪' },
  { code: 'PT', name: 'Portugalska', dial_code: '+351', flag: '🇵🇹' }
];

export const PhoneInput = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  let matchedCountry = COUNTRY_CODES[0];
  let localNumber = value || '';
  
  if (value) {
     const match = COUNTRY_CODES.find(c => value.startsWith(c.dial_code));
     if (match) {
         matchedCountry = match;
         localNumber = value.slice(match.dial_code.length);
     }
  }

  const [selectedCountry, setSelectedCountry] = useState(matchedCountry);
  const [number, setNumber] = useState(localNumber);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Send update immediately on change
  const handleCountryChange = (c: typeof COUNTRY_CODES[0]) => {
     setSelectedCountry(c);
     onChange(`${c.dial_code}${number}`);
     setIsOpen(false);
     setSearch('');
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     const newNumber = e.target.value.replace(/[^0-9]/g, '');
     setNumber(newNumber);
     onChange(`${selectedCountry.dial_code}${newNumber}`);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCountries = COUNTRY_CODES.filter(c => 
     c.name.toLowerCase().includes(search.toLowerCase()) || 
     c.dial_code.includes(search)
  );

  return (
    <div className="relative flex items-center w-full" ref={dropdownRef}>
       <button 
         type="button"
         onClick={() => setIsOpen(!isOpen)}
         className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-l-xl px-3 py-3 font-bold hover:bg-slate-100 transition-colors h-[50px] shrink-0"
       >
         <span>{selectedCountry.flag}</span>
         <span className="text-sm">{selectedCountry.dial_code}</span>
         <ChevronDown size={16} className="text-slate-400" />
       </button>
       
       <input 
         type="tel"
         value={number}
         onChange={handleNumberChange}
         className="w-full h-[50px] bg-white border border-l-0 border-slate-200 rounded-r-xl px-4 py-3 font-bold outline-none focus:border-[#FEBA4F] focus:ring-1 focus:ring-[#FEBA4F]"
         placeholder="31 000 000"
       />

       {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
             <div className="p-2 border-b border-slate-100 flex items-center gap-2">
                <Search size={16} className="text-slate-400" />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Iskanje države ali predpone..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-sm outline-none font-medium p-1"
                />
             </div>
             <div className="max-h-60 overflow-y-auto custom-scrollbar">
                {filteredCountries.map(c => (
                   <button
                     key={c.code}
                     type="button"
                     onClick={() => handleCountryChange(c)}
                     className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-3 ${selectedCountry.code === c.code ? 'bg-slate-50' : ''}`}
                   >
                     <span>{c.flag}</span>
                     <span className="font-medium flex-1 text-sm">{c.name}</span>
                     <span className="text-slate-500 text-sm">{c.dial_code}</span>
                   </button>
                ))}
                {filteredCountries.length === 0 && (
                   <div className="px-4 py-3 text-sm text-slate-500 text-center">Ni zadetkov</div>
                )}
             </div>
          </div>
       )}
    </div>
  );
}
