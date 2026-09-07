
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabaseClient';
import { ExtractedInvoice, InvoiceItem, InvoiceTemplate } from '../../types';
import { getTaxMode, safeRender, amountToWords, getCurrencySymbol } from '../../utils/invoiceUtils';
import { Printer, Download, X } from './Icons';
import { QRCodeSVG } from 'qrcode.react';
import { BatteryComparisonTable } from './BatteryComparisonTable';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface InvoicePrintViewProps {
    invoice: ExtractedInvoice;
    invoices?: ExtractedInvoice[];
    onClose: () => void;
    autoMailTarget?: string | null;
    onMailSent?: () => void;
    onError?: (err: Error) => void;
    singleCopy?: boolean;
    hiddenRender?: boolean;
}

const ITEMS_PER_PAGE = 10;

const InvoicePrintView: React.FC<InvoicePrintViewProps> = ({ invoice, invoices, onClose, autoMailTarget, onMailSent, onError, singleCopy = false, hiddenRender = false }) => {
    const [logo, setLogo] = useState<string | null>(null);
    const [stamp, setStamp] = useState<string | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [config, setConfig] = useState({
        font: 'font-sans',
        color: '#000000',
        footerText: 'This is a system generated invoice.',
        terms: '1. Payment due within 30 days.',
        logoSize: 64,
        showReceiverSign: true,
        showQRCode: true,
        showTotalsTable: true,
        showTaxTable: true,
        billedToLabel: 'Billed To',
        shippedToLabel: 'Shipped To',
        visibleColumns: {
            index: true,
            description: true,
            image: false,
            hsn: true,
            quantity: true,
            rate: true,
            discount: false,
            taxableValue: true,
            total: true
        }
    });
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const hasTaxes = (invoice.items || []).some(
            it => Number(it.cgst_amount || 0) > 0 || Number(it.sgst_amount || 0) > 0 || Number(it.igst_amount || 0) > 0 || Number(it.igst_rate || 0) > 0
        );
        const isQuotation = invoice.document_type === 'generated_quotation' || invoice.document_type === 'quotation';
        const isProforma = invoice.document_type === 'generated_proforma_invoice' || invoice.document_type === 'proforma' || (invoice.invoice_metadata as any)?.ui_config?.customTitle?.toLowerCase().includes('proforma');
        const isQuoteOrProforma = isQuotation || isProforma;

        // First try to load from invoice metadata ui_config
        if (invoice.invoice_metadata?.ui_config) {
            const ui = invoice.invoice_metadata.ui_config as any;
            const metaTerms = ui.terms !== undefined ? ui.terms : (invoice.invoice_metadata?.terms_conditions || invoice.invoice_metadata?.terms || invoice.invoice_metadata?.notes || '');
            setLogo(ui.logoUrl || null);
            setStamp(ui.stampUrl || null);
            setSignature(ui.signatureUrl || null);
            setConfig(prev => ({
                ...prev,
                ...ui,
                terms: metaTerms,
                logoSize: ui.logoSize || 64,
                showReceiverSign: ui.showReceiverSign ?? true,
                showQRCode: ui.showQRCode ?? true,
                showTotalsTable: ui.showTotalsTable ?? true,
                showTaxTable: ui.showTaxTable !== undefined ? ui.showTaxTable : (isQuoteOrProforma ? false : hasTaxes),
                showBatteryComparisonTable: ui.showBatteryComparisonTable !== undefined ? ui.showBatteryComparisonTable : isQuoteOrProforma,
                billedToLabel: ui.billedToLabel || prev.billedToLabel,
                shippedToLabel: ui.shippedToLabel || prev.shippedToLabel,
                visibleColumns: ui.visibleColumns || {
                    ...prev.visibleColumns,
                    taxableValue: hasTaxes
                }
            }));
        } else {
            const metaTerms = invoice.invoice_metadata?.terms_conditions || invoice.invoice_metadata?.terms || invoice.invoice_metadata?.notes || '';
            // Load template for branding fallback
            const loadTemplate = async () => {
                const { data } = await supabase.from('invoice_templates').select('*').limit(1);
                if (data && data.length > 0) {
                    const tmpl = data[0] as InvoiceTemplate;
                    const c = tmpl.config as any;
                    setLogo(c.logoUrl || null);
                    setStamp(c.stampUrl || null);
                    setSignature(c.signatureUrl || null);
                    setConfig(prev => ({
                        ...prev,
                        font: c.font || prev.font,
                        color: c.color || prev.color,
                        footerText: c.footerText || prev.footerText,
                        terms: metaTerms || c.terms || prev.terms,
                        logoSize: c.logoSize || prev.logoSize,
                        showReceiverSign: c.showReceiverSign ?? true,
                        showQRCode: c.showQRCode ?? true,
                        showTotalsTable: c.showTotalsTable ?? true,
                        showTaxTable: isQuoteOrProforma ? false : (c.showTaxTable !== undefined ? c.showTaxTable : hasTaxes),
                        showBatteryComparisonTable: isQuoteOrProforma,
                        visibleColumns: {
                            ...prev.visibleColumns,
                            taxableValue: hasTaxes
                        }
                    }));
                } else if (metaTerms) {
                    setConfig(prev => ({
                        ...prev,
                        terms: metaTerms,
                        showTaxTable: hasTaxes,
                        visibleColumns: { ...prev.visibleColumns, taxableValue: hasTaxes }
                    }));
                }
            };
            loadTemplate();
        }
    }, [invoice]);

    useEffect(() => {
        if (autoMailTarget && printRef.current) {
            // Slight delay to ensure images/fonts are loaded
            setTimeout(() => {
                handleAutoMail();
            }, 1000);
        }
    }, [autoMailTarget]);

    const handleAutoMail = async () => {
        try {
            const element = printRef.current?.querySelector('.invoice-print-container');
            if (!element) throw new Error("Could not find print container");

            const opt = {
                margin: 0,
                filename: 'invoice.pdf',
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
                pagebreak: { mode: 'css', elements: '.invoice-print-page' }
            };

            const pdfBase64DataUri = await html2pdf().set(opt).from(element).outputPdf('datauristring');
            
            const htmlContent = `
                <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; padding: 20px;">
                    <h2 style="color: #658C3E;">Datlion Cnergy</h2>
                    <p>Hello,</p>
                    <p>Please find the details and attached PDF for your recent document below:</p>
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Document Type:</strong> ${(invoice.document_type || '').replace(/_/g, ' ').toUpperCase()}</p>
                        <p style="margin: 5px 0;"><strong>Document Number:</strong> ${invoice.invoice_metadata?.invoice_number || 'N/A'}</p>
                        <p style="margin: 5px 0;"><strong>Date:</strong> ${invoice.invoice_metadata?.invoice_date || 'N/A'}</p>
                        <p style="margin: 5px 0; font-size: 1.1em;"><strong>Total Amount:</strong> ₹${(invoice.totals?.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <p>If you have any questions, please reply to this email.</p>
                    <p style="color: #666; font-size: 0.9em;">Best regards,<br/>Datlion Cnergy Team</p>
                </div>
            `;

            const response = await fetch('/api/send-mail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: autoMailTarget,
                    subject: `Document ${invoice.invoice_metadata?.invoice_number || ''} from Datlion Cnergy`,
                    html: htmlContent,
                    attachmentBase64: pdfBase64DataUri,
                    attachmentName: `${invoice.invoice_metadata?.invoice_number || 'document'}.pdf`
                })
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || data.message || "Failed to send email");
            }

            if (onMailSent) onMailSent();
            onClose();
        } catch (err: any) {
            console.error("Auto mail error:", err);
            if (onError) onError(err);
            onClose();
        }
    };

    const docsToRender = invoices || [invoice];
    const docsWithPages = docsToRender.map(d => {
        const pages: InvoiceItem[][] = [];
        const it = d.items || [];
        for (let i = 0; i < it.length; i += ITEMS_PER_PAGE) {
            pages.push(it.slice(i, i + ITEMS_PER_PAGE));
        }
        if (pages.length === 0) pages.push([]);
        return { doc: d, paginatedPages: pages };
    });

    const doc = docsToRender[0];

    const formatPrintDate = (dateStr: string) => {
        if (!dateStr) return '';
        try { return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
        catch { return dateStr; }
    };

    const handlePrint = () => {
        window.print();
    };

    const overlayContent = (
        <div id="invoice-print-overlay" className={`fixed z-[200] bg-black/60 backdrop-blur-sm flex flex-col h-full ${(autoMailTarget || hiddenRender) ? 'left-[200vw] top-0 w-[100vw] pointer-events-none' : 'inset-0 animate-fade-in'}`}>
            <style>{`
                @media print {
                    body > *:not(#invoice-print-overlay) { display: none !important; }
                    #invoice-print-overlay { position: static !important; height: auto !important; width: 100% !important; display: block !important; background: transparent !important; }
                    #invoice-print-overlay > .print-toolbar { display: none !important; }
                    #invoice-print-overlay > .print-scroll-area { overflow: visible !important; background: white !important; padding: 0 !important; }
                    @page { size: A4; margin: 0; }
                    html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
                    .invoice-print-page {
                        page-break-after: always;
                        page-break-inside: avoid;
                        width: 210mm !important;
                        height: 297mm !important;
                        min-height: 297mm !important;
                        max-height: 297mm !important;
                        margin: 0 !important;
                        padding: 8mm;
                        box-sizing: border-box;
                        position: relative;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        border: none !important;
                        box-shadow: none !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .invoice-print-page:last-child { page-break-after: auto; }
                }
            `}</style>
                {/* Toolbar */}
                {!hiddenRender && (
                <div className="print-toolbar bg-white border-b px-6 py-3 flex items-center justify-between flex-shrink-0">
                    <div>
                        <h3 className="font-bold text-lg text-slate-900">Invoice Preview</h3>
                        <p className="text-xs text-slate-500">{safeRender(doc.invoice_metadata?.invoice_number)} — {safeRender(doc.issuer_details?.name)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handlePrint} className="bg-[#0D0D0D] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#404040] transition-colors">
                            <Printer size={16} /> Print / Save PDF
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>
                )}

                {/* Scrollable preview */}
                <div className="print-scroll-area flex-1 overflow-y-auto bg-slate-200 p-8" ref={printRef}>
                    <div className={`mx-auto ${config.font} invoice-print-container`}>
                        {docsWithPages.map(({ doc, paginatedPages }, docIdx) => {
                            const docType = doc.document_type || 'invoice';
                            const customTitle = doc.invoice_metadata?.ui_config?.customTitle || (doc.invoice_metadata as any)?.custom_title || (doc.invoice_metadata as any)?.title || (docType === 'generated_delivery_challan' || docType === 'delivery_challan' ? 'DELIVERY CHALLAN' : docType === 'generated_po' || docType === 'po' ? 'PURCHASE ORDER' : docType === 'generated_quotation' || docType === 'quotation' ? 'QUOTATION' : docType === 'generated_proforma_invoice' || docType === 'proforma' ? 'PROFORMA INVOICE' : docType === 'generated_debit_note' || docType === 'debit_note' ? 'DEBIT NOTE' : docType === 'generated_credit_note' || docType === 'credit_note' ? 'CREDIT NOTE' : 'INVOICE');
                            const amountInWordsStr = amountToWords(doc.totals?.grand_total || 0, doc.totals?.currency);
                            const currencySymbol = getCurrencySymbol(doc.totals?.currency);
                            const items = doc.items || [];
                            const isDocQuoteOrProforma = docType === 'generated_quotation' || docType === 'quotation' || docType === 'generated_proforma_invoice' || docType === 'proforma' || customTitle?.toLowerCase().includes('quotation') || customTitle?.toLowerCase().includes('proforma') || customTitle?.toLowerCase().includes('quote');
                            const showComparison = (config as any).showBatteryComparisonTable !== undefined 
                                ? Boolean((config as any).showBatteryComparisonTable) 
                                : isDocQuoteOrProforma;

                            return (
                                <React.Fragment key={docIdx}>
                                    {(singleCopy ? [''] : ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER']).map((copyLabel, copyIdx) => (
                                    <React.Fragment key={copyIdx}>
                                        {paginatedPages.map((pageItems, pageIdx) => {
                                            const taxMode = getTaxMode(doc.issuer_details?.gstin, doc.receiver_details?.gstin, doc.invoice_metadata?.tax_mode);
                                            const actualShippedTo = doc.shipped_to_details || (doc.invoice_metadata as any)?.shipped_to_details;
                                            return (
                                                <div className="invoice-print-page bg-white shadow-xl mx-auto mb-8 w-[210mm] min-h-[296mm] p-8 flex flex-col relative" key={`${copyIdx}-${pageIdx}`}>
                                                    {copyLabel && <div className="absolute top-4 right-8 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{copyLabel}</div>}
                                                    {/* HEADER */}
                                                    <div className="flex justify-between items-start mt-4 mb-3 border-b pb-3">
                                            <div className="flex items-start gap-4 flex-1">
                                                {logo ? <img src={logo} alt="Logo" className="w-auto object-contain" style={{ height: config.logoSize || 64 }} /> : <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center text-slate-300 text-xs">Logo</div>}
                                                <div className="flex-1">
                                                    <h2 className="font-bold text-xl uppercase tracking-wide text-slate-900 leading-none mb-1">{safeRender(doc.issuer_details?.name)}</h2>
                                                    <p className="text-xs text-slate-500 whitespace-pre-line max-w-sm leading-tight mb-1">{safeRender(doc.issuer_details?.address)}</p>
                                            <div className="text-[10px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                                {doc.issuer_details?.gstin && <span><strong>GSTIN:</strong> {doc.issuer_details.gstin}</span>}
                                                {doc.issuer_details?.pan && <span><strong>PAN:</strong> {doc.issuer_details.pan}</span>}
                                                {doc.issuer_details?.email && <span>{doc.issuer_details.email}</span>}
                                                {doc.issuer_details?.phone && <span>Ph: {doc.issuer_details.phone}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <h1 className="text-3xl font-light tracking-tight mb-1 uppercase" style={{ color: config.color }}>{customTitle}</h1>
                                        <div className="text-sm text-slate-600 space-y-1">
                                            <div className="flex items-center justify-end gap-1"><span className="font-semibold">No:</span> <span className="font-mono">{doc.invoice_metadata?.invoice_number}</span></div>
                                            <div className="flex items-center justify-end gap-1"><span className="font-semibold">Date:</span> <span>{formatPrintDate(doc.invoice_metadata?.invoice_date || '')}</span></div>
                                            {paginatedPages.length > 1 && <div className="text-xs text-slate-400">Page {pageIdx + 1} of {paginatedPages.length}</div>}
                                        </div>
                                    </div>
                                </div>

                                {/* RECEIVER (Billed + Shipped) */}
                                <div className="mb-3 flex gap-6">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{config.billedToLabel || (docType === 'generated_quotation' ? 'Quotation For' : docType === 'generated_po' ? 'Vendor' : docType === 'generated_proforma_invoice' ? 'Proforma To' : 'Billed To')}</p>
                                        <h3 className="font-bold text-sm text-slate-900 leading-tight">{safeRender(doc.receiver_details?.name) || 'Client Name'}</h3>
                                        <p className="text-xs text-slate-600 whitespace-pre-line mb-1 leading-tight">{safeRender(doc.receiver_details?.address)}</p>
                                        <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                            {doc.receiver_details?.gstin && <span><strong>GSTIN:</strong> {doc.receiver_details.gstin}</span>}
                                            {doc.receiver_details?.pan && <span><strong>PAN:</strong> {doc.receiver_details.pan}</span>}
                                            {doc.receiver_details?.email && <span>{doc.receiver_details.email}</span>}
                                            {doc.receiver_details?.phone && <span>Ph: {doc.receiver_details.phone}</span>}
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{config.shippedToLabel || 'Shipped To'}</p>
                                        <h3 className="font-bold text-sm text-slate-900 leading-tight">{safeRender(actualShippedTo?.name) || safeRender(doc.receiver_details?.name) || 'Client Name'}</h3>
                                        <p className="text-xs text-slate-600 whitespace-pre-line mb-1 leading-tight">{safeRender(actualShippedTo?.address) || safeRender(doc.receiver_details?.address)}</p>
                                        <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                            {(actualShippedTo?.gstin || doc.receiver_details?.gstin) && <span><strong>GSTIN:</strong> {actualShippedTo?.gstin || doc.receiver_details?.gstin}</span>}
                                            {(actualShippedTo?.phone || doc.receiver_details?.phone) && <span>Ph: {actualShippedTo?.phone || doc.receiver_details?.phone}</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* ITEMS TABLE */}
                                <div className="mb-3">
                                    <table className="w-full text-left text-sm border-collapse">
                                        <thead>
                                            <tr className="border-b-2" style={{ borderColor: config.color }}>
                                                {config.visibleColumns.index && <th className="py-1.5 pl-2 w-8 text-slate-500 font-semibold">#</th>}
                                                {config.visibleColumns.description && <th className="py-1.5 text-slate-500 font-semibold uppercase tracking-wider">Description</th>}
                                                {(config.visibleColumns as any).image && <th className="py-1.5 text-center w-14 text-slate-500 font-semibold">Photo</th>}
                                                {config.visibleColumns.hsn && <th className="py-1.5 text-left w-20 text-slate-500 font-semibold">HSN/SAC</th>}
                                                {config.visibleColumns.quantity && <th className="py-1.5 text-right w-14 text-slate-500 font-semibold">Qty</th>}
                                                {config.visibleColumns.rate && <th className="py-1.5 text-right w-24 text-slate-500 font-semibold">Rate ({currencySymbol})</th>}
                                                {config.visibleColumns.discount && <th className="py-1.5 text-right w-24 text-slate-500 font-semibold">Discount ({currencySymbol})</th>}
                                                {config.visibleColumns.taxableValue && <th className="py-1.5 text-right w-24 text-slate-500 font-semibold">Taxable</th>}
                                                {config.visibleColumns.total && <th className="py-1.5 text-right w-28 text-slate-900 font-bold pr-2">Total ({currencySymbol})</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {pageItems.map((item, idx) => {
                                                const globalIdx = pageIdx * ITEMS_PER_PAGE + idx;
                                                return (
                                                    <tr key={globalIdx}>
                                                        {config.visibleColumns.index && <td className="py-1.5 pl-2 text-slate-400">{globalIdx + 1}</td>}
                                                        {config.visibleColumns.description && <td className="py-1.5 font-medium text-slate-800">{safeRender(item.description)}</td>}
                                                        {(config.visibleColumns as any).image && <td className="py-1.5 text-center">{item.image_url && <img src={item.image_url} alt="" className="w-10 h-10 object-contain rounded inline-block" />}</td>}
                                                        {config.visibleColumns.hsn && <td className="py-1.5 text-slate-600 text-xs">{item.hsn_sac || '—'}</td>}
                                                        {config.visibleColumns.quantity && <td className="py-1.5 text-right">{item.quantity}</td>}
                                                        {config.visibleColumns.rate && <td className="py-1.5 text-right">{(Number(item.unit_price) || 0).toFixed(2)}</td>}
                                                        {config.visibleColumns.discount && <td className="py-1.5 text-right">{(Number(item.discount) || 0).toFixed(2)}</td>}
                                                        {config.visibleColumns.taxableValue && <td className="py-1.5 text-right text-slate-600">{(item.taxable_value || 0).toFixed(2)}</td>}
                                                        {config.visibleColumns.total && <td className="py-1.5 text-right font-semibold pr-2">{(item.total_value || 0).toFixed(2)}</td>}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* TAX BREAKDOWN (Grouped) */}
                                {(config.showTaxTable ?? true) && items.length > 0 && (() => {
                                    const taxGrps: { [k: string]: { hsn: string; taxableValue: number; rate: number; cgst: number; sgst: number; igst: number; totalTax: number } } = {};
                                    items.forEach(item => {
                                        const rate = Number(item.igst_rate || 0);
                                        const key = `${rate}-${item.hsn_sac || ''}`;
                                        if (!taxGrps[key]) taxGrps[key] = { hsn: item.hsn_sac || '-', taxableValue: 0, rate, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
                                        taxGrps[key].taxableValue += item.taxable_value || 0;
                                        taxGrps[key].cgst += item.cgst_amount || 0;
                                        taxGrps[key].sgst += item.sgst_amount || 0;
                                        taxGrps[key].igst += item.igst_amount || 0;
                                        taxGrps[key].totalTax += (item.cgst_amount || 0) + (item.sgst_amount || 0) + (item.igst_amount || 0);
                                    });
                                    const grps = Object.values(taxGrps);
                                    return (
                                        <div className="mb-3">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Tax Breakdown {taxMode === 'intra' ? '(CGST + SGST)' : '(IGST)'}</p>
                                            <table className="w-full text-xs border-collapse border border-slate-200">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        <th className="py-1 px-2 text-left text-slate-500 font-semibold">HSN/SAC</th>
                                                        <th className="py-1 px-2 text-right text-slate-500 font-semibold">Taxable</th>
                                                        <th className="py-1 px-2 text-center text-slate-500 font-semibold">Rate%</th>
                                                        {taxMode === 'intra' ? (<><th className="py-1 px-2 text-right text-slate-500 font-semibold">CGST</th><th className="py-1 px-2 text-right text-slate-500 font-semibold">SGST</th></>) : (<th className="py-1 px-2 text-right text-slate-500 font-semibold">IGST</th>)}
                                                        <th className="py-1 px-2 text-right text-slate-500 font-bold">Tax</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {grps.map((g, i) => (
                                                        <tr key={i}>
                                                            <td className="py-1 px-2 text-slate-600">{g.hsn}</td>
                                                            <td className="py-1 px-2 text-right">{g.taxableValue.toFixed(2)}</td>
                                                            <td className="py-1 px-2 text-center">{g.rate}%</td>
                                                            {taxMode === 'intra' ? (<><td className="py-1 px-2 text-right">{g.cgst.toFixed(2)}</td><td className="py-1 px-2 text-right">{g.sgst.toFixed(2)}</td></>) : (<td className="py-1 px-2 text-right">{g.igst.toFixed(2)}</td>)}
                                                            <td className="py-1 px-2 text-right font-semibold">{g.totalTax.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="border-t border-slate-300 font-bold text-xs">
                                                        <td className="py-1 px-2">Total</td>
                                                        <td className="py-1 px-2 text-right">{(doc.totals?.subtotal_taxable || 0).toFixed(2)}</td>
                                                        <td className="py-1 px-2"></td>
                                                        {taxMode === 'intra' ? (<><td className="py-1 px-2 text-right">{(doc.totals?.cgst_total || 0).toFixed(2)}</td><td className="py-1 px-2 text-right">{(doc.totals?.sgst_total || 0).toFixed(2)}</td></>) : (<td className="py-1 px-2 text-right">{(doc.totals?.igst_total || 0).toFixed(2)}</td>)}
                                                        <td className="py-1 px-2 text-right" style={{ color: config.color }}>{((doc.totals?.cgst_total || 0) + (doc.totals?.sgst_total || 0) + (doc.totals?.igst_total || 0)).toFixed(2)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    );
                                })()}

                                {showComparison && (pageIdx === paginatedPages.length - 1) && (
                                    <BatteryComparisonTable printMode={true} />
                                )}

                                {/* SUMMARY */}
                                <div className="flex flex-col border-t pt-1 mt-1">
                                    {(config.showTotalsTable ?? true) && (
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">Amount in Words</p>
                                                <p className="text-[10px] font-bold text-slate-700">{amountInWordsStr}</p>
                                            </div>
                                            <div className="w-44">
                                                <div className="flex justify-between text-[10px] font-bold text-slate-900 mb-0.5"><span>Subtotal</span><span>{(doc.totals?.subtotal_taxable || 0).toFixed(2)}</span></div>
                                                {(doc.totals?.subtotal_discount || 0) > 0 && (
                                                    <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                                                        <span>Discount {doc.totals?.subtotal_discount_type === 'percent' ? `(${doc.totals?.subtotal_discount_percent}%)` : ''}</span>
                                                        <span className="text-red-600 font-medium">-{(doc.totals?.subtotal_discount || 0).toFixed(2)}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between text-[10px] text-slate-600 mb-0.5"><span>Tax</span><span>{((doc.totals?.cgst_total || 0) + (doc.totals?.sgst_total || 0) + (doc.totals?.igst_total || 0)).toFixed(2)}</span></div>
                                                {(doc.totals?.rounding_adjustment || 0) !== 0 && (
                                                    <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                                                        <span>Rounding</span>
                                                        <span>{(doc.totals?.rounding_adjustment || 0) > 0 ? '+' : ''}{(doc.totals?.rounding_adjustment || 0).toFixed(2)}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between text-sm font-bold border-t border-slate-300 pt-1 mt-1" style={{ color: config.color }}><span>Total</span><span>{currencySymbol} {(doc.totals?.grand_total || 0).toFixed(2)}</span></div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex gap-6 mt-2 pt-1 border-t border-slate-100">
                                        {(doc.issuer_details?.bank_details?.account_number || doc.issuer_details?.bank_details?.upi_id) && (
                                            <div className="flex-[2] flex gap-3">
                                                {(config.showQRCode ?? true) && doc.issuer_details?.bank_details?.upi_id && (
                                                    <div className="flex-shrink-0 bg-white p-1 border rounded shadow-sm self-start">
                                                        <QRCodeSVG 
                                                            value={`upi://pay?pa=${doc.issuer_details.bank_details.upi_id}&pn=${encodeURIComponent(doc.issuer_details.name || '')}&am=${doc.totals?.grand_total || 0}&cu=${doc.totals?.currency || 'INR'}`}
                                                            size={55}
                                                            level="M"
                                                        />
                                                        <p className="text-[7px] text-center font-bold text-slate-400 mt-0.5 uppercase">Scan to Pay</p>
                                                    </div>
                                                )}
                                                {doc.issuer_details?.bank_details?.account_number && (
                                                    <div className="flex-1">
                                                        <h4 className="font-bold text-[9px] text-slate-500 uppercase mb-0.5">Bank Details</h4>
                                                        <div className="text-[9px] text-slate-600 grid grid-cols-[auto_1fr] gap-x-2">
                                                            <span>Bank:</span><span className="font-medium">{doc.issuer_details.bank_details.bank_name}</span>
                                                            {doc.issuer_details.bank_details.account_name && <><span>Name:</span><span className="font-medium">{doc.issuer_details.bank_details.account_name}</span></>}
                                                            <span>A/c:</span><span className="font-medium">{doc.issuer_details.bank_details.account_number}</span>
                                                            <span>IFSC:</span><span className="font-medium">{doc.issuer_details.bank_details.ifsc}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <h4 className="font-bold text-[9px] text-slate-500 uppercase mb-0.5">Terms</h4>
                                            <p className="text-[9px] text-slate-600 whitespace-pre-line">{config.terms}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* SIGNATURES */}
                                <div className="flex justify-between items-end mt-auto pt-3 break-inside-avoid relative">
                                    {config.showReceiverSign && (
                                        <div className="text-center">
                                            <p className="text-xs font-bold text-slate-600 mb-6">&nbsp;</p>
                                            <div className="h-px bg-slate-400 w-32 mb-1 mx-auto"></div>
                                            <p className="text-[9px] font-bold text-slate-600">Receiver's Signature</p>
                                        </div>
                                    )}
                                    {stamp && (
                                        <div className="absolute left-1/2 bottom-2 -translate-x-1/2 pointer-events-none">
                                            <img src={stamp} alt="Stamp" className="h-16 w-16 object-contain opacity-80" style={{ transform: 'rotate(-10deg)', mixBlendMode: 'multiply' as any }} />
                                        </div>
                                    )}
                                    <div className="text-center relative ml-auto">
                                        <p className="text-xs font-bold text-slate-800 mb-2">For {safeRender(doc.issuer_details?.name)}</p>
                                        {signature ? <img src={signature} alt="Signature" className="h-10 w-auto mx-auto mb-1 object-contain" /> : <div className="h-10"></div>}
                                        <div className="h-px bg-slate-400 w-32 mb-1 mx-auto"></div>
                                        <p className="text-[9px] font-bold text-slate-600">Issuer's Signature</p>
                                    </div>
                                </div>

                                {/* FOOTER */}
                                <div className="pt-1 text-center text-[9px] text-slate-400">{safeRender(config.footerText)}</div>
                            </div>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </React.Fragment>
                            );
                        })}
                    </div>
                </div>
        </div>
    );

    if (typeof window === 'undefined') return null;
    return createPortal(overlayContent, document.body);
};

export default InvoicePrintView;
