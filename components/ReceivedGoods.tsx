import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ReceivedGood, WIPItem, FinishedGood, CompanyProfile, TestResult, User, ExtractedInvoice, Recipe } from '../types';
import { ReceivedGoodStatus, EMPTY_INVOICE } from '../types';
import Modal from './Modal';
import { PlusIcon } from './icons/PlusIcon';
import { PencilIcon } from './icons/PencilIcon';
import { DuplicateIcon } from './icons/DuplicateIcon';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import { MergeIcon } from './icons/MergeIcon';
import { RefreshCw, Trash2, Download, Package, FileText, CheckCircle, AlertTriangle } from './invoices/Icons';
import { ImportIcon } from './icons/ImportIcon';
import { SearchIcon } from './icons/SearchIcon';
import { getItemStockAlertInfo } from '../utils/stockAlerts';
import { SearchableSupplierDropdown } from './SearchableSupplierDropdown';

interface ReceivedGoodsProps {
    receivedGoods: ReceivedGood[];
    setReceivedGoods: React.Dispatch<React.SetStateAction<ReceivedGood[]>>;
    recipes?: Recipe[];
    setRecipes?: React.Dispatch<React.SetStateAction<Recipe[]>>;
    addLogEntry: (action: string, details: string) => void;
    wipItems: WIPItem[];
    setWipItems?: React.Dispatch<React.SetStateAction<WIPItem[]>>;
    finishedGoods: FinishedGood[];
    setFinishedGoods?: React.Dispatch<React.SetStateAction<FinishedGood[]>>;
    companyProfiles: CompanyProfile[];
    testResults: TestResult[];
    setTestResults: React.Dispatch<React.SetStateAction<TestResult[]>>;
    currentUser: User | null;
    setView?: (view: any) => void;
    setInvoiceDraft?: (draft: ExtractedInvoice) => void;
}

export interface MasterGroupedGood {
    masterKey: string;
    name: string;
    category: string;
    totalQuantity: number;
    totalInitialQuantity: number;
    uom: string;
    unitCost?: number; // Internal unit cost excluding GST (₹)
    lowStockThresholdPercent: number;
    isIgnoredForAlerts: boolean;
    status: ReceivedGoodStatus | string;
    suppliers: string[];
    makeModels: string[];
    batches: ReceivedGood[];
    latestTimestamp: number;
    earliestTimestamp: number;
    totalSerials: number;
    notes?: string;
    isOutOfStock: boolean;
    isLowStock: boolean;
}

const statusInfo: Record<string, { text: string; color: string }> = {
    [ReceivedGoodStatus.ND]: { text: 'Not Damaged', color: 'bg-[#A8BF75]/20 text-[#658C3E] border border-[#A8BF75]/50' },
    [ReceivedGoodStatus.PR]: { text: 'Partially Received', color: 'bg-yellow-50 text-yellow-800 border border-yellow-200' },
    [ReceivedGoodStatus.D]: { text: 'Damaged', color: 'bg-red-50 text-red-800 border border-red-200' },
    [ReceivedGoodStatus.Other]: { text: 'Other', color: 'bg-gray-100 text-gray-800 border border-gray-200' },
};

const initialFormState: Omit<ReceivedGood, 'id' | 'timestamp' | 'serials'> & { serials: string[]; invoiceDate?: string } = {
    name: '',
    category: '',
    makeModel: '',
    supplier: '',
    quantity: 0,
    initialQuantity: 0,
    uom: 'qty',
    unitCost: 0,
    lowStockThresholdPercent: 20,
    isIgnoredForAlerts: false,
    status: ReceivedGoodStatus.ND,
    damagedCount: 0,
    invoiceNumber: '',
    serials: [],
    notes: 'actual physical qty = ',
    invoiceDate: new Date().toISOString().split('T')[0]
};

const DEFAULT_RAW_CATEGORIES = ['Cell', 'BMS', 'Bat-misc', 'Nickel Strip', 'Wire', 'Connector', 'Holder', 'Epoxy Sheet', 'Sleeve', 'Tape', 'Screw', 'Cabinet', 'Other'];
const GRID_COLUMNS = ['serial', 'voltage', 'resistance', 'capacity'] as const;

interface SerialGridRow {
    serial: string;
    voltage: string;
    resistance: string;
    capacity: string;
    grade: string;
    location: string;
}

const ReceivedGoods: React.FC<ReceivedGoodsProps> = ({
    receivedGoods, setReceivedGoods, recipes, setRecipes, addLogEntry,
    wipItems, setWipItems, finishedGoods, setFinishedGoods, companyProfiles,
    testResults, setTestResults, currentUser, setView, setInvoiceDraft
}) => {
    const isDirectorAdmin = currentUser?.role === 'admin';
    const isAdmin = isDirectorAdmin;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGood, setEditingGood] = useState<ReceivedGood | null>(null);
    const [inwardBatchMasterTarget, setInwardBatchMasterTarget] = useState<MasterGroupedGood | null>(null);
    const [formData, setFormData] = useState(initialFormState);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('');
    const [filterNotes, setFilterNotes] = useState(false);
    const [filterLowStock, setFilterLowStock] = useState(false);
    const [filterIgnored, setFilterIgnored] = useState(false);
    const [expandedMasterKeys, setExpandedMasterKeys] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Dynamic Custom Categories for Raw Materials
    const [customRawCategories, setCustomRawCategories] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('dc_custom_raw_material_categories') || '[]');
        } catch {
            return [];
        }
    });
    const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
    const [newCategoryInput, setNewCategoryInput] = useState('');
    const [showInlineAddCategory, setShowInlineAddCategory] = useState(false);
    const [inlineCategoryName, setInlineCategoryName] = useState('');

    // Combined all raw categories (Base + Custom + Existing in DB)
    const allRawCategories = useMemo(() => {
        const set = new Set<string>(DEFAULT_RAW_CATEGORIES);
        customRawCategories.forEach(c => {
            if (c && c.trim()) set.add(c.trim());
        });
        receivedGoods.forEach(g => {
            if (g.category && g.category.trim()) set.add(g.category.trim());
        });
        return Array.from(set);
    }, [customRawCategories, receivedGoods]);

    const handleAddCustomRawCategory = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        if (!allRawCategories.includes(trimmed)) {
            const updated = [...customRawCategories, trimmed];
            setCustomRawCategories(updated);
            try {
                localStorage.setItem('dc_custom_raw_material_categories', JSON.stringify(updated));
            } catch (e) {
                console.warn('Failed to persist custom raw categories', e);
            }
            addLogEntry('Created Raw Category', `Created new raw material category '${trimmed}'`);
        }
        setFormData(prev => ({ ...prev, category: trimmed }));
        setSelectedCategory(trimmed);
        setIsAddCategoryModalOpen(false);
        setNewCategoryInput('');
        setShowInlineAddCategory(false);
        setInlineCategoryName('');
    };

    const [serialEntries, setSerialEntries] = useState<SerialGridRow[]>([]);
    const [prefix, setPrefix] = useState('');
    const [startNumber, setStartNumber] = useState(1);
    const [openNoteId, setOpenNoteId] = useState<string | null>(null);

    // Iframe modal for adding company
    const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'COMPANY_ADDED') {
                const newCompany = event.data.company;
                setFormData(prev => ({ ...prev, supplier: newCompany.name }));
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

    const handleSupplierChange = (value: string) => {
        if (value === 'ADD_NEW') {
            setIsAddCompanyModalOpen(true);
        } else {
            setFormData({ ...formData, supplier: value });
        }
    };

    // Helper to determine if category requires serial tracking (Only Cells with 'qty' UOM)
    const isTrackedCategory = (cat: string, uom?: string) => (cat || '').toLowerCase() === 'cell' && (!uom || uom === 'qty');

    // Populate form when editing an existing batch or adding an inward batch to an existing master item
    useEffect(() => {
        if (editingGood) {
            let localInitialMap: Record<string, number> = {};
            try {
                localInitialMap = JSON.parse(localStorage.getItem('dc_initial_quantity_map') || '{}');
            } catch (e) {}

            const fixedInitialQty = editingGood.initialQuantity ?? localInitialMap[editingGood.id] ?? editingGood.quantity;
            const dateStr = new Date(editingGood.timestamp).toISOString().split('T')[0];

            let manualCost = editingGood.unitCost ?? 0;
            if (!manualCost || manualCost === 0) {
                if (typeof editingGood.serialIndexMap?.__unitCost === 'number' && editingGood.serialIndexMap.__unitCost > 0) {
                    manualCost = editingGood.serialIndexMap.__unitCost;
                } else {
                    try {
                        const costMap = JSON.parse(localStorage.getItem('dc_raw_material_manual_unit_costs_map') || '{}');
                        manualCost = costMap[editingGood.id] || costMap['name:' + editingGood.name.trim().toLowerCase()] || 0;
                    } catch (e) {}
                }
            }

            setFormData({
                name: editingGood.name,
                category: editingGood.category,
                makeModel: editingGood.makeModel,
                supplier: editingGood.supplier,
                quantity: editingGood.quantity,
                initialQuantity: fixedInitialQty,
                uom: editingGood.uom || 'qty',
                unitCost: manualCost,
                lowStockThresholdPercent: editingGood.lowStockThresholdPercent ?? 20,
                isIgnoredForAlerts: Boolean(editingGood.isIgnoredForAlerts),
                status: editingGood.status as ReceivedGoodStatus,
                damagedCount: editingGood.damagedCount,
                invoiceNumber: editingGood.invoiceNumber,
                notes: editingGood.notes ?? 'actual physical qty = ',
                serials: editingGood.serials,
                invoiceDate: dateStr
            });

            // Merge Serials with Test Results
            if (isTrackedCategory(editingGood.category, editingGood.uom)) {
                const entries: SerialGridRow[] = editingGood.serials.map(s => {
                    const tr = testResults.find(r => r.receivedGoodId === editingGood.id && r.serialNumber === s);
                    return {
                        serial: s,
                        voltage: tr?.voltage !== undefined && tr?.voltage !== null ? String(tr.voltage) : '',
                        resistance: tr?.resistance !== undefined && tr?.resistance !== null ? String(tr.resistance) : '',
                        capacity: tr?.capacity !== undefined && tr?.capacity !== null ? String(tr.capacity) : '',
                        grade: tr?.grade || '',
                        location: tr?.location || ''
                    };
                });

                if (entries.length < editingGood.quantity) {
                    const diff = editingGood.quantity - entries.length;
                    for (let i = 0; i < diff; i++) entries.push({ serial: '', voltage: '', resistance: '', capacity: '', grade: '', location: '' });
                }
                setSerialEntries(entries);
            } else {
                setSerialEntries([]);
            }
        } else if (inwardBatchMasterTarget) {
            // Pre-fill master item details for adding a new inward batch to this item
            setFormData({
                ...initialFormState,
                name: inwardBatchMasterTarget.name,
                category: inwardBatchMasterTarget.category,
                uom: inwardBatchMasterTarget.uom || 'qty',
                unitCost: inwardBatchMasterTarget.unitCost ?? 0,
                lowStockThresholdPercent: inwardBatchMasterTarget.lowStockThresholdPercent ?? 20,
                supplier: inwardBatchMasterTarget.suppliers[0] || '',
                makeModel: inwardBatchMasterTarget.makeModels[0] || '',
                invoiceDate: new Date().toISOString().split('T')[0]
            });
            setSerialEntries([]);
        } else {
            setFormData(initialFormState);
            setSerialEntries([]);
        }
    }, [editingGood, inwardBatchMasterTarget]);

    // Adjust serial entries when quantity changes (Only for Cell with 'qty' UOM)
    useEffect(() => {
        if (!isTrackedCategory(formData.category, formData.uom)) return;

        const qty = Number(formData.quantity) || 0;
        setSerialEntries(prev => {
            if (prev.length === qty) return prev;
            if (prev.length > qty) {
                return prev.slice(0, qty);
            } else {
                const diff = qty - prev.length;
                return [...prev, ...Array(diff).fill(null).map(() => ({ serial: '', voltage: '', resistance: '', capacity: '', grade: '', location: '' }))];
            }
        });
    }, [formData.quantity, formData.category, formData.uom]);

    // Handle LocalStorage Invoice Import
    useEffect(() => {
        const checkImport = () => {
            const pendingImport = localStorage.getItem('pendingInventoryImport');
            if (pendingImport) {
                try {
                    const items = JSON.parse(pendingImport);
                    if (Array.isArray(items) && items.length > 0) {
                        setTimeout(() => {
                            // Filter items to detect if an inward batch with this invoice number already exists for this item
                            const duplicateItems: any[] = [];
                            const uniqueItems: any[] = [];

                            items.forEach((item: any) => {
                                const normName = (item.name || '').trim().toLowerCase();
                                const normInv = (item.invoiceNumber || '').trim().toLowerCase();
                                const isDup = normInv && receivedGoods.some(g => 
                                    (g.name || '').trim().toLowerCase() === normName &&
                                    (g.invoiceNumber || '').trim().toLowerCase() === normInv
                                );
                                if (isDup) duplicateItems.push(item);
                                else uniqueItems.push(item);
                            });

                            if (uniqueItems.length === 0 && duplicateItems.length > 0) {
                                alert(`⚠️ Duplicate Inward Prevented:\n\nAll ${duplicateItems.length} item(s) from invoice #${items[0]?.invoiceNumber || ''} have already been inwarded in Raw Materials.\n\nImport was automatically skipped to prevent double-counting inventory.`);
                                localStorage.removeItem('pendingInventoryImport');
                                return;
                            }

                            let confirmPrompt = `Found ${items.length} items imported from Invoice Module. Add to storage?`;
                            if (duplicateItems.length > 0) {
                                confirmPrompt = `Found ${items.length} items from Invoice Module.\n\n⚠️ ${duplicateItems.length} item(s) already exist with the same invoice number for this item in Raw Materials and will be skipped to prevent duplicates.\n\nAdd the remaining ${uniqueItems.length} unique items to storage?`;
                            }

                            const confirmed = window.confirm(confirmPrompt);
                            if (confirmed && uniqueItems.length > 0) {
                                const newGoods: ReceivedGood[] = uniqueItems.map((item: any, index: number) => {
                                    let statusEnum = ReceivedGoodStatus.ND;
                                    if (item.status === 'Damaged') statusEnum = ReceivedGoodStatus.D;
                                    else if (item.status === 'Partially Received') statusEnum = ReceivedGoodStatus.PR;

                                    return {
                                        id: `rec-imp-${Date.now()}-${index}`,
                                        timestamp: Date.now(),
                                        name: item.name || 'Unknown Item',
                                        category: item.category || 'Uncategorized',
                                        makeModel: item.makeModel || '',
                                        supplier: item.supplier || 'Unknown',
                                        invoiceNumber: item.invoiceNumber || '',
                                        quantity: Number(item.quantity) || 0,
                                        status: statusEnum,
                                        damagedCount: 0,
                                        serials: []
                                    };
                                });
                                setReceivedGoods(prev => [...newGoods, ...prev]);
                                addLogEntry('Imported Storage Items', `Imported ${newGoods.length} items from invoice scan.${duplicateItems.length > 0 ? ` (Skipped ${duplicateItems.length} duplicate invoice entries)` : ''}`);
                            }
                            localStorage.removeItem('pendingInventoryImport');
                        }, 100);
                    } else {
                        localStorage.removeItem('pendingInventoryImport');
                    }
                } catch (e) {
                    console.error("Failed to parse import data", e);
                    localStorage.removeItem('pendingInventoryImport');
                }
            }
        };
        checkImport();
    }, [receivedGoods]);

    // Group Raw Materials into Master Item Cards
    const masterGroupedGoods: MasterGroupedGood[] = useMemo(() => {
        const map = new Map<string, MasterGroupedGood>();
        let localCostMap: Record<string, number> = {};
        try {
            localCostMap = JSON.parse(localStorage.getItem('dc_raw_material_manual_unit_costs_map') || '{}');
        } catch (e) {}

        receivedGoods.forEach(good => {
            const rawName = (good.name || '').trim();
            if (!rawName) return;
            const key = rawName.toLowerCase();

            const existing = map.get(key);
            if (!existing) {
                const qty = Number(good.quantity) || 0;
                const initQty = Number(good.initialQuantity || good.quantity) || 0;
                const threshold = good.lowStockThresholdPercent ?? 20;
                const isOutOfStock = qty <= 0;
                const isLowStock = !good.isIgnoredForAlerts && (qty <= (initQty * (threshold / 100)));
                const uCost = (typeof good.unitCost === 'number' && good.unitCost > 0)
                    ? good.unitCost
                    : (localCostMap[good.id] ?? localCostMap['name:' + key] ?? 0);

                map.set(key, {
                    masterKey: key,
                    name: rawName,
                    category: good.category || 'Other',
                    totalQuantity: qty,
                    totalInitialQuantity: initQty,
                    uom: good.uom || 'qty',
                    unitCost: uCost,
                    lowStockThresholdPercent: threshold,
                    isIgnoredForAlerts: Boolean(good.isIgnoredForAlerts),
                    status: good.status,
                    suppliers: good.supplier ? [good.supplier] : [],
                    makeModels: good.makeModel ? [good.makeModel] : [],
                    batches: [good],
                    latestTimestamp: good.timestamp,
                    earliestTimestamp: good.timestamp,
                    totalSerials: (good.serials || []).length,
                    notes: good.notes,
                    isOutOfStock,
                    isLowStock
                });
            } else {
                existing.totalQuantity += Number(good.quantity) || 0;
                existing.totalInitialQuantity += Number(good.initialQuantity || good.quantity) || 0;
                if (good.supplier && !existing.suppliers.includes(good.supplier)) {
                    existing.suppliers.push(good.supplier);
                }
                if (good.makeModel && !existing.makeModels.includes(good.makeModel)) {
                    existing.makeModels.push(good.makeModel);
                }
                if (typeof good.unitCost === 'number' && good.unitCost > 0 && (!existing.unitCost || existing.unitCost === 0)) {
                    existing.unitCost = good.unitCost;
                }
                existing.batches.push(good);
                existing.latestTimestamp = Math.max(existing.latestTimestamp, good.timestamp);
                existing.earliestTimestamp = Math.min(existing.earliestTimestamp, good.timestamp);
                existing.totalSerials += (good.serials || []).length;
                if (good.notes && (!existing.notes || existing.notes === 'actual physical qty = ')) {
                    existing.notes = good.notes;
                }
            }
        });

        // Recalculate status & sort batches newest first
        map.forEach(group => {
            group.batches.sort((a, b) => b.timestamp - a.timestamp);
            group.isOutOfStock = group.totalQuantity <= 0;
            group.isLowStock = !group.isIgnoredForAlerts && (group.totalQuantity <= (group.totalInitialQuantity * (group.lowStockThresholdPercent / 100)));
            
            // Pick unit cost from newest batch with cost > 0 or local cost map fallback
            const batchWithCost = group.batches.find(b => typeof b.unitCost === 'number' && b.unitCost > 0);
            if (batchWithCost && typeof batchWithCost.unitCost === 'number') {
                group.unitCost = batchWithCost.unitCost;
            } else if (!group.unitCost || group.unitCost === 0) {
                group.unitCost = localCostMap['name:' + group.masterKey] || 0;
            }
        });

        return Array.from(map.values()).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
    }, [receivedGoods]);

    // Filter master grouped goods
    const filteredMasterGoods = useMemo(() => {
        return masterGroupedGoods.filter(group => {
            const matchesCategory = selectedCategory === 'All' || group.category === selectedCategory;
            const term = searchTerm.toLowerCase().trim();
            const matchesSearch = !term ||
                group.name.toLowerCase().includes(term) ||
                group.category.toLowerCase().includes(term) ||
                group.suppliers.some(s => s.toLowerCase().includes(term)) ||
                group.makeModels.some(m => m.toLowerCase().includes(term)) ||
                group.batches.some(b => (b.invoiceNumber || '').toLowerCase().includes(term) || (b.serials || []).some(s => s.toLowerCase().includes(term)));

            const matchesNotes = !filterNotes || (group.notes && group.notes !== 'actual physical qty = ');
            const matchesLowStock = !filterLowStock || group.isLowStock || group.isOutOfStock;
            const matchesIgnored = !filterIgnored || group.isIgnoredForAlerts;
            const matchesSupplier = !selectedSupplierFilter ||
                group.suppliers.some(s => s.toLowerCase().trim() === selectedSupplierFilter.toLowerCase().trim());

            return matchesCategory && matchesSearch && matchesSupplier && matchesNotes && matchesLowStock && matchesIgnored;
        });
    }, [masterGroupedGoods, selectedCategory, searchTerm, selectedSupplierFilter, filterNotes, filterLowStock, filterIgnored]);

    // Target Item Name for the current modal session (normalized)
    const modalTargetItemName = useMemo(() => {
        return (formData.name || inwardBatchMasterTarget?.name || editingGood?.name || '').trim();
    }, [formData.name, inwardBatchMasterTarget, editingGood]);

    // Active Master Group matching the modal's item (if any exists in inventory)
    const activeMasterGroupForModal = useMemo(() => {
        if (!modalTargetItemName) return null;
        return masterGroupedGoods.find(g => g.name.trim().toLowerCase() === modalTargetItemName.toLowerCase()) || null;
    }, [masterGroupedGoods, modalTargetItemName]);

    // All previous batches on record for this specific item (excluding the batch currently being edited)
    const previousBatchesForModalItem = useMemo(() => {
        if (!modalTargetItemName) return [];
        const normName = modalTargetItemName.toLowerCase();
        return receivedGoods.filter(g => 
            (g.name || '').trim().toLowerCase() === normName &&
            (!editingGood || g.id !== editingGood.id)
        );
    }, [receivedGoods, modalTargetItemName, editingGood]);

    // Distinct past invoices for this item with latest batch metadata
    const previousInvoicesForModalItem = useMemo(() => {
        const invMap = new Map<string, ReceivedGood>();
        previousBatchesForModalItem.forEach(batch => {
            const inv = (batch.invoiceNumber || '').trim();
            if (inv && !invMap.has(inv.toLowerCase())) {
                invMap.set(inv.toLowerCase(), batch);
            }
        });
        return Array.from(invMap.values());
    }, [previousBatchesForModalItem]);

    // Detect if entered invoice number matches a previous batch for this item
    const duplicateInvoiceBatch = useMemo(() => {
        const currentInv = (formData.invoiceNumber || '').trim().toLowerCase();
        if (!currentInv || !modalTargetItemName) return null;
        return previousBatchesForModalItem.find(b => 
            (b.invoiceNumber || '').trim().toLowerCase() === currentInv
        ) || null;
    }, [formData.invoiceNumber, modalTargetItemName, previousBatchesForModalItem]);

    // Helper to switch modal from editing an existing batch to adding a new inward batch
    const handleSwitchToNewInwardBatch = () => {
        if (!activeMasterGroupForModal) return;
        handleAddBatchToMaster(activeMasterGroupForModal);
    };

    const toggleExpandMaster = (masterKey: string) => {
        setExpandedMasterKeys(prev => {
            const next = new Set(prev);
            if (next.has(masterKey)) next.delete(masterKey);
            else next.add(masterKey);
            return next;
        });
    };

    const handleCreateNewMaster = () => {
        setEditingGood(null);
        setInwardBatchMasterTarget(null);
        setFormData(initialFormState);
        setSerialEntries([]);
        setIsModalOpen(true);
    };

    const handleAddBatchToMaster = (masterGroup: MasterGroupedGood) => {
        setEditingGood(null);
        setInwardBatchMasterTarget(masterGroup);
        setIsModalOpen(true);
    };

    const handleEditMaster = (masterGroup: MasterGroupedGood) => {
        if (masterGroup.batches.length === 0) return;
        const primaryBatch = masterGroup.batches[0];
        setEditingGood(primaryBatch);
        setInwardBatchMasterTarget(null);
        setIsModalOpen(true);
    };

    const handleEditBatch = (batch: ReceivedGood) => {
        setEditingGood(batch);
        setInwardBatchMasterTarget(null);
        setIsModalOpen(true);
    };

    const handleUpdateMasterUnitCost = (master: MasterGroupedGood, newCost: number) => {
        if (!isDirectorAdmin) {
            alert('Access Denied: Only Director Admins can update raw material unit purchase costs.');
            return;
        }
        const cost = Math.max(0, Number(newCost) || 0);

        // 1. Update localStorage cache map for instant access & offline persistence
        try {
            const costMap = JSON.parse(localStorage.getItem('dc_raw_material_manual_unit_costs_map') || '{}');
            costMap['name:' + master.masterKey] = cost;
            master.batches.forEach(b => {
                if (b.id) costMap[b.id] = cost;
            });
            localStorage.setItem('dc_raw_material_manual_unit_costs_map', JSON.stringify(costMap));
        } catch (e) {}

        // 2. Update state & serialIndexMap metadata for persistence to Supabase
        const targetIds = new Set(master.batches.map(b => b.id));
        setReceivedGoods(prev => prev.map(item => {
            if (targetIds.has(item.id) || (item.name && item.name.trim().toLowerCase() === master.masterKey)) {
                return {
                    ...item,
                    unitCost: cost,
                    serialIndexMap: {
                        ...(item.serialIndexMap || {}),
                        __unitCost: cost
                    }
                };
            }
            return item;
        }));

        addLogEntry('Updated Raw Material Cost', `[Director Admin] Updated unit purchase cost for "${master.name}" to ₹${cost.toFixed(2)} / ${master.uom}`);
    };

    const handleDeleteMaster = (master: MasterGroupedGood) => {
        const batchCount = master.batches.length;
        const totalQty = master.totalQuantity;
        const uom = master.uom;

        const confirmMsg = batchCount > 1
            ? `Are you sure you want to delete "${master.name}"?\n\n⚠️ This will delete ALL ${batchCount} inward shipment batches (${totalQty} ${uom}) and their associated cell test records.\n\nThis action cannot be undone.`
            : `Are you sure you want to delete raw material "${master.name}" (${totalQty} ${uom})?`;

        if (window.confirm(confirmMsg)) {
            const batchIds = new Set(master.batches.map(b => b.id));
            setReceivedGoods(prev => prev.filter(g => !batchIds.has(g.id)));
            setTestResults(prev => prev.filter(r => !batchIds.has(r.receivedGoodId)));
            addLogEntry('Deleted Raw Material Item', `Deleted master item "${master.name}" with ${batchCount} batch(es) (${totalQty} ${uom}).`);
        }
    };

    const handleDeleteBatchDirect = (batch: ReceivedGood) => {
        const confirmMsg = `Delete inward batch for "${batch.name}" (Invoice: ${batch.invoiceNumber || 'Manual Entry'}, Qty: ${batch.quantity})?`;
        if (window.confirm(confirmMsg)) {
            setReceivedGoods(prev => prev.filter(g => g.id !== batch.id));
            setTestResults(prev => prev.filter(r => r.receivedGoodId !== batch.id));
            addLogEntry('Deleted Raw Material Batch', `Deleted inward batch for "${batch.name}" (${batch.quantity} units, Invoice: ${batch.invoiceNumber || 'N/A'}).`);
        }
    };

    const handleToggleIgnoreReplenish = (masterKey: string, currentStatus: boolean) => {
        const updatedStatus = !currentStatus;
        const matchingBatches = receivedGoods.filter(g => g.name.trim().toLowerCase() === masterKey);

        try {
            const currentMap = JSON.parse(localStorage.getItem('dc_ignored_stock_alerts_map') || '{}');
            matchingBatches.forEach(b => {
                currentMap[b.id] = updatedStatus;
            });
            localStorage.setItem('dc_ignored_stock_alerts_map', JSON.stringify(currentMap));
        } catch (e) {
            console.warn('Failed to save ignored stock map', e);
        }

        const idsToUpdate = new Set(matchingBatches.map(b => b.id));
        setReceivedGoods(prev => prev.map(g => idsToUpdate.has(g.id) ? { ...g, isIgnoredForAlerts: updatedStatus } : g));
        addLogEntry('Updated Replenish Policy', `Master Item [${masterKey}]: ${updatedStatus ? 'Ignored' : 'Active Replenishment'}`);
    };

    const handleAutoGenerate = () => {
        const count = Number(formData.quantity) || 0;
        setSerialEntries(prev => {
            const newEntries = [...prev];
            if (newEntries.length < count) {
                const diff = count - newEntries.length;
                for (let k = 0; k < diff; k++) newEntries.push({ serial: '', voltage: '', resistance: '', capacity: '', grade: '', location: '' });
            }

            for (let i = 0; i < count; i++) {
                if (newEntries[i]) {
                    newEntries[i] = {
                        ...newEntries[i],
                        serial: `${prefix}${Number(startNumber) + i}`
                    };
                }
            }
            return newEntries;
        });
    };

    const handleGridPaste = (e: React.ClipboardEvent, startRowIndex: number, startColKey: typeof GRID_COLUMNS[number]) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        const rows = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (rows.length === 0) return;

        let currentEntries = [...serialEntries];
        if (startRowIndex + rows.length > currentEntries.length) {
            const needed = startRowIndex + rows.length - currentEntries.length;
            for (let k = 0; k < needed; k++) currentEntries.push({ serial: '', voltage: '', resistance: '', capacity: '', grade: '', location: '' });
            setFormData(prev => ({ ...prev, quantity: currentEntries.length }));
        }

        const startColIdx = GRID_COLUMNS.indexOf(startColKey);

        rows.forEach((line, i) => {
            const rowIndex = startRowIndex + i;
            const cells = line.split('\t');

            cells.forEach((cellValue, j) => {
                const colIdx = startColIdx + j;
                if (colIdx < GRID_COLUMNS.length) {
                    const colKey = GRID_COLUMNS[colIdx];
                    if (currentEntries[rowIndex]) {
                        currentEntries[rowIndex] = {
                            ...currentEntries[rowIndex],
                            [colKey]: cellValue.trim()
                        };
                    }
                }
            });
        });

        setSerialEntries(currentEntries);
    };

    const handleEntryChange = (index: number, field: keyof SerialGridRow, value: string) => {
        const newEntries = [...serialEntries];
        newEntries[index] = { ...newEntries[index], [field]: value };
        setSerialEntries(newEntries);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validation: Prevent duplicate invoice entry for the same item
        const trimmedInvoice = (formData.invoiceNumber || '').trim();
        const normItemName = (formData.name || inwardBatchMasterTarget?.name || editingGood?.name || '').trim().toLowerCase();

        if (trimmedInvoice && normItemName) {
            const existingBatch = receivedGoods.find(g => 
                (g.name || '').trim().toLowerCase() === normItemName &&
                (g.invoiceNumber || '').trim().toLowerCase() === trimmedInvoice.toLowerCase() &&
                (!editingGood || g.id !== editingGood.id)
            );

            if (existingBatch) {
                alert(`⚠️ Duplicate Inward Batch Prevented:\n\nAn inward batch with invoice #${trimmedInvoice} already exists for "${formData.name || inwardBatchMasterTarget?.name || editingGood?.name}".\n\nExisting Batch Details:\n• Received Date: ${new Date(existingBatch.timestamp).toLocaleDateString()}\n• Quantity: ${existingBatch.quantity} ${existingBatch.uom || 'qty'}\n• Supplier: ${existingBatch.supplier || 'N/A'}\n\nPlease verify the invoice number or update the existing batch.`);
                return;
            }
        }

        const goodId = editingGood ? editingGood.id : `rec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const isCell = isTrackedCategory(formData.category, formData.uom);

        const validSerials = isCell
            ? serialEntries.map(e => e.serial.trim()).filter(s => s !== '')
            : [];

        let serialIndexMap: Record<string, number> = {};
        if (isCell && validSerials.length > 0) {
            const existingMap = editingGood?.serialIndexMap || {};
            const existingValues = Object.values(existingMap) as number[];
            const maxExisting = existingValues.length > 0 ? Math.max(...existingValues) : 0;
            let nextIdx = maxExisting;

            validSerials.forEach(serial => {
                if (existingMap[serial] !== undefined) {
                    serialIndexMap[serial] = existingMap[serial];
                } else {
                    nextIdx++;
                    serialIndexMap[serial] = nextIdx;
                }
            });
        }

        let localInitialMap: Record<string, number> = {};
        try {
            localInitialMap = JSON.parse(localStorage.getItem('dc_initial_quantity_map') || '{}');
        } catch (e) {}

        let initialQty = editingGood 
            ? (formData.initialQuantity && formData.initialQuantity > 0 ? formData.initialQuantity : (editingGood.initialQuantity || localInitialMap[goodId] || editingGood.quantity || formData.quantity || 1))
            : (formData.initialQuantity && formData.initialQuantity > 0 ? formData.initialQuantity : (formData.quantity || 1));

        if (initialQty < formData.quantity) {
            initialQty = formData.quantity;
        }

        localInitialMap[goodId] = initialQty;
        try {
            localStorage.setItem('dc_initial_quantity_map', JSON.stringify(localInitialMap));
        } catch (e) {}

        // Date timestamp from invoiceDate or fallback to now
        const batchTimestamp = formData.invoiceDate
            ? new Date(formData.invoiceDate).getTime() || Date.now()
            : (editingGood ? editingGood.timestamp : Date.now());

        // Prepare Received Good (cleanly omitting invoiceDate from the persistent object)
        const { invoiceDate, ...cleanFormData } = formData;
        const finalUnitCost = isDirectorAdmin 
            ? (Number(formData.unitCost) || 0) 
            : (editingGood?.unitCost || 0);

        // Persist unit cost to local map for immediate caching (only if Director Admin)
        if (isDirectorAdmin) {
            try {
                const costMap = JSON.parse(localStorage.getItem('dc_raw_material_manual_unit_costs_map') || '{}');
                costMap[goodId] = finalUnitCost;
                if (formData.name) {
                    costMap['name:' + formData.name.trim().toLowerCase()] = finalUnitCost;
                }
                localStorage.setItem('dc_raw_material_manual_unit_costs_map', JSON.stringify(costMap));
            } catch (e) {}
        }

        const newGood: ReceivedGood = {
            ...cleanFormData,
            id: goodId,
            initialQuantity: initialQty,
            unitCost: finalUnitCost,
            lowStockThresholdPercent: formData.lowStockThresholdPercent ?? 20,
            isIgnoredForAlerts: Boolean(formData.isIgnoredForAlerts),
            timestamp: batchTimestamp,
            serials: validSerials,
            serialIndexMap: {
                ...(isCell && serialIndexMap ? serialIndexMap : {}),
                __unitCost: finalUnitCost
            }
        };

        // Prepare Test Results (Only for Cells)
        const newTestResults: TestResult[] = [];
        if (isCell) {
            serialEntries.forEach(entry => {
                if (!entry.serial) return;

                if (entry.voltage || entry.resistance || entry.capacity || entry.grade || entry.location) {
                    const safeSerial = entry.serial.replace(/[^a-zA-Z0-9]/g, '_');

                    newTestResults.push({
                        id: `test-${goodId}-${safeSerial}`,
                        receivedGoodId: goodId,
                        serialNumber: entry.serial,
                        category: 'Cell',
                        voltage: entry.voltage !== undefined && entry.voltage !== '' && !isNaN(parseFloat(entry.voltage)) ? parseFloat(entry.voltage) : undefined,
                        resistance: entry.resistance !== undefined && entry.resistance !== '' && !isNaN(parseFloat(entry.resistance)) ? parseFloat(entry.resistance) : undefined,
                        capacity: entry.capacity !== undefined && entry.capacity !== '' && !isNaN(parseFloat(entry.capacity)) ? parseFloat(entry.capacity) : undefined,
                        grade: entry.grade || undefined,
                        location: entry.location || undefined,
                        timestamp: Date.now(),
                        testedBy: currentUser?.username || 'System'
                    });
                }
            });
        }

        if (editingGood) {
            const removedSerials = isCell ? editingGood.serials.filter(s => !validSerials.includes(s)) : [];
            if (removedSerials.length > 0) {
                const orphanedResults = testResults.filter(r => r.receivedGoodId === goodId && removedSerials.includes(r.serialNumber));
                if (orphanedResults.length > 0) {
                    const confirmRemove = window.confirm(
                        `⚠️ You removed ${removedSerials.length} serial(s) from this batch.\n\n` +
                        `${orphanedResults.length} test result(s) with grading data exist for these serials.\n` +
                        `Click OK to proceed and delete orphaned test data, or Cancel to abort save.`
                    );
                    if (!confirmRemove) return;
                }
            }

            const oldNameTrimmed = editingGood.name.trim().toLowerCase();
            const isMasterPropChanged = 
                (editingGood.name.trim() !== newGood.name.trim()) || 
                (editingGood.category !== newGood.category) ||
                (editingGood.uom !== newGood.uom) ||
                (editingGood.unitCost !== newGood.unitCost) ||
                (editingGood.lowStockThresholdPercent !== newGood.lowStockThresholdPercent) ||
                (Boolean(editingGood.isIgnoredForAlerts) !== Boolean(newGood.isIgnoredForAlerts));

            setReceivedGoods(prev => prev.map(g => {
                if (g.id === goodId) return newGood;
                if (isMasterPropChanged && g.name.trim().toLowerCase() === oldNameTrimmed) {
                    return {
                        ...g,
                        name: newGood.name,
                        category: newGood.category,
                        uom: newGood.uom,
                        unitCost: newGood.unitCost,
                        serialIndexMap: {
                            ...(g.serialIndexMap || {}),
                            __unitCost: newGood.unitCost
                        },
                        lowStockThresholdPercent: newGood.lowStockThresholdPercent,
                        isIgnoredForAlerts: newGood.isIgnoredForAlerts
                    };
                }
                return g;
            }));

            setTestResults(prev => {
                let updated = removedSerials.length > 0
                    ? prev.filter(r => !(r.receivedGoodId === goodId && removedSerials.includes(r.serialNumber)))
                    : [...prev];

                newTestResults.forEach(newResult => {
                    const existingIndex = updated.findIndex(r => r.receivedGoodId === goodId && r.serialNumber === newResult.serialNumber);
                    if (existingIndex >= 0) {
                        updated[existingIndex] = {
                            ...updated[existingIndex],
                            ...newResult,
                            voltage: newResult.voltage ?? updated[existingIndex].voltage,
                            resistance: newResult.resistance ?? updated[existingIndex].resistance,
                            capacity: newResult.capacity ?? updated[existingIndex].capacity,
                            grade: newResult.grade ?? updated[existingIndex].grade,
                            location: newResult.location ?? updated[existingIndex].location,
                        };
                    } else {
                        updated.push(newResult);
                    }
                });
                return updated;
            });

            addLogEntry('Updated Raw Material Batch', `Updated batch for ${newGood.name} (Invoice: ${newGood.invoiceNumber || 'N/A'})`);
        } else {
            setReceivedGoods(prev => [newGood, ...prev]);
            setTestResults(prev => [...prev, ...newTestResults]);
            addLogEntry('Added Raw Material Batch', `Added batch of ${newGood.quantity} units for ${newGood.name} (Invoice: ${newGood.invoiceNumber || 'N/A'})`);
        }
        setIsModalOpen(false);
    };

    const handleDelete = () => {
        if (editingGood) {
            const affectedResults = testResults.filter(r => r.receivedGoodId === editingGood.id);
            const testedCount = affectedResults.filter(r => r.voltage || r.resistance || r.capacity || r.grade).length;

            const message = testedCount > 0
                ? `Delete batch "${editingGood.name}" (Invoice: ${editingGood.invoiceNumber || 'N/A'})?\n\n⚠️ This will remove ${affectedResults.length} test result(s) for this batch.\n\nThis action cannot be undone.`
                : `Delete batch "${editingGood.name}"?`;

            if (confirm(message)) {
                setReceivedGoods(prev => prev.filter(g => g.id !== editingGood.id));
                setTestResults(prev => prev.filter(r => r.receivedGoodId !== editingGood.id));
                addLogEntry('Deleted Raw Material Batch', `Deleted batch for ${editingGood.name} (${editingGood.quantity} units)`);
                setIsModalOpen(false);
            }
        }
    };

    // CSV Export
    const handleExportCsv = () => {
        const headers = ['Name', 'Category', 'Make/Model', 'Supplier', 'Invoice #', 'Quantity', 'UOM', 'Status', 'Date', 'Serial Number', '#', 'Voltage', 'Resistance (mΩ)', 'Capacity (Ah)', 'Grade', 'Location', 'Notes'];
        const rows: string[][] = [];

        receivedGoods.forEach(good => {
            const isTracked = isTrackedCategory(good.category);
            const uomStr = good.uom || 'qty';
            if (isTracked && good.serials.length > 0) {
                good.serials.forEach((serial, idx) => {
                    const tr = testResults.find(r => r.receivedGoodId === good.id && r.serialNumber === serial);
                    const persistentIdx = good.serialIndexMap?.[serial] ?? (idx + 1);
                    rows.push([
                        `"${good.name}"`,
                        `"${good.category}"`,
                        `"${good.makeModel || ''}"`,
                        `"${good.supplier || ''}"`,
                        `"${good.invoiceNumber || ''}"`,
                        String(good.quantity),
                        `"${uomStr}"`,
                        `"${good.status}"`,
                        new Date(good.timestamp).toLocaleDateString(),
                        `"${serial}"`,
                        String(persistentIdx),
                        tr?.voltage?.toString() ?? '',
                        tr?.resistance?.toString() ?? '',
                        tr?.capacity?.toString() ?? '',
                        `"${tr?.grade || ''}"`,
                        `"${tr?.location || ''}"`
                    ].concat(idx === 0 ? [`"${good.notes || ''}"`] : ['']));
                });
            } else {
                rows.push([
                    `"${good.name}"`,
                    `"${good.category}"`,
                    `"${good.makeModel || ''}"`,
                    `"${good.supplier || ''}"`,
                    `"${good.invoiceNumber || ''}"`,
                    String(good.quantity),
                    `"${uomStr}"`,
                    `"${good.status}"`,
                    new Date(good.timestamp).toLocaleDateString(),
                    '', '', '', '', '', '', '', ''
                ]);
            }
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `raw_materials_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadInventoryCSVTemplate = () => {
        const csvContent = [
            'Item Name,Category,Make/Model,Supplier,Quantity,UOM,Damaged Count,Invoice Number,Serials,Low Stock Threshold %,Notes',
            'LFP 3.2V 100Ah Cell,Cell,EVE LF100,Sunergy Tech,100,qty,0,INV-9901,"SN1001, SN1002, SN1003",20,Batch A grade cells',
            'Smart BMS 24S 200A,BMS,JK-B2A24S20P,JK Power,50,qty,0,INV-9902,"BMS-01, BMS-02",20,Factory verified',
            'Nickel Strip 0.15*8mm,Nickel Strip,Pure Ni 99.9%,Apex Metals,500,grams,0,INV-9903,"",20,Spool roll'
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `raw_materials_template.csv`;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            if (text) {
                const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
                if (lines.length < 2) {
                    alert('CSV file must contain a header row and at least one data row.');
                    return;
                }

                const importedGoods: ReceivedGood[] = [];
                let skippedDuplicatesCount = 0;

                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
                    if (!row[0]) continue;

                    const rowName = row[0].trim().toLowerCase();
                    const rowInv = (row[7] || '').trim().toLowerCase();

                    // Check duplicate invoice against existing receivedGoods or earlier rows in this CSV
                    if (rowInv) {
                        const existsInInventory = receivedGoods.some(g => 
                            (g.name || '').trim().toLowerCase() === rowName &&
                            (g.invoiceNumber || '').trim().toLowerCase() === rowInv
                        );
                        const existsInBatch = importedGoods.some(g =>
                            g.name.trim().toLowerCase() === rowName &&
                            (g.invoiceNumber || '').trim().toLowerCase() === rowInv
                        );
                        if (existsInInventory || existsInBatch) {
                            skippedDuplicatesCount++;
                            continue;
                        }
                    }

                    importedGoods.push({
                        id: `csv-${Date.now()}-${i}`,
                        name: row[0],
                        category: row[1] || 'Other',
                        makeModel: row[2] || '',
                        supplier: row[3] || '',
                        quantity: Number(row[4]) || 0,
                        initialQuantity: Number(row[4]) || 0,
                        uom: row[5] || 'qty',
                        damagedCount: Number(row[6]) || 0,
                        invoiceNumber: row[7] || '',
                        serials: row[8] ? row[8].split(';').map(s => s.trim()).filter(Boolean) : [],
                        lowStockThresholdPercent: Number(row[9]) || 20,
                        notes: row[10] || 'actual physical qty = ',
                        status: ReceivedGoodStatus.ND,
                        timestamp: Date.now()
                    });
                }

                if (importedGoods.length > 0) {
                    setReceivedGoods(prev => [...importedGoods, ...prev]);
                    addLogEntry('CSV Bulk Import', `Imported ${importedGoods.length} raw material items.${skippedDuplicatesCount > 0 ? ` (Skipped ${skippedDuplicatesCount} duplicate invoice entries)` : ''}`);
                    let alertMsg = `Successfully imported ${importedGoods.length} items from CSV!`;
                    if (skippedDuplicatesCount > 0) {
                        alertMsg += `\n\n⚠️ Skipped ${skippedDuplicatesCount} row(s) because inward batches with the same invoice number already exist for those items.`;
                    }
                    alert(alertMsg);
                } else if (skippedDuplicatesCount > 0) {
                    alert(`⚠️ No new items imported.\n\nAll ${skippedDuplicatesCount} row(s) in the CSV were skipped because matching invoice batches already exist for those items in Raw Materials.`);
                }
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    return (
        <div className="space-y-6">
            {/* Top Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <h2 className="text-xl font-bold text-[#0D0D0D] tracking-tight font-brand flex items-center gap-2">
                        <span>📦</span>
                        <span>Raw Materials & Component Stock</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Consolidated Master SKUs with inward batch history, invoice links, and cell tracking.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleCSVFileChange}
                        accept=".csv"
                        className="hidden"
                    />

                    <button
                        onClick={handleCreateNewMaster}
                        className="px-4 py-2 bg-[#8EBF45] text-[#0D0D0D] hover:bg-[#658C3E] hover:text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-1.5"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>Register Master Item</span>
                    </button>

                    <button
                        onClick={handleExportCsv}
                        className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 shadow-2xs"
                        title="Export all inventory stock to CSV"
                    >
                        <Download size={14} />
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={downloadInventoryCSVTemplate}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 shadow-2xs"
                        title="Download sample CSV template with proper headers"
                    >
                        <span>💾 Template CSV</span>
                    </button>

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
                        title="Import inventory stock from CSV file"
                    >
                        <span>📥 Import CSV</span>
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#8EBF45] transition-colors">
                    <SearchIcon className="h-5 w-5" />
                </div>
                <input
                    type="text"
                    placeholder="Search master items by name, model, supplier, invoice #, or serial..."
                    className="block w-full p-4 pl-12 border-2 border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:border-[#8EBF45] focus:ring-4 focus:ring-[#8EBF45]/10 transition-all text-slate-900 bg-white text-sm"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Category Filters Ribbon */}
            <div className="flex flex-wrap gap-2 items-center">
                <button
                    onClick={() => setSelectedCategory('All')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all ${selectedCategory === 'All' ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                    All ({masterGroupedGoods.length})
                </button>
                {allRawCategories.map(cat => {
                    const count = masterGroupedGoods.filter(m => m.category === cat).length;
                    return (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-full border transition-all ${selectedCategory === cat ? 'bg-[#8EBF45] text-[#0D0D0D] border-[#8EBF45] shadow-sm font-black' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                            {cat} {count > 0 ? `(${count})` : ''}
                        </button>
                    );
                })}

                <button
                    onClick={() => setIsAddCategoryModalOpen(true)}
                    className="px-3.5 py-1.5 text-xs font-black uppercase tracking-wider rounded-full border border-dashed border-[#8EBF45] text-[#658C3E] hover:bg-[#8EBF45]/20 bg-white transition-all flex items-center gap-1 shadow-2xs"
                    title="Add a custom raw material category"
                >
                    <span>➕ Add Category</span>
                </button>

                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button
                    onClick={() => setFilterNotes(!filterNotes)}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all flex items-center gap-1.5 ${filterNotes ? 'bg-amber-400 text-amber-900 border-amber-400 shadow-sm font-bold' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                    📝 Has Notes
                </button>
                <button
                    onClick={() => setFilterLowStock(!filterLowStock)}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all flex items-center gap-1.5 ${filterLowStock ? 'bg-amber-500 text-white border-amber-500 shadow-sm font-black' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                    ⚠️ Low Stock Alerts
                </button>
                <button
                    onClick={() => setFilterIgnored(!filterIgnored)}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all flex items-center gap-1.5 ${filterIgnored ? 'bg-slate-800 text-amber-300 border-slate-800 shadow-sm font-black' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                    🔕 Ignored Items
                </button>

                <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block"></div>

                {/* Searchable Supplier Filter */}
                <div className="w-full sm:w-64">
                    <SearchableSupplierDropdown
                        value={selectedSupplierFilter}
                        onChange={(val) => setSelectedSupplierFilter(val)}
                        companyProfiles={companyProfiles}
                        placeholder="Filter by Supplier..."
                        onAddNewCompany={() => setIsAddCompanyModalOpen(true)}
                    />
                </div>
                {selectedSupplierFilter && (
                    <button
                        onClick={() => setSelectedSupplierFilter('')}
                        className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-all border border-slate-200 flex items-center gap-1 shrink-0"
                        title="Clear supplier filter"
                    >
                        <span>✕ Clear Supplier</span>
                    </button>
                )}
            </div>

            {/* Consolidated Master Item Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredMasterGoods.length === 0 ? (
                    <div className="col-span-full bg-white p-12 rounded-2xl border border-slate-100 text-center text-slate-400 text-sm italic">
                        No raw materials match the current filters. Click "Register Master Item" or adjust your search query.
                    </div>
                ) : (
                    filteredMasterGoods.map(master => {
                        const isExpanded = expandedMasterKeys.has(master.masterKey);
                        const isTracked = isTrackedCategory(master.category, master.uom);

                        return (
                            <div
                                key={master.masterKey}
                                className={`bg-white rounded-2xl shadow-sm hover:shadow-md border p-6 flex flex-col justify-between transition-all duration-200 ${
                                    master.isOutOfStock
                                        ? 'border-rose-300 bg-rose-50/10'
                                        : master.isLowStock
                                        ? 'border-amber-300 bg-amber-50/10'
                                        : 'border-slate-200'
                                }`}
                            >
                                {/* Master Card Top Header */}
                                <div>
                                    <div className="flex justify-between items-start gap-2 mb-3">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md bg-[#8EBF45]/20 text-[#658C3E] border border-[#8EBF45]/40">
                                                {master.category}
                                            </span>
                                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                                                Unit: {master.uom}
                                            </span>
                                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                                                📦 {master.batches.length} Inward {master.batches.length === 1 ? 'Batch' : 'Batches'}
                                            </span>
                                        </div>

                                        {/* Status / Alert Indicator & Card Action Buttons */}
                                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                            {master.isIgnoredForAlerts ? (
                                                <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border border-slate-300 bg-slate-100 text-slate-600">
                                                    🚫 DO NOT REPLENISH
                                                </span>
                                            ) : master.isOutOfStock ? (
                                                <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                                                    🚫 OUT OF STOCK
                                                </span>
                                            ) : master.isLowStock ? (
                                                <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                                    ⚠️ LOW STOCK ({master.lowStockThresholdPercent}%)
                                                </span>
                                            ) : null}

                                            <button
                                                onClick={() => handleToggleIgnoreReplenish(master.masterKey, master.isIgnoredForAlerts)}
                                                className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                                                    master.isIgnoredForAlerts ? 'bg-slate-800 text-amber-300 border-slate-700' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                                }`}
                                                title={master.isIgnoredForAlerts ? "Click to re-enable alerts" : "Click to silence stock alerts"}
                                            >
                                                {master.isIgnoredForAlerts ? '🔕 Silenced' : '🔔 Alert On'}
                                            </button>

                                            {/* DIRECT MASTER EDIT BUTTON */}
                                            <button
                                                onClick={() => handleEditMaster(master)}
                                                className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-[#8EBF45] hover:text-[#0D0D0D] text-slate-700 text-xs font-bold rounded-lg border border-slate-200 transition-colors shadow-2xs"
                                                title="Edit Master Item Details & Quantities"
                                            >
                                                <PencilIcon />
                                                <span>Edit</span>
                                            </button>

                                            {/* DIRECT MASTER DELETE BUTTON */}
                                            <button
                                                onClick={() => handleDeleteMaster(master)}
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                                                title={`Delete ${master.name} (all ${master.batches.length} batch(es))`}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Master Item Title & Specs */}
                                    <div className="mb-4">
                                        <h3 className="font-bold text-lg text-slate-900 leading-tight">
                                            {master.name}
                                        </h3>

                                        {master.makeModels.length > 0 && (
                                            <p className="text-xs text-[#658C3E] font-black uppercase tracking-wider mt-1">
                                                {master.makeModels.join(' • ')}
                                            </p>
                                        )}

                                        {master.suppliers.length > 0 && (
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                <span className="font-bold text-slate-600">Suppliers: </span>
                                                <span>{master.suppliers.join(', ')}</span>
                                            </p>
                                        )}
                                    </div>

                                    {/* Total Stock on Hand Counter */}
                                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between my-3">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Plant Stock on Hand</p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">Across {master.batches.length} inward shipments</p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-2xl font-black font-mono ${
                                                master.totalQuantity === 0 ? 'text-red-500' : 'text-[#658C3E]'
                                            }`}>
                                                {master.totalQuantity.toLocaleString('en-IN')}
                                            </span>
                                            <span className="text-xs font-bold text-slate-600 uppercase font-mono ml-1">
                                                {master.uom}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Director Admin Unit Cost & Inventory Valuation Box */}
                                    {isDirectorAdmin && (
                                        <div
                                            onClick={() => handleEditMaster(master)}
                                            className="p-3 bg-emerald-50/80 hover:bg-emerald-100/90 rounded-xl border border-emerald-200/90 flex items-center justify-between my-2 text-xs cursor-pointer transition-all group/cost shadow-2xs"
                                            title="Click to enter card and edit unit cost"
                                        >
                                            <div>
                                                <div className="flex items-center gap-1.5 text-emerald-900 font-bold">
                                                    <span>🏷️</span>
                                                    <span className="uppercase tracking-wider text-[10px]">Purchase Unit Cost (Excl. GST) • Director Admin</span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    Stock Value: <span className="font-mono font-bold text-slate-800">₹{((master.unitCost || 0) * master.totalQuantity).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-black text-sm text-emerald-950 bg-white px-2.5 py-1 rounded-lg border border-emerald-300 shadow-2xs">
                                                    ₹{(master.unitCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    <span className="text-[10px] text-slate-500 font-normal ml-1">/{master.uom}</span>
                                                </span>
                                                <span className="px-2 py-1 bg-white group-hover/cost:bg-emerald-700 group-hover/cost:text-white text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1">
                                                    <PencilIcon />
                                                    <span>Edit</span>
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tracked serials progress if Cell */}
                                    {isTracked && (
                                        <div className="my-3 text-xs flex justify-between items-center text-slate-600">
                                            <span className="font-bold text-slate-500">Tracked Cell Serials:</span>
                                            <span className="font-mono font-bold text-[#658C3E]">
                                                {master.totalSerials} / {master.totalQuantity} {master.uom}
                                            </span>
                                        </div>
                                    )}

                                    {/* Expandable Inward Batch History Section */}
                                    <div className="mt-4 border-t border-slate-100 pt-3">
                                        <button
                                            onClick={() => toggleExpandMaster(master.masterKey)}
                                            className="w-full flex items-center justify-between text-xs font-black text-slate-700 hover:text-slate-900 py-1"
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <span>📋</span>
                                                <span>Inward Batches & Invoices ({master.batches.length})</span>
                                            </span>
                                            <span className="text-slate-400 font-mono text-[11px]">
                                                {isExpanded ? '▲ Hide History' : '▼ View History'}
                                            </span>
                                        </button>

                                        {isExpanded && (
                                            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
                                                {master.batches.map((batch, bIdx) => (
                                                    <div
                                                        key={batch.id || bIdx}
                                                        className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs hover:border-slate-400 transition-all text-xs"
                                                    >
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div className="space-y-0.5 flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono font-black text-slate-900">
                                                                        #{bIdx + 1}
                                                                    </span>
                                                                    <span className="font-bold text-slate-800 truncate">
                                                                        {batch.invoiceNumber ? `Invoice: ${batch.invoiceNumber}` : 'Manual Entry'}
                                                                    </span>
                                                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                                                                        statusInfo[batch.status]?.color || 'bg-slate-100 text-slate-700'
                                                                    }`}>
                                                                        {statusInfo[batch.status]?.text || batch.status}
                                                                    </span>
                                                                </div>

                                                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                                    <span>📅 {new Date(batch.timestamp).toLocaleDateString()}</span>
                                                                    {batch.supplier && <span>🏢 {batch.supplier}</span>}
                                                                    {batch.makeModel && <span>🏷️ {batch.makeModel}</span>}
                                                                    {isAdmin && batch.unitCost !== undefined && batch.unitCost > 0 && (
                                                                        <span className="text-emerald-700 font-mono font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                                                            @ ₹{batch.unitCost.toLocaleString('en-IN')} / {batch.uom || master.uom}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <div className="text-right font-mono mr-1">
                                                                    <span className="font-black text-slate-900 text-sm">
                                                                        {batch.quantity}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500 ml-0.5">
                                                                        {batch.uom || master.uom}
                                                                    </span>
                                                                </div>

                                                                <button
                                                                    onClick={() => handleEditBatch(batch)}
                                                                    className="p-1.5 text-slate-400 hover:text-[#658C3E] hover:bg-slate-100 rounded-lg transition-colors"
                                                                    title="Edit this batch entry"
                                                                >
                                                                    <PencilIcon />
                                                                </button>

                                                                <button
                                                                    onClick={() => handleDeleteBatchDirect(batch)}
                                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Delete this inward batch"
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Card Bottom Actions Bar */}
                                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            onClick={() => handleAddBatchToMaster(master)}
                                            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs"
                                            title="Add new inward shipment / invoice batch to this master item"
                                        >
                                            <PlusIcon className="w-3.5 h-3.5" />
                                            <span>Add Inward Batch</span>
                                        </button>

                                        <button
                                            onClick={() => handleEditMaster(master)}
                                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-200"
                                            title="Edit Master Item Details & Batches"
                                        >
                                            <PencilIcon />
                                            <span>Edit Item</span>
                                        </button>
                                    </div>

                                    {isTracked && setView && (
                                        <button
                                            onClick={() => setView('testing')}
                                            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                                            title="Open Cell Testing for this master item"
                                        >
                                            <span>🧪 Test Cells</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modal for Registering Master Item / Inward Batch */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={
                    editingGood
                        ? `Edit Raw Material / Batch (${editingGood.name})`
                        : inwardBatchMasterTarget
                        ? `➕ Add Inward Batch to [${inwardBatchMasterTarget.name}]`
                        : "Register New Master Raw Material"
                }
                size="xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Active Master SKU Context Banner / Inward Mode Switcher */}
                    {inwardBatchMasterTarget && activeMasterGroupForModal && (
                        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2.5">
                                <span className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                                    <Package size={16} />
                                </span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-bold text-slate-900">
                                            Adding Inward Batch to: <span className="text-[#658C3E]">{inwardBatchMasterTarget.name}</span>
                                        </p>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900">
                                            ✨ New Inward Batch
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 mt-0.5">
                                        Current stock: <span className="font-semibold text-slate-800">{activeMasterGroupForModal.totalQuantity} {activeMasterGroupForModal.uom}</span> across {activeMasterGroupForModal.batches.length} existing batch(es)
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {editingGood && activeMasterGroupForModal && (
                        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2.5">
                                <span className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                                    <PencilIcon />
                                </span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-bold text-slate-900">
                                            Editing Batch: <span className="font-mono text-amber-900">{editingGood.invoiceNumber || 'No Invoice'}</span> ({editingGood.quantity} {editingGood.uom})
                                        </p>
                                    </div>
                                    <p className="text-[11px] text-slate-600 mt-0.5">
                                        Master SKU: <span className="font-semibold text-slate-800">{activeMasterGroupForModal.name}</span> (Total stock: {activeMasterGroupForModal.totalQuantity} {activeMasterGroupForModal.uom})
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleSwitchToNewInwardBatch}
                                className="text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shadow-xs"
                                title="Switch from editing this existing batch to logging a brand new inward batch for this item"
                            >
                                <PlusIcon className="w-3.5 h-3.5" />
                                <span>➕ Add New Inward Batch Instead</span>
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-full">
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Master Item Name</label>
                            <input
                                type="text"
                                list="item-names-received"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                disabled={Boolean(inwardBatchMasterTarget)}
                                className={`w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none font-semibold text-sm ${
                                    inwardBatchMasterTarget ? 'bg-slate-100 cursor-not-allowed' : 'bg-white'
                                }`}
                                required
                                placeholder="e.g. 32700 LiFePO4 Cell 6000mAh"
                            />
                            <datalist id="item-names-received">
                                {Array.from(new Set(receivedGoods.map(g => g.name))).map(n => <option key={n} value={n} />)}
                            </datalist>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider">
                                    Category <span className="text-red-500">*</span>
                                </label>
                                {!inwardBatchMasterTarget && (
                                    <button
                                        type="button"
                                        onClick={() => setShowInlineAddCategory(prev => !prev)}
                                        className="text-xs font-bold text-[#658C3E] hover:underline"
                                    >
                                        {showInlineAddCategory ? '✕ Cancel' : '➕ New Category'}
                                    </button>
                                )}
                            </div>

                            {showInlineAddCategory ? (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Enter custom category..."
                                        value={inlineCategoryName}
                                        onChange={e => setInlineCategoryName(e.target.value)}
                                        className="flex-1 border-2 border-[#8EBF45] rounded-lg p-2 text-xs font-bold bg-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAddCustomRawCategory(inlineCategoryName)}
                                        className="px-3 py-1.5 bg-[#8EBF45] text-[#0D0D0D] font-bold rounded-lg text-xs hover:bg-[#658C3E] hover:text-white transition-all shadow-xs"
                                    >
                                        Save
                                    </button>
                                </div>
                            ) : (
                                <select
                                    value={formData.category}
                                    onChange={e => {
                                        if (e.target.value === 'ADD_CUSTOM') {
                                            setShowInlineAddCategory(true);
                                        } else {
                                            setFormData({ ...formData, category: e.target.value });
                                        }
                                    }}
                                    disabled={Boolean(inwardBatchMasterTarget)}
                                    className={`w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-bold ${
                                        inwardBatchMasterTarget ? 'bg-slate-100 cursor-not-allowed' : 'bg-white text-slate-800'
                                    }`}
                                    required
                                >
                                    <option value="">Select Category</option>
                                    {allRawCategories.map(c => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                    {!inwardBatchMasterTarget && (
                                        <option value="ADD_CUSTOM" className="font-bold text-[#658C3E]">
                                            ➕ Add Custom Category...
                                        </option>
                                    )}
                                </select>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Make / Model</label>
                            <input
                                type="text"
                                value={formData.makeModel}
                                onChange={e => setFormData({ ...formData, makeModel: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white"
                                placeholder="e.g. EVE LF100 Grade A"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Supplier / Vendor</label>
                            <SearchableSupplierDropdown
                                value={formData.supplier}
                                onChange={val => handleSupplierChange(val)}
                                companyProfiles={companyProfiles}
                                onAddNewCompany={() => setIsAddCompanyModalOpen(true)}
                                placeholder="Search & select supplier / vendor..."
                            />
                        </div>

                        <div className="col-span-1 md:col-span-2">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider">
                                    Invoice / Bill Number
                                </label>
                                {duplicateInvoiceBatch ? (
                                    <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 animate-pulse">
                                        <AlertTriangle size={12} /> Duplicate Detected
                                    </span>
                                ) : (formData.invoiceNumber || '').trim().length > 0 ? (
                                    <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        <CheckCircle size={12} /> Unique Invoice
                                    </span>
                                ) : null}
                            </div>
                            <input
                                type="text"
                                value={formData.invoiceNumber}
                                onChange={e => setFormData({ ...formData, invoiceNumber: e.target.value })}
                                className={`w-full border rounded-lg p-2.5 outline-none text-sm bg-white font-mono transition-all ${
                                    duplicateInvoiceBatch 
                                        ? 'border-rose-500 bg-rose-50/40 text-rose-900 focus:ring-2 focus:ring-rose-400 font-bold' 
                                        : 'border-slate-200 focus:ring-2 focus:ring-[#8EBF45]'
                                }`}
                                placeholder="e.g. INV-2026-001"
                            />
                            
                            {/* Duplicate Warning Alert */}
                            {duplicateInvoiceBatch && (
                                <div className="mt-2.5 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs shadow-xs animate-in fade-in duration-150">
                                    <div className="flex items-start gap-2.5">
                                        <AlertTriangle size={17} className="text-rose-600 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="font-bold text-rose-900">
                                                Invoice #{duplicateInvoiceBatch.invoiceNumber} already exists for this item!
                                            </p>
                                            <p className="text-[11px] text-rose-700">
                                                An inward batch of <span className="font-bold">{duplicateInvoiceBatch.quantity} {duplicateInvoiceBatch.uom || 'qty'}</span> was already recorded on <span className="font-bold">{new Date(duplicateInvoiceBatch.timestamp).toLocaleDateString()}</span> from <span className="font-bold">{duplicateInvoiceBatch.supplier || 'Unknown Supplier'}</span>.
                                            </p>
                                            <p className="text-[11px] font-semibold text-rose-800">
                                                To avoid duplicate inventory, verify the bill number or edit the existing batch.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Previous Invoices Chips for this Item */}
                            {previousInvoicesForModalItem.length > 0 && (
                                <div className="mt-2.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                        Previous Invoices on file for this item ({previousInvoicesForModalItem.length}):
                                    </span>
                                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-0.5">
                                        {previousInvoicesForModalItem.map(prevGood => {
                                            const isMatch = (formData.invoiceNumber || '').trim().toLowerCase() === (prevGood.invoiceNumber || '').trim().toLowerCase();
                                            return (
                                                <button
                                                    key={prevGood.id}
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, invoiceNumber: prevGood.invoiceNumber }))}
                                                    title={`Received: ${new Date(prevGood.timestamp).toLocaleDateString()} | Qty: ${prevGood.quantity} ${prevGood.uom || 'qty'} | Supplier: ${prevGood.supplier || 'N/A'}`}
                                                    className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-all ${
                                                        isMatch 
                                                            ? 'bg-rose-100 text-rose-800 border-rose-300 font-bold shadow-xs'
                                                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                                                    }`}
                                                >
                                                    {prevGood.invoiceNumber}
                                                    <span className="ml-1 text-[10px] opacity-75 font-sans">({prevGood.quantity})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Invoice / Inward Date</label>
                            <input
                                type="date"
                                value={formData.invoiceDate}
                                onChange={e => setFormData({ ...formData, invoiceDate: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white font-mono"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Batch Quantity</label>
                            <input
                                type="number"
                                min="0"
                                value={formData.quantity}
                                onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-bold bg-white"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Unit of Measurement (UOM)</label>
                            <select
                                value={formData.uom || 'qty'}
                                onChange={e => setFormData({ ...formData, uom: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white font-bold text-slate-800"
                            >
                                <option value="qty">qty (Quantity / Pcs)</option>
                                <option value="grams">grams (g)</option>
                                <option value="cm">cm (Centimeters)</option>
                            </select>
                        </div>

                        {isDirectorAdmin && (
                            <div>
                                <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Purchase Unit Cost (₹ Excl. GST) • Director Admin</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm font-mono">₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.unitCost === 0 ? '' : formData.unitCost}
                                        onChange={e => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
                                        className="w-full border border-emerald-300 rounded-lg p-2.5 pl-7 focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold bg-white text-slate-800 font-mono"
                                        placeholder="0.00"
                                    />
                                </div>
                                <p className="text-[11px] text-emerald-700 mt-1">
                                    Editable only by Director Admins. Automatically updates all batches for this item and flows into the BOM Cost Calculator in Finance.
                                </p>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">QC Status</label>
                            <select
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white font-bold"
                            >
                                {Object.entries(statusInfo).map(([key, info]) => (
                                    <option key={key} value={key}>{info.text}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="mt-4">
                        <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Batch Inspection Notes</label>
                        <textarea
                            value={formData.notes ?? 'actual physical qty = '}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm resize-none bg-white"
                            rows={2}
                            placeholder="actual physical qty = "
                        />
                    </div>

                    {/* Low Stock Safety Threshold */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 mt-4">
                        <div className="flex justify-between items-center">
                            <label className="block text-xs font-bold text-[#205f64] uppercase tracking-wider font-brand">
                                Low Stock Alert Safety Threshold (0% - 100%)
                            </label>
                            <span className="text-xs font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                                {formData.lowStockThresholdPercent ?? 20}% of entry
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <input 
                                type="range" 
                                min="0" 
                                max="100" 
                                value={formData.lowStockThresholdPercent ?? 20} 
                                onChange={e => setFormData({ ...formData, lowStockThresholdPercent: parseInt(e.target.value) || 0 })} 
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#205f64]"
                            />
                            <div className="flex items-center gap-1">
                                <input 
                                    type="number" 
                                    min="0" 
                                    max="100" 
                                    value={formData.lowStockThresholdPercent ?? 20} 
                                    onChange={e => setFormData({ ...formData, lowStockThresholdPercent: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} 
                                    className="w-16 border border-slate-300 rounded-lg p-1.5 text-center text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                />
                                <span className="text-xs font-bold text-slate-600">%</span>
                            </div>
                        </div>

                        {/* Ignore Replenishment Toggle */}
                        <div className="pt-2.5 border-t border-slate-200 mt-2 flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(formData.isIgnoredForAlerts)}
                                    onChange={e => setFormData({ ...formData, isIgnoredForAlerts: e.target.checked })}
                                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-slate-800">
                                    🚫 Do Not Replenish / Disable Stock Alerts
                                </span>
                            </label>
                            {formData.isIgnoredForAlerts && (
                                <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                    Alerts Silenced
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Serial Numbers for Cells */}
                    {isTrackedCategory(formData.category, formData.uom) && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-sm font-bold text-slate-700 uppercase">Serials & Test Data</h3>
                                <div className="text-right">
                                    <span className="text-xs text-slate-500 block">{serialEntries.filter(s => s.serial).length} / {formData.quantity} Assigned</span>
                                    <span className="text-[9px] text-[#658C3E]">Paste into any cell. Grid auto-expands.</span>
                                </div>
                            </div>

                            <div className="flex gap-2 mb-3 items-end">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Prefix</label>
                                    <input type="text" placeholder="e.g. SN-" className="w-full p-2 border rounded text-xs" value={prefix} onChange={e => setPrefix(e.target.value)} />
                                </div>
                                <div className="w-20">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Start #</label>
                                    <input type="number" className="w-full p-2 border rounded text-xs" value={startNumber} onChange={e => setStartNumber(parseInt(e.target.value))} />
                                </div>
                                <button type="button" onClick={handleAutoGenerate} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded text-xs font-bold transition-colors">
                                    Auto-Generate
                                </button>
                            </div>

                            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100 text-slate-500 font-bold sticky top-0 z-10">
                                        <tr>
                                            <th className="p-2 border-b w-8">#</th>
                                            <th className="p-2 border-b">Serial Number</th>
                                            <th className="p-2 border-b w-24">Voltage (V)</th>
                                            <th className="p-2 border-b w-24">Res (mΩ)</th>
                                            <th className="p-2 border-b w-24">Cap (Ah)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {serialEntries.map((entry, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50">
                                                <td className="p-2 text-slate-400 text-center">{editingGood?.serialIndexMap?.[entry.serial] ?? (idx + 1)}</td>
                                                <td className="p-1">
                                                    <input
                                                        type="text"
                                                        className="w-full p-1 border border-transparent hover:border-slate-200 focus:border-[#8EBF45] focus:bg-white rounded outline-none bg-transparent font-mono"
                                                        value={entry.serial}
                                                        onChange={(e) => handleEntryChange(idx, 'serial', e.target.value)}
                                                        onPaste={(e) => handleGridPaste(e, idx, 'serial')}
                                                        placeholder={`Serial ${idx + 1}`}
                                                    />
                                                </td>
                                                <td className="p-1">
                                                    <input
                                                        type="text"
                                                        className="w-full p-1 border border-transparent hover:border-slate-200 focus:border-[#8EBF45] focus:bg-white rounded outline-none bg-transparent"
                                                        value={entry.voltage}
                                                        onChange={(e) => handleEntryChange(idx, 'voltage', e.target.value)}
                                                        onPaste={(e) => handleGridPaste(e, idx, 'voltage')}
                                                    />
                                                </td>
                                                <td className="p-1">
                                                    <input
                                                        type="text"
                                                        className="w-full p-1 border border-transparent hover:border-slate-200 focus:border-[#8EBF45] focus:bg-white rounded outline-none bg-transparent"
                                                        value={entry.resistance}
                                                        onChange={(e) => handleEntryChange(idx, 'resistance', e.target.value)}
                                                        onPaste={(e) => handleGridPaste(e, idx, 'resistance')}
                                                    />
                                                </td>
                                                <td className="p-1">
                                                    <input
                                                        type="text"
                                                        className="w-full p-1 border border-transparent hover:border-slate-200 focus:border-[#8EBF45] focus:bg-white rounded outline-none bg-transparent"
                                                        value={entry.capacity}
                                                        onChange={(e) => handleEntryChange(idx, 'capacity', e.target.value)}
                                                        onPaste={(e) => handleGridPaste(e, idx, 'capacity')}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between pt-4 border-t border-slate-100">
                        {editingGood ? (
                            <button type="button" onClick={handleDelete} className="text-red-500 hover:text-red-700 text-xs font-bold flex items-center px-2">
                                <Trash2 size={16} className="mr-1" /> Delete Batch
                            </button>
                        ) : <div></div>}

                        <button 
                            type="submit" 
                            disabled={Boolean(duplicateInvoiceBatch)}
                            title={duplicateInvoiceBatch ? "Cannot save: duplicate invoice number detected for this item" : undefined}
                            className={`px-8 py-2.5 rounded-lg font-black uppercase tracking-widest text-xs shadow-lg transition-all ${
                                duplicateInvoiceBatch
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none'
                                    : 'bg-[#8EBF45] text-[#0D0D0D] hover:bg-[#658C3E] hover:text-white active:scale-95'
                            }`}
                        >
                            {editingGood ? 'Update Batch' : 'Save Batch'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Add Company Modal with Iframe */}
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
                            <h2 className="text-base sm:text-lg font-bold text-slate-800">Add New Company Profile</h2>
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
            {/* CREATE NEW CUSTOM RAW MATERIAL CATEGORY MODAL */}
            <Modal
                isOpen={isAddCategoryModalOpen}
                onClose={() => {
                    setIsAddCategoryModalOpen(false);
                    setNewCategoryInput('');
                }}
                title="➕ Add Raw Material & Component Category"
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-xs text-slate-600 leading-relaxed">
                        Create a custom category tag for your inventory items (e.g.{' '}
                        <strong className="text-slate-800 font-mono">Thermal Pad</strong>,{' '}
                        <strong className="text-slate-800 font-mono">Active Balancer</strong>,{' '}
                        <strong className="text-slate-800 font-mono">Copper Busbar</strong>,{' '}
                        <strong className="text-slate-800 font-mono">Aluminum Enclosure</strong>).
                    </p>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Category Name *
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Active Balancer"
                            value={newCategoryInput}
                            onChange={e => setNewCategoryInput(e.target.value)}
                            className="w-full border-2 border-slate-300 rounded-lg p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#8EBF45]"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => {
                                setIsAddCategoryModalOpen(false);
                                setNewCategoryInput('');
                            }}
                            className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAddCustomRawCategory(newCategoryInput)}
                            className="px-4 py-2 bg-[#8EBF45] text-[#0D0D0D] font-black uppercase tracking-wider rounded-lg text-xs hover:bg-[#658C3E] hover:text-white shadow-md transition-all"
                        >
                            Create Category
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ReceivedGoods;
