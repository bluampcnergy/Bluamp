
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { ExtractedInvoice, GST3BSummary } from '../../types';
import { FileText, Download, Calendar, FileJson, Trash2 } from './Icons';
import { downloadFile, safeRender } from '../../utils/invoiceUtils';

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const GSTReturnPanel: React.FC = () => {
    // Current date setup
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIdx = now.getMonth(); // 0-11

    // Multi-select state
    const [selectedYears, setSelectedYears] = useState<number[]>([currentYear]);
    const [selectedMonths, setSelectedMonths] = useState<number[]>([currentMonthIdx + 1]); // 1-12 based

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'gstr1' | 'gstr3b'>('gstr1');
    
    const [invoices, setInvoices] = useState<ExtractedInvoice[]>([]);
    
    const [summary3B, setSummary3B] = useState<GST3BSummary>({
        outward_taxable: 0, outward_igst: 0, outward_cgst: 0, outward_sgst: 0,
        itc_igst: 0, itc_cgst: 0, itc_sgst: 0, itc_ineligible: 0
    });

    // Available years range (e.g., current year - 2 to current year + 1)
    const availableYears = Array.from({length: 4}, (_, i) => currentYear - 2 + i);

    useEffect(() => {
        fetchData();
    }, [selectedYears, selectedMonths]);

    const toggleYear = (year: number) => {
        setSelectedYears(prev => {
            if (prev.includes(year)) {
                return prev.length > 1 ? prev.filter(y => y !== year) : prev; // Prevent deselecting last
            } else {
                return [...prev, year].sort();
            }
        });
    };

    const toggleMonth = (monthIdx: number) => {
        const monthNum = monthIdx + 1;
        setSelectedMonths(prev => {
            if (prev.includes(monthNum)) {
                return prev.length > 1 ? prev.filter(m => m !== monthNum) : prev;
            } else {
                return [...prev, monthNum].sort((a,b) => a-b);
            }
        });
    };

    const fetchData = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            // Determine date range for fetching (Min Start -> Max End)
            // Then filter in JS for precise month matching
            const minYear = Math.min(...selectedYears);
            const maxYear = Math.max(...selectedYears);
            
            const startDate = `${minYear}-01-01`;
            const endDate = `${maxYear}-12-31`;

            const { data, error } = await supabase
                .from('invoices')
                .select('id, source_type, invoice_metadata, totals, receiver_details, issuer_details, document_type, filename, created_at')
                .in('document_type', ['invoice', 'generated_invoice', 'receipt']) // Including receipts based on existing schema
                .gte('invoice_metadata->>invoice_date', startDate)
                .lte('invoice_metadata->>invoice_date', endDate)
                .limit(500);

            if (error) throw error;
            
            // Client-side filtering for specific month/year combinations
            const fetchedInvoices = (data as ExtractedInvoice[]).filter(inv => {
                const dateStr = inv.invoice_metadata?.invoice_date;
                if (!dateStr) return false;
                const d = new Date(dateStr);
                const invYear = d.getFullYear();
                const invMonth = d.getMonth() + 1;
                
                return selectedYears.includes(invYear) && selectedMonths.includes(invMonth);
            });

            setInvoices(fetchedInvoices);
            calculate3B(fetchedInvoices);

        } catch (err: any) {
            console.error("GST Fetch Error", err);
            setErrorMsg(err.message || "Failed to fetch GST data.");
        } finally {
            setLoading(false);
        }
    };

    const calculate3B = (data: ExtractedInvoice[]) => {
        const summary: GST3BSummary = {
            outward_taxable: 0, outward_igst: 0, outward_cgst: 0, outward_sgst: 0,
            itc_igst: 0, itc_cgst: 0, itc_sgst: 0, itc_ineligible: 0
        };

        data.forEach(inv => {
            const totals = inv.totals;
            
            if (inv.source_type === 'sales') {
                summary.outward_taxable += totals.subtotal_taxable || 0;
                summary.outward_igst += totals.igst_total || 0;
                summary.outward_cgst += totals.cgst_total || 0;
                summary.outward_sgst += totals.sgst_total || 0;
            } else if (inv.source_type === 'purchase') {
                const isEligible = inv.invoice_metadata?.input_tax_credit !== 'non_set_off';
                
                if (isEligible) {
                    summary.itc_igst += totals.igst_total || 0;
                    summary.itc_cgst += totals.cgst_total || 0;
                    summary.itc_sgst += totals.sgst_total || 0;
                } else {
                    summary.itc_ineligible += (totals.igst_total || 0) + (totals.cgst_total || 0) + (totals.sgst_total || 0);
                }
            }
        });
        setSummary3B(summary);
    };

    const handleDeleteInvoice = async (id: string) => {
        if (!confirm("Are you sure you want to delete this invoice? GST calculations (GSTR-3B) will be updated immediately.")) return;
        
        try {
            const { error } = await supabase.from('invoices').delete().match({ id });
            if (error) throw error;
            
            // Remove from local state and Recalculate GST
            const updatedInvoices = invoices.filter(inv => inv.id !== id);
            setInvoices(updatedInvoices);
            calculate3B(updatedInvoices);
            
        } catch (e: any) {
            alert("Error deleting invoice: " + e.message);
        }
    };

    const downloadGSTR1CSV = () => {
        const salesInvoices = invoices.filter(inv => inv.source_type === 'sales');
        const periodStr = `${selectedMonths.join('-')}_${selectedYears.join('-')}`;
        
        const header = "GSTIN/UIN of Recipient,Receiver Name,Invoice Number,Invoice Date,Invoice Value,Place Of Supply,Reverse Charge,Invoice Type,Rate,Taxable Value,Cess Amount";
        const rows = salesInvoices.map(inv => {
            const gstin = safeRender(inv.receiver_details?.gstin);
            const type = gstin ? 'Regular B2B' : 'B2C Large';
            const pos = safeRender(inv.receiver_details?.state_code || inv.receiver_details?.state);
            
            return `"${gstin}","${safeRender(inv.receiver_details?.name)}","${safeRender(inv.invoice_metadata?.invoice_number)}","${safeRender(inv.invoice_metadata?.invoice_date)}",${inv.totals?.grand_total || 0},"${pos}","N","${type}",0,${inv.totals?.subtotal_taxable || 0},0`;
        });

        const csv = [header, ...rows].join('\n');
        downloadFile(csv, `GSTR1_${periodStr}.csv`, 'csv');
    };

    const downloadGSTR1JSON = () => {
        const salesInvoices = invoices.filter(inv => inv.source_type === 'sales');
        const userGstin = salesInvoices[0]?.issuer_details?.gstin || "URP"; 
        const periodStr = `${String(selectedMonths[0]).padStart(2, '0')}${selectedYears[0]}`; // Uses first selected for period code if multi

        const b2b: any[] = [];
        // Group invoices by Receiver GSTIN for B2B
        const b2bMap = new Map<string, any[]>();

        salesInvoices.forEach(inv => {
            const receiverGstin = inv.receiver_details?.gstin;
            const invoiceData = {
                inum: inv.invoice_metadata?.invoice_number || "",
                idt: inv.invoice_metadata?.invoice_date?.split('-').reverse().join('-') || "", // Format DD-MM-YYYY
                val: inv.totals?.grand_total || 0,
                pos: (inv.receiver_details?.state_code || "00").substring(0,2),
                rchrg: "N",
                inv_typ: "R", // Regular
                itms: [{
                    num: 1,
                    itm_det: {
                        txval: inv.totals?.subtotal_taxable || 0,
                        rt: 18, // Simplified rate assumption
                        iamt: inv.totals?.igst_total || 0,
                        camt: inv.totals?.cgst_total || 0,
                        samt: inv.totals?.sgst_total || 0,
                        csamt: 0
                    }
                }]
            };

            if (receiverGstin && receiverGstin.length > 2) {
                if (!b2bMap.has(receiverGstin)) {
                    b2bMap.set(receiverGstin, []);
                }
                b2bMap.get(receiverGstin)?.push(invoiceData);
            }
        });

        b2bMap.forEach((invList, ctin) => {
            b2b.push({ ctin, inv: invList });
        });

        const payload = {
            gstin: userGstin,
            fp: periodStr,
            b2b: b2b,
        };

        downloadFile(JSON.stringify(payload, null, 2), `GSTR1_${periodStr}.json`, 'json');
    };

    const downloadGSTR3BCSV = () => {
        const periodStr = `${selectedMonths.join('-')}_${selectedYears.join('-')}`;
        const header = "Nature of Supplies,Total Taxable Value,Integrated Tax,Central Tax,State/UT Tax,Cess";
        const rows = [
            `"Outward Taxable Supplies",${summary3B.outward_taxable},${summary3B.outward_igst},${summary3B.outward_cgst},${summary3B.outward_sgst},0`,
            `"Eligible ITC (Available)",0,${summary3B.itc_igst},${summary3B.itc_cgst},${summary3B.itc_sgst},0`,
            `"Ineligible ITC",0,${summary3B.itc_ineligible},0,0,0`
        ];
        
        const csv = [header, ...rows].join('\n');
        downloadFile(csv, `GSTR3B_${periodStr}.csv`, 'csv');
    };

    const downloadGSTR3BJSON = () => {
         const periodStr = `${String(selectedMonths[0]).padStart(2, '0')}${selectedYears[0]}`;
         const payload = {
            gstin: "URP", // Ideally fetched from user settings
            ret_period: periodStr,
            sup_details: {
                osup_det: {
                    txval: summary3B.outward_taxable,
                    iamt: summary3B.outward_igst,
                    camt: summary3B.outward_cgst,
                    samt: summary3B.outward_sgst,
                    csamt: 0
                }
            },
            itc_elg: {
                itc_avl: [
                    {
                        ty: "ALL",
                        iamt: summary3B.itc_igst,
                        camt: summary3B.itc_cgst,
                        samt: summary3B.itc_sgst,
                        csamt: 0
                    }
                ],
                itc_inelg: [
                    {
                        ty: "RUL",
                        iamt: summary3B.itc_ineligible, 
                        camt: 0,
                        samt: 0,
                        csamt: 0
                    }
                ]
            }
         };
         downloadFile(JSON.stringify(payload, null, 2), `GSTR3B_${periodStr}.json`, 'json');
    };

    return (
        <div className="max-w-6xl mx-auto mt-8 animate-fade-in p-4">
            <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="text-indigo-600" /> GST Returns
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Select multiple months and years to aggregate return data.
                    </p>
                </div>

                <div className="flex flex-col gap-3 items-end">
                    {/* Year Selector Bar */}
                    <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        {availableYears.map(year => (
                            <button
                                key={year}
                                onClick={() => toggleYear(year)}
                                className={`px-4 py-2 text-sm font-medium transition-colors border-r last:border-r-0 ${
                                    selectedYears.includes(year) 
                                    ? 'bg-slate-800 text-white' 
                                    : 'bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {year}
                            </button>
                        ))}
                    </div>

                    {/* Month Selector Bar */}
                    <div className="flex flex-wrap justify-end bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden max-w-md">
                        {MONTH_NAMES.map((name, idx) => {
                            const isSelected = selectedMonths.includes(idx + 1);
                            return (
                                <button
                                    key={name}
                                    onClick={() => toggleMonth(idx)}
                                    className={`px-3 py-2 text-xs font-semibold transition-colors border-r border-b ${
                                        isSelected 
                                        ? 'bg-indigo-600 text-white' 
                                        : 'bg-white text-slate-500 hover:bg-indigo-50'
                                    }`}
                                >
                                    {name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex gap-4 border-b border-slate-200 mb-6">
                <button 
                    onClick={() => setActiveTab('gstr1')}
                    className={`pb-3 px-4 text-sm font-semibold transition-colors ${activeTab === 'gstr1' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    GSTR-1 (Outward Supplies)
                </button>
                <button 
                     onClick={() => setActiveTab('gstr3b')}
                     className={`pb-3 px-4 text-sm font-semibold transition-colors ${activeTab === 'gstr3b' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    GSTR-3B (Summary)
                </button>
            </div>

            {loading ? (
                 <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-slate-200">Loading data...</div>
            ) : errorMsg ? (
                 <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-red-200 text-red-500">
                    <p className="font-bold">Error Loading Data</p>
                    <p className="text-sm mt-1 text-slate-500">{errorMsg}</p>
                 </div>
            ) : (
                <>
                {activeTab === 'gstr1' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Details of Outward Supplies</h3>
                                <p className="text-xs text-slate-500">Sales invoices recorded for selected periods</p>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={downloadGSTR1CSV}
                                    className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium"
                                >
                                    <Download size={16}/> CSV
                                </button>
                                <button 
                                    onClick={downloadGSTR1JSON}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                                >
                                    <FileJson size={16}/> JSON (Portal)
                                </button>
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-700 font-semibold">
                                    <tr>
                                        <th className="p-3">GSTIN/UIN</th>
                                        <th className="p-3">Receiver Name</th>
                                        <th className="p-3">Inv No</th>
                                        <th className="p-3">Date</th>
                                        <th className="p-3 text-right">Value</th>
                                        <th className="p-3 text-center">Type</th>
                                        <th className="p-3 text-center">Place of Supply</th>
                                        <th className="p-3 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {invoices.filter(i => i.source_type === 'sales').length === 0 ? (
                                        <tr><td colSpan={8} className="p-8 text-center text-slate-400">No Sales invoices found for selection.</td></tr>
                                    ) : (
                                        invoices.filter(i => i.source_type === 'sales').map(inv => (
                                            <tr key={inv.id} className="hover:bg-slate-50">
                                                <td className="p-3 font-mono text-slate-600">{safeRender(inv.receiver_details?.gstin) || 'N/A'}</td>
                                                <td className="p-3">{safeRender(inv.receiver_details?.name)}</td>
                                                <td className="p-3">{safeRender(inv.invoice_metadata?.invoice_number)}</td>
                                                <td className="p-3">{safeRender(inv.invoice_metadata?.invoice_date)}</td>
                                                <td className="p-3 text-right">₹{(inv.totals?.grand_total || 0).toFixed(2)}</td>
                                                <td className="p-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${inv.receiver_details?.gstin ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                                                        {inv.receiver_details?.gstin ? 'B2B' : 'B2C'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">{safeRender(inv.receiver_details?.state_code)}</td>
                                                <td className="p-3 text-center">
                                                    <button 
                                                        onClick={() => handleDeleteInvoice(inv.id as string)}
                                                        className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                                                        title="Delete Invoice and Recalculate"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'gstr3b' && (
                    <div className="space-y-6">
                        {/* Header Actions for 3B */}
                        <div className="flex justify-end gap-2">
                             <button 
                                onClick={downloadGSTR3BCSV}
                                className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm"
                            >
                                <Download size={16}/> Download CSV
                            </button>
                             <button 
                                onClick={downloadGSTR3BJSON}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm"
                            >
                                <FileJson size={16}/> Download JSON (Portal)
                            </button>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 p-4 border-b border-slate-200">
                                <h3 className="font-bold text-slate-800">3.1 Details of Outward Supplies and inward supplies liable to reverse charge</h3>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-5 gap-4 text-sm font-semibold text-slate-500 border-b pb-2 mb-2">
                                    <div className="col-span-1">Nature of Supplies</div>
                                    <div className="text-right">Total Taxable Value</div>
                                    <div className="text-right">Integrated Tax</div>
                                    <div className="text-right">Central Tax</div>
                                    <div className="text-right">State/UT Tax</div>
                                </div>
                                <div className="grid grid-cols-5 gap-4 text-sm py-2">
                                    <div className="col-span-1 font-medium text-slate-800">(a) Outward taxable supplies (other than zero rated, nil rated and exempted)</div>
                                    <div className="text-right font-mono">₹{summary3B.outward_taxable.toFixed(2)}</div>
                                    <div className="text-right font-mono">₹{summary3B.outward_igst.toFixed(2)}</div>
                                    <div className="text-right font-mono">₹{summary3B.outward_cgst.toFixed(2)}</div>
                                    <div className="text-right font-mono">₹{summary3B.outward_sgst.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>

                         <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 p-4 border-b border-slate-200">
                                <h3 className="font-bold text-slate-800">4. Eligible ITC</h3>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-4 gap-4 text-sm font-semibold text-slate-500 border-b pb-2 mb-2">
                                    <div className="col-span-1">Details</div>
                                    <div className="text-right">Integrated Tax</div>
                                    <div className="text-right">Central Tax</div>
                                    <div className="text-right">State/UT Tax</div>
                                </div>
                                
                                <div className="grid grid-cols-4 gap-4 text-sm py-2 border-b border-slate-100">
                                    <div className="col-span-1 font-medium text-slate-800">(A) ITC Available (Import of goods + services + others)</div>
                                    <div className="text-right font-mono text-green-700">₹{summary3B.itc_igst.toFixed(2)}</div>
                                    <div className="text-right font-mono text-green-700">₹{summary3B.itc_cgst.toFixed(2)}</div>
                                    <div className="text-right font-mono text-green-700">₹{summary3B.itc_sgst.toFixed(2)}</div>
                                </div>

                                <div className="grid grid-cols-4 gap-4 text-sm py-2 bg-indigo-50 mt-2 rounded-lg px-2 font-bold">
                                    <div className="col-span-1 text-indigo-900">(C) Net ITC Available (A) - (B)</div>
                                    <div className="text-right font-mono text-indigo-700">₹{summary3B.itc_igst.toFixed(2)}</div>
                                    <div className="text-right font-mono text-indigo-700">₹{summary3B.itc_cgst.toFixed(2)}</div>
                                    <div className="text-right font-mono text-indigo-700">₹{summary3B.itc_sgst.toFixed(2)}</div>
                                </div>
                                
                                <div className="grid grid-cols-4 gap-4 text-sm py-2 mt-2">
                                    <div className="col-span-1 font-medium text-red-600">(D) Ineligible ITC</div>
                                    <div className="col-span-3 text-right font-mono text-red-600">
                                        Total: ₹{summary3B.itc_ineligible.toFixed(2)}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}
                </>
            )}
        </div>
    );
};

export default GSTReturnPanel;
