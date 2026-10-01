import React from 'react';
import { Category, Region } from '../../types';
import { getAttributeDefinitionsForCategory } from '../../lib/categoryAttributes';
import { Filter, X, Truck, MapPin, Tag, Check, Sparkles } from 'lucide-react';

export interface FilterState {
  delivery_option?: string;
  condition?: string;
  specifications: Record<string, string>;
}

interface CategoryFilterBarProps {
  category: Category | null;
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  onResetFilters: () => void;
  totalResultsCount: number;
}

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  category,
  filters,
  onFilterChange,
  onResetFilters,
  totalResultsCount
}) => {
  const definitions = category ? getAttributeDefinitionsForCategory(category) : [];

  const handleDeliveryChange = (val: string) => {
    onFilterChange({
      ...filters,
      delivery_option: filters.delivery_option === val ? undefined : val
    });
  };

  const handleConditionChange = (val: string) => {
    onFilterChange({
      ...filters,
      condition: filters.condition === val ? undefined : val
    });
  };

  const handleSpecChange = (key: string, val: string) => {
    const newSpecs = { ...filters.specifications };
    if (newSpecs[key] === val || !val) {
      delete newSpecs[key];
    } else {
      newSpecs[key] = val;
    }
    onFilterChange({
      ...filters,
      specifications: newSpecs
    });
  };

  const activeFilterCount = 
    (filters.delivery_option ? 1 : 0) +
    (filters.condition ? 1 : 0) +
    Object.keys(filters.specifications).filter(k => !!filters.specifications[k]).length;

  return (
    <div className="w-full bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm mb-8 space-y-5 animate-in fade-in duration-200">
      {/* Top row: Title and active count + reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#0A1128] text-[#FEBA4F] flex items-center justify-center shadow-sm">
            <Filter size={15} />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-[#0A1128] flex items-center gap-2">
              Filtri artiklov
              {category && <span className="text-[#FEBA4F]">• {category}</span>}
            </span>
            <span className="text-[11px] font-bold text-slate-400 block">
              Najdenih dražb: <strong className="text-[#0A1128]">{totalResultsCount}</strong>
            </span>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-black text-[11px] uppercase tracking-wider transition-all"
          >
            <X size={13} />
            <span>Ponastavi filtre ({activeFilterCount})</span>
          </button>
        )}
      </div>

      {/* Main Filter Chips & Dropdowns */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Delivery Option Quick Toggle */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/60">
          <button
            onClick={() => handleDeliveryChange('shipping')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filters.delivery_option === 'shipping'
                ? 'bg-[#0A1128] text-white shadow-sm'
                : 'text-slate-600 hover:text-[#0A1128]'
            }`}
          >
            <Truck size={13} className={filters.delivery_option === 'shipping' ? 'text-[#FEBA4F]' : ''} />
            <span>Pošiljanje po pošti</span>
          </button>
          <button
            onClick={() => handleDeliveryChange('pickup')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filters.delivery_option === 'pickup'
                ? 'bg-[#0A1128] text-white shadow-sm'
                : 'text-slate-600 hover:text-[#0A1128]'
            }`}
          >
            <MapPin size={13} className={filters.delivery_option === 'pickup' ? 'text-[#FEBA4F]' : ''} />
            <span>Osebni prevzem</span>
          </button>
        </div>

        {/* Condition Filter */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/60">
          {['Novo', 'Kot novo', 'Rabljeno'].map((c) => (
            <button
              key={c}
              onClick={() => handleConditionChange(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filters.condition === c
                  ? 'bg-[#0A1128] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0A1128]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Category Specific Selects */}
        {definitions.slice(0, 4).map((def) => {
          const selectedVal = filters.specifications[def.key] || '';
          return (
            <div key={def.key} className="relative">
              <select
                value={selectedVal}
                onChange={(e) => handleSpecChange(def.key, e.target.value)}
                className={`text-xs font-bold py-2 px-3 pr-7 rounded-2xl border-2 transition-all outline-none appearance-none cursor-pointer ${
                  selectedVal
                    ? 'bg-[#0A1128] text-[#FEBA4F] border-[#FEBA4F] shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <option value="">{def.label}</option>
                {def.options
                  .filter((opt) => opt !== 'Drugo')
                  .map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Active tags overview */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1">
            Uveljavljeni filtri:
          </span>
          {filters.delivery_option && (
            <span className="inline-flex items-center gap-1 bg-[#0A1128] text-white text-[11px] font-bold px-2.5 py-1 rounded-xl">
              <span>{filters.delivery_option === 'pickup' ? 'Osebni prevzem' : 'Pošiljanje'}</span>
              <X size={12} className="cursor-pointer hover:text-red-400" onClick={() => handleDeliveryChange(filters.delivery_option!)} />
            </span>
          )}
          {filters.condition && (
            <span className="inline-flex items-center gap-1 bg-[#0A1128] text-white text-[11px] font-bold px-2.5 py-1 rounded-xl">
              <span>Stanje: {filters.condition}</span>
              <X size={12} className="cursor-pointer hover:text-red-400" onClick={() => handleConditionChange(filters.condition!)} />
            </span>
          )}
          {Object.entries(filters.specifications).map(([k, v]) => {
            if (!v) return null;
            return (
              <span key={k} className="inline-flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 text-[#0A1128] text-[11px] font-bold px-2.5 py-1 rounded-xl">
                <span>{v}</span>
                <X size={12} className="cursor-pointer hover:text-red-600" onClick={() => handleSpecChange(k, v)} />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
