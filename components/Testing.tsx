
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { ReceivedGood, TestResult, User } from '../types';
import { supabase } from '../supabaseClient';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { PencilIcon } from './icons/PencilIcon';
import { ImportIcon } from './icons/ImportIcon';
import { SearchIcon } from './icons/SearchIcon';
import { ChevronDown, ChevronUp, Download, Save, Package } from './invoices/Icons';
import { ArrowRightIcon } from './icons/ArrowRightIcon';

interface TestingProps {
    receivedGoods: ReceivedGood[];
    testResults: TestResult[];
    setTestResults: React.Dispatch<React.SetStateAction<TestResult[]>>;
    addLogEntry: (action: string, details: string) => void;
    currentUser: User | null;
    setReceivedGoods?: React.Dispatch<React.SetStateAction<ReceivedGood[]>>;
    onSendToProduction?: (data: { receivedGoodId: string; serials: string[] }) => void;
}

type SortKey = 'index' | 'voltage' | 'resistance' | 'capacity';
type SortDirection = 'asc' | 'desc' | 'none';
type GradeMode = 'resistance' | 'capacity' | 'voltage';

// Helper for Roman Numerals
const toRoman = (num: number): string => {
    if (num < 1) return "";
    const lookup: Record<string, number> = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
    let roman = '';
    for (let i in lookup) {
        while (num >= lookup[i]) {
            roman += i;
            num -= lookup[i];
        }
    }
    return roman;
};

const Testing: React.FC<TestingProps> = ({ receivedGoods, testResults, setTestResults, addLogEntry, currentUser, setReceivedGoods, onSendToProduction }) => {
    const [selectedBatch, setSelectedBatch] = useState<ReceivedGood | null>(null);
    const [isLoadingBatchData, setIsLoadingBatchData] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [serialSearchTerm, setSerialSearchTerm] = useState('');

    // Selection State
    const [selectedSerials, setSelectedSerials] = useState<Set<string>>(new Set());

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'index', direction: 'asc' });

    // Grading State
    const [gradingConfig, setGradingConfig] = useState({
        lowerLimit: 0,
        upperLimit: 0,
        numGrades: 5,
        totalCells: 0,
        mode: 'capacity' as GradeMode
    });

    const [legend, setLegend] = useState<{ label: string, range: string, color: string }[]>([]);
    const [showGrading, setShowGrading] = useState(false);
    const [gradeFilter, setGradeFilter] = useState<string>('all');
    const [batchLocation, setBatchLocation] = useState<string>('');
    const [showBatchNote, setShowBatchNote] = useState(false);

    // Smart Cell Selection State
    const [desiredQuantity, setDesiredQuantity] = useState<number>(16);
    const [permittedGrades, setPermittedGrades] = useState<Set<string>>(new Set());
    const [cellSortOrder, setCellSortOrder] = useState<'cap_desc' | 'cap_asc' | 'res_asc' | 'res_desc' | 'cap_desc_res_asc' | 'res_asc_cap_desc'>('cap_asc');
    const [selectionFeedback, setSelectionFeedback] = useState<{ type: 'success' | 'warning' | 'info'; message: string } | null>(null);
    const [showAutoSelectPanel, setShowAutoSelectPanel] = useState(true);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filter eligible goods sorted by date desc
    const eligibleGoods = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return receivedGoods.filter(good => {
            const cat = (good.category || '').trim().toLowerCase();
            const isTargetCategory = cat.includes('cell') || cat.includes('bms');
            const hasSerials = Array.isArray(good.serials) && good.serials.length > 0;
            return isTargetCategory && hasSerials;
        }).filter(good =>
            good.name.toLowerCase().includes(term) ||
            (good.category || '').toLowerCase().includes(term) ||
            (good.makeModel || '').toLowerCase().includes(term) ||
            (good.supplier || '').toLowerCase().includes(term) ||
            (good.serials || []).some(s => s.toLowerCase().includes(term))
        ).sort((a, b) => b.timestamp - a.timestamp);
    }, [receivedGoods, searchTerm]);

    // Update Legend when config changes
    useEffect(() => {
        const { lowerLimit, upperLimit, numGrades } = gradingConfig;
        if (numGrades <= 0 || upperLimit <= lowerLimit) {
            setLegend([]);
            return;
        }

        const range = upperLimit - lowerLimit;
        const step = range / numGrades;
        const newLegend = [];

        for (let i = 0; i < numGrades; i++) {
            const start = lowerLimit + (i * step);
            const end = lowerLimit + ((i + 1) * step);
            // Alternating simple colors for visual distinction
            const colors = [
                'bg-green-100 text-green-800 border-green-200',
                'bg-blue-100 text-blue-800 border-blue-200',
                'bg-indigo-100 text-indigo-800 border-indigo-200',
                'bg-purple-100 text-purple-800 border-purple-200',
                'bg-pink-100 text-pink-800 border-pink-200',
                'bg-yellow-100 text-yellow-800 border-yellow-200'
            ];

            newLegend.push({
                label: `Grade ${toRoman(i + 1)}`,
                range: `${start.toFixed(3)} - ${end.toFixed(3)}`,
                color: colors[i % colors.length]
            });
        }
        setLegend(newLegend);

    }, [gradingConfig]);

    const handleOpenBatch = async (good: ReceivedGood) => {
        setSelectedBatch(good);
        setSerialSearchTerm('');
        setSortConfig({ key: 'index', direction: 'asc' });
        setGradeFilter('all');
        setBatchLocation('');
        setShowGrading(true); // Default open
        setSelectedSerials(new Set()); // Reset selection
        setIsLoadingBatchData(true);

        // Fetch full testing data specifically for this batch from database
        try {
            const { data, error } = await supabase
                .from('test_results')
                .select('*')
                .eq('receivedGoodId', good.id);

            if (!error && data) {
                setTestResults(prev => {
                    const otherBatches = prev.filter(r => r.receivedGoodId !== good.id);
                    return [...otherBatches, ...data];
                });
            }
        } catch (err) {
            console.error('Failed to fetch complete test results for batch:', err);
        } finally {
            setIsLoadingBatchData(false);
        }

        // Check if grading config already exists on the batch
        const savedConfig = good.gradingConfig || (good as any).gradingconfig;

        if (savedConfig) {
            setGradingConfig({
                lowerLimit: Number(savedConfig.lowerLimit),
                upperLimit: Number(savedConfig.upperLimit),
                numGrades: Number(savedConfig.numGrades) || 5,
                totalCells: good.serials.length,
                mode: savedConfig.mode || 'capacity'
            });

            // Try to pre-fill location if all existing have same location
            const existingResults = testResults.filter(r => r.receivedGoodId === good.id);
            const firstLoc = existingResults[0]?.location;
            if (firstLoc) {
                setBatchLocation(firstLoc);
            }
        } else {
            // Smart Defaults: Scan existing results to set Min/Max
            const existingResults = testResults.filter(r => r.receivedGoodId === good.id);
            const totalCells = good.serials.length;

            let minVal = 0;
            let maxVal = 0;

            // Default to capacity mode for scanning
            if (existingResults.length > 0) {
                const capacities = existingResults.map(r => r.capacity || 0).filter(c => c > 0);
                if (capacities.length > 0) {
                    minVal = Math.min(...capacities);
                    maxVal = Math.max(...capacities);
                }

                // Try to pre-fill location if all existing have same location
                const firstLoc = existingResults[0]?.location;
                if (firstLoc) {
                    setBatchLocation(firstLoc);
                }
            }

            setGradingConfig({
                lowerLimit: minVal > 0 ? Math.floor(minVal * 100) / 100 : 3000,
                upperLimit: maxVal > 0 ? Math.ceil(maxVal * 100) / 100 : 3200,
                numGrades: 5,
                totalCells: totalCells,
                mode: 'capacity'
            });
        }
    };

    const handleReportLinkChange = (value: string) => {
        if (!selectedBatch || !setReceivedGoods) return;
        const updatedGood = { ...selectedBatch, testReportLink: value };
        setSelectedBatch(updatedGood); // Update local view
    };

    const handleInputChange = (serial: string, changes: Partial<TestResult>) => {
        if (!selectedBatch) return;

        let itemToSave: TestResult | null = null;
        setTestResults(prev => {
            const updated = [...prev];
            const existingIdx = updated.findIndex(r => r.receivedGoodId === selectedBatch.id && r.serialNumber === serial);
            const batchCat = (selectedBatch.category || '').toLowerCase();
            const category = batchCat.includes('cell') ? 'Cell' : 'BMS';

            if (existingIdx > -1) {
                itemToSave = {
                    ...updated[existingIdx],
                    ...changes,
                    timestamp: Date.now(),
                    testedBy: currentUser?.username || 'user'
                };
                updated[existingIdx] = itemToSave;
            } else {
                // Safe Serial ID generation
                const safeSerial = serial.replace(/[^a-zA-Z0-9]/g, '_');

                itemToSave = {
                    id: `test-${selectedBatch.id}-${safeSerial}`,
                    receivedGoodId: selectedBatch.id,
                    serialNumber: serial,
                    category: category as 'Cell' | 'BMS',
                    timestamp: Date.now(),
                    testedBy: currentUser?.username || 'user',
                    ...changes
                };
                updated.push(itemToSave);
            }
            return updated;
        });

        if (itemToSave) {
            const targetItem = itemToSave as TestResult;
            const dbPayload = {
                ...targetItem,
                voltage: targetItem.voltage !== undefined && !isNaN(targetItem.voltage) ? targetItem.voltage : null,
                resistance: targetItem.resistance !== undefined && !isNaN(targetItem.resistance) ? targetItem.resistance : null,
                capacity: targetItem.capacity !== undefined && !isNaN(targetItem.capacity) ? targetItem.capacity : null,
                grade: targetItem.grade || null,
                location: targetItem.location || null,
            };
            supabase.from('test_results').upsert([dbPayload]).then(({ error }) => {
                if (error) console.error('Error persisting test result change to Supabase:', error);
            });
        }
    };

    // Helper to get result
    const getResult = (serial: string): Partial<TestResult> => {
        return testResults.find(r => r.receivedGoodId === selectedBatch?.id && (r.serialNumber || '').trim() === serial.trim()) || {};
    };

    // --- Sorting Logic ---
    const handleSort = (key: SortKey) => {
        setSortConfig(current => {
            if (current.key === key) {
                if (current.direction === 'asc') return { key, direction: 'desc' };
                if (current.direction === 'desc') return { key: 'index', direction: 'asc' }; // Reset to Index asc
            }
            return { key, direction: 'asc' };
        });
    };

    const processedSerials = useMemo(() => {
        if (!selectedBatch) return [];

        // Use serialIndexMap for persistent numbering (falls back to array position for older batches)
        const indexMap = selectedBatch.serialIndexMap || {};

        // 1. Map to object with data for sorting
        let data = selectedBatch.serials.map((serial, arrayIdx) => {
            const res = getResult(serial);
            return {
                index: indexMap[serial] ?? (arrayIdx + 1), // Persistent # from map, fallback to array position
                serial,
                voltage: res.voltage || 0,
                resistance: res.resistance || Infinity, // Infinity pushes empty to end in asc sort
                capacity: res.capacity || 0,
                grade: res.grade,
                location: res.location
            };
        });

        // 2. Filter by search (Multiple serial support)
        if (serialSearchTerm) {
            const terms = serialSearchTerm.toLowerCase().split(/\s+/).filter(t => t.length > 0);
            if (terms.length > 0) {
                data = data.filter(d => {
                    const s = d.serial.toLowerCase();
                    return terms.some(term => s.includes(term));
                });
            }
        }

        // 3. Filter by Grade
        if (gradeFilter !== 'all') {
            // If filtering by 'U' (ungraded/undefined), check for falsy grade
            if (gradeFilter === 'U') {
                data = data.filter(d => !d.grade || d.grade === 'U');
            } else {
                data = data.filter(d => d.grade === gradeFilter);
            }
        }

        // 4. Sort
        if (sortConfig.key !== 'index' || sortConfig.direction !== 'asc') {
            data.sort((a, b) => {
                const valA = a[sortConfig.key] as number;
                const valB = b[sortConfig.key] as number;

                // Handle sorting with missing data
                if (valA === 0 || valA === Infinity) return 1;
                if (valB === 0 || valB === Infinity) return -1;

                if (sortConfig.direction === 'asc') return valA - valB;
                return valB - valA;
            });
        } else {
            // Default sort by index
            data.sort((a, b) => a.index - b.index);
        }

        return data;
    }, [selectedBatch, serialSearchTerm, sortConfig, testResults, gradeFilter]);

    const handleToggleSelect = (serial: string) => {
        setSelectedSerials(prev => {
            const newSet = new Set(prev);
            if (newSet.has(serial)) newSet.delete(serial);
            else newSet.add(serial);
            return newSet;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            // Select all visible rows
            const allVisible = processedSerials.map(d => d.serial);
            setSelectedSerials(new Set(allVisible));
        } else {
            setSelectedSerials(new Set());
        }
    };

    const handleSendToProductionClick = () => {
        if (!selectedBatch || !onSendToProduction) return;
        if (selectedSerials.size === 0) return alert("Please select at least one serial number.");

        onSendToProduction({
            receivedGoodId: selectedBatch.id,
            serials: Array.from(selectedSerials)
        });
    };

    // --- Apply & Save Logic ---
    const handleApplyAndSave = () => {
        if (!selectedBatch) return;
        const { lowerLimit, upperLimit, numGrades, mode } = gradingConfig;

        if (numGrades <= 0) return alert("Number of grades must be > 0");
        if (upperLimit <= lowerLimit) return alert("Upper limit must be greater than Lower limit");

        const step = (upperLimit - lowerLimit) / numGrades;
        const batchCat = (selectedBatch.category || '').toLowerCase();
        const category = batchCat.includes('cell') ? 'Cell' : 'BMS';

        // 1. Update Test Results with Grades AND Location
        const itemsToSave: TestResult[] = [];
        setTestResults(prev => {
            const updated = [...prev];

            selectedBatch.serials.forEach(serial => {
                const existingIdx = updated.findIndex(r => r.receivedGoodId === selectedBatch.id && r.serialNumber === serial);
                const res: Partial<TestResult> = existingIdx > -1 ? updated[existingIdx] : {};

                // --- Grading Calculation ---
                let val = 0;
                if (mode === 'capacity') val = res.capacity || 0;
                else if (mode === 'voltage') val = res.voltage || 0;
                else if (mode === 'resistance') val = res.resistance || 0;

                let newGrade = '';
                if (val > 0) { // Only grade if value exists
                    if (val < lowerLimit || val > upperLimit) {
                        newGrade = 'Fail';
                    } else {
                        const bin = Math.floor((val - lowerLimit) / step);
                        const safeBin = bin >= numGrades ? numGrades - 1 : bin;
                        newGrade = toRoman(safeBin + 1);
                    }
                }

                // --- Update Logic ---
                if (existingIdx > -1) {
                    const item: TestResult = {
                        ...updated[existingIdx],
                        grade: newGrade || updated[existingIdx].grade, // Keep existing grade if calculation skipped (e.g. no value)
                        location: batchLocation || updated[existingIdx].location, // Bulk update location
                        timestamp: Date.now()
                    };
                    updated[existingIdx] = item;
                    itemsToSave.push(item);
                } else if (newGrade || batchLocation) {
                    // Create entry if we have grading data OR location data
                    const safeSerial = serial.replace(/[^a-zA-Z0-9]/g, '_');
                    const item: TestResult = {
                        id: `test-${selectedBatch.id}-${safeSerial}`,
                        receivedGoodId: selectedBatch.id,
                        serialNumber: serial,
                        category: category as 'Cell' | 'BMS',
                        timestamp: Date.now(),
                        testedBy: currentUser?.username || 'user',
                        grade: newGrade,
                        location: batchLocation
                    };
                    updated.push(item);
                    itemsToSave.push(item);
                }
            });
            return updated;
        });

        if (itemsToSave.length > 0) {
            supabase.from('test_results').upsert(itemsToSave).then(({ error }) => {
                if (error) console.error('Error persisting grading to Supabase:', error);
            });
        }

        // Prepare config object for saving
        const newGradingConfig = {
            lowerLimit: gradingConfig.lowerLimit,
            upperLimit: gradingConfig.upperLimit,
            numGrades: gradingConfig.numGrades,
            mode: gradingConfig.mode
        };

        // 2. Update Received Good (Report Link AND Grading Config)
        if (setReceivedGoods) {
            setReceivedGoods(prev => prev.map(g => {
                if (g.id === selectedBatch.id) {
                    return {
                        ...g,
                        testReportLink: selectedBatch.testReportLink,
                        gradingConfig: newGradingConfig
                    };
                }
                return g;
            }));
        }

        // Update local state for consistency
        setSelectedBatch(prev => prev ? ({
            ...prev,
            testReportLink: selectedBatch.testReportLink,
            gradingConfig: newGradingConfig
        }) : null);

        addLogEntry('Grading Saved', `Updated grading, location, and report link for batch: ${selectedBatch.name}`);
        alert("Grading applied and batch details saved successfully!");
    };

    const handleExportClick = () => {
        // Determine scope: Selected Batch or All
        let dataToExport: Partial<TestResult>[] = [];
        let filename = 'test_results.csv';

        if (selectedBatch) {
            // Export specific batch, including all serials even if not tested yet (for template use)
            filename = `${selectedBatch.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_results.csv`;

            const existingMap = new Map(testResults.filter(r => r.receivedGoodId === selectedBatch.id).map(r => [r.serialNumber, r]));

            dataToExport = selectedBatch.serials.map(serial => {
                const existing = existingMap.get(serial);
                if (existing) return existing;
                return {
                    serialNumber: serial,
                    receivedGoodId: selectedBatch.id
                };
            });
        } else {
            // Export All
            dataToExport = testResults;
            filename = `all_test_results_${new Date().toISOString().slice(0, 10)}.csv`;
        }

        const headers = ["Serial Number", "Voltage", "Resistance", "Capacity", "Grade", "Location"];
        const csvRows = dataToExport.map(item => {
            return [
                `"${item.serialNumber || ''}"`,
                item.voltage ?? '',
                item.resistance ?? '',
                item.capacity ?? '',
                `"${item.grade || ''}"`,
                `"${item.location || batchLocation || ''}"`
            ].join(',');
        });

        const csvContent = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result;
            if (typeof text === 'string') {
                processCsv(text);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const processCsv = (csvText: string) => {
        const lines = csvText.split(/\r?\n/);
        if (lines.length < 2) return;

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
        const serialIdx = headers.findIndex(h => h.includes('serial') || h === 'sn' || h === 's/n' || h.includes('s_n'));
        const voltIdx = headers.findIndex(h => h.includes('voltage') || h.includes('volt') || h === 'v');
        const resIdx = headers.findIndex(h => h.includes('resistance') || h.includes('res') || h.includes('ir') || h.includes('mΩ') || h.includes('mohm'));
        const capIdx = headers.findIndex(h => h.includes('capacity') || h.includes('cap') || h.includes('ah'));
        const gradeIdx = headers.findIndex(h => h.includes('grade'));
        const locIdx = headers.findIndex(h => h.includes('location') || h.includes('rack'));

        if (serialIdx === -1) {
            alert('CSV must contain a "serial number" column.');
            return;
        }

        const newResults: TestResult[] = [];

        // Create a lookup map for serial -> receivedGood
        const serialMap = new Map<string, ReceivedGood>();
        receivedGoods.forEach(g => {
            g.serials.forEach(s => serialMap.set(s, g));
        });

        lines.slice(1).forEach(line => {
            if (!line.trim()) return;
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const serial = values[serialIdx];
            if (!serial) return;

            const good = serialMap.get(serial);
            if (!good) return; // Serial not found in inventory

            const voltage = voltIdx !== -1 ? parseFloat(values[voltIdx]) : undefined;
            const resistance = resIdx !== -1 ? parseFloat(values[resIdx]) : undefined;
            const capacity = capIdx !== -1 ? parseFloat(values[capIdx]) : undefined;
            const grade = gradeIdx !== -1 ? values[gradeIdx] : undefined;
            const location = locIdx !== -1 ? values[locIdx] : undefined;

            const safeVoltage = isNaN(voltage as number) ? undefined : voltage;
            const safeResistance = isNaN(resistance as number) ? undefined : resistance;
            const safeCapacity = isNaN(capacity as number) ? undefined : capacity;

            if (safeVoltage === undefined && safeResistance === undefined && safeCapacity === undefined && !grade && !location) return;

            const safeSerial = serial.replace(/[^a-zA-Z0-9]/g, '_');
            newResults.push({
                id: `test-${good.id}-${safeSerial}`,
                receivedGoodId: good.id,
                serialNumber: serial,
                category: (good.category || '').toLowerCase().includes('cell') ? 'Cell' : 'BMS',
                voltage: safeVoltage,
                resistance: safeResistance,
                capacity: safeCapacity,
                grade: grade || undefined,
                location: location || undefined,
                timestamp: Date.now(),
                testedBy: currentUser?.username || 'Bulk Import',
            });
        });

        if (newResults.length === 0) {
            alert('No matching serial numbers found in the CSV or no valid data parsed.');
            return;
        }

        setTestResults(prev => {
            const updated = [...prev];
            newResults.forEach(newResult => {
                const existingIdx = updated.findIndex(r => r.receivedGoodId === newResult.receivedGoodId && r.serialNumber === newResult.serialNumber);
                if (existingIdx > -1) {
                    updated[existingIdx] = {
                        ...updated[existingIdx],
                        voltage: newResult.voltage ?? updated[existingIdx].voltage,
                        resistance: newResult.resistance ?? updated[existingIdx].resistance,
                        capacity: newResult.capacity ?? updated[existingIdx].capacity,
                        grade: newResult.grade ?? updated[existingIdx].grade,
                        location: newResult.location ?? updated[existingIdx].location,
                        timestamp: Date.now(),
                        testedBy: newResult.testedBy
                    };
                } else {
                    updated.push(newResult);
                }
            });
            return updated;
        });

        // Direct explicit upsert to Supabase database so data is saved immediately
        supabase.from('test_results').upsert(newResults).then(({ error }) => {
            if (error) {
                console.error("Error upserting imported CSV test results to Supabase:", error);
            } else {
                console.log(`Successfully persisted ${newResults.length} CSV test results to Supabase DB.`);
            }
        });

        addLogEntry('Imported Test Results', `Bulk imported test results for ${newResults.length} items.`);
        alert(`Successfully processed ${newResults.length} test results.`);
    };

    const getSortIcon = (key: SortKey) => {
        if (sortConfig.key !== key) return <div className="w-4 h-4 opacity-0 group-hover:opacity-30"><ChevronDown size={14} /></div>;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

    const getGradeColor = (grade: string | undefined) => {
        if (!grade) return 'bg-gray-100 text-gray-500 border-gray-200';
        if (grade === 'Fail') return 'bg-red-100 text-red-800 border-red-200';

        const legendItem = legend.find(l => l.label === `Grade ${grade}`);
        if (legendItem) return legendItem.color;

        if (grade === 'I') return 'bg-green-100 text-green-800 border-green-200';
        if (grade === 'II') return 'bg-blue-100 text-blue-800 border-blue-200';

        return 'bg-gray-100 text-gray-800 border-gray-200';
    };

    // Compute unique grades for filter
    const uniqueGrades = useMemo(() => {
        if (!selectedBatch) return [];
        const grades = new Set<string>();
        selectedBatch.serials.forEach(s => {
            const res = getResult(s);
            if (res.grade) grades.add(res.grade);
        });
        return Array.from(grades).sort((a, b) => {
            if (a === 'Fail') return 1;
            if (b === 'Fail') return -1;
            return a.length - b.length || a.localeCompare(b);
        });
    }, [selectedBatch, testResults]);

    // Keep permittedGrades updated when uniqueGrades change
    useEffect(() => {
        if (uniqueGrades.length > 0) {
            setPermittedGrades(prev => {
                if (prev.size === 0) {
                    const nonFail = uniqueGrades.filter(g => g !== 'Fail');
                    return new Set(nonFail.length > 0 ? [nonFail[0]] : [uniqueGrades[0]]);
                }
                return prev;
            });
        }
    }, [uniqueGrades]);

    const togglePermittedGrade = (grade: string) => {
        setPermittedGrades(prev => {
            const next = new Set(prev);
            if (next.has(grade)) next.delete(grade);
            else next.add(grade);
            return next;
        });
    };

    const handleAutoSelectCells = () => {
        if (!selectedBatch) return;
        if (!desiredQuantity || desiredQuantity <= 0) {
            alert('Please enter a valid number of cells to select (> 0).');
            return;
        }
        if (permittedGrades.size === 0) {
            alert('Please select at least one permitted grade.');
            return;
        }

        // 1. Gather all cells with their test data
        const cellsWithData = selectedBatch.serials.map(serial => {
            const res = getResult(serial);
            return {
                serial,
                voltage: res.voltage ?? 0,
                resistance: (res.resistance !== undefined && !isNaN(res.resistance)) ? res.resistance : Infinity,
                capacity: (res.capacity !== undefined && !isNaN(res.capacity)) ? res.capacity : 0,
                grade: res.grade || 'Ungraded'
            };
        });

        // 2. Filter by permitted grades
        const eligibleCells = cellsWithData.filter(cell => {
            return permittedGrades.has(cell.grade);
        });

        if (eligibleCells.length === 0) {
            setSelectionFeedback({
                type: 'warning',
                message: `No cells found in this batch matching permitted grade(s): ${Array.from(permittedGrades).join(', ')}. Please adjust permitted grades or test/grade more cells.`
            });
            return;
        }

        // 3. Sort eligible cells
        eligibleCells.sort((a, b) => {
            if (cellSortOrder === 'cap_desc') {
                return b.capacity - a.capacity;
            } else if (cellSortOrder === 'cap_asc') {
                return a.capacity - b.capacity;
            } else if (cellSortOrder === 'res_asc') {
                return a.resistance - b.resistance;
            } else if (cellSortOrder === 'res_desc') {
                return b.resistance - a.resistance;
            } else if (cellSortOrder === 'cap_desc_res_asc') {
                if (b.capacity !== a.capacity) {
                    return b.capacity - a.capacity;
                }
                return a.resistance - b.resistance;
            } else if (cellSortOrder === 'res_asc_cap_desc') {
                if (a.resistance !== b.resistance) {
                    return a.resistance - b.resistance;
                }
                return b.capacity - a.capacity;
            }
            return 0;
        });

        // 4. Select top N cells
        const selected = eligibleCells.slice(0, desiredQuantity);
        const selectedSet = new Set(selected.map(c => c.serial));
        setSelectedSerials(selectedSet);

        // 5. Summary metrics
        const count = selected.length;
        const validCapCells = selected.filter(c => c.capacity > 0);
        const avgCap = validCapCells.length > 0
            ? (validCapCells.reduce((sum, c) => sum + c.capacity, 0) / validCapCells.length).toFixed(2)
            : 'N/A';
        const validResCells = selected.filter(c => c.resistance !== Infinity && c.resistance > 0);
        const avgRes = validResCells.length > 0
            ? (validResCells.reduce((sum, c) => sum + c.resistance, 0) / validResCells.length).toFixed(2)
            : 'N/A';

        if (count < desiredQuantity) {
            setSelectionFeedback({
                type: 'warning',
                message: `Selected ${count} cells (only ${count} eligible cells available; ${desiredQuantity} requested). Avg Cap: ${avgCap} Ah, Avg Res: ${avgRes} mΩ.`
            });
        } else {
            setSelectionFeedback({
                type: 'success',
                message: `✅ Selected ${count} cells matching [${Array.from(permittedGrades).join(', ')}] ordered by ${
                    cellSortOrder === 'cap_desc' ? 'Capacity (High→Low)' :
                    cellSortOrder === 'cap_asc' ? 'Capacity (Low→High)' :
                    cellSortOrder === 'res_asc' ? 'Resistance (Low→High)' :
                    cellSortOrder === 'res_desc' ? 'Resistance (High→Low)' :
                    cellSortOrder === 'cap_desc_res_asc' ? 'Capacity Desc + Resistance Asc' :
                    'Resistance Asc + Capacity Desc'
                }. Avg Cap: ${avgCap} Ah, Avg Res: ${avgRes} mΩ.`
            });
        }
    };

    const downloadTestingCSVTemplate = () => {
        const csvContent = "Serial Number,Voltage,Resistance,Capacity,Grade,Location\nLFP-32700-001,3.28,6.5,6000,Grade A,Rack A-1\nLFP-32700-002,3.27,6.8,5950,Grade A,Rack A-1";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'testing_results_template.csv';
        link.click();
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Testing</h1>
                    <p className="text-xs text-gray-500 mt-1">Manage and verify cell/component test results.</p>
                </div>
                <div className="flex space-x-2">
                    {selectedSerials.size > 0 && (
                        <button
                            onClick={handleSendToProductionClick}
                            className="flex items-center bg-[#8EBF45] text-[#0D0D0D] hover:text-white px-4 py-2 rounded-lg shadow-md hover:bg-[#658C3E] transition-colors animate-fade-in font-bold uppercase tracking-wide text-xs"
                        >
                            <ArrowRightIcon size={16} />
                            <span className="ml-2">Send to Production ({selectedSerials.size})</span>
                        </button>
                    )}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".csv,text/csv"
                    />
                </div>
            </div>

            {/* UNIFORM CSV CONTROL BAR */}
            <div className="mb-6 bg-slate-900 text-slate-100 rounded-2xl p-4 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md no-print">
                <div className="flex items-start gap-3">
                    <span className="text-xl">📄</span>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Required CSV Headers:</span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-300 mt-1 leading-relaxed flex flex-wrap gap-1.5 items-center">
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Serial Number</span>
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Voltage</span>
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Resistance</span>
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Capacity</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 self-end md:self-auto shrink-0">
                    <button
                        onClick={handleExportClick}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                        title={selectedBatch ? `Export results for ${selectedBatch.name}` : "Export all test results"}
                    >
                        <Download size={14} />
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={downloadTestingCSVTemplate}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                        title="Download sample CSV template with proper headers"
                    >
                        <span>💾 Download Template CSV</span>
                    </button>

                    <button
                        onClick={handleImportClick}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-2xs whitespace-nowrap flex items-center gap-1.5"
                        title="Import test results from CSV file"
                    >
                        <ImportIcon size={14} />
                        <span>Import CSV</span>
                    </button>
                </div>
            </div>

            {!selectedBatch ? (
                <>
                    <div className="mb-6 relative">
                        <input
                            type="text"
                            placeholder="Search batches by Name, Serial #, Supplier, Make/Model..."
                            className="block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#8EBF45]"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {eligibleGoods.map(good => {
                            const serialsSet = new Set(good.serials.map(s => s.trim()));
                            const totalSerials = good.serials.length;

                            const testedCount = new Set(
                                testResults
                                    .filter(r => r.receivedGoodId === good.id && serialsSet.has((r.serialNumber || '').trim()))
                                    .map(r => (r.serialNumber || '').trim())
                            ).size;

                            const progress = totalSerials > 0 ? Math.round((testedCount / totalSerials) * 100) : 0;
                            const isCell = (good.category || '').toLowerCase().includes('cell');

                            return (
                                <div key={good.id} className="bg-white rounded-lg shadow-md p-5 flex flex-col justify-between hover:shadow-lg transition-shadow cursor-pointer" onClick={() => handleOpenBatch(good)}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mb-2 ${isCell ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>
                                                {good.category || 'Unknown'}
                                            </span>
                                            <h3 className="font-bold text-lg text-gray-900">{good.name}</h3>
                                            <p className="text-sm text-gray-500">{good.makeModel}</p>
                                        </div>
                                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">
                                            {new Date(good.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="mt-4">
                                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                                            <span>Progress</span>
                                            <span>{testedCount} / {totalSerials}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                                            <div className="bg-[#8EBF45] h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <button className="text-[#658C3E] text-sm font-medium hover:underline flex items-center">
                                            Test Batch <PencilIcon />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {eligibleGoods.length === 0 && (
                            <div className="col-span-full text-center py-10 bg-white rounded-lg shadow-sm border border-gray-200">
                                <ExclamationTriangleIcon />
                                <p className="mt-2 text-gray-600 font-medium">No eligible items found.</p>
                                <p className="text-sm text-gray-500 mt-1">
                                    Ensure items in 'Raw Materials' have a category containing "Cell" or "BMS" <br />
                                    and have <strong>Serial Numbers</strong> generated/added.
                                </p>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b pb-4 sticky top-0 bg-white z-10 gap-4">
                        <div>
                            <button onClick={() => setSelectedBatch(null)} className="text-gray-500 hover:text-gray-700 text-sm mb-1">← Back to Batches</button>
                            <h2 className="text-xl font-bold text-gray-800">{selectedBatch.name} <span className="text-gray-500 font-normal">({selectedBatch.category})</span></h2>
                            <p className="text-sm text-gray-500">Batch ID: {selectedBatch.id}</p>
                        </div>
                        <div className="flex flex-col md:flex-row items-end md:items-center gap-3">
                            <div className="flex flex-col">
                                <label className="text-[10px] text-gray-500 font-bold uppercase mb-1">Test Report Link</label>
                                <input
                                    type="text"
                                    placeholder="https://drive..."
                                    className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-[#8EBF45] outline-none w-48 text-sm"
                                    value={selectedBatch.testReportLink || ''}
                                    onChange={(e) => handleReportLinkChange(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col">
                                <label className="text-[10px] text-gray-500 font-bold uppercase mb-1">Location / Rack</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Rack A-1"
                                    className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-[#8EBF45] outline-none w-32 text-sm"
                                    value={batchLocation}
                                    onChange={(e) => setBatchLocation(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col relative">
                                <button
                                    onClick={() => setShowBatchNote(!showBatchNote)}
                                    className={`p-2 rounded-md transition-all text-lg ${(selectedBatch.notes && selectedBatch.notes !== 'actual physical qty = ')
                                        ? 'text-amber-500 hover:bg-amber-50'
                                        : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'
                                        }`}
                                    title="Open note"
                                >
                                    📝
                                    {selectedBatch.notes && selectedBatch.notes !== 'actual physical qty = ' && (
                                        <span className="absolute top-0 right-0 w-2 h-2 bg-amber-400 rounded-full"></span>
                                    )}
                                </button>
                                {showBatchNote && (
                                    <div className="absolute top-10 right-0 z-50 w-64" style={{ animation: 'fadeIn 0.15s ease-out' }}>
                                        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl shadow-2xl p-4" style={{ boxShadow: '4px 4px 15px rgba(0,0,0,0.15)' }}>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">📌 Note</span>
                                                <button onClick={() => setShowBatchNote(false)} className="text-amber-400 hover:text-amber-600 text-xs font-bold p-1">✕</button>
                                            </div>
                                            <textarea
                                                className="w-full bg-transparent border-none outline-none text-sm text-amber-900 resize-none placeholder-amber-300"
                                                rows={3}
                                                placeholder="actual physical qty = "
                                                value={selectedBatch.notes ?? 'actual physical qty = '}
                                                onChange={(e) => {
                                                    if (!setReceivedGoods) return;
                                                    const updated = { ...selectedBatch, notes: e.target.value };
                                                    setSelectedBatch(updated);
                                                    setReceivedGoods(prev => prev.map(g => g.id === selectedBatch.id ? updated : g));
                                                }}
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {isLoadingBatchData && (
                        <div className="mb-4 bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-lg flex items-center justify-between text-xs font-bold animate-pulse">
                            <span>🔄 Syncing full database testing data for all cells in this batch...</span>
                        </div>
                    )}

                    {/* Redesigned Grading Control Panel */}
                    {(selectedBatch.category || '').toLowerCase().includes('cell') && (
                        <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-semibold text-slate-700 flex items-center">
                                    <span className="bg-[#8EBF45] text-[#0D0D0D] text-xs px-2 py-1 rounded mr-2 font-bold">New</span>
                                    Cell Grading System
                                </h3>
                                <button
                                    onClick={() => setShowGrading(!showGrading)}
                                    className="text-xs text-[#658C3E] hover:underline font-bold"
                                >
                                    {showGrading ? 'Hide Grading Tools' : 'Show Grading Tools'}
                                </button>
                            </div>

                            {showGrading && (
                                <div className="animate-fade-in">
                                    {/* Legend Display (Top) */}
                                    <div className="bg-white p-3 rounded-md border border-slate-200 mb-4 shadow-sm">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Grading Legend</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {legend.length > 0 ? legend.map(l => (
                                                <div key={l.label} className={`text-xs px-2 py-1 rounded border font-medium flex items-center gap-1 ${l.color}`}>
                                                    <span className="font-bold">{l.label}:</span> {l.range}
                                                </div>
                                            )) : <span className="text-xs text-gray-400 italic">Configure inputs below to generate legend</span>}
                                            <div className="text-xs px-2 py-1 rounded border bg-red-100 text-red-800 border-red-200 font-medium">
                                                <span className="font-bold">Fail:</span> &lt; Lower or &gt; Upper
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inputs Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Grading Criteria</label>
                                            <select
                                                className="w-full p-2 border rounded text-sm bg-white"
                                                value={gradingConfig.mode}
                                                onChange={e => setGradingConfig({ ...gradingConfig, mode: e.target.value as GradeMode })}
                                            >
                                                <option value="capacity">Capacity (Ah)</option>
                                                <option value="resistance">Resistance (mΩ)</option>
                                                <option value="voltage">Voltage (V)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Lower Limit</label>
                                            <input type="number" step="0.01" className="w-full p-2 border rounded text-sm"
                                                value={gradingConfig.lowerLimit}
                                                onChange={e => setGradingConfig({ ...gradingConfig, lowerLimit: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Upper Limit</label>
                                            <input type="number" step="0.01" className="w-full p-2 border rounded text-sm"
                                                value={gradingConfig.upperLimit}
                                                onChange={e => setGradingConfig({ ...gradingConfig, upperLimit: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Number of Grades</label>
                                            <input type="number" step="1" min="1" className="w-full p-2 border rounded text-sm"
                                                value={gradingConfig.numGrades}
                                                onChange={e => setGradingConfig({ ...gradingConfig, numGrades: parseInt(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Total Cells</label>
                                            <input type="number" className="w-full p-2 border rounded text-sm bg-gray-100 text-gray-500"
                                                value={gradingConfig.totalCells}
                                                readOnly
                                            />
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <div className="mt-4 flex justify-end">
                                        <button
                                            onClick={handleApplyAndSave}
                                            className="bg-[#8EBF45] text-[#0D0D0D] px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wide hover:bg-[#658C3E] hover:text-white shadow-sm transition-colors flex items-center"
                                        >
                                            <Save size={16} className="mr-2" />
                                            Save Grading & Batch Info
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SMART CELL SELECTION PANEL FOR BATTERY PACK ASSEMBLY */}
                    {(selectedBatch.category || '').toLowerCase().includes('cell') && (
                        <div className="mb-4 bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-blue-50/90 p-4 rounded-xl border border-emerald-200/80 shadow-xs">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2.5">
                                    <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm font-bold shadow-xs shrink-0">
                                        ⚡
                                    </span>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 flex-wrap">
                                            <span>Smart Cell Selection for Battery Assembly</span>
                                            <span className="bg-emerald-200 text-emerald-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                Auto Pack Matcher
                                            </span>
                                        </h3>
                                        <p className="text-[11px] text-slate-500 font-medium">
                                            Select desired quantity of cells by number of cells, permitted grades, and sort priority (Capacity &amp; Resistance).
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setShowAutoSelectPanel(prev => !prev)}
                                    className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 bg-white/80 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0"
                                >
                                    {showAutoSelectPanel ? 'Hide Controls ▲' : 'Show Controls ▼'}
                                </button>
                            </div>

                            {showAutoSelectPanel && (
                                <div className="space-y-3 pt-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
                                        {/* 1. Number of Cells */}
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                                    Number of Cells *
                                                </label>
                                                <span className="text-[10px] text-slate-400 font-bold">
                                                    Batch: {selectedBatch.serials?.length || 0}
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                min="1"
                                                max={selectedBatch.serials?.length || 9999}
                                                value={desiredQuantity}
                                                onChange={e => setDesiredQuantity(parseInt(e.target.value) || 0)}
                                                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#8EBF45] focus:border-[#8EBF45] outline-none"
                                                placeholder="e.g. 16"
                                            />
                                            {/* Quick Presets */}
                                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase">Presets:</span>
                                                {[
                                                    { label: '4S (4)', count: 4 },
                                                    { label: '8S (8)', count: 8 },
                                                    { label: '16S (16)', count: 16 },
                                                    { label: '24S (24)', count: 24 },
                                                    { label: '32S (32)', count: 32 },
                                                ].map(p => (
                                                    <button
                                                        key={p.label}
                                                        type="button"
                                                        onClick={() => setDesiredQuantity(p.count)}
                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all border ${
                                                            desiredQuantity === p.count
                                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* 2. Grades Permitted */}
                                        <div className="lg:col-span-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                                    Grades Permitted *
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const nonFail = uniqueGrades.filter(g => g !== 'Fail');
                                                            setPermittedGrades(new Set(nonFail.length > 0 ? nonFail : uniqueGrades));
                                                        }}
                                                        className="text-[10px] font-bold text-emerald-700 hover:underline"
                                                    >
                                                        Select Passing
                                                    </button>
                                                    <span className="text-slate-300">|</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPermittedGrades(new Set())}
                                                        className="text-[10px] font-bold text-slate-500 hover:underline"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Grade Toggle Chips */}
                                            <div className="flex flex-wrap gap-1.5 p-1.5 bg-white border border-slate-200 rounded-lg min-h-[34px] items-center">
                                                {(uniqueGrades.length > 0 ? uniqueGrades : ['Grade I', 'Grade II', 'Grade III', 'Fail']).map(g => {
                                                    const isChecked = permittedGrades.has(g);
                                                    const isFail = g === 'Fail';
                                                    return (
                                                        <button
                                                            key={g}
                                                            type="button"
                                                            onClick={() => togglePermittedGrade(g)}
                                                            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 border ${
                                                                isChecked
                                                                    ? isFail
                                                                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                                                                        : 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            <span>{isChecked ? '✓' : '+'}</span>
                                                            <span>{g}</span>
                                                        </button>
                                                    );
                                                })}
                                                <button
                                                    type="button"
                                                    onClick={() => togglePermittedGrade('Ungraded')}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${
                                                        permittedGrades.has('Ungraded')
                                                            ? 'bg-slate-700 text-white border-slate-700'
                                                            : 'bg-white text-slate-400 border-dashed border-slate-300 hover:text-slate-600'
                                                    }`}
                                                >
                                                    {permittedGrades.has('Ungraded') ? '✓ Ungraded' : '+ Ungraded'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* 3. Ordered By (Capacity and Resistance) */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                Ordered By (Capacity &amp; Res) *
                                            </label>
                                            <select
                                                value={cellSortOrder}
                                                onChange={e => setCellSortOrder(e.target.value as any)}
                                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#8EBF45] focus:border-[#8EBF45] outline-none"
                                            >
                                                <option value="cap_asc">🔋 Capacity: Low → High (Default)</option>
                                                <option value="cap_desc">🔋 Capacity: High → Low</option>
                                                <option value="cap_desc_res_asc">⚡ Cap Desc + Res Asc</option>
                                                <option value="res_asc_cap_desc">🎯 Res Asc + Cap Desc (Lowest IR)</option>
                                                <option value="res_asc">⚡ Resistance: Low → High (Lowest IR)</option>
                                                <option value="res_desc">⚡ Resistance: High → Low (Highest IR)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Actions & Feedback Row */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-emerald-200/60">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={handleAutoSelectCells}
                                                className="px-4 py-2 bg-gradient-to-r from-[#8EBF45] to-[#658C3E] hover:opacity-95 text-slate-950 font-black text-xs rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <span>⚡ Select {desiredQuantity} Cells</span>
                                            </button>

                                            {selectedSerials.size > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedSerials(new Set());
                                                        setSelectionFeedback(null);
                                                    }}
                                                    className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                                >
                                                    ✕ Clear Selection ({selectedSerials.size})
                                                </button>
                                            )}

                                            {onSendToProduction && selectedSerials.size > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={handleSendToProductionClick}
                                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <span>🚀 Send {selectedSerials.size} Cells to Production</span>
                                                </button>
                                            )}
                                        </div>

                                        {selectionFeedback && (
                                            <div
                                                className={`text-xs px-3 py-1.5 rounded-lg border font-bold flex items-center gap-2 ${
                                                    selectionFeedback.type === 'success'
                                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                                        : selectionFeedback.type === 'warning'
                                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                                        : 'bg-blue-100 text-blue-900 border-blue-300'
                                                }`}
                                            >
                                                <span>{selectionFeedback.message}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Search SN Toolbar - Placed above No. / Serial Number columns and below grading criteria */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pt-1">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                <span>Search SN</span>
                            </label>
                            <div className="relative">
                                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search serial number..."
                                    className="pl-8 pr-7 py-1.5 border border-gray-300 rounded-lg shadow-xs focus:ring-2 focus:ring-[#8EBF45] outline-none w-52 sm:w-64 text-xs sm:text-sm font-mono bg-white"
                                    value={serialSearchTerm}
                                    onChange={e => setSerialSearchTerm(e.target.value)}
                                />
                                {serialSearchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSerialSearchTerm('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold p-0.5"
                                        title="Clear search"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            {serialSearchTerm && (
                                <span className="text-xs text-gray-500 font-medium">
                                    Found: <strong className="text-gray-800">{processedSerials.length}</strong>
                                </span>
                            )}
                        </div>

                        <div className="text-xs text-gray-500 font-medium flex items-center gap-2">
                            <span>Total: <strong className="text-gray-700">{selectedBatch.serials?.length || 0}</strong> serials</span>
                            {selectedSerials.size > 0 && (
                                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                                    {selectedSerials.size} selected
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="p-3 border-b font-semibold text-gray-600 w-10 text-center">
                                        <input type="checkbox" onChange={handleSelectAll} checked={processedSerials.length > 0 && selectedSerials.size === processedSerials.length} className="rounded border-gray-300 focus:ring-[#8EBF45] h-4 w-4 text-[#658C3E] cursor-pointer" />
                                    </th>
                                    <th
                                        className="p-3 border-b font-semibold text-gray-600 w-16 text-center cursor-pointer hover:bg-gray-100 group select-none"
                                        onClick={() => handleSort('index')}
                                    >
                                        <div className="flex items-center justify-center gap-1">No. {getSortIcon('index')}</div>
                                    </th>
                                    <th className="p-3 border-b font-semibold text-gray-600">Serial Number</th>
                                    {(selectedBatch.category || '').toLowerCase().includes('cell') ? (
                                        <>
                                            <th
                                                className="p-3 border-b font-semibold text-gray-600 w-24 cursor-pointer hover:bg-gray-100 group select-none"
                                                onClick={() => handleSort('voltage')}
                                            >
                                                <div className="flex items-center gap-1">Voltage {getSortIcon('voltage')}</div>
                                            </th>
                                            <th
                                                className="p-3 border-b font-semibold text-gray-600 w-24 cursor-pointer hover:bg-gray-100 group select-none"
                                                onClick={() => handleSort('resistance')}
                                            >
                                                <div className="flex items-center gap-1">Res (mΩ) {getSortIcon('resistance')}</div>
                                            </th>
                                            <th
                                                className="p-3 border-b font-semibold text-gray-600 w-24 cursor-pointer hover:bg-gray-100 group select-none"
                                                onClick={() => handleSort('capacity')}
                                            >
                                                <div className="flex items-center gap-1">Cap (Ah) {getSortIcon('capacity')}</div>
                                            </th>
                                            {/* Grade Column with Filter */}
                                            <th className="p-3 border-b font-semibold text-gray-600 w-28 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span>Grade</span>
                                                    <select
                                                        value={gradeFilter}
                                                        onChange={(e) => setGradeFilter(e.target.value)}
                                                        className="text-[10px] border border-gray-300 rounded p-0.5 font-normal bg-white focus:outline-none focus:border-[#8EBF45] w-20"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="all">All</option>
                                                        {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
                                                        {!uniqueGrades.includes('Fail') && <option value="Fail">Fail</option>}
                                                    </select>
                                                </div>
                                            </th>
                                            <th className="p-3 border-b font-semibold text-gray-600 w-24 text-center">Location</th>
                                        </>
                                    ) : (
                                        <th className="p-3 border-b font-semibold text-gray-600">QC Status</th>
                                    )}
                                    <th className="p-3 border-b font-semibold text-gray-600 w-24 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processedSerials.map((row) => {
                                    const { serial, index, grade, location } = row;
                                    const result = getResult(serial);

                                    const isTested = (selectedBatch.category || '').toLowerCase().includes('cell')
                                        ? (result.voltage !== undefined && result.resistance !== undefined && result.capacity !== undefined)
                                        : (result.passed !== undefined);

                                    return (
                                        <tr key={serial} className={`hover:bg-gray-50 transition-colors ${selectedSerials.has(serial) ? 'bg-[#8EBF45]/20' : ''}`}>
                                            <td className="p-3 border-b text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSerials.has(serial)}
                                                    onChange={() => handleToggleSelect(serial)}
                                                    className="rounded border-gray-300 focus:ring-[#8EBF45] h-4 w-4 text-[#658C3E] cursor-pointer"
                                                />
                                            </td>
                                            <td className="p-3 border-b text-center text-gray-500 text-sm">{index}</td>
                                            <td className="p-3 border-b font-mono text-sm">{serial}</td>
                                            {(selectedBatch.category || '').toLowerCase().includes('cell') ? (
                                                <>
                                                    <td className="p-3 border-b">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="w-full p-1 border rounded focus:ring-2 focus:ring-[#8EBF45]"
                                                            value={result.voltage ?? ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                const parsed = val === '' ? undefined : parseFloat(val);
                                                                handleInputChange(serial, { voltage: parsed !== undefined && !isNaN(parsed) ? parsed : undefined });
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="p-3 border-b">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="w-full p-1 border rounded focus:ring-2 focus:ring-[#8EBF45]"
                                                            value={result.resistance ?? ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                const parsed = val === '' ? undefined : parseFloat(val);
                                                                handleInputChange(serial, { resistance: parsed !== undefined && !isNaN(parsed) ? parsed : undefined });
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="p-3 border-b">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="w-full p-1 border rounded focus:ring-2 focus:ring-[#8EBF45]"
                                                            value={result.capacity ?? ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                const parsed = val === '' ? undefined : parseFloat(val);
                                                                handleInputChange(serial, { capacity: parsed !== undefined && !isNaN(parsed) ? parsed : undefined });
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="p-3 border-b text-center">
                                                        {grade ? (
                                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${getGradeColor(grade)}`}>
                                                                {grade === 'Fail' ? 'Fail' : `Grade ${grade}`}
                                                            </span>
                                                        ) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="p-3 border-b text-center text-xs text-gray-500">
                                                        {location || batchLocation || '-'}
                                                    </td>
                                                </>
                                            ) : (
                                                <td className="p-3 border-b">
                                                    <div className="flex space-x-4">
                                                        <label className="flex items-center space-x-1 cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                name={`qc-${serial}`}
                                                                checked={result.passed === true}
                                                                onChange={() => handleInputChange(serial, { passed: true })}
                                                                className="form-radio text-green-600"
                                                            />
                                                            <span className="text-sm">Pass</span>
                                                        </label>
                                                        <label className="flex items-center space-x-1 cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                name={`qc-${serial}`}
                                                                checked={result.passed === false}
                                                                onChange={() => handleInputChange(serial, { passed: false })}
                                                                className="form-radio text-red-600"
                                                            />
                                                            <span className="text-sm">Fail</span>
                                                        </label>
                                                    </div>
                                                </td>
                                            )}
                                            <td className="p-3 border-b text-center">
                                                {isTested ? (
                                                    <CheckCircleIcon />
                                                ) : (
                                                    <span className="text-gray-300">•</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {processedSerials.length === 0 && <p className="p-4 text-gray-500 text-center">No serial numbers found for this batch.</p>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Testing;
