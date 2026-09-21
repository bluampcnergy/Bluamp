import React, { useState, useMemo, useEffect } from 'react';
import { InboundOrderTracking, CompanyProfile, ReceivedGood } from '../types';
import { SearchableSupplierDropdown } from './SearchableSupplierDropdown';

interface InboundTrackingTabProps {
  orders?: InboundOrderTracking[];
  setOrders?: React.Dispatch<React.SetStateAction<InboundOrderTracking[]>>;
  companyProfiles?: CompanyProfile[];
  receivedGoods?: ReceivedGood[];
  addLogEntry?: (action: string, details: string) => void;
  currentUser?: any;
}

const STORAGE_KEY = 'dc_inbound_order_tracking';

const DUMMY_INITIAL_ORDERS: InboundOrderTracking[] = [
  {
    id: 'inb_1',
    order_date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    item_name: '3.2V 280Ah LiFePO4 Prismatic Cells',
    supplier_name: 'EVE Energy Co. / Pune Sourcing Hub',
    transport_number: 'VRL-PUN-89234',
    is_ordered: true,
    is_received: true,
    is_invoice_recorded: true,
    quantity: 320,
    uom: 'pcs',
    notes: 'Vehicle MH-12-QW-4521, Batch #2026-09A',
    timestamp: Date.now() - 3 * 86400000,
  },
  {
    id: 'inb_2',
    order_date: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
    item_name: '16S 100A Smart Bluetooth BMS with CAN/RS485',
    supplier_name: 'Daly BMS India Electronics',
    transport_number: 'TCI-EXP-44120',
    is_ordered: true,
    is_received: false,
    is_invoice_recorded: false,
    quantity: 50,
    uom: 'pcs',
    notes: 'In transit via TCI Express Pune Hub, ETA Tomorrow',
    timestamp: Date.now() - 1 * 86400000,
  },
  {
    id: 'inb_3',
    order_date: new Date().toISOString().split('T')[0],
    item_name: 'Pure Nickel Strips 0.15mm x 8mm',
    supplier_name: 'Apex Precision Metals Mumbai',
    transport_number: 'DTDC-BOM-10293',
    is_ordered: true,
    is_received: true,
    is_invoice_recorded: false,
    quantity: 15,
    uom: 'kg',
    notes: 'Delivered at Factory Gate 2, invoice pending finance review',
    timestamp: Date.now(),
  },
];

export const InboundTrackingTab: React.FC<InboundTrackingTabProps> = ({
  orders: propsOrders,
  setOrders: propsSetOrders,
  companyProfiles = [],
  receivedGoods = [],
  addLogEntry,
  currentUser,
}) => {
  // Local state fallback if not passed from parent
  const [internalOrders, setInternalOrders] = useState<InboundOrderTracking[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to read inbound tracking from storage', e);
    }
    return DUMMY_INITIAL_ORDERS;
  });

  const orders = propsOrders && propsOrders.length > 0 ? propsOrders : internalOrders;
  const setOrders = (updater: InboundOrderTracking[] | ((prev: InboundOrderTracking[]) => InboundOrderTracking[])) => {
    if (propsSetOrders) {
      propsSetOrders(updater);
    }
    setInternalOrders(prev => {
      const updated = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Sync internal state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch (e) {}
  }, [orders]);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_transit' | 'reached_factory' | 'pending_invoice' | 'completed'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<InboundOrderTracking | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    order_date: new Date().toISOString().split('T')[0],
    item_name: '',
    supplier_name: '',
    transport_number: '',
    quantity: '',
    uom: 'pcs',
    is_ordered: true,
    is_received: false,
    is_invoice_recorded: false,
    notes: '',
  });

  // Copy notification state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLR = async (e: React.MouseEvent, lrNumber: string, id: string) => {
    e.stopPropagation();
    if (!lrNumber) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(lrNumber);
      } else {
        const ta = document.createElement('textarea');
        ta.value = lrNumber;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (err) {
      console.error('Failed to copy LR number', err);
    }
  };

  // Open modal for new order
  const handleOpenAdd = () => {
    setEditingOrder(null);
    setFormData({
      order_date: new Date().toISOString().split('T')[0],
      item_name: '',
      supplier_name: '',
      transport_number: '',
      quantity: '',
      uom: 'pcs',
      is_ordered: true,
      is_received: false,
      is_invoice_recorded: false,
      notes: '',
    });
    setIsModalOpen(true);
  };

  // Open modal for editing order
  const handleOpenEdit = (order: InboundOrderTracking) => {
    setEditingOrder(order);
    setFormData({
      order_date: order.order_date || new Date().toISOString().split('T')[0],
      item_name: order.item_name || '',
      supplier_name: order.supplier_name || '',
      transport_number: order.transport_number || '',
      quantity: order.quantity !== undefined ? String(order.quantity) : '',
      uom: order.uom || 'pcs',
      is_ordered: order.is_ordered ?? true,
      is_received: order.is_received ?? false,
      is_invoice_recorded: order.is_invoice_recorded ?? false,
      notes: order.notes || '',
    });
    setIsModalOpen(true);
  };

  // Save order (create or edit)
  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.item_name.trim()) {
      alert('Please enter the item ordered.');
      return;
    }
    if (!formData.supplier_name.trim()) {
      alert('Please enter or select the supplier company.');
      return;
    }

    const qtyNum = formData.quantity ? parseFloat(formData.quantity) : undefined;

    if (editingOrder) {
      // Update existing
      setOrders(prev => prev.map(o => {
        if (o.id === editingOrder.id) {
          return {
            ...o,
            order_date: formData.order_date,
            item_name: formData.item_name.trim(),
            supplier_name: formData.supplier_name.trim(),
            transport_number: formData.transport_number.trim(),
            quantity: isNaN(qtyNum as number) ? undefined : qtyNum,
            uom: formData.uom.trim(),
            is_ordered: formData.is_ordered,
            is_received: formData.is_received,
            is_invoice_recorded: formData.is_invoice_recorded,
            notes: formData.notes.trim(),
          };
        }
        return o;
      }));

      if (addLogEntry) {
        addLogEntry(
          'UPDATE_INBOUND_ORDER',
          `Updated inbound order for "${formData.item_name}" from "${formData.supplier_name}" (LR: ${formData.transport_number || 'N/A'}).`
        );
      }
    } else {
      // Create new
      const newEntry: InboundOrderTracking = {
        id: `inb_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        order_date: formData.order_date,
        item_name: formData.item_name.trim(),
        supplier_name: formData.supplier_name.trim(),
        transport_number: formData.transport_number.trim(),
        quantity: isNaN(qtyNum as number) ? undefined : qtyNum,
        uom: formData.uom.trim(),
        is_ordered: formData.is_ordered,
        is_received: formData.is_received,
        is_invoice_recorded: formData.is_invoice_recorded,
        notes: formData.notes.trim(),
        timestamp: Date.now(),
        created_by: currentUser?.name || currentUser?.username || 'Staff',
      };

      setOrders(prev => [newEntry, ...prev]);

      if (addLogEntry) {
        addLogEntry(
          'ADD_INBOUND_ORDER',
          `Added inbound order tracking for "${formData.item_name}" from "${formData.supplier_name}" (LR: ${formData.transport_number || 'N/A'}).`
        );
      }
    }

    setIsModalOpen(false);
  };

  // Delete order
  const handleDeleteOrder = (id: string, itemName: string) => {
    if (!window.confirm(`Are you sure you want to delete the inbound order tracking for "${itemName}"?`)) {
      return;
    }

    setOrders(prev => prev.filter(o => o.id !== id));

    if (addLogEntry) {
      addLogEntry('DELETE_INBOUND_ORDER', `Deleted inbound tracking entry for "${itemName}".`);
    }
  };

  // Quick toggle status directly from the table
  const handleToggleStatus = (id: string, field: 'is_ordered' | 'is_received' | 'is_invoice_recorded') => {
    setOrders(prev => prev.map(o => {
      if (o.id === id) {
        const nextVal = !o[field];
        const updated = { ...o, [field]: nextVal };

        if (addLogEntry) {
          const fieldLabel = 
            field === 'is_ordered' ? 'Ordered' :
            field === 'is_received' ? 'Reached Factory' :
            'Invoice Added to Records';
          addLogEntry(
            'TOGGLE_INBOUND_STATUS',
            `Changed ${fieldLabel} status to "${nextVal ? 'Yes' : 'No'}" for item "${o.item_name}".`
          );
        }

        return updated;
      }
      return o;
    }));
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (orders.length === 0) {
      alert('No inbound order tracking data to export.');
      return;
    }

    const headers = [
      'Order Date',
      'Item Ordered',
      'Quantity',
      'UOM',
      'Supplier Company',
      'Transport / LR Number',
      'Ordered Status',
      'Received At Factory',
      'Invoice Added To Records',
      'Notes'
    ];

    const rows = orders.map(o => [
      `"${o.order_date || ''}"`,
      `"${(o.item_name || '').replace(/"/g, '""')}"`,
      o.quantity !== undefined ? o.quantity : '',
      `"${o.uom || ''}"`,
      `"${(o.supplier_name || '').replace(/"/g, '""')}"`,
      `"${(o.transport_number || '').replace(/"/g, '""')}"`,
      o.is_ordered ? 'Yes' : 'No',
      o.is_received ? 'Yes' : 'No',
      o.is_invoice_recorded ? 'Yes' : 'No',
      `"${(o.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `factory_inbound_shipments_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = orders.length;
    const inTransit = orders.filter(o => o.is_ordered && !o.is_received).length;
    const reachedFactory = orders.filter(o => o.is_received).length;
    const pendingInvoice = orders.filter(o => o.is_received && !o.is_invoice_recorded).length;
    const completed = orders.filter(o => o.is_ordered && o.is_received && o.is_invoice_recorded).length;

    return { total, inTransit, reachedFactory, pendingInvoice, completed };
  }, [orders]);

  // Filtered rows
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Search filter
      const s = searchTerm.toLowerCase().trim();
      if (s) {
        const matchesItem = (o.item_name || '').toLowerCase().includes(s);
        const matchesSupplier = (o.supplier_name || '').toLowerCase().includes(s);
        const matchesLR = (o.transport_number || '').toLowerCase().includes(s);
        const matchesNotes = (o.notes || '').toLowerCase().includes(s);
        if (!matchesItem && !matchesSupplier && !matchesLR && !matchesNotes) return false;
      }

      // Status filter
      if (statusFilter === 'in_transit') return o.is_ordered && !o.is_received;
      if (statusFilter === 'reached_factory') return o.is_received;
      if (statusFilter === 'pending_invoice') return o.is_received && !o.is_invoice_recorded;
      if (statusFilter === 'completed') return o.is_ordered && o.is_received && o.is_invoice_recorded;

      return true;
    });
  }, [orders, searchTerm, statusFilter]);

  // Unique item suggestions from receivedGoods & company profiles
  const itemSuggestions = useMemo(() => {
    const names = new Set<string>();
    receivedGoods.forEach(rg => {
      if (rg.name) names.add(rg.name);
    });
    orders.forEach(o => {
      if (o.item_name) names.add(o.item_name);
    });
    return Array.from(names);
  }, [receivedGoods, orders]);

  return (
    <div className="flex flex-col h-full bg-slate-50 space-y-4">
      {/* METRIC SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl shrink-0">
            📦
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Orders</span>
            <span className="text-xl font-black text-slate-900">{metrics.total}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl shrink-0">
            🚚
          </div>
          <div>
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">In Transit</span>
            <span className="text-xl font-black text-amber-700">{metrics.inTransit}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shrink-0">
            🏭
          </div>
          <div>
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">At Factory</span>
            <span className="text-xl font-black text-emerald-700">{metrics.reachedFactory}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-rose-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl shrink-0">
            📑
          </div>
          <div>
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Pending Invoice</span>
            <span className="text-xl font-black text-rose-700">{metrics.pendingInvoice}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-sky-200 shadow-xs flex items-center gap-3 col-span-2 md:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-xl shrink-0">
            ✅
          </div>
          <div>
            <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider block">Completed</span>
            <span className="text-xl font-black text-sky-700">{metrics.completed}</span>
          </div>
        </div>
      </div>

      {/* ACTION BAR & CONTROLS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Search & Filter */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by item, supplier, LR/transport #..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick status pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({orders.length})
            </button>
            <button
              onClick={() => setStatusFilter('in_transit')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                statusFilter === 'in_transit' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🚚 In Transit</span>
              <span className="text-[10px] opacity-80">({metrics.inTransit})</span>
            </button>
            <button
              onClick={() => setStatusFilter('reached_factory')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                statusFilter === 'reached_factory' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🏭 Reached</span>
              <span className="text-[10px] opacity-80">({metrics.reachedFactory})</span>
            </button>
            <button
              onClick={() => setStatusFilter('pending_invoice')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                statusFilter === 'pending_invoice' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📑 Pending Inv.</span>
              <span className="text-[10px] opacity-80">({metrics.pendingInvoice})</span>
            </button>
          </div>
        </div>

        {/* Right: Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            title="Export tracking table to CSV"
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
          >
            <span>📥 Export CSV</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
          >
            <span>➕ Add Inbound Order</span>
          </button>
        </div>
      </div>

      {/* TRACKING TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-3 min-w-[110px]">Date of Order</th>
                <th className="py-3 px-3 min-w-[200px]">Item Ordered</th>
                <th className="py-3 px-3 min-w-[180px]">Supplier Company</th>
                <th className="py-3 px-3 min-w-[160px]">Transport / LR Number</th>
                <th className="py-3 px-3 min-w-[120px] text-center">Ordered Status</th>
                <th className="py-3 px-3 min-w-[140px] text-center">Reached Factory</th>
                <th className="py-3 px-3 min-w-[150px] text-center">Invoice Recorded</th>
                <th className="py-3 px-3 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <span className="text-3xl block mb-2">🚚</span>
                    <p className="font-semibold text-xs">No inbound order tracking records found.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Click "+ Add Inbound Order" above to start tracking factory shipments.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => {
                  return (
                    <tr 
                      key={order.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        order.is_ordered && order.is_received && order.is_invoice_recorded
                          ? 'bg-emerald-50/30'
                          : ''
                      }`}
                    >
                      {/* Index */}
                      <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Date of Order */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {order.order_date ? new Date(order.order_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                      </td>

                      {/* Item Ordered */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 leading-snug">
                          {order.item_name}
                        </div>
                        {order.quantity !== undefined && order.quantity > 0 && (
                          <span className="text-[11px] text-slate-500 font-mono">
                            Qty: <strong>{order.quantity} {order.uom || 'pcs'}</strong>
                          </span>
                        )}
                        {order.notes && (
                          <p className="text-[10px] text-slate-400 italic line-clamp-1 mt-0.5" title={order.notes}>
                            📝 {order.notes}
                          </p>
                        )}
                      </td>

                      {/* Supplier Company */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">
                          {order.supplier_name}
                        </div>
                      </td>

                      {/* Transport / LR Number */}
                      <td className="py-3 px-3">
                        {order.transport_number ? (
                          <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                            <span className="font-mono font-bold text-slate-800 text-[11px] select-all">
                              {order.transport_number}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyLR(e, order.transport_number, order.id)}
                              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
                              title={copiedId === order.id ? 'Copied!' : 'Copy LR / Tracking #'}
                            >
                              {copiedId === order.id ? (
                                <span className="text-emerald-600 font-bold text-[10px]">✓</span>
                              ) : (
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect width="13" height="13" x="9" y="9" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No LR / tracking</span>
                        )}
                      </td>

                      {/* Ordered Status Checkmark */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(order.id, 'is_ordered')}
                          title="Click to toggle Ordered status"
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border inline-flex items-center gap-1 cursor-pointer ${
                            order.is_ordered
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          <span>{order.is_ordered ? '✓' : '○'}</span>
                          <span>{order.is_ordered ? 'Ordered' : 'Pending'}</span>
                        </button>
                      </td>

                      {/* Received Status (Reached Factory) Checkmark */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(order.id, 'is_received')}
                          title="Click to toggle Factory Arrival status"
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border inline-flex items-center gap-1 cursor-pointer ${
                            order.is_received
                              ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-2xs'
                              : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                          }`}
                        >
                          <span>{order.is_received ? '✓' : '🚚'}</span>
                          <span>{order.is_received ? 'Reached Factory' : 'In Transit'}</span>
                        </button>
                      </td>

                      {/* Invoice Added Status Checkmark */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(order.id, 'is_invoice_recorded')}
                          title="Click to toggle Invoice Recorded status"
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border inline-flex items-center gap-1 cursor-pointer ${
                            order.is_invoice_recorded
                              ? 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100'
                              : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                          }`}
                        >
                          <span>{order.is_invoice_recorded ? '✓' : '⚠️'}</span>
                          <span>{order.is_invoice_recorded ? 'Recorded' : 'Pending Invoice'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(order)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit this inbound order"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order.id, order.item_name)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete this inbound order"
                          >
                            🗑️
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

      {/* ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🚚</span>
                <h3 className="text-sm font-bold">
                  {editingOrder ? 'Edit Inbound Order Tracking' : 'Add New Inbound Order'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/70 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveOrder} className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Row 1: Order Date */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Date of Order *</label>
                <input
                  type="date"
                  required
                  value={formData.order_date}
                  onChange={e => setFormData(prev => ({ ...prev, order_date: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none"
                />
              </div>

              {/* Row 2: Item Ordered */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Item Ordered *</label>
                <input
                  type="text"
                  required
                  list="item-suggestions-list"
                  value={formData.item_name}
                  onChange={e => setFormData(prev => ({ ...prev, item_name: e.target.value }))}
                  placeholder="e.g. 3.2V 280Ah Cell, 100A Smart BMS, Nickel Strip"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none"
                />
                <datalist id="item-suggestions-list">
                  {itemSuggestions.map((name, i) => (
                    <option key={i} value={name} />
                  ))}
                </datalist>
              </div>

              {/* Row 3: Quantity & UOM */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Quantity (Optional)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.quantity}
                    onChange={e => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                    placeholder="e.g. 100"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit of Measurement</label>
                  <select
                    value={formData.uom}
                    onChange={e => setFormData(prev => ({ ...prev, uom: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none"
                  >
                    <option value="pcs">pcs</option>
                    <option value="units">units</option>
                    <option value="kg">kg</option>
                    <option value="grams">grams</option>
                    <option value="meters">meters</option>
                    <option value="rolls">rolls</option>
                    <option value="boxes">boxes</option>
                    <option value="sets">sets</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Supplier Company */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Supplier Company *</label>
                <SearchableSupplierDropdown
                  value={formData.supplier_name}
                  onChange={val => setFormData(prev => ({ ...prev, supplier_name: val }))}
                  companyProfiles={companyProfiles}
                  placeholder="Search & select supplier company..."
                />
              </div>

              {/* Row 5: Transport Number / LR Number */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Transport Number (LR / Bilty / Courier Tracking #)
                </label>
                <input
                  type="text"
                  value={formData.transport_number}
                  onChange={e => setFormData(prev => ({ ...prev, transport_number: e.target.value }))}
                  placeholder="e.g. VRL-PUN-89234, GATI-9821, DTDC-12345"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none"
                />
              </div>

              {/* Row 6: Status Checkmarks */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                  Shipment & Record Status
                </span>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.is_ordered}
                    onChange={e => setFormData(prev => ({ ...prev, is_ordered: e.target.checked }))}
                    className="w-4 h-4 rounded text-[#8EBF45] focus:ring-[#8EBF45] cursor-pointer"
                  />
                  <span className="font-bold text-slate-800">
                    ✓ Ordered Status (Confirmed PO / order placed)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.is_received}
                    onChange={e => setFormData(prev => ({ ...prev, is_received: e.target.checked }))}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="font-bold text-emerald-800">
                    🏭 Received Status (Has reached factory gate / warehouse)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.is_invoice_recorded}
                    onChange={e => setFormData(prev => ({ ...prev, is_invoice_recorded: e.target.checked }))}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <span className="font-bold text-sky-800">
                    📑 Invoice Added to Internal Records (Inventory & Finance)
                  </span>
                </label>
              </div>

              {/* Row 7: Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Remarks (Optional)</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Transporter name, driver phone, vehicle number, arrival bay..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none resize-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition-all"
                >
                  {editingOrder ? 'Update Order' : 'Add Inbound Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InboundTrackingTab;
