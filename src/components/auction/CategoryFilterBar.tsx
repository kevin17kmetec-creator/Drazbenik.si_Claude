import React, { useState } from 'react';
import { Category } from '../../types';
import { getAttributeDefinitionsForCategory } from '../../lib/categoryAttributes';
import { Filter, X, Truck, MapPin, Check, ChevronDown, Sparkles, Search } from 'lucide-react';
import { Portal } from '../ui/Portal';

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
  showDesktopPanel?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  category,
  filters,
  onFilterChange,
  onResetFilters,
  totalResultsCount,
  showDesktopPanel = true,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const definitions = category ? getAttributeDefinitionsForCategory(category) : [];

  // Collapsible section state: open by default unless explicitly closed
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const isSectionOpen = (id: string) => !collapsedSections[id];

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

  const renderFilterSections = () => (
    <div className="space-y-4">
      {/* Top Header & Reset */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0A1128] text-[#FEBA4F] flex items-center justify-center shadow-sm">
            <Filter size={14} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-[#0A1128]">
            Filtri {category ? `• ${category}` : ''}
          </span>
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-bold text-[11px] transition-all"
          >
            <X size={12} />
            <span>Počisti vse filtre ({activeFilterCount})</span>
          </button>
        )}
      </div>

      {/* 1. Generic Delivery Options */}
      <div className="border-b border-slate-100 pb-3">
        <button
          type="button"
          onClick={() => toggleSection('delivery')}
          className="flex items-center justify-between w-full py-2 text-left font-black text-xs uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span>Dostava</span>
            {filters.delivery_option && (
              <span className="w-2 h-2 rounded-full bg-[#FEBA4F]" />
            )}
          </div>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${
              isSectionOpen('delivery') ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isSectionOpen('delivery') && (
          <div className="pt-2 flex flex-wrap gap-2 animate-in fade-in duration-150">
            <button
              type="button"
              onClick={() => handleDeliveryChange('shipping')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filters.delivery_option === 'shipping'
                  ? 'bg-[#0A1128] text-[#FEBA4F] shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#0A1128]'
              }`}
            >
              <Truck size={13} className={filters.delivery_option === 'shipping' ? 'text-[#FEBA4F]' : ''} />
              <span>Pošiljanje po pošti</span>
              {filters.delivery_option === 'shipping' && <Check size={12} className="text-[#FEBA4F]" />}
            </button>
            <button
              type="button"
              onClick={() => handleDeliveryChange('pickup')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filters.delivery_option === 'pickup'
                  ? 'bg-[#0A1128] text-[#FEBA4F] shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#0A1128]'
              }`}
            >
              <MapPin size={13} className={filters.delivery_option === 'pickup' ? 'text-[#FEBA4F]' : ''} />
              <span>Osebni prevzem</span>
              {filters.delivery_option === 'pickup' && <Check size={12} className="text-[#FEBA4F]" />}
            </button>
          </div>
        )}
      </div>

      {/* 2. Generic Item Condition */}
      <div className="border-b border-slate-100 pb-3">
        <button
          type="button"
          onClick={() => toggleSection('condition')}
          className="flex items-center justify-between w-full py-2 text-left font-black text-xs uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span>Stanje predmeta</span>
            {filters.condition && (
              <span className="w-2 h-2 rounded-full bg-[#FEBA4F]" />
            )}
          </div>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${
              isSectionOpen('condition') ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isSectionOpen('condition') && (
          <div className="pt-2 flex flex-wrap gap-2 animate-in fade-in duration-150">
            {['Novo', 'Kot novo', 'Rabljeno'].map((c) => {
              const isSelected = filters.condition === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleConditionChange(c)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#0A1128] text-[#FEBA4F] shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#0A1128]'
                  }`}
                >
                  <span>{c}</span>
                  {isSelected && <Check size={12} className="text-[#FEBA4F]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Hint when NO category is selected */}
      {!category && (
        <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200/60 text-[11px] font-bold text-amber-900 flex items-start gap-2">
          <Sparkles size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <span>Izberite kategorijo za dodatne filtre (velikost, znamka ...)</span>
        </div>
      )}

      {/* 4. Category-Specific Specifications */}
      {category && definitions.map((def) => {
        const selectedVal = filters.specifications[def.key] || '';
        const isLongList = def.options.length > 12;
        const searchQuery = (searchQueries[def.key] || '').toLowerCase().trim();
        const visibleOptions = isLongList
          ? def.options.filter(opt => !searchQuery || opt.toLowerCase().includes(searchQuery))
          : def.options;

        return (
          <div key={def.key} className="border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => toggleSection(def.key)}
              className="flex items-center justify-between w-full py-2 text-left font-black text-xs uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span>{def.label}</span>
                {selectedVal && (
                  <span className="w-2 h-2 rounded-full bg-[#FEBA4F]" />
                )}
              </div>
              <ChevronDown
                size={16}
                className={`text-slate-400 transition-transform duration-200 ${
                  isSectionOpen(def.key) ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isSectionOpen(def.key) && (
              <div className="pt-2 animate-in fade-in duration-150">
                {isLongList && (
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchQueries[def.key] || ''}
                      onChange={(e) => setSearchQueries(prev => ({ ...prev, [def.key]: e.target.value }))}
                      placeholder="Išči..."
                      className="w-full text-xs font-medium pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#FEBA4F] transition-colors"
                    />
                  </div>
                )}

                {isLongList ? (
                  <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
                    {visibleOptions.map((opt) => {
                      const isSelected = selectedVal === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleSpecChange(def.key, opt)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-[#0A1128] text-[#FEBA4F] shadow-sm'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">{opt}</span>
                          {isSelected && <Check size={12} className="text-[#FEBA4F] flex-shrink-0" />}
                        </button>
                      );
                    })}
                    {visibleOptions.length === 0 && (
                      <p className="text-[11px] text-slate-400 italic py-1 text-center">Ni zadetkov</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {visibleOptions.map((opt) => {
                      const isSelected = selectedVal === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleSpecChange(def.key, opt)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#0A1128] text-[#FEBA4F] shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#0A1128]'
                          }`}
                        >
                          <span>{opt}</span>
                          {isSelected && <Check size={12} className="text-[#FEBA4F]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Bottom Result Count */}
      <div className="pt-3 border-t border-slate-100 text-center">
        <span className="text-xs font-black text-slate-400">
          {totalResultsCount} rezultatov
        </span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Vertical Panel */}
      {showDesktopPanel && (
        <aside className="hidden lg:block w-[280px] sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-5">
          {renderFilterSections()}
        </aside>
      )}

      {/* Mobile Drawer (Left drawer / bottom sheet) */}
      {isMobileOpen && (
        <Portal>
          <div className="fixed inset-0 z-[2000] lg:hidden animate-in fade-in duration-200">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-[#0A1128]/60 backdrop-blur-sm transition-opacity"
              onClick={onCloseMobile}
            />
            {/* Drawer Panel */}
            <div className="fixed inset-y-0 left-0 w-full max-w-xs sm:max-w-sm bg-white shadow-2xl flex flex-col z-[2000] animate-in slide-in-from-left duration-200">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#0A1128] text-[#FEBA4F] flex items-center justify-center shadow-sm">
                    <Filter size={15} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-[#0A1128]">
                      Filtri
                    </h3>
                    {category && (
                      <span className="text-[11px] font-bold text-[#FEBA4F] block">
                        {category}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="p-2 text-slate-400 hover:text-[#0A1128] rounded-xl hover:bg-slate-200 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {renderFilterSections()}
              </div>

              {/* Footer with Apply Button */}
              <div className="p-4 border-t border-slate-100 bg-white shadow-lg">
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#0A1128] text-[#FEBA4F] font-black text-xs uppercase tracking-wider shadow-lg hover:bg-[#142247] transition-all flex items-center justify-center gap-2"
                >
                  <span>Prikaži rezultate ({totalResultsCount})</span>
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
};
