import React, { useState, useMemo } from 'react';
import { Category, Region, AuctionItem } from '../../types';
import { getAttributeDefinitionsForCategory, getFieldOptions } from '../../lib/categoryAttributes';
import { getCategoryTranslation } from '../../lib/translations';
import { matchesSelectedRegion } from '../../lib/utils';
import { Filter, X, Truck, MapPin, Check, ChevronDown, Sparkles, Search } from '../icons';
import { Portal } from '../ui/Portal';

// Filterzustand mit Arrays für Mehrfachauswahl
export interface FilterState {
  delivery_options: string[];
  conditions: string[];
  specifications: Record<string, string[]>;
}

interface CategoryFilterBarProps {
  category: Category | null;
  selectedCategories?: Category[];
  selectedRegions?: Region[];
  onCategoriesChange?: (cats: Category[]) => void;
  onRegionsChange?: (regs: Region[]) => void;
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  onResetFilters: () => void;
  totalResultsCount: number;
  showDesktopPanel?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  auctions?: AuctionItem[];
}

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  category,
  selectedCategories = [],
  selectedRegions = [],
  onCategoriesChange,
  onRegionsChange,
  filters,
  onFilterChange,
  onResetFilters,
  totalResultsCount,
  showDesktopPanel = true,
  isMobileOpen = false,
  onCloseMobile,
  auctions = []
}) => {
  // Spezifikationen nur anzeigen, wenn genau eine Kategorie ausgewählt ist
  const activeSingleCategory = selectedCategories.length === 1 ? selectedCategories[0] : (category ?? null);
  const definitions = activeSingleCategory ? getAttributeDefinitionsForCategory(activeSingleCategory) : [];

  // Einklappbare Abschnitte für den Filter-Panel
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const isSectionOpen = (id: string) => !collapsedSections[id];

  // Berechnung der Anzahl der Auktionsartikel pro Kategorie/Region
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!auctions) return counts;
    auctions.forEach(a => {
      if (a.status === 'active') {
        counts[a.category] = (counts[a.category] || 0) + 1;
      }
    });
    return counts;
  }, [auctions]);

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!auctions) return counts;
    const allRegions = Object.values(Region);
    allRegions.forEach(r => {
      counts[r] = auctions.filter(a => a.status === 'active' && matchesSelectedRegion(a.region, r)).length;
    });
    return counts;
  }, [auctions]);

  // Handler für Kategorie-Checkboxen
  const handleCategoryToggle = (cat: Category) => {
    if (!onCategoriesChange) return;
    if (selectedCategories.includes(cat)) {
      onCategoriesChange(selectedCategories.filter(c => c !== cat));
    } else {
      onCategoriesChange([...selectedCategories, cat]);
    }
  };

  // Handler für Regionen-Checkboxen
  const handleRegionToggle = (reg: Region) => {
    if (!onRegionsChange) return;
    if (selectedRegions.includes(reg)) {
      onRegionsChange(selectedRegions.filter(r => r !== reg));
    } else {
      onRegionsChange([...selectedRegions, reg]);
    }
  };

  // Handler für Lieferoptionen-Mehrfachauswahl
  const handleDeliveryToggle = (val: string) => {
    const current = filters.delivery_options || [];
    const updated = current.includes(val)
      ? current.filter(v => v !== val)
      : [...current, val];
    onFilterChange({
      ...filters,
      delivery_options: updated
    });
  };

  // Handler für Zustands-Mehrfachauswahl
  const handleConditionToggle = (val: string) => {
    const current = filters.conditions || [];
    const updated = current.includes(val)
      ? current.filter(v => v !== val)
      : [...current, val];
    onFilterChange({
      ...filters,
      conditions: updated
    });
  };

  // Handler für Spezifikations-Mehrfachauswahl
  const handleSpecToggle = (key: string, val: string) => {
    const current = filters.specifications[key] || [];
    const updated = current.includes(val)
      ? current.filter(v => v !== val)
      : [...current, val];
    
    const newSpecs = { ...filters.specifications };
    if (updated.length === 0) {
      delete newSpecs[key];
    } else {
      newSpecs[key] = updated;
    }
    onFilterChange({
      ...filters,
      specifications: newSpecs
    });
  };

  // Gesamtzahl aller aktiven Filter
  const activeFilterCount = 
    selectedCategories.length +
    selectedRegions.length +
    (filters.delivery_options?.length || 0) +
    (filters.conditions?.length || 0) +
    Object.values(filters.specifications || {}).reduce((acc, vals) => acc + (vals?.length || 0), 0);

  const allCategories = Object.values(Category);
  const allRegions = Object.values(Region);

  const renderFilterSections = () => (
    <div className="space-y-4">
      {/* Top Header & Reset */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0A1128] text-[#FEBA4F] flex items-center justify-center shadow-sm">
            <Filter size={14} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-[#0A1128]">
            Filtri {selectedCategories.length > 0 ? `(${selectedCategories.length})` : ''}
          </span>
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-bold text-[11px] transition-all"
          >
            <X size={12} />
            <span>Počisti vse ({activeFilterCount})</span>
          </button>
        )}
      </div>

      {/* 1. Kategorije Checkbox-Gruppe */}
      <div className="border-b border-slate-100 pb-3">
        <button
          type="button"
          onClick={() => toggleSection('categories')}
          className="flex items-center justify-between w-full py-2 text-left font-black text-xs uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span>Kategorije</span>
            {selectedCategories.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#FEBA4F] text-[#0A1128] text-[10px] font-bold">
                {selectedCategories.length}
              </span>
            )}
          </div>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${
              isSectionOpen('categories') ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isSectionOpen('categories') && (
          <div className="pt-2 space-y-1.5 max-h-60 overflow-y-auto pr-1 animate-in fade-in duration-150">
            {allCategories.map((cat) => {
              const isChecked = selectedCategories.includes(cat);
              const count = categoryCounts[cat] ?? 0;
              return (
                <label
                  key={cat}
                  className="flex items-center gap-2.5 text-xs font-bold text-slate-700 hover:text-[#0A1128] cursor-pointer py-1 px-1 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleCategoryToggle(cat)}
                    className="w-5 h-5 rounded border-slate-300 text-[#0A1128] focus:ring-[#FEBA4F] cursor-pointer"
                  />
                  <span className="flex-1 truncate">{getCategoryTranslation(cat, ((k: string) => k) as any)}</span>
                  <span className="text-[11px] text-slate-400 font-semibold">({count})</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Regije Checkbox-Gruppe */}
      <div className="border-b border-slate-100 pb-3">
        <button
          type="button"
          onClick={() => toggleSection('regions')}
          className="flex items-center justify-between w-full py-2 text-left font-black text-xs uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span>Regije</span>
            {selectedRegions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#FEBA4F] text-[#0A1128] text-[10px] font-bold">
                {selectedRegions.length}
              </span>
            )}
          </div>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${
              isSectionOpen('regions') ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isSectionOpen('regions') && (
          <div className="pt-2 space-y-1.5 max-h-60 overflow-y-auto pr-1 animate-in fade-in duration-150">
            {allRegions.map((reg) => {
              const isChecked = selectedRegions.includes(reg);
              const count = regionCounts[reg] ?? 0;
              return (
                <label
                  key={reg}
                  className="flex items-center gap-2.5 text-xs font-bold text-slate-700 hover:text-[#0A1128] cursor-pointer py-1 px-1 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleRegionToggle(reg)}
                    className="w-5 h-5 rounded border-slate-300 text-[#0A1128] focus:ring-[#FEBA4F] cursor-pointer"
                  />
                  <span className="flex-1 truncate">{reg}</span>
                  <span className="text-[11px] text-slate-400 font-semibold">({count})</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Delivery Options */}
      <div className="border-b border-slate-100 pb-3">
        <button
          type="button"
          onClick={() => toggleSection('delivery')}
          className="flex items-center justify-between w-full py-2 text-left font-black text-xs uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span>Dostava</span>
            {(filters.delivery_options?.length || 0) > 0 && (
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
            {[
              { id: 'shipping', label: 'Pošiljanje po pošti', icon: Truck },
              { id: 'pickup', label: 'Osebni prevzem', icon: MapPin }
            ].map(({ id, label, icon: Icon }) => {
              const isChecked = (filters.delivery_options || []).includes(id);
              return (
                <label
                  key={id}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isChecked
                      ? 'bg-[#0A1128] text-[#FEBA4F] shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#0A1128]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleDeliveryToggle(id)}
                    className="w-5 h-5 rounded border-slate-300 text-[#0A1128] focus:ring-[#FEBA4F] cursor-pointer"
                  />
                  <Icon size={13} className={isChecked ? 'text-[#FEBA4F]' : ''} />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Item Condition */}
      <div className="border-b border-slate-100 pb-3">
        <button
          type="button"
          onClick={() => toggleSection('condition')}
          className="flex items-center justify-between w-full py-2 text-left font-black text-xs uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span>Stanje predmeta</span>
            {(filters.conditions?.length || 0) > 0 && (
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
              const isChecked = (filters.conditions || []).includes(c);
              return (
                <label
                  key={c}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isChecked
                      ? 'bg-[#0A1128] text-[#FEBA4F] shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#0A1128]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleConditionToggle(c)}
                    className="w-5 h-5 rounded border-slate-300 text-[#0A1128] focus:ring-[#FEBA4F] cursor-pointer"
                  />
                  <span>{c}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Hint when NOT exactly 1 category is selected */}
      {selectedCategories.length !== 1 && (
        <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200/60 text-[11px] font-bold text-amber-900 flex items-start gap-2">
          <Sparkles size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <span>Izberite natanko eno kategorijo za dodatne filtre (velikost, znamka ...)</span>
        </div>
      )}

      {/* 6. Category-Specific Specifications (only if exactly 1 category is selected) */}
      {selectedCategories.length === 1 && definitions.map((def) => {
        const selectedVals = filters.specifications[def.key] || [];
        // Deutscher Kommentar: Abhaengige Felder (Modell) zeigen nur Optionen der gewaehlten Marken; ohne Marke wird das Feld ausgeblendet
        const fieldOptions = def.optionsByParent ? getFieldOptions(def, filters.specifications as any) : def.options;
        if (def.optionsByParent && fieldOptions.length === 0) return null;
        const isLongList = fieldOptions.length > 12;
        const searchQuery = (searchQueries[def.key] || '').toLowerCase().trim();
        const visibleOptions = isLongList
          ? fieldOptions.filter(opt => !searchQuery || opt.toLowerCase().includes(searchQuery))
          : fieldOptions;

        return (
          <div key={def.key} className="border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => toggleSection(def.key)}
              className="flex items-center justify-between w-full py-2 text-left font-black text-xs uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span>{def.label}</span>
                {selectedVals.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#FEBA4F] text-[#0A1128] text-[10px] font-bold">
                    {selectedVals.length}
                  </span>
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

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {visibleOptions.map((opt) => {
                    const isChecked = selectedVals.includes(opt);
                    return (
                      <label
                        key={opt}
                        className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                          isChecked
                            ? 'bg-[#0A1128] text-[#FEBA4F] shadow-sm'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSpecToggle(def.key, opt)}
                          className="w-5 h-5 rounded border-slate-300 text-[#0A1128] focus:ring-[#FEBA4F] cursor-pointer"
                        />
                        <span className="truncate flex-1">{opt}</span>
                      </label>
                    );
                  })}
                  {visibleOptions.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic py-1 text-center">Ni zadetkov</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Button Počisti vse filtre at bottom of panel */}
      <div className="pt-3 border-t border-slate-100 flex flex-col items-center gap-2">
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onResetFilters}
            className="w-full py-2.5 px-4 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-bold text-xs transition-all flex items-center justify-center gap-2"
          >
            <X size={14} />
            <span>Počisti vse filtre ({activeFilterCount})</span>
          </button>
        )}
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
                    {activeSingleCategory && (
                      <span className="text-[11px] font-bold text-[#FEBA4F] block">
                        {activeSingleCategory}
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
