
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { ExtractedInvoice } from '../../types';
import { Loader2, Download, Search, Building, RefreshCw, FileText } from './Icons';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface LedgerEntry {
    date: string;
    particulars: string;
    voucherType: string;
    voucherNumber: string;
    debit: number;
    credit: number;
    balance: number;
    sourceId?: string;
}

interface LedgerPanelProps {
    currentUser: { username: string; role?: string } | null;
}

const VOUCHER_TYPE_COLORS: Record<string, string> = {
    'Sales': 'bg-blue-50 text-blue-700',
    'Purchase': 'bg-orange-50 text-orange-700',
    'Credit Note': 'bg-emerald-50 text-emerald-700',
    'Debit Note': 'bg-red-50 text-red-700',
    'Quotation': 'bg-purple-50 text-purple-700',
    'PO': 'bg-amber-50 text-amber-700',
    'Proforma': 'bg-indigo-50 text-indigo-700',
};

const LedgerPanel: React.FC<LedgerPanelProps> = ({ currentUser }) => {
    const [invoices, setInvoices] = useState<ExtractedInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStart, setFilterStart] = useState('');
    const [filterEnd, setFilterEnd] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedParty, setSelectedParty] = useState<string>('__ALL__');
    const [ledgerPerspective, setLedgerPerspective] = useState<'receivable' | 'payable'>('receivable');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const ledgerRef = useRef<HTMLDivElement>(null);

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('invoices')
                .select('id, source_type, document_type, invoice_metadata, receiver_details, issuer_details, supplier_details, totals, filename, created_at')
                .eq('requires_review', false)
                .order('created_at', { ascending: true })
                .limit(500);

            if (filterStart) {
                query = query.gte('invoice_metadata->>invoice_date', filterStart);
            }
            if (filterEnd) {
                query = query.lte('invoice_metadata->>invoice_date', filterEnd);
            }

            const { data, error } = await query;
            if (error) throw error;
            setInvoices((data || []) as ExtractedInvoice[]);
        } catch (err: any) {
            console.error('Ledger fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => fetchInvoices(), 300);
        return () => clearTimeout(timer);
    }, [filterStart, filterEnd]);

    // Extract unique party names from all invoices
    const allParties = useMemo(() => {
        const partySet = new Set<string>();
        invoices.forEach(inv => {
            const issuer = inv.issuer_details?.name?.trim();
            const receiver = inv.receiver_details?.name?.trim();
            const supplier = inv.supplier_details?.name?.trim();
            if (issuer) partySet.add(issuer);
            if (receiver) partySet.add(receiver);
            if (supplier) partySet.add(supplier);
        });
        return Array.from(partySet).sort();
    }, [invoices]);

    // Determine voucher type from document_type
    const getVoucherType = (inv: ExtractedInvoice): string => {
        const dt = inv.document_type || '';
        if (dt.includes('credit_note')) return 'Credit Note';
        if (dt.includes('debit_note')) return 'Debit Note';
        if (dt.includes('po') || dt.includes('purchase_order')) return 'PO';
        if (dt.includes('quotation')) return 'Quotation';
        if (dt.includes('proforma')) return 'Proforma';
        return inv.source_type === 'purchase' ? 'Purchase' : 'Sales';
    };

    // Build ledger entries
    const ledgerEntries = useMemo(() => {
        const entries: LedgerEntry[] = [];

        const relevantInvoices = invoices.filter(inv => {
            if (selectedParty === '__ALL__') return true;
            const issuer = inv.issuer_details?.name?.trim() || '';
            const receiver = inv.receiver_details?.name?.trim() || '';
            const supplier = inv.supplier_details?.name?.trim() || '';
            return issuer === selectedParty || receiver === selectedParty || supplier === selectedParty;
        });

        // Sort by invoice_date, then created_at
        const sorted = [...relevantInvoices].sort((a, b) => {
            const dateA = a.invoice_metadata?.invoice_date || a.created_at || '';
            const dateB = b.invoice_metadata?.invoice_date || b.created_at || '';
            return dateA.localeCompare(dateB);
        });

        let runningBalance = 0;

        sorted.forEach(inv => {
            const voucherType = getVoucherType(inv);
            const amount = inv.totals?.grand_total || 0;
            const date = inv.invoice_metadata?.invoice_date || (inv.created_at ? new Date(inv.created_at).toISOString().split('T')[0] : '');
            const invNum = inv.invoice_metadata?.invoice_number || '-';
            const isSales = inv.source_type === 'sales';
            const isPurchase = inv.source_type === 'purchase';

            // Determine counterparty name for particulars
            let particulars = '';
            if (isSales) {
                particulars = inv.receiver_details?.name || 'Unknown Customer';
            } else {
                particulars = inv.issuer_details?.name || inv.supplier_details?.name || 'Unknown Supplier';
            }

            let debit = 0;
            let credit = 0;

            if (ledgerPerspective === 'receivable') {
                // Company perspective: Sales = Debit (customer owes us), Purchase = Credit (we owe supplier)
                // Credit Note (Sales) = Credit (reducing receivable), Debit Note (Sales) = Debit
                // Credit Note (Purchase) = Debit (supplier reducing payable), Debit Note (Purchase) = Credit
                if (voucherType === 'Sales' || voucherType === 'Proforma') {
                    debit = amount;
                } else if (voucherType === 'Purchase' || voucherType === 'PO') {
                    credit = amount;
                } else if (voucherType === 'Credit Note') {
                    if (isSales) credit = amount;
                    else debit = amount;
                } else if (voucherType === 'Debit Note') {
                    if (isSales) debit = amount;
                    else credit = amount;
                } else if (voucherType === 'Quotation') {
                    // Quotations don't affect ledger balance, skip
                    return;
                }
            } else {
                // Payable perspective: reverse
                if (voucherType === 'Purchase' || voucherType === 'PO') {
                    debit = amount;
                } else if (voucherType === 'Sales' || voucherType === 'Proforma') {
                    credit = amount;
                } else if (voucherType === 'Credit Note') {
                    if (isPurchase) credit = amount;
                    else debit = amount;
                } else if (voucherType === 'Debit Note') {
                    if (isPurchase) debit = amount;
                    else credit = amount;
                } else if (voucherType === 'Quotation') {
                    return;
                }
            }

            runningBalance += debit - credit;

            entries.push({
                date,
                particulars,
                voucherType,
                voucherNumber: invNum,
                debit,
                credit,
                balance: runningBalance,
                sourceId: inv.id as string,
            });
        });

        return entries;
    }, [invoices, selectedParty, ledgerPerspective]);

    // Filter by search term
    const filteredEntries = useMemo(() => {
        if (!searchTerm.trim()) return ledgerEntries;
        const term = searchTerm.toLowerCase();
        return ledgerEntries.filter(e =>
            e.particulars.toLowerCase().includes(term) ||
            e.voucherNumber.toLowerCase().includes(term) ||
            e.voucherType.toLowerCase().includes(term)
        );
    }, [ledgerEntries, searchTerm]);

    const totals = useMemo(() => {
        let totalDebit = 0;
        let totalCredit = 0;
        filteredEntries.forEach(e => {
            totalDebit += e.debit;
            totalCredit += e.credit;
        });
        return { totalDebit, totalCredit, closing: totalDebit - totalCredit };
    }, [filteredEntries]);

    const handleDownloadPdf = async () => {
        if (!ledgerRef.current) return;
        setIsGeneratingPdf(true);

        try {
            const element = ledgerRef.current;
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `Ledger_${selectedParty === '__ALL__' ? 'All_Parties' : selectedParty.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
            };
            await html2pdf().set(opt).from(element).save();
        } catch (err: any) {
            console.error('PDF generation error:', err);
            alert('Error generating PDF: ' + err.message);
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const formatINR = (val: number) => val ? val.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—';

    return (
        <div className="max-w-7xl mx-auto animate-fade-in space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-[#0D0D0D] font-brand tracking-tight flex items-center gap-2">
                        <FileText size={24} className="text-[#8EBF45]" />
                        Party Ledger
                    </h2>
                    <p className="text-slate-500 text-sm">Transaction-by-transaction record of all financial dealings with a party.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => fetchInvoices()}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button
                        onClick={handleDownloadPdf}
                        disabled={isGeneratingPdf || filteredEntries.length === 0}
                        className="bg-[#8EBF45] text-[#0D0D0D] hover:bg-[#658C3E] hover:text-white px-5 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        Download PDF
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-4">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Party / Company</label>
                    <div className="relative">
                        <Building className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                        <select
                            className="w-full pl-10 p-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8EBF45]/20 focus:border-[#8EBF45] appearance-none bg-white"
                            value={selectedParty}
                            onChange={(e) => setSelectedParty(e.target.value)}
                        >
                            <option value="__ALL__">All Parties</option>
                            {allParties.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                </div>
                <div className="md:col-span-3">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Search</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            className="w-full pl-10 p-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8EBF45]/20 focus:border-[#8EBF45]"
                            placeholder="Search voucher #, party..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">From Date</label>
                    <input type="date" className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#8EBF45] outline-none" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">To Date</label>
                    <input type="date" className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#8EBF45] outline-none" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
                </div>
                <div className="md:col-span-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">View</label>
                    <div className="bg-slate-100 p-0.5 rounded-lg flex">
                        <button
                            onClick={() => setLedgerPerspective('receivable')}
                            className={`flex-1 py-2 text-[10px] font-bold rounded-md transition-all ${ledgerPerspective === 'receivable' ? 'bg-white text-[#0D0D0D] shadow-sm' : 'text-slate-500'}`}
                            title="Receivable: Sales = Debit, Purchase = Credit"
                        >
                            Recv
                        </button>
                        <button
                            onClick={() => setLedgerPerspective('payable')}
                            className={`flex-1 py-2 text-[10px] font-bold rounded-md transition-all ${ledgerPerspective === 'payable' ? 'bg-white text-[#0D0D0D] shadow-sm' : 'text-slate-500'}`}
                            title="Payable: Purchase = Debit, Sales = Credit"
                        >
                            Pay
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Debit</p>
                    <p className="text-2xl font-black text-red-600 font-mono">₹{formatINR(totals.totalDebit)}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Credit</p>
                    <p className="text-2xl font-black text-green-600 font-mono">₹{formatINR(totals.totalCredit)}</p>
                </div>
                <div className={`rounded-xl border p-5 shadow-sm ${totals.closing >= 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Closing Balance</p>
                    <p className={`text-2xl font-black font-mono ${totals.closing >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{formatINR(Math.abs(totals.closing))} {totals.closing >= 0 ? 'Dr' : 'Cr'}
                    </p>
                </div>
            </div>

            {/* Ledger Table */}
            <div ref={ledgerRef} className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                {/* PDF Header (visible in PDF) */}
                <div className="p-4 border-b border-slate-100 bg-slate-50 print-only" style={{ display: 'none' }}>
                    <h3 className="text-lg font-bold text-[#0D0D0D]">
                        Party Ledger — {selectedParty === '__ALL__' ? 'All Parties' : selectedParty}
                    </h3>
                    <p className="text-xs text-slate-500">
                        {filterStart && `From: ${filterStart}`} {filterEnd && `To: ${filterEnd}`}
                        {!filterStart && !filterEnd && 'All Dates'}
                        {' | '} Generated: {new Date().toLocaleDateString('en-IN')}
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-[#0D0D0D] font-bold border-b border-slate-200">
                            <tr>
                                <th className="p-4 w-28">Date</th>
                                <th className="p-4">Particulars</th>
                                <th className="p-4 w-32">Voucher Type</th>
                                <th className="p-4 w-40">Voucher No.</th>
                                <th className="p-4 text-right w-36">Debit (₹)</th>
                                <th className="p-4 text-right w-36">Credit (₹)</th>
                                <th className="p-4 text-right w-40">Balance (₹)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2 text-[#8EBF45]" /> Loading ledger...</td></tr>
                            ) : filteredEntries.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400">No ledger entries found for the selected filters.</td></tr>
                            ) : (
                                filteredEntries.map((entry, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 text-slate-500 whitespace-nowrap font-mono text-xs">{entry.date || '—'}</td>
                                        <td className="p-4 font-medium text-[#0D0D0D]">{entry.particulars}</td>
                                        <td className="p-4">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${VOUCHER_TYPE_COLORS[entry.voucherType] || 'bg-slate-100 text-slate-600'}`}>
                                                {entry.voucherType}
                                            </span>
                                        </td>
                                        <td className="p-4 font-mono text-xs text-slate-600">{entry.voucherNumber}</td>
                                        <td className="p-4 text-right font-mono font-bold text-red-600">{entry.debit > 0 ? formatINR(entry.debit) : ''}</td>
                                        <td className="p-4 text-right font-mono font-bold text-green-600">{entry.credit > 0 ? formatINR(entry.credit) : ''}</td>
                                        <td className={`p-4 text-right font-mono font-black ${entry.balance >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                                            {formatINR(Math.abs(entry.balance))} {entry.balance >= 0 ? 'Dr' : 'Cr'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {filteredEntries.length > 0 && (
                            <tfoot className="bg-[#0D0D0D] text-white font-black">
                                <tr>
                                    <td className="p-4" colSpan={4}>TOTALS</td>
                                    <td className="p-4 text-right font-mono">₹{formatINR(totals.totalDebit)}</td>
                                    <td className="p-4 text-right font-mono">₹{formatINR(totals.totalCredit)}</td>
                                    <td className={`p-4 text-right font-mono ${totals.closing >= 0 ? 'text-red-300' : 'text-green-300'}`}>
                                        ₹{formatINR(Math.abs(totals.closing))} {totals.closing >= 0 ? 'Dr' : 'Cr'}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
};

export default LedgerPanel;
