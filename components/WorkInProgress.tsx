
import React, { useState, useMemo, useEffect } from 'react';
import type { WIPItem, ReceivedGood, Recipe, FinishedGood, RepairItem, TestResult, CompanyProfile, UnitMetadata, RepairSwapEntry } from '../types';
import Modal from './Modal';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { RefreshCw, Printer, ChevronUp, ChevronDown } from './invoices/Icons';
import { PencilIcon } from './icons/PencilIcon';
import { SearchIcon } from './icons/SearchIcon';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import { SpannerIcon } from './icons/SpannerIcon';
import { generateUnitIds, getSerialParentGoodId, normalizeUnitId } from '../utils';

// SearchableSelect Component
interface SearchableSelectProps {
    options: { id: string; label: string; subLabel?: string }[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase()) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(search.toLowerCase()))
    );

    const selectedOption = options.find(o => o.id === value);

    return (
        <div className="relative">
            <div
                className="w-full p-2.5 border rounded-md shadow-sm bg-white cursor-pointer flex justify-between items-center text-sm border-slate-300"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={selectedOption ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                    {selectedOption ? selectedOption.label : placeholder || 'Select...'}
                </span>
                <span className="text-slate-400 text-xs">▼</span>
            </div>

            {isOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    <input
                        type="text"
                        className="w-full p-2 border-b border-slate-100 outline-none text-sm sticky top-0 bg-white"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map(opt => (
                            <div
                                key={opt.id}
                                className="p-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
                                onClick={() => {
                                    onChange(opt.id);
                                    setIsOpen(false);
                                    setSearch('');
                                }}
                            >
                                <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                                {opt.subLabel && <div className="text-xs text-slate-500">{opt.subLabel}</div>}
                            </div>
                        ))
                    ) : (
                        <div className="p-2 text-xs text-slate-400 italic text-center">No options found</div>
                    )}
                </div>
            )}
            {isOpen && <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />}
        </div>
    );
};

interface WorkInProgressProps {
    wipItems: WIPItem[];
    setWipItems: React.Dispatch<React.SetStateAction<WIPItem[]>>;
    receivedGoods: ReceivedGood[];
    setReceivedGoods: React.Dispatch<React.SetStateAction<ReceivedGood[]>>;
    recipes: Recipe[];
    setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
    setFinishedGoods: React.Dispatch<React.SetStateAction<FinishedGood[]>>;
    repairItems: RepairItem[];
    setRepairItems: React.Dispatch<React.SetStateAction<RepairItem[]>>;
    finishedGoods: FinishedGood[];
    addLogEntry: (action: string, details: string) => void;
    testResults: TestResult[];
    companyProfiles: CompanyProfile[];
    productionDraft: { receivedGoodId: string; serials: string[] } | null;
    setProductionDraft: React.Dispatch<React.SetStateAction<{ receivedGoodId: string; serials: string[] } | null>>;
    currentUser?: any;
}

const WorkInProgress: React.FC<WorkInProgressProps> = ({ wipItems, setWipItems, receivedGoods, setReceivedGoods, recipes, setRecipes, setFinishedGoods, repairItems, setRepairItems, finishedGoods, addLogEntry, testResults, companyProfiles, productionDraft, setProductionDraft, currentUser }) => {
    // State
    const [isWipModalOpen, setWipModalOpen] = useState(false);
    const [selectedRecipe, setSelectedRecipe] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [consumedSerials, setConsumedSerials] = useState<{ [goodId: string]: string[] }>({});
    const [error, setError] = useState('');

    const [expandedWipId, setExpandedWipId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Replacement State
    const [isReplacementModalOpen, setIsReplacementModalOpen] = useState(false);
    const [replacementTarget, setReplacementTarget] = useState<{ wipItemId: string; goodId: string; damagedSerial: string } | null>(null);
    const [replacementSearchTerm, setReplacementSearchTerm] = useState('');
    const [swapMode, setSwapMode] = useState<'same' | 'category'>('same');

    // Manage Serials State
    const [isManageSerialsModalOpen, setIsManageSerialsModalOpen] = useState(false);
    const [activeWipItem, setActiveWipItem] = useState<WIPItem | null>(null);

    // Recipe Management
    const [isRecipeModalOpen, setRecipeModalOpen] = useState(false);
    const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
    const [newRecipeName, setNewRecipeName] = useState('');
    const [newRecipeComponents, setNewRecipeComponents] = useState<{ masterItemName?: string; receivedGoodId?: string; quantityPerUnit: number }[]>([{ masterItemName: '', quantityPerUnit: 1 }]);

    // Finish Production State
    const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
    const [itemToFinish, setItemToFinish] = useState<WIPItem | null>(null);
    const [finishFormData, setFinishFormData] = useState({ qualityRemarks: '' });

    // Effects
    useEffect(() => {
        if (productionDraft) {
            // If coming from testing, we might want to prompt to create a recipe if none matches, or start production
            // For simplicity, let's open the WIP modal and try to find a recipe using this item
            setWipModalOpen(true);
            // Try to find a recipe that uses this item
            const good = receivedGoods.find(g => g.id === productionDraft.receivedGoodId);
            if (good) {
                const matchingRecipe = recipes.find(r => r.components.some(c => c.masterItemName === good.name || c.receivedGoodId === good.id));
                if (matchingRecipe) {
                    setSelectedRecipe(matchingRecipe.id);
                    // Pre-select serials
                    setConsumedSerials(prev => ({
                        ...prev,
                        [productionDraft.receivedGoodId]: productionDraft.serials
                    }));
                    setQuantity(Math.floor(productionDraft.serials.length / (matchingRecipe.components.find(c => c.masterItemName === good.name || c.receivedGoodId === good.id)?.quantityPerUnit || 1)) || 1);
                }
            }
            // Clear draft after using it (or ignoring it)
            setProductionDraft(null);
        }
    }, [productionDraft, recipes, receivedGoods, setProductionDraft]);

    const getRecipeName = (id: string) => {
        const found = recipes.find(r => r.id === id);
        if (found) return found.name;
        if (id && !id.startsWith('recipe-')) return id;
        return `Archived SKU (${id ? id.slice(-6) : 'Unknown'})`;
    };
    const getGoodName = (id: string) => receivedGoods.find(g => g.id === id)?.name || 'Unknown Item';

    const getAvailableSerialsForBatch = (good: ReceivedGood) => {
        const category = (good.category || '').trim().toLowerCase();
        const name = (good.name || '').trim().toLowerCase();

        // Explicitly identify Bulk types based on common naming conventions
        const isBms = category.includes('bms') || name.includes('bms') || name.includes('pcm') || name.includes('pcb');

        const isAccessory =
            name.includes('holder') || name.includes('spacer') || name.includes('strip') ||
            name.includes('tape') || name.includes('bracket') || name.includes('screw') ||
            name.includes('wire') || name.includes('connector') || name.includes('cabinet') ||
            name.includes('sleeve') || name.includes('epoxy') || name.includes('busbar');

        // Strict Cell Definition: 
        // 1. Must NOT be a BMS or Accessory
        // 2. Must either be in 'cell' category OR have 'cell' in the name
        // This prevents "BMS for LFP Cell" from being treated as a Cell.
        const isCellName = name.includes('cell') || category.includes('cell');
        const isTracked = isCellName && !isBms && !isAccessory;

        // Case 1: Tracked Items (Cells Only)
        if (isTracked) {
            if (!good.serials || good.serials.length === 0) return []; // Must have serials

            return good.serials.filter(serial => {
                const result = testResults.find(tr => tr.receivedGoodId === good.id && tr.serialNumber === serial);

                if (isTracked) {
                    // Cells MUST have test data for matching criteria (Voltage/IR/Cap)
                    if (!result) return false;

                    const v = result.voltage;
                    const r = result.resistance;

                    // Basic logic: if tested, it's available. 
                    if (v === undefined || r === undefined) return false;

                    return true;
                }
                return true;
            });
        }

        // Case 2: Bulk Items (BMS, Screws, Wires, Cell Holders, etc.)
        // If real serials exist (manually added), use them.
        if (good.serials && good.serials.length > 0) {
            return good.serials;
        }

        // If no serials but quantity > 0, generate synthetic serials for tracking consumption
        if (good.quantity > 0) {
            return Array.from({ length: good.quantity }).map((_, i) => `BULK-${good.id.slice(-6)}-${i + 1}`);
        }

        return [];
    };

    const handleOpenWipModal = () => {
        setWipModalOpen(true);
        setQuantity(1);
        setConsumedSerials({});
        setError('');
        if (recipes.length > 0) setSelectedRecipe(recipes[0].id);
    };

    const handleConsumedSerialsChange = (batchId: string, selectedOptions: HTMLCollectionOf<HTMLOptionElement>) => {
        const serials = Array.from(selectedOptions).map(o => o.value);
        setConsumedSerials(prev => ({ ...prev, [batchId]: serials }));
    };

    const handleAutoSelectAcrossBatches = (itemName: string, requiredCount: number, pooledAvailable: { good: ReceivedGood; serials: string[] }[]) => {
        let remaining = requiredCount;
        const newSelections = { ...consumedSerials };

        // Clear existing for this item first to avoid duplicates or over-selection
        pooledAvailable.forEach(p => {
            if (newSelections[p.good.id]) delete newSelections[p.good.id];
        });

        for (const pool of pooledAvailable) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, pool.serials.length);
            const toSelect = pool.serials.slice(0, take);

            newSelections[pool.good.id] = toSelect;
            remaining -= take;
        }

        setConsumedSerials(newSelections);
    };

    const componentsForModal = useMemo(() => {
        const recipe = recipes.find(r => r.id === selectedRecipe);
        if (!recipe) return [];

        // Filter out ghost components (empty name and no ID) to prevent "Unknown Item" display
        const validComponents = recipe.components.filter(c =>
            (c.masterItemName && c.masterItemName.trim() !== '') || c.receivedGoodId
        );

        return validComponents.map(comp => {
            const itemName = comp.masterItemName || (comp.receivedGoodId ? getGoodName(comp.receivedGoodId) : 'Unknown Item');

            // Robust Matching: Use trim() and case-insensitive check
            const batches = receivedGoods.filter(g => {
                const nameMatch = g.name.trim().toLowerCase() === itemName.trim().toLowerCase();
                const idMatch = g.id === comp.receivedGoodId;
                return nameMatch || idMatch;
            }).sort((a, b) => a.timestamp - b.timestamp); // FIFO Order

            const pooledAvailable: { good: ReceivedGood; serials: string[] }[] = batches.map(b => ({
                good: b,
                serials: getAvailableSerialsForBatch(b)
            })).filter(p => p.serials.length > 0);

            const totalAvailableCount = pooledAvailable.reduce((acc, p) => acc + p.serials.length, 0);

            return {
                ...comp,
                itemName,
                totalAvailableCount,
                pooledAvailable,
                requiredSerialsCount: comp.quantityPerUnit * quantity
            };
        });
    }, [selectedRecipe, quantity, recipes, receivedGoods, testResults]);

    const masterItemOptions = useMemo(() => {
        const uniqueNames = Array.from(new Set(receivedGoods.map(g => g.name)));
        return uniqueNames.map(name => {
            const items = receivedGoods.filter(g => g.name === name);
            const totalStock = items.reduce((acc, g) => acc + g.quantity, 0);

            const makes = Array.from(new Set(items.map(i => i.makeModel).filter(Boolean)));
            let makeDisplay = '';
            if (makes.length === 1) makeDisplay = ` (${makes[0]})`;
            else if (makes.length > 1) makeDisplay = ` (${makes.join(', ')})`;

            const category = items[0]?.category;
            const uom = items[0]?.uom || 'qty';

            return {
                id: name,
                label: `${name}${makeDisplay}`,
                subLabel: `${category} • Stock: ${totalStock} ${uom}`
            };
        });
    }, [receivedGoods]);

    const recipeOptions = useMemo(() => recipes.map(r => ({ id: r.id, label: r.name })), [recipes]);

    // Combine WIP and Repair items into a unified list
    const combinedList = useMemo(() => {
        const productionList = wipItems.map(item => ({ ...item, type: 'production' as const }));
        const repairList = repairItems.map(item => {
            const originalFG = finishedGoods.find(fg => fg.id === item.finishedGoodId);
            let consumedSerials: { [key: string]: string[] } = {};

            if (originalFG) {
                // Prioritize precise unit mapping if available
                if (originalFG.unitComponentMap && originalFG.unitComponentMap[item.unitId]) {
                    consumedSerials = originalFG.unitComponentMap[item.unitId];
                }
                // Legacy/Fallback: If no strict map, we can't accurately know which components belong to this unit vs others in the batch.
                // We leave consumedSerials empty or partial to avoid showing misleading data.
                // New repairs on newly produced items will show correctly.
            }

            return {
                id: item.id,
                recipeId: item.recipeId,
                quantity: 1,
                timestamp: item.timestamp,
                consumedSerials: consumedSerials,
                type: 'repair' as const,
                unitId: item.unitId,
                finishedGoodId: item.finishedGoodId
            };
        });

        return [...productionList, ...repairList].sort((a, b) => b.timestamp - a.timestamp);
    }, [wipItems, repairItems, finishedGoods]);

    const filteredItems = combinedList.filter(item =>
        getRecipeName(item.recipeId).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.type === 'repair' && item.unitId?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Implement Start Production
    const handleStartWip = () => {
        setError('');
        const recipe = recipes.find(r => r.id === selectedRecipe);
        if (!recipe) return;

        // 1. Group selection by Batch ID for deduction
        const stockDeductions: { [batchId: string]: { count: number; serials: string[] } } = {};
        const recipeCheckPassed = recipe.components.every(comp => {
            // Skip invalid/empty components during validation
            if (!comp.masterItemName && !comp.receivedGoodId) return true;

            const required = comp.quantityPerUnit * quantity;
            const itemName = comp.masterItemName || (comp.receivedGoodId ? getGoodName(comp.receivedGoodId) : '');

            // Find all serials selected for this master item across all batches
            // FIX: Use robust name matching (trim/lowercase) to handle minor discrepancies
            const batches = receivedGoods.filter(g => {
                const nameMatch = g.name.trim().toLowerCase() === itemName.trim().toLowerCase();
                const idMatch = g.id === comp.receivedGoodId;
                return nameMatch || idMatch;
            });

            const selectedForThisItem = batches.flatMap(b => {
                const sns = consumedSerials[b.id] || [];
                if (sns.length > 0) {
                    stockDeductions[b.id] = { count: sns.length, serials: sns };
                }
                return sns;
            });

            if (selectedForThisItem.length !== required) {
                setError(`Insufficient serials selected for ${itemName || 'component'}. Required: ${required}, Selected: ${selectedForThisItem.length}`);
                return false;
            }
            return true;
        });

        if (!recipeCheckPassed) return;

        // 2. Perform Deductions
        setReceivedGoods(prev => prev.map(good => {
            const deduction = stockDeductions[good.id];
            if (deduction) {
                // Deduct quantity
                const newQuantity = good.quantity - deduction.count;
                const newSerials = good.serials.filter(s => !deduction.serials.includes(s));

                return {
                    ...good,
                    quantity: Math.max(0, newQuantity),
                    serials: newSerials
                };
            }
            return good;
        }));

        addLogEntry('Started Production', `Started production of ${quantity} units of SKU '${recipe.name}'.`);

        const newWipItem: WIPItem = {
            id: `wip-${Date.now()}`,
            recipeId: recipe.id,
            quantity,
            timestamp: Date.now(),
            consumedSerials,
        };
        setWipItems(prev => [newWipItem, ...prev]);
        setWipModalOpen(false);
    };

    const handlePrintBOM = () => {
        const recipe = recipes.find(r => r.id === selectedRecipe);
        if (!recipe) return;

        const printWindow = window.open('', '', 'width=900,height=800');
        if (!printWindow) return;

        // Construct dynamic image URLs
        const baseUrl = "https://bfkxdpripwjxenfvwpfu.supabase.co/storage/v1/object/public/Product%20drawings/";
        const encodedName = encodeURIComponent(recipe.name);

        const pngUrl = `${baseUrl}${encodedName}.png`;
        const jpegUrl = `${baseUrl}${encodedName}.jpeg`;
        const jpgUrl = `${baseUrl}${encodedName}.jpg`;

        const colors = ['#e3f2fd', '#e8f5e9', '#fff3e0', '#f3e5f5', '#e0f7fa', '#fce4ec', '#f1f8e9', '#fff8e1'];
        const getColor = (i: number) => colors[i % colors.length];

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
              <title>Production BOM - ${recipe.name}</title>
              <style>
                  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; max-width: 210mm; margin: 0 auto; }
                  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                  .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
                  .header h2 { margin: 5px 0 0; font-size: 18px; color: #555; }
                  .meta { display: flex; justify-content: space-between; margin-bottom: 20px; background: #f9f9f9; padding: 10px; border: 1px solid #ddd; }
                  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
                  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                  th { background-color: #f2f2f2; font-weight: bold; text-transform: uppercase; }
                  .serial-list { font-family: monospace; font-size: 10px; line-height: 1.4; }
                  /* UPDATED: Removed white-space: nowrap; Added normal wrapping and break-word */
                  .unit-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; margin-right: 4px; margin-bottom: 4px; font-weight: bold; border: 1px solid #ccc; white-space: normal; word-wrap: break-word; max-width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  .drawing-section { margin-top: 30px; text-align: center; page-break-inside: avoid; border: 1px solid #eee; padding: 10px; }
                  .drawing-section h3 { border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 15px; }
                  img { max-width: 100%; max-height: 600px; object-fit: contain; }
                  .footer { margin-top: 40px; font-size: 10px; text-align: center; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
                  @media print {
                      body { padding: 0; }
                      .no-print { display: none; }
                  }
              </style>
          </head>
          <body>
              <div class="header">
                  <h1>Production Bill of Materials</h1>
                  <h2>${recipe.name}</h2>
              </div>
              
              <div class="meta">
                  <div><strong>Date:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
                  <div><strong>Order Qty:</strong> ${quantity} Units</div>
                  <div><strong>Job Ref:</strong> PROD-${Date.now().toString().slice(-6)}</div>
              </div>

              <h3>Component Allocation</h3>
              <table>
                  <thead>
                      <tr>
                          <th style="width: 25%">Component Item</th>
                          <th style="width: 8%">Qty/Unit</th>
                          <th style="width: 8%">Total</th>
                          <th style="width: 59%">Assigned Serial Numbers (Grouped by Unit & Cell Grade)</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${recipe.components.map(comp => {
            const itemName = comp.masterItemName || (comp.receivedGoodId ? getGoodName(comp.receivedGoodId) : 'Unknown');
            const required = comp.quantityPerUnit * quantity;

            // Find consumed serials for this component (aggregating across possible batches)
            // FIX: Use robust name matching (trim/lowercase) to handle minor discrepancies like "100Ah LFP" vs "100Ah LFP "
            const batches = receivedGoods.filter(g => {
                const nameMatch = g.name.trim().toLowerCase() === itemName.trim().toLowerCase();
                const idMatch = g.id === comp.receivedGoodId;
                return nameMatch || idMatch;
            }).sort((a, b) => a.timestamp - b.timestamp);

            const allSelected = batches.flatMap(b => 
                (consumedSerials[b.id] || []).map(s => ({ serial: s, receivedGoodId: b.id }))
            );

            // Group serials by Unit and Cell Grades
            let serialsHtml = '';
            for (let i = 0; i < quantity; i++) {
                const start = i * comp.quantityPerUnit;
                const end = start + comp.quantityPerUnit;
                const unitSerials = allSelected.slice(start, end);

                if (unitSerials.length > 0) {
                    const uColor = getColor(i);
                    const gradedGroups: { [grade: string]: string[] } = {};
                    let hasAnyGrade = false;

                    unitSerials.forEach(item => {
                        const s = item.serial;
                        const trList = testResults.filter(t => t.serialNumber === s && t.receivedGoodId === item.receivedGoodId);
                        const tr = trList.sort((a,b) => b.timestamp - a.timestamp)[0];
                        if (tr && tr.grade) {
                            hasAnyGrade = true;
                            if (!gradedGroups[tr.grade]) gradedGroups[tr.grade] = [];
                            gradedGroups[tr.grade].push(s);
                        } else {
                            if (!gradedGroups['Ungraded']) gradedGroups['Ungraded'] = [];
                            gradedGroups['Ungraded'].push(s);
                        }
                    });

                    if (hasAnyGrade) {
                        let groupHtml = `<div style="background-color: ${uColor}; padding: 4px 6px; border-radius: 4px; border: 1px solid #ccc; margin-bottom: 6px; display: block;">`;
                        groupHtml += `<strong style="display:block; margin-bottom: 3px; font-size: 11px;">U${i + 1}</strong>`;
                        Object.keys(gradedGroups).sort().forEach(g => {
                            if (gradedGroups[g].length > 0) {
                                groupHtml += `<div style="margin-bottom: 2px;">
                                    <span style="background: rgba(255,255,255,0.7); padding: 1px 4px; border-radius: 2px; font-weight: bold; margin-right: 4px;">Grade ${g}:</span>
                                    <span>${gradedGroups[g].join(', ')}</span>
                                </div>`;
                            }
                        });
                        groupHtml += `</div>`;
                        serialsHtml += groupHtml;
                    } else {
                        serialsHtml += `<span class="unit-badge" style="background-color: ${uColor}">U${i + 1}: ${unitSerials.map(u => u.serial).join(', ')}</span> `;
                    }
                }
            }

            if (!serialsHtml && allSelected.length > 0) {
                serialsHtml = allSelected.map(a => a.serial).join(', '); // Fallback if simple list
            } else if (!serialsHtml) {
                serialsHtml = '<span style="color:red; font-style:italic;">No specific serials allocated</span>';
            }

            return `
                              <tr>
                                  <td><strong>${itemName}</strong></td>
                                  <td>${comp.quantityPerUnit}</td>
                                  <td>${required}</td>
                                  <td class="serial-list">
                                      ${serialsHtml}
                                  </td>
                              </tr>
                          `;
        }).join('')}
                  </tbody>
              </table>

              <div class="drawing-section">
                  <h3>Connection Diagram / Product Drawing</h3>
                  <img 
                      src="${pngUrl}" 
                      alt="Drawing for ${recipe.name}"
                      onerror="
                          if (this.src === '${pngUrl}') { this.src = '${jpegUrl}'; }
                          else if (this.src === '${jpegUrl}') { this.src = '${jpgUrl}'; }
                          else { this.style.display = 'none'; document.getElementById('drawing-error').style.display = 'block'; }
                      "
                  />
                  <div id="drawing-error" style="display:none; padding: 20px; color: #d9534f; background: #fdf7f7; border: 1px solid #d9534f; border-radius: 4px;">
                      <strong>Drawing Not Found</strong><br/>
                      System looked for: <em>${recipe.name}.png / .jpeg / .jpg</em> in the 'Product drawings' bucket.
                  </div>
              </div>

              <div style="margin-top: 30px; border-top: 2px dashed #0D0D0D; padding-top: 15px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #333; background: #fafafa; padding: 12px 16px; border-radius: 6px;">
                  <div>
                      <div style="font-[#8EBF45]; font-weight: bold; font-size: 12px; margin-bottom: 4px; text-transform: uppercase;">✔ Digital Signature & Authorization</div>
                      <div><strong>Authorized / Printed By:</strong> ${currentUser?.username || 'Authorized Operator'}</div>
                      <div><strong>Access Level:</strong> ${(currentUser?.role || 'Staff').toUpperCase()}</div>
                      <div><strong>Timestamp:</strong> ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                  </div>
                  <div style="text-align: right;">
                      <div style="font-family: monospace; font-size: 10px; color: #555; background: #e2e8f0; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">[VERIFIED BY PLANT OS]</div>
                      <div style="font-size: 9px; color: #888;">Datlion Cnergy Traceability Standard</div>
                  </div>
              </div>

              <div class="footer" style="margin-top: 15px;">
                  Generated by Datlion Cnergy Plant OS
              </div>

              <script>
                  setTimeout(() => {
                      window.print();
                  }, 1500);
              </script>
          </body>
          </html>
      `;

        addLogEntry('Printed BOM', `Printed Bill of Materials (BOM) & Digital Signature for recipe '${recipe.name}' by ${currentUser?.username || 'user'}.`);
        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };

    const handleInitiateReplacement = (wipItemId: string, goodId: string, damagedSerial: string) => {
        const good = receivedGoods.find(g => g.id === goodId);
        if (!good) return;

        // Check availability across same item OR same category
        const catLower = (good.category || '').trim().toLowerCase();
        const categoryBatches = receivedGoods.filter(g => (g.category || '').trim().toLowerCase() === catLower);
        const totalAvailable = categoryBatches.reduce((acc, b) => acc + getAvailableSerialsForBatch(b).length, 0);

        if (totalAvailable === 0) {
            alert(`No available replacements in storage for item '${good.name}' (Category: ${good.category || 'N/A'}). Please add tested inventory.`);
            return;
        }

        setReplacementTarget({ wipItemId, goodId, damagedSerial });
        setReplacementSearchTerm('');
        setSwapMode('same');
        setIsReplacementModalOpen(true);
    };

    const handleConfirmReplacement = (replacementSerial: string, replacementBatchId: string) => {
        if (!replacementTarget) return;
        const { wipItemId, damagedSerial, goodId } = replacementTarget;

        const originalGood = receivedGoods.find(og => og.id === goodId);
        const replacementGood = receivedGoods.find(rg => rg.id === replacementBatchId);
        const isCrossSwap = originalGood && replacementGood && (originalGood.name.trim().toLowerCase() !== replacementGood.name.trim().toLowerCase());

        const swapLabel = isCrossSwap
            ? `Cross-Swap (${originalGood?.name || 'Orig'} ➔ ${replacementGood?.name || 'Replacement'})`
            : `Swap (${replacementGood?.name || 'Replacement'})`;

        if (!confirm(`Confirm ${swapLabel} of damaged unit ${damagedSerial} with ${replacementSerial}?`)) return;

        // Check if it's a normal WIP item
        const isWip = wipItems.some(w => w.id === wipItemId);
        const repairItem = repairItems.find(r => r.id === wipItemId);
        let targetFG: FinishedGood | undefined = undefined;
        if (repairItem) {
            targetFG = finishedGoods.find(fg => fg.id === repairItem.finishedGoodId);
        }

        // Find parent batch ID for damagedSerial
        const parentGoodId = getSerialParentGoodId(damagedSerial, targetFG, testResults, receivedGoods) || 'RESTORED-BATCH';

        if (isWip) {
            setWipItems(prev => prev.map(w => {
                if (w.id === wipItemId) {
                    const newSerials = { ...w.consumedSerials };
                    for (const bid in newSerials) {
                        newSerials[bid] = (newSerials[bid] || []).filter(s => s !== damagedSerial);
                    }
                    newSerials[replacementBatchId] = [...(newSerials[replacementBatchId] || []), replacementSerial];
                    return { ...w, consumedSerials: newSerials };
                }
                return w;
            }));
        } else if (repairItem) {
            // It's a Repair Item - Update Finished Goods Data
            setFinishedGoods(prev => prev.map(fg => {
                if (fg.id === repairItem.finishedGoodId) {
                    const newFG = { ...fg };

                    // 1. Update Aggregate Consumed Serials
                    if (newFG.consumedSerials) {
                        const newConsumed = { ...newFG.consumedSerials };
                        for (const bid in newConsumed) {
                            if (newConsumed[bid].includes(damagedSerial)) {
                                newConsumed[bid] = newConsumed[bid].filter(s => s !== damagedSerial);
                            }
                        }
                        newConsumed[replacementBatchId] = [...(newConsumed[replacementBatchId] || []), replacementSerial];
                        newFG.consumedSerials = newConsumed;
                    }

                    // 2. Update Unit Component Map (Precise Traceability)
                    const normUnitId = normalizeUnitId(repairItem.unitId);
                    if (newFG.unitComponentMap && (newFG.unitComponentMap[normUnitId] || newFG.unitComponentMap[repairItem.unitId])) {
                        const targetKey = newFG.unitComponentMap[normUnitId] ? normUnitId : repairItem.unitId;
                        const newMap = { ...newFG.unitComponentMap };
                        const unitComponents = { ...(newMap[targetKey] || {}) };

                        for (const bid in unitComponents) {
                            if (unitComponents[bid].includes(damagedSerial)) {
                                unitComponents[bid] = unitComponents[bid].filter(s => s !== damagedSerial);
                            }
                        }
                        unitComponents[replacementBatchId] = [...(unitComponents[replacementBatchId] || []), replacementSerial];

                        newMap[targetKey] = unitComponents;
                        newFG.unitComponentMap = newMap;
                    }

                    // 3. Log Repair Swap History
                    const swapEntry: RepairSwapEntry = {
                        unitId: repairItem.unitId,
                        damagedSerial,
                        replacementSerial,
                        timestamp: Date.now(),
                        swappedBy: currentUser?.name || 'Technician'
                    };
                    newFG.repairSwapHistory = [...(newFG.repairSwapHistory || []), swapEntry];

                    return newFG;
                }
                return fg;
            }));
        }

        // Return damagedSerial to Received Goods stock & Deduct replacementSerial
        setReceivedGoods(prev => {
            let parentFound = false;
            const updated = prev.map(g => {
                let ng = { ...g };
                // Deduct replacementSerial
                if (g.id === replacementBatchId) {
                    const remainingSerials = (g.serials || []).filter(s => s !== replacementSerial);
                    ng = {
                        ...ng,
                        quantity: Math.max(0, (g.quantity || 1) - 1),
                        serials: remainingSerials
                    };
                }
                // Return damagedSerial to parent batch if matched
                if (g.id === parentGoodId) {
                    parentFound = true;
                    const existingSet = new Set(ng.serials || []);
                    if (!existingSet.has(damagedSerial)) {
                        const returnedSerials = [...(ng.serials || []), damagedSerial];
                        ng = {
                            ...ng,
                            serials: returnedSerials,
                            quantity: returnedSerials.length
                        };
                    }
                }
                return ng;
            });

            // If parent batch was NOT found in receivedGoods (e.g. deleted), create a restored batch!
            if (!parentFound && parentGoodId) {
                const restoredBatch: ReceivedGood = {
                    id: parentGoodId,
                    name: `Restored Batch (${parentGoodId.substring(0, 12)})`,
                    category: originalGood?.category || 'Cell',
                    makeModel: 'Restored Component',
                    supplier: 'Restored Inventory',
                    invoiceNumber: 'RESTORED-INV',
                    quantity: 1,
                    damagedCount: 0,
                    status: 'ND',
                    timestamp: Date.now(),
                    serials: [damagedSerial],
                    notes: `Auto-restored batch for damaged serial ${damagedSerial} replaced in repair`
                };
                updated.push(restoredBatch);
            }

            return updated;
        });

        if (isCrossSwap) {
            addLogEntry('Cross Swap Serial', `Damaged serial ${damagedSerial} (${originalGood?.name}) cross-swapped with ${replacementSerial} (${replacementGood?.name}, Category: ${originalGood?.category}) in ${isWip ? 'production' : 'repair'} batch.`);
        } else {
            addLogEntry('WIP Replacement', `Damaged serial ${damagedSerial} replaced by ${replacementSerial} in ${isWip ? 'production' : 'repair'} batch. Damaged serial returned to raw material stock.`);
        }

        // Update local review state if open
        setActiveWipItem(prev => {
            if (!prev || prev.id !== wipItemId) return prev;
            const newSerials = { ...prev.consumedSerials };
            for (const bid in newSerials) {
                newSerials[bid] = (newSerials[bid] || []).filter(s => s !== damagedSerial);
            }
            newSerials[replacementBatchId] = [...(newSerials[replacementBatchId] || []), replacementSerial];
            return { ...prev, consumedSerials: newSerials };
        });

        setIsReplacementModalOpen(false);
    };

    const handleCreateRecipeFromDraft = () => {
        let targetName = '';
        if (productionDraft) {
            const good = receivedGoods.find(g => g.id === productionDraft.receivedGoodId);
            if (good) targetName = good.name;
        }
        setEditingRecipeId(null);
        setNewRecipeName('');
        setNewRecipeComponents([{ masterItemName: targetName, quantityPerUnit: 1 }]);
        setRecipeModalOpen(true);
    };

    const handleEditRecipe = (recipe: Recipe) => {
        setEditingRecipeId(recipe.id);
        setNewRecipeName(recipe.name);
        setNewRecipeComponents(recipe.components.length > 0 ? recipe.components : [{ masterItemName: '', quantityPerUnit: 1 }]);
    };

    const handleCancelEditRecipe = () => {
        setEditingRecipeId(null);
        setNewRecipeName('');
        setNewRecipeComponents([{ masterItemName: '', quantityPerUnit: 1 }]);
    };

    const handleSaveRecipe = () => {
        if (!newRecipeName.trim()) {
            alert("Please enter an SKU Name.");
            return;
        }

        // Validate components to avoid ghost/empty items
        const validComponents = newRecipeComponents.filter(c => c.masterItemName && c.masterItemName.trim() !== '' && c.quantityPerUnit > 0);

        if (validComponents.length === 0) {
            alert("Please add at least one valid component.");
            return;
        }

        if (editingRecipeId) {
            setRecipes(prev => prev.map(r => r.id === editingRecipeId ? { ...r, name: newRecipeName.trim(), components: validComponents } : r));
            addLogEntry('Updated SKU', `Updated SKU '${newRecipeName.trim()}' (ID: ${editingRecipeId}).`);
            setEditingRecipeId(null);
        } else {
            const newRecipe: Recipe = {
                id: `recipe-${Date.now()}`,
                name: newRecipeName.trim(),
                components: validComponents,
            };
            setRecipes(prev => [...prev, newRecipe]);
            addLogEntry('Created SKU', `Created new SKU '${newRecipeName.trim()}'.`);
            setSelectedRecipe(newRecipe.id);
        }

        setNewRecipeName('');
        setNewRecipeComponents([{ masterItemName: '', quantityPerUnit: 1 }]);
        setRecipeModalOpen(false);
    };

    const handleDeleteRecipe = (recipe: Recipe) => {
        const isUsedInWip = wipItems.some(w => w.recipeId === recipe.id);
        const isUsedInFG = finishedGoods.some(fg => fg.recipeId === recipe.id);
        const isUsedInRepair = repairItems.some(r => r.recipeId === recipe.id);

        let warningMsg = `Are you sure you want to delete SKU '${recipe.name}'?`;
        if (isUsedInWip || isUsedInFG || isUsedInRepair) {
            warningMsg = `SKU '${recipe.name}' is referenced in active/historical production or finished goods. Deleting this SKU removes it from future production templates, but existing batch serial traceability will remain fully intact. Proceed with deletion?`;
        }

        if (!confirm(warningMsg)) return;

        setRecipes(prev => prev.filter(r => r.id !== recipe.id));
        if (editingRecipeId === recipe.id) {
            handleCancelEditRecipe();
        }
        addLogEntry('Deleted SKU', `Deleted SKU '${recipe.name}'.`);
    };

    const openFinishModal = (wipItem: WIPItem) => {
        setItemToFinish(wipItem);
        setIsFinishModalOpen(true);
    };

    const handleFinishProduction = () => {
        if (!itemToFinish) return;

        // 1. Create Base Object
        const newFinishedGood: FinishedGood = {
            id: `fin-${Date.now()}`,
            recipeId: itemToFinish.recipeId,
            quantity: itemToFinish.quantity,
            timestamp: Date.now(),
            consumedSerials: itemToFinish.consumedSerials || {},
            ...finishFormData,
            inRepairUnitIds: [], repairedUnitIds: [], unitDeliveries: {}, unitMetadata: {}
        };

        // 2. Generate Unit-Level Serial Map
        // We pass the new good and existing list to generator
        const unitIds = generateUnitIds(newFinishedGood, finishedGoods, recipes);
        const unitMap: Record<string, Record<string, string[]>> = {};

        unitIds.forEach((uId, idx) => {
            unitMap[uId] = {};
            // Distribute consumed serials evenly
            Object.entries(newFinishedGood.consumedSerials).forEach(([rgId, serials]) => {
                const totalQty = newFinishedGood.quantity;
                const totalSerials = serials.length;
                // Determine ratio (e.g. 4 cells per unit)
                const perUnit = Math.floor(totalSerials / totalQty);

                if (perUnit > 0) {
                    const start = idx * perUnit;
                    const end = start + perUnit;
                    // Ensure we don't go out of bounds or take extras if division isn't clean
                    const unitSpecificSerials = serials.slice(start, end);
                    if (unitSpecificSerials.length > 0) {
                        unitMap[uId][rgId] = unitSpecificSerials;
                    }
                }
            });
        });

        newFinishedGood.unitComponentMap = unitMap;

        setFinishedGoods(prev => [newFinishedGood, ...prev]);
        setWipItems(prev => prev.filter(item => item.id !== itemToFinish.id));
        setIsFinishModalOpen(false);
        addLogEntry('Finished Production', `Completed ${itemToFinish.quantity} units of SKU '${getRecipeName(itemToFinish.recipeId)}'.`);
    };

    const handleCompleteRepair = (repair: typeof filteredItems[0]) => {
        if (repair.type !== 'repair' || !repair.finishedGoodId || !repair.unitId) return;
        if (!confirm(`Mark unit ${repair.unitId} as repaired? This will return it to active Finished Goods stock.`)) return;

        // Update Finished Goods: Remove from Repair, Add to Repaired
        setFinishedGoods(prev => prev.map(fg => {
            if (fg.id === repair.finishedGoodId) {
                return {
                    ...fg,
                    inRepairUnitIds: (fg.inRepairUnitIds || []).filter(u => u !== repair.unitId),
                    repairedUnitIds: [...(fg.repairedUnitIds || []), repair.unitId!]
                };
            }
            return fg;
        }));

        // Remove from Repair Items list
        setRepairItems(prev => prev.filter(r => r.id !== repair.id));
        addLogEntry('Item Repaired', `Unit ${repair.unitId} repair completed.`);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Work-in-Progress</h1>
                <div className="flex space-x-2">
                    <button onClick={() => setRecipeModalOpen(true)} className="flex items-center bg-[#0D0D0D] text-white px-4 py-2 rounded-lg shadow-md hover:bg-[#404040] transition-colors font-bold uppercase tracking-wide text-xs">
                        <PlusIcon /> <span className="ml-2">Manage SKUs</span>
                    </button>
                    <button onClick={handleOpenWipModal} className="flex items-center bg-[#8EBF45] text-[#0D0D0D] px-6 py-2 rounded-lg shadow-md hover:bg-[#658C3E] hover:text-white transition-all transform active:scale-95 font-bold uppercase tracking-wide text-xs">
                        <PlusIcon /> <span className="ml-2">Start Production</span>
                    </button>
                </div>
            </div>

            <div className="mb-6 relative">
                <input
                    type="text"
                    placeholder="Search by Product SKU..."
                    className="block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#8EBF45]"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="p-4 border-b font-semibold text-gray-600 w-10"></th>
                            <th className="p-4 border-b font-semibold text-gray-600">Product SKU</th>
                            <th className="p-4 border-b font-semibold text-gray-600">Units</th>
                            <th className="p-4 border-b font-semibold text-gray-600">Recipe Summary</th>
                            <th className="p-4 border-b font-semibold text-gray-600">Started</th>
                            <th className="p-4 border-b font-semibold text-gray-600 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredItems.map(item => {
                            const isExpanded = expandedWipId === item.id;
                            const recipe = recipes.find(r => r.id === item.recipeId);
                            const isRepair = item.type === 'repair';

                            return (
                                <React.Fragment key={item.id}>
                                    <tr className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''} ${isRepair ? 'bg-amber-50 hover:bg-amber-100' : ''}`}>
                                        <td className="p-4 text-center">
                                            <button onClick={() => setExpandedWipId(isExpanded ? null : item.id)} className="text-gray-400 hover:text-[#658C3E]">
                                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </button>
                                        </td>
                                        <td className="p-4 font-bold">
                                            {getRecipeName(item.recipeId)}
                                            {isRepair && <span className="ml-2 text-[10px] text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1 inline-flex"><SpannerIcon size={10} /> Repair</span>}
                                        </td>
                                        <td className="p-4">
                                            {isRepair ? (
                                                <span className="bg-amber-200 px-3 py-1 rounded-full text-amber-800 text-xs font-bold">IN REPAIR</span>
                                            ) : (
                                                <span className="bg-[#A8BF75]/20 px-3 py-1 rounded-full text-[#658C3E] text-xs font-bold">{item.quantity}</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-xs text-gray-600">
                                            {isRepair ? (
                                                <span className="font-mono text-slate-500 font-bold">Repairing Unit: {item.unitId}</span>
                                            ) : (
                                                recipe?.components.filter(c => c.masterItemName || c.receivedGoodId).map((c, i) => <div key={i}>• {c.masterItemName || (c.receivedGoodId ? getGoodName(c.receivedGoodId) : 'Item')} (x{c.quantityPerUnit})</div>)
                                            )}
                                        </td>
                                        <td className="p-4 text-sm text-gray-500">{new Date(item.timestamp).toLocaleDateString()}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end space-x-3">
                                                {/* Always show Swap Serials */}
                                                <button onClick={() => { setActiveWipItem(item as WIPItem); setIsManageSerialsModalOpen(true); }} className="text-[#658C3E] hover:text-[#8EBF45] text-xs font-semibold flex items-center">
                                                    <RefreshCw size={14} className="mr-1" /> Swap Serials
                                                </button>

                                                {isRepair ? (
                                                    <button onClick={() => handleCompleteRepair(item)} className="bg-amber-500 text-white px-3 py-1.5 rounded-lg shadow-sm hover:bg-amber-600 transition-colors text-xs font-bold uppercase tracking-wide flex items-center ml-auto">
                                                        <ArrowRightIcon className="mr-1" size={14} /> Complete Repair
                                                    </button>
                                                ) : (
                                                    <button onClick={() => openFinishModal(item as WIPItem)} className="bg-[#8EBF45] text-[#0D0D0D] px-3 py-1.5 rounded-lg shadow-sm hover:bg-[#658C3E] hover:text-white transition-colors text-xs font-bold uppercase tracking-wide">
                                                        Finish Batch
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-slate-50">
                                            <td colSpan={6} className="p-4 border-b">
                                                <div className="animate-fade-in space-y-4">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2">Traceability Mapping (Per Unit)</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {Array.from({ length: item.quantity }).map((_, uIdx) => (
                                                            <div key={uIdx} className="bg-white p-3 rounded border shadow-sm">
                                                                <p className="font-bold text-xs text-[#0D0D0D] mb-2 border-b pb-1">Unit Build #{uIdx + 1}</p>
                                                                <div className="space-y-2">
                                                                    {recipe?.components.filter(c => c.masterItemName || c.receivedGoodId).map((comp, cIdx) => {
                                                                        const itemName = comp.masterItemName || (comp.receivedGoodId ? getGoodName(comp.receivedGoodId) : '');
                                                                        // Sort by timestamp to ensure deterministic unit allocation visualization (FIFO)
                                                                        // FIX: Use robust name matching to ensure we catch all batches used
                                                                        const pooled = receivedGoods.filter(g => {
                                                                            const nameMatch = g.name.trim().toLowerCase() === itemName.trim().toLowerCase();
                                                                            const idMatch = g.id === comp.receivedGoodId;
                                                                            return nameMatch || idMatch;
                                                                        }).sort((a, b) => a.timestamp - b.timestamp);

                                                                        const allSelected = pooled.flatMap(b => (item.consumedSerials || {})[b.id] || []);
                                                                        const unitSerials = allSelected.slice(uIdx * comp.quantityPerUnit, (uIdx + 1) * comp.quantityPerUnit);

                                                                        const contributingBatches = pooled.filter(b => ((item.consumedSerials || {})[b.id] || []).length > 0);
                                                                        const makeModels = Array.from(new Set(contributingBatches.map(b => b.makeModel).filter(Boolean)));
                                                                        const makeModelStr = makeModels.length > 0 ? ` (${makeModels.join(', ')})` : '';

                                                                        return (
                                                                            <div key={cIdx}>
                                                                                <div className="flex justify-between items-baseline">
                                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{itemName}{makeModelStr}</p>
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                                                    {unitSerials.length > 0 ? unitSerials.map(sn => <span key={sn} className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono border text-slate-700">{sn}</span>) : <span className="text-[10px] text-gray-300 italic">No specific serials recorded</span>}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {filteredItems.length === 0 && (
                            <tr><td colSpan={6} className="p-8 text-center text-gray-500 italic">No active production or repair batches found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modals */}

            {/* Replacement Modal */}
            {replacementTarget && (
                <Modal isOpen={isReplacementModalOpen} onClose={() => setIsReplacementModalOpen(false)} title="Select Replacement Component" size="lg">
                    <div className="space-y-4">
                        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-4">
                            <p className="text-sm text-yellow-800">
                                Replacing damaged unit <strong>{replacementTarget.damagedSerial}</strong>.
                                Select a tested unit from inventory to swap into production.
                            </p>
                        </div>

                        {/* Swap Mode Selector */}
                        {(() => {
                            const originalGood = receivedGoods.find(og => og.id === replacementTarget.goodId);
                            const category = originalGood?.category || 'Component';
                            return (
                                <div className="flex gap-2 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold mb-3">
                                    <button
                                        type="button"
                                        onClick={() => setSwapMode('same')}
                                        className={`flex-1 py-1.5 px-3 rounded-md transition-all ${swapMode === 'same' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        Same Item ({originalGood?.name || 'Exact Match'})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSwapMode('category')}
                                        className={`flex-1 py-1.5 px-3 rounded-md transition-all ${swapMode === 'category' ? 'bg-[#8EBF45] text-[#0D0D0D] shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        ⚡ Cross Swap (Same Category: {category})
                                    </button>
                                </div>
                            );
                        })()}

                        <div className="relative mb-3">
                            <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <input type="text" placeholder="Search replacement serial or item name..." className="w-full border rounded-lg py-2 pl-9 text-sm outline-none focus:ring-2 focus:ring-[#8EBF45]" value={replacementSearchTerm} onChange={(e) => setReplacementSearchTerm(e.target.value)} />
                        </div>
                        <div className="border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-100 sticky top-0 font-semibold text-gray-700">
                                    <tr>
                                        <th className="p-3 border-b">Item & Serial</th>
                                        <th className="p-3 border-b">Category / Make</th>
                                        <th className="p-3 border-b">Batch / Invoice</th>
                                        <th className="p-3 border-b text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(() => {
                                        const originalGood = receivedGoods.find(og => og.id === replacementTarget.goodId);
                                        if (!originalGood) return <tr><td colSpan={4} className="p-4 text-center text-gray-500">Original item not found.</td></tr>;

                                        let candidateBatches: ReceivedGood[] = [];
                                        if (swapMode === 'same') {
                                            candidateBatches = receivedGoods.filter(g => g.name.trim().toLowerCase() === originalGood.name.trim().toLowerCase());
                                        } else {
                                            const origCat = (originalGood.category || '').trim().toLowerCase();
                                            candidateBatches = receivedGoods.filter(g => (g.category || '').trim().toLowerCase() === origCat);
                                        }

                                        const searchLower = replacementSearchTerm.toLowerCase();
                                        const availableList = candidateBatches.flatMap(batch => {
                                            return getAvailableSerialsForBatch(batch)
                                                .filter(s => s.toLowerCase().includes(searchLower) || batch.name.toLowerCase().includes(searchLower) || (batch.makeModel || '').toLowerCase().includes(searchLower))
                                                .map(sn => ({
                                                    sn,
                                                    batchId: batch.id,
                                                    itemName: batch.name,
                                                    category: batch.category,
                                                    makeModel: batch.makeModel,
                                                    invoice: batch.invoiceNumber,
                                                    isCross: batch.name.trim().toLowerCase() !== originalGood.name.trim().toLowerCase()
                                                }));
                                        });

                                        if (availableList.length === 0) return <tr><td colSpan={4} className="p-4 text-center text-gray-500">No matching replacement serials found in inventory.</td></tr>;

                                        return availableList.map(({ sn, batchId, itemName, category, makeModel, invoice, isCross }) => (
                                            <tr key={`${batchId}-${sn}`} className={`hover:bg-blue-50 transition-colors ${isCross ? 'bg-amber-50/40' : ''}`}>
                                                <td className="p-3">
                                                    <div className="font-mono font-bold text-slate-800 text-xs">{sn}</div>
                                                    <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                                                        {itemName}
                                                        {isCross && <span className="text-[9px] bg-amber-200 text-amber-900 px-1 py-0.2 rounded font-bold uppercase">Cross Swap</span>}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-xs text-gray-500">
                                                    <div>{category}</div>
                                                    {makeModel && <div className="text-[10px] text-indigo-600 font-medium">{makeModel}</div>}
                                                </td>
                                                <td className="p-3 text-xs text-gray-500">{invoice || 'N/A'}</td>
                                                <td className="p-3 text-right">
                                                    <button onClick={() => handleConfirmReplacement(sn, batchId)} className="bg-[#8EBF45] text-[#0D0D0D] hover:bg-[#658C3E] hover:text-white px-3 py-1 rounded text-xs font-bold shadow-sm transition-colors">Select</button>
                                                </td>
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Swap/Manage Serials Overview Modal */}
            {activeWipItem && (
                <Modal isOpen={isManageSerialsModalOpen} onClose={() => setIsManageSerialsModalOpen(false)} title="Manage Production Serials" size="lg">
                    <div className="space-y-4">
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                            <p className="text-sm text-blue-800">Review all serial numbers currently allocated to this production batch. You can <strong>Swap</strong> any component with available stock.</p>
                        </div>
                        {Object.entries(activeWipItem.consumedSerials || {}).map(([goodId, serials]) => {
                            const good = receivedGoods.find(g => g.id === goodId);
                            return (
                                <div key={goodId} className="border rounded-lg overflow-hidden mb-3">
                                    <div className="bg-slate-100 p-2 text-sm font-bold border-b flex justify-between">
                                        <span>{good?.name} ({good?.category || 'N/A'})</span>
                                        <span className="text-slate-500 text-[10px] font-mono">Batch: {good?.invoiceNumber}</span>
                                    </div>
                                    <div className="p-3 bg-white">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {(serials as string[]).map(sn => (
                                                <div key={sn} className="flex justify-between items-center bg-slate-50 border p-2 rounded-md group hover:border-[#8EBF45] transition-colors">
                                                    <span className="font-mono text-xs text-slate-700">{sn}</span>
                                                    <button
                                                        onClick={() => handleInitiateReplacement(activeWipItem.id, goodId, sn)}
                                                        className="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded border border-red-200 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 hover:text-white"
                                                    >
                                                        Swap / Damaged
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex justify-end pt-4">
                            <button onClick={() => setIsManageSerialsModalOpen(false)} className="bg-[#0D0D0D] text-white px-6 py-2 rounded-lg font-bold">Done</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Start Production Modal */}
            <Modal isOpen={isWipModalOpen} onClose={() => setWipModalOpen(false)} title="Start New Production" size="lg" persistent={true}>
                <div className="space-y-4">
                    {error && <div className="bg-red-100 text-red-700 p-3 rounded-md text-sm border-l-4 border-red-600">{error}</div>}

                    <div>
                        <div className="flex justify-between items-end mb-1">
                            <label className="block text-sm font-medium text-gray-700">Product SKU (Recipe)</label>
                            <button
                                onClick={handleCreateRecipeFromDraft}
                                className="text-[10px] text-[#658C3E] hover:text-[#8EBF45] font-bold flex items-center bg-white px-2 py-1 rounded border border-[#A8BF75] transition-colors"
                            >
                                <PlusIcon /> New SKU
                            </button>
                        </div>
                        <SearchableSelect options={recipeOptions} value={selectedRecipe} onChange={setSelectedRecipe} placeholder="Search SKUs..." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Produce</label>
                        <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min="1" className="w-full border rounded-md p-2 focus:ring-2 focus:ring-[#8EBF45] outline-none" />
                    </div>

                    <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2 mt-4">
                        {componentsForModal.map(comp => (
                            <div key={comp.itemName} className="bg-gray-50 p-3 rounded-md border border-slate-200">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-bold text-slate-800">{comp.itemName} <span className="text-gray-400 font-normal">(x{comp.quantityPerUnit} {comp.pooledAvailable?.[0]?.good?.uom || 'qty'}/unit)</span></label>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${comp.totalAvailableCount >= comp.requiredSerialsCount ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                                        Needs: {comp.requiredSerialsCount} {comp.pooledAvailable?.[0]?.good?.uom || 'qty'} | Stock: {comp.totalAvailableCount} {comp.pooledAvailable?.[0]?.good?.uom || 'qty'}
                                    </span>
                                </div>

                                <div className="flex gap-2 mb-2">
                                    <button
                                        onClick={() => handleAutoSelectAcrossBatches(comp.itemName, comp.requiredSerialsCount, comp.pooledAvailable)}
                                        className="text-[10px] bg-[#8EBF45]/20 text-[#0D0D0D] px-2 py-1 rounded hover:bg-[#8EBF45] font-bold disabled:opacity-50"
                                        disabled={comp.totalAvailableCount < comp.requiredSerialsCount}
                                    >
                                        Auto-Select FIFO
                                    </button>
                                    <button onClick={() => {
                                        const cleared = { ...consumedSerials };
                                        comp.pooledAvailable.forEach(b => delete cleared[b.good.id]);
                                        setConsumedSerials(cleared);
                                    }} className="text-[10px] bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300 font-bold">Clear</button>
                                </div>

                                <div className="space-y-2">
                                    {comp.pooledAvailable.map(batch => (
                                        <div key={batch.good.id} className="bg-white p-2 border rounded text-xs shadow-sm">
                                            <div className="flex justify-between items-center mb-1">
                                                <div>
                                                    <p className="font-bold text-[10px] text-gray-400 uppercase">Invoice: {batch.good.invoiceNumber || 'Manual'}</p>
                                                    {batch.good.makeModel && <p className="text-[10px] text-indigo-600 font-bold">{batch.good.makeModel}</p>}
                                                </div>
                                                <span className="text-[9px] text-slate-400">{new Date(batch.good.timestamp).toLocaleDateString()}</span>
                                            </div>
                                            <select
                                                multiple
                                                className="w-full border rounded h-24 font-mono text-[10px] p-1 focus:ring-1 focus:ring-[#8EBF45] outline-none"
                                                value={consumedSerials[batch.good.id] || []}
                                                onChange={(e) => handleConsumedSerialsChange(batch.good.id, e.target.selectedOptions)}
                                            >
                                                {batch.serials.map(sn => <option key={sn} value={sn}>{sn}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end pt-4 border-t mt-4 gap-3">
                        <button
                            onClick={handlePrintBOM}
                            className="bg-white text-[#0D0D0D] px-4 py-2.5 rounded-lg font-bold uppercase tracking-wide text-xs shadow-sm border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
                        >
                            <Printer size={16} /> Print BOM
                        </button>
                        <button onClick={handleStartWip} className="bg-[#8EBF45] text-[#0D0D0D] px-8 py-2.5 rounded-lg font-black uppercase tracking-widest text-sm shadow-md hover:bg-[#658C3E] hover:text-white transition-all transform active:scale-95">Confirm & Start Production</button>
                    </div>
                </div>
            </Modal>

            {/* Manage Recipes Modal */}
            <Modal isOpen={isRecipeModalOpen} onClose={() => { setRecipeModalOpen(false); handleCancelEditRecipe(); }} title="Manage Product SKUs (Recipes)" size="lg">
                <div className="space-y-6">
                    <div className="p-4 border rounded-lg bg-slate-50 border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            {editingRecipeId ? <><PencilIcon className="h-4 w-4 text-[#8EBF45]" /> Edit SKU Pattern</> : <><PlusIcon /> Create New SKU</>}
                        </h3>
                        <div className="space-y-4">
                            <input type="text" placeholder="SKU Name (e.g. 12V 100Ah Battery Pack)" value={newRecipeName} onChange={e => setNewRecipeName(e.target.value)} className="w-full p-2.5 border rounded-md shadow-sm outline-none focus:ring-2 focus:ring-[#8EBF45]" />
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Components List</h4>
                            {newRecipeComponents.map((comp, index) => (
                                <div key={index} className="flex gap-2 items-center bg-white p-2 border rounded-lg shadow-sm group">
                                    <div className="flex-1">
                                        <SearchableSelect options={masterItemOptions} value={comp.masterItemName || ''} onChange={(val) => {
                                            const updated = [...newRecipeComponents];
                                            updated[index].masterItemName = val;
                                            setNewRecipeComponents(updated);
                                        }} placeholder="Search Master Item Name..." />
                                    </div>
                                    <div className="w-28 flex items-center gap-1">
                                        <input type="number" placeholder="Qty" value={comp.quantityPerUnit} onChange={e => {
                                            const updated = [...newRecipeComponents];
                                            updated[index].quantityPerUnit = Number(e.target.value);
                                            setNewRecipeComponents(updated);
                                        }} className="w-16 border rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-[#8EBF45]" />
                                        <span className="text-xs font-bold text-slate-500 font-mono">
                                            {comp.uom || receivedGoods.find(g => g.name === comp.masterItemName || g.id === comp.receivedGoodId)?.uom || 'qty'}
                                        </span>
                                    </div>
                                    <button onClick={() => setNewRecipeComponents(newRecipeComponents.filter((_, i) => i !== index))} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><TrashIcon /></button>
                                </div>
                            ))}
                            <button onClick={() => setNewRecipeComponents([...newRecipeComponents, { masterItemName: '', quantityPerUnit: 1 }])} className="text-[#658C3E] text-xs font-bold hover:underline py-1">+ Add Component Item</button>
                            <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                                {editingRecipeId && (
                                    <button onClick={handleCancelEditRecipe} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-300 transition-colors text-xs uppercase">Cancel Edit</button>
                                )}
                                <button onClick={handleSaveRecipe} className="bg-[#8EBF45] text-[#0D0D0D] px-6 py-2 rounded-lg font-bold shadow-md hover:bg-[#658C3E] hover:text-white transition-colors uppercase tracking-wide text-xs">
                                    {editingRecipeId ? 'Update SKU' : 'Save Product SKU'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-bold text-slate-800 mb-3 px-1">Registered SKUs ({recipes.length})</h3>
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                            {recipes.map(r => (
                                <div key={r.id} className={`p-3 border rounded-lg flex justify-between items-center transition-all ${editingRecipeId === r.id ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200' : 'bg-white hover:shadow-md'}`}>
                                    <div>
                                        <p className="font-bold text-sm text-slate-800 flex items-center gap-2">
                                            {r.name}
                                            {editingRecipeId === r.id && <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold uppercase">Editing</span>}
                                        </p>
                                        <div className="flex gap-1.5 mt-1.5 items-center flex-wrap">
                                            {r.components.filter(c => c.masterItemName || c.receivedGoodId).map((c, idx) => {
                                                const name = c.masterItemName || (c.receivedGoodId ? getGoodName(c.receivedGoodId) : 'Item');
                                                const matchedGood = receivedGoods.find(g => g.name === c.masterItemName || g.id === c.receivedGoodId);
                                                const uom = c.uom || matchedGood?.uom || 'qty';
                                                return (
                                                    <span key={idx} className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                                                        {name} (x{c.quantityPerUnit} {uom})
                                                    </span>
                                                );
                                            })}
                                            <span className="text-[10px] text-gray-300">|</span>
                                            <p className="text-[10px] text-gray-400 font-mono">{r.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleEditRecipe(r)}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            title="Edit SKU Details & Components"
                                        >
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteRecipe(r)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete SKU Pattern"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {recipes.length === 0 && <p className="text-center py-6 text-gray-400 italic text-sm">No recipes defined yet.</p>}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Finish Production Modal */}
            {itemToFinish && <Modal isOpen={isFinishModalOpen} onClose={() => setIsFinishModalOpen(false)} title={`Complete Production: ${getRecipeName(itemToFinish.recipeId)}`}>
                <div className="space-y-4">
                    <div className="bg-[#8EBF45]/10 p-4 rounded-lg border border-[#A8BF75]/50 text-[#0D0D0D] text-sm">
                        <p className="font-bold mb-1">Ready for Release</p>
                        <p>You are moving <strong>{itemToFinish.quantity} units</strong> to Finished Goods. Serial numbers will be permanently mapped to Unit IDs.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quality Control Remarks</label>
                        <textarea value={finishFormData.qualityRemarks} onChange={e => setFinishFormData(p => ({ ...p, qualityRemarks: e.target.value }))} rows={4} placeholder="e.g. All checks passed, balancing verified, output 12.8V nominal..." className="w-full border rounded-md p-3 text-sm focus:ring-2 focus:ring-[#8EBF45] outline-none"></textarea>
                    </div>
                    <div className="flex justify-end pt-4"><button onClick={handleFinishProduction} className="bg-[#8EBF45] text-[#0D0D0D] px-8 py-2.5 rounded-lg font-black uppercase tracking-widest text-sm shadow-lg hover:bg-[#658C3E] hover:text-white transition-all transform active:scale-95 flex items-center gap-2"><ArrowRightIcon size={18} className="m-0" /> Release to Inventory</button></div>
                </div>
            </Modal>}
        </div>
    );
};

export default WorkInProgress;
