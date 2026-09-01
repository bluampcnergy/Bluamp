
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { ExtractedInvoice } from '../../types';
import { generateCSV, generateCompanyProfileCSV, downloadFile, safeRender } from '../../utils/invoiceUtils';
import { FileSpreadsheet, FileJson, Loader2, RefreshCw, Search, FileText, Plus, X, Building, ChevronDown, ChevronUp, Trash2, Download, Mail, CheckCircle, Square, CheckSquare, MinusSquare, History } from './Icons';
import { ImportIcon } from '../icons/ImportIcon';
import { PencilIcon } from '../icons/PencilIcon';
import Modal from '../Modal';
import InvoicePrintView from './InvoicePrintView';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface NoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    parentInvoice: ExtractedInvoice | null;
    onSuccess: () => void;
    currentUser: { username: string } | null;
    addLogEntry?: (action: string, details: string) => void;
}

const NoteModal: React.FC<NoteModalProps> = ({ isOpen, onClose, parentInvoice, onSuccess, currentUser, addLogEntry }) => {
    const [noteType, setNoteType] = useState<'credit_note' | 'debit_note'>('credit_note');
    const [noteNumber, setNoteNumber] = useState('');
    const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
    const [amount, setAmount] = useState<number>(0);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && parentInvoice) {
            setAmount(parentInvoice.totals?.grand_total || 0);
            setNoteNumber(`CN-${Math.floor(Math.random() * 10000)}`);
        }
    }, [isOpen, parentInvoice]);

    if (!isOpen || !parentInvoice) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const noteRecord: any = {
            ...parentInvoice,
            id: undefined,
            created_at: undefined,
            timestamp: undefined,
            document_type: noteType,
            filename: 'Manual Entry',
            invoice_metadata: {
                ...parentInvoice.invoice_metadata,
                invoice_number: noteNumber,
                invoice_date: noteDate,
                related_invoice_number: parentInvoice.invoice_metadata.invoice_number,
                note_reason: reason
            },
            items: [],
            totals: {
                ...parentInvoice.totals,
                grand_total: amount,
                subtotal_taxable: amount,
                cgst_total: 0,
                sgst_total: 0,
                igst_total: 0
            },
            requires_review: false,
            uploaded_by: currentUser?.username || 'system'
        };

        delete noteRecord.id;
        delete noteRecord.timestamp;

        try {
            const { error } = await supabase.from('invoices').insert([noteRecord]);
            if (error) throw error;
            if (addLogEntry) {
                addLogEntry('Created Note', `Created ${noteType === 'credit_note' ? 'Credit Note' : 'Debit Note'} #${noteNumber} for ₹${amount} (Ref Invoice #${parentInvoice.invoice_metadata?.invoice_number})`);
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            alert("Failed to create note: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#0D0D0D]/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
                <div className="bg-slate-50 border-b p-4 flex justify-between items-center">
                    <h3 className="font-bold text-[#0D0D0D] flex items-center gap-2 font-brand">
                        <FileText size={18} className="text-[#8EBF45]" />
                        Add Debit/Credit Note
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="bg-[#8EBF45]/10 p-3 rounded-lg text-sm text-[#658C3E] mb-4 border border-[#A8BF75]/30">
                        Linked to Invoice: <span className="font-bold">{safeRender(parentInvoice.invoice_metadata?.invoice_number)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                            <select
                                className="w-full p-2 border rounded-md border-slate-200 outline-none focus:border-[#8EBF45]"
                                value={noteType}
                                onChange={(e) => setNoteType(e.target.value as any)}
                            >
                                <option value="credit_note">Credit Note</option>
                                <option value="debit_note">Debit Note</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                            <input
                                type="date"
                                required
                                className="w-full p-2 border rounded-md border-slate-200 outline-none focus:border-[#8EBF45]"
                                value={noteDate}
                                onChange={(e) => setNoteDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Note Number</label>
                            <input
                                type="text"
                                required
                                className="w-full p-2 border rounded-md border-slate-200 outline-none focus:border-[#8EBF45]"
                                value={noteNumber}
                                onChange={(e) => setNoteNumber(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Value (₹)</label>
                            <input
                                type="number"
                                required
                                step="0.01"
                                className="w-full p-2 border rounded-md font-bold border-slate-200 outline-none focus:border-[#8EBF45]"
                                value={amount}
                                onChange={(e) => setAmount(parseFloat(e.target.value))}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason</label>
                        <textarea
                            className="w-full p-2 border rounded-md text-sm border-slate-200 outline-none focus:border-[#8EBF45]"
                            rows={2}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Sales Return, Deficiency in service"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">Cancel</button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-[#8EBF45] hover:bg-[#658C3E] text-[#0D0D0D] hover:text-white px-6 py-2 rounded-lg text-sm font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                            Create Note
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

interface DashboardProps {
    currentUser: { username: string; role: 'admin' | 'user' | 'billing' } | null;
    setView?: (view: any) => void;
    onEditInvoice?: (invoice: ExtractedInvoice) => void;
    addLogEntry?: (action: string, details: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ currentUser, setView, onEditInvoice, addLogEntry }) => {
    const [invoices, setInvoices] = useState<ExtractedInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    // Filters
    const [invoiceType, setInvoiceType] = useState<'purchase' | 'sales'>('purchase');
    const [documentCategory, setDocumentCategory] = useState<'invoice' | 'po' | 'quotation' | 'proforma_invoice' | 'debit_note' | 'credit_note'>('invoice');
    const [filterStart, setFilterStart] = useState('');
    const [filterEnd, setFilterEnd] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<ExtractedInvoice | null>(null);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

    const [importModalOpen, setImportModalOpen] = useState(false);
    const [itemsToImport, setItemsToImport] = useState<any[]>([]);
    const [sourceInvoice, setSourceInvoice] = useState<ExtractedInvoice | null>(null);
    const [printInvoice, setPrintInvoice] = useState<ExtractedInvoice | null>(null);
    const [sendingMailId, setSendingMailId] = useState<string | null>(null);
    const [autoMailInvoice, setAutoMailInvoice] = useState<{inv: ExtractedInvoice, targetEmail: string} | null>(null);

    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDownloading, setBulkDownloading] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

    const [bulkInvoices, setBulkInvoices] = useState<ExtractedInvoice[] | null>(null);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === invoices.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(invoices.map(inv => inv.id as string)));
        }
    };

    const handleBulkDownload = async () => {
        const selected = invoices.filter(inv => selectedIds.has(inv.id as string));
        if (selected.length === 0) return;

        setBulkDownloading(true);
        setBulkInvoices(selected);
        
        // Give InvoicePrintView time to render all invoices
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Use native window.print() instead of html2pdf for bulk
        // This is much faster, avoids memory crashes, and perfectly generates one single PDF file.
        window.print();
        
        // Clean up
        setTimeout(() => {
            setBulkInvoices(null);
            setBulkDownloading(false);
            setBulkProgress({ current: 0, total: 0 });
        }, 1000);
    };

    const handleSendMail = async (inv: ExtractedInvoice) => {
        // Handle POs where the other party might be in supplier_details
        const targetEmail = inv.receiver_details?.email || inv.supplier_details?.email || inv.issuer_details?.email;
        if (!targetEmail) {
            alert("No email address found in this document to send to.");
            return;
        }

        const confirmSend = window.confirm(`Send ${inv.document_type.replace(/_/g, ' ').toUpperCase()} to ${targetEmail}?`);
        if (!confirmSend) return;

        setSendingMailId(inv.id as string);
        setAutoMailInvoice({ inv, targetEmail });
    };

    const handleMailSentSuccess = async (inv: ExtractedInvoice) => {
        try {
            const updatedMetadata = { ...inv.invoice_metadata, mail_sent: true };
            const { error: updateError } = await supabase
                .from('invoices')
                .update({ invoice_metadata: updatedMetadata })
                .match({ id: inv.id });

            if (updateError) throw updateError;

            setInvoices(prev => prev.map(item => item.id === inv.id ? { ...item, invoice_metadata: updatedMetadata } : item));
            alert("Mail sent successfully!");
        } catch (err: any) {
            console.error("Mail update error:", err);
        } finally {
            setSendingMailId(null);
            setAutoMailInvoice(null);
        }
    };

    const handleMailError = (err: Error) => {
        alert("Error sending mail: " + err.message);
        setSendingMailId(null);
        setAutoMailInvoice(null);
    };

    const fetchInvoices = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            let query = supabase
                .from('invoices')
                .select('id, source_type, document_type, invoice_metadata, receiver_details, issuer_details, totals, filename, created_at, items')
                .eq('requires_review', false)
                .order('created_at', { ascending: false });

            if (documentCategory === 'po') {
                if (invoiceType === 'purchase') {
                    query = query.in('document_type', ['po', 'generated_po', 'purchase_order']);
                } else {
                    query = query.eq('source_type', invoiceType).in('document_type', ['po', 'generated_po', 'purchase_order']);
                }
            } else {
                query = query.eq('source_type', invoiceType);

                if (documentCategory === 'invoice') {
                    query = query.in('document_type', ['invoice', 'generated_invoice', 'receipt', 'other']);
                } else if (documentCategory === 'quotation') {
                    query = query.in('document_type', ['quotation', 'generated_quotation']);
                } else if (documentCategory === 'proforma_invoice') {
                    query = query.in('document_type', ['proforma_invoice', 'generated_proforma_invoice']);
                } else if (documentCategory === 'debit_note') {
                    query = query.in('document_type', ['debit_note', 'generated_debit_note']);
                } else if (documentCategory === 'credit_note') {
                    query = query.in('document_type', ['credit_note', 'generated_credit_note']);
                } else {
                    query = query.eq('document_type', documentCategory);
                }
            }

            if (filterStart) {
                query = query.gte('invoice_metadata->>invoice_date', filterStart);
            }
            if (filterEnd) {
                query = query.lte('invoice_metadata->>invoice_date', filterEnd);
            }

            query = query.limit(200);

            const { data, error } = await query;

            if (error) throw error;
            setInvoices(data as ExtractedInvoice[]);
        } catch (error: any) {
            console.error('Error fetching invoices:', error);
            setErrorMsg(error.message || "Failed to load invoices from database.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchInvoices();
        }, 300);
        return () => clearTimeout(timer);
    }, [filterStart, filterEnd, invoiceType, documentCategory]);

    const [filteredInvoicesCount, setFilteredInvoicesCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 10;

    const filteredInvoices = React.useMemo(() => {
        if (!searchTerm.trim()) return invoices;
        const term = searchTerm.toLowerCase();
        return invoices.filter(inv => {
            const invNo = String(inv.invoice_metadata?.invoice_number || '').toLowerCase();
            const issuer = String(inv.issuer_details?.name || '').toLowerCase();
            const receiver = String(inv.receiver_details?.name || '').toLowerCase();
            return invNo.includes(term) || issuer.includes(term) || receiver.includes(term);
        });
    }, [invoices, searchTerm]);

    const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
    const paginatedInvoices = React.useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredInvoices.slice(start, start + PAGE_SIZE);
    }, [filteredInvoices, currentPage]);

    // Reset to page 1 whenever filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterStart, filterEnd, invoiceType, documentCategory, searchTerm]);

    const handleExport = (format: 'csv' | 'json') => {
        setExporting(true);
        try {
            if (invoices.length === 0) {
                alert("No data to export");
                return;
            }
            if (format === 'csv') {
                const csv = generateCSV(invoices);
                downloadFile(csv, `invoice_export_${new Date().toISOString().split('T')[0]}.csv`, 'csv');
            } else {
                const json = JSON.stringify(invoices, null, 2);
                downloadFile(json, `invoice_export_${new Date().toISOString().split('T')[0]}.json`, 'json');
            }
        } finally {
            setExporting(false);
        }
    };

    const handleCompanyExport = () => {
        setExporting(true);
        try {
            if (invoices.length === 0) {
                alert("No data available to generate company profiles.");
                return;
            }
            const csv = generateCompanyProfileCSV(invoices);
            downloadFile(csv, `company_profiles_${new Date().toISOString().split('T')[0]}.csv`, 'csv');
        } finally {
            setExporting(false);
        }
    };

    const handleImportToInventory = (invoice: ExtractedInvoice) => {
        if (!invoice.items || invoice.items.length === 0) {
            alert('This invoice has no items to import.');
            return;
        }

        const items = invoice.items.map(item => ({
            name: item.description || 'Unknown Item',
            category: item.item_type || 'Uncategorized',
            makeModel: item.make_model || '',
            quantity: Number(item.quantity) || 0,
            status: item.status || 'Not Damaged'
        }));

        setItemsToImport(items);
        setSourceInvoice(invoice);
        setImportModalOpen(true);
    };

    const handleImportFieldChange = (index: number, field: string, value: string | number) => {
        const updated = [...itemsToImport];
        updated[index] = { ...updated[index], [field]: value };
        setItemsToImport(updated);
    };

    const handleAddItemToImport = () => {
        setItemsToImport(prev => [...prev, { name: '', category: 'Uncategorized', makeModel: '', quantity: 1, status: 'Not Damaged' }]);
    };

    const handleRemoveItemFromImport = (index: number) => {
        setItemsToImport(prev => prev.filter((_, i) => i !== index));
    };

    const handleConfirmImport = () => {
        const exportData = itemsToImport.map(item => ({
            name: item.name,
            category: item.category,
            makeModel: item.makeModel,
            supplier: sourceInvoice?.issuer_details?.name || 'Unknown',
            invoiceNumber: sourceInvoice?.invoice_metadata?.invoice_number || 'Unknown',
            quantity: Number(item.quantity),
            status: item.status
        }));

        localStorage.setItem('pendingInventoryImport', JSON.stringify(exportData));
        if (addLogEntry) {
            addLogEntry('Imported Inventory Stock', `Staged ${itemsToImport.length} line items from invoice #${sourceInvoice?.invoice_metadata?.invoice_number || 'Unknown'} for inventory import.`);
        }
        setImportModalOpen(false);
        setSourceInvoice(null);
        setItemsToImport([]);

        if (setView) setView('received');
        else alert('Navigation not available. Go to Operations manually.');
    };

    const handleDeleteInvoice = async (id: string) => {
        if (!id) return;
        const targetInv = invoices.find(inv => inv.id === id);
        const invNum = targetInv?.invoice_metadata?.invoice_number || targetInv?.filename || id;
        if (!confirm(`Are you sure you want to delete invoice #${invNum}? This action cannot be undone.`)) return;

        try {
            const { error } = await supabase.from('invoices').delete().match({ id: id });
            if (error) throw error;
            if (addLogEntry) {
                addLogEntry('Deleted Document', `Deleted financial document #${invNum} (ID: ${id})`);
            }
            setInvoices(prev => prev.filter(inv => inv.id !== id));
            alert("Invoice deleted successfully.");
        } catch (err: any) {
            console.error("Delete failed:", err);
            alert("Error deleting invoice: " + (err.message || "Unknown error"));
        }
    };

    const openNoteModal = (invoice: ExtractedInvoice) => {
        setSelectedInvoice(invoice);
        setIsNoteModalOpen(true);
    };

    const toggleRow = (id: string | undefined) => {
        if (!id) return;
        setExpandedRowId(expandedRowId === id ? null : id);
    };

    return (
        <div className="max-w-7xl mx-auto animate-fade-in space-y-6 pb-20">
            <NoteModal
                isOpen={isNoteModalOpen}
                onClose={() => setIsNoteModalOpen(false)}
                parentInvoice={selectedInvoice}
                onSuccess={fetchInvoices}
                currentUser={currentUser}
                addLogEntry={addLogEntry}
            />

            <Modal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} title="Confirm Inventory Import" persistent={true} size="xl">
                <div className="space-y-4">
                    <div className="bg-[#8EBF45]/10 border border-[#A8BF75]/30 p-3 rounded text-sm text-[#658C3E] mb-4">
                        <p><strong>Review items before adding to stock.</strong> You can edit the names, categories, and quantities here.</p>
                    </div>
                    <div className="overflow-x-auto border rounded-md border-slate-200 max-h-[60vh]">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 text-[#0D0D0D] font-bold sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 w-10">#</th>
                                    <th className="p-3 min-w-[200px]">Item Name</th>
                                    <th className="p-3 min-w-[120px]">Category</th>
                                    <th className="p-3 min-w-[150px]">Make & Model</th>
                                    <th className="p-3 w-24 text-right">Qty</th>
                                    <th className="p-3 w-32">Status</th>
                                    <th className="p-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white font-medium">
                                {itemsToImport.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="p-3 text-xs text-slate-400">{idx + 1}</td>
                                        <td className="p-3"><input className="w-full border border-slate-200 rounded px-2 py-1 outline-none focus:border-[#8EBF45]" value={item.name || ''} onChange={(e) => handleImportFieldChange(idx, 'name', e.target.value)} /></td>
                                        <td className="p-3"><input className="w-full border border-slate-200 rounded px-2 py-1 outline-none focus:border-[#8EBF45]" value={item.category || ''} onChange={(e) => handleImportFieldChange(idx, 'category', e.target.value)} /></td>
                                        <td className="p-3"><input className="w-full border border-slate-200 rounded px-2 py-1 outline-none focus:border-[#8EBF45]" value={item.makeModel || ''} onChange={(e) => handleImportFieldChange(idx, 'makeModel', e.target.value)} /></td>
                                        <td className="p-3 text-right"><input type="number" className="w-full text-right border border-slate-200 rounded px-2 py-1 outline-none focus:border-[#8EBF45]" value={item.quantity} onChange={(e) => handleImportFieldChange(idx, 'quantity', e.target.value)} /></td>
                                        <td className="p-3">
                                            <select className="w-full border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-[#8EBF45] bg-white" value={item.status} onChange={(e) => handleImportFieldChange(idx, 'status', e.target.value)}>
                                                <option value="Not Damaged">Not Damaged</option>
                                                <option value="Damaged">Damaged</option>
                                                <option value="Returned">Returned</option>
                                            </select>
                                        </td>
                                        <td className="p-3 text-center"><button onClick={() => handleRemoveItemFromImport(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button onClick={() => setImportModalOpen(false)} className="px-4 py-2 text-slate-600 border rounded-lg text-sm">Cancel</button>
                        <button onClick={handleConfirmImport} className="bg-[#8EBF45] hover:bg-[#658C3E] text-[#0D0D0D] hover:text-white px-6 py-2 rounded-lg text-sm font-black uppercase tracking-widest flex items-center gap-2 shadow-lg"><ImportIcon /> Confirm Import</button>
                    </div>
                </div>
            </Modal>

            {/* Document Type Categories */}
            <div className="flex gap-2 pb-2 overflow-x-auto scrollbar-hide border-b border-slate-200">
                {[
                    { id: 'invoice', label: 'Invoices' },
                    { id: 'quotation', label: 'Quotations' },
                    { id: 'po', label: 'Purchase Orders' },
                    { id: 'proforma_invoice', label: 'Proforma Invoices' },
                    { id: 'credit_note', label: 'Credit Notes' },
                    { id: 'debit_note', label: 'Debit Notes' }
                ].map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => {
                            setDocumentCategory(cat.id as any);
                            if (cat.id === 'po') {
                                setInvoiceType('purchase');
                            }
                        }}
                        className={`whitespace-nowrap px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors
                            ${documentCategory === cat.id 
                                ? 'bg-white text-indigo-600 border-t-2 border-indigo-600 border-x border-slate-200 -mb-[1px]' 
                                : 'bg-transparent text-slate-500 hover:text-slate-800'
                            }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-[#0D0D0D] font-brand tracking-tight">Invoice Dashboard</h2>
                    <p className="text-slate-500 text-sm">Real-time view of records with expandable detailed view.</p>
                </div>

                <div className="bg-slate-200 p-1 rounded-xl flex items-center shadow-inner">
                    <button
                        onClick={() => setInvoiceType('purchase')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${invoiceType === 'purchase' ? 'bg-[#8EBF45] text-[#0D0D0D] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        Purchase
                    </button>
                    <button
                        onClick={() => setInvoiceType('sales')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${invoiceType === 'sales' ? 'bg-[#8EBF45] text-[#0D0D0D] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        Sales
                    </button>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button onClick={() => fetchInvoices()} className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors" title="Refresh">
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                    <div className="flex bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <button onClick={() => handleExport('csv')} disabled={exporting} className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 border-r transition-colors">
                            <FileSpreadsheet size={16} className="text-[#8EBF45]" /> CSV
                        </button>
                        <button onClick={() => handleExport('json')} disabled={exporting} className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                            <FileJson size={16} className="text-[#8EBF45]" /> JSON
                        </button>
                    </div>
                    <button onClick={handleCompanyExport} disabled={exporting} className="flex items-center gap-2 bg-white border-2 border-[#A8BF75] text-[#658C3E] px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest shadow-sm hover:bg-[#A8BF75]/10 transition-colors">
                        <Building size={16} /> Export Companies
                    </button>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-6">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Search Invoices</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400 w-5 h-5" />
                        <input type="text" className="w-full pl-10 p-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8EBF45]/20 focus:border-[#8EBF45]" placeholder="Search by Invoice #, Supplier, or Customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>
                <div className="md:col-span-3">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">From Date</label>
                    <input type="date" className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#8EBF45] outline-none" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
                </div>
                <div className="md:col-span-3">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">To Date</label>
                    <input type="date" className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#8EBF45] outline-none" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-[#0D0D0D] font-bold border-b border-slate-200">
                            <tr>
                                <th className="p-4 w-10">
                                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-[#8EBF45] transition-colors" title={selectedIds.size === invoices.length ? "Deselect All" : "Select All"}>
                                        {invoices.length > 0 && selectedIds.size === invoices.length ? <CheckSquare size={18} className="text-[#8EBF45]" /> : selectedIds.size > 0 ? <MinusSquare size={18} className="text-[#8EBF45]" /> : <Square size={18} />}
                                    </button>
                                </th>
                                <th className="p-4 w-10"></th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Issuer</th>
                                <th className="p-4">Receiver</th>
                                <th className="p-4">Inv #</th>
                                <th className="p-4 text-right">Taxable</th>
                                <th className="p-4 text-right">Total</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2 text-[#8EBF45]" /> Loading data...</td></tr>
                            ) : errorMsg ? (
                                <tr><td colSpan={9} className="p-8 text-center text-red-500">Error: {errorMsg}</td></tr>
                            ) : filteredInvoices.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-400">No {invoiceType} invoices found matching filters.</td></tr>
                            ) : (
                                paginatedInvoices.map((inv) => (
                                    <React.Fragment key={inv.id}>
                                        <tr className={`hover:bg-slate-50 transition-colors group cursor-pointer ${expandedRowId === inv.id ? 'bg-[#8EBF45]/5' : ''} ${selectedIds.has(inv.id as string) ? 'bg-indigo-50/50' : ''}`} onClick={() => toggleRow(inv.id)}>
                                            <td className="p-4" onClick={(e) => { e.stopPropagation(); toggleSelect(inv.id as string); }}>
                                                {selectedIds.has(inv.id as string) ? <CheckSquare size={18} className="text-[#8EBF45]" /> : <Square size={18} className="text-slate-300 group-hover:text-slate-400" />}
                                            </td>
                                            <td className="p-4 text-slate-400">{expandedRowId === inv.id ? <ChevronUp size={16} className="text-[#8EBF45]" /> : <ChevronDown size={16} />}</td>
                                            <td className="p-4 text-slate-500 whitespace-nowrap">{safeRender(inv.invoice_metadata?.invoice_date) || (inv.created_at ? new Date(inv.created_at).toLocaleDateString() : 'N/A')}</td>
                                            <td className="p-4 font-bold text-[#0D0D0D]">{safeRender(inv.issuer_details?.name) || 'Unknown'}</td>
                                            <td className="p-4 font-medium">{safeRender(inv.receiver_details?.name) || 'Unknown'}</td>
                                            <td className="p-4 text-slate-500 font-mono font-bold">{safeRender(inv.invoice_metadata?.invoice_number) || '-'}</td>
                                            <td className="p-4 text-right font-mono">{(inv.totals?.subtotal_taxable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td className="p-4 text-right font-black text-[#0D0D0D]">₹{(inv.totals?.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td className="p-4 text-center flex justify-center items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                {inv.invoice_metadata?.edit_history && inv.invoice_metadata.edit_history.length > 0 && (
                                                    <button
                                                        onClick={() => toggleRow(inv.id)}
                                                        className="px-2 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-md text-[10px] font-black flex items-center gap-1 border border-amber-300 shadow-xs transition-all shrink-0"
                                                        title="View Edit History & Audit Trail"
                                                    >
                                                        <History size={12} className="text-amber-600" />
                                                        <span>{inv.invoice_metadata.edit_history.length} Edits</span>
                                                    </button>
                                                )}
                                                {onEditInvoice && (currentUser?.role === 'admin' || currentUser?.role === 'billing') && (
                                                    <button onClick={() => onEditInvoice(inv)} className="p-2 text-slate-400 hover:text-[#8EBF45] hover:bg-[#8EBF45]/5 rounded-lg transition-all" title="Edit Record">
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button onClick={() => setPrintInvoice(inv)} className="p-2 text-slate-400 hover:text-[#8EBF45] hover:bg-[#8EBF45]/5 rounded-lg transition-all" title="Download / Print"><Download size={16} /></button>
                                                {inv.invoice_metadata?.mail_sent ? (
                                                    <button className="p-2 text-[#8EBF45] cursor-default" title="Mail Sent"><CheckCircle size={16} /></button>
                                                ) : (
                                                    <button onClick={() => handleSendMail(inv)} disabled={sendingMailId === inv.id} className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Send Mail">
                                                        {sendingMailId === inv.id ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                                                    </button>
                                                )}
                                                {inv.document_type === 'invoice' && <button onClick={() => openNoteModal(inv)} className="p-2 text-[#658C3E] hover:bg-blue-50 rounded-lg text-xs font-bold" title="Add Note"><Plus size={14} /></button>}
                                                {inv.source_type === 'purchase' && <button onClick={() => handleImportToInventory(inv)} className="p-2 text-[#658C3E] hover:bg-[#8EBF45]/5 rounded-lg text-xs font-bold" title="Import to Stock"><ImportIcon /></button>}
                                                <button onClick={() => handleDeleteInvoice(inv.id as string)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                        {expandedRowId === inv.id && (
                                            <tr className="bg-slate-50 animate-fade-in">
                                                <td colSpan={9} className="p-6 border-b border-[#A8BF75]/20">
                                                    <div className="grid md:grid-cols-2 gap-8">
                                                        <div>
                                                            <h4 className="text-xs font-black text-[#658C3E] uppercase tracking-widest mb-4">Line Items</h4>
                                                            <div className="space-y-2">
                                                                {inv.items?.map((item, i) => (
                                                                    <div key={i} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                                                        <div className="flex-1">
                                                                            <p className="text-sm font-bold text-[#0D0D0D]">{item.description}</p>
                                                                            <p className="text-[10px] text-slate-400 uppercase font-black">HSN: {item.hsn_sac || 'N/A'} • Qty: {item.quantity}</p>
                                                                        </div>
                                                                        <div className="text-right ml-4">
                                                                            <p className="text-sm font-black text-[#0D0D0D]">₹{item.total_value?.toLocaleString('en-IN')}</p>
                                                                            <p className="text-[10px] text-[#658C3E] font-bold">@ {item.unit_price} / unit</p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {(!inv.items || inv.items.length === 0) && <p className="text-xs text-slate-400 italic">No line items recorded.</p>}
                                                            </div>
                                                        </div>
                                                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                                            <h4 className="text-xs font-black text-[#658C3E] uppercase tracking-widest mb-2">Invoice Summary</h4>
                                                            <div className="space-y-2 text-sm">
                                                                <div className="flex justify-between text-slate-500"><span>Taxable Subtotal</span><span className="font-mono">₹{inv.totals?.subtotal_taxable?.toLocaleString('en-IN')}</span></div>
                                                                <div className="flex justify-between text-slate-500"><span>Total Tax (GST)</span><span className="font-mono">₹{((inv.totals?.cgst_total || 0) + (inv.totals?.sgst_total || 0) + (inv.totals?.igst_total || 0)).toLocaleString('en-IN')}</span></div>
                                                                <div className="border-t pt-2 flex justify-between font-black text-[#0D0D0D] text-lg"><span>Grand Total</span><span className="text-[#8EBF45]">₹{inv.totals?.grand_total?.toLocaleString('en-IN')}</span></div>
                                                            </div>
                                                            <div className="mt-6 pt-4 border-t border-slate-100">
                                                                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Additional Metadata</p>
                                                                <div className="grid grid-cols-2 gap-y-2 text-xs">
                                                                    <span className="text-slate-400">Uploaded By:</span> <span className="font-bold">{inv.uploaded_by || 'Unknown'}</span>
                                                                    <span className="text-slate-400">Scan ID:</span> <span className="font-mono text-[10px] break-all">{inv.id}</span>
                                                                    {inv.invoice_metadata?.ewaybill_number && <><span className="text-slate-400">E-Way Bill:</span> <span className="font-bold">{inv.invoice_metadata.ewaybill_number}</span></>}
                                                                    {inv.image_link && <><span className="text-slate-400">Image:</span> <a href={inv.image_link} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline truncate" title={inv.image_link}>View Image/Link</a></>}
                                                                </div>
                                                            </div>
                                                            {inv.invoice_metadata?.edit_history && inv.invoice_metadata.edit_history.length > 0 && (
                                                                <div className="mt-6 pt-4 border-t border-slate-100">
                                                                    <p className="text-[10px] font-black text-[#658C3E] uppercase mb-2 flex items-center gap-1.5">
                                                                        <History size={14} className="text-[#8EBF45]" />
                                                                        Edit History & Audit Trail ({inv.invoice_metadata.edit_history.length})
                                                                    </p>
                                                                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                                                                        {inv.invoice_metadata.edit_history.map((log: any, hIdx: number) => {
                                                                            const dateStr = log.edited_at || log.timestamp;
                                                                            const userStr = log.edited_by || log.updated_by || 'User';
                                                                            const summaryStr = log.summary || log.notes || log.details || 'Document modified';
                                                                            const formattedDate = dateStr ? new Date(dateStr).toLocaleString('en-IN') : '';
                                                                            const detailedChanges: string[] = Array.isArray(log.changes) ? log.changes : [];
                                                                            const revNum = hIdx + 1;
                                                                            return (
                                                                                <div key={hIdx} className="bg-amber-50/50 p-3 rounded-lg text-xs border border-amber-200/70 space-y-2">
                                                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="bg-amber-200/80 text-amber-900 text-[10px] font-black px-1.5 py-0.5 rounded">
                                                                                                Rev #{revNum}
                                                                                            </span>
                                                                                            <span className="font-bold text-slate-800">
                                                                                                ✏️ {summaryStr}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="text-right shrink-0">
                                                                                            <span className="text-[10px] font-bold text-slate-700 bg-amber-100 px-2 py-0.5 rounded inline-block">{userStr}</span>
                                                                                            <span className="text-[9px] text-slate-400 font-mono block mt-0.5">{formattedDate}</span>
                                                                                        </div>
                                                                                    </div>

                                                                                    {log.previous_grand_total !== undefined && detailedChanges.length === 0 && (
                                                                                        <div className="text-[11px] text-slate-600 font-mono bg-white/70 px-2 py-1 rounded border border-amber-100 flex items-center justify-between">
                                                                                            <span>Previous Grand Total:</span>
                                                                                            <span className="font-bold text-slate-800">₹{Number(log.previous_grand_total).toLocaleString('en-IN')}</span>
                                                                                        </div>
                                                                                    )}

                                                                                    {detailedChanges.length > 0 && (
                                                                                        <div className="pt-2 border-t border-amber-200/50 bg-white/80 p-2.5 rounded border border-amber-100/60">
                                                                                            <p className="text-[10px] font-black text-amber-900 uppercase tracking-wider mb-1.5">Changes Breakdown ({detailedChanges.length}):</p>
                                                                                            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-700">
                                                                                                {detailedChanges.map((changeText, cIdx) => (
                                                                                                    <li key={cIdx} className="leading-snug font-medium">{changeText}</li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {filteredInvoices.length > 0 && (
                    <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-xs text-slate-500 font-medium">
                            Showing <span className="font-bold text-slate-700">{((currentPage - 1) * PAGE_SIZE) + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * PAGE_SIZE, filteredInvoices.length)}</span> of <span className="font-bold text-slate-700">{filteredInvoices.length}</span> {documentCategory === 'quotation' ? 'quotations' : documentCategory === 'po' ? 'purchase orders' : 'invoices'}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs"
                            >
                                « Previous
                            </button>

                            <div className="flex items-center gap-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                    .map((pageNum, idx, arr) => {
                                        const prevPage = arr[idx - 1];
                                        const showEllipsis = prevPage && pageNum - prevPage > 1;
                                        return (
                                            <React.Fragment key={pageNum}>
                                                {showEllipsis && <span className="px-1 text-slate-400 text-xs">...</span>}
                                                <button
                                                    onClick={() => setCurrentPage(pageNum)}
                                                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                                                        currentPage === pageNum
                                                            ? 'bg-[#8EBF45] text-[#0D0D0D] shadow-xs'
                                                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            </React.Fragment>
                                        );
                                    })
                                }
                            </div>

                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs"
                            >
                                Next »
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0D0D0D] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-fade-in">
                    <span className="text-sm font-bold">{selectedIds.size} invoice{selectedIds.size > 1 ? 's' : ''} selected</span>
                    <div className="w-px h-6 bg-white/20"></div>
                    <button
                        onClick={handleBulkDownload}
                        disabled={bulkDownloading}
                        className="bg-[#8EBF45] text-[#0D0D0D] px-4 py-1.5 rounded-lg text-sm font-black uppercase tracking-wider flex items-center gap-2 hover:bg-[#A8BF75] transition-colors disabled:opacity-50"
                    >
                        {bulkDownloading ? (
                            <><Loader2 size={14} className="animate-spin" /> Downloading {bulkProgress.current}/{bulkProgress.total}...</>
                        ) : (
                            <><Download size={14} /> Download All PDFs</>
                        )}
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-white p-1 rounded transition-colors" title="Clear Selection">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Invoice Print Preview Overlay */}
            {printInvoice && !bulkDownloading && (
                <InvoicePrintView invoice={printInvoice} onClose={() => setPrintInvoice(null)} />
            )}

            {/* Hidden render for bulk download - single copy, no labels */}
            {bulkInvoices && bulkDownloading && (
                <InvoicePrintView invoice={bulkInvoices[0]} invoices={bulkInvoices} onClose={() => {}} singleCopy={true} hiddenRender={true} />
            )}
            
            {autoMailInvoice && (
                <InvoicePrintView 
                    invoice={autoMailInvoice.inv} 
                    onClose={() => {}} 
                    autoMailTarget={autoMailInvoice.targetEmail}
                    onMailSent={() => handleMailSentSuccess(autoMailInvoice.inv)}
                    onError={handleMailError}
                />
            )}
        </div>
    );
};

export default Dashboard;
