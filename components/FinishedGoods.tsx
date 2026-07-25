
import React, { useState, useEffect, useRef } from 'react';
import type { FinishedGood, Recipe, ReceivedGood, RepairItem, CompanyProfile, ExtractedInvoice, UnitMetadata, TestResult, DeliveryHistoryEntry } from '../types';
import { EMPTY_INVOICE } from '../types';
import Modal from './Modal';
import { SpannerIcon } from './icons/SpannerIcon';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TruckIcon } from './icons/TruckIcon';
import { QrCodeIcon } from './icons/QrCodeIcon';
import { generateBatchId, generateUnitIds, getUnitSerialsMap, getSerialParentGoodId, normalizeUnitId } from '../utils';
import { Printer, RotateCcw, CheckCircle } from './invoices/Icons';
import ProductLabel from './ProductLabel';

interface FinishedGoodsProps {
    finishedGoods: FinishedGood[];
    setFinishedGoods: React.Dispatch<React.SetStateAction<FinishedGood[]>>;
    recipes: Recipe[];
    receivedGoods: ReceivedGood[];
    setReceivedGoods?: React.Dispatch<React.SetStateAction<ReceivedGood[]>>;
    setRepairItems: React.Dispatch<React.SetStateAction<RepairItem[]>>;
    addLogEntry: (action: string, details: string) => void;
    companyProfiles: CompanyProfile[];
    setView?: (view: any) => void;
    setInvoiceDraft?: (draft: ExtractedInvoice) => void;
    testResults?: TestResult[];
}

type FilterStatus = 'all' | 'ready' | 'delivered' | 'dismantled';

const FinishedGoods: React.FC<FinishedGoodsProps> = ({ finishedGoods, setFinishedGoods, recipes, receivedGoods, setReceivedGoods, setRepairItems, addLogEntry, companyProfiles, setView, setInvoiceDraft, testResults = [] }) => {
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [invoiceSelection, setInvoiceSelection] = useState<Record<string, string[]>>({});

    const [selectedGood, setSelectedGood] = useState<FinishedGood | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState<string>('');
    const [currentSpec, setCurrentSpec] = useState<UnitMetadata>({});

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('ready');
    const [typeFilter, setTypeFilter] = useState<'all' | 'Battery' | 'Solar Panel' | 'Inverter' | 'Other'>('all');

    // Bulk Print State
    const [bulkLabels, setBulkLabels] = useState<any[]>([]);
    const bulkPrintRef = useRef<HTMLDivElement>(null);

    const getRecipeName = (id: string) => {
        const found = recipes.find(r => r.id === id);
        if (found) return found.name;
        if (id && !id.startsWith('recipe-')) return id;
        return `Archived SKU (${id ? id.slice(-6) : 'Unknown'})`;
    };
    const getGoodName = (id: string) => receivedGoods.find(g => g.id === id)?.name || 'Unknown Item';
    const getGoodMakeModel = (id: string) => receivedGoods.find(g => g.id === id)?.makeModel || '';

    // Extract label data logic
    const getLabelData = (good: FinishedGood, unitId: string) => {
        const meta = good.unitMetadata?.[unitId] || {};
        const recipeName = getRecipeName(good.recipeId);
        const date = new Date(good.timestamp).toLocaleDateString('en-GB'); // DD/MM/YYYY
        const energy = (meta.voltage && meta.capacity)
            ? Math.ceil(meta.voltage * meta.capacity) + ' Wh'
            : '-';

        return {
            itemType: meta.itemType || 'Battery',
            productName: recipeName,
            voltage: meta.voltage ? `${meta.voltage} V` : '-',
            capacity: meta.capacity ? `${meta.capacity} Ah` : '-',
            mfgDate: date,
            balancing: meta.balancing || 'No',
            energy: energy,
            weight: meta.weight ? `${meta.weight} kg` : '-',
            productId: unitId,
            qrCodeUrl: unitId, // Simple string for now, could be a full URL
            email: 'sales@cnergy.co.in',
            
            // DTF Fields
            peakPower: meta.peakPower ? `${meta.peakPower} Wp` : undefined,
            vmp: meta.vmp ? `${meta.vmp}` : undefined,
            imp: meta.imp ? `${meta.imp}` : undefined,
            dcrType: meta.dcrType,
            ratedPower: meta.ratedPower ? `${meta.ratedPower} KVA` : undefined,
            inputVoltage: meta.inputVoltage ? `${meta.inputVoltage}` : undefined,
            outputVoltage: meta.outputVoltage ? `${meta.outputVoltage}` : undefined,
            inverterType: meta.inverterType,
            description: meta.description
        };
    };

    const handleToggleSelect = (id: string) => {
        const newSelected = new Set(selectedBatches);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedBatches(newSelected);
    };

    const handleCreateInvoice = () => {
        if (selectedBatches.size === 0) return alert("Select batches to create an Invoice.");

        const batchesToInvoice = finishedGoods.filter(fg => selectedBatches.has(fg.id));
        const initialSelection: Record<string, string[]> = {};
        let needsSelection = false;

        batchesToInvoice.forEach(fg => {
            const unitIds = generateUnitIds(fg, finishedGoods, recipes);
            const availableUnits = unitIds.filter(id => !fg.dismantledUnitIds?.includes(id) && !fg.unitDeliveries?.[id]);
            initialSelection[fg.id] = availableUnits;
            
            if (availableUnits.length > 1) {
                needsSelection = true;
            }
        });

        if (needsSelection) {
            setInvoiceSelection(initialSelection);
            setIsInvoiceModalOpen(true);
        } else {
            generateInvoiceDraft(initialSelection);
        }
    };

    const generateInvoiceDraft = (selection: Record<string, string[]>) => {
        const batchesToInvoice = finishedGoods.filter(fg => selectedBatches.has(fg.id));

        const draftItems = batchesToInvoice.map(fg => {
            const selectedUnits = selection[fg.id] || [];
            const sellableQty = selectedUnits.length;
            
            let description = getRecipeName(fg.recipeId);
            
            // The DTF should not be in the naming of the finished good in the invoice
            description = description.replace(/\bDTF\s*-?\s*/gi, '').trim();

            if (selectedUnits.length > 0) {
                description += `\nS/N: ${selectedUnits.join(', ')}`;
                
                // Get metadata from the first unit to add specs
                const firstUnitId = selectedUnits[0];
                const meta = fg.unitMetadata?.[firstUnitId];
                if (meta) {
                    const specs: string[] = [];
                    if (meta.itemType === 'Battery') {
                        if (meta.voltage) specs.push(`${meta.voltage}V`);
                        if (meta.capacity) specs.push(`${meta.capacity}Ah`);
                    } else if (meta.itemType === 'Solar Panel') {
                        if (meta.peakPower) specs.push(`${meta.peakPower}Wp`);
                        if (meta.dcrType) specs.push(meta.dcrType);
                    } else if (meta.itemType === 'Inverter') {
                        if (meta.ratedPower) specs.push(`${meta.ratedPower}KVA`);
                        if (meta.inverterType) specs.push(meta.inverterType);
                    } else if (meta.itemType === 'Other') {
                        if (meta.description) specs.push(meta.description);
                    }
                    if (specs.length > 0) {
                        description += `\nSpecs: ${specs.join(', ')}`;
                    }
                }
            }

            return {
                description: description,
                hsn_sac: '',
                quantity: sellableQty,
                unit_price: 0,
                taxable_value: 0,
                cgst_rate: 0, cgst_amount: 0, sgst_rate: 0, sgst_amount: 0, igst_rate: 18, igst_amount: 0,
                total_value: 0
            };
        }).filter(item => item.quantity > 0);

        if (draftItems.length === 0) {
            return alert("No available items selected to invoice.");
        }

        const draft: ExtractedInvoice = {
            ...EMPTY_INVOICE,
            source_type: 'sales',
            document_type: 'generated_invoice',
            items: draftItems,
            receiver_details: EMPTY_INVOICE.receiver_details
        };

        if (setInvoiceDraft && setView) {
            setInvoiceDraft(draft);
            setView('finance_maker');
        }
        setIsInvoiceModalOpen(false);
    };

    const handleBulkPrint = () => {
        if (selectedBatches.size === 0) return alert("Select batches to print labels.");

        const batches = finishedGoods.filter(fg => selectedBatches.has(fg.id));
        const labels: any[] = [];

        batches.forEach(batch => {
            const ids = generateUnitIds(batch, finishedGoods, recipes);
            ids.forEach(id => {
                // Exclude dismantled
                if (batch.dismantledUnitIds?.includes(id)) return;
                labels.push(getLabelData(batch, id));
            });
        });

        if (labels.length === 0) return alert("No active units in selected batches.");

        if (confirm(`Prepare ${labels.length} labels for printing? This might take a few seconds.`)) {
            setBulkLabels(labels);
        }
    };

    // Effect to trigger print when bulkLabels are rendered
    useEffect(() => {
        if (bulkLabels.length > 0 && bulkPrintRef.current) {
            // Allow React to render the hidden labels
            const timer = setTimeout(() => {
                const container = bulkPrintRef.current;
                if (!container) return;

                let htmlContent = '';
                // Gather HTML from rendered components
                bulkLabels.forEach((_, idx) => {
                    const el = document.getElementById(`bulk-lbl-${idx}`);
                    if (el) {
                        // We wrap it in a page-break div
                        htmlContent += `<div class="label-page">${el.innerHTML}</div>`;
                    }
                });

                const printWindow = window.open('', '', 'width=800,height=600');
                if (printWindow) {
                    printWindow.document.write(`
                      <html>
                      <head>
                          <title>Bulk Print ${bulkLabels.length} Labels</title>
                          <style>
                              body { margin: 0; padding: 0; background: #fff; }
                              @media print {
                                  @page { size: 50mm 30mm; margin: 0; }
                                  body { margin: 0; }
                                  .label-page { break-after: page; page-break-after: always; }
                                  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                              }
                              .label-page {
                                  width: 50mm;
                                  height: 30mm;
                                  overflow: hidden;
                                  /* border: 1px solid #eee; for debug visibility onscreen */
                              }
                              svg { width: 100%; height: 100%; display: block; }
                          </style>
                      </head>
                      <body>
                          ${htmlContent}
                          <script>
                              // Allow images to load
                              setTimeout(() => {
                                  window.print();
                                  window.close();
                              }, 1000);
                          </script>
                      </body>
                      </html>
                  `);
                    printWindow.document.close();
                }

                // Reset state
                setBulkLabels([]);
            }, 1000); // 1s delay to ensure QR codes are fully generated in DOM

            return () => clearTimeout(timer);
        }
    }, [bulkLabels]);

    const handleOpenDetails = (good: FinishedGood) => {
        setSelectedGood(good);
        setIsDetailsModalOpen(true);
    };

    const handleOpenSpecEditor = (unitId: string) => {
        if (!selectedGood) return;
        setSelectedUnitId(unitId);
        const existingData = selectedGood.unitMetadata?.[unitId] || {};
        setCurrentSpec(existingData);
        setIsSpecModalOpen(true);
    };

    const handleOpenQRModal = (unitId: string) => {
        setSelectedUnitId(unitId);
        setIsQRModalOpen(true);
    };

    const handleSaveSpec = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGood) return;

        // Generate all unit IDs for this batch to propagate shared values
        const allUnitIds = generateUnitIds(selectedGood, finishedGoods, recipes);
        const newMetadata = { ...selectedGood.unitMetadata };

        allUnitIds.forEach(id => {
            const existing = newMetadata[id] || {};

            if (id === selectedUnitId) {
                // Current unit being edited gets all values from form
                newMetadata[id] = currentSpec;
            } else {
                // Other units get shared values copied, but keep their own resistance
                const newSharedSpec = { ...currentSpec };
                delete newSharedSpec.resistance; // Do not copy resistance
                newMetadata[id] = {
                    ...existing,
                    ...newSharedSpec,
                    resistance: existing.resistance
                };
            }
        });

        const updatedGood = { ...selectedGood, unitMetadata: newMetadata };

        setFinishedGoods(prev => prev.map(g => g.id === selectedGood.id ? updatedGood : g));
        setSelectedGood(updatedGood);

        setIsSpecModalOpen(false);
        addLogEntry('Updated Unit Spec', `Updated specifications for unit: ${selectedUnitId} (Shared values propagated to batch)`);
    };

    const handleSendToRepair = (good: FinishedGood, unitId: string) => {
        if (selectedGood?.inRepairUnitIds?.includes(unitId)) return;
        addLogEntry('Sent to Repair', `Sent unit '${unitId}' of '${getRecipeName(good.recipeId)}' to repair.`);
        const newRepairItem: RepairItem = { id: `repair-${Date.now()}`, finishedGoodId: good.id, recipeId: good.recipeId, unitId: unitId, timestamp: Date.now() };
        setRepairItems(prev => [newRepairItem, ...prev]);
        setFinishedGoods(prev => prev.map(fg => fg.id === good.id ? { ...fg, inRepairUnitIds: [...(fg.inRepairUnitIds || []), unitId] } : fg));
        setSelectedGood(prev => prev ? { ...prev, inRepairUnitIds: [...(prev.inRepairUnitIds || []), unitId] } : null);
    };

    const handleDismantle = (unitId: string) => {
        if (!selectedGood || !setReceivedGoods) {
            console.error("Missing dependencies for dismantle");
            return;
        }

        if (!window.confirm(`DANGER: Are you sure you want to DISMANTLE unit ${unitId}?\n\nThis will:\n1. Mark this unit as VOID/DISMANTLED.\n2. Return its exact original cell serials to Raw Materials stock.\n3. Preserve all original test records and invoice traceability.`)) {
            return;
        }

        const recipe = recipes.find(r => r.id === selectedGood.recipeId);
        if (!recipe) return alert("Error: Recipe not found. Cannot determine ingredients to return.");

        const allUnitIds = generateUnitIds(selectedGood, finishedGoods, recipes);
        const unitSerialsMap = getUnitSerialsMap(selectedGood, unitId, allUnitIds);

        // Group serials to return by their exact parent batch ID
        const serialsToReturnPerBatch: Record<string, string[]> = {};
        for (const rgId in unitSerialsMap) {
            const list = unitSerialsMap[rgId] || [];
            list.forEach(serial => {
                const parentId = getSerialParentGoodId(serial, selectedGood, testResults, receivedGoods) || rgId;
                if (!serialsToReturnPerBatch[parentId]) {
                    serialsToReturnPerBatch[parentId] = [];
                }
                if (!serialsToReturnPerBatch[parentId].includes(serial)) {
                    serialsToReturnPerBatch[parentId].push(serial);
                }
            });
        }

        // Return stock to received_goods (with Auto-Restoration fallback for deleted batches)
        setReceivedGoods(prevGoods => {
            const updatedGoods = [...prevGoods];
            const createdRestoredBatches: ReceivedGood[] = [];

            for (const batchId in serialsToReturnPerBatch) {
                const returningSerials = serialsToReturnPerBatch[batchId];
                if (returningSerials.length === 0) continue;

                const idx = updatedGoods.findIndex(g => g.id === batchId);
                if (idx >= 0) {
                    const rg = updatedGoods[idx];
                    const existingSet = new Set(rg.serials || []);
                    const newSerials = returningSerials.filter(s => !existingSet.has(s));
                    updatedGoods[idx] = {
                        ...rg,
                        serials: [...(rg.serials || []), ...newSerials],
                        quantity: (rg.serials || []).length + newSerials.length
                    };
                } else {
                    // Batch was deleted from raw materials - recreate it automatically!
                    const restoredBatch: ReceivedGood = {
                        id: batchId,
                        name: `Restored Batch (${batchId.substring(0, 12)})`,
                        category: 'Cell',
                        makeModel: 'Restored Component',
                        supplier: 'Restored Inventory',
                        invoiceNumber: 'RESTORED-INV',
                        quantity: returningSerials.length,
                        damagedCount: 0,
                        status: 'ND',
                        timestamp: Date.now(),
                        serials: returningSerials,
                        notes: `Auto-restored batch for serials returning from dismantled unit ${unitId}`
                    };
                    createdRestoredBatches.push(restoredBatch);
                }
            }

            return [...updatedGoods, ...createdRestoredBatches];
        });

        // Clean up Unit Map and consumed serials in FinishedGood
        const currentConsumed = JSON.parse(JSON.stringify(selectedGood.consumedSerials || {}));
        const currentUnitMap = JSON.parse(JSON.stringify(selectedGood.unitComponentMap || {}));

        const normId = normalizeUnitId(unitId);
        delete currentUnitMap[normId];
        delete currentUnitMap[unitId];

        for (const batchId in serialsToReturnPerBatch) {
            const toRemove = new Set(serialsToReturnPerBatch[batchId]);
            if (currentConsumed[batchId] && Array.isArray(currentConsumed[batchId])) {
                currentConsumed[batchId] = currentConsumed[batchId].filter((s: string) => !toRemove.has(s));
            }
        }

        const updatedDismantled = [...(selectedGood.dismantledUnitIds || []), unitId];
        const updatedInRepair = (selectedGood.inRepairUnitIds || []).filter(id => id !== unitId);

        const updatedFinishedGood: FinishedGood = {
            ...selectedGood,
            consumedSerials: currentConsumed,
            unitComponentMap: currentUnitMap,
            inRepairUnitIds: updatedInRepair,
            dismantledUnitIds: updatedDismantled
        };

        setFinishedGoods(prev => prev.map(fg => fg.id === selectedGood.id ? updatedFinishedGood : fg));
        setSelectedGood(updatedFinishedGood);
        addLogEntry("Dismantled Unit", `Dismantled ${unitId}. Serials safely returned to raw material stock with full parent traceability.`);
    };

    const handleReturnDeliveryToFactory = (unitId: string) => {
        if (!selectedGood) return;
        const reason = window.prompt(`Reason for returning unit ${unitId} to factory (e.g., Customer Warranty Servicing, Transit Damage):`, "Customer Warranty Return");
        if (reason === null) return;

        const normId = normalizeUnitId(unitId);
        const customerName = (selectedGood.unitDeliveries || {})[normId] || (selectedGood.unitDeliveries || {})[unitId] || 'Customer';

        const updatedDeliveries = { ...(selectedGood.unitDeliveries || {}) };
        delete updatedDeliveries[normId];
        delete updatedDeliveries[unitId];

        const historyEntry: DeliveryHistoryEntry = {
            unitId: normId,
            customerName,
            deliveredAt: Date.now(),
            returnedAt: Date.now(),
            returnReason: reason,
            operator: 'System'
        };

        const updatedHistory = [...(selectedGood.deliveryHistory || []), historyEntry];

        const updatedFinishedGood: FinishedGood = {
            ...selectedGood,
            unitDeliveries: updatedDeliveries,
            deliveryHistory: updatedHistory
        };

        setFinishedGoods(prev => prev.map(fg => fg.id === selectedGood.id ? updatedFinishedGood : fg));
        setSelectedGood(updatedFinishedGood);
        addLogEntry("Unit Delivery Reversed", `Returned unit ${unitId} from customer ${customerName} to Factory Stock. Reason: ${reason}`);
    };

    const handleDeliverUnit = (unitId: string, companyName: string) => {
        if (!selectedGood || !companyName) return;

        const updatedDeliveries = { ...(selectedGood.unitDeliveries || {}), [unitId]: companyName };

        const updatedFinishedGood = {
            ...selectedGood,
            unitDeliveries: updatedDeliveries
        };

        setFinishedGoods(prev => prev.map(fg => fg.id === selectedGood.id ? updatedFinishedGood : fg));
        setSelectedGood(updatedFinishedGood);
        addLogEntry("Unit Delivered", `Marked unit ${unitId} as delivered to ${companyName}.`);
    };

    const filteredFinishedGoods = finishedGoods.filter(good => {
        // 1. Search Filter
        const lowercasedFilter = searchTerm.toLowerCase();
        const recipeName = getRecipeName(good.recipeId).toLowerCase();
        let matchesSearch = false;

        if (recipeName.includes(lowercasedFilter)) {
            matchesSearch = true;
        } else {
            const unitIds = generateUnitIds(good, finishedGoods, recipes);
            if (unitIds.some(id => id.toLowerCase().includes(lowercasedFilter))) {
                matchesSearch = true;
            }
        }

        if (!matchesSearch) return false;

        // 2. Status Button Filter
        const inRepairCount = good.inRepairUnitIds?.length || 0;
        const dismantledCount = good.dismantledUnitIds?.length || 0;
        const deliveredCount = Object.keys(good.unitDeliveries || {}).length;
        const availableQuantity = Math.max(0, good.quantity - inRepairCount - dismantledCount - deliveredCount);

        if (statusFilter === 'ready' && availableQuantity === 0) return false;
        if (statusFilter === 'delivered' && deliveredCount === 0) return false;
        if (statusFilter === 'dismantled' && dismantledCount === 0) return false;

        // 3. Type Filter
        if (typeFilter !== 'all') {
            const unitIds = generateUnitIds(good, finishedGoods, recipes);
            const firstUnitId = unitIds[0];
            const itemType = firstUnitId && good.unitMetadata?.[firstUnitId]?.itemType ? good.unitMetadata[firstUnitId].itemType : 'Battery';
            if (itemType !== typeFilter) return false;
        }

        return true;
    });

    // Helper to get serials for a specific unit (proportional mapping)
    const getSerialsForUnit = (good: FinishedGood, unitId: string, unitIndex: number) => {
        // 1. Try Explicit Map (New System)
        if (good.unitComponentMap && good.unitComponentMap[unitId]) {
            const mapping = good.unitComponentMap[unitId];
            return Object.entries(mapping).map(([rgId, serials]) => ({
                goodName: getGoodName(rgId),
                makeModel: getGoodMakeModel(rgId),
                serials: serials
            }));
        }

        // 2. Fallback to Calculated (Old System)
        const recipe = recipes.find(r => r.id === good.recipeId);
        if (!recipe || !good.consumedSerials) return [];

        const componentsSerials: { goodName: string, makeModel: string, serials: string[] }[] = [];

        recipe.components.forEach(comp => {
            const allSerialsForComp = (good.consumedSerials || {})[comp.receivedGoodId] || [];
            const start = unitIndex * comp.quantityPerUnit;
            const end = start + comp.quantityPerUnit;
            const unitSerials = allSerialsForComp.slice(start, end);

            if (unitSerials.length > 0) {
                componentsSerials.push({
                    goodName: getGoodName(comp.receivedGoodId),
                    makeModel: getGoodMakeModel(comp.receivedGoodId),
                    serials: unitSerials
                });
            }
        });

        return componentsSerials;
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Finished Goods</h1>
                <div className="flex gap-2">
                    {selectedBatches.size > 0 && (
                        <button onClick={handleBulkPrint} className="flex items-center bg-slate-800 text-white px-4 py-2 rounded-lg shadow-md hover:bg-slate-900 transition-colors text-sm font-black uppercase tracking-wide">
                            <Printer className="mr-2" size={16} /> Print Labels ({selectedBatches.size})
                        </button>
                    )}
                    <button onClick={handleCreateInvoice} className="flex items-center bg-[#8EBF45] text-[#0D0D0D] px-4 py-2 rounded-lg shadow-md hover:bg-[#658C3E] hover:text-white transition-colors text-sm font-black uppercase tracking-wide">
                        <ArrowRightIcon className="mr-2" size={16} /> Create Invoice ({selectedBatches.size})
                    </button>
                </div>
            </div>

            <div className="mb-6 space-y-4">
                {/* Status Filters */}
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setStatusFilter('all')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-all ${statusFilter === 'all' ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setStatusFilter('ready')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-all ${statusFilter === 'ready' ? 'bg-[#8EBF45] text-[#0D0D0D] border-[#8EBF45] shadow-sm font-bold' : 'bg-white text-gray-600 border-gray-300 hover:bg-[#A8BF75]/20'}`}
                    >
                        Ready
                    </button>
                    <button
                        onClick={() => setStatusFilter('delivered')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-all ${statusFilter === 'delivered' ? 'bg-[#658C3E] text-white border-[#658C3E] shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:bg-green-50'}`}
                    >
                        Delivered
                    </button>
                    <button
                        onClick={() => setStatusFilter('dismantled')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-all ${statusFilter === 'dismantled' ? 'bg-gray-500 text-white border-gray-500 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'}`}
                    >
                        Dismantled
                    </button>
                </div>

                <input
                    type="text"
                    placeholder="Search by Product Name or Unit ID..."
                    className="block w-full p-3 pl-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#8EBF45] transition-shadow"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />

                {/* Type Filters */}
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setTypeFilter('all')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all ${typeFilter === 'all' ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                    >
                        All Types
                    </button>
                    <button
                        onClick={() => setTypeFilter('Battery')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all ${typeFilter === 'Battery' ? 'bg-[#8EBF45] text-[#0D0D0D] border-[#8EBF45] shadow-sm font-bold' : 'bg-white text-gray-600 border-gray-300 hover:bg-[#A8BF75]/20'}`}
                    >
                        Batteries
                    </button>
                    <button
                        onClick={() => setTypeFilter('Solar Panel')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all ${typeFilter === 'Solar Panel' ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:bg-indigo-50'}`}
                    >
                        Solar Panels
                    </button>
                    <button
                        onClick={() => setTypeFilter('Inverter')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all ${typeFilter === 'Inverter' ? 'bg-blue-500 text-white border-blue-500 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50'}`}
                    >
                        Inverters
                    </button>
                    <button
                        onClick={() => setTypeFilter('Other')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all ${typeFilter === 'Other' ? 'bg-purple-500 text-white border-purple-500 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:bg-purple-50'}`}
                    >
                        Other
                    </button>
                </div>
            </div>

            {/* Finished Goods Table View */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-4 border-b w-10">
                                    {/* Select all could go here if needed */}
                                </th>
                                <th className="p-4 border-b font-semibold text-gray-600">Date</th>
                                <th className="p-4 border-b font-semibold text-gray-600">Product Name</th>
                                <th className="p-4 border-b font-semibold text-gray-600 text-right">Available Qty</th>
                                <th className="p-4 border-b font-semibold text-gray-600">Status</th>
                                <th className="p-4 border-b font-semibold text-gray-600">Batch / First Unit</th>
                                <th className="p-4 border-b font-semibold text-gray-600 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredFinishedGoods.map(good => {
                                const unitIds = generateUnitIds(good, finishedGoods, recipes);
                                const inRepairCount = good.inRepairUnitIds?.length || 0;
                                const dismantledCount = good.dismantledUnitIds?.length || 0;
                                const deliveredCount = Object.keys(good.unitDeliveries || {}).length;
                                const availableQuantity = Math.max(0, good.quantity - inRepairCount - dismantledCount - deliveredCount);
                                const isSelected = selectedBatches.has(good.id);
                                const uniqueRecipients = Array.from(new Set(Object.values(good.unitDeliveries || {})));

                                return (
                                    <tr key={good.id} className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-[#8EBF45]/20' : (good.isDTF ? 'bg-indigo-50/50 border-l-4 border-indigo-400' : '')}`}>
                                        <td className="p-4">
                                            <input type="checkbox" checked={isSelected} onChange={() => handleToggleSelect(good.id)} className="w-5 h-5 text-[#658C3E] rounded border-gray-300 focus:ring-[#8EBF45]" />
                                        </td>
                                        <td className="p-4 text-sm text-gray-500 whitespace-nowrap">
                                            {new Date(good.timestamp).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 font-bold text-gray-900">
                                            {getRecipeName(good.recipeId)}
                                            {good.isDTF && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">DTF</span>}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="font-bold text-lg text-[#658C3E]">{availableQuantity}</span>
                                                <span className="text-[10px] text-gray-400">Total Produced: {good.quantity}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                {deliveredCount > 0 && (
                                                    <div className="flex flex-col items-start gap-0.5">
                                                        <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-bold w-fit">{deliveredCount} delivered</span>
                                                        {uniqueRecipients.length > 0 && (
                                                            <span className="text-[10px] text-gray-500 font-medium truncate max-w-[150px] pl-1" title={uniqueRecipients.join(', ')}>
                                                                To: {uniqueRecipients.join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {inRepairCount > 0 && <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-bold w-fit">{inRepairCount} in repair</span>}
                                                {dismantledCount > 0 && <span className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full font-bold w-fit">{dismantledCount} dismantled</span>}
                                                {inRepairCount === 0 && dismantledCount === 0 && deliveredCount === 0 && <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold w-fit">Ready</span>}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded truncate block max-w-[150px]">
                                                {unitIds[0] || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button onClick={() => handleOpenDetails(good)} className="text-[#658C3E] text-sm font-semibold hover:underline bg-[#A8BF75]/20 px-3 py-1.5 rounded-lg whitespace-nowrap">
                                                View All Units
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredFinishedGoods.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-500 italic">
                                        No finished goods batches matching the filter found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Hidden Container for Bulk Printing */}
            <div style={{ display: 'none' }} ref={bulkPrintRef}>
                {bulkLabels.map((data, i) => (
                    <ProductLabel key={i} data={data} id={`bulk-lbl-${i}`} />
                ))}
            </div>

            {/* Details Modal */}
            {selectedGood && (
                <Modal isOpen={isDetailsModalOpen} onClose={() => setIsDetailsModalOpen(false)} title={`Details: ${getRecipeName(selectedGood.recipeId)}`} size="xl">
                    <div className="space-y-4">
                        {/* Datalist for Company Search */}
                        <datalist id="company-profiles-list">
                            {companyProfiles.map(cp => <option key={cp.id} value={cp.name} />)}
                        </datalist>

                        <div className="flex justify-between items-end border-b pb-2 mt-4">
                            <h3 className="font-bold text-gray-800">Unit List</h3>
                            <p className="text-xs text-gray-500">Produced: {selectedGood.quantity} | Active: {selectedGood.quantity - (selectedGood.dismantledUnitIds?.length || 0)}</p>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto bg-gray-50 p-2 rounded border">
                            {generateUnitIds(selectedGood, finishedGoods, recipes).map((id, index) => {
                                const meta = selectedGood.unitMetadata?.[id];
                                const energy = (meta?.voltage && meta?.capacity) ? Math.ceil(meta.voltage * meta.capacity) + ' Wh' : '';
                                const isDismantled = selectedGood.dismantledUnitIds?.includes(id);
                                const isInRepair = selectedGood.inRepairUnitIds?.includes(id);
                                const deliveredTo = selectedGood.unitDeliveries?.[id];
                                const unitSerials = getSerialsForUnit(selectedGood, id, index);

                                if (isDismantled) {
                                    return (
                                        <div key={id} className="flex justify-between items-center p-3 bg-gray-200 mb-2 rounded border border-gray-300 gap-2 opacity-75">
                                            <div>
                                                <span className="font-mono text-sm font-bold block text-gray-500 line-through">{id}</span>
                                                <span className="text-xs text-red-700 font-bold">DISMANTLED / VOID</span>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={id} className="flex flex-col p-3 bg-white mb-2 rounded border border-gray-200 gap-3 hover:bg-blue-50 transition-colors">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center w-full">
                                            <div>
                                                <span className="font-mono text-sm font-bold block text-slate-800">{id}</span>
                                                {meta && (
                                                    <div className="text-xs text-gray-500 flex flex-wrap gap-2 mt-1">
                                                        <span className="bg-gray-100 text-gray-700 px-1.5 rounded font-medium border border-gray-200">
                                                            {meta.itemType || 'Battery'}
                                                        </span>
                                                        {(!meta.itemType || meta.itemType === 'Battery') && (
                                                            <>
                                                                {meta.chemistry && <span className="bg-blue-100 text-blue-700 px-1.5 rounded">{meta.chemistry}</span>}
                                                                {energy && <span>{energy}</span>}
                                                            </>
                                                        )}
                                                        {meta.itemType === 'Solar Panel' && (
                                                            <>
                                                                {meta.peakPower && <span className="bg-orange-100 text-orange-700 px-1.5 rounded">{meta.peakPower}W</span>}
                                                                {meta.dcrType && <span className="bg-yellow-100 text-yellow-700 px-1.5 rounded">{meta.dcrType}</span>}
                                                            </>
                                                        )}
                                                        {meta.itemType === 'Inverter' && (
                                                            <>
                                                                {meta.ratedPower && <span className="bg-purple-100 text-purple-700 px-1.5 rounded">{meta.ratedPower}kW</span>}
                                                                {meta.inverterType && <span className="bg-indigo-100 text-indigo-700 px-1.5 rounded">{meta.inverterType}</span>}
                                                            </>
                                                        )}
                                                        {meta.itemType === 'Other' && meta.description && (
                                                            <span className="italic truncate max-w-xs">{meta.description}</span>
                                                        )}
                                                        {meta.weight && <span>{meta.weight}kg</span>}
                                                    </div>
                                                )}
                                                {deliveredTo && (
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <div className="flex items-center text-xs text-green-700 font-semibold bg-green-50 border border-green-200 px-2 py-0.5 rounded w-fit">
                                                            <TruckIcon className="w-3 h-3 mr-1" /> Delivered to {deliveredTo}
                                                        </div>
                                                        <button
                                                            onClick={() => handleReturnDeliveryToFactory(id)}
                                                            className="text-xs bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 px-2 py-0.5 rounded flex items-center font-bold transition-colors"
                                                            title="Return unit to factory stock (Customer RMA)"
                                                        >
                                                            <RotateCcw className="w-3 h-3 mr-1" /> Return to Factory
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-2 items-center mt-2 md:mt-0 justify-end">
                                                {/* Deliver To Input with Native Datalist for Search */}
                                                {!deliveredTo && !isInRepair && (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            list="company-profiles-list"
                                                            className="text-xs border border-gray-300 rounded-l px-2 py-1.5 bg-white hover:border-[#8EBF45] focus:border-[#8EBF45] focus:ring-1 focus:ring-[#8EBF45]/20 outline-none w-32"
                                                            placeholder="Deliver to..."
                                                            id={`delivery-input-${id}`}
                                                        />
                                                        <button
                                                            className="bg-[#8EBF45] text-[#0D0D0D] p-1.5 rounded-r hover:bg-[#658C3E] hover:text-white transition-colors"
                                                            title="Confirm Delivery"
                                                            onClick={() => {
                                                                const inputEl = document.getElementById(`delivery-input-${id}`) as HTMLInputElement;
                                                                if (inputEl && inputEl.value) handleDeliverUnit(id, inputEl.value);
                                                            }}
                                                        >
                                                            <ArrowRightIcon className="w-3 h-3 m-0" size={12} />
                                                        </button>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => handleOpenQRModal(id)}
                                                    className="px-2 py-1.5 bg-white border border-[#A8BF75] text-[#658C3E] hover:bg-[#A8BF75]/10 rounded flex items-center gap-1 text-xs font-bold"
                                                    title="Generate Label"
                                                >
                                                    <Printer size={14} /> Label
                                                </button>

                                                <button
                                                    onClick={() => handleOpenSpecEditor(id)}
                                                    className="flex items-center text-xs bg-white border border-[#A8BF75] text-[#658C3E] hover:bg-[#A8BF75]/10 px-3 py-1.5 rounded transition-colors font-bold"
                                                >
                                                    <PencilIcon className="h-3 w-3 mr-1" /> Specs
                                                </button>

                                                {!isInRepair && (
                                                    <button onClick={() => handleSendToRepair(selectedGood, id)} className="text-xs text-red-600 hover:bg-red-50 px-3 py-1.5 rounded border border-red-200 flex items-center font-medium">
                                                        <SpannerIcon className="h-3 w-3 mr-1" /> Repair
                                                    </button>
                                                )}
                                                {isInRepair && <span className="text-xs font-bold text-red-600 self-center px-2 border border-red-200 bg-red-50 rounded">REPAIRING</span>}

                                                {!deliveredTo && (
                                                    <button
                                                        onClick={() => handleDismantle(id)}
                                                        className="text-xs text-orange-600 hover:bg-orange-50 px-2 py-1.5 rounded border border-orange-200 flex items-center ml-2 font-medium"
                                                        title="Dismantle & Return ingredients to stock"
                                                    >
                                                        <RotateCcw className="h-3 w-3 mr-1" /> Dismantle
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Component Serial Numbers per Unit */}
                                        <div className="bg-slate-50 p-2 rounded border text-[10px] space-y-1">
                                            <p className="font-bold text-slate-400 uppercase tracking-tight">Component Serials</p>
                                            {unitSerials.map((us, idx) => (
                                                <div key={idx}>
                                                    <span className="font-semibold text-slate-700">{us.goodName}:</span>
                                                    <span className="text-slate-600 ml-1 italic">{us.serials.join(', ') || 'None'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Modal>
            )}

            {/* Unit Specs Modal */}
            <Modal isOpen={isSpecModalOpen} onClose={() => setIsSpecModalOpen(false)} title={`Unit Specifications: ${selectedUnitId}`} size="md">
                <form onSubmit={handleSaveSpec} className="space-y-4">
                    <div className="mb-4">
                        <label className="block text-sm font-bold text-gray-700">Item Type</label>
                        <select
                            className="mt-1 block w-full border border-[#8EBF45] rounded-md shadow-sm p-2 text-sm bg-gray-50 font-semibold"
                            value={currentSpec.itemType || 'Battery'}
                            onChange={e => setCurrentSpec({ ...currentSpec, itemType: e.target.value as any })}
                        >
                            <option value="Battery">Battery</option>
                            <option value="Solar Panel">Solar Panel</option>
                            <option value="Inverter">Inverter</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {/* Conditional Fields based on itemType */}
                    {(!currentSpec.itemType || currentSpec.itemType === 'Battery') && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Chemistry</label>
                                    <select
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm bg-white"
                                        value={currentSpec.chemistry || 'LFP'}
                                        onChange={e => setCurrentSpec({ ...currentSpec, chemistry: e.target.value as any })}
                                    >
                                        <option value="LFP">LFP</option>
                                        <option value="NMC">NMC</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Balancing</label>
                                    <select
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm bg-white"
                                        value={currentSpec.balancing || 'No'}
                                        onChange={e => setCurrentSpec({ ...currentSpec, balancing: e.target.value as any })}
                                    >
                                        <option value="No">No</option>
                                        <option value="Yes(passive)">Yes (Passive)</option>
                                        <option value="Yes(active)">Yes (Active)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Voltage (V)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={currentSpec.voltage || ''}
                                        onChange={e => setCurrentSpec({ ...currentSpec, voltage: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Capacity (Ah)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={currentSpec.capacity || ''}
                                        onChange={e => setCurrentSpec({ ...currentSpec, capacity: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Resistance (mΩ)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={currentSpec.resistance || ''}
                                        onChange={e => setCurrentSpec({ ...currentSpec, resistance: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Weight (kg)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={currentSpec.weight || ''}
                                        onChange={e => setCurrentSpec({ ...currentSpec, weight: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {currentSpec.itemType === 'Solar Panel' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Peak Power (Wp)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={currentSpec.peakPower || ''}
                                        onChange={e => setCurrentSpec({ ...currentSpec, peakPower: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Type</label>
                                    <select
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm bg-white"
                                        value={currentSpec.dcrType || 'Non DCR'}
                                        onChange={e => setCurrentSpec({ ...currentSpec, dcrType: e.target.value as any })}
                                    >
                                        <option value="DCR">DCR</option>
                                        <option value="Non DCR">Non DCR</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Vmp (V)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={currentSpec.vmp || ''}
                                        onChange={e => setCurrentSpec({ ...currentSpec, vmp: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Imp (A)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={currentSpec.imp || ''}
                                        onChange={e => setCurrentSpec({ ...currentSpec, imp: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {currentSpec.itemType === 'Inverter' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Rated Power (KVA)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={currentSpec.ratedPower || ''}
                                        onChange={e => setCurrentSpec({ ...currentSpec, ratedPower: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Inverter Type</label>
                                    <select
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm bg-white"
                                        value={currentSpec.inverterType || 'Non Solar'}
                                        onChange={e => setCurrentSpec({ ...currentSpec, inverterType: e.target.value as any })}
                                    >
                                        <option value="Solar PWM">Solar PWM</option>
                                        <option value="Solar MPPT">Solar MPPT</option>
                                        <option value="Non Solar">Non Solar</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Battery Voltage (V)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={currentSpec.outputVoltage || ''}
                                        onChange={e => setCurrentSpec({ ...currentSpec, outputVoltage: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div></div>
                            </div>
                        </>
                    )}

                    {currentSpec.itemType === 'Other' && (
                        <>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700">Description / Specs</label>
                                <input
                                    type="text"
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                    value={currentSpec.description || ''}
                                    onChange={e => setCurrentSpec({ ...currentSpec, description: e.target.value })}
                                    placeholder="Enter specifications..."
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700">Weight (kg)</label>
                                <input
                                    type="number" step="0.01"
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                    value={currentSpec.weight || ''}
                                    onChange={e => setCurrentSpec({ ...currentSpec, weight: parseFloat(e.target.value) })}
                                />
                            </div>
                        </>
                    )}

                    <div className="bg-gray-100 p-3 rounded-md text-center">
                        <p className="text-xs text-gray-500 uppercase font-bold">Total Energy</p>
                        <p className="text-xl font-mono font-bold text-[#658C3E]">
                            {(currentSpec.voltage && currentSpec.capacity)
                                ? (currentSpec.voltage * currentSpec.capacity).toFixed(1)
                                : '0.0'} <span className="text-sm text-gray-500">Wh</span>
                        </p>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button type="submit" className="bg-[#8EBF45] text-[#0D0D0D] px-4 py-2 rounded-lg hover:bg-[#658C3E] hover:text-white text-sm font-bold uppercase tracking-wide">Save & Copy to All</button>
                    </div>
                </form>
            </Modal>

            {/* Label Preview Modal */}
            {selectedGood && (
                <Modal isOpen={isQRModalOpen} onClose={() => setIsQRModalOpen(false)} title="Product Label Preview" size="lg">
                    <div className="flex flex-col items-center gap-4 py-4 bg-slate-50 rounded-lg">
                        <p className="text-xs text-gray-500 text-center max-w-sm mb-2">
                            Verify the specifications before printing. The label uses a 50mm x 30mm template.
                        </p>

                        {/* Product Label Component */}
                        <ProductLabel data={getLabelData(selectedGood, selectedUnitId)} />

                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => setIsQRModalOpen(false)}
                                className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-medium shadow-sm"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
            {/* Invoice Serial Selection Modal */}
            <Modal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} title="Select Serials for Invoice" size="md">
                <div className="space-y-6">
                    <p className="text-sm text-gray-500">Please select the specific serial numbers (Unit IDs) you wish to include in this invoice.</p>
                    
                    <div className="max-h-[60vh] overflow-y-auto space-y-4">
                        {finishedGoods.filter(fg => selectedBatches.has(fg.id)).map(fg => {
                            const unitIds = generateUnitIds(fg, finishedGoods, recipes);
                            const availableUnits = unitIds.filter(id => !fg.dismantledUnitIds?.includes(id) && !fg.unitDeliveries?.[id]);
                            
                            if (availableUnits.length === 0) return null;

                            return (
                                <div key={fg.id} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                    <h4 className="font-bold text-gray-800 mb-2">{getRecipeName(fg.recipeId)}</h4>
                                    <div className="space-y-2">
                                        {availableUnits.map(unitId => (
                                            <label key={unitId} className="flex items-center gap-3 p-2 hover:bg-white rounded border border-transparent hover:border-gray-200 cursor-pointer transition-colors">
                                                <input 
                                                    type="checkbox" 
                                                    checked={(invoiceSelection[fg.id] || []).includes(unitId)}
                                                    onChange={(e) => {
                                                        setInvoiceSelection(prev => {
                                                            const current = prev[fg.id] || [];
                                                            return {
                                                                ...prev,
                                                                [fg.id]: e.target.checked 
                                                                    ? [...current, unitId] 
                                                                    : current.filter(id => id !== unitId)
                                                            };
                                                        });
                                                    }}
                                                    className="w-4 h-4 text-[#8EBF45] rounded border-gray-300 focus:ring-[#8EBF45]"
                                                />
                                                <span className="font-mono text-sm text-gray-700">{unitId}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button 
                            onClick={() => setIsInvoiceModalOpen(false)}
                            className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => generateInvoiceDraft(invoiceSelection)}
                            className="px-6 py-2 bg-[#8EBF45] text-[#0D0D0D] font-bold rounded-lg hover:bg-[#658C3E] hover:text-white transition-colors"
                        >
                            Confirm & Generate Invoice
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default FinishedGoods;
