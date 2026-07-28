
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ReceivedGood, WIPItem, FinishedGood, CompanyProfile, TestResult, User, ExtractedInvoice, Recipe } from '../types';
import { ReceivedGoodStatus, EMPTY_INVOICE } from '../types';
import Modal from './Modal';
import { PlusIcon } from './icons/PlusIcon';
import { PencilIcon } from './icons/PencilIcon';
import { DuplicateIcon } from './icons/DuplicateIcon';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import { MergeIcon } from './icons/MergeIcon';
import { RefreshCw, Trash2, Download } from './invoices/Icons';
import { ImportIcon } from './icons/ImportIcon';
import { SearchIcon } from './icons/SearchIcon';
import { getItemStockAlertInfo } from '../utils/stockAlerts';

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

const statusInfo = {
    [ReceivedGoodStatus.ND]: { text: 'Not Damaged', color: 'bg-[#A8BF75]/20 text-[#658C3E] border border-[#A8BF75]/50' },
    [ReceivedGoodStatus.PR]: { text: 'Partially Received', color: 'bg-yellow-50 text-yellow-800 border border-yellow-200' },
    [ReceivedGoodStatus.D]: { text: 'Damaged', color: 'bg-red-50 text-red-800 border border-red-200' },
    [ReceivedGoodStatus.Other]: { text: 'Other', color: 'bg-gray-100 text-gray-800 border border-gray-200' },
};

const initialFormState: Omit<ReceivedGood, 'id' | 'timestamp' | 'serials'> & { serials: string[] } = {
    name: '', category: '', makeModel: '', supplier: '', quantity: 0, initialQuantity: 0, uom: 'qty', lowStockThresholdPercent: 20, isIgnoredForAlerts: false, status: ReceivedGoodStatus.ND, damagedCount: 0, invoiceNumber: '', serials: [], notes: 'actual physical qty = '
};

const CATEGORIES = ['Cell', 'BMS', 'Bat-misc', 'Nickel Strip', 'Wire', 'Connector', 'Holder', 'Epoxy Sheet', 'Sleeve', 'Tape', 'Screw', 'Cabinet', 'Other'];
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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGood, setEditingGood] = useState<ReceivedGood | null>(null);
    const [formData, setFormData] = useState(initialFormState);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [filterNotes, setFilterNotes] = useState(false);
    const [filterLowStock, setFilterLowStock] = useState(false);
    const [filterIgnored, setFilterIgnored] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleSupplierChange = (value: string) => {
        if (value === 'ADD_NEW') {
            setIsAddCompanyModalOpen(true);
        } else {
            setFormData({ ...formData, supplier: value });
        }
    };

    // Helper to determine if category requires serial tracking (Only Cells with 'qty' UOM)
    const isTrackedCategory = (cat: string, uom?: string) => (cat || '').toLowerCase() === 'cell' && (!uom || uom === 'qty');

    // Populate form when editing
    useEffect(() => {
        if (editingGood) {
            setFormData({
                name: editingGood.name,
                category: editingGood.category,
                makeModel: editingGood.makeModel,
                supplier: editingGood.supplier,
                quantity: editingGood.quantity,
                initialQuantity: editingGood.initialQuantity ?? editingGood.quantity,
                uom: editingGood.uom || 'qty',
                lowStockThresholdPercent: editingGood.lowStockThresholdPercent ?? 20,
                isIgnoredForAlerts: Boolean(editingGood.isIgnoredForAlerts),
                status: editingGood.status as ReceivedGoodStatus,
                damagedCount: editingGood.damagedCount,
                invoiceNumber: editingGood.invoiceNumber,
                notes: editingGood.notes ?? 'actual physical qty = ',
                serials: editingGood.serials,
            });

            // Merge Serials with Test Results
            if (isTrackedCategory(editingGood.category, editingGood.uom)) {
                const entries: SerialGridRow[] = editingGood.serials.map(s => {
                    const tr = testResults.find(r => r.receivedGoodId === editingGood.id && r.serialNumber === s);
                    return {
                        serial: s,
                        voltage: tr?.voltage?.toString() || '',
                        resistance: tr?.resistance?.toString() || '',
                        capacity: tr?.capacity?.toString() || '',
                        grade: tr?.grade || '',
                        location: tr?.location || ''
                    };
                });

                // Fill remaining if quantity > serials count
                if (entries.length < editingGood.quantity) {
                    const diff = editingGood.quantity - entries.length;
                    for (let i = 0; i < diff; i++) entries.push({ serial: '', voltage: '', resistance: '', capacity: '', grade: '', location: '' });
                }
                setSerialEntries(entries);
            } else {
                setSerialEntries([]);
            }
        } else {
            setFormData(initialFormState);
            setSerialEntries([]);
        }
    }, [editingGood]);  // FIX #4: Only re-populate when opening a different batch, not on every testResults change

    // Adjust serial entries when quantity changes (Only for Cell with 'qty' UOM)
    useEffect(() => {
        if (!isTrackedCategory(formData.category, formData.uom)) return;

        const qty = Number(formData.quantity) || 0;
        setSerialEntries(prev => {
            if (prev.length === qty) return prev;
            if (prev.length > qty) {
                return prev.slice(0, qty);  // Trim excess rows
            } else {
                const diff = qty - prev.length;
                return [...prev, ...Array(diff).fill(null).map(() => ({ serial: '', voltage: '', resistance: '', capacity: '', grade: '', location: '' }))];
            }
        });
    }, [formData.quantity, formData.category, formData.uom]);

    // Handle Inventory Import
    useEffect(() => {
        const checkImport = () => {
            const pendingImport = localStorage.getItem('pendingInventoryImport');
            if (pendingImport) {
                try {
                    const items = JSON.parse(pendingImport);
                    if (Array.isArray(items) && items.length > 0) {
                        setTimeout(() => {
                            const confirmed = window.confirm(`Found ${items.length} items imported from Invoice Module. Add to storage?`);
                            if (confirmed) {
                                const newGoods: ReceivedGood[] = items.map((item: any, index: number) => {
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
                                addLogEntry('Imported Storage Items', `Imported ${newGoods.length} items from invoice scan.`);
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
    }, []);

    const filteredGoods = receivedGoods.filter(good => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = good.name.toLowerCase().includes(term) ||
            (good.category || '').toLowerCase().includes(term) ||
            (good.makeModel || '').toLowerCase().includes(term) ||
            (good.invoiceNumber || '').toLowerCase().includes(term) ||
            (good.supplier || '').toLowerCase().includes(term);

        const matchesCategory = selectedCategory === 'All' || good.category === selectedCategory;

        const matchesNotes = !filterNotes || (good.notes && good.notes !== 'actual physical qty = ');

        const stockAlert = getItemStockAlertInfo(good);
        const matchesLowStock = !filterLowStock || stockAlert.isLowStock;
        const matchesIgnored = !filterIgnored || Boolean(good.isIgnoredForAlerts);

        return matchesSearch && matchesCategory && matchesNotes && matchesLowStock && matchesIgnored;
    }).sort((a, b) => b.timestamp - a.timestamp);

    const handleEditClick = (good: ReceivedGood) => {
        setEditingGood(good);
        setIsModalOpen(true);
    };

    const handleToggleIgnoreReplenish = (good: ReceivedGood) => {
        const updatedStatus = !good.isIgnoredForAlerts;
        
        // Update persistent localStorage map
        try {
            const currentMap = JSON.parse(localStorage.getItem('dc_ignored_stock_alerts_map') || '{}');
            currentMap[good.id] = updatedStatus;
            localStorage.setItem('dc_ignored_stock_alerts_map', JSON.stringify(currentMap));
        } catch (e) {
            console.warn('Failed to save ignored stock map to localStorage', e);
        }

        setReceivedGoods(prev => prev.map(g => g.id === good.id ? { ...g, isIgnoredForAlerts: updatedStatus } : g));
        addLogEntry('Updated Replenish Policy', `${good.name}: ${updatedStatus ? 'Ignored (Do Not Replenish)' : 'Active Replenishment'}`);
    };

    const handleCreateNew = () => {
        setEditingGood(null);
        setFormData(initialFormState);
        setSerialEntries([]);
        setIsModalOpen(true);
    };

    const handleAutoGenerate = () => {
        const count = Number(formData.quantity) || 0;
        setSerialEntries(prev => {
            const newEntries = [...prev];
            // Ensure length matches count before generating
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

    // Smart Paste: Handles pasting a block of data starting from any cell
    const handleGridPaste = (e: React.ClipboardEvent, startRowIndex: number, startColKey: typeof GRID_COLUMNS[number]) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        const rows = text.split(/\r?\n/).filter(line => line.trim() !== '');

        if (rows.length === 0) return;

        // Auto-expand quantity if paste is larger than current table
        let currentEntries = [...serialEntries];
        if (startRowIndex + rows.length > currentEntries.length) {
            const needed = startRowIndex + rows.length - currentEntries.length;
            for (let k = 0; k < needed; k++) currentEntries.push({ serial: '', voltage: '', resistance: '', capacity: '', grade: '', location: '' });
            setFormData(prev => ({ ...prev, quantity: currentEntries.length }));
        }

        const startColIdx = GRID_COLUMNS.indexOf(startColKey);

        rows.forEach((line, i) => {
            const rowIndex = startRowIndex + i;
            const cells = line.split('\t'); // Tab delimited for Excel/Sheets

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
        const goodId = editingGood ? editingGood.id : `rec-${Date.now()}`;
        const isCell = isTrackedCategory(formData.category, formData.uom);

        // Only capture serials if category is Cell and UOM is 'qty'
        const validSerials = isCell
            ? serialEntries.map(e => e.serial.trim()).filter(s => s !== '')
            : [];

        // Build persistent serialIndexMap: preserve existing indices, assign new ones for new serials
        let serialIndexMap: Record<string, number> = {};
        if (isCell && validSerials.length > 0) {
            const existingMap = editingGood?.serialIndexMap || {};
            // Find the highest existing index to continue from
            const existingValues = Object.values(existingMap) as number[];
            const maxExisting = existingValues.length > 0
                ? Math.max(...existingValues)
                : 0;
            let nextIdx = maxExisting;

            validSerials.forEach(serial => {
                if (existingMap[serial] !== undefined) {
                    serialIndexMap[serial] = existingMap[serial]; // Preserve existing #
                } else {
                    nextIdx++;
                    serialIndexMap[serial] = nextIdx; // New serial gets next available #
                }
            });
        }

        const initialQty = editingGood 
            ? (editingGood.initialQuantity || editingGood.quantity || formData.quantity || 1)
            : (formData.initialQuantity && formData.initialQuantity > 0 ? formData.initialQuantity : (formData.quantity || 1));

        // Sync to persistent localStorage map
        try {
            const currentMap = JSON.parse(localStorage.getItem('dc_ignored_stock_alerts_map') || '{}');
            currentMap[goodId] = Boolean(formData.isIgnoredForAlerts);
            localStorage.setItem('dc_ignored_stock_alerts_map', JSON.stringify(currentMap));
        } catch (e) {
            console.warn('Failed to save ignored stock map to localStorage', e);
        }

        // Prepare Received Good
        const newGood: ReceivedGood = {
            ...formData,
            id: goodId,
            initialQuantity: initialQty,
            lowStockThresholdPercent: formData.lowStockThresholdPercent ?? 20,
            isIgnoredForAlerts: Boolean(formData.isIgnoredForAlerts),
            timestamp: editingGood ? editingGood.timestamp : Date.now(),
            serials: validSerials,
            serialIndexMap: isCell ? serialIndexMap : undefined
        };

        // Prepare Test Results (Only for Cells) — now includes grade/location for round-tripping
        const newTestResults: TestResult[] = [];
        if (isCell) {
            serialEntries.forEach(entry => {
                if (!entry.serial) return;

                // Check if there is any data to save (V/R/C or grade/location)
                if (entry.voltage || entry.resistance || entry.capacity || entry.grade || entry.location) {
                    const safeSerial = entry.serial.replace(/[^a-zA-Z0-9]/g, '_');

                    newTestResults.push({
                        id: `test-${goodId}-${safeSerial}`,
                        receivedGoodId: goodId,
                        serialNumber: entry.serial,
                        category: 'Cell',
                        voltage: entry.voltage ? parseFloat(entry.voltage) : undefined,
                        resistance: entry.resistance ? parseFloat(entry.resistance) : undefined,
                        capacity: entry.capacity ? parseFloat(entry.capacity) : undefined,
                        grade: entry.grade || undefined,
                        location: entry.location || undefined,
                        timestamp: Date.now(),
                        testedBy: currentUser?.username || 'System'
                    });
                }
            });
        }

        if (editingGood) {
            // DATA SAFETY #2: Check for removed serials BEFORE any state changes
            // Cancel aborts the entire save — no changes made at all
            const removedSerials = isCell ? editingGood.serials.filter(s => !validSerials.includes(s)) : [];
            let shouldDeleteOrphans = false;
            if (removedSerials.length > 0) {
                const orphanedResults = testResults.filter(r => r.receivedGoodId === goodId && removedSerials.includes(r.serialNumber));
                if (orphanedResults.length > 0) {
                    const confirmRemove = window.confirm(
                        `⚠️ You removed ${removedSerials.length} serial(s) from this batch.\n\n` +
                        `${orphanedResults.length} test result(s) with grading data exist for these serials.\n` +
                        `Click OK to proceed and delete orphaned test data, or Cancel to abort save.`
                    );
                    if (!confirmRemove) return; // Cancel → abort the entire save, NO changes made
                    shouldDeleteOrphans = true;
                }
            }

            setReceivedGoods(prev => prev.map(g => g.id === editingGood.id ? newGood : g));

            // --- MASTER DATA INTEGRITY CHECK ---
            if (editingGood.name !== newGood.name && recipes && setRecipes) {
                const affectedRecipes = recipes.filter(r =>
                    r.components.some(c => c.masterItemName === editingGood.name)
                );

                if (affectedRecipes.length > 0) {
                    const confirmUpdate = window.confirm(
                        `You renamed '${editingGood.name}' to '${newGood.name}'.\n\n` +
                        `This item is used in ${affectedRecipes.length} Product SKUs (e.g. ${affectedRecipes[0].name}).\n` +
                        `Do you want to update these SKUs to use the new name automatically?`
                    );

                    if (confirmUpdate) {
                        setRecipes(prevRecipes => prevRecipes.map(r => ({
                            ...r,
                            components: r.components.map(c =>
                                c.masterItemName === editingGood.name
                                    ? { ...c, masterItemName: newGood.name }
                                    : c
                            )
                        })));
                        addLogEntry('Master Data Update', `Auto-updated ${affectedRecipes.length} recipes due to item rename: ${editingGood.name} -> ${newGood.name}`);
                    }
                }
            }
            // -----------------------------------

            // FIX #1: MERGE test results instead of destructive replace
            setTestResults(prev => {
                let updated = [...prev];

                // If user confirmed orphan deletion, clean them out
                if (shouldDeleteOrphans) {
                    const orphanSet = new Set(removedSerials);
                    updated = updated.filter(r => !(r.receivedGoodId === goodId && orphanSet.has(r.serialNumber)));
                }

                // Standard merge path — preserve existing fields not in the grid
                newTestResults.forEach(newResult => {
                    const idx = updated.findIndex(r => r.id === newResult.id);
                    if (idx > -1) {
                        updated[idx] = { ...updated[idx], ...newResult };
                    } else {
                        updated.push(newResult);
                    }
                });
                return updated;
            });

            addLogEntry('Updated Raw Material', `Updated ${newGood.name}`);
        } else {
            setReceivedGoods(prev => [newGood, ...prev]);
            setTestResults(prev => [...prev, ...newTestResults]);
            addLogEntry('Added Raw Material', `Registered ${newGood.quantity} of ${newGood.name}`);
        }
        setIsModalOpen(false);
    };

    // DATA SAFETY #1: Delete confirmation shows exact count of test results that will be destroyed
    const handleDelete = () => {
        if (editingGood) {
            const affectedResults = testResults.filter(r => r.receivedGoodId === editingGood.id);
            const testedCount = affectedResults.filter(r => r.voltage || r.resistance || r.capacity || r.grade).length;

            const message = testedCount > 0
                ? `Delete "${editingGood.name}"?\n\n⚠️ This will permanently destroy ${affectedResults.length} test result(s), including ${testedCount} with grading/test data.\n\nThis action cannot be undone.`
                : `Delete "${editingGood.name}"?`;

            if (confirm(message)) {
                setReceivedGoods(prev => prev.filter(g => g.id !== editingGood.id));
                setTestResults(prev => prev.filter(r => r.receivedGoodId !== editingGood.id));
                addLogEntry('Deleted Raw Material', `Deleted ${editingGood.name} (${affectedResults.length} test results removed)`);
                setIsModalOpen(false);
            }
        }
    };

    // CSV EXPORT: Export all inventory data with test results
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
        link.download = `inventory_export_${new Date().toISOString().slice(0, 10)}.csv`;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                <div>
                    <h1 className="text-3xl font-black text-[#0D0D0D] tracking-tight">Inventory Stock</h1>
                    <p className="text-sm text-[#404040] mt-1 font-medium">Manage raw materials and tracked components.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button onClick={handleCreateNew} className="flex items-center bg-[#8EBF45] text-[#0D0D0D] px-6 py-2.5 rounded-xl shadow-lg hover:bg-[#658C3E] hover:text-white transition-all transform active:scale-95 font-bold uppercase tracking-widest text-xs">
                        <PlusIcon /> <span className="ml-2">Register Item</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center bg-white border-2 border-[#A8BF75] text-[#658C3E] px-4 py-2 rounded-xl hover:bg-[#A8BF75]/10 transition-colors text-xs font-bold uppercase tracking-widest">
                        <ImportIcon className="mr-2" size={14} /> Import
                    </button>
                    <button onClick={handleExportCsv} className="flex items-center bg-white border-2 border-slate-300 text-slate-600 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors text-xs font-bold uppercase tracking-widest">
                        <Download size={14} className="mr-2" /> Export CSV
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv" />
                </div>
            </div>

            <div className="mb-4 relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#8EBF45] transition-colors">
                    <SearchIcon className="h-5 w-5" />
                </div>
                <input
                    type="text"
                    placeholder="Filter by name, make, supplier or invoice..."
                    className="block w-full p-4 pl-12 border-2 border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:border-[#8EBF45] focus:ring-4 focus:ring-[#8EBF45]/10 transition-all text-[#404040]"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Category Filters */}
            <div className="mb-8 flex flex-wrap gap-2">
                <button
                    onClick={() => setSelectedCategory('All')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all ${selectedCategory === 'All' ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                    All
                </button>
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all ${selectedCategory === cat ? 'bg-[#8EBF45] text-[#0D0D0D] border-[#8EBF45] shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        {cat}
                    </button>
                ))}
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button
                    onClick={() => setFilterNotes(!filterNotes)}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all flex items-center gap-1.5 ${filterNotes ? 'bg-amber-400 text-amber-900 border-amber-400 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredGoods.map(good => {
                    const isTracked = isTrackedCategory(good.category);
                    const progress = isTracked && good.serials.length > 0 ? Math.min(100, Math.round((good.serials.length / good.quantity) * 100)) : 0;
                    const stockAlert = getItemStockAlertInfo(good);

                    return (
                        <div key={good.id} className={`relative bg-white rounded-2xl shadow-sm hover:shadow-xl p-6 flex flex-col border transition-all duration-300 ${
                            stockAlert.isOutOfStock 
                                ? 'border-rose-300 bg-rose-50/10' 
                                : stockAlert.isLowStock 
                                    ? 'border-amber-300 bg-amber-50/10' 
                                    : 'border-slate-200'
                        }`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <div className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md ${statusInfo[good.status].color}`}>
                                            {statusInfo[good.status].text}
                                        </div>
                                        <div className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                            Unit: {good.uom || 'qty'}
                                        </div>
                                    </div>
                                    {good.isIgnoredForAlerts ? (
                                        <div className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border border-slate-300 bg-slate-100 text-slate-600 w-fit">
                                            🚫 DO NOT REPLENISH
                                        </div>
                                    ) : stockAlert.isLowStock && (
                                        <div className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border w-fit ${
                                            stockAlert.isOutOfStock 
                                                ? 'bg-rose-100 text-rose-800 border-rose-200' 
                                                : 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                                        }`}>
                                            {stockAlert.isOutOfStock ? '🚫 OUT OF STOCK' : `⚠️ LOW STOCK (${stockAlert.thresholdPercent}%)`}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setOpenNoteId(openNoteId === good.id ? null : good.id); }}
                                        className={`relative p-1 rounded-md transition-all text-sm ${(good.notes && good.notes !== 'actual physical qty = ')
                                            ? 'text-amber-500 hover:bg-amber-50'
                                            : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'
                                            }`}
                                        title="Open note"
                                    >
                                        📝
                                        {good.notes && good.notes !== 'actual physical qty = ' && (
                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full"></span>
                                        )}
                                    </button>
                                    <span className="text-[10px] font-bold text-slate-300">{new Date(good.timestamp).toLocaleDateString()}</span>
                                </div>
                            </div>

                            {/* Sticky Note Popup */}
                            {openNoteId === good.id && (
                                <div className="absolute top-12 right-4 z-50 w-64 animate-in" style={{ animation: 'fadeIn 0.15s ease-out' }}>
                                    <div className="bg-amber-50 border-2 border-amber-200 rounded-xl shadow-2xl p-4" style={{ boxShadow: '4px 4px 15px rgba(0,0,0,0.15)' }}>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">📌 Note</span>
                                            <button onClick={() => setOpenNoteId(null)} className="text-amber-400 hover:text-amber-600 text-xs font-bold p-1">✕</button>
                                        </div>
                                        <textarea
                                            className="w-full bg-transparent border-none outline-none text-sm text-amber-900 resize-none placeholder-amber-300"
                                            rows={3}
                                            placeholder="actual physical qty = "
                                            value={good.notes ?? 'actual physical qty = '}
                                            onChange={(e) => {
                                                setReceivedGoods(prev => prev.map(g => g.id === good.id ? { ...g, notes: e.target.value } : g));
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex-1">
                                <h3 className="font-bold text-xl text-[#0D0D0D] leading-tight mb-1 flex items-center justify-between">
                                    <span>{good.name}</span>
                                    <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200 font-mono">
                                        {good.uom || 'qty'}
                                    </span>
                                </h3>
                                <p className="text-xs text-[#658C3E] font-black uppercase tracking-widest">{good.makeModel}</p>
                                <div className="mt-4 flex justify-between items-end border-t border-slate-50 pt-4">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Supplier</p>
                                        <p className="text-sm font-bold text-[#404040] truncate max-w-[120px]">{good.supplier}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Available</p>
                                        <p className={`text-2xl font-black ${good.quantity === 0 ? 'text-red-500' : 'text-[#8EBF45]'}`}>
                                            {good.quantity} <span className="text-xs font-bold text-slate-600 uppercase font-mono">{good.uom || 'qty'}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 space-y-4">
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                                        <span>{isTracked ? 'Tracked Serials' : 'Stock Level'}</span>
                                        <span className="text-[#658C3E]">{isTracked ? `${good.serials.length} / ${good.quantity} ${good.uom || 'qty'}` : `${good.quantity} ${good.uom || 'qty'}`}</span>
                                    </div>
                                    {isTracked && (
                                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                            <div className={`h-full transition-all duration-500 rounded-full ${progress === 100 ? 'bg-[#8EBF45]' : 'bg-[#658C3E]'}`} style={{ width: `${progress}%` }}></div>
                                        </div>
                                    )}
                                    {!isTracked && (
                                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                            <div className="h-full bg-slate-300 w-full rounded-full"></div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2 justify-end items-center">
                                    <button 
                                        onClick={() => handleToggleIgnoreReplenish(good)} 
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                            good.isIgnoredForAlerts
                                                ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                        }`}
                                        title={good.isIgnoredForAlerts ? "Click to re-enable low stock alerts" : "Click to ignore / mark as do not replenish"}
                                    >
                                        {good.isIgnoredForAlerts ? '🚫 Ignored' : '🔔 Alert On'}
                                    </button>
                                    <button onClick={() => handleEditClick(good)} className="p-2.5 text-slate-400 hover:text-[#8EBF45] hover:bg-[#8EBF45]/5 rounded-xl transition-all"><PencilIcon /></button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingGood ? "Edit Record" : "Register Stock"} size="xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Item Name</label>
                            <input type="text" list="item-names" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none font-semibold text-sm" required placeholder="e.g. 32700 6000mAh Cell" />
                            <datalist id="item-names">
                                {Array.from(new Set(receivedGoods.map(g => g.name))).map(n => <option key={n} value={n} />)}
                            </datalist>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Category</label>
                            <input type="text" list="categories" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm" required />
                            <datalist id="categories">
                                {CATEGORIES.map(c => <option key={c} value={c} />)}
                            </datalist>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Make / Model</label>
                            <input type="text" value={formData.makeModel} onChange={e => setFormData({ ...formData, makeModel: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm" placeholder="e.g. EVE" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Supplier</label>
                            <select 
                                value={formData.supplier} 
                                onChange={e => handleSupplierChange(e.target.value)} 
                                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white"
                            >
                                <option value="">Select Supplier</option>
                                {companyProfiles.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                <option value="ADD_NEW" className="font-bold text-[#658C3E]">+ Add New...</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Invoice Number</label>
                            <input type="text" value={formData.invoiceNumber} onChange={e => setFormData({ ...formData, invoiceNumber: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Quantity</label>
                            <input type="number" min="0" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) })} className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-bold" required />
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

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Status</label>
                            <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })} className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white">
                                {Object.entries(statusInfo).map(([key, info]) => (
                                    <option key={key} value={key}>{info.text}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="mt-4">
                        <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Notes</label>
                        <textarea
                            value={formData.notes ?? 'actual physical qty = '}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm resize-none"
                            rows={2}
                            placeholder="actual physical qty = "
                        />
                    </div>

                    {/* Low Stock Alert Safety Threshold */}
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
                        <p className="text-[11px] text-slate-500 font-medium">
                            Triggers alert on Home Dashboard when stock drops below <strong>{Math.round(((formData.initialQuantity || formData.quantity || 0) * (formData.lowStockThresholdPercent ?? 20)) / 100)}</strong> units ({formData.lowStockThresholdPercent ?? 20}% of original entry quantity).
                        </p>

                        {/* Ignore / Do Not Replenish Toggle */}
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

                    {/* Serial Number & Test Data Management - ONLY FOR CELLS */}
                    {isTrackedCategory(formData.category) && (
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
                                        {serialEntries.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                                                    Set quantity to initialize grid rows.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isTrackedCategory(formData.category) && formData.category && (
                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-blue-800 text-sm">
                            <strong>Bulk Item Tracking:</strong> Serial number tracking is disabled for '{formData.category}'.
                            Items will be tracked by quantity only.
                        </div>
                    )}

                    <div className="flex justify-between pt-4 border-t border-slate-100">
                        {editingGood ? (
                            <button type="button" onClick={handleDelete} className="text-red-500 hover:text-red-700 text-xs font-bold flex items-center px-2">
                                <Trash2 size={16} className="mr-1" /> Delete Record
                            </button>
                        ) : <div></div>}

                        <button type="submit" className="bg-[#8EBF45] text-[#0D0D0D] px-8 py-2.5 rounded-lg hover:bg-[#658C3E] hover:text-white transition-all font-black uppercase tracking-widest text-xs shadow-lg active:scale-95">
                            {editingGood ? 'Update Record' : 'Save Record'}
                        </button>
                    </div>
                </form>
            </Modal>
            {/* Add Company Modal with Iframe */}
            {isAddCompanyModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 text-left">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-lg font-bold text-slate-800">Add New Company Profile</h2>
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

export default ReceivedGoods;
