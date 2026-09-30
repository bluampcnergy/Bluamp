
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { StorageUnit, StorageItem, StorageRoom } from '../types';
import { CubeIcon } from './icons/CubeIcon';
import { SearchIcon } from './icons/SearchIcon';

interface PublicStorageViewerProps {
  unitId: string;
}

const PublicStorageViewer: React.FC<PublicStorageViewerProps> = ({ unitId }) => {
  const [unit, setUnit] = useState<StorageUnit | null>(null);
  const [room, setRoom] = useState<StorageRoom | null>(null);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch Unit Details
        const { data: unitData, error: unitError } = await supabase
          .from('storage_units')
          .select('*')
          .eq('id', unitId)
          .single();

        if (unitError || !unitData) throw new Error("Storage Unit not found.");
        setUnit(unitData as StorageUnit);

        // 2. Fetch Room Details
        if (unitData.roomId) {
            const { data: roomData } = await supabase
            .from('storage_rooms')
            .select('*')
            .eq('id', unitData.roomId)
            .single();
            if (roomData) setRoom(roomData as StorageRoom);
        }

        // 3. Fetch Items in Unit
        const { data: itemsData } = await supabase
          .from('storage_items')
          .select('*')
          .eq('unitId', unitId);
        
        if (itemsData) setItems(itemsData as StorageItem[]);

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [unitId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading Storage Details...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-red-50 text-red-600 p-4 text-center">Error: {error}</div>;
  if (!unit) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans">
        <div className="max-w-md mx-auto space-y-4">
            {/* Header Card */}
            <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-indigo-600">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-indigo-700 font-bold uppercase tracking-wider text-xs">
                        <CubeIcon className="w-4 h-4"/> 
                        Datlion Storage
                    </div>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{unit.type.toUpperCase()}</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">{unit.name}</h1>
                <p className="text-sm text-gray-500">{room?.name || 'Unknown Location'}</p>
            </div>

            {/* Contents List */}
            <div className="space-y-4">
                <h3 className="font-bold text-gray-700 ml-1 text-sm uppercase">Contents ({items.length})</h3>
                
                {Array.from({ length: unit.sectionCount }).map((_, idx) => {
                    const sectionId = idx + 1;
                    const sectionItems = items.filter(i => i.sectionIndex === sectionId);
                    const label = unit.type === 'drawer' ? `Drawer ${sectionId}` : unit.type === 'rack' ? `Shelf ${sectionId}` : `Section ${sectionId}`;

                    if (sectionItems.length === 0) return null; // Hide empty shelves in public view to save space

                    return (
                        <div key={sectionId} className="bg-white rounded-lg shadow-sm overflow-hidden">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                                <span className="text-xs font-bold text-gray-500 uppercase">{label}</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {sectionItems.map(item => (
                                    <div key={item.id} className="p-3 flex justify-between items-center">
                                        <div>
                                            <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                                            {item.description && <p className="text-xs text-gray-400">{item.description}</p>}
                                        </div>
                                        <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2 py-1 rounded">
                                            x{item.quantity}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {items.length === 0 && (
                    <div className="text-center py-10 bg-white rounded-xl text-gray-400">
                        <p>This unit is currently empty.</p>
                    </div>
                )}
            </div>

            <div className="text-center pt-8 text-xs text-gray-400">
                <p>Datlion Cnergy Inventory System</p>
            </div>
        </div>
    </div>
  );
};

export default PublicStorageViewer;
