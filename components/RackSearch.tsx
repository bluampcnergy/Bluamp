
import React, { useState, useMemo, useEffect } from 'react';
import { ReceivedGood, StorageRoom, StorageUnit, StorageItem } from '../types';
import { SearchIcon } from './icons/SearchIcon';
import { QrCodeIcon } from './icons/QrCodeIcon';
import { CubeIcon } from './icons/CubeIcon';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { PencilIcon } from './icons/PencilIcon';
import { XIcon } from './icons/XIcon';
import { Download } from './invoices/Icons';
import Modal from './Modal';
import { QRCodeSVG } from 'qrcode.react';

interface StorageManagerProps {
  rooms: StorageRoom[];
  setRooms: React.Dispatch<React.SetStateAction<StorageRoom[]>>;
  units: StorageUnit[];
  setUnits: React.Dispatch<React.SetStateAction<StorageUnit[]>>;
  items: StorageItem[];
  setItems: React.Dispatch<React.SetStateAction<StorageItem[]>>;
  receivedGoods: ReceivedGood[];
  addLogEntry: (action: string, details: string) => void;
}

const DEFAULT_ROOMS = [
    { id: 'room-assembly', name: 'Assembly Room' },
    { id: 'room-storage', name: 'Storage Room' },
    { id: 'room-office', name: 'Office' },
    { id: 'room-machine', name: 'Machine Room' },
    { id: 'room-meeting', name: 'Meeting Room' }
];

// Helper to chunk strings for wrapping text in SVG
const chunkString = (str: string, length: number) => {
    return str.match(new RegExp('.{1,' + length + '}', 'g')) || [];
};

const StorageManager: React.FC<StorageManagerProps> = ({ 
    rooms, setRooms, units, setUnits, items, setItems, receivedGoods, addLogEntry 
}) => {
    // --- State ---
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
    
    // UI Toggles
    const [searchTerm, setSearchTerm] = useState('');
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [manualQrInput, setManualQrInput] = useState('');
    
    // Modals
    const [isAddUnitModalOpen, setIsAddUnitModalOpen] = useState(false);
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [isRoomEditMode, setIsRoomEditMode] = useState(false);

    // Form Data
    const [newUnitData, setNewUnitData] = useState<{name: string, type: 'rack' | 'cupboard' | 'drawer', sectionCount: number}>({ name: '', type: 'rack', sectionCount: 5 });
    const [newItemData, setNewItemData] = useState<{sectionIndex: number, mode: 'manual' | 'linked', name: string, quantity: number, linkedId: string}>({ sectionIndex: 1, mode: 'manual', name: '', quantity: 1, linkedId: '' });
    const [roomNameEdit, setRoomNameEdit] = useState('');

    // --- Init Default Data ---
    useEffect(() => {
        if (rooms.length === 0) {
            setRooms(DEFAULT_ROOMS);
            setActiveRoomId(DEFAULT_ROOMS[0].id);
        } else if (!activeRoomId && rooms.length > 0) {
            setActiveRoomId(rooms[0].id);
        }
    }, [rooms]);

    // --- Helpers ---
    const getUnitName = (id: string) => units.find(u => u.id === id)?.name || 'Unknown Unit';
    const getRoomName = (id: string) => rooms.find(r => r.id === id)?.name || 'Unknown Room';

    // --- Search Logic ---
    const searchResults = useMemo(() => {
        if (!searchTerm) return [];
        const term = searchTerm.toLowerCase();
        
        return items.filter(item => item.name.toLowerCase().includes(term) || item.description?.toLowerCase().includes(term))
            .map(item => {
                const unit = units.find(u => u.id === item.unitId);
                const room = rooms.find(r => r.id === unit?.roomId);
                return { ...item, unitName: unit?.name, roomName: room?.name, type: unit?.type };
            });
    }, [searchTerm, items, units, rooms]);

    // --- Room Actions ---
    const handleAddRoom = () => {
        const name = prompt("Enter new room name:");
        if (name) {
            const newRoom = { id: `room-${Date.now()}`, name };
            setRooms(prev => [...prev, newRoom]);
            setActiveRoomId(newRoom.id);
            addLogEntry('Storage', `Added room: ${name}`);
        }
    };

    const handleDeleteRoom = (id: string) => {
        if (confirm("Delete this room and ALL contents? This cannot be undone.")) {
            // Cascade delete
            const unitsInRoom = units.filter(u => u.roomId === id);
            const unitIds = new Set(unitsInRoom.map(u => u.id));
            
            setItems(prev => prev.filter(i => !unitIds.has(i.unitId)));
            setUnits(prev => prev.filter(u => u.roomId !== id));
            setRooms(prev => prev.filter(r => r.id !== id));
            
            if (activeRoomId === id) setActiveRoomId(rooms[0]?.id || null);
            addLogEntry('Storage', `Deleted room ID: ${id}`);
        }
    };

    const handleRenameRoom = () => {
        if (!activeRoomId) return;
        setRooms(prev => prev.map(r => r.id === activeRoomId ? { ...r, name: roomNameEdit } : r));
        setIsRoomEditMode(false);
    };

    // --- Unit Actions ---
    const handleAddUnit = () => {
        if (!activeRoomId) return;
        const newUnit: StorageUnit = {
            id: `unit-${Date.now()}`,
            roomId: activeRoomId,
            name: newUnitData.name || `${newUnitData.type.toUpperCase()} ${units.filter(u => u.roomId === activeRoomId).length + 1}`,
            type: newUnitData.type,
            sectionCount: newUnitData.sectionCount
        };
        setUnits(prev => [...prev, newUnit]);
        setIsAddUnitModalOpen(false);
        setNewUnitData({ name: '', type: 'rack', sectionCount: 5 });
        addLogEntry('Storage', `Added ${newUnit.type} '${newUnit.name}' to ${getRoomName(activeRoomId)}`);
    };

    const handleDeleteUnit = (id: string) => {
        if (confirm("Delete this storage unit and all items inside?")) {
            setItems(prev => prev.filter(i => i.unitId !== id));
            setUnits(prev => prev.filter(u => u.id !== id));
            if (activeUnitId === id) setActiveUnitId(null);
        }
    };

    // --- Item Actions ---
    const handleAddItem = (sectionIndex: number) => {
        // Defaulting to 'manual' mode as requested
        setNewItemData({ ...newItemData, sectionIndex, name: '', quantity: 1, linkedId: '', mode: 'manual' });
        setIsAddItemModalOpen(true);
    };

    const handleSaveItem = () => {
        if (!activeUnitId) return;
        
        if (newItemData.mode === 'manual') {
            // Handle Multi-line Paste
            const lines = newItemData.name.split(/\r?\n/).filter(line => line.trim() !== '');
            
            if (lines.length === 0) return alert("Please provide an item name.");

            const newItems: StorageItem[] = lines.map((line, idx) => ({
                id: `item-${Date.now()}-${idx}`,
                unitId: activeUnitId,
                sectionIndex: newItemData.sectionIndex,
                name: line.trim(),
                quantity: newItemData.quantity, // Applies quantity to EACH item line
                linkedInventoryId: undefined,
                timestamp: Date.now()
            }));

            setItems(prev => [...prev, ...newItems]);
            addLogEntry('Storage', `Added ${lines.length} items to unit.`);

        } else {
            // Linked Mode (Single Item)
            let finalName = newItemData.name;
            if (newItemData.linkedId) {
                const linkedGood = receivedGoods.find(g => g.id === newItemData.linkedId);
                if (linkedGood) finalName = linkedGood.name;
            }

            if (!finalName) return alert("Please select from inventory.");

            const newItem: StorageItem = {
                id: `item-${Date.now()}`,
                unitId: activeUnitId,
                sectionIndex: newItemData.sectionIndex,
                name: finalName,
                quantity: newItemData.quantity,
                linkedInventoryId: newItemData.linkedId,
                timestamp: Date.now()
            };

            setItems(prev => [...prev, newItem]);
        }

        setIsAddItemModalOpen(false);
    };

    const handleRemoveItem = (id: string) => {
        if (confirm("Remove this item?")) {
            setItems(prev => prev.filter(i => i.id !== id));
        }
    };

    // --- QR Scanner Simulator ---
    const handleSimulateScan = (e: React.FormEvent) => {
        e.preventDefault();
        const code = manualQrInput.trim();
        
        // Extract ID if full URL
        let unitId = code;
        if (code.includes('public_storage=')) {
            try {
                const url = new URL(code);
                unitId = url.searchParams.get('public_storage') || '';
            } catch (e) {
                unitId = code;
            }
        }
        
        const unit = units.find(u => u.id === unitId || u.name.toLowerCase() === unitId.toLowerCase());
        
        if (unit) {
            setActiveRoomId(unit.roomId);
            setActiveUnitId(unit.id);
            setIsScannerOpen(false);
            setManualQrInput('');
        } else {
            alert("Storage Unit not found locally.");
        }
    };

    const handleDownloadQR = (unitId: string) => {
        const svg = document.getElementById(`qr-${unitId}`);
        if (!svg) return;
        
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();
        
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            if (ctx) {
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                const pngFile = canvas.toDataURL("image/png");
                const downloadLink = document.createElement("a");
                downloadLink.download = `QR_${getUnitName(unitId)}.png`;
                downloadLink.href = pngFile;
                downloadLink.click();
            }
        };
        img.src = "data:image/svg+xml;base64," + btoa(svgData);
    };

    const activeRoom = rooms.find(r => r.id === activeRoomId);
    const activeRoomUnits = units.filter(u => u.roomId === activeRoomId);
    const activeUnit = units.find(u => u.id === activeUnitId);

    // Dynamic QR URL Generation
    const getQrUrl = (unitId: string) => {
        const baseUrl = "https://inventory.cnergy.co.in/";
        return `${baseUrl}?public_storage=${unitId}`;
    };

    return (
        <div className="animate-fade-in space-y-6 pb-20">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Storage Management</h1>
                    <p className="text-sm text-gray-500">Manage Racks, Cupboards, Drawers & Inventory Locations.</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Search stored items..." 
                            className="pl-8 p-2 border rounded-lg text-sm w-64 focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    </div>
                    <button 
                        onClick={() => setIsScannerOpen(true)}
                        className="flex items-center bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-900 shadow-sm text-sm"
                    >
                        <QrCodeIcon className="mr-2" size={16}/> Scan QR
                    </button>
                </div>
            </div>

            {/* Global Search Results */}
            {searchTerm && searchResults.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                    <h3 className="font-bold text-indigo-800 mb-2">Found Items ({searchResults.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {searchResults.map(res => (
                            <div key={res.id} onClick={() => { setActiveRoomId(units.find(u => u.id === res.unitId)?.roomId || null); setActiveUnitId(res.unitId); setSearchTerm(''); }} className="bg-white p-3 rounded shadow-sm flex justify-between cursor-pointer hover:shadow-md">
                                <div>
                                    <p className="font-bold text-gray-800">{res.name}</p>
                                    <p className="text-xs text-gray-500">{res.roomName} &gt; {res.unitName} &gt; Sec {res.sectionIndex}</p>
                                </div>
                                <span className="font-bold text-indigo-600">x{res.quantity}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Room Tabs */}
            <div className="border-b border-gray-200 flex items-center gap-1 overflow-x-auto scrollbar-hide">
                {rooms.map(room => (
                    <button
                        key={room.id}
                        onClick={() => { setActiveRoomId(room.id); setActiveUnitId(null); setIsRoomEditMode(false); }}
                        className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeRoomId === room.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onDoubleClick={() => { setRoomNameEdit(room.name); setIsRoomEditMode(true); }}
                    >
                        {room.name}
                    </button>
                ))}
                <button onClick={handleAddRoom} className="px-3 py-2 text-gray-400 hover:text-indigo-600 transition-colors" title="Add Room"><PlusIcon/></button>
            </div>

            {/* Room Actions Bar */}
            {activeRoomId && (
                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-md border border-gray-100">
                    <div className="flex items-center gap-2">
                        {isRoomEditMode ? (
                            <div className="flex gap-1">
                                <input value={roomNameEdit} onChange={e => setRoomNameEdit(e.target.value)} className="border rounded px-2 py-1 text-sm" autoFocus />
                                <button onClick={handleRenameRoom} className="text-xs bg-green-600 text-white px-2 rounded">Save</button>
                                <button onClick={() => setIsRoomEditMode(false)} className="text-xs bg-gray-300 px-2 rounded">Cancel</button>
                            </div>
                        ) : (
                            <span className="text-sm text-gray-500 ml-2">Double-click tab to rename room.</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => handleDeleteRoom(activeRoomId)} className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded border border-transparent hover:border-red-200">Delete Room</button>
                        <button onClick={() => setIsAddUnitModalOpen(true)} className="flex items-center text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 font-bold shadow-sm">
                            <PlusIcon className="w-3 h-3 mr-1" /> Add Storage Unit
                        </button>
                    </div>
                </div>
            )}

            {/* Unit Grid (if no unit selected) */}
            {activeRoomId && !activeUnitId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {activeRoomUnits.map(unit => (
                        <div key={unit.id} onClick={() => setActiveUnitId(unit.id)} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-all active:scale-95 group relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => {e.stopPropagation(); handleDeleteUnit(unit.id);}} className="p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200"><TrashIcon/></button>
                            </div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className={`p-3 rounded-lg ${unit.type === 'rack' ? 'bg-orange-100 text-orange-600' : unit.type === 'drawer' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                                    <CubeIcon className="w-6 h-6"/>
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800">{unit.name}</h3>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">{unit.type}</p>
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 flex justify-between items-center bg-gray-50 p-2 rounded">
                                <span>{unit.sectionCount} Sections</span>
                                <span className="font-bold">{items.filter(i => i.unitId === unit.id).length} Items</span>
                            </div>
                        </div>
                    ))}
                    {activeRoomUnits.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <p>No storage units in this room.</p>
                            <button onClick={() => setIsAddUnitModalOpen(true)} className="text-indigo-600 hover:underline mt-2 text-sm">Add one now</button>
                        </div>
                    )}
                </div>
            )}

            {/* Detailed Unit View */}
            {activeUnit && (
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-fade-in">
                    <div className="bg-slate-800 text-white p-4 flex justify-between items-center sticky top-0 z-10">
                        <div>
                            <button onClick={() => setActiveUnitId(null)} className="text-slate-400 hover:text-white text-sm mb-1 flex items-center gap-1">← Back to {activeRoom?.name}</button>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <CubeIcon className="w-5 h-5 opacity-70"/> {activeUnit.name}
                            </h2>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">{activeUnit.type} • {activeUnit.sectionCount} Sections</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setIsQrModalOpen(true)} className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 border border-white/20">
                                <QrCodeIcon className="w-4 h-4"/> Generate QR Label
                            </button>
                        </div>
                    </div>

                    <div className="p-6 grid gap-6">
                        {Array.from({ length: activeUnit.sectionCount }).map((_, idx) => {
                            const sectionIndex = idx + 1;
                            const sectionItems = items.filter(i => i.unitId === activeUnit.id && i.sectionIndex === sectionIndex);
                            const label = activeUnit.type === 'drawer' ? `Drawer ${sectionIndex}` : activeUnit.type === 'rack' ? `Shelf ${sectionIndex}` : `Section ${sectionIndex}`;

                            return (
                                <div key={sectionIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                                        <span className="font-bold text-gray-700 text-sm">{label}</span>
                                        <button onClick={() => handleAddItem(sectionIndex)} className="text-xs bg-white hover:bg-indigo-50 text-indigo-600 border border-gray-300 px-2 py-1 rounded flex items-center transition-colors">
                                            <PlusIcon className="w-3 h-3 mr-1"/> Add Item
                                        </button>
                                    </div>
                                    <div className="p-3 bg-gray-50/30 min-h-[60px]">
                                        {sectionItems.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {sectionItems.map(item => (
                                                    <div key={item.id} className="bg-white border border-gray-200 shadow-sm pl-3 pr-2 py-2 rounded-md flex items-center gap-3 group">
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-800">{item.name}</p>
                                                            {item.linkedInventoryId && <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded uppercase tracking-wide">Linked</span>}
                                                            <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                                                        </div>
                                                        <button onClick={() => handleRemoveItem(item.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                                            <XIcon className="w-3 h-3"/>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 italic text-center py-2">Empty</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* --- MODALS --- */}

            {/* Add Unit Modal */}
            <Modal isOpen={isAddUnitModalOpen} onClose={() => setIsAddUnitModalOpen(false)} title="Add Storage Unit">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unit Name</label>
                        <input className="w-full p-2 border rounded" placeholder="e.g. Rack 5, Tools Cupboard" value={newUnitData.name} onChange={e => setNewUnitData({...newUnitData, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <select className="w-full p-2 border rounded bg-white" value={newUnitData.type} onChange={e => setNewUnitData({...newUnitData, type: e.target.value as any})}>
                                <option value="rack">Rack</option>
                                <option value="cupboard">Cupboard</option>
                                <option value="drawer">Drawer Unit</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Sections (Shelves/Drawers)</label>
                            <input type="number" min="1" max="20" className="w-full p-2 border rounded" value={newUnitData.sectionCount} onChange={e => setNewUnitData({...newUnitData, sectionCount: parseInt(e.target.value)})} />
                        </div>
                    </div>
                    <div className="flex justify-end pt-4">
                        <button onClick={handleAddUnit} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold">Create Unit</button>
                    </div>
                </div>
            </Modal>

            {/* Add Item Modal */}
            <Modal isOpen={isAddItemModalOpen} onClose={() => setIsAddItemModalOpen(false)} title="Add Item to Storage">
                <div className="space-y-4">
                    <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                        <button onClick={() => setNewItemData({...newItemData, mode: 'manual'})} className={`flex-1 py-1.5 text-sm font-medium rounded-md ${newItemData.mode === 'manual' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Manual Entry</button>
                        <button onClick={() => setNewItemData({...newItemData, mode: 'linked'})} className={`flex-1 py-1.5 text-sm font-medium rounded-md ${newItemData.mode === 'linked' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>From Inventory</button>
                    </div>

                    {newItemData.mode === 'linked' ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Select Inventory Item</label>
                            <input 
                                list="inventory-list" 
                                className="w-full p-2 border rounded" 
                                placeholder="Search inventory..."
                                onChange={(e) => {
                                    const val = e.target.value;
                                    // Find ID from datalist value (assuming format Name [ID]) or just match name
                                    const good = receivedGoods.find(g => g.name === val);
                                    if (good) setNewItemData({...newItemData, linkedId: good.id});
                                }}
                            />
                            <datalist id="inventory-list">
                                {receivedGoods.map(g => <option key={g.id} value={g.name}>{g.category} - Qty: {g.quantity}</option>)}
                            </datalist>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Item Name / Description</label>
                            <textarea 
                                className="w-full p-2 border rounded h-24" 
                                placeholder="e.g. Spare Screws (Type 1 for single item)&#10;Or paste list:&#10;Screw M4&#10;Washer M4" 
                                value={newItemData.name} 
                                onChange={e => setNewItemData({...newItemData, name: e.target.value})} 
                            />
                            <p className="text-xs text-gray-500 mt-1">Tip: Paste multiple lines to add multiple items at once.</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (per item)</label>
                        <input type="number" min="1" className="w-full p-2 border rounded" value={newItemData.quantity} onChange={e => setNewItemData({...newItemData, quantity: parseInt(e.target.value)})} />
                    </div>

                    <div className="flex justify-end pt-4">
                        <button onClick={handleSaveItem} className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold">Add Item(s)</button>
                    </div>
                </div>
            </Modal>

            {/* QR Scanner Modal */}
            <Modal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} title="Scan Location QR">
                <div className="flex flex-col items-center justify-center p-6 space-y-6">
                    <div className="w-48 h-48 border-4 border-slate-800 rounded-lg flex items-center justify-center bg-gray-100 relative overflow-hidden">
                        <div className="absolute inset-0 border-t-4 border-green-500 animate-scan"></div>
                        <QrCodeIcon size={64} className="text-gray-300"/>
                        <p className="absolute bottom-2 text-xs text-gray-500 font-medium">Camera Simulator</p>
                    </div>
                    <form onSubmit={handleSimulateScan} className="w-full">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Simulate Scan (Enter Unit Name or ID)</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-slate-500 outline-none"
                                placeholder="e.g. Rack A..."
                                value={manualQrInput}
                                onChange={e => setManualQrInput(e.target.value)}
                                autoFocus
                            />
                            <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded-md font-bold hover:bg-slate-900">Go</button>
                        </div>
                    </form>
                </div>
            </Modal>

            {/* QR Generation Modal */}
            <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title="Unit QR Label">
                {activeUnit && (
                    <div className="flex flex-col items-center space-y-6 p-4">
                        {/* SVG based label for perfect vector scaling and download compatibility. 
                            Aspect Ratio 50:30 (e.g. 50mm x 30mm)
                            Canvas Resolution: 500px x 300px (High Quality)
                        */}
                        <svg 
                            id={`qr-${activeUnit.id}`} 
                            width="500" 
                            height="300" 
                            viewBox="0 0 50 30" 
                            xmlns="http://www.w3.org/2000/svg"
                            className="bg-white border border-black shadow-sm"
                            style={{ maxWidth: '100%', height: 'auto' }}
                        >
                            <rect x="0" y="0" width="50" height="30" fill="white" />
                            
                            {/* Nested SVG for QRCode - Left Aligned */}
                            {/* Explicit width/height attributes ensure XMLSerializer captures it correctly */}
                            <svg x="2" y="4" width="22" height="22">
                                <QRCodeSVG 
                                    value={getQrUrl(activeUnit.id)} 
                                    width="100%"
                                    height="100%"
                                    level="M"
                                    includeMargin={false}
                                    style={{ width: '100%', height: '100%' }}
                                />
                            </svg>

                            {/* Text Info - Right Aligned */}
                            
                            {/* Unit Name (Bold, up to 2 lines) */}
                            <text x="26" y="8" fontFamily="Arial, sans-serif" fontSize="3" fontWeight="bold" fill="black">
                                {chunkString(activeUnit.name.toUpperCase(), 10).slice(0, 2).map((chunk, i) => (
                                    <tspan x="26" dy={i === 0 ? 0 : 3.5} key={i}>{chunk}</tspan>
                                ))}
                            </text>

                            {/* Room Name */}
                            <text x="26" y="15.5" fontFamily="Arial, sans-serif" fontSize="2.2" fill="#555555">
                                {getRoomName(activeUnit.roomId).substring(0, 18)}
                            </text>

                            {/* URL (Monospace, wrapped, multiple lines) */}
                            <text x="26" y="19" fontFamily="Monospace" fontSize="1.2" fill="#999999">
                                {chunkString(getQrUrl(activeUnit.id), 22).slice(0, 5).map((chunk, i) => (
                                    <tspan x="26" dy={i === 0 ? 0 : 1.5} key={i}>{chunk}</tspan>
                                ))}
                            </text>
                        </svg>

                        <button onClick={() => handleDownloadQR(activeUnit.id)} className="flex items-center bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">
                            <Download size={16} className="mr-2"/> Download Label Image
                        </button>
                        <p className="text-xs text-gray-400">Dimensions: 50mm x 30mm (Ratio 5:3)</p>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default StorageManager;
