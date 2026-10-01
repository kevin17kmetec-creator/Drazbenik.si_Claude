import React from 'react';
import { Category } from '../../types';
import { getAttributeDefinitionsForCategory, AttributeFieldDef } from '../../lib/categoryAttributes';
import { SlidersHorizontal, Sparkles } from 'lucide-react';

interface CategoryAttributesInputProps {
  category: Category | string;
  specifications: Record<string, string>;
  onChange: (specifications: Record<string, string>) => void;
}

export const CategoryAttributesInput: React.FC<CategoryAttributesInputProps> = ({
  category,
  specifications = {},
  onChange
}) => {
  const definitions = getAttributeDefinitionsForCategory(category);

  if (!definitions || definitions.length === 0) return null;

  const handleFieldChange = (key: string, selectedValue: string, customText?: string) => {
    const updated = { ...specifications };
    
    if (selectedValue === 'Drugo') {
      if (customText !== undefined) {
        if (customText.trim() === '') {
          // If empty custom text, remove or keep as Drugo
          updated[key] = '';
        } else {
          updated[key] = customText.trim();
        }
      } else {
        // Just selected 'Drugo', keep existing if it was already custom or empty
        if (!updated[key] || definitions.find(d => d.key === key)?.options.includes(updated[key])) {
          updated[key] = '';
        }
      }
    } else if (!selectedValue) {
      delete updated[key];
    } else {
      updated[key] = selectedValue;
    }

    onChange(updated);
  };

  return (
    <div className="w-full bg-slate-50 border-2 border-slate-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-inner animate-in fade-in duration-300">
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#0A1128] text-[#FEBA4F] flex items-center justify-center shadow-md">
            <SlidersHorizontal size={18} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-[#0A1128] uppercase tracking-wider flex items-center gap-2">
              Dodatne nastavitve za kategorijo: <span className="text-[#FEBA4F] font-extrabold">{category}</span>
            </h3>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              Izpolnite podrobnosti za večjo prepoznavnost in lažje filtriranje kupcev (neobvezno)
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/60 text-[#0A1128] text-[10px] font-black uppercase tracking-wider">
          <Sparkles size={12} className="text-[#FEBA4F]" /> Hitro filtriranje
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {definitions.map((def) => {
          const currentValue = specifications[def.key] || '';
          const isStandardOption = def.options.includes(currentValue) && currentValue !== 'Drugo';
          const isCustomValue = currentValue !== '' && !isStandardOption;
          const selectValue = isStandardOption ? currentValue : isCustomValue ? 'Drugo' : '';

          return (
            <div key={def.key} className="space-y-2 flex flex-col justify-start">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-[#0A1128] ml-1">
                  {def.label}
                </label>
                {currentValue && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...specifications };
                      delete updated[def.key];
                      onChange(updated);
                    }}
                    className="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-wider transition-colors"
                  >
                    Počisti
                  </button>
                )}
              </div>

              <select
                value={selectValue}
                onChange={(e) => {
                  const val = e.target.value;
                  handleFieldChange(def.key, val);
                }}
                className="w-full bg-white border-2 border-slate-200 rounded-2xl py-3.5 px-4 font-bold text-sm text-[#0A1128] focus:ring-0 focus:border-[#FEBA4F] transition-all outline-none appearance-none cursor-pointer shadow-sm hover:border-slate-300"
              >
                <option value="">-- Izberite ({def.label.toLowerCase()}) --</option>
                {def.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              {(selectValue === 'Drugo' || isCustomValue) && (
                <div className="mt-2 animate-in slide-in-from-top-1 fade-in duration-200">
                  <input
                    type="text"
                    value={isCustomValue ? currentValue : ''}
                    placeholder={def.placeholder || `Vnesite vašo vrednost za ${def.label.toLowerCase()}...`}
                    onChange={(e) => handleFieldChange(def.key, 'Drugo', e.target.value)}
                    className="w-full bg-white border-2 border-[#FEBA4F] rounded-2xl py-3 px-4 font-bold text-sm text-[#0A1128] focus:ring-2 focus:ring-[#FEBA4F]/20 transition-all outline-none shadow-sm placeholder:text-slate-400 placeholder:font-normal"
                    autoFocus={selectValue === 'Drugo' && !isCustomValue}
                  />
                  <p className="text-[10px] font-semibold text-slate-400 mt-1 ml-2">
                    Vpisana lastna vrednost bo prikazana na kartici in v podrobnostih dražbe.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
