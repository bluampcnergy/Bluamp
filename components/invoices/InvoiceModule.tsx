import React, { useState, useEffect, useCallback } from 'react';
import FileUploader from './FileUploader';
import InvoiceForm from './InvoiceForm';
import Dashboard from './Dashboard';
import ExpenseForm from './ExpenseForm';
import InventoryPanel from './InventoryPanel';
import GSTReturnPanel from './GSTReturnPanel';
import InvoiceMaker from './InvoiceMaker';
import PriceList from './PriceList';
import LedgerPanel from './LedgerPanel';
import { extractInvoiceData } from '../../services/geminiService';
import { extractInvoiceDataLocal, testOllamaConnection } from '../../services/ollamaService';
import { extractInvoiceDataOpenRouter, testOpenRouterConnection } from '../../services/openrouterService';
import { ExtractedInvoice, EMPTY_INVOICE, User, CompanyProfile, PriceListItem, FinishedGood, Recipe } from '../../types';
import { Loader2, Save, RotateCcw, AlertCircle, CheckCircle, SettingsIcon, CloudLightning, AlertTriangle, FileText, Cpu, Trash2, Plus, RefreshCw } from './Icons';
import { supabase } from '../../supabaseClient';
import * as pdfjsLib from 'pdfjs-dist';

// Handle ESM import where the actual library might be under 'default'
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Set up PDF.js worker
if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

type ActiveTab = 'upload' | 'dashboard' | 'expenses' | 'gst' | 'maker' | 'prices' | 'ledger';
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

const InvoiceModule: React.FC<InvoiceModuleProps> = ({ currentUser, companyProfiles = [], invoiceDraft, setInvoiceDraft, activeTab, setView, finishedGoods = [], recipes = [], addLogEntry }) => {
    // Batch Queue State
    const [batchQueue, setBatchQueue] = useState<BatchJob[]>([]);
    const [activeJobId, setActiveJobId] = useState<string | null>(null); // Job currently being reviewed
    const [isQueueRunning, setIsQueueRunning] = useState(false);
    const [queueFilter, setQueueFilter] = useState<'all' | 'review' | 'saved' | 'error'>('all');
    const [searchQuery, setSearchQuery] = useState('');

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
    const fetchPending = useCallback(async () => {
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
                previewUrl: (inv.image_link || inv.filename) && ((inv.image_link || inv.filename || '').startsWith('http') || (inv.image_link || inv.filename || '').startsWith('blob')) 
                    ? (inv.image_link || inv.filename) 
                    : undefined,
                fromDb: true
            }));

            setBatchQueue(prev => {
                const existingIds = new Set(prev.map(j => j.id));
                const newJobs = pendingJobs.filter(j => !existingIds.has(j.id));
                return [...prev, ...newJobs];
            });
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'upload') {
            fetchPending();
        }
    }, [activeTab, fetchPending]);

    // Load Price List from Supabase & Self-Heal Misclassified Generated Sales Invoices
    useEffect(() => {
        const loadPricesAndHeal = async () => {
            const { data } = await supabase.from('price_list').select('*').order('model_name');
            if (data) setPriceList(data as PriceListItem[]);

            // Repair any generated sales documents misclassified as 'purchase'
            try {
                await supabase
                    .from('invoices')
                    .update({ source_type: 'sales' })
                    .eq('source_type', 'purchase')
                    .in('document_type', ['generated_invoice', 'generated_quotation', 'generated_proforma_invoice', 'generated_debit_note', 'generated_credit_note']);
            } catch (healErr) {
                console.warn('[InvoiceModule] Self-healing misclassified invoices failed:', healErr);
            }
        };
        loadPricesAndHeal();
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
                // Gemini (Uses backend API or hardcoded key)
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
        if (isQueueRunning) return;

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

    const handleEditInvoice = (invoice: ExtractedInvoice) => {
        if (setInvoiceDraft && setView) {
            setInvoiceDraft(invoice);
            setView('finance_maker');
        }
    };

    // Delete a single invoice / job from the queue
    const handleDeleteJob = async (jobId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const target = batchQueue.find(j => j.id === jobId);
        if (!target) return;

        if (target.fromDb && target.data?.id) {
            const docLabel = target.data.invoice_metadata?.invoice_number || target.data.filename || 'this pending invoice';
            if (!confirm(`Are you sure you want to permanently delete "${docLabel}" from the database?`)) {
                return;
            }
            try {
                const { error } = await supabase.from('invoices').delete().eq('id', target.data.id);
                if (error) throw error;
                addLogEntry?.('Delete Invoice', `Deleted pending invoice: ${docLabel}`);
            } catch (err: any) {
                alert(`Could not delete from database: ${err.message}`);
                return;
            }
        }

        // Release blob URL if created locally
        if (target.file && target.previewUrl && target.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(target.previewUrl);
        }

        setBatchQueue(prev => prev.filter(j => j.id !== jobId));
        if (activeJobId === jobId) setActiveJobId(null);
    };

    // Clear completed or error jobs
    const handleClearFinished = () => {
        setBatchQueue(prev => {
            const toKeep = prev.filter(j => j.status !== 'saved' && j.status !== 'error');
            // Clean up blob URLs for removed items
            prev.filter(j => j.status === 'saved' || j.status === 'error').forEach(j => {
                if (j.file && j.previewUrl && j.previewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(j.previewUrl);
                }
            });
            return toKeep;
        });
    };

    // Quick direct approve without opening full review
    const handleDirectApprove = async (jobId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const job = batchQueue.find(j => j.id === jobId);
        if (!job || !job.data) return;

        try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, timestamp, created_at, ...payload } = job.data as any;
            const cleanPayload = {
                ...payload,
                requires_review: false // Finalized
            };

            if (job.fromDb || job.data.id) {
                const targetId = job.data.id || job.id;
                const { error } = await supabase.from('invoices').update(cleanPayload).eq('id', targetId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('invoices').insert([cleanPayload]);
                if (error) throw error;
            }

            setBatchQueue(prev => prev.map(j => j.id === jobId ? { ...j, status: 'saved', isDuplicate: false } : j));
            addLogEntry?.('Approve Invoice', `Approved invoice #${job.data.invoice_metadata?.invoice_number || 'Direct'}`);
        } catch (err: any) {
            alert(`Approval failed: ${err.message}`);
        }
    };

    // Save and optionally jump to next reviewable job
    const handleSaveActive = async (openNext = false) => {
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
                const targetId = activeJob.data.id || activeJob.id;
                const { error } = await supabase
                    .from('invoices')
                    .update(cleanPayload)
                    .eq('id', targetId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('invoices').insert([cleanPayload]);
                if (error) throw error;
            }

            addLogEntry?.('Approve Invoice', `Approved invoice #${activeJob.data.invoice_metadata?.invoice_number || 'WA/Upload'}`);

            // Update job status to saved
            setBatchQueue(prev => prev.map(j => j.id === activeJobId ? { ...j, status: 'saved', isDuplicate: false } : j));

            if (openNext) {
                const remaining = batchQueue.filter(j => j.status === 'review' && j.id !== activeJobId);
                if (remaining.length > 0) {
                    setActiveJobId(remaining[0].id);
                    return;
                }
            }
            setActiveJobId(null); // Go back to list
        } catch (error: any) {
            alert(`Failed to save: ${error.message}`);
        }
    };

    const handleDiscardActive = async () => {
        const activeJob = batchQueue.find(j => j.id === activeJobId);

        if (activeJob?.fromDb && activeJob.data?.id) {
            if (confirm("Delete this pending invoice from the database?")) {
                try {
                    await supabase.from('invoices').delete().eq('id', activeJob.data.id);
                    addLogEntry?.('Delete Invoice', `Discarded invoice: ${activeJob.data.invoice_metadata?.invoice_number || activeJob.data.filename}`);
                } catch (err: any) {
                    alert(`Failed to delete: ${err.message}`);
                    return;
                }
            } else {
                return;
            }
        }

        // Remove from queue
        setBatchQueue(prev => prev.filter(j => j.id !== activeJobId));
        setActiveJobId(null);
    };

    // Filter queue jobs
    const reviewableJobs = batchQueue.filter(j => j.status === 'review' && j.data);
    const currentReviewIndex = reviewableJobs.findIndex(j => j.id === activeJobId);
    const hasPrev = currentReviewIndex > 0;
    const hasNext = currentReviewIndex < reviewableJobs.length - 1;

    const filteredJobs = batchQueue.filter(job => {
        if (queueFilter === 'review') return job.status === 'review';
        if (queueFilter === 'saved') return job.status === 'saved';
        if (queueFilter === 'error') return job.status === 'error';
        return true;
    }).filter(job => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const vendor = (job.data?.issuer_details?.name || '').toLowerCase();
        const invNum = (job.data?.invoice_metadata?.invoice_number || '').toLowerCase();
        const file = (job.file?.name || job.data?.filename || '').toLowerCase();
        return vendor.includes(q) || invNum.includes(q) || file.includes(q);
    });

    const pendingReviewCount = batchQueue.filter(j => j.status === 'review').length;
    const savedCount = batchQueue.filter(j => j.status === 'saved').length;
    const errorCount = batchQueue.filter(j => j.status === 'error').length;

    return (
        <div className="h-full">
            {activeTab === 'upload' && (
                <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
                    {/* Header / Uploader */}
                    {!activeJobId && (
                        <>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                <div>
                                    <div className="flex items-center gap-2.5">
                                        <h2 className="text-xl font-black text-slate-900">Scan & Import Invoices</h2>
                                        <span className="bg-[#8EBF45]/15 text-[#658C3E] text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-[#8EBF45]/30">
                                            AI Document OCR
                                        </span>
                                    </div>
                                    <p className="text-slate-500 text-xs mt-1">
                                        Upload bills or PDFs. Gemini AI extracts vendors, GST, line items, and totals automatically.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 relative">
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span>WhatsApp & Slack Live</span>
                                    </div>

                                    <button 
                                        onClick={fetchPending}
                                        className="p-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all shadow-xs"
                                        title="Refresh Pending Reviews from Database"
                                    >
                                        <RefreshCw size={14} />
                                    </button>

                                    <button 
                                        onClick={handleManualEntry} 
                                        className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                    >
                                        <Plus size={14} />
                                        <span>Manual Entry</span>
                                    </button>

                                    <button
                                        onClick={() => setShowSettings(!showSettings)}
                                        className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-xs"
                                    >
                                        <SettingsIcon size={14} />
                                        <span>{aiProvider === 'gemini' ? 'Gemini 2.5' : aiProvider === 'ollama' ? 'Ollama' : 'OpenRouter'}</span>
                                    </button>

                                    {showSettings && (
                                        <div className="absolute top-12 right-0 bg-white border border-slate-200 shadow-2xl rounded-2xl p-4 z-50 w-80 animate-fade-in">
                                            <div className="flex justify-between items-center mb-3">
                                                <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider">AI Engine Config</h4>
                                                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-red-500 text-xs font-bold">✕</button>
                                            </div>
                                            <div className="space-y-2 mb-4">
                                                <button
                                                    onClick={() => setAiProvider('gemini')}
                                                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${aiProvider === 'gemini' ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs' : 'hover:bg-slate-50 border border-transparent text-slate-600'}`}
                                                >
                                                    <CloudLightning size={16} className={aiProvider === 'gemini' ? "text-blue-600" : "text-slate-400"} />
                                                    <div>
                                                        <p className="font-bold">Google Gemini 2.5 Flash</p>
                                                        <p className="text-[10px] text-slate-400 font-normal">Primary Production OCR (Recommended)</p>
                                                    </div>
                                                </button>
                                                <button
                                                    onClick={() => setAiProvider('ollama')}
                                                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${aiProvider === 'ollama' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs' : 'hover:bg-slate-50 border border-transparent text-slate-600'}`}
                                                >
                                                    <Cpu size={16} className={aiProvider === 'ollama' ? "text-indigo-600" : "text-slate-400"} />
                                                    <div>
                                                        <p className="font-bold">Ollama (Local / Offline)</p>
                                                        <p className="text-[10px] text-slate-400 font-normal">Self-hosted local vision model</p>
                                                    </div>
                                                </button>
                                                <button
                                                    onClick={() => setAiProvider('openrouter')}
                                                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${aiProvider === 'openrouter' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs' : 'hover:bg-slate-50 border border-transparent text-slate-600'}`}
                                                >
                                                    <Cpu size={16} className={aiProvider === 'openrouter' ? "text-emerald-600" : "text-slate-400"} />
                                                    <div>
                                                        <p className="font-bold">OpenRouter</p>
                                                        <p className="text-[10px] text-slate-400 font-normal">Multi-provider routing endpoint</p>
                                                    </div>
                                                </button>
                                            </div>

                                            {aiProvider === 'ollama' && (
                                                <div className="pt-3 border-t border-slate-100 space-y-2">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Server URL</label>
                                                        <input className="w-full text-xs p-1.5 border rounded-lg" value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Model</label>
                                                        <input className="w-full text-xs p-1.5 border rounded-lg" value={ollamaModel} onChange={e => setOllamaModel(e.target.value)} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">API Key (Optional)</label>
                                                        <input className="w-full text-xs p-1.5 border rounded-lg" type="password" value={ollamaKey} onChange={e => setOllamaKey(e.target.value)} />
                                                    </div>
                                                </div>
                                            )}
                                            {aiProvider === 'openrouter' && (
                                                <div className="pt-3 border-t border-slate-100 space-y-2">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Model Name</label>
                                                        <input className="w-full text-xs p-1.5 border rounded-lg" value={openRouterModel} onChange={e => setOpenRouterModel(e.target.value)} />
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
                                                        className="w-full bg-slate-800 text-white text-xs py-1.5 px-3 rounded-lg hover:bg-slate-900 transition-colors disabled:opacity-50 font-bold"
                                                    >
                                                        {isTestingOpenRouter ? "Testing..." : "Test Connection"}
                                                    </button>
                                                    {openRouterStatus && (
                                                        <p className={`text-[10px] p-1.5 rounded-lg border leading-tight ${openRouterStatus.success ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"}`}>
                                                            {openRouterStatus.message}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                            {aiProvider === 'gemini' && (
                                                <div className="pt-3 border-t border-slate-100">
                                                    <p className="text-[10px] text-slate-500 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                                                        ⚡ Connected to high-accuracy Gemini 2.5 Flash pipeline.
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

                    {/* Processing Queue Section */}
                    {batchQueue.length > 0 && !activeJobId && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                            {/* Queue Header with Filters and Actions */}
                            <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-black text-sm text-slate-800 uppercase tracking-wide">
                                        Processing & Review Queue
                                    </h3>
                                    <span className="bg-slate-200 text-slate-700 text-xs font-black px-2 py-0.5 rounded-full">
                                        {batchQueue.length}
                                    </span>
                                    {isQueueRunning && (
                                        <span className="flex items-center gap-1.5 text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 animate-pulse">
                                            <Loader2 className="animate-spin" size={12} />
                                            <span>Extracting Data...</span>
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Filter Pills */}
                                    <div className="inline-flex bg-slate-200/70 p-0.5 rounded-lg text-xs font-bold text-slate-600">
                                        <button
                                            onClick={() => setQueueFilter('all')}
                                            className={`px-2.5 py-1 rounded-md transition-all ${queueFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-black' : 'hover:text-slate-900'}`}
                                        >
                                            All ({batchQueue.length})
                                        </button>
                                        <button
                                            onClick={() => setQueueFilter('review')}
                                            className={`px-2.5 py-1 rounded-md transition-all ${queueFilter === 'review' ? 'bg-white text-amber-700 shadow-xs font-black' : 'hover:text-slate-900'}`}
                                        >
                                            Review ({pendingReviewCount})
                                        </button>
                                        <button
                                            onClick={() => setQueueFilter('saved')}
                                            className={`px-2.5 py-1 rounded-md transition-all ${queueFilter === 'saved' ? 'bg-white text-green-700 shadow-xs font-black' : 'hover:text-slate-900'}`}
                                        >
                                            Saved ({savedCount})
                                        </button>
                                        {errorCount > 0 && (
                                            <button
                                                onClick={() => setQueueFilter('error')}
                                                className={`px-2.5 py-1 rounded-md transition-all ${queueFilter === 'error' ? 'bg-white text-red-700 shadow-xs font-black' : 'hover:text-slate-900'}`}
                                            >
                                                Errors ({errorCount})
                                            </button>
                                        )}
                                    </div>

                                    {/* Clear Completed / Finished Button */}
                                    {(savedCount > 0 || errorCount > 0) && (
                                        <button
                                            onClick={handleClearFinished}
                                            className="px-2.5 py-1 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg border border-slate-200 transition-all"
                                            title="Clear finished and error items from list"
                                        >
                                            Clear Finished
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Queue Items Table / Cards */}
                            <div className="divide-y divide-slate-100">
                                {filteredJobs.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 text-xs italic">
                                        No items matching the selected filter.
                                    </div>
                                ) : (
                                    filteredJobs.map(job => {
                                        const vendorName = job.data?.issuer_details?.name || 'Vendor Unspecified';
                                        const invNumber = job.data?.invoice_metadata?.invoice_number;
                                        const invDate = job.data?.invoice_metadata?.invoice_date;
                                        const grandTotal = job.data?.totals?.grand_total;
                                        const category = job.data?.invoice_metadata?.expense_category;
                                        const itemCount = job.data?.items?.length || 0;
                                        const isPdf = Boolean(
                                            job.file?.type?.includes('pdf') ||
                                            job.data?.filename?.toLowerCase().endsWith('.pdf') ||
                                            (job.previewUrl && job.previewUrl.toLowerCase().includes('.pdf'))
                                        );

                                        return (
                                            <div
                                                key={job.id}
                                                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors group"
                                            >
                                                {/* Left: Thumbnail & Details */}
                                                <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                                                    {/* Document Preview Thumbnail */}
                                                    <div 
                                                        onClick={() => job.status === 'review' && setActiveJobId(job.id)}
                                                        className={`w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden border shrink-0 transition-all ${
                                                            job.status === 'review' ? 'cursor-pointer hover:border-[#8EBF45] hover:shadow-xs bg-white border-slate-200' : 'bg-slate-100 border-slate-200'
                                                        }`}
                                                    >
                                                        {job.previewUrl && !isPdf ? (
                                                            <img src={job.previewUrl} className="w-full h-full object-cover" alt="Preview" />
                                                        ) : (
                                                            <div className="flex flex-col items-center justify-center p-1 text-slate-400">
                                                                <FileText size={20} className={isPdf ? "text-red-400" : "text-slate-400"} />
                                                                <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5 text-slate-500">
                                                                    {isPdf ? 'PDF' : 'DOC'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Document Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="font-extrabold text-sm text-slate-900 truncate">
                                                                {job.status === 'review' || job.status === 'saved' ? vendorName : (job.file?.name || job.data?.filename || 'Document')}
                                                            </p>
                                                            
                                                            {/* Status Badge */}
                                                            {job.status === 'pending' && (
                                                                <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full font-bold">
                                                                    ⏳ Queued
                                                                </span>
                                                            )}
                                                            {job.status === 'processing' && (
                                                                <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-indigo-100">
                                                                    <Loader2 className="animate-spin" size={10} /> Extracting...
                                                                </span>
                                                            )}
                                                            {job.status === 'review' && (
                                                                <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full font-bold border border-amber-200">
                                                                    ⚠️ Ready for Review
                                                                </span>
                                                            )}
                                                            {job.status === 'saved' && (
                                                                <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-emerald-200">
                                                                    <CheckCircle size={10} /> Saved
                                                                </span>
                                                            )}
                                                            {job.status === 'error' && (
                                                                <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-red-200">
                                                                    <AlertCircle size={10} /> Error
                                                                </span>
                                                            )}
                                                            {job.isDuplicate && job.status !== 'saved' && (
                                                                <span className="text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-bold border border-red-200">
                                                                    Duplicate Warning
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Subtitle / Metadata Row */}
                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                                                            {invNumber && (
                                                                <span className="font-semibold text-slate-700">
                                                                    #{invNumber}
                                                                </span>
                                                            )}
                                                            {invDate && (
                                                                <span>📅 {invDate}</span>
                                                            )}
                                                            {itemCount > 0 && (
                                                                <span>📦 {itemCount} line item{itemCount > 1 ? 's' : ''}</span>
                                                            )}
                                                            {category && (
                                                                <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                                                    {category.replace(/_/g, ' ').toUpperCase()}
                                                                </span>
                                                            )}
                                                            {job.fromDb && (
                                                                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold">
                                                                    From WhatsApp / Webhook
                                                                </span>
                                                            )}
                                                            {job.error && (
                                                                <span className="text-red-500 text-xs italic">{job.error}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right: Amount & Actions */}
                                                <div className="flex items-center justify-between md:justify-end gap-3 pl-16 md:pl-0">
                                                    {grandTotal !== undefined && grandTotal !== null && (
                                                        <div className="text-right mr-2">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Grand Total</p>
                                                            <p className="text-sm font-black text-slate-900 font-mono">
                                                                ₹{Number(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                            </p>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-1.5">
                                                        {job.status === 'review' && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => handleDirectApprove(job.id, e)}
                                                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 text-xs font-bold transition-all flex items-center gap-1"
                                                                    title="Quick Approve Directly"
                                                                >
                                                                    <CheckCircle size={14} />
                                                                    <span className="hidden sm:inline">Approve</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => setActiveJobId(job.id)}
                                                                    className="bg-[#8EBF45] text-[#0D0D0D] hover:bg-[#658C3E] hover:text-white px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider shadow-xs transition-all"
                                                                >
                                                                    Review & Edit
                                                                </button>
                                                            </>
                                                        )}

                                                        {/* Delete Button (Available for ALL jobs in queue) */}
                                                        <button
                                                            onClick={(e) => handleDeleteJob(job.id, e)}
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-200"
                                                            title="Delete / Discard from Queue"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Review Mode (Active Job Modal / Full Screen Split) */}
                    {activeJobId && (
                        (() => {
                            const job = batchQueue.find(j => j.id === activeJobId);
                            if (!job || !job.data) return null;

                            const isPdf = Boolean(
                                job.file?.type?.includes('pdf') ||
                                job.data?.filename?.toLowerCase().endsWith('.pdf') ||
                                (job.previewUrl && job.previewUrl.toLowerCase().includes('.pdf'))
                            );

                            return (
                                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-fade-in">
                                    {/* Review Sticky Header */}
                                    <div className="p-4 border-b border-slate-200 flex flex-wrap justify-between items-center bg-slate-50/90 backdrop-blur-sm sticky top-0 z-20 gap-3">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setActiveJobId(null)}
                                                className="text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold text-xs shadow-xs transition-all flex items-center gap-1"
                                            >
                                                <span>← Back to Queue</span>
                                            </button>
                                            <div className="h-5 w-px bg-slate-300"></div>
                                            <div>
                                                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                                                    <span>Review Extracted Invoice</span>
                                                    {job.isDuplicate && (
                                                        <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                            <AlertTriangle size={10} /> Duplicate
                                                        </span>
                                                    )}
                                                </h3>
                                                <p className="text-[11px] text-slate-500 font-medium truncate max-w-xs">
                                                    {job.file?.name || job.data?.filename || 'Document'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Multi-review navigation & Action Buttons */}
                                        <div className="flex items-center gap-2">
                                            {reviewableJobs.length > 1 && (
                                                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 mr-1 shadow-xs">
                                                    <button
                                                        onClick={() => hasPrev && setActiveJobId(reviewableJobs[currentReviewIndex - 1].id)}
                                                        disabled={!hasPrev}
                                                        className="px-2 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 disabled:opacity-30"
                                                        title="Previous Pending Invoice"
                                                    >
                                                        ◀ Prev
                                                    </button>
                                                    <span className="text-[10px] text-slate-400 font-bold px-1">
                                                        {currentReviewIndex + 1} / {reviewableJobs.length}
                                                    </span>
                                                    <button
                                                        onClick={() => hasNext && setActiveJobId(reviewableJobs[currentReviewIndex + 1].id)}
                                                        disabled={!hasNext}
                                                        className="px-2 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 disabled:opacity-30"
                                                        title="Next Pending Invoice"
                                                    >
                                                        Next ▶
                                                    </button>
                                                </div>
                                            )}

                                            <button
                                                onClick={handleDiscardActive}
                                                className="text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                                            >
                                                <Trash2 size={14} />
                                                <span>Discard / Delete</span>
                                            </button>

                                            {reviewableJobs.length > 1 && (
                                                <button
                                                    onClick={() => handleSaveActive(true)}
                                                    className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5"
                                                    title="Save this invoice and immediately review next"
                                                >
                                                    <Save size={14} />
                                                    <span>Approve & Next →</span>
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleSaveActive(false)}
                                                className="bg-[#8EBF45] text-[#0D0D0D] hover:bg-[#658C3E] hover:text-white px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-1.5"
                                            >
                                                <CheckCircle size={14} />
                                                <span>Approve & Save</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2-Column Split View: Left Document Preview / Right Form */}
                                    <div className="grid md:grid-cols-2 h-[calc(100vh-180px)] min-h-[600px]">
                                        {/* Left: Document Viewer (PDF iframe or Image) */}
                                        <div className="bg-slate-100 p-4 flex flex-col border-r border-slate-200 overflow-hidden">
                                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 shrink-0">
                                                <span className="text-xs font-bold text-slate-700 truncate max-w-xs">
                                                    📄 {job.file?.name || job.data?.filename || 'Document Preview'}
                                                </span>
                                                {job.previewUrl && (
                                                    <a
                                                        href={job.previewUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs text-[#658C3E] hover:underline font-bold flex items-center gap-1"
                                                    >
                                                        <span>Open Full Document ↗</span>
                                                    </a>
                                                )}
                                            </div>

                                            <div className="flex-1 w-full h-full rounded-xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center">
                                                {job.previewUrl ? (
                                                    isPdf ? (
                                                        <iframe
                                                            src={job.previewUrl}
                                                            className="w-full h-full border-0"
                                                            title="PDF Invoice Document"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full overflow-y-auto p-2 flex items-start justify-center">
                                                            <img
                                                                src={job.previewUrl}
                                                                className="w-full max-w-full h-auto object-contain rounded-lg shadow-xs"
                                                                alt="Invoice Document"
                                                            />
                                                        </div>
                                                    )
                                                ) : (
                                                    <div className="h-full flex items-center justify-center text-slate-400 flex-col p-6 text-center">
                                                        <FileText size={48} className="mb-3 opacity-40" />
                                                        <p className="text-sm font-semibold text-slate-600">Manual Entry Document</p>
                                                        <p className="text-xs text-slate-400 mt-1">No original document attachment provided.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Editable Extraction Form & Stock Panel */}
                                        <div className="overflow-y-auto h-full p-5 space-y-6">
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
                    addLogEntry={addLogEntry}
                />
            )}

            {activeTab === 'expenses' && (
                <ExpenseForm currentUser={currentUser} addLogEntry={addLogEntry} />
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
                    setInvoiceDraft={setInvoiceDraft}
                />
            )}

            {activeTab === 'prices' && (
                <PriceList priceList={priceList} setPriceList={setPriceList} />
            )}

            {activeTab === 'ledger' && (
                <LedgerPanel currentUser={currentUser} companyProfiles={companyProfiles} />
            )}
        </div>
    );
};

export default InvoiceModule;
