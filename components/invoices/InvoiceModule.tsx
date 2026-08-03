
import React, { useState, useEffect, useCallback } from 'react';
import FileUploader from './FileUploader';
import InvoiceForm from './InvoiceForm';
import Dashboard from './Dashboard';
import ExpenseForm from './ExpenseForm';
import InventoryPanel from './InventoryPanel';
import GSTReturnPanel from './GSTReturnPanel';
import InvoiceMaker from './InvoiceMaker';
import PriceList from './PriceList';
import { extractInvoiceData } from '../../services/geminiService';
import { extractInvoiceDataLocal, testOllamaConnection } from '../../services/ollamaService';
import { extractInvoiceDataOpenRouter, testOpenRouterConnection } from '../../services/openrouterService';
import { ExtractedInvoice, EMPTY_INVOICE, User, CompanyProfile, PriceListItem, FinishedGood, Recipe } from '../../types';
import { Loader2, Save, RotateCcw, AlertCircle, CheckCircle, SettingsIcon, CloudLightning, AlertTriangle, FileText, MessageSquare, Cpu } from './Icons';
import { supabase } from '../../supabaseClient';
import * as pdfjsLib from 'pdfjs-dist';

// Handle ESM import where the actual library might be under 'default'
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Set up PDF.js worker
if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

type ActiveTab = 'upload' | 'dashboard' | 'expenses' | 'gst' | 'maker' | 'prices';
type AIProvider = 'gemini' | 'ollama' | 'openrouter';

// Batch Job Interface
interface BatchJob {
    id: string;
    file?: File;
    status: 'pending' | 'processing' | 'review' | 'saved' | 'error';
    data?: ExtractedInvoice;
    error?: string;
    previewUrl?: string;
    isDuplicate?: boolean;
    fromDb?: boolean;
}

interface InvoiceModuleProps {
    currentUser: User | null;
    companyProfiles?: CompanyProfile[];
    invoiceDraft?: ExtractedInvoice | null;
    setInvoiceDraft?: (draft: ExtractedInvoice | null) => void;
    setView?: (view: any) => void;
    activeTab: ActiveTab;
    finishedGoods?: FinishedGood[];
    recipes?: Recipe[];
    addLogEntry?: (action: string, details: string) => void;
}

const InvoiceModule: React.FC<InvoiceModuleProps> = ({ currentUser, companyProfiles = [], invoiceDraft, activeTab, setView, finishedGoods = [], recipes = [], addLogEntry }) => {
    // Batch Queue State
    const [batchQueue, setBatchQueue] = useState<BatchJob[]>([]);
    const [activeJobId, setActiveJobId] = useState<string | null>(null); // Job currently being reviewed
    const [isQueueRunning, setIsQueueRunning] = useState(false);

    // Price List State
    const [priceList, setPriceList] = useState<PriceListItem[]>([]);

    // --- API SETTINGS ---
    const [showSettings, setShowSettings] = useState(false);
    const [aiProvider, setAiProvider] = useState<AIProvider>('gemini');

    // Ollama Config State
    const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
    const [ollamaModel, setOllamaModel] = useState("qwen3-vl:235b-cloud");
    const [ollamaKey, setOllamaKey] = useState("");

    // OpenRouter Config State
    const [openRouterModel, setOpenRouterModel] = useState("nvidia/nemotron-nano-12b-v2-vl:free");
    const [openRouterStatus, setOpenRouterStatus] = useState<{ success?: boolean; message?: string } | null>(null);
    const [isTestingOpenRouter, setIsTestingOpenRouter] = useState(false);

    // --- Initial Load: Fetch Pending Reviews ---
    useEffect(() => {
        const fetchPending = async () => {
            const { data, error } = await supabase
                .from('invoices')
                .select('*')
                .eq('requires_review', true)
                .order('created_at', { ascending: false });

            if (data && !error) {
                const pendingJobs: BatchJob[] = data.map((inv: ExtractedInvoice) => ({
                    id: inv.id || `db-${Date.now()}`,
                    file: undefined, // No file object for DB records
                    status: 'review',
                    data: inv,
                    previewUrl: inv.filename && inv.filename.startsWith('http') ? inv.filename : undefined,
                    fromDb: true
                }));

                setBatchQueue(prev => {
                    const existingIds = new Set(prev.map(j => j.id));
                    const newJobs = pendingJobs.filter(j => !existingIds.has(j.id));
                    return [...prev, ...newJobs];
                });
            }
        };

        if (activeTab === 'upload') {
            fetchPending();
        }
    }, [activeTab]);

    // Load Price List from Supabase
    useEffect(() => {
        const loadPrices = async () => {
            const { data } = await supabase.from('price_list').select('*').order('model_name');
            if (data) setPriceList(data as PriceListItem[]);
        };
        loadPrices();
    }, []);

    // --- Helper Functions ---

    const convertPdfToImage = async (file: File): Promise<string> => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) throw new Error("Canvas context not available");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            return dataUrl.split(',')[1];
        } catch (e: any) {
            console.error("PDF Rasterization Error:", e);
            throw new Error(`Failed to convert PDF: ${e.message}`);
        }
    };

    // --- Queue Processing Logic ---

    // Add files to queue
    const handleFilesSelect = (selectedFiles: File[]) => {
        const newJobs: BatchJob[] = selectedFiles.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            status: 'pending',
            previewUrl: URL.createObjectURL(file)
        }));
        setBatchQueue(prev => [...prev, ...newJobs]);
    };

    // Process a single job
    const processJob = async (job: BatchJob) => {
        if (!job.file) return; // Skip non-file jobs (DB items are already 'review')

        setBatchQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing' } : j));

        try {
            let base64Data = '';
            let mimeType = job.file.type;

            if (aiProvider === 'ollama' && mimeType === 'application/pdf') {
                base64Data = await convertPdfToImage(job.file);
                mimeType = 'image/jpeg';
            } else {
                const reader = new FileReader();
                base64Data = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(job.file!);
                });
            }

            let extracted: ExtractedInvoice;
            if (aiProvider === 'ollama') {
                extracted = await extractInvoiceDataLocal(
                    base64Data, mimeType, job.file.name, ollamaUrl, ollamaModel, ollamaKey
                );
            } else if (aiProvider === 'openrouter') {
                extracted = await extractInvoiceDataOpenRouter(
                    base64Data, mimeType, job.file.name, undefined, openRouterModel
                );
            } else {
                // Gemini (Uses hardcoded API KEY in service)
                extracted = await extractInvoiceData(base64Data, mimeType, job.file.name);
            }

            // Duplicate Check
            let isDuplicate = false;
            if (extracted.invoice_metadata?.invoice_number) {
                const { data: existing } = await supabase
                    .from('invoices')
                    .select('id')
                    .eq('invoice_metadata->>invoice_number', extracted.invoice_metadata.invoice_number)
                    .in('document_type', [extracted.document_type]) // Check against same document type
                    .eq('requires_review', false) // Check against finalized invoices
                    .maybeSingle();

                if (existing) {
                    isDuplicate = true;
                }
            }

            setBatchQueue(prev => prev.map(j => j.id === job.id ? {
                ...j,
                status: 'review',
                data: { ...extracted, uploaded_by: currentUser?.username || 'system' },
                isDuplicate
            } : j));

        } catch (error: any) {
            console.error(`Job ${job.id} failed:`, error);
            setBatchQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', error: error.message } : j));
        }
    };

    // Watch queue and trigger processing (Sequential)
    useEffect(() => {
        if (isQueueRunning) return; // Already running a loop?

        const pendingJob = batchQueue.find(j => j.status === 'pending');

        if (pendingJob) {
            setIsQueueRunning(true);
            processJob(pendingJob).finally(() => {
                setIsQueueRunning(false);
            });
        }
    }, [batchQueue, isQueueRunning]);

    // --- Invoice Actions ---

    const handleManualEntry = () => {
        const id = 'manual-' + Date.now();
        const job: BatchJob = {
            id,
            file: undefined,
            status: 'review',
            data: { ...EMPTY_INVOICE, filename: 'Manual Entry', timestamp: new Date().toISOString(), uploaded_by: currentUser?.username || 'system' }
        };
        setBatchQueue(prev => [job, ...prev]);
        setActiveJobId(id);
    };

    const handleSimulateSlack = async () => {
        // Create a mock pending invoice in DB
        const mockInv: any = {
            ...EMPTY_INVOICE,
            filename: 'https://supabase.cnergy.co.in/storage/v1/object/public/Invoices/sample_slack_invoice.pdf', // Using a placeholder URL
            timestamp: new Date().toISOString(),
            uploaded_by: 'slack_bot',
            requires_review: true,
            raw_text: 'Simulated Slack Import',
            invoice_metadata: {
                ...EMPTY_INVOICE.invoice_metadata,
                invoice_number: `SLACK-${Math.floor(Math.random() * 1000)}`
            }
        };
        delete mockInv.id; // ensure new ID

        const { data, error } = await supabase.from('invoices').insert([mockInv]).select().single();

        if (data && !error) {
            alert("Simulated: Invoice received from Slack! Adding to queue...");
            // Add to local queue
            const job: BatchJob = {
                id: data.id,
                status: 'review',
                data: data,
                fromDb: true,
                previewUrl: undefined // Placeholder URL is not valid PDF here usually, unless we implement PDF viewer properly for remote
            };
            setBatchQueue(prev => [job, ...prev]);
        } else {
            alert("Simulation failed: " + error?.message);
        }
    };

    const handleEditInvoice = (invoice: ExtractedInvoice) => {
        const jobId = `edit-${invoice.id}`;
        // Check if already in queue to avoid duplicates?
        const existingJob = batchQueue.find(j => j.id === jobId);

        if (existingJob) {
            setActiveJobId(jobId);
        } else {
            const job: BatchJob = {
                id: jobId,
                file: undefined,
                status: 'review',
                data: invoice,
                previewUrl: undefined // No preview available for existing invoices unless stored
            };
            setBatchQueue(prev => [job, ...prev]);
            setActiveJobId(jobId);
        }

        if (setView) setView('finance_upload');
    };

    const handleSaveActive = async () => {
        const activeJob = batchQueue.find(j => j.id === activeJobId);
        if (!activeJob || !activeJob.data) return;

        try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, timestamp, created_at, ...payload } = activeJob.data as any;
            const cleanPayload = {
                ...payload,
                requires_review: false // Mark as reviewed
            };

            if (activeJob.fromDb || activeJob.data.id) {
                // Update existing record (e.g. from Slack pending state)
                const targetId = activeJob.data.id || activeJob.id;
                const { error } = await supabase
                    .from('invoices')
                    .update(cleanPayload)
                    .eq('id', targetId);
                if (error) throw error;
                alert("Invoice approved and saved!");
            } else {
                // Insert new record
                const { error } = await supabase.from('invoices').insert([cleanPayload]);
                if (error) throw error;
            }

            // Update job status to saved
            setBatchQueue(prev => prev.map(j => j.id === activeJobId ? { ...j, status: 'saved', isDuplicate: false } : j));
            setActiveJobId(null); // Go back to list
        } catch (error: any) {
            alert(`Failed to save: ${error.message}`);
        }
    };

    const handleDiscardActive = async () => {
        const activeJob = batchQueue.find(j => j.id === activeJobId);

        if (activeJob?.fromDb && activeJob.data?.id) {
            // If it was a pending DB item, delete it
            if (confirm("Delete this pending invoice from the database?")) {
                await supabase.from('invoices').delete().eq('id', activeJob.data.id);
            } else {
                return;
            }
        }

        // Remove from queue
        setBatchQueue(prev => prev.filter(j => j.id !== activeJobId));
        setActiveJobId(null);
    };

    return (
        <div className="h-full">
            {activeTab === 'upload' && (
                <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
                    {/* Header / Uploader */}
                    {!activeJobId && (
                        <>
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800">Scan Invoices</h2>
                                    <p className="text-slate-500 text-sm">Upload PDF or Images. AI will extract data automatically.</p>
                                </div>
                                <div className="flex gap-2 relative">
                                    <button onClick={handleSimulateSlack} className="bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors">Simulate Slack</button>
                                    <button onClick={handleManualEntry} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-900 transition-colors">Manual Entry</button>

                                    <button
                                        onClick={() => setShowSettings(!showSettings)}
                                        className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"
                                    >
                                        <SettingsIcon size={16} />
                                        {aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'ollama' ? 'Ollama' : 'OpenRouter'}
                                    </button>

                                    {showSettings && (
                                        <div className="absolute top-12 right-0 bg-white border border-slate-200 shadow-xl rounded-xl p-4 z-50 w-72 animate-fade-in">
                                            <div className="flex justify-between items-center mb-3">
                                                <h4 className="font-bold text-slate-700 text-xs uppercase">AI Provider</h4>
                                                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-red-500 text-xs font-bold">Close</button>
                                            </div>
                                            <div className="space-y-2 mb-4">
                                                <button
                                                    onClick={() => setAiProvider('gemini')}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${aiProvider === 'gemini' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}
                                                >
                                                    <CloudLightning size={16} className={aiProvider === 'gemini' ? "text-blue-600" : "text-slate-400"} />
                                                    Google Gemini
                                                </button>
                                                <button
                                                    onClick={() => setAiProvider('ollama')}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${aiProvider === 'ollama' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'}`}
                                                >
                                                    <Cpu size={16} className={aiProvider === 'ollama' ? "text-indigo-600" : "text-slate-400"} />
                                                    Ollama (Local)
                                                </button>
                                                <button
                                                    onClick={() => setAiProvider('openrouter')}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${aiProvider === 'openrouter' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'hover:bg-slate-50 border border-transparent'}`}
                                                >
                                                    <Cpu size={16} className={aiProvider === 'openrouter' ? "text-emerald-600" : "text-slate-400"} />
                                                    OpenRouter
                                                </button>
                                            </div>

                                            {aiProvider === 'ollama' && (
                                                <div className="pt-3 border-t border-slate-100 space-y-2">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Server URL</label>
                                                        <input className="w-full text-xs p-1.5 border rounded" value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Model</label>
                                                        <input className="w-full text-xs p-1.5 border rounded" value={ollamaModel} onChange={e => setOllamaModel(e.target.value)} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">API Key (Optional)</label>
                                                        <input className="w-full text-xs p-1.5 border rounded" type="password" value={ollamaKey} onChange={e => setOllamaKey(e.target.value)} />
                                                    </div>
                                                </div>
                                            )}
                                            {aiProvider === 'openrouter' && (
                                                <div className="pt-3 border-t border-slate-100 space-y-2">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Model Name</label>
                                                        <input className="w-full text-xs p-1.5 border rounded" value={openRouterModel} onChange={e => setOpenRouterModel(e.target.value)} />
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            setIsTestingOpenRouter(true);
                                                            setOpenRouterStatus(null);
                                                            try {
                                                                const res = await testOpenRouterConnection(undefined, openRouterModel);
                                                                setOpenRouterStatus(res);
                                                            } catch (err: any) {
                                                                setOpenRouterStatus({ success: false, message: err.message });
                                                            } finally {
                                                                setIsTestingOpenRouter(false);
                                                            }
                                                        }}
                                                        disabled={isTestingOpenRouter}
                                                        className="w-full bg-slate-800 text-white text-xs py-1.5 px-3 rounded hover:bg-slate-900 transition-colors disabled:opacity-50 font-bold"
                                                    >
                                                        {isTestingOpenRouter ? "Testing..." : "Test Connection"}
                                                    </button>
                                                    {openRouterStatus && (
                                                        <p className={`text-[10px] p-1.5 rounded border leading-tight ${openRouterStatus.success ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"}`}>
                                                            {openRouterStatus.message}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                            {aiProvider === 'gemini' && (
                                                <div className="pt-3 border-t border-slate-100">
                                                    <p className="text-[10px] text-slate-500 bg-blue-50 p-2 rounded border border-blue-100">
                                                        Using secure Vercel API Key.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <FileUploader onFilesSelect={handleFilesSelect} isProcessing={isQueueRunning} />
                        </>
                    )}

                    {/* Processing Queue List */}
                    {batchQueue.length > 0 && !activeJobId && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-sm text-slate-700 flex justify-between">
                                <span>Processing Queue ({batchQueue.length})</span>
                                {isQueueRunning && <span className="flex items-center gap-2 text-indigo-600"><Loader2 className="animate-spin" size={14} /> Processing...</span>}
                            </div>
                            <div className="divide-y divide-slate-100">
                                {batchQueue.map(job => (
                                    <div key={job.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200">
                                                {job.previewUrl ? <img src={job.previewUrl} className="w-full h-full object-cover" /> : <FileText className="text-slate-400" />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-slate-800">{job.file?.name || job.data?.filename || 'Unnamed Document'}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {job.status === 'pending' && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Queued</span>}
                                                    {job.status === 'processing' && <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded flex items-center gap-1"><Loader2 className="animate-spin" size={10} /> Extracting...</span>}
                                                    {job.status === 'review' && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-bold cursor-pointer" onClick={() => setActiveJobId(job.id)}>Ready for Review</span>}
                                                    {job.status === 'saved' && <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded flex items-center gap-1"><CheckCircle size={10} /> Saved</span>}
                                                    {job.status === 'error' && <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded flex items-center gap-1"><AlertCircle size={10} /> {job.error}</span>}

                                                    {job.isDuplicate && job.status !== 'saved' && (
                                                        <span className="text-[10px] text-red-500 font-bold border border-red-200 px-1 rounded bg-white">Duplicate Warning</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {job.status === 'review' && (
                                                <button onClick={() => setActiveJobId(job.id)} className="bg-[#8EBF45] text-[#0D0D0D] px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#658C3E] transition-colors">Review</button>
                                            )}
                                            {job.status === 'saved' && (
                                                <button className="text-slate-300 cursor-default"><CheckCircle /></button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Review Mode (Active Job) */}
                    {activeJobId && (
                        (() => {
                            const job = batchQueue.find(j => j.id === activeJobId);
                            if (!job || !job.data) return null;
                            return (
                                <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in">
                                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => setActiveJobId(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">← Back</button>
                                            <div className="h-6 w-px bg-slate-300"></div>
                                            <h3 className="font-bold text-slate-800">Review Extraction</h3>
                                            {job.isDuplicate && <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded font-bold flex items-center gap-1"><AlertTriangle size={12} /> Potential Duplicate</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={handleDiscardActive} className="text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"><RotateCcw size={16} /> Discard</button>
                                            <button onClick={handleSaveActive} className="bg-[#8EBF45] text-[#0D0D0D] hover:bg-[#658C3E] hover:text-white px-6 py-2 rounded-lg text-sm font-black uppercase tracking-wide shadow-md transition-colors flex items-center gap-2"><Save size={16} /> Approve & Save</button>
                                        </div>
                                    </div>
                                    <div className="grid md:grid-cols-2 h-[calc(100vh-200px)]">
                                        <div className="bg-slate-100 p-4 overflow-y-auto border-r border-slate-200">
                                            {job.previewUrl ? (
                                                <img src={job.previewUrl} className="w-full rounded-lg shadow-sm border border-slate-300" alt="Invoice" />
                                            ) : (
                                                <div className="h-full flex items-center justify-center text-slate-400 flex-col">
                                                    <FileText size={48} className="mb-4 opacity-50" />
                                                    <p>No preview available</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="overflow-y-auto h-full p-4">
                                            <InvoiceForm
                                                data={job.data}
                                                onChange={(updated) => setBatchQueue(prev => prev.map(j => j.id === job.id ? { ...j, data: updated } : j))}
                                            />
                                            <InventoryPanel
                                                data={job.data}
                                                onUpdate={(items) => setBatchQueue(prev => prev.map(j => j.id === job.id ? { ...j, data: { ...j.data!, items } } : j))}
                                                setView={setView}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })()
                    )}
                </div>
            )}

            {activeTab === 'dashboard' && (
                <Dashboard
                    currentUser={currentUser}
                    setView={setView}
                    onEditInvoice={handleEditInvoice}
                />
            )}

            {activeTab === 'expenses' && (
                <ExpenseForm currentUser={currentUser} />
            )}

            {activeTab === 'gst' && (
                <GSTReturnPanel />
            )}

            {activeTab === 'maker' && (
                <InvoiceMaker
                    currentUser={currentUser}
                    companyProfiles={companyProfiles}
                    initialData={invoiceDraft}
                    priceList={priceList}
                    finishedGoods={finishedGoods}
                    recipes={recipes}
                    addLogEntry={addLogEntry}
                />
            )}

            {activeTab === 'prices' && (
                <PriceList priceList={priceList} setPriceList={setPriceList} />
            )}
        </div>
    );
};

export default InvoiceModule;
