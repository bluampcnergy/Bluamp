import React, { useState, useMemo } from 'react';
import type { ReceivedGood, FinishedGood, Recipe, User } from '../types';
import Modal from './Modal';
import { PlusIcon } from './icons/PlusIcon';
import { SearchIcon } from './icons/SearchIcon';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import { generateUnitIds } from '../utils';

interface DirectToFinishedProps {
    receivedGoods: ReceivedGood[];
    setReceivedGoods: React.Dispatch<React.SetStateAction<ReceivedGood[]>>;
    finishedGoods: FinishedGood[];
    setFinishedGoods: React.Dispatch<React.SetStateAction<FinishedGood[]>>;
    recipes: Recipe[];
    setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
    addLogEntry: (action: string, details: string) => void;
    currentUser: User | null;
}

const DirectToFinished: React.FC<DirectToFinishedProps> = ({
    receivedGoods, setReceivedGoods, finishedGoods, setFinishedGoods, recipes, setRecipes, addLogEntry, currentUser
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [selectedGood, setSelectedGood] = useState<ReceivedGood | null>(null);
    const [transferQuantity, setTransferQuantity] = useState(1);
    const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
    const [qcDone, setQcDone] = useState(false);
    const [remarks, setRemarks] = useState('');

    const availableGoods = useMemo(() => {
        return receivedGoods.filter(g => g.quantity > 0 && g.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [receivedGoods, searchTerm]);

    const handleOpenTransfer = (good: ReceivedGood) => {
        setSelectedGood(good);
        setTransferQuantity(1);
        setSelectedSerials([]);
        setQcDone(false);
        setRemarks('');
        setIsTransferModalOpen(true);
    };

    const handleSerialSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const serials = Array.from(e.target.selectedOptions, (o: HTMLOptionElement) => o.value);
        setSelectedSerials(serials);
    };

    const handleTransfer = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGood) return;

        const isTracked = selectedGood.serials && selectedGood.serials.length > 0 && (!selectedGood.uom || selectedGood.uom === 'qty');
        
        if (isTracked && selectedSerials.length !== transferQuantity) {
            alert(`Please select exactly ${transferQuantity} serials.`);
            return;
        }

        // 1. Ensure Pseudo-Recipe exists
        const pseudoRecipeName = selectedGood.name;
        let recipe = recipes.find(r => r.name === pseudoRecipeName && r.components.length === 1 && r.components[0].receivedGoodId === selectedGood.id);
        
        if (!recipe) {
            recipe = {
                id: `recipe-dtf-${Date.now()}`,
                name: pseudoRecipeName,
                components: [{ receivedGoodId: selectedGood.id, masterItemName: selectedGood.name, quantityPerUnit: 1 }]
            };
            setRecipes(prev => [...prev, recipe as Recipe]);
        }

        // 2. Create Finished Good
        const consumedSerialsObj = isTracked ? { [selectedGood.id]: selectedSerials } : {};
        
        const newFinishedGood: FinishedGood = {
            id: `fin-dtf-${Date.now()}`,
            recipeId: recipe.id,
            quantity: transferQuantity,
            timestamp: Date.now(),
            consumedSerials: consumedSerialsObj,
            qualityRemarks: qcDone ? `QC Done. ${remarks}` : remarks,
            inRepairUnitIds: [], 
            repairedUnitIds: [], 
            unitDeliveries: {}, 
            unitMetadata: {},
            isDTF: true
        };

        // If tracked, generate unit map
        if (isTracked) {
            const unitIds = generateUnitIds(newFinishedGood, finishedGoods, recipes);
            const unitMap: Record<string, Record<string, string[]>> = {};
            unitIds.forEach((uId, idx) => {
                unitMap[uId] = { [selectedGood.id]: [selectedSerials[idx]] };
            });
            newFinishedGood.unitComponentMap = unitMap;
        }

        setFinishedGoods(prev => [newFinishedGood, ...prev]);

        // 3. Deduct from ReceivedGoods
        setReceivedGoods(prev => prev.map(g => {
            if (g.id === selectedGood.id) {
                return {
                    ...g,
                    quantity: Math.max(0, g.quantity - transferQuantity),
                    serials: g.serials.filter(s => !selectedSerials.includes(s))
                };
            }
            return g;
        }));

        addLogEntry('DTF Transfer', `Transferred ${transferQuantity}x ${selectedGood.name} direct to Finished Goods.`);
        setIsTransferModalOpen(false);
    };

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                <div>
                    <h1 className="text-3xl font-black text-[#0D0D0D] tracking-tight">Direct to Finished</h1>
                    <p className="text-sm text-[#404040] mt-1 font-medium">Route raw materials directly to finished goods inventory.</p>
                </div>
            </div>

            <div className="mb-6 relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#8EBF45] transition-colors">
                    <SearchIcon className="h-5 w-5" />
                </div>
                <input
                    type="text"
                    placeholder="Search available stock..."
                    className="block w-full p-4 pl-12 border-2 border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:border-[#8EBF45] focus:ring-4 focus:ring-[#8EBF45]/10 transition-all text-[#404040]"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {availableGoods.map(good => (
                    <div key={good.id} className="bg-white rounded-2xl shadow-sm hover:shadow-xl p-6 flex flex-col border border-slate-200 transition-all duration-300">
                        <div className="flex-1">
                            <h3 className="font-bold text-xl text-[#0D0D0D] leading-tight mb-1">{good.name}</h3>
                            <p className="text-xs text-[#658C3E] font-black uppercase tracking-widest">{good.makeModel}</p>
                            <div className="mt-4 flex justify-between items-end border-t border-slate-50 pt-4">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Available</p>
                                    <p className="text-2xl font-black text-[#8EBF45]">{good.quantity}</p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6">
                            <button 
                                onClick={() => handleOpenTransfer(good)}
                                className="w-full bg-[#0D0D0D] text-white py-2.5 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-[#404040] transition-colors flex items-center justify-center gap-2"
                            >
                                <ArrowRightIcon className="w-4 h-4" /> Send to Finished
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <Modal isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)} title="Direct to Finished Transfer" size="md">
                {selectedGood && (
                    <form onSubmit={handleTransfer} className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Item</label>
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-medium text-[#0D0D0D]">
                                {selectedGood.name} {selectedGood.makeModel ? `(${selectedGood.makeModel})` : ''}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Transfer Quantity</label>
                            <input 
                                type="number" 
                                min="1" 
                                max={selectedGood.quantity}
                                value={transferQuantity}
                                onChange={e => setTransferQuantity(parseInt(e.target.value) || 1)}
                                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-bold"
                            />
                            <p className="text-xs text-slate-500 mt-1">Available: {selectedGood.quantity}</p>
                        </div>

                        {selectedGood.serials && selectedGood.serials.length > 0 && (
                            <div>
                                <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">
                                    Select Serials ({selectedSerials.length} / {transferQuantity})
                                </label>
                                <select 
                                    multiple
                                    value={selectedSerials}
                                    onChange={handleSerialSelect}
                                    className="w-full border border-slate-200 rounded-lg p-2.5 outline-none text-sm h-32 bg-white font-mono"
                                >
                                    {selectedGood.serials.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase">Hold Ctrl/Cmd to select multiple</p>
                            </div>
                        )}

                        <div className="border-t border-slate-100 pt-4">
                            <label className="flex items-center gap-3 cursor-pointer mb-4">
                                <input 
                                    type="checkbox" 
                                    checked={qcDone}
                                    onChange={e => setQcDone(e.target.checked)}
                                    className="w-5 h-5 rounded border-gray-300 text-[#8EBF45] focus:ring-[#8EBF45]"
                                />
                                <span className="text-sm font-bold text-[#404040]">QC Done (Optional)</span>
                            </label>

                            <div>
                                <label className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Remarks / Warranty Info</label>
                                <textarea 
                                    value={remarks}
                                    onChange={e => setRemarks(e.target.value)}
                                    placeholder="Enter warranty periods or special notes..."
                                    className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm resize-none"
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={() => setIsTransferModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                            <button type="submit" className="px-6 py-2 bg-[#8EBF45] text-[#0D0D0D] font-bold rounded-lg hover:bg-[#658C3E] hover:text-white transition-colors">
                                Complete Transfer
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

export default DirectToFinished;
