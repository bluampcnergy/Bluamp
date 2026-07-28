import React, { useState, useMemo, useEffect } from 'react';
import type { SupplyRecord, CompanyProfile, ReceivedGood, User, View } from '../types';
import { Plus, Trash2, Search, RefreshCw } from './invoices/Icons';
import { generateRFQTextOpenRouter } from '../services/openrouterService';

interface SuppliesRecordProps {
  suppliesRecords: SupplyRecord[];
  setSuppliesRecords: React.Dispatch<React.SetStateAction<SupplyRecord[]>>;
  companyProfiles: CompanyProfile[];
  receivedGoods?: ReceivedGood[];
  addLogEntry: (action: string, details: string) => void;
  currentUser: User | null;
  setView?: (view: View) => void;
}

export const SuppliesRecord: React.FC<SuppliesRecordProps> = ({
  suppliesRecords,
  setSuppliesRecords,
  companyProfiles,
  receivedGoods = [],
  addLogEntry,
  currentUser,
  setView
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'to_be_ordered' | 'ordered' | 'delivered'>('all');
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

  // Auto-seed procurement dashboard from existing Raw Materials & Company Profiles if empty or on sync
  const autoSeedFromInventory = React.useCallback(() => {
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

      const seedRecord: SupplyRecord = {
        id: crypto.randomUUID(),
        item_name: good.name,
        specification: good.makeModel || `${good.category || 'Raw Material'} Component`,
        from_company: good.supplier || matchedCompany?.name || 'Primary Supplier',
        to_company: 'Datlion Cnergy Plant',
        supplier_id: matchedCompany?.id,
        website_url: matchedCompany ? `https://www.google.com/search?q=${encodeURIComponent(matchedCompany.name)}` : '',
        contact_name: matchedCompany?.contactPerson || 'Sales Desk',
        contact_number: matchedCompany?.phoneNumber || '',
        contact_email: matchedCompany?.email || '',
        status: (good.quantity && good.quantity > 50) ? 'delivered' : 'to_be_ordered',
        target_quantity: good.initialQuantity || good.quantity || 100,
        uom: (good.uom as any) || 'qty',
        rfq_text: '',
        timestamp: Date.now(),
        created_by: 'Auto-Seed Engine'
      };

      newSeeds.push(seedRecord);
    });

    if (newSeeds.length > 0) {
      setSuppliesRecords(prev => [...newSeeds, ...prev]);
      addLogEntry('Procurement Auto-Seed', `Auto-populated ${newSeeds.length} items from Raw Materials & Companies database.`);
    }
  }, [receivedGoods, companyProfiles, suppliesRecords, setSuppliesRecords, addLogEntry]);

  // Initial auto-seed if suppliesRecords is empty
  useEffect(() => {
    if (suppliesRecords.length === 0 && receivedGoods.length > 0) {
      autoSeedFromInventory();
    }
  }, [suppliesRecords.length, receivedGoods.length, autoSeedFromInventory]);

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

  // Create or Update Record
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
        to_company: formData.to_company || 'Datlion Cnergy',
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

  // Quick Status Change
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

  // Delete Record
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
    setGeneratedRfqText(record.rfq_text || 'Generating RFQ using OpenRouter AI...');

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
      // Persist to item
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

  // Bulk Status Update
  const handleBulkStatusChange = (status: 'to_be_ordered' | 'ordered' | 'delivered') => {
    if (selectedIds.length === 0) return;
    setSuppliesRecords(prev => prev.map(r => selectedIds.includes(r.id) ? { ...r, status } : r));
    addLogEntry('Bulk Procurement Status Update', `Updated ${selectedIds.length} items to ${status}`);
    setSelectedIds([]);
  };

  // Normalized Filtering
  const filteredRecords = useMemo(() => {
    return suppliesRecords.filter(r => {
      // Determine effective status if legacy record
      const effectiveStatus = r.status || (r.is_received ? 'delivered' : r.is_ordered ? 'ordered' : 'to_be_ordered');
      
      const matchesStatus = activeStatusFilter === 'all' || effectiveStatus === activeStatusFilter;
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch = !search || 
        r.item_name.toLowerCase().includes(search) ||
        (r.specification && r.specification.toLowerCase().includes(search)) ||
        (r.from_company && r.from_company.toLowerCase().includes(search)) ||
        (r.contact_name && r.contact_name.toLowerCase().includes(search)) ||
        (r.contact_email && r.contact_email.toLowerCase().includes(search));

      return matchesStatus && matchesSearch;
    });
  }, [suppliesRecords, activeStatusFilter, searchTerm]);

  // Counts
  const counts = useMemo(() => {
    let to_be_ordered = 0;
    let ordered = 0;
    let delivered = 0;

    suppliesRecords.forEach(r => {
      const st = r.status || (r.is_received ? 'delivered' : r.is_ordered ? 'ordered' : 'to_be_ordered');
      if (st === 'to_be_ordered') to_be_ordered++;
      else if (st === 'ordered') ordered++;
      else if (st === 'delivered') delivered++;
    });

    return { total: suppliesRecords.length, to_be_ordered, ordered, delivered };
  }, [suppliesRecords]);

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
      {/* TOP DASHBOARD HEADER */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 text-xl font-bold">
              📦
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Procurement & Supplies Dashboard</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Track raw component requisitions, RFQ workflows, supplier contacts, and order fulfillment status.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={autoSeedFromInventory}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-300 flex items-center gap-1.5"
            title="Auto-sync product specifications and primary suppliers from Raw Materials inventory database"
          >
            <RefreshCw size={14} className="text-slate-500" />
            <span>Sync Inventory Items</span>
          </button>

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
            <span>+ Add Procurement Item</span>
          </button>
        </div>
      </div>

      {/* METRIC KPI CARDS & STATUS TABS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <p className={`text-[10px] font-black uppercase tracking-wider ${activeStatusFilter === 'all' ? 'text-slate-400' : 'text-slate-400'}`}>Total Requirements</p>
            <h3 className="text-2xl font-black mt-1">{counts.total}</h3>
          </div>
          <span className="text-2xl">📋</span>
        </div>

        {/* To Be Ordered (Amber) */}
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
              <p className="text-[10px] font-black uppercase tracking-wider">🟡 To Be Ordered</p>
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
      </div>

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
                      <p className="text-xs text-slate-400">Click "Sync Inventory Items" to auto-seed from Raw Materials, or add items manually.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const effectiveStatus = record.status || (record.is_received ? 'delivered' : record.is_ordered ? 'ordered' : 'to_be_ordered');
                  const isChecked = selectedIds.includes(record.id);

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
                          <span className="font-bold text-slate-900 text-sm">{record.item_name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-slate-200">
                              Qty: {record.target_quantity || 100} {record.uom || 'qty'}
                            </span>
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

                          {/* ✉️ Direct Mailto Trigger */}
                          {record.contact_email ? (
                            <a
                              href={getMailtoLink(record.contact_email, `RFQ: ${record.item_name} Quotation Inquiry`, record.rfq_text)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow-xs transition-all"
                              title="Launch direct mailto: email client"
                            >
                              <span>✉️ Direct Mail</span>
                            </a>
                          ) : null}

                          {/* 📧 Cnergy Webmail RFQ */}
                          {setView && (
                            <button
                              onClick={() => {
                                setView('webmail');
                              }}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 transition-all"
                              title="Open Cnergy Webmail Portal"
                            >
                              <span>📧 Webmail</span>
                            </button>
                          )}

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
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
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
                  <a
                    href={getMailtoLink(rfqModalItem.contact_email, `RFQ: ${rfqModalItem.item_name} - Datlion Cnergy`, generatedRfqText)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                  >
                    ✉️ Open Mailto:
                  </a>
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
                        <a
                          href={getMailtoLink(item.contact_email, `RFQ: ${item.item_name}`, bulkRfqTexts[item.id] || item.rfq_text)}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg shadow-xs"
                        >
                          ✉️ Send Mailto
                        </a>
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

              {setView && (
                <button
                  onClick={() => {
                    setIsBulkMailModalOpen(false);
                    setView('webmail');
                  }}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                >
                  <span>📧 Open Cnergy Webmail Portal</span>
                </button>
              )}
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
    </div>
  );
};

export default SuppliesRecord;
