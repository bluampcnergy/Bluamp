import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { SupplyRecord, CompanyProfile, ReceivedGood, User, View, Recipe } from '../types';
import { Plus, Trash2, Search, RefreshCw } from './invoices/Icons';
import { generateRFQTextOpenRouter } from '../services/openrouterService';
import { getItemStockAlertInfo } from '../utils/stockAlerts';
import { FindSupplierTab } from './FindSupplierTab';
import { InboundTrackingTab } from './InboundTrackingTab';

interface SuppliesRecordProps {
  suppliesRecords: SupplyRecord[];
  setSuppliesRecords: React.Dispatch<React.SetStateAction<SupplyRecord[]>>;
  companyProfiles: CompanyProfile[];
  setCompanyProfiles?: React.Dispatch<React.SetStateAction<CompanyProfile[]>>;
  receivedGoods?: ReceivedGood[];
  setReceivedGoods?: React.Dispatch<React.SetStateAction<ReceivedGood[]>>;
  recipes?: Recipe[];
  addLogEntry: (action: string, details: string) => void;
  currentUser: User | null;
  setView?: (view: View) => void;
}

interface SearchableSupplierDropdownProps {
  value: string;
  onChange: (supplierName: string) => void;
  companyProfiles: CompanyProfile[];
  onAddNewCompany: () => void;
  defaultRegisteredSupplierName?: string;
}

const SearchableSupplierDropdown: React.FC<SearchableSupplierDropdownProps> = ({
  value,
  onChange,
  companyProfiles,
  onAddNewCompany,
  defaultRegisteredSupplierName
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    const q = searchQuery.toLowerCase().trim();
    if (!q) return companyProfiles;
    return companyProfiles.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.contactPerson && c.contactPerson.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phoneNumber && c.phoneNumber.includes(q)) ||
      (c.gstNumber && c.gstNumber.toLowerCase().includes(q))
    );
  }, [companyProfiles, searchQuery]);

  const isDefaultSelected = Boolean(
    defaultRegisteredSupplierName &&
    value &&
    value.toLowerCase().trim() === defaultRegisteredSupplierName.toLowerCase().trim()
  );

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Input / Control Bar */}
      <div
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
          isOpen
            ? 'bg-white border-[#8EBF45] ring-2 ring-[#8EBF45]/20 shadow-sm'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden w-full">
          <span className="text-slate-400 shrink-0 text-sm">🏢</span>
          <input
            type="text"
            placeholder="Search & select supplier company..."
            className="bg-transparent border-none outline-none w-full text-xs font-bold text-slate-900 placeholder-slate-400 cursor-pointer"
            value={isOpen ? searchQuery : (value || '')}
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
          {filteredProfiles.length > 0 ? (
            filteredProfiles.map((comp) => {
              const isSelected = value.toLowerCase().trim() === comp.name.toLowerCase().trim();
              const isDefaultComp = Boolean(
                defaultRegisteredSupplierName &&
                comp.name.toLowerCase().trim() === defaultRegisteredSupplierName.toLowerCase().trim()
              );

              return (
                <div
                  key={comp.id}
                  onClick={() => {
                    onChange(comp.name);
                    setSearchQuery(comp.name);
                    setIsOpen(false);
                  }}
                  className={`p-2.5 hover:bg-emerald-50/70 cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                    isSelected ? 'bg-emerald-50 border-l-4 border-[#8EBF45]' : ''
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-xs">{comp.name}</span>
                      {isDefaultComp && (
                        <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2 rounded border border-emerald-300">
                          ✨ Default Registered
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {comp.contactPerson && <span>👤 {comp.contactPerson}</span>}
                      {comp.email && <span>✉️ {comp.email}</span>}
                      {comp.phoneNumber && <span>📞 {comp.phoneNumber}</span>}
                    </div>
                  </div>
                  {isSelected && <span className="text-emerald-600 font-black text-xs">✓</span>}
                </div>
              );
            })
          ) : (
            <div className="p-3 text-center text-xs text-slate-400 font-medium">
              No matching registered company found for "{searchQuery}".
            </div>
          )}

          {/* Custom Typed Name Option */}
          {searchQuery && !filteredProfiles.some(c => c.name.toLowerCase() === searchQuery.toLowerCase()) && (
            <div
              onClick={() => {
                onChange(searchQuery);
                setIsOpen(false);
              }}
              className="p-2.5 hover:bg-slate-100 cursor-pointer text-xs font-bold text-slate-700 flex items-center gap-2 border-t"
            >
              <span>✏️</span>
              <span>Use custom supplier name: <span className="text-slate-900 font-extrabold">"{searchQuery}"</span></span>
            </div>
          )}

          {/* Add New Company Button */}
          <div
            onClick={() => {
              setIsOpen(false);
              onAddNewCompany();
            }}
            className="p-2.5 bg-slate-50 hover:bg-emerald-100/60 text-emerald-700 font-black text-xs cursor-pointer flex items-center justify-center gap-1.5 border-t sticky bottom-0"
          >
            <span>➕</span>
            <span>+ Add New Supplier Profile...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const SuppliesRecord: React.FC<SuppliesRecordProps> = ({
  suppliesRecords,
  setSuppliesRecords,
  companyProfiles,
  setCompanyProfiles,
  receivedGoods = [],
  setReceivedGoods,
  recipes = [],
  addLogEntry,
  currentUser,
  setView
}) => {
  const [mainTab, setMainTab] = useState<'procurement' | 'tracking' | 'find_suppliers'>('procurement');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('');
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'to_be_ordered' | 'ordered' | 'delivered' | 'stock_alerts'>('to_be_ordered');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // SKU Build Capacity Search State (On-demand calculation)
  const [skuSearchQuery, setSkuSearchQuery] = useState('');
  const [calculatedResult, setCalculatedResult] = useState<{
    skuName: string;
    recipe?: Recipe;
    maxBuildable: number;
    bottleneck?: {
      name: string;
      requiredPerUnit: number;
      availableStock: number;
      maxBuildableFromThis: number;
      uom: string;
    };
    components: Array<{
      name: string;
      requiredPerUnit: number;
      availableStock: number;
      maxBuildableFromThis: number;
      uom: string;
      isBottleneck: boolean;
      status: 'bottleneck' | 'low' | 'sufficient';
      rawGoodId?: string;
    }>;
    hasExecuted: boolean;
  } | null>(null);

  // On-demand SKU build capacity calculation handler
  const handleCalculateSkuCapacity = useCallback((searchQueryOverride?: string) => {
    const query = (searchQueryOverride !== undefined ? searchQueryOverride : skuSearchQuery).trim();
    if (!query) {
      alert('Please select or enter a SKU / Model name to calculate build capacity.');
      return;
    }

    // Find matching Recipe in recipes list
    const targetRecipe = (recipes || []).find(r => 
      r.name.toLowerCase().trim() === query.toLowerCase().trim()
    ) || (recipes || []).find(r => 
      r.name.toLowerCase().includes(query.toLowerCase()) || query.toLowerCase().includes(r.name.toLowerCase())
    );

    if (!targetRecipe) {
      setCalculatedResult({
        skuName: query,
        maxBuildable: 0,
        components: [],
        hasExecuted: true
      });
      return;
    }

    // Map each component in the recipe to available inventory stock
    let minBuildable = Infinity;
    let bottleneckComp: any = null;

    const componentDetails = targetRecipe.components.map(comp => {
      const compName = (comp.masterItemName || '').toLowerCase().trim();
      
      const matchingGoods = receivedGoods.filter(g => {
        if (comp.receivedGoodId && g.id === comp.receivedGoodId) return true;
        if (compName && g.name.toLowerCase().trim() === compName) return true;
        if (compName && g.name.toLowerCase().includes(compName)) return true;
        return false;
      });

      const totalAvailable = matchingGoods.reduce((sum, g) => sum + (g.quantity || 0), 0);
      const uom = comp.uom || matchingGoods[0]?.uom || 'qty';
      const required = comp.quantityPerUnit || 1;
      const maxBuildableFromThis = Math.floor(totalAvailable / required);

      if (maxBuildableFromThis < minBuildable) {
        minBuildable = maxBuildableFromThis;
      }

      return {
        name: comp.masterItemName || matchingGoods[0]?.name || 'Unknown Component',
        requiredPerUnit: required,
        availableStock: totalAvailable,
        maxBuildableFromThis,
        uom,
        isBottleneck: false,
        status: 'sufficient' as 'bottleneck' | 'low' | 'sufficient',
        rawGoodId: matchingGoods[0]?.id
      };
    });

    const finalBuildable = minBuildable === Infinity ? 0 : Math.max(0, minBuildable);

    // Identify bottlenecks
    componentDetails.forEach(c => {
      if (c.maxBuildableFromThis === finalBuildable) {
        c.isBottleneck = true;
        c.status = 'bottleneck';
        if (!bottleneckComp) {
          bottleneckComp = c;
        }
      } else if (c.maxBuildableFromThis <= finalBuildable + 5) {
        c.status = 'low';
      }
    });

    setCalculatedResult({
      skuName: targetRecipe.name,
      recipe: targetRecipe,
      maxBuildable: finalBuildable,
      bottleneck: bottleneckComp,
      components: componentDetails,
      hasExecuted: true
    });
  }, [skuSearchQuery, recipes, receivedGoods]);
  
  // Modals
  const [isAdding, setIsAdding] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SupplyRecord | null>(null);
  const [rfqModalItem, setRfqModalItem] = useState<SupplyRecord | null>(null);
  const [generatedRfqText, setGeneratedRfqText] = useState<string>('');
  const [isGeneratingRfq, setIsGeneratingRfq] = useState<boolean>(false);
  
  const [isBulkMailModalOpen, setIsBulkMailModalOpen] = useState(false);
  const [bulkRfqTexts, setBulkRfqTexts] = useState<Record<string, string>>({});
  const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'COMPANY_ADDED') {
        setIsAddCompanyModalOpen(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAddCompanyModalOpen) {
        setIsAddCompanyModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddCompanyModalOpen]);

  const [webmailIframeModal, setWebmailIframeModal] = useState<{
    isOpen: boolean;
    to: string;
    subject: string;
    body: string;
  } | null>(null);

  const handleOpenWebmailIframe = (to: string, subject: string, body?: string) => {
    setWebmailIframeModal({
      isOpen: true,
      to: to || '',
      subject: subject || 'RFQ Inquiry - Datlion Cnergy',
      body: body || ''
    });
  };

  // Helper to resolve supplier particulars on-demand from record or companyProfiles
  const getResolvedSupplierInfo = useCallback((record: SupplyRecord) => {
    let email = record.contact_email || '';
    let phone = record.contact_number || '';
    let website = record.website_url || '';
    let contactName = record.contact_name || '';

    // If any field is missing, search companyProfiles on-demand
    if (!email || !phone || !website || !contactName) {
      const targetName = (record.supplier_id || record.from_company || record.item_name || '').toLowerCase().trim();
      const profile = companyProfiles.find(cp => 
        (cp.name && cp.name.toLowerCase().trim() === targetName) ||
        (cp.name && targetName.includes(cp.name.toLowerCase().trim())) ||
        (cp.name && cp.name.toLowerCase().trim().includes(targetName))
      );

      if (profile) {
        if (!email && profile.email) email = profile.email;
        if (!phone && profile.phoneNumber) phone = profile.phoneNumber;
        if (!contactName && profile.contactPerson) contactName = profile.contactPerson;
        if (!website && (profile as any).website) website = (profile as any).website;
      }
    }

    return { email, phone, website, contactName };
  }, [companyProfiles]);

  // Handle click on specific action button with on-demand particulars fetching
  const handleActionClick = useCallback((record: SupplyRecord, action: 'website' | 'whatsapp' | 'webmail' | 'ai_rfq') => {
    const info = getResolvedSupplierInfo(record);

    if (action === 'website') {
      let targetUrl = info.website;
      if (targetUrl) {
        if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      } else {
        const queryName = record.from_company || record.supplier_id || record.item_name;
        const query = encodeURIComponent(`${queryName} supplier catalog`);
        window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer');
      }
    } else if (action === 'whatsapp') {
      const phone = info.phone;
      const text = record.rfq_text || `Hello ${info.contactName || record.from_company || ''}, inquiring about ${record.item_name} quotation from Datlion Cnergy.`;
      if (phone) {
        window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      } else {
        const input = prompt(`No WhatsApp phone number found for ${record.from_company || record.item_name}.\nPlease enter contact phone number (e.g. +919876543210):`);
        if (input && input.trim()) {
          window.open(`https://wa.me/${input.trim().replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
        }
      }
    } else if (action === 'webmail') {
      const toEmail = info.email;
      const subject = `RFQ: ${record.item_name} - Datlion Cnergy`;
      const body = record.rfq_text || `Dear ${info.contactName || 'Sales Team'},\n\nPlease share your best quotation for ${record.item_name}.\n\nBest regards,\nProcurement Team\nDatlion Cnergy`;
      handleOpenWebmailIframe(toEmail, subject, body);
    } else if (action === 'ai_rfq') {
      handleGenerateAI_RFQ(record);
    }
  }, [getResolvedSupplierInfo, handleOpenWebmailIframe]);

  // File Ref for CSV Import
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<SupplyRecord>>({
    item_name: '',
    specification: '',
    supplier_id: '',
    from_company: '',
    to_company: '',
    website_url: '',
    contact_name: '',
    contact_number: '',
    contact_email: '',
    status: 'to_be_ordered',
    target_quantity: 100,
    uom: 'qty',
    rfq_text: ''
  });

  // Calculate stock alert metrics for all raw materials
  const rawMaterialAlertMap = useMemo(() => {
    const map = new Map<string, { isLowStock: boolean; isOutOfStock: boolean; percentRemaining: number; currentQty: number; thresholdQty: number; isIgnored: boolean; good: ReceivedGood }>();

    receivedGoods.forEach(good => {
      const info = getItemStockAlertInfo(good);
      map.set(good.name.toLowerCase().trim(), {
        isLowStock: info.isLowStock,
        isOutOfStock: info.isOutOfStock,
        percentRemaining: info.percentRemaining,
        currentQty: info.quantity,
        thresholdQty: info.thresholdQty,
        isIgnored: info.isIgnored,
        good
      });
    });

    return map;
  }, [receivedGoods]);

  // Auto-seed procurement dashboard from existing Raw Materials & Company Profiles with Database Sync
  const autoSeedFromInventory = useCallback(() => {
    if (!receivedGoods || receivedGoods.length === 0) return;

    // Build map of company names to company profiles
    const companyMap = new Map<string, CompanyProfile>();
    companyProfiles.forEach(c => {
      companyMap.set(c.name.toLowerCase().trim(), c);
    });

    const newSeeds: SupplyRecord[] = [];
    const existingNames = new Set(suppliesRecords.map(r => r.item_name.toLowerCase().trim()));

    // Group received goods by name/category
    const aggregatedGoods = new Map<string, ReceivedGood>();
    receivedGoods.forEach(good => {
      const key = `${good.name}_${good.supplier || ''}`.toLowerCase();
      if (!aggregatedGoods.has(key)) {
        aggregatedGoods.set(key, good);
      }
    });

    aggregatedGoods.forEach((good) => {
      if (existingNames.has(good.name.toLowerCase().trim())) return;

      const matchedCompany = good.supplier ? companyMap.get(good.supplier.toLowerCase().trim()) : undefined;
      const alertInfo = rawMaterialAlertMap.get(good.name.toLowerCase().trim());

      // If item has low stock, default status to 'to_be_ordered', otherwise 'delivered'
      const defaultStatus: 'to_be_ordered' | 'delivered' = (alertInfo?.isLowStock && !alertInfo.isIgnored)
        ? 'to_be_ordered'
        : 'delivered';

      const seedRecord: SupplyRecord = {
        id: crypto.randomUUID(),
        raw_good_id: good.id,
        item_name: good.name,
        specification: good.makeModel || `${good.category || 'Raw Material'} Component`,
        from_company: good.supplier || matchedCompany?.name || 'Primary Supplier',
        to_company: 'Datlion Cnergy Plant',
        supplier_id: matchedCompany?.id,
        website_url: matchedCompany ? `https://www.google.com/search?q=${encodeURIComponent(matchedCompany.name)}` : '',
        contact_name: matchedCompany?.contactPerson || 'Sales Desk',
        contact_number: matchedCompany?.phoneNumber || '',
        contact_email: matchedCompany?.email || '',
        status: defaultStatus,
        target_quantity: good.initialQuantity || good.quantity || 100,
        uom: (good.uom as any) || 'qty',
        rfq_text: '',
        is_ignored_for_alerts: Boolean(good.isIgnoredForAlerts),
        timestamp: Date.now(),
        created_by: 'Auto-Seed Engine'
      };

      newSeeds.push(seedRecord);
    });

    if (newSeeds.length > 0) {
      setSuppliesRecords(prev => [...newSeeds, ...prev]);
      addLogEntry('Procurement Database Sync', `Auto-populated ${newSeeds.length} procurement items from Inventory.`);
    }
  }, [receivedGoods, companyProfiles, suppliesRecords, setSuppliesRecords, addLogEntry, rawMaterialAlertMap]);

  // Initial auto-seed if suppliesRecords is empty
  useEffect(() => {
    if (suppliesRecords.length === 0 && receivedGoods.length > 0) {
      autoSeedFromInventory();
    }
  }, [suppliesRecords.length, receivedGoods.length, autoSeedFromInventory]);

  // CSV Import Handlers
  const handleCSVImportClick = () => {
    csvFileInputRef.current?.click();
  };

  const downloadCSVTemplate = () => {
    const headers = [
      'Product Name',
      'Specification',
      'Supplier',
      'Website',
      'Contact Name',
      'Contact Number',
      'Contact Email',
      'Status',
      'Target Quantity',
      'UOM'
    ];
    const sampleRows = [
      [
        'Grade-A 3.2V 280Ah LFP Cell',
        'M6 Terminals 6000 Cycles @ 80% DOD',
        'EVE Energy Co.',
        'https://www.evebattery.com',
        'Li Wei',
        '+86 13800138000',
        'sales@evebattery.com',
        'to_be_ordered',
        '200',
        'qty'
      ],
      [
        'Smart BMS 16S 200A Bluetooth',
        'CANbus RS485 Active Balancer',
        'JBD JK BMS Tech',
        'https://www.jbd-bms.com',
        'Sales Manager',
        '+86 13900139000',
        'info@jbd-bms.com',
        'ordered',
        '50',
        'qty'
      ]
    ];
    const csvString = [headers.join(','), ...sampleRows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `procurement_items_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === 'string') {
        parseAndImportProcurementCSV(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const parseAndImportProcurementCSV = (csvText: string) => {
    const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      alert('CSV file is empty.');
      return;
    }

    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const firstLineValues = parseCSVLine(lines[0]);
    const isHeaderRow = firstLineValues.some(val => 
      ['product', 'item', 'particulars', 'specification', 'supplier', 'website', 'contact', 'status', 'quantity', 'uom'].some(h => val.toLowerCase().includes(h))
    );

    const dataLines = isHeaderRow ? lines.slice(1) : lines;
    if (dataLines.length === 0) {
      alert('No data rows found in CSV.');
      return;
    }

    let nameIdx = 0;
    let specIdx = 1;
    let supplierIdx = 2;
    let webIdx = 3;
    let contactNameIdx = 4;
    let contactPhoneIdx = 5;
    let contactEmailIdx = 6;
    let statusIdx = 7;
    let qtyIdx = 8;
    let uomIdx = 9;

    if (isHeaderRow) {
      firstLineValues.forEach((header, idx) => {
        const h = header.toLowerCase();
        if (h.includes('product') || h.includes('item') || h.includes('particular')) nameIdx = idx;
        else if (h.includes('spec') || h.includes('detail')) specIdx = idx;
        else if (h.includes('supplier') || h.includes('company') || h.includes('vendor')) supplierIdx = idx;
        else if (h.includes('web') || h.includes('url') || h.includes('link')) webIdx = idx;
        else if (h.includes('contact name') || h.includes('contact person') || h.includes('person')) contactNameIdx = idx;
        else if (h.includes('number') || h.includes('phone') || h.includes('mobile') || h.includes('whatsapp')) contactPhoneIdx = idx;
        else if (h.includes('email') || h.includes('mail')) contactEmailIdx = idx;
        else if (h.includes('status')) statusIdx = idx;
        else if (h.includes('qty') || h.includes('quantity') || h.includes('target')) qtyIdx = idx;
        else if (h.includes('uom') || h.includes('unit')) uomIdx = idx;
      });
    }

    const newRecords: SupplyRecord[] = [];
    dataLines.forEach((line) => {
      const vals = parseCSVLine(line);
      const itemName = vals[nameIdx] || vals[0];
      if (!itemName) return;

      const spec = vals[specIdx] || '';
      const supplierName = vals[supplierIdx] || 'Vendor';
      const webUrl = vals[webIdx] || '';
      const contactName = vals[contactNameIdx] || '';
      const contactPhone = vals[contactPhoneIdx] || '';
      const contactEmail = vals[contactEmailIdx] || '';

      const rawStatus = (vals[statusIdx] || 'to_be_ordered').toLowerCase().trim();
      let status: 'to_be_ordered' | 'ordered' | 'delivered' = 'to_be_ordered';
      if (rawStatus.includes('delivered') || rawStatus.includes('green') || rawStatus.includes('received')) {
        status = 'delivered';
      } else if (rawStatus.includes('ordered') || rawStatus.includes('blue') || rawStatus.includes('transit')) {
        status = 'ordered';
      }

      const qty = parseInt(vals[qtyIdx] || '100', 10) || 100;
      const uom = vals[uomIdx] || 'qty';

      newRecords.push({
        id: crypto.randomUUID(),
        item_name: itemName,
        specification: spec,
        from_company: supplierName,
        to_company: 'Datlion Cnergy Plant',
        website_url: webUrl,
        contact_name: contactName,
        contact_number: contactPhone,
        contact_email: contactEmail,
        status: status,
        target_quantity: qty,
        uom: uom,
        rfq_text: '',
        timestamp: Date.now(),
        created_by: currentUser?.username || 'CSV Import'
      });
    });

    if (newRecords.length > 0) {
      setSuppliesRecords(prev => [...newRecords, ...prev]);
      addLogEntry('Imported Procurement CSV', `Imported ${newRecords.length} items into Procurement Dashboard.`);
      alert(`✅ Successfully imported ${newRecords.length} procurement items!`);
    } else {
      alert('Failed to parse any valid procurement items from the file.');
    }
  };

  // Toggle Ignore Notification Option (syncs across Supplies, Raw Materials, LocalStorage, and Supabase DB)
  const handleToggleIgnoreAlert = (record: SupplyRecord) => {
    const newIgnoredState = !record.is_ignored_for_alerts;

    // 1. Update Supplies Record in Supabase DB
    setSuppliesRecords(prev => prev.map(r => r.id === record.id ? { ...r, is_ignored_for_alerts: newIgnoredState } : r));

    // 2. Update Raw Material Item in Supabase DB if linked
    const rawGoodId = record.raw_good_id || receivedGoods.find(g => g.name.toLowerCase().trim() === record.item_name.toLowerCase().trim())?.id;
    
    if (rawGoodId) {
      // LocalStorage sync
      try {
        const currentMap = JSON.parse(localStorage.getItem('dc_ignored_stock_alerts_map') || '{}');
        currentMap[rawGoodId] = newIgnoredState;
        localStorage.setItem('dc_ignored_stock_alerts_map', JSON.stringify(currentMap));
      } catch (e) {
        console.warn('Failed to save ignored stock map to localStorage', e);
      }

      if (setReceivedGoods) {
        setReceivedGoods(prev => prev.map(g => g.id === rawGoodId ? { ...g, isIgnoredForAlerts: newIgnoredState } : g));
      }
    }

    addLogEntry('Stock Alert Notification Toggled', `Item: ${record.item_name} -> ${newIgnoredState ? 'Ignored' : 'Alert On'}`);
  };

  // Helper to find default registered supplier for a product/item name
  const getDefaultRegisteredSupplier = useCallback((itemName: string): CompanyProfile | null => {
    if (!itemName || !itemName.trim()) return null;
    const query = itemName.toLowerCase().trim();

    // 1. Search in receivedGoods for matching item name
    const matchedGood = receivedGoods.find(g => 
      g.name.toLowerCase().trim() === query ||
      query.includes(g.name.toLowerCase().trim()) ||
      g.name.toLowerCase().trim().includes(query)
    );

    if (matchedGood && matchedGood.supplier) {
      const matchedProfile = companyProfiles.find(c =>
        c.name.toLowerCase().trim() === matchedGood.supplier.toLowerCase().trim() ||
        c.name.toLowerCase().trim().includes(matchedGood.supplier.toLowerCase().trim()) ||
        matchedGood.supplier.toLowerCase().trim().includes(c.name.toLowerCase().trim())
      );
      if (matchedProfile) return matchedProfile;

      return {
        id: matchedGood.supplier,
        name: matchedGood.supplier,
        contactPerson: 'Sales Desk',
        email: '',
        phoneNumber: '',
        gstNumber: '',
        shippingAddress: ''
      };
    }

    // 2. Search in existing suppliesRecords for matching item_name that has a supplier
    const matchedRecord = suppliesRecords.find(r =>
      r.item_name.toLowerCase().trim() === query && r.from_company
    );

    if (matchedRecord && matchedRecord.from_company) {
      const matchedProfile = companyProfiles.find(c =>
        c.name.toLowerCase().trim() === matchedRecord.from_company?.toLowerCase().trim()
      );
      if (matchedProfile) return matchedProfile;

      return {
        id: matchedRecord.supplier_id || matchedRecord.from_company,
        name: matchedRecord.from_company,
        contactPerson: matchedRecord.contact_name || '',
        email: matchedRecord.contact_email || '',
        phoneNumber: matchedRecord.contact_number || '',
        gstNumber: '',
        shippingAddress: ''
      };
    }

    // 3. Search directly in companyProfiles if any company name matches or is part of product name
    const matchedDirect = companyProfiles.find(c =>
      query.includes(c.name.toLowerCase().trim()) || c.name.toLowerCase().trim().includes(query)
    );
    if (matchedDirect) return matchedDirect;

    return null;
  }, [receivedGoods, suppliesRecords, companyProfiles]);

  // Suggestions for raw materials from inventory and supplies
  const rawMaterialSuggestions = useMemo(() => {
    const set = new Set<string>();
    receivedGoods.forEach(g => {
      if (g.name) set.add(g.name);
    });
    suppliesRecords.forEach(r => {
      if (r.item_name) set.add(r.item_name);
    });
    return Array.from(set);
  }, [receivedGoods, suppliesRecords]);

  // Default supplier for currently typed or selected item in form
  const defaultSupplierForCurrentItem = useMemo(() => {
    return getDefaultRegisteredSupplier(formData.item_name || '');
  }, [formData.item_name, getDefaultRegisteredSupplier]);

  // Handle product name change and auto-fill default registered supplier
  const handleItemNameChange = (name: string) => {
    const defaultSupplier = getDefaultRegisteredSupplier(name);

    setFormData(prev => {
      const isSupplierEmptyOrGeneric = !prev.from_company || prev.from_company === 'Vendor' || prev.from_company === 'Primary Supplier';
      
      if (defaultSupplier && isSupplierEmptyOrGeneric) {
        return {
          ...prev,
          item_name: name,
          from_company: defaultSupplier.name,
          supplier_id: defaultSupplier.id,
          contact_name: defaultSupplier.contactPerson || prev.contact_name || '',
          contact_number: defaultSupplier.phoneNumber || prev.contact_number || '',
          contact_email: defaultSupplier.email || prev.contact_email || '',
          website_url: prev.website_url || (defaultSupplier.name ? `https://www.google.com/search?q=${encodeURIComponent(defaultSupplier.name)}` : '')
        };
      }

      return {
        ...prev,
        item_name: name
      };
    });
  };

  // Handle supplier dropdown selection in form to auto-fill supplier details
  const handleSupplierSelect = (companyName: string) => {
    if (companyName === 'ADD_NEW') {
      setIsAddCompanyModalOpen(true);
      return;
    }

    const comp = companyProfiles.find(c => c.name.toLowerCase().trim() === companyName.toLowerCase().trim());
    if (comp) {
      setFormData(prev => ({
        ...prev,
        from_company: comp.name,
        supplier_id: comp.id,
        contact_name: comp.contactPerson || prev.contact_name || '',
        contact_number: comp.phoneNumber || prev.contact_number || '',
        contact_email: comp.email || prev.contact_email || '',
        website_url: prev.website_url || `https://www.google.com/search?q=${encodeURIComponent(comp.name)}`
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        from_company: companyName,
        supplier_id: ''
      }));
    }
  };

  // Create or Update Record (DB Synced)
  const handleSaveRecord = () => {
    if (!formData.item_name) {
      alert('Please enter a Product Name.');
      return;
    }

    if (editingRecord) {
      const updated: SupplyRecord = {
        ...editingRecord,
        item_name: formData.item_name || editingRecord.item_name,
        specification: formData.specification || '',
        from_company: formData.from_company || '',
        to_company: formData.to_company || 'Datlion Cnergy Plant',
        supplier_id: formData.supplier_id || '',
        website_url: formData.website_url || '',
        contact_name: formData.contact_name || '',
        contact_number: formData.contact_number || '',
        contact_email: formData.contact_email || '',
        status: formData.status || 'to_be_ordered',
        target_quantity: Number(formData.target_quantity) || 1,
        uom: formData.uom || 'qty',
        rfq_text: formData.rfq_text || editingRecord.rfq_text || ''
      };

      setSuppliesRecords(prev => prev.map(r => r.id === editingRecord.id ? updated : r));
      addLogEntry('Procurement Record Updated', `Item: ${updated.item_name}, Status: ${updated.status}`);
    } else {
      const newRecord: SupplyRecord = {
        id: crypto.randomUUID(),
        item_name: formData.item_name,
        specification: formData.specification || '',
        from_company: formData.from_company || 'Vendor',
        to_company: formData.to_company || 'Datlion Cnergy Plant',
        supplier_id: formData.supplier_id || '',
        website_url: formData.website_url || '',
        contact_name: formData.contact_name || '',
        contact_number: formData.contact_number || '',
        contact_email: formData.contact_email || '',
        status: formData.status || 'to_be_ordered',
        target_quantity: Number(formData.target_quantity) || 100,
        uom: formData.uom || 'qty',
        rfq_text: formData.rfq_text || '',
        timestamp: Date.now(),
        created_by: currentUser?.username || 'admin'
      };

      setSuppliesRecords(prev => [newRecord, ...prev]);
      addLogEntry('Procurement Record Created', `Item: ${newRecord.item_name}, Supplier: ${newRecord.from_company}`);
    }

    setIsAdding(false);
    setEditingRecord(null);
    setFormData({
      item_name: '',
      specification: '',
      supplier_id: '',
      from_company: '',
      to_company: '',
      website_url: '',
      contact_name: '',
      contact_number: '',
      contact_email: '',
      status: 'to_be_ordered',
      target_quantity: 100,
      uom: 'qty',
      rfq_text: ''
    });
  };

  // Quick Status Change (DB Synced)
  const updateStatus = (id: string, newStatus: 'to_be_ordered' | 'ordered' | 'delivered') => {
    setSuppliesRecords(prev => prev.map(r => {
      if (r.id === id) {
        const is_ordered = newStatus === 'ordered' || newStatus === 'delivered';
        const is_received = newStatus === 'delivered';
        const updated = { ...r, status: newStatus, is_ordered, is_received };
        addLogEntry('Procurement Status Changed', `Item: ${r.item_name} -> ${newStatus}`);
        return updated;
      }
      return r;
    }));
  };

  // Delete Record (DB Synced)
  const handleDelete = (id: string) => {
    const record = suppliesRecords.find(r => r.id === id);
    if (!record || !confirm(`Are you sure you want to delete "${record.item_name}"?`)) return;
    setSuppliesRecords(prev => prev.filter(r => r.id !== id));
    setSelectedIds(prev => prev.filter(i => i !== id));
    addLogEntry('Procurement Item Deleted', `Item: ${record.item_name}`);
  };

  // AI RFQ Text Generation for single item
  const handleGenerateAI_RFQ = async (record: SupplyRecord) => {
    setRfqModalItem(record);
    setIsGeneratingRfq(true);
    setGeneratedRfqText(record.rfq_text || 'Connecting to OpenRouter AI...');

    try {
      const aiText = await generateRFQTextOpenRouter({
        product: record.item_name,
        specification: record.specification,
        supplierName: record.from_company,
        contactName: record.contact_name,
        quantity: record.target_quantity,
        uom: record.uom
      });
      setGeneratedRfqText(aiText);
      // Persist to DB state
      setSuppliesRecords(prev => prev.map(r => r.id === record.id ? { ...r, rfq_text: aiText } : r));
    } catch (err) {
      console.error('Failed to generate RFQ text via AI:', err);
    } finally {
      setIsGeneratingRfq(false);
    }
  };

  // Multi-select helpers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredRecords.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // Bulk RFQ Mail modal launcher
  const handleOpenBulkMailModal = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkMailModalOpen(true);
    
    // Auto-generate RFQ texts for items missing them
    const newBulkTexts: Record<string, string> = { ...bulkRfqTexts };
    const selectedItems = suppliesRecords.filter(r => selectedIds.includes(r.id));
    
    for (const item of selectedItems) {
      if (!newBulkTexts[item.id]) {
        newBulkTexts[item.id] = item.rfq_text || await generateRFQTextOpenRouter({
          product: item.item_name,
          specification: item.specification,
          supplierName: item.from_company,
          contactName: item.contact_name,
          quantity: item.target_quantity,
          uom: item.uom
        });
      }
    }
    setBulkRfqTexts(newBulkTexts);
  };

  // Bulk Status Update (DB Synced)
  const handleBulkStatusChange = (status: 'to_be_ordered' | 'ordered' | 'delivered') => {
    if (selectedIds.length === 0) return;
    setSuppliesRecords(prev => prev.map(r => selectedIds.includes(r.id) ? { ...r, status } : r));
    addLogEntry('Bulk Procurement Status Update', `Updated ${selectedIds.length} items to ${status}`);
    setSelectedIds([]);
  };

  // Helper to determine accurate procurement status for an item
  const getEffectiveStatus = useCallback((r: SupplyRecord): 'to_be_ordered' | 'ordered' | 'delivered' => {
    const alertInfo = rawMaterialAlertMap.get(r.item_name.toLowerCase().trim());
    const isLowStockTriggered = alertInfo?.isLowStock && !alertInfo.isIgnored && !r.is_ignored_for_alerts;

    // Explicit manual overrides
    if (r.status === 'ordered') return 'ordered';
    if (r.status === 'delivered') return 'delivered';

    // Low stock alert triggers to_be_ordered status
    if (isLowStockTriggered) return 'to_be_ordered';

    // Auto-seeded or legacy record whose inventory is NOT low stock -> default to delivered
    if (r.status === 'to_be_ordered' && !isLowStockTriggered) {
      if (r.created_by === 'Auto-Seed Engine' || r.raw_good_id) {
        return 'delivered';
      }
    }

    return r.status || 'delivered';
  }, [rawMaterialAlertMap]);

  // Normalized Filtering
  const filteredRecords = useMemo(() => {
    return suppliesRecords.filter(r => {
      const alertInfo = rawMaterialAlertMap.get(r.item_name.toLowerCase().trim());
      const isLowStockTriggered = alertInfo?.isLowStock && !alertInfo.isIgnored && !r.is_ignored_for_alerts;
      const effectiveStatus = getEffectiveStatus(r);

      let matchesStatus = true;
      if (activeStatusFilter === 'all') {
        matchesStatus = true;
      } else if (activeStatusFilter === 'stock_alerts') {
        matchesStatus = Boolean(isLowStockTriggered);
      } else {
        matchesStatus = effectiveStatus === activeStatusFilter;
      }

      const search = searchTerm.toLowerCase().trim();
      const matchesSearch = !search || 
        r.item_name.toLowerCase().includes(search) ||
        (r.specification && r.specification.toLowerCase().includes(search)) ||
        (r.from_company && r.from_company.toLowerCase().includes(search)) ||
        (r.contact_name && r.contact_name.toLowerCase().includes(search)) ||
        (r.contact_email && r.contact_email.toLowerCase().includes(search));

      const matchesSupplierFilter = !selectedSupplierFilter ||
        (r.from_company && r.from_company.toLowerCase().trim() === selectedSupplierFilter.toLowerCase().trim());

      return matchesStatus && matchesSearch && matchesSupplierFilter;
    });
  }, [suppliesRecords, activeStatusFilter, searchTerm, selectedSupplierFilter, rawMaterialAlertMap, getEffectiveStatus]);

  // Counts & Alert Summaries
  const counts = useMemo(() => {
    let to_be_ordered = 0;
    let ordered = 0;
    let delivered = 0;
    let stock_alerts = 0;

    suppliesRecords.forEach(r => {
      const alertInfo = rawMaterialAlertMap.get(r.item_name.toLowerCase().trim());
      const isLowStockTriggered = alertInfo?.isLowStock && !alertInfo.isIgnored && !r.is_ignored_for_alerts;

      if (isLowStockTriggered) stock_alerts++;

      const st = getEffectiveStatus(r);
      if (st === 'to_be_ordered') {
        to_be_ordered++;
      } else if (st === 'ordered') {
        ordered++;
      } else if (st === 'delivered') {
        delivered++;
      }
    });

    return { total: suppliesRecords.length, to_be_ordered, ordered, delivered, stock_alerts };
  }, [suppliesRecords, rawMaterialAlertMap, getEffectiveStatus]);

  // Format WhatsApp Link
  const getWhatsAppLink = (phone?: string, text?: string) => {
    if (!phone) return '#';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const encodedText = encodeURIComponent(text || 'Hello, inquiring about product availability and quotation from Datlion Cnergy.');
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  };

  // Format Mailto Link
  const getMailtoLink = (email?: string, subject?: string, body?: string) => {
    if (!email) return '#';
    const encSub = encodeURIComponent(subject || 'Request for Quotation - Datlion Cnergy');
    const encBody = encodeURIComponent(body || 'Dear Sales Team,\n\nPlease share your best quotation for the required materials.');
    return `mailto:${email}?subject=${encSub}&body=${encBody}`;
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input for CSV Import */}
      <input
        type="file"
        ref={csvFileInputRef}
        onChange={handleCSVFileChange}
        className="hidden"
        accept=".csv,text/csv"
      />

      {/* MODULE NAVIGATION SUB-TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 flex-wrap">
        <button
          onClick={() => setMainTab('procurement')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
            mainTab === 'procurement'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>📦 Procurement & Requisitions</span>
        </button>

        <button
          onClick={() => setMainTab('tracking')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
            mainTab === 'tracking'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
          }`}
        >
          <span>🚚 Factory Inbound Tracking</span>
        </button>

        <button
          onClick={() => setMainTab('find_suppliers')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
            mainTab === 'find_suppliers'
              ? 'bg-gradient-to-r from-[#8EBF45] to-[#658C3E] text-slate-950 font-black shadow-md'
              : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
          }`}
        >
          <span>🔍 Find New Suppliers (AI & Maps)</span>
        </button>
      </div>

      {mainTab === 'find_suppliers' ? (
        <FindSupplierTab
          companyProfiles={companyProfiles}
          setCompanyProfiles={setCompanyProfiles || (() => {})}
          addLogEntry={addLogEntry}
          onOpenWebmail={(to, subject, body) => handleOpenWebmailIframe(to, subject, body)}
        />
      ) : mainTab === 'tracking' ? (
        <InboundTrackingTab
          companyProfiles={companyProfiles}
          receivedGoods={receivedGoods}
          addLogEntry={addLogEntry}
          currentUser={currentUser}
        />
      ) : (
        <>
          {/* TOP DASHBOARD HEADER */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 text-xl font-bold">
              📦
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Procurement & Supplies Dashboard</h1>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-300">
                  ⚡ Database Synced
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Stock level alerts automatically flag items as <span className="font-bold text-amber-600">🟡 To Be Ordered</span> with ignore notification options.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sync Inventory Button */}
          <button
            onClick={autoSeedFromInventory}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-300 flex items-center gap-1.5"
            title="Sync inventory stock level alerts & supplier profiles with Supabase DB"
          >
            <RefreshCw size={14} className="text-slate-500" />
            <span>Sync Inventory</span>
          </button>

          {/* Add Item Button */}
          <button
            onClick={() => {
              setEditingRecord(null);
              setFormData({
                item_name: '',
                specification: '',
                supplier_id: '',
                from_company: '',
                to_company: 'Datlion Cnergy Plant',
                website_url: '',
                contact_name: '',
                contact_number: '',
                contact_email: '',
                status: 'to_be_ordered',
                target_quantity: 100,
                uom: 'qty',
                rfq_text: ''
              });
              setIsAdding(true);
            }}
            className="px-4 py-2.5 bg-gradient-to-r from-[#8EBF45] to-[#658C3E] hover:opacity-95 text-slate-950 text-xs font-black rounded-xl shadow-sm transition-all flex items-center gap-2"
          >
            <Plus size={16} />
            <span>+ Add Item</span>
          </button>
        </div>
      </div>

      {/* UNIFORM CSV CONTROL BAR */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md no-print">
        <div className="flex items-start gap-3">
          <span className="text-xl">📄</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Required CSV Headers:</span>
            </div>
            <p className="text-[11px] font-mono text-slate-300 mt-1 leading-relaxed flex flex-wrap gap-1.5 items-center">
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Product Name</span>
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Specification</span>
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Supplier</span>
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Website</span>
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Contact Name</span>
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Contact Number</span>
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Contact Email</span>
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Status</span>
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Target Quantity</span>
              <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">UOM</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end md:self-auto shrink-0">
          <button
            onClick={downloadCSVTemplate}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
            title="Download CSV sample template with proper headers"
          >
            <span>💾 Download Template CSV</span>
          </button>

          <button
            onClick={handleCSVImportClick}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-2xs whitespace-nowrap flex items-center gap-1.5"
            title="Import procurement items from CSV file"
          >
            <span>📥 Import CSV</span>
          </button>
        </div>
      </div>

      {/* SKU BUILD CAPACITY CALCULATOR (ON-DEMAND SEARCH) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-5 border border-slate-700/80 shadow-lg text-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl font-bold">
              🧮
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                SKU Build Capacity Search
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-500/40 uppercase tracking-wider">
                  On-Demand Calculation
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Search a specific SKU/Product model to calculate maximum buildable units based on current live stock.
              </p>
            </div>
          </div>

          {/* Search Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Select Recipe Dropdown */}
            {recipes && recipes.length > 0 && (
              <select
                value={skuSearchQuery}
                onChange={(e) => setSkuSearchQuery(e.target.value)}
                className="bg-slate-800 border border-slate-600 text-slate-100 text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500 max-w-[220px]"
              >
                <option value="">-- Select SKU Recipe --</option>
                {recipes.map(r => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            )}

            {/* Text Input Search */}
            <div className="relative">
              <input
                type="text"
                value={skuSearchQuery}
                onChange={(e) => setSkuSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCalculateSkuCapacity();
                  }
                }}
                placeholder="Enter SKU / Model Name..."
                className="bg-slate-800 border border-slate-600 text-slate-100 text-xs font-medium placeholder-slate-400 rounded-xl px-3.5 py-2.5 w-60 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Search Action Button (Triggered only on click) */}
            <button
              onClick={() => handleCalculateSkuCapacity()}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <span>🔍 Calculate Capacity</span>
            </button>

            {calculatedResult && (
              <button
                onClick={() => {
                  setCalculatedResult(null);
                  setSkuSearchQuery('');
                }}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* CALCULATION RESULTS DISPLAY */}
        {calculatedResult && calculatedResult.hasExecuted && (
          <div className="bg-slate-950/80 rounded-xl p-5 border border-slate-800 space-y-4 animate-in fade-in">
            {!calculatedResult.recipe ? (
              <div className="text-center py-6 space-y-2">
                <span className="text-3xl">⚠️</span>
                <h4 className="text-sm font-bold text-amber-400">No BOM Recipe Found for "{calculatedResult.skuName}"</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  No registered product recipe matched this SKU name. Please select a registered SKU from the dropdown or register a recipe in the Master Data / WIP module.
                </p>
                {recipes && recipes.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                    <span className="text-xs text-slate-400 font-semibold">Available SKUs:</span>
                    {recipes.map(r => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setSkuSearchQuery(r.name);
                          handleCalculateSkuCapacity(r.name);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs rounded-lg border border-slate-700 font-medium transition-all"
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Hero Result Summary Card */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">SKU Build Capacity Calculation</span>
                    <h3 className="text-xl font-black text-white">{calculatedResult.skuName}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Calculated dynamically from live stock in Received Goods inventory.
                    </p>
                  </div>

                  <div className="flex items-center gap-4 bg-slate-950 px-5 py-3 rounded-xl border border-slate-800">
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase text-slate-400">Max Buildable Units</p>
                      <p className="text-3xl font-black text-emerald-400 tracking-tight">{calculatedResult.maxBuildable} <span className="text-xs text-slate-400 font-normal">units</span></p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl">
                      ⚡
                    </div>
                  </div>
                </div>

                {/* Bottleneck Warning Header */}
                {calculatedResult.bottleneck && (
                  <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-200">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">🚨</span>
                      <div>
                        <p className="text-xs font-bold text-rose-300">
                          Limiting Factor (Bottleneck): <span className="font-extrabold text-white">{calculatedResult.bottleneck.name}</span>
                        </p>
                        <p className="text-[11px] text-rose-300/80">
                          Stock available: {calculatedResult.bottleneck.availableStock} {calculatedResult.bottleneck.uom} | Requires {calculatedResult.bottleneck.requiredPerUnit} per unit → Limits total build to {calculatedResult.maxBuildable} SKUs.
                        </p>
                      </div>
                    </div>

                    {/* Action button to add missing component to procurement */}
                    <button
                      onClick={() => {
                        const b = calculatedResult.bottleneck!;
                        const seedRecord: SupplyRecord = {
                          id: crypto.randomUUID(),
                          item_name: b.name,
                          specification: `Bottleneck component for ${calculatedResult.skuName}`,
                          from_company: 'Primary Supplier',
                          to_company: 'Datlion Cnergy Plant',
                          status: 'to_be_ordered',
                          target_quantity: b.requiredPerUnit * 50,
                          uom: b.uom || 'qty',
                          timestamp: Date.now(),
                          created_by: 'SKU Capacity Calculator'
                        };
                        setSuppliesRecords(prev => [seedRecord, ...prev]);
                        addLogEntry('Procurement Item Added', `Added bottleneck material ${b.name} for SKU ${calculatedResult.skuName} to procurement.`);
                        alert(`Added ${b.name} to Supplies "To Be Ordered" list!`);
                      }}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-all whitespace-nowrap shadow-2xs flex items-center gap-1.5"
                    >
                      <span>+ Add to Orders</span>
                    </button>
                  </div>
                )}

                {/* Component BOM Stock Matrix Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-3">Raw Material Component</th>
                        <th className="py-2.5 px-3">Required / Unit</th>
                        <th className="py-2.5 px-3">Available Stock</th>
                        <th className="py-2.5 px-3">Yield (Buildable SKUs)</th>
                        <th className="py-2.5 px-3 text-right">Stock Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {calculatedResult.components.map((comp, idx) => (
                        <tr key={idx} className={comp.isBottleneck ? 'bg-rose-950/20 text-rose-100 font-semibold' : 'hover:bg-slate-900/40 text-slate-200'}>
                          <td className="py-2.5 px-3 flex items-center gap-2">
                            {comp.isBottleneck && <span className="text-xs">🔴</span>}
                            <span>{comp.name}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {comp.requiredPerUnit} {comp.uom}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-400 font-bold">
                            {comp.availableStock} {comp.uom}
                          </td>
                          <td className="py-2.5 px-3 font-bold">
                            {comp.maxBuildableFromThis} units
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {comp.isBottleneck ? (
                              <span className="bg-rose-500/20 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/40">
                                Bottleneck Limit
                              </span>
                            ) : comp.status === 'low' ? (
                              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
                                Tight Stock
                              </span>
                            ) : (
                              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/40">
                                Sufficient
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* METRIC KPI CARDS & STATUS TABS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* To Be Ordered (Amber / Default Active Tab with Stock Level Alerts) */}
        <div
          onClick={() => setActiveStatusFilter('to_be_ordered')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            activeStatusFilter === 'to_be_ordered'
              ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md ring-2 ring-amber-500/20 font-bold'
              : 'bg-amber-50/80 text-amber-900 border-amber-200 hover:bg-amber-100/60'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <p className="text-[10px] font-black uppercase tracking-wider">🟡 To Be Ordered (Alerts)</p>
            </div>
            <h3 className="text-2xl font-black mt-1">{counts.to_be_ordered}</h3>
          </div>
          <span className="text-2xl">⏳</span>
        </div>

        {/* Ordered (Blue) */}
        <div
          onClick={() => setActiveStatusFilter('ordered')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            activeStatusFilter === 'ordered'
              ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-600/20'
              : 'bg-blue-50/80 text-blue-900 border-blue-200 hover:bg-blue-100/60'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <p className="text-[10px] font-black uppercase tracking-wider">🔵 Ordered (In Transit)</p>
            </div>
            <h3 className="text-2xl font-black mt-1">{counts.ordered}</h3>
          </div>
          <span className="text-2xl">🚚</span>
        </div>

        {/* Delivered (Green) */}
        <div
          onClick={() => setActiveStatusFilter('delivered')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            activeStatusFilter === 'delivered'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-600/20'
              : 'bg-emerald-50/80 text-emerald-900 border-emerald-200 hover:bg-emerald-100/60'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <p className="text-[10px] font-black uppercase tracking-wider">🟢 Delivered (In Stock)</p>
            </div>
            <h3 className="text-2xl font-black mt-1">{counts.delivered}</h3>
          </div>
          <span className="text-2xl">✅</span>
        </div>

        {/* Total Items Tab */}
        <div
          onClick={() => setActiveStatusFilter('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            activeStatusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/20'
              : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div>
            <p className={`text-[10px] font-black uppercase tracking-wider ${activeStatusFilter === 'all' ? 'text-slate-400' : 'text-slate-400'}`}>All Procurement Records</p>
            <h3 className="text-2xl font-black mt-1">{counts.total}</h3>
          </div>
          <span className="text-2xl">📋</span>
        </div>
      </div>

      {/* STOCK ALERT BANNER IF LOW STOCK DETECTED */}
      {counts.stock_alerts > 0 && (
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-950 animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <p className="text-xs font-black">
                {counts.stock_alerts} Raw Material item(s) running low or out of stock!
              </p>
              <p className="text-[11px] text-amber-800 font-medium">
                These items are automatically queued under <span className="font-bold">🟡 To Be Ordered</span>. You can suppress alerts anytime using the <span className="font-bold">🚫 Ignore</span> button on any card.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveStatusFilter('to_be_ordered')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl shadow-xs transition-all whitespace-nowrap"
          >
            View Requisitions ({counts.to_be_ordered})
          </button>
        </div>
      )}

      {/* SEARCH AND BULK ACTIONS BAR */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Controls (Text Search + Searchable Supplier Dropdown) */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
          {/* General Text Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search product, spec..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-slate-400 text-xs hover:text-slate-700">✕</button>
            )}
          </div>

          {/* Searchable Supplier Dropdown */}
          <div className="w-full sm:w-72">
            <SearchableSupplierDropdown
              value={selectedSupplierFilter}
              onChange={(supplierName) => setSelectedSupplierFilter(supplierName)}
              companyProfiles={companyProfiles}
              onAddNewCompany={() => setIsAddCompanyModalOpen(true)}
            />
          </div>

          {/* Clear Supplier Filter */}
          {selectedSupplierFilter && (
            <button
              type="button"
              onClick={() => setSelectedSupplierFilter('')}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all border border-slate-200 flex items-center gap-1 shrink-0 whitespace-nowrap"
              title="Clear supplier filter"
            >
              <span>✕ Clear Supplier Filter</span>
            </button>
          )}
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl w-full md:w-auto animate-in fade-in">
            <span className="text-xs font-black text-amber-900 mr-2">
              {selectedIds.length} Selected:
            </span>

            <button
              onClick={handleOpenBulkMailModal}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-90 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1 shadow-sm"
            >
              <span>📧 Bulk Mail RFQs</span>
            </button>

            <div className="h-4 w-px bg-amber-300 mx-1"></div>

            <button
              onClick={() => handleBulkStatusChange('to_be_ordered')}
              className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-300 hover:bg-amber-200"
            >
              Set 🟡 To Order
            </button>
            <button
              onClick={() => handleBulkStatusChange('ordered')}
              className="px-2.5 py-1 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-lg border border-blue-300 hover:bg-blue-200"
            >
              Set 🔵 Ordered
            </button>
            <button
              onClick={() => handleBulkStatusChange('delivered')}
              className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-lg border border-emerald-300 hover:bg-emerald-200"
            >
              Set 🟢 Delivered
            </button>
          </div>
        )}
      </div>

      {/* PROCUREMENT DATA TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredRecords.length > 0 && selectedIds.length === filteredRecords.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded text-[#8EBF45] focus:ring-[#8EBF45] cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Product Particulars</th>
                <th className="px-4 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Specification / Details</th>
                <th className="px-4 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Supplier Details</th>
                <th className="px-4 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Quick Actions & Triggers</th>
                <th className="px-4 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">Status</th>
                <th className="px-4 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl opacity-30">🔍</span>
                      <p className="font-bold text-slate-600">No procurement items found</p>
                      <p className="text-xs text-slate-400">Click "📥 Import CSV" or "Sync Inventory" to add items.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const alertInfo = rawMaterialAlertMap.get(record.item_name.toLowerCase().trim());
                  const isLowStockTriggered = alertInfo?.isLowStock && !alertInfo.isIgnored && !record.is_ignored_for_alerts;

                  let effectiveStatus = record.status || (record.is_received ? 'delivered' : record.is_ordered ? 'ordered' : 'to_be_ordered');
                  if (isLowStockTriggered && effectiveStatus !== 'delivered' && effectiveStatus !== 'ordered') {
                    effectiveStatus = 'to_be_ordered';
                  }

                  const isChecked = selectedIds.includes(record.id);
                  const isIgnored = Boolean(record.is_ignored_for_alerts || alertInfo?.isIgnored);

                  return (
                    <tr key={record.id} className={`hover:bg-slate-50/70 transition-colors ${isChecked ? 'bg-amber-50/40' : ''}`}>
                      {/* Checkbox */}
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(record.id)}
                          className="w-4 h-4 rounded text-[#8EBF45] focus:ring-[#8EBF45] cursor-pointer"
                        />
                      </td>

                      {/* Product Particulars */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{record.item_name}</span>
                            
                            {/* Stock Alert Badge */}
                            {alertInfo?.isOutOfStock && !isIgnored && (
                              <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-2 py-0.5 rounded-md border border-rose-300 animate-pulse">
                                🚨 OUT OF STOCK
                              </span>
                            )}
                            {alertInfo?.isLowStock && !alertInfo.isOutOfStock && !isIgnored && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-md border border-amber-300">
                                ⚠️ LOW STOCK ({alertInfo.currentQty} left)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1">
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-slate-200">
                              Target Qty: {record.target_quantity || 100} {record.uom || 'qty'}
                            </span>

                            {/* Ignore Notification Option Button (Just like in Raw Material Cards) */}
                            <button
                              onClick={() => handleToggleIgnoreAlert(record)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                                isIgnored
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                              }`}
                              title={isIgnored ? "Click to re-enable low stock alerts for this item" : "Click to ignore alert / mark as do not replenish"}
                            >
                              {isIgnored ? '🚫 Ignored' : '🔔 Alert On'}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Specification / Particulars */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <p className="text-slate-700 font-medium line-clamp-2">
                          {record.specification || '— Standard Specification —'}
                        </p>
                      </td>

                      {/* Supplier & Contact Details */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedSupplierFilter(record.from_company || '')}
                              className="font-bold text-slate-900 hover:text-emerald-700 flex items-center gap-1 transition-colors text-left cursor-pointer"
                              title="Filter list by this supplier"
                            >
                              <span>🏢 {record.from_company || 'Unassigned Supplier'}</span>
                            </button>
                          </div>

                          {record.contact_name && (
                            <p className="text-[11px] text-slate-500 font-medium">👤 {record.contact_name}</p>
                          )}

                          {record.contact_number && (
                            <p className="text-[11px] text-slate-500 font-medium">📞 {record.contact_number}</p>
                          )}

                          {record.contact_email && (
                            <p className="text-[11px] text-slate-500 font-medium truncate max-w-[180px]">✉️ {record.contact_email}</p>
                          )}
                        </div>
                      </td>

                      {/* Actions & Communication Triggers (Always Visible - On-Demand Particulars Fetching) */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* 🔗 Website */}
                          <button
                            onClick={() => handleActionClick(record, 'website')}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg border border-slate-300 flex items-center gap-1 transition-all"
                            title="Open Supplier Buying URL / Store Catalog (Fetches particulars on-demand)"
                          >
                            <span>🔗 Website</span>
                          </button>

                          {/* 💬 WhatsApp */}
                          <button
                            onClick={() => handleActionClick(record, 'whatsapp')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow-2xs transition-all"
                            title="Send direct WhatsApp message to supplier (Fetches phone number on-demand)"
                          >
                            <span>💬 WhatsApp</span>
                          </button>

                          {/* 📧 Webmail (Merged Direct Mail & Webmail) */}
                          <button
                            onClick={() => handleActionClick(record, 'webmail')}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow-2xs transition-all"
                            title="Open Internal Webmail Dispatcher (Fetches email contact on-demand)"
                          >
                            <span>📧 Email</span>
                          </button>

                          {/* ⚡ AI RFQ Generator */}
                          <button
                            onClick={() => handleActionClick(record, 'ai_rfq')}
                            className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 text-[11px] font-extrabold rounded-lg border border-amber-400/40 flex items-center gap-1 transition-all"
                            title="Generate AI Request for Quotation text on-demand"
                          >
                            <span>⚡ AI RFQ</span>
                          </button>
                        </div>
                      </td>

                      {/* Status Badges with 1-Click Toggle */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          {effectiveStatus === 'to_be_ordered' && (
                            <button
                              onClick={() => updateStatus(record.id, 'ordered')}
                              className="px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 font-black text-[11px] rounded-full hover:bg-amber-200 transition-all flex items-center gap-1 shadow-2xs"
                              title="Click to advance to 'Ordered'"
                            >
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                              <span>🟡 To Be Ordered</span>
                            </button>
                          )}

                          {effectiveStatus === 'ordered' && (
                            <button
                              onClick={() => updateStatus(record.id, 'delivered')}
                              className="px-3 py-1 bg-blue-100 text-blue-800 border border-blue-300 font-black text-[11px] rounded-full hover:bg-blue-200 transition-all flex items-center gap-1 shadow-2xs"
                              title="Click to mark as 'Delivered'"
                            >
                              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                              <span>🔵 Ordered</span>
                            </button>
                          )}

                          {effectiveStatus === 'delivered' && (
                            <button
                              onClick={() => updateStatus(record.id, 'to_be_ordered')}
                              className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-[11px] rounded-full hover:bg-emerald-200 transition-all flex items-center gap-1 shadow-2xs"
                              title="Click to reset to 'To Be Ordered'"
                            >
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              <span>🟢 Delivered</span>
                            </button>
                          )}

                          <span className="text-[9px] text-slate-400 font-bold">Click badge to advance</span>
                        </div>
                      </td>

                      {/* Edit / Delete */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingRecord(record);
                              setFormData({
                                item_name: record.item_name,
                                specification: record.specification || '',
                                supplier_id: record.supplier_id || '',
                                from_company: record.from_company || '',
                                to_company: record.to_company || 'Datlion Cnergy Plant',
                                website_url: record.website_url || '',
                                contact_name: record.contact_name || '',
                                contact_number: record.contact_number || '',
                                contact_email: record.contact_email || '',
                                status: effectiveStatus,
                                target_quantity: record.target_quantity || 100,
                                uom: record.uom || 'qty',
                                rfq_text: record.rfq_text || ''
                              });
                              setIsAdding(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                            title="Edit procurement record details"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            title="Delete item"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* MODAL 1: ADD / EDIT PROCUREMENT ITEM */}
      {isAdding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 text-left">
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">📦</span>
                <h2 className="text-lg font-bold">
                  {editingRecord ? `Edit Item: ${editingRecord.item_name}` : 'New Procurement Requisition'}
                </h2>
              </div>
              <button onClick={() => { setIsAdding(false); setEditingRecord(null); }} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Product Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grade-A 3.2V 280Ah LFP Cell"
                    list="known-raw-goods-list"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                    value={formData.item_name}
                    onChange={(e) => handleItemNameChange(e.target.value)}
                  />
                  <datalist id="known-raw-goods-list">
                    {rawMaterialSuggestions.map((name, idx) => (
                      <option key={idx} value={name} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Target Quantity & UOM</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-2/3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                      value={formData.target_quantity}
                      onChange={(e) => setFormData({ ...formData, target_quantity: Number(e.target.value) })}
                    />
                    <select
                      className="w-1/3 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                      value={formData.uom}
                      onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                    >
                      <option value="qty">qty</option>
                      <option value="grams">grams</option>
                      <option value="cm">cm</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase">Specification / Particulars</label>
                <textarea
                  rows={2}
                  placeholder="e.g. M6 Terminals, 6000 Cycles @ 80% DOD, EVE Chemistry Datasheet Spec"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                  value={formData.specification}
                  onChange={(e) => setFormData({ ...formData, specification: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-500 uppercase">Supplier Company (Searchable)</label>
                    {defaultSupplierForCurrentItem && (
                      <button
                        type="button"
                        onClick={() => handleSupplierSelect(defaultSupplierForCurrentItem.name)}
                        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 transition-colors"
                        title="Pre-select default registered supplier"
                      >
                        ✨ Default: {defaultSupplierForCurrentItem.name}
                      </button>
                    )}
                  </div>
                  <SearchableSupplierDropdown
                    value={formData.from_company || ''}
                    onChange={handleSupplierSelect}
                    companyProfiles={companyProfiles}
                    onAddNewCompany={() => setIsAddCompanyModalOpen(true)}
                    defaultRegisteredSupplierName={defaultSupplierForCurrentItem?.name}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Procurement Status</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="to_be_ordered">🟡 To Be Ordered (Warning Amber)</option>
                    <option value="ordered">🔵 Ordered (Info Blue)</option>
                    <option value="delivered">🟢 Delivered (Success Green)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Contact Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Sales Manager"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#8EBF45]"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Contact Phone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 9876543210"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#8EBF45]"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Contact Email</label>
                  <input
                    type="email"
                    placeholder="e.g. sales@vendor.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#8EBF45]"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase">Supplier Website / Buying URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#8EBF45]"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button
                onClick={() => { setIsAdding(false); setEditingRecord(null); }}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRecord}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                Save Procurement Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ⚡ AI RFQ TEXT PREVIEW & EDITOR */}
      {rfqModalItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 text-left">
            <div className="p-5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 flex justify-between items-center font-bold">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h2 className="text-base font-black">AI Request for Quotation (RFQ) Generator</h2>
              </div>
              <button onClick={() => setRfqModalItem(null)} className="text-slate-900 font-bold hover:text-white">✕</button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-900">
                <span className="font-bold">Target Item:</span> {rfqModalItem.item_name} | <span className="font-bold">Supplier:</span> {rfqModalItem.from_company || 'Vendor'} ({rfqModalItem.contact_email || 'No email set'})
              </div>

              {isGeneratingRfq ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs font-bold text-slate-700">Connecting to OpenRouter LLM... Generating customized RFQ body...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase">RFQ Body Text (Editable)</label>
                  <textarea
                    rows={10}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed"
                    value={generatedRfqText}
                    onChange={(e) => setGeneratedRfqText(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t flex flex-wrap justify-between items-center gap-2">
              <button
                onClick={() => handleGenerateAI_RFQ(rfqModalItem)}
                disabled={isGeneratingRfq}
                className="px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold rounded-xl border border-amber-300 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>🔄 Regenerate AI</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedRfqText);
                    alert('✅ RFQ text copied to clipboard!');
                  }}
                  className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-all"
                >
                  📋 Copy Text
                </button>

                {rfqModalItem.contact_email && (
                  <button
                    onClick={() => {
                      const targetEmail = rfqModalItem.contact_email || '';
                      const targetSubject = `RFQ: ${rfqModalItem.item_name} - Datlion Cnergy`;
                      const bodyText = generatedRfqText;
                      setRfqModalItem(null);
                      handleOpenWebmailIframe(targetEmail, targetSubject, bodyText);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <span>✉️ Send via Webmail</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: 📧 BULK MAIL RFQ DISPATCH */}
      {isBulkMailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 text-left">
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex justify-between items-center font-bold">
              <div className="flex items-center gap-2">
                <span className="text-xl">📧</span>
                <h2 className="text-base font-black">Bulk Send RFQs ({selectedIds.length} Suppliers)</h2>
              </div>
              <button onClick={() => setIsBulkMailModalOpen(false)} className="text-white hover:opacity-80">✕</button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <p className="text-xs text-slate-600">
                Review and dispatch customized RFQ emails to all selected suppliers simultaneously.
              </p>

              <div className="space-y-3 divide-y divide-slate-100">
                {suppliesRecords.filter(r => selectedIds.includes(r.id)).map(item => (
                  <div key={item.id} className="pt-3 first:pt-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 text-xs">{item.item_name}</span>
                        <span className="text-slate-400 text-[11px] ml-2">({item.from_company || 'Supplier'} — {item.contact_email || 'No email'})</span>
                      </div>
                      {item.contact_email ? (
                        <button
                          onClick={() => handleOpenWebmailIframe(item.contact_email || '', `RFQ: ${item.item_name} - Datlion Cnergy`, bulkRfqTexts[item.id] || item.rfq_text)}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg shadow-xs flex items-center gap-1"
                        >
                          <span>✉️ Send via Webmail</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">No Email Address</span>
                      )}
                    </div>

                    <textarea
                      rows={3}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-1 focus:ring-emerald-500"
                      value={bulkRfqTexts[item.id] || ''}
                      onChange={(e) => setBulkRfqTexts({ ...bulkRfqTexts, [item.id]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-between items-center">
              <button
                onClick={() => setIsBulkMailModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>

              <button
                onClick={() => {
                  setIsBulkMailModalOpen(false);
                  const firstSelectedWithEmail = suppliesRecords.find(r => selectedIds.includes(r.id) && r.contact_email);
                  if (firstSelectedWithEmail) {
                    handleOpenWebmailIframe(
                      firstSelectedWithEmail.contact_email || '',
                      `RFQ: ${firstSelectedWithEmail.item_name} - Datlion Cnergy`,
                      bulkRfqTexts[firstSelectedWithEmail.id] || firstSelectedWithEmail.rfq_text
                    );
                  }
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
              >
                <span>📧 Launch Webmail Dispatcher</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD COMPANY IFRAME */}
      {isAddCompanyModalOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsAddCompanyModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[85vh] max-h-[600px] flex flex-col overflow-hidden border border-slate-200 text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-3 border-b bg-slate-50 shrink-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-800">Add New Supplier Profile</h2>
              <button 
                onClick={() => setIsAddCompanyModalOpen(false)} 
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-lg font-bold"
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 w-full h-full min-h-0 bg-white">
              <iframe 
                src="/?mode=add_company" 
                className="w-full h-full border-none block"
                title="Add Company"
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: 📧 INTERNAL WEBMAIL DISPATCHER IFRAME */}
      {webmailIframeModal?.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 rounded-2xl shadow-2xl w-[96vw] max-w-6xl h-[92vh] flex flex-col overflow-hidden border border-slate-700">
            <div className="p-3.5 bg-slate-900 text-white border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">📧</span>
                <div>
                  <h2 className="text-sm font-black text-slate-100">Datlion Cnergy Webmail Dispatcher</h2>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Review & confirm RFQ email details before sending directly via configured webmail without leaving Supplies.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWebmailIframeModal(null)}
                className="text-slate-400 hover:text-white p-1.5 text-lg font-bold transition-colors"
                title="Close Dispatcher Modal"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-white relative overflow-hidden">
              <iframe
                src={`/?mode=webmail_compose&to=${encodeURIComponent(webmailIframeModal.to)}&subject=${encodeURIComponent(webmailIframeModal.subject)}&body=${encodeURIComponent(webmailIframeModal.body)}`}
                className="w-full h-full border-none"
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Internal Webmail Dispatcher"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuppliesRecord;
