import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { CompanyProfile } from '../types';

export interface SearchableSupplierDropdownProps {
  value: string;
  onChange: (supplierName: string) => void;
  companyProfiles: CompanyProfile[];
  onAddNewCompany?: () => void;
  defaultRegisteredSupplierName?: string;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  filterOnlySuppliers?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const SearchableSupplierDropdown: React.FC<SearchableSupplierDropdownProps> = ({
  value,
  onChange,
  companyProfiles = [],
  onAddNewCompany,
  defaultRegisteredSupplierName,
  placeholder = 'Search & select company...',
  className = '',
  compact = false,
  filterOnlySuppliers = false,
  disabled = false,
  autoFocus = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter company profiles based on search query
  const filteredProfiles = useMemo(() => {
    let list = companyProfiles;
    if (filterOnlySuppliers) {
      list = list.filter(c => (c.category || '').toLowerCase().includes('supplier'));
    }
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.contactPerson && c.contactPerson.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phoneNumber && c.phoneNumber.includes(q)) ||
      (c.gstNumber && c.gstNumber.toLowerCase().includes(q)) ||
      (c.category && c.category.toLowerCase().includes(q))
    );
  }, [companyProfiles, searchQuery, filterOnlySuppliers]);

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredProfiles.length, isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-dropdown-item]');
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const isDefaultSelected = Boolean(
    defaultRegisteredSupplierName &&
    value &&
    value.toLowerCase().trim() === defaultRegisteredSupplierName.toLowerCase().trim()
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredProfiles.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredProfiles.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && filteredProfiles[highlightedIndex]) {
        const selected = filteredProfiles[highlightedIndex];
        onChange(selected.name);
        setSearchQuery(selected.name);
        setIsOpen(false);
      } else if (filteredProfiles.length === 1) {
        onChange(filteredProfiles[0].name);
        setSearchQuery(filteredProfiles[0].name);
        setIsOpen(false);
      } else if (searchQuery.trim()) {
        onChange(searchQuery.trim());
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  if (compact) {
    return (
      <div className={`relative inline-block ${className}`} ref={dropdownRef}>
        {/* Compact Trigger Button / Input */}
        <div
          onClick={() => {
            if (!disabled) {
              setIsOpen(prev => !prev);
              if (!isOpen) {
                setSearchQuery('');
                setTimeout(() => inputRef.current?.focus(), 50);
              }
            }
          }}
          className={`flex items-center justify-between gap-1.5 px-2.5 py-1 text-xs border rounded-lg cursor-pointer transition-all ${
            isOpen
              ? 'bg-white border-[#8EBF45] ring-2 ring-[#8EBF45]/20 shadow-sm'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className="text-slate-400 text-xs">🏢</span>
          <span className="font-bold text-slate-800 truncate max-w-[150px]">
            {value || <span className="text-slate-400 font-normal">{placeholder}</span>}
          </span>
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearchQuery('');
              }}
              className="text-slate-400 hover:text-slate-700 p-0.5 text-[10px] font-bold"
              title="Clear selection"
            >
              ✕
            </button>
          )}
          <span className="text-slate-400 text-[9px]">▼</span>
        </div>

        {/* Compact Dropdown Popover */}
        {isOpen && (
          <div className="absolute z-50 left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-100">
            {/* Search Input Bar */}
            <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-1.5">
              <span className="text-slate-400 text-xs">🔍</span>
              <input
                ref={inputRef}
                type="text"
                placeholder="Type to search companies..."
                className="w-full bg-white px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[#8EBF45] focus:border-[#8EBF45]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus={autoFocus || true}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold px-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* List */}
            <div ref={listRef} className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {filteredProfiles.length > 0 ? (
                filteredProfiles.map((comp, idx) => {
                  const isSelected = value && value.toLowerCase().trim() === comp.name.toLowerCase().trim();
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <div
                      key={comp.id || idx}
                      data-dropdown-item
                      onClick={() => {
                        onChange(comp.name);
                        setSearchQuery(comp.name);
                        setIsOpen(false);
                      }}
                      className={`p-2 hover:bg-emerald-50/70 cursor-pointer transition-colors text-left ${
                        isSelected ? 'bg-emerald-50 border-l-4 border-[#8EBF45]' : ''
                      } ${isHighlighted ? 'bg-slate-100' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-slate-900 text-xs truncate">{comp.name}</span>
                        {comp.category && (
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded shrink-0">
                            {comp.category.replace('Supplier: ', '')}
                          </span>
                        )}
                      </div>
                      {(comp.contactPerson || comp.phoneNumber || comp.gstNumber) && (
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {[comp.contactPerson, comp.phoneNumber, comp.gstNumber].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-3 text-center text-xs text-slate-400 italic">
                  No company matching &quot;{searchQuery}&quot;
                </div>
              )}
            </div>

            {/* Add New Action Footer */}
            {onAddNewCompany && (
              <div className="p-2 border-t border-slate-100 bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onAddNewCompany();
                  }}
                  className="w-full py-1 text-center text-xs font-bold text-[#658C3E] hover:text-[#4d6a2f] hover:bg-emerald-100/50 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <span>➕ Add New Company...</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Standard Full-Width Mode
  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      {/* Input / Control Bar */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(prev => !prev);
            if (!isOpen) {
              setSearchQuery('');
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }
        }}
        className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
          isOpen
            ? 'bg-white border-[#8EBF45] ring-2 ring-[#8EBF45]/20 shadow-sm'
            : 'border-slate-200 hover:border-slate-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 overflow-hidden w-full">
          <span className="text-slate-400 shrink-0 text-sm">🏢</span>
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            className="bg-transparent border-none outline-none w-full text-xs font-bold text-slate-900 placeholder-slate-400 cursor-pointer"
            value={isOpen ? searchQuery : (value || '')}
            disabled={disabled}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              if (!isOpen) setIsOpen(true);
              onChange(val);
            }}
            onFocus={() => {
              setSearchQuery('');
              setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isDefaultSelected && (
            <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded border border-emerald-300 whitespace-nowrap">
              ✨ Default
            </span>
          )}
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearchQuery('');
              }}
              className="text-slate-400 hover:text-slate-700 p-0.5 text-xs font-bold transition-colors"
              title="Clear selection"
            >
              ✕
            </button>
          )}
          <span className="text-slate-400 text-[10px] ml-0.5">▼</span>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-100">
          {/* Header */}
          <div className="p-2 bg-slate-50 border-b border-slate-100 sticky top-0 z-10 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              {filteredProfiles.length} of {companyProfiles.length} Companies
            </span>
            {defaultRegisteredSupplierName && (
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Registered Default: {defaultRegisteredSupplierName}
              </span>
            )}
          </div>

          {/* List of Companies */}
          <div ref={listRef} className="divide-y divide-slate-100">
            {filteredProfiles.length > 0 ? (
              filteredProfiles.map((comp, idx) => {
                const isSelected = value && value.toLowerCase().trim() === comp.name.toLowerCase().trim();
                const isDefaultComp = Boolean(
                  defaultRegisteredSupplierName &&
                  comp.name.toLowerCase().trim() === defaultRegisteredSupplierName.toLowerCase().trim()
                );
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={comp.id || idx}
                    data-dropdown-item
                    onClick={() => {
                      onChange(comp.name);
                      setSearchQuery(comp.name);
                      setIsOpen(false);
                    }}
                    className={`p-2.5 hover:bg-emerald-50/70 cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                      isSelected ? 'bg-emerald-50 border-l-4 border-[#8EBF45]' : ''
                    } ${isHighlighted ? 'bg-slate-100' : ''}`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-xs">{comp.name}</span>
                        {isDefaultComp && (
                          <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1 rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium flex-wrap">
                        {comp.contactPerson && <span>👤 {comp.contactPerson}</span>}
                        {comp.phoneNumber && <span>📞 {comp.phoneNumber}</span>}
                        {comp.email && <span>✉️ {comp.email}</span>}
                        {comp.gstNumber && <span className="font-mono">GST: {comp.gstNumber}</span>}
                      </div>
                    </div>
                    {comp.category && (
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full border border-slate-200 shrink-0">
                        {comp.category.replace('Supplier: ', '')}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 font-medium">
                No company found matching &quot;{searchQuery}&quot;
              </div>
            )}
          </div>

          {/* Add New Company Button */}
          {onAddNewCompany && (
            <div className="p-2 bg-slate-50 border-t border-slate-100 sticky bottom-0 z-10">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddNewCompany();
                }}
                className="w-full py-1.5 px-3 bg-white hover:bg-emerald-50 text-[#658C3E] border border-emerald-200 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-2xs"
              >
                <span>➕ Add New Company Profile</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
