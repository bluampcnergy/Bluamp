import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { SupplyRecord, CompanyProfile, ReceivedGood, User, View } from '../types';
import { Plus, Trash2, Search, RefreshCw } from './invoices/Icons';
import { generateRFQTextOpenRouter } from '../services/openrouterService';

interface SuppliesRecordProps {
  suppliesRecords: SupplyRecord[];
  setSuppliesRecords: React.Dispatch<React.SetStateAction<SupplyRecord[]>>;
  companyProfiles: CompanyProfile[];
  receivedGoods?: ReceivedGood[];
  setReceivedGoods?: React.Dispatch<React.SetStateAction<ReceivedGood[]>>;
  addLogEntry: (action: string, details: string) => void;
  currentUser: User | null;
  setView?: (view: View) => void;
}

export const SuppliesRecord: React.FC<SuppliesRecordProps> = ({
  suppliesRecords,
  setSuppliesRecords,
  companyProfiles,
  receivedGoods = [],
  setReceivedGoods,
  addLogEntry,
  currentUser,
  setView
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'to_be_ordered' | 'ordered' | 'delivered' | 'stock_alerts'>('to_be_ordered');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Modals
  const [isAdding, setIsAdding] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SupplyRecord | null>(null);
  const [rfqModalItem, setRfqModalItem] = useState<SupplyRecord | null>(null);
  const [generatedRfqText, setGeneratedRfqText] = useState<string>('');
  const [isGeneratingRfq, setIsGeneratingRfq] = useState<boolean>(false);
  
  const [isBulkMailModalOpen, setIsBulkMailModalOpen] = useState(false);
  const [bulkRfqTexts, setBulkRfqTexts] = useState<Record<string, string>>({});
  const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);

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
      const currentQty = good.quantity || 0;
      const initialQty = good.initialQuantity && good.initialQuantity > 0
        ? good.initialQuantity
        : (good.serials && good.serials.length > 0 ? good.serials.length : Math.max(currentQty, 1));
      const thresholdPercent = typeof good.lowStockThresholdPercent === 'number' ? good.lowStockThresholdPercent : 20;
      const thresholdQty = Math.round((initialQty * thresholdPercent) / 100);
      const percentRemaining = Math.max(0, Math.round((currentQty / initialQty) * 100));

      let localIgnoredMap: Record<string, boolean> = {};
      try {
        localIgnoredMap = JSON.parse(localStorage.getItem('dc_ignored_stock_alerts_map') || '{}');
      } catch (e) {
        localIgnoredMap = {};
      }

      const isIgnored = typeof good.isIgnoredForAlerts === 'boolean'
        ? good.isIgnoredForAlerts
        : Boolean(localIgnoredMap[good.id]);

      const isOutOfStock = currentQty <= 0;
      const isLowStock = isOutOfStock || currentQty <= thresholdQty;

      map.set(good.name.toLowerCase().trim(), {
        isLowStock,
        isOutOfStock,
        percentRemaining,
        currentQty,
        thresholdQty,
        isIgnored,
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

      // If item has low stock, default status to 'to_be_ordered', otherwise 'to_be_ordered' for initial seeds
      const defaultStatus: 'to_be_ordered' | 'delivered' = (alertInfo?.isLowStock && !alertInfo.isIgnored)
        ? 'to_be_ordered'
        : ((good.quantity && good.quantity > 50) ? 'delivered' : 'to_be_ordered');

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

  // Handle supplier dropdown selection in form to auto-fill supplier details
  const handleSupplierSelect = (companyName: string) => {
    if (companyName === 'ADD_NEW') {
      setIsAddCompanyModalOpen(true);
      return;
    }

    const comp = companyProfiles.find(c => c.name === companyName);
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
        from_company: companyName
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

  // Normalized Filtering
  const filteredRecords = useMemo(() => {
    return suppliesRecords.filter(r => {
      const alertInfo = rawMaterialAlertMap.get(r.item_name.toLowerCase().trim());
      const isLowStockTriggered = alertInfo?.isLowStock && !alertInfo.isIgnored && !r.is_ignored_for_alerts;

      // Determine effective status
      let effectiveStatus = r.status || (r.is_received ? 'delivered' : r.is_ordered ? 'ordered' : 'to_be_ordered');
      
      // Stock Level Alerts by default trigger 'to_be_ordered' status unless explicitly marked as delivered or ignored
      if (isLowStockTriggered && effectiveStatus !== 'delivered' && effectiveStatus !== 'ordered') {
        effectiveStatus = 'to_be_ordered';
      }

      let matchesStatus = true;
      if (activeStatusFilter === 'all') {
        matchesStatus = true;
      } else if (activeStatusFilter === 'stock_alerts') {
        matchesStatus = Boolean(isLowStockTriggered || r.status === 'to_be_ordered');
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

      return matchesStatus && matchesSearch;
    });
  }, [suppliesRecords, activeStatusFilter, searchTerm, rawMaterialAlertMap]);

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

      const st = r.status || (r.is_received ? 'delivered' : r.is_ordered ? 'ordered' : 'to_be_ordered');
      if (st === 'to_be_ordered' || (isLowStockTriggered && st !== 'delivered' && st !== 'ordered')) {
        to_be_ordered++;
      } else if (st === 'ordered') {
        ordered++;
      } else if (st === 'delivered') {
        delivered++;
      }
    });

    return { total: suppliesRecords.length, to_be_ordered, ordered, delivered, stock_alerts };
  }, [suppliesRecords, rawMaterialAlertMap]);

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
          {/* CSV Import Button */}
          <button
            onClick={handleCSVImportClick}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl transition-all border border-emerald-300 flex items-center gap-1.5 shadow-2xs"
            title="Import procurement items from CSV file"
          >
            <span>📥 Import CSV</span>
          </button>

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

      {/* CSV HEADER FORMAT NOTE & TEMPLATE DOWNLOAD BAR */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-xl">📄</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-amber-400 uppercase tracking-wider">CSV Header Format Note:</span>
            </div>
            <p className="text-[11px] font-mono text-slate-300 mt-0.5 leading-relaxed">
              <span className="text-emerald-400 font-bold">Product Name</span>, <span className="text-emerald-400 font-bold">Specification</span>, <span className="text-emerald-400 font-bold">Supplier</span>, <span className="text-emerald-400 font-bold">Website</span>, <span className="text-emerald-400 font-bold">Contact Name</span>, <span className="text-emerald-400 font-bold">Contact Number</span>, <span className="text-emerald-400 font-bold">Contact Email</span>, <span className="text-emerald-400 font-bold">Status</span>, <span className="text-emerald-400 font-bold">Target Quantity</span>, <span className="text-emerald-400 font-bold">UOM</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={downloadCSVTemplate}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1 shadow-2xs whitespace-nowrap"
            title="Download CSV sample file with proper headers"
          >
            <span>💾 Download Sample CSV Template</span>
          </button>

          <button
            onClick={handleCSVImportClick}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-2xs whitespace-nowrap"
          >
            <span>📥 Choose CSV File</span>
          </button>
        </div>
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
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search product, spec, or supplier..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-slate-400 text-xs hover:text-slate-700">✕</button>
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
                            <span>🏢 {record.from_company || 'Unassigned Supplier'}</span>
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

                      {/* Actions & Communication Triggers */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* 🔗 Buying URL */}
                          {record.website_url ? (
                            <a
                              href={record.website_url.startsWith('http') ? record.website_url : `https://${record.website_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-300 flex items-center gap-1 transition-all"
                              title="Open Supplier Buying URL / Store Catalog"
                            >
                              <span>🔗 Website</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">No URL</span>
                          )}

                          {/* 💬 WhatsApp Trigger */}
                          {record.contact_number ? (
                            <a
                              href={getWhatsAppLink(record.contact_number, record.rfq_text || `Hello ${record.contact_name || ''}, inquiring about ${record.item_name} from Datlion Cnergy.`)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow-xs transition-all"
                              title="Send direct WhatsApp message to supplier contact"
                            >
                              <span>💬 WhatsApp</span>
                            </a>
                          ) : null}

                          {/* ✉️ Direct Webmail Trigger */}
                          {record.contact_email ? (
                            <button
                              onClick={() => handleOpenWebmailIframe(record.contact_email || '', `RFQ: ${record.item_name} Quotation Inquiry`, record.rfq_text || `Dear ${record.contact_name || 'Sales Team'},\n\nPlease share your best quotation for ${record.item_name}.\n\nBest regards,\nProcurement Team\nDatlion Cnergy`)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow-xs transition-all"
                              title="Send direct email via internal Webmail dispatcher iframe"
                            >
                              <span>✉️ Direct Mail</span>
                            </button>
                          ) : null}

                          {/* 📧 Cnergy Webmail RFQ */}
                          <button
                            onClick={() => handleOpenWebmailIframe(record.contact_email || '', `RFQ: ${record.item_name} - Datlion Cnergy`, record.rfq_text || `Dear ${record.contact_name || 'Sales Team'},\n\nPlease share your best quotation for ${record.item_name}.\n\nBest regards,\nProcurement Team\nDatlion Cnergy`)}
                            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 transition-all"
                            title="Open Internal Webmail Dispatcher"
                          >
                            <span>📧 Webmail</span>
                          </button>

                          {/* ⚡ AI RFQ Generator */}
                          <button
                            onClick={() => handleGenerateAI_RFQ(record)}
                            className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 text-[11px] font-extrabold rounded-lg border border-amber-400/40 flex items-center gap-1 transition-all"
                            title="Generate AI Request for Quotation text"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                    value={formData.item_name}
                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  />
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
                  <label className="text-[10px] font-black text-slate-500 uppercase">Supplier Company</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                    value={formData.from_company}
                    onChange={(e) => handleSupplierSelect(e.target.value)}
                  >
                    <option value="">-- Select Supplier Company --</option>
                    {companyProfiles.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    <option value="ADD_NEW" className="font-bold text-emerald-600">+ Add New Company...</option>
                  </select>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 text-left">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-slate-800">Add New Supplier Profile</h2>
              <button onClick={() => setIsAddCompanyModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2">✕</button>
            </div>
            <div className="flex-1 min-h-[600px] h-[75vh]">
              <iframe 
                src="/?mode=add_company" 
                className="w-full h-full border-none"
                title="Add Company"
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: 📧 INTERNAL WEBMAIL DISPATCHER IFRAME */}
      {webmailIframeModal?.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden border border-slate-700">
            <div className="p-3.5 bg-slate-900 text-white border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">📧</span>
                <div>
                  <h2 className="text-sm font-black text-slate-100">Datlion Cnergy Internal Webmail Dispatcher</h2>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Review & confirm email before sending directly via configured webmail without leaving Supplies.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWebmailIframeModal(null)}
                className="text-slate-400 hover:text-white p-1.5 text-lg font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-white">
              <iframe
                src={`/?mode=webmail_compose&to=${encodeURIComponent(webmailIframeModal.to)}&subject=${encodeURIComponent(webmailIframeModal.subject)}&body=${encodeURIComponent(webmailIframeModal.body)}`}
                className="w-full h-full border-none"
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
