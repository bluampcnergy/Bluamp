
import React, { useState, useMemo } from 'react';
import type { ReceivedGood, WIPItem, FinishedGood, Recipe, RepairItem, TestResult, StorageRoom, StorageUnit, StorageItem } from '../types';
import { SearchIcon } from './icons/SearchIcon';
import { CubeIcon } from './icons/CubeIcon';
import { BeakerIcon } from './icons/BeakerIcon';
import { TruckIcon } from './icons/TruckIcon';
import { SpannerIcon } from './icons/SpannerIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { RefreshCw, ChevronDown, ChevronUp, Package, FileText } from './invoices/Icons'; // Added Chevron icons
import { generateBatchId, generateUnitIds } from '../utils';

interface MasterDataProps {
    receivedGoods: ReceivedGood[];
    wipItems: WIPItem[];
    finishedGoods: FinishedGood[];
    recipes: Recipe[];
    setRecipes?: React.Dispatch<React.SetStateAction<Recipe[]>>;
    repairItems: RepairItem[];
    testResults: TestResult[];
    rooms: StorageRoom[];
    storageUnits: StorageUnit[];
    storageItems: StorageItem[];
}

interface LifecycleChain {
    id: string;
    type: 'finished' | 'wip' | 'raw' | 'storage';
    title: string;
    subTitle: string;
    rawMaterials: {
        good: ReceivedGood;
        serials: string[];
        testResults?: TestResult[];
    }[];
    wipItem?: WIPItem;
    finishedGood?: FinishedGood;
    storageLocation?: string;
    storageQuantity?: number;
    primaryTimestamp: number;
    status: string;
    specificUnitId?: string;
    specificDelivery?: string;
    specificRepairHistory?: string[];
    specificDismantled?: boolean;
}

const MasterData: React.FC<MasterDataProps> = ({
    receivedGoods, wipItems, finishedGoods, recipes, setRecipes, repairItems, testResults, rooms, storageUnits, storageItems
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const getRecipeName = (id: string) => {
        const found = recipes.find(r => r.id === id);
        if (found) return found.name;
        if (id && !id.startsWith('recipe-')) return id;
        return `Archived SKU (${id ? id.slice(-6) : 'Unknown'})`;
    };
    const getRoomName = (id: string) => rooms.find(r => r.id === id)?.name || 'Unknown Room';

    // --- SKU Migration Utility ---
    const handleMigrateRecipes = () => {
        if (!setRecipes) return;
        if (!confirm("This will scan recipes using old Batch IDs and link them to Master Item Names for future production. Proceed?")) return;

        setRecipes(prev => prev.map(recipe => {
            const updatedComponents = recipe.components.map(comp => {
                if (comp.masterItemName) return comp; // Already migrated

                if (comp.receivedGoodId) {
                    const matchingGood = receivedGoods.find(g => g.id === comp.receivedGoodId);
                    if (matchingGood) {
                        return { ...comp, masterItemName: matchingGood.name };
                    }
                }
                return comp;
            });
            return { ...recipe, components: updatedComponents };
        }));

        alert("Recipe Migration Complete. All recipes are now name-linked.");
    };

    const searchResults = useMemo(() => {
        if (!searchTerm || searchTerm.length < 2) return [];
        const term = searchTerm.toLowerCase();
        const chains: LifecycleChain[] = [];

        // 1. Search Storage
        storageItems.forEach(item => {
            const unit = storageUnits.find(u => u.id === item.unitId);
            const itemName = item.name || '';
            if (itemName.toLowerCase().includes(term) || (item.description || '').toLowerCase().includes(term)) {
                const locationStr = `${getRoomName(unit?.roomId || '')} > ${unit?.name} > Section ${item.sectionIndex}`;
                chains.push({
                    id: `store-${item.id}`,
                    type: 'storage',
                    title: item.name,
                    subTitle: locationStr,
                    rawMaterials: [],
                    primaryTimestamp: item.timestamp,
                    status: 'In Rack',
                    storageLocation: locationStr,
                    storageQuantity: item.quantity
                });
            }
        });

        // 2. Search Finished Goods (Batches & Units)
        finishedGoods.forEach(fg => {
            const recipeName = getRecipeName(fg.recipeId).toLowerCase();
            const batchId = generateBatchId(fg, finishedGoods, recipes);
            const unitIds = generateUnitIds(fg, finishedGoods, recipes);
            const matchedUnitIds = unitIds.filter(uid => uid.toLowerCase().includes(term));
            const isBatchMatch = batchId.toLowerCase().includes(term) || recipeName.includes(term);

            let isInputSerialMatch = false;
            // Check if search term matches any serial number inside this finished good
            if (fg.consumedSerials) {
                for (const key in fg.consumedSerials) {
                    const serials = fg.consumedSerials[key] as string[];
                    if (serials && Array.isArray(serials) && serials.some((s: string) => s.toLowerCase().includes(term))) {
                        isInputSerialMatch = true;
                        break;
                    }
                }
            }

            // Helper to build Raw Material Data
            const buildRawMaterialsList = () => {
                const list: LifecycleChain['rawMaterials'] = [];
                if (fg.consumedSerials) {
                    Object.entries(fg.consumedSerials).forEach(([goodId, serials]) => {
                        const good = receivedGoods.find(g => g.id === goodId);
                        if (good) {
                            // Attach relevant test results for cells
                            const relevantResults = testResults.filter(tr => tr.receivedGoodId === good.id && (serials as string[]).includes(tr.serialNumber));
                            list.push({ good, serials: serials as string[], testResults: relevantResults });
                        }
                    });
                }
                return list;
            };

            if (matchedUnitIds.length > 0) {
                matchedUnitIds.forEach(unitId => {
                    const repairHistory = repairItems.filter(r => r.unitId === unitId).map(r => new Date(r.timestamp).toLocaleDateString());

                    chains.push({
                        id: `${fg.id}-${unitId}`,
                        type: 'finished',
                        title: `Unit: ${unitId}`,
                        subTitle: `Product: ${getRecipeName(fg.recipeId)}`,
                        finishedGood: fg,
                        rawMaterials: buildRawMaterialsList(),
                        primaryTimestamp: fg.timestamp,
                        status: fg.unitDeliveries?.[unitId] ? 'Delivered' : fg.inRepairUnitIds?.includes(unitId) ? 'Repair' : 'In Stock',
                        specificUnitId: unitId,
                        specificDelivery: fg.unitDeliveries?.[unitId],
                        specificRepairHistory: repairHistory,
                        specificDismantled: fg.dismantledUnitIds?.includes(unitId)
                    });
                });
            } else if (isBatchMatch || isInputSerialMatch) {
                chains.push({
                    id: fg.id,
                    type: 'finished',
                    title: getRecipeName(fg.recipeId),
                    subTitle: `Batch: ${batchId}`,
                    finishedGood: fg,
                    rawMaterials: buildRawMaterialsList(),
                    primaryTimestamp: fg.timestamp,
                    status: 'Batch'
                });
            }
        });

        // 3. Search WIP
        wipItems.forEach(wip => {
            const recipeName = getRecipeName(wip.recipeId).toLowerCase();

            // Use reduce instead of flat() to ensure type safety and compatibility
            const allSerials: string[] = wip.consumedSerials
                ? Object.values(wip.consumedSerials).reduce<string[]>((acc, val: any) => acc.concat(Array.isArray(val) ? val : []), [])
                : [];

            if (recipeName.includes(term) || (allSerials as string[]).some((s: string) => s.toLowerCase().includes(term))) {
                const rawMaterialsList: LifecycleChain['rawMaterials'] = [];
                if (wip.consumedSerials) {
                    Object.entries(wip.consumedSerials).forEach(([goodId, serials]) => {
                        const good = receivedGoods.find(g => g.id === goodId);
                        if (good) rawMaterialsList.push({ good, serials: serials as string[] });
                    });
                }
                chains.push({ id: wip.id, type: 'wip', title: getRecipeName(wip.recipeId), subTitle: 'WIP', wipItem: wip, rawMaterials: rawMaterialsList, primaryTimestamp: wip.timestamp, status: 'Production' });
            }
        });

        // 4. Search Raw Materials
        receivedGoods.forEach(good => {
            if (good.name.toLowerCase().includes(term) || good.serials.some(s => s.toLowerCase().includes(term)) || (good.invoiceNumber || '').toLowerCase().includes(term)) {
                const relevantSerials = good.serials.filter(s => s.toLowerCase().includes(term));
                const relevantResults = testResults.filter(tr => tr.receivedGoodId === good.id && relevantSerials.includes(tr.serialNumber));

                chains.push({
                    id: good.id,
                    type: 'raw',
                    title: good.name,
                    subTitle: good.supplier,
                    rawMaterials: [{ good, serials: relevantSerials, testResults: relevantResults }],
                    primaryTimestamp: good.timestamp,
                    status: 'Inventory'
                });
            }
        });

        return chains.sort((a, b) => b.primaryTimestamp - a.primaryTimestamp);
    }, [searchTerm, receivedGoods, wipItems, finishedGoods, recipes, storageItems, storageUnits, rooms, testResults]);

    const toggleExpand = (id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    };

    // --- Render Helpers ---

    const renderRawDetails = (chain: LifecycleChain) => (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded border border-slate-100">
                {chain.rawMaterials.map((rm, i) => (
                    <React.Fragment key={i}>
                        <div><span className="font-bold text-slate-500">Category:</span> {rm.good.category}</div>
                        <div><span className="font-bold text-slate-500">Make/Model:</span> {rm.good.makeModel}</div>
                        <div><span className="font-bold text-slate-500">Invoice:</span> {rm.good.invoiceNumber}</div>
                        <div><span className="font-bold text-slate-500">Total Qty:</span> {rm.good.quantity}</div>
                    </React.Fragment>
                ))}
            </div>

            {chain.rawMaterials.some(rm => rm.serials.length > 0) && (
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Matched Serials</h4>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                        {chain.rawMaterials.flatMap(rm => rm.serials.map(s => {
                            const tr = testResults.find(t => t.receivedGoodId === rm.good.id && t.serialNumber === s);
                            return (
                                <span key={s} className={`px-2 py-1 text-xs border rounded flex flex-col ${tr ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <span className="font-mono font-bold">{s}</span>
                                    {tr && <span className="text-[9px] text-slate-500">{tr.voltage}V | {tr.capacity}Ah</span>}
                                </span>
                            );
                        }))}
                    </div>
                </div>
            )}
        </div>
    );

    const renderFinishedDetails = (chain: LifecycleChain) => {
        // UNIT View
        if (chain.specificUnitId && chain.finishedGood) {
            const meta = chain.finishedGood.unitMetadata?.[chain.specificUnitId];
            const energy = (meta?.voltage && meta?.capacity) ? Math.ceil(meta.voltage * meta.capacity) : '-';

            // Get component serials specific to this unit from the new map if available, or fallback to approximate slice
            const unitMap = chain.finishedGood.unitComponentMap?.[chain.specificUnitId];

            return (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-slate-50 p-3 rounded border border-slate-100">
                        <div><span className="block font-bold text-slate-400 uppercase">Voltage</span> <span className="text-base font-mono">{meta?.voltage || '-'} V</span></div>
                        <div><span className="block font-bold text-slate-400 uppercase">Capacity</span> <span className="text-base font-mono">{meta?.capacity || '-'} Ah</span></div>
                        <div><span className="block font-bold text-slate-400 uppercase">Energy</span> <span className="text-base font-mono">{energy} Wh</span></div>
                        <div><span className="block font-bold text-slate-400 uppercase">Weight</span> <span className="text-base font-mono">{meta?.weight || '-'} kg</span></div>
                    </div>

                    {chain.specificDelivery && (
                        <div className="flex items-center gap-2 text-sm bg-green-50 text-green-800 p-2 rounded border border-green-200">
                            <TruckIcon size={16} />
                            Delivered to <strong>{chain.specificDelivery}</strong>
                        </div>
                    )}

                    {chain.specificRepairHistory && chain.specificRepairHistory.length > 0 && (
                        <div className="text-xs bg-red-50 text-red-800 p-2 rounded border border-red-200">
                            <strong>Repair History:</strong> {chain.specificRepairHistory.join(', ')}
                        </div>
                    )}

                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Components in this Unit</h4>
                        <div className="space-y-2">
                            {chain.rawMaterials.map((rm, i) => {
                                // If we have strict mapping, use it. Otherwise show all batch serials (legacy fallback)
                                const specificSerials = unitMap ? (unitMap[rm.good.id] || []) : rm.serials;

                                return (
                                    <div key={i} className="text-xs border p-2 rounded bg-white">
                                        <div className="font-bold text-slate-700">{rm.good.name}</div>
                                        <div className="text-slate-500 font-mono mt-1 break-all">
                                            {specificSerials.length > 0 ? specificSerials.join(', ') : 'No tracked serials'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        // BATCH View
        return (
            <div className="space-y-3">
                <div className="text-sm">
                    <span className="font-bold">Batch Size:</span> {chain.finishedGood?.quantity} Units
                </div>
                <div className="text-sm">
                    <span className="font-bold">Date:</span> {new Date(chain.primaryTimestamp).toLocaleString()}
                </div>
                <div className="bg-slate-50 p-3 rounded text-xs text-slate-600">
                    <strong className="block uppercase text-slate-400 mb-1">Consumed Materials</strong>
                    {chain.rawMaterials.map((rm, i) => (
                        <div key={i} className="flex justify-between border-b border-slate-200 last:border-0 py-1">
                            <span>{rm.good.name}</span>
                            <span className="font-mono">{rm.serials.length} serials</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderStorageDetails = (chain: LifecycleChain) => (
        <div className="text-sm text-slate-600 space-y-2">
            <div className="flex items-center gap-2">
                <CubeIcon className="text-indigo-500" size={16} />
                <span className="font-bold">Location:</span> {chain.storageLocation}
            </div>
            <div>
                <span className="font-bold">Stored Quantity:</span> {chain.storageQuantity}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Traceability Search</h1>
                    <p className="text-gray-500 text-sm">Full lifecycle history by Unit ID, Batch, or Serial Number.</p>
                </div>
                {setRecipes && (
                    <button
                        onClick={handleMigrateRecipes}
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw size={14} /> SKU Migration Script
                    </button>
                )}
            </div>

            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <SearchIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    placeholder="Search Unit ID, Batch, or Serial..."
                    className="block w-full p-4 pl-10 text-lg border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="space-y-4">
                {searchResults.map(chain => {
                    const isExpanded = expandedId === chain.id;

                    return (
                        <div key={chain.id} className={`bg-white rounded-xl shadow-sm border transition-all duration-300 overflow-hidden ${isExpanded ? 'border-blue-300 ring-1 ring-blue-100 shadow-md' : 'border-gray-100'}`}>
                            <div
                                className="p-4 cursor-pointer hover:bg-gray-50 flex justify-between items-center"
                                onClick={() => toggleExpand(chain.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-full ${chain.type === 'finished' ? 'bg-green-100 text-green-600' : chain.type === 'raw' ? 'bg-blue-100 text-blue-600' : chain.type === 'storage' ? 'bg-indigo-100 text-indigo-600' : 'bg-orange-100 text-orange-600'}`}>
                                        {chain.type === 'finished' ? <CheckCircleIcon /> : chain.type === 'raw' ? <BeakerIcon /> : chain.type === 'storage' ? <Package /> : <CubeIcon />}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800">{chain.title}</h3>
                                        <p className="text-sm text-gray-500">{chain.subTitle}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${chain.status === 'Delivered' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
                                        {chain.status}
                                    </span>
                                    {isExpanded ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
                                </div>
                            </div>

                            {/* Expandable Details Section */}
                            {isExpanded && (
                                <div className="p-4 border-t border-gray-100 bg-white animate-fade-in">
                                    {chain.type === 'raw' && renderRawDetails(chain)}
                                    {chain.type === 'finished' && renderFinishedDetails(chain)}
                                    {chain.type === 'storage' && renderStorageDetails(chain)}
                                    {chain.type === 'wip' && (
                                        <div className="text-sm">
                                            <div className="font-bold text-slate-700 mb-2">Components in Production:</div>
                                            {chain.rawMaterials.map((rm, i) => (
                                                <div key={i} className="text-xs text-slate-500 ml-2">• {rm.good.name} (Qty: {rm.serials.length || 'Bulk'})</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {searchTerm && searchResults.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed">
                        <p className="text-gray-400">No records match your query.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MasterData;
