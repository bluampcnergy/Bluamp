
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { ExtractedInvoice, InvoiceTemplate, EMPTY_INVOICE, InvoiceItem, CompanyProfile, BankDetails, PriceListItem, FinishedGood, Recipe, InvoiceEditHistoryEntry } from '../../types';
import { recalculateInvoiceTotals, safeRender, amountToWords, getTaxMode, getCurrencySymbol, computeInvoiceChanges } from '../../utils/invoiceUtils';
import { generateUnitIds } from '../../utils';
import { Save, Printer, Plus, Trash2, SettingsIcon, Columns, Wallet, Download, RefreshCw, ChevronUp, ChevronDown, Loader2, LayoutDashboard, FileText, History } from './Icons';
import { QRCodeSVG } from 'qrcode.react';
import { ImportIcon } from '../icons/ImportIcon';
import AiChatPanel from './AiChatPanel';
import { BatteryComparisonTable } from './BatteryComparisonTable';
import { SearchableSupplierDropdown } from '../SearchableSupplierDropdown';

interface InvoiceMakerProps {
    currentUser: { username: string; role?: 'admin' | 'user' | 'billing' | 'dashboard_user' } | null;
    username?: string;
    companyProfiles?: CompanyProfile[];
    initialData?: ExtractedInvoice | null;
    priceList?: PriceListItem[];
    finishedGoods?: FinishedGood[];
    recipes?: Recipe[];
    addLogEntry?: (action: string, details: string) => void;
    setInvoiceDraft?: (draft: ExtractedInvoice | null) => void;
}

// Extend config locally to support new UI flags without breaking shared types immediately
type ExtendedConfig = InvoiceTemplate['config'] & {
    showReceiverSign?: boolean;
    showQRCode?: boolean;
    showTotalsTable?: boolean;
    showTaxTable?: boolean;
    showSubtotalDiscount?: boolean;
    showBatteryComparisonTable?: boolean;
    visibleColumns?: {
        index: boolean;
        description: boolean;
        image?: boolean;
        hsn: boolean;
        quantity: boolean;
        rate: boolean;
        discount: boolean;
        taxableValue: boolean;
        total: boolean;
    };
    billedToLabel?: string;
    shippedToLabel?: string;
    customTitle?: string;
    selectedTemplateId?: string;
    printMode?: 'single' | 'dual';
};

export const getDocPrefix = (
    currentDocType: string,
    date: Date = new Date(),
    overrideOtherParty?: string,
    receiverName?: string,
    issuerName?: string
) => {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    // Indian FY Logic: April to March
    let fyStart, fyEnd;
    if (month >= 4) {
        fyStart = year;
        fyEnd = year + 1;
    } else {
        fyStart = year - 1;
        fyEnd = year;
    }

    const fyStr = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;

    // --- NEW LOGIC (From April 2026 onwards) ---
    const NEW_SYSTEM_START = new Date(2026, 3, 1); // April 1, 2026
    if (date >= NEW_SYSTEM_START) {
        let typeTag = 'INV';
        if (currentDocType === 'po') typeTag = 'PO';
        else if (currentDocType === 'quotation') typeTag = 'QUO';
        else if (currentDocType === 'proforma') typeTag = 'PRO';
        else if (currentDocType === 'debit_note') typeTag = 'DN';
        else if (currentDocType === 'credit_note') typeTag = 'CN';
        else if (currentDocType === 'delivery_challan') typeTag = 'DCh';

        return { prefix: `${typeTag}/DC/${fyStr}/`, isNewSystem: true, fyStr, mm: '' };
    }

    // --- OLD LOGIC (Pre-April 2026) ---
    const mm = String(month).padStart(2, '0');
    const otherPartyName = overrideOtherParty || (currentDocType === 'invoice' || currentDocType === 'proforma' ? receiverName : issuerName);
    let code = 'XX';
    if (otherPartyName) {
        code = otherPartyName.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase();
    }

    const prefixBase = currentDocType === 'quotation' ? 'Q' : currentDocType === 'proforma' ? 'P' : currentDocType === 'delivery_challan' ? 'DCh' : currentDocType === 'debit_note' ? 'DN' : currentDocType === 'credit_note' ? 'CN' : 'DC';
    return { prefix: `${prefixBase}.${code}.${fyStr}.${mm}.`, isNewSystem: false, fyStr, mm };
};

const SEQUENCE_CACHE_KEY = 'dc_invoice_sequence_cache';

interface SequenceCacheStorage {
    fy: string;
    counts: Record<string, number>;
    timestamp: number;
}

const getCurrentFyStr = (date: Date = new Date()): string => {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const fyStart = month >= 4 ? year : year - 1;
    const fyEnd = fyStart + 1;
    return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
};

const BASELINE_SEQUENCES: Record<string, number> = {
    'INV/DC/26-27/': 28,
    'QUO/DC/26-27/': 56,
    'PO/DC/26-27/': 21,
    'DCh/DC/26-27/': 16,
    'PRO/DC/26-27/': 6,
    'DN/DC/26-27/': 2,
    'CN/DC/26-27/': 0,
};

const getStoredSequenceCache = (currentFy: string): Record<string, number> => {
    let result: Record<string, number> = {};
    if (currentFy === '26-27') {
        result = { ...BASELINE_SEQUENCES };
    }
    try {
        const raw = localStorage.getItem(SEQUENCE_CACHE_KEY);
        if (raw) {
            const data: SequenceCacheStorage = JSON.parse(raw);
            if (data.fy === currentFy && data.counts && typeof data.counts === 'object') {
                result = { ...result, ...data.counts };
            }
        }
    } catch (e) {
        console.warn('Failed to parse sequence cache from localStorage:', e);
    }
    return result;
};

const saveSequenceCacheToStorage = (currentFy: string, counts: Record<string, number>) => {
    try {
        const data: SequenceCacheStorage = {
            fy: currentFy,
            counts,
            timestamp: Date.now()
        };
        localStorage.setItem(SEQUENCE_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save sequence cache to localStorage:', e);
    }
};

const InvoiceMaker: React.FC<InvoiceMakerProps> = ({ currentUser, username, companyProfiles = [], initialData, priceList = [], finishedGoods = [], recipes = [], addLogEntry, setInvoiceDraft }) => {
    const currentFyStr = useMemo(() => getCurrentFyStr(new Date()), []);

    // Refs for instant, race-condition-free document number generation
    const currentDocTypeRef = useRef<'invoice' | 'delivery_challan' | 'po' | 'quotation' | 'proforma' | 'debit_note' | 'credit_note'>('invoice');
    const latestGenRequestId = useRef(0);
    const sequenceCache = useRef<Record<string, number>>(getStoredSequenceCache(currentFyStr));

    // Load draft from local storage if not editing an existing record
    const draft = useMemo(() => {
        if (initialData?.id) return null;
        try {
            const stored = localStorage.getItem('invoice_maker_draft');
            if (stored) return JSON.parse(stored);
        } catch(e) {}
        return null;
    }, [initialData]);

    const [docType, setDocType] = useState<'invoice' | 'delivery_challan' | 'po' | 'quotation' | 'proforma' | 'debit_note' | 'credit_note'>(() => {
        if (initialData?.document_type) {
            const dt = initialData.document_type;
            const invNum = initialData.invoice_metadata?.invoice_number || '';
            const title = (initialData.invoice_metadata?.ui_config?.customTitle || (initialData.invoice_metadata as any)?.custom_title || (initialData.invoice_metadata as any)?.title || '').toLowerCase();
            if (dt === 'generated_delivery_challan' || dt === 'delivery_challan' || /^dch/i.test(invNum) || title.includes('challan')) return 'delivery_challan';
            if (dt === 'generated_po' || dt === 'po' || dt === 'purchase_order') return 'po';
            if (dt === 'generated_quotation' || dt === 'quotation') return 'quotation';
            if (dt === 'generated_proforma_invoice' || dt === 'proforma_invoice' || dt === 'proforma') return 'proforma';
            if (dt === 'generated_debit_note' || dt === 'debit_note') return 'debit_note';
            if (dt === 'generated_credit_note' || dt === 'credit_note') return 'credit_note';
            return 'invoice';
        }
        if (draft?.docType) return draft.docType;
        return 'invoice';
    });

    useEffect(() => {
        currentDocTypeRef.current = docType;
    }, [docType]);

    const [customTitle, setCustomTitle] = useState(() => {
        if (initialData?.invoice_metadata?.ui_config?.customTitle) return initialData.invoice_metadata.ui_config.customTitle;
        if ((initialData?.invoice_metadata as any)?.custom_title) return (initialData?.invoice_metadata as any).custom_title;
        if ((initialData?.invoice_metadata as any)?.title) return (initialData?.invoice_metadata as any).title;
        if (draft?.customTitle) return draft.customTitle;
        return (docType === 'delivery_challan' ? 'DELIVERY CHALLAN' : docType === 'po' ? 'PURCHASE ORDER' : docType === 'quotation' ? 'QUOTATION' : docType === 'proforma' ? 'PROFORMA INVOICE' : docType === 'debit_note' ? 'DEBIT NOTE' : docType === 'credit_note' ? 'CREDIT NOTE' : 'INVOICE');
    });

    const [doc, setDoc] = useState<ExtractedInvoice>(() => {
        const base = initialData || draft?.doc || EMPTY_INVOICE;
        const computedSourceType = initialData?.source_type ? initialData.source_type : (draft?.docType || initialData?.document_type) === 'generated_po' || (draft?.docType as string) === 'po' || docType === 'po' ? 'purchase' : 'sales';

        // Calculate initial document number immediately from persistent cache if creating a new document
        let initialInvNum = base.invoice_metadata?.invoice_number || '';
        if (!initialInvNum && !initialData?.id) {
            const { prefix } = getDocPrefix(docType, new Date(), undefined, base.receiver_details?.name, base.issuer_details?.name);
            const cachedSeq = sequenceCache.current[prefix];
            if (cachedSeq !== undefined && cachedSeq >= 0) {
                initialInvNum = `${prefix}${String(cachedSeq + 1).padStart(3, '0')}`;
            }
        }

        return { 
            ...EMPTY_INVOICE,
            ...base, 
            source_type: computedSourceType, 
            document_type: docType === 'delivery_challan' ? 'generated_delivery_challan' : docType === 'invoice' ? (initialData?.document_type === 'invoice' ? 'invoice' : 'generated_invoice') : docType === 'po' ? 'generated_po' : docType === 'quotation' ? 'generated_quotation' : docType === 'debit_note' ? 'generated_debit_note' : docType === 'credit_note' ? 'generated_credit_note' : 'generated_proforma_invoice',
            receiver_details: base.receiver_details || EMPTY_INVOICE.receiver_details,
            issuer_details: { 
                ...EMPTY_INVOICE.issuer_details,
                ...(base.issuer_details || {}),
                bank_details: { upi_id: '8956340980@ibl', ...(base.issuer_details?.bank_details || {}) } 
            },
            shipped_to_details: base.shipped_to_details || (base.invoice_metadata as any)?.shipped_to_details || EMPTY_INVOICE.shipped_to_details,
            supplier_details: base.supplier_details || (base.invoice_metadata as any)?.supplier_details || EMPTY_INVOICE.supplier_details,
            invoice_metadata: {
                ...EMPTY_INVOICE.invoice_metadata,
                ...(base.invoice_metadata || {}),
                invoice_number: initialInvNum
            }
        };
    });

    // Fast pre-fetch of all sequence numbers for the current financial year to enable instant docType switching
    useEffect(() => {
        const prefetchSequences = async () => {
            const fyStr = currentFyStr;

            try {
                const { data } = await supabase
                    .from('invoices')
                    .select('filename, invoice_metadata->>invoice_number')
                    .or(`filename.ilike.%/DC/${fyStr}/%,invoice_metadata->>invoice_number.ilike.%/DC/${fyStr}/%`);

                if (data && data.length > 0) {
                    const tags = ['INV', 'PO', 'QUO', 'PRO', 'DN', 'CN', 'DCh'];
                    const counts: Record<string, number> = { ...sequenceCache.current };
                    tags.forEach(t => { 
                        const prefix = `${t}/DC/${fyStr}/`;
                        if (counts[prefix] === undefined) counts[prefix] = 0;
                    });

                    data.forEach((row: any) => {
                        const invNum = row.invoice_number || row.filename;
                        if (invNum) {
                            for (const tag of tags) {
                                const prefix = `${tag}/DC/${fyStr}/`;
                                if (invNum.startsWith(prefix)) {
                                    const seq = parseInt(invNum.substring(prefix.length), 10);
                                    if (!isNaN(seq) && seq > (counts[prefix] || 0)) {
                                        counts[prefix] = seq;
                                    }
                                }
                            }
                        }
                    });

                    Object.assign(sequenceCache.current, counts);
                    saveSequenceCacheToStorage(fyStr, sequenceCache.current);

                    // If creating a new document, ensure the active doc has the true next sequence number
                    if (!initialData?.id) {
                        const { prefix } = getDocPrefix(currentDocTypeRef.current, new Date(), undefined, doc?.receiver_details?.name, doc?.issuer_details?.name);
                        const verifiedMax = sequenceCache.current[prefix] || 0;
                        const verifiedNext = `${prefix}${String(verifiedMax + 1).padStart(3, '0')}`;
                        setDoc(prev => {
                            const cur = prev.invoice_metadata?.invoice_number;
                            if (!cur || cur.startsWith(prefix)) {
                                const curSeq = cur ? parseInt(cur.substring(prefix.length), 10) : 0;
                                if (!curSeq || curSeq <= verifiedMax) {
                                    return {
                                        ...prev,
                                        invoice_metadata: {
                                            ...prev.invoice_metadata,
                                            invoice_number: verifiedNext
                                        }
                                    };
                                }
                            }
                            return prev;
                        });
                    }
                }
            } catch (err) {
                console.warn('Pre-fetch sequences error:', err);
            }
        };

        prefetchSequences();
    }, [currentFyStr, initialData?.id]);

    // Default config with accurate state restoration
    const [config, setConfig] = useState<ExtendedConfig>(() => {
        const savedUi = initialData?.invoice_metadata?.ui_config;
        if (savedUi) {
            return {
                font: savedUi.font || 'font-sans',
                color: savedUi.color || '#000000',
                headerText: savedUi.headerText ?? '',
                footerText: savedUi.footerText ?? '',
                terms: savedUi.terms !== undefined ? savedUi.terms : (initialData?.invoice_metadata?.terms_conditions || initialData?.invoice_metadata?.terms || initialData?.invoice_metadata?.notes || ''),
                logoSize: savedUi.logoSize || 64,
                showReceiverSign: savedUi.showReceiverSign ?? true,
                showQRCode: savedUi.showQRCode ?? true,
                showTotalsTable: savedUi.showTotalsTable ?? true,
                showTaxTable: savedUi.showTaxTable ?? false,
                showBatteryComparisonTable: savedUi.showBatteryComparisonTable !== undefined ? Boolean(savedUi.showBatteryComparisonTable) : (docType === 'quotation' || docType === 'proforma'),
                showSubtotalDiscount: savedUi.showSubtotalDiscount !== undefined ? Boolean(savedUi.showSubtotalDiscount) : false
            };
        }
        if (draft?.config) return draft.config;

        const hasTaxes = (initialData?.items || []).some(
            it => Number(it.cgst_amount || 0) > 0 || Number(it.sgst_amount || 0) > 0 || Number(it.igst_amount || 0) > 0
        );

        return {
            font: 'font-sans',
            color: '#000000',
            headerText: '',
            footerText: initialData ? '' : 'This is a system generated invoice.',
            terms: initialData?.invoice_metadata?.terms_conditions || initialData?.invoice_metadata?.terms || initialData?.invoice_metadata?.notes || (initialData ? '' : '1. Payment due within 30 days.'),
            logoSize: 64,
            showReceiverSign: docType === 'po' ? false : true,
            showQRCode: true,
            showTotalsTable: true,
            showTaxTable: (docType === 'quotation' || docType === 'proforma') ? false : hasTaxes,
            showBatteryComparisonTable: (docType === 'quotation' || docType === 'proforma'),
            showSubtotalDiscount: false
        };
    });

    const [logo, setLogo] = useState<string | null>(initialData?.invoice_metadata?.ui_config?.logoUrl || draft?.logo || null);
    const [stamp, setStamp] = useState<string | null>(initialData?.invoice_metadata?.ui_config?.stampUrl || draft?.stamp || null);
    const [signature, setSignature] = useState<string | null>(initialData?.invoice_metadata?.ui_config?.signatureUrl || draft?.signature || null);
    const [isSaving, setIsSaving] = useState(false);

    // Subtotal Discount State
    const [subtotalDiscountValue, setSubtotalDiscountValue] = useState<number>(() => {
        const t = (initialData?.totals as any) || draft?.doc?.totals;
        return Number(t?.subtotal_discount_value ?? t?.subtotal_discount ?? 0);
    });
    const [subtotalDiscountType, setSubtotalDiscountType] = useState<'amount' | 'percent'>(() => {
        const t = (initialData?.totals as any) || draft?.doc?.totals;
        return (t?.subtotal_discount_type as 'amount' | 'percent') || 'amount';
    });
    const [showSubtotalDiscount, setShowSubtotalDiscount] = useState<boolean>(() => {
        const t = (initialData?.totals as any) || draft?.doc?.totals;
        const disc = Number(t?.subtotal_discount_value ?? t?.subtotal_discount ?? 0);
        return disc > 0 || Boolean(initialData?.invoice_metadata?.ui_config?.showSubtotalDiscount || draft?.config?.showSubtotalDiscount);
    });
    const [showBatteryComparisonTable, setShowBatteryComparisonTable] = useState<boolean>(() => {
        if (initialData?.invoice_metadata?.ui_config?.showBatteryComparisonTable !== undefined) {
            return Boolean(initialData.invoice_metadata.ui_config.showBatteryComparisonTable);
        }
        if (draft?.config?.showBatteryComparisonTable !== undefined) {
            return Boolean(draft.config.showBatteryComparisonTable);
        }
        const title = (initialData?.invoice_metadata?.ui_config?.customTitle || (initialData?.invoice_metadata as any)?.custom_title || (initialData?.invoice_metadata as any)?.title || draft?.customTitle || '').toLowerCase();
        return docType === 'quotation' || docType === 'proforma' || title.includes('quotation') || title.includes('proforma') || title.includes('quote');
    });

    const recalcDocTotals = (items: InvoiceItem[], discVal = subtotalDiscountValue, discType = subtotalDiscountType) => {
        return recalculateInvoiceTotals(items, discVal, discType);
    };

    const handleSubtotalDiscountChange = (val: number, type: 'amount' | 'percent' = subtotalDiscountType) => {
        const safeVal = isNaN(val) ? 0 : Math.max(0, val);
        setSubtotalDiscountValue(safeVal);
        setSubtotalDiscountType(type);
        const newTotals = recalculateInvoiceTotals(doc.items, safeVal, type);
        setDoc(prev => ({
            ...prev,
            totals: {
                ...prev.totals,
                ...newTotals
            }
        }));
    };

    // Baseline reference of document before edits to compute exact diffs
    const baselineDocRef = useRef<ExtractedInvoice | null>(null);
    const baselineConfigRef = useRef<ExtendedConfig | null>(null);

    // Document Search State
    const [searchDocTerm, setSearchDocTerm] = useState('');
    const [docSearchResults, setDocSearchResults] = useState<ExtractedInvoice[]>([]);
    const [isSearchingDoc, setIsSearchingDoc] = useState(false);

    // Visibility States
    const currencySymbol = getCurrencySymbol(doc.totals?.currency);
    const [showNoteSection, setShowNoteSection] = useState(false);

    // Editable labels for Billed To / Shipped To
    const [billedToLabel, setBilledToLabel] = useState(initialData?.invoice_metadata?.ui_config?.billedToLabel || draft?.billedToLabel || 'Billed To');
    const [shippedToLabel, setShippedToLabel] = useState(initialData?.invoice_metadata?.ui_config?.shippedToLabel || draft?.shippedToLabel || 'Shipped To');

    // Total visibility control for all columns
    const [visibleColumns, setVisibleColumns] = useState(() => {
        if (initialData?.invoice_metadata?.ui_config?.visibleColumns) {
            return initialData.invoice_metadata.ui_config.visibleColumns;
        }
        if (draft?.visibleColumns) return draft.visibleColumns;

        const hasTaxes = (initialData?.items || []).some(
            it => Number(it.cgst_amount || 0) > 0 || Number(it.sgst_amount || 0) > 0 || Number(it.igst_amount || 0) > 0
        );

        return {
            index: true,
            description: true,
            image: false,
            hsn: true,
            quantity: true,
            rate: true,
            discount: false,
            taxableValue: hasTaxes,
            total: true
        };
    });

    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
    const [templateName, setTemplateName] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState(initialData?.invoice_metadata?.ui_config?.selectedTemplateId || draft?.selectedTemplateId || '');
    const [amountInWordsStr, setAmountInWordsStr] = useState('');
    const [printMode, setPrintMode] = useState<'single' | 'dual'>(initialData?.invoice_metadata?.ui_config?.printMode || draft?.printMode || 'dual');

    // Smart Pricing autocomplete state
    const [priceDropdownIdx, setPriceDropdownIdx] = useState<number | null>(null);
    const [priceSuggestions, setPriceSuggestions] = useState<PriceListItem[]>([]);
    
    // Serial Number Search State
    const [serialSearchIdx, setSerialSearchIdx] = useState<number | null>(null);
    const [serialSearchTerm, setSerialSearchTerm] = useState<string>('');

    const allAvailableSerials = useMemo(() => {
        const serials: { id: string, name: string, details: string }[] = [];
        finishedGoods.forEach(fg => {
            const unitIds = generateUnitIds(fg, finishedGoods, recipes);
            unitIds.forEach(uid => {
                if (!fg.dismantledUnitIds?.includes(uid) && !fg.unitDeliveries?.[uid]) {
                    const recipeName = recipes.find(r => r.id === fg.recipeId)?.name || 'Unknown';
                    const meta = fg.unitMetadata?.[uid];
                    const details = meta?.voltage && meta?.capacity ? `${meta.voltage}V ${meta.capacity}Ah` : '';
                    serials.push({ id: uid, name: recipeName, details });
                }
            });
        });
        return serials;
    }, [finishedGoods, recipes]);

    // Iframe modal for adding company
    const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);
    const [lastSelectedType, setLastSelectedType] = useState<'issuer' | 'receiver' | 'supplier' | null>(null);

    const [pendingAiData, setPendingAiData] = useState<any>(null);
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    const [isReadyToApply, setIsReadyToApply] = useState(false);

    // Persist draft to localStorage automatically
    useEffect(() => {
        if (initialData?.id || doc.id) return; // Don't persist if editing a saved record
        const timer = setTimeout(() => {
            const dataToSave = {
                docType, customTitle, doc, config, billedToLabel, shippedToLabel, visibleColumns, selectedTemplateId, printMode, logo, stamp, signature
            };
            try {
                localStorage.setItem('invoice_maker_draft', JSON.stringify(dataToSave));
            } catch(e) {}
        }, 1000);
        return () => clearTimeout(timer);
    }, [docType, customTitle, doc, config, billedToLabel, shippedToLabel, visibleColumns, selectedTemplateId, printMode, logo, stamp, signature, initialData?.id, doc.id]);

    useEffect(() => {
        let timer: any;
        if (templatesLoaded && companyProfiles.length > 0 && priceList.length > 0) {
            setIsReadyToApply(true);
        } else if (templatesLoaded) {
            // Ensure templates are loaded before falling back to timer for empty company/price lists
            timer = setTimeout(() => setIsReadyToApply(true), 1500);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [templatesLoaded, companyProfiles, priceList]);

    useEffect(() => {
        if (pendingAiData && isReadyToApply) {
            handleApplyAiData(pendingAiData);
            setPendingAiData(null);
        }
    }, [pendingAiData, isReadyToApply]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'COMPANY_ADDED') {
                const newCompany = event.data.company;
                // The state 'companyProfiles' comes from props, so we rely on the parent (App.tsx) 
                // to handle the global state update if it also listens, or we assume Supabase 
                // handles the sync. But for immediate selection:
                if (lastSelectedType) {
                    loadCompanyProfile(lastSelectedType, newCompany.name);
                }
                setIsAddCompanyModalOpen(false);
                setLastSelectedType(null);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [lastSelectedType]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isAddCompanyModalOpen) {
                setIsAddCompanyModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAddCompanyModalOpen]);

    const handleDropdownChange = (type: 'issuer' | 'receiver' | 'supplier', value: string) => {
        if (value === 'ADD_NEW') {
            setLastSelectedType(type);
            setIsAddCompanyModalOpen(true);
        } else {
            loadCompanyProfile(type, value);
        }
    };

    const handleDescriptionChange = (idx: number, val: string) => {
        updateItem(idx, 'description', val);

        if (val.length < 2) {
            setPriceDropdownIdx(null);
            setPriceSuggestions([]);
            return;
        }

        const matches = priceList.filter(p => p.model_name.toLowerCase().includes(val.toLowerCase()));
        if (matches.length > 0) {
            setPriceSuggestions(matches);
            setPriceDropdownIdx(idx);
        } else {
            setPriceDropdownIdx(null);
            setPriceSuggestions([]);
        }
    };

    const handleAddSerial = (idx: number, serialId: string) => {
        setDoc(prev => {
            const newItems = [...prev.items];
            const currentDesc = safeRender(newItems[idx].description);
            if (currentDesc.includes(`S/N:`)) {
                newItems[idx].description = currentDesc + `, ${serialId}`;
            } else {
                newItems[idx].description = currentDesc + (currentDesc ? ` - ` : '') + `S/N: ${serialId}`;
            }
            return { ...prev, items: newItems };
        });
        setSerialSearchIdx(null);
        setSerialSearchTerm('');
    };

    const handlePriceSelect = (idx: number, item: PriceListItem) => {
        const newItems = [...doc.items];
        const unit_price = Math.round(Number(item.price_without_gst || 0) * 100) / 100;
        newItems[idx] = { ...newItems[idx], description: item.model_name, hsn_sac: item.hsn_code || '', unit_price };
        // Recalculate taxable_value
        newItems[idx].taxable_value = Math.round(Math.max(0, (Number(newItems[idx].quantity) * unit_price) - Number(newItems[idx].discount || 0)) * 100) / 100;
        // Recalculate taxes
        const taxRate = Number(newItems[idx].igst_rate || 0);
        const taxMode = getTaxMode(doc.issuer_details.gstin, doc.receiver_details.gstin, doc.invoice_metadata.tax_mode);
        if (taxMode === 'intra') {
            const halfRate = taxRate / 2;
            newItems[idx].cgst_rate = halfRate;
            newItems[idx].cgst_amount = Math.round((newItems[idx].taxable_value * (halfRate / 100)) * 100) / 100;
            newItems[idx].sgst_rate = halfRate;
            newItems[idx].sgst_amount = Math.round((newItems[idx].taxable_value * (halfRate / 100)) * 100) / 100;
            newItems[idx].igst_amount = 0;
        } else {
            newItems[idx].igst_amount = Math.round((newItems[idx].taxable_value * (taxRate / 100)) * 100) / 100;
            newItems[idx].cgst_rate = 0; newItems[idx].cgst_amount = 0;
            newItems[idx].sgst_rate = 0; newItems[idx].sgst_amount = 0;
        }
        newItems[idx].total_value = Math.round((newItems[idx].taxable_value + (newItems[idx].cgst_amount || 0) + (newItems[idx].sgst_amount || 0) + (newItems[idx].igst_amount || 0)) * 100) / 100;
        const newTotals = recalcDocTotals(newItems);
        setDoc(prev => ({ ...prev, items: newItems, totals: { ...prev.totals, ...newTotals } }));
        setPriceDropdownIdx(null);
        setPriceSuggestions([]);
    };

    const itemFileInputRef = useRef<HTMLInputElement>(null);
    // Refs to clear file inputs
    const logoInputRef = useRef<HTMLInputElement>(null);
    const stampInputRef = useRef<HTMLInputElement>(null);
    const signatureInputRef = useRef<HTMLInputElement>(null);

    const updateShippedTo = (field: string, val: string) => {
        setDoc(prev => ({
            ...prev,
            shipped_to_details: { ...(prev.shipped_to_details || {}), [field]: val }
        }));
    };

    const copyReceiverToShipped = () => {
        setDoc(prev => ({ ...prev, shipped_to_details: { ...prev.receiver_details } }));
    };

    const loadDocumentIntoEditor = (loadedData: ExtractedInvoice) => {
        if (!loadedData) return;

        const dataToLoad: ExtractedInvoice = {
            ...EMPTY_INVOICE,
            ...loadedData,
            receiver_details: loadedData.receiver_details || EMPTY_INVOICE.receiver_details,
            issuer_details: {
                ...EMPTY_INVOICE.issuer_details,
                ...(loadedData.issuer_details || {}),
                bank_details: { ...EMPTY_INVOICE.issuer_details.bank_details, ...(loadedData.issuer_details?.bank_details || {}) }
            },
            shipped_to_details: loadedData.shipped_to_details || (loadedData.invoice_metadata as any)?.shipped_to_details || EMPTY_INVOICE.shipped_to_details,
            supplier_details: loadedData.supplier_details || (loadedData.invoice_metadata as any)?.supplier_details || EMPTY_INVOICE.supplier_details,
            invoice_metadata: loadedData.invoice_metadata || EMPTY_INVOICE.invoice_metadata
        };
        setDoc(dataToLoad);

        // Determine Document Type
        const dt = String(loadedData.document_type || 'invoice');
        let targetType: 'invoice' | 'po' | 'quotation' | 'proforma' | 'debit_note' | 'credit_note' = 'invoice';
        if (dt === 'generated_po' || dt === 'po' || dt === 'purchase_order') targetType = 'po';
        else if (dt === 'generated_quotation' || dt === 'quotation') targetType = 'quotation';
        else if (dt === 'generated_proforma_invoice' || dt === 'proforma_invoice' || dt === 'proforma') targetType = 'proforma';
        else if (dt === 'generated_debit_note' || dt === 'debit_note') targetType = 'debit_note';
        else if (dt === 'generated_credit_note' || dt === 'credit_note') targetType = 'credit_note';
        setDocType(targetType);

        const defaultTitleMap: Record<string, string> = {
            invoice: 'INVOICE',
            po: 'PURCHASE ORDER',
            quotation: 'QUOTATION',
            proforma: 'PROFORMA INVOICE',
            debit_note: 'DEBIT NOTE',
            credit_note: 'CREDIT NOTE'
        };

        const savedUi = loadedData.invoice_metadata?.ui_config as ExtendedConfig | undefined;

        // Restore Custom Title
        const savedTitle = savedUi?.customTitle || (loadedData.invoice_metadata as any)?.custom_title || (loadedData.invoice_metadata as any)?.title || defaultTitleMap[targetType] || 'INVOICE';
        setCustomTitle(savedTitle);

        // Restore Template selection if any
        if (savedUi?.selectedTemplateId) {
            setSelectedTemplateId(savedUi.selectedTemplateId);
        }

        // Restore Print Mode if any
        if (savedUi?.printMode) {
            setPrintMode(savedUi.printMode as any);
        }

        // Check if document line items actually contain tax amounts
        const hasTaxes = (loadedData.items || []).some(
            it => Number(it.cgst_amount || 0) > 0 || Number(it.sgst_amount || 0) > 0 || Number(it.igst_amount || 0) > 0 || Number(it.igst_rate || 0) > 0
        );

        // Restore Config
        const restoredTerms = savedUi?.terms !== undefined 
            ? savedUi.terms 
            : (loadedData.invoice_metadata?.terms_conditions || loadedData.invoice_metadata?.terms || loadedData.invoice_metadata?.notes || '');

        const isTargetQuoteOrProforma = targetType === 'quotation' || targetType === 'proforma' || (savedTitle || '').toLowerCase().includes('quote') || (savedTitle || '').toLowerCase().includes('proforma');
        const restoredComparisonTable = savedUi?.showBatteryComparisonTable !== undefined 
            ? Boolean(savedUi.showBatteryComparisonTable) 
            : isTargetQuoteOrProforma;
        setShowBatteryComparisonTable(restoredComparisonTable);

        const restoredSubtotalDiscount = savedUi?.showSubtotalDiscount !== undefined 
            ? Boolean(savedUi.showSubtotalDiscount) 
            : Boolean(loadedData.totals?.subtotal_discount && loadedData.totals.subtotal_discount > 0);
        setShowSubtotalDiscount(restoredSubtotalDiscount);

        const restoredConfig: ExtendedConfig = {
            font: savedUi?.font || 'font-sans',
            color: savedUi?.color || '#000000',
            headerText: savedUi?.headerText ?? '',
            footerText: savedUi?.footerText !== undefined ? savedUi.footerText : 'This is a system generated invoice.',
            terms: restoredTerms,
            logoSize: savedUi?.logoSize || 64,
            showReceiverSign: savedUi?.showReceiverSign ?? (targetType === 'po' ? false : true),
            showQRCode: savedUi?.showQRCode ?? true,
            showTotalsTable: savedUi?.showTotalsTable ?? true,
            showTaxTable: savedUi?.showTaxTable !== undefined ? savedUi.showTaxTable : hasTaxes, // Only default true if taxes actually exist!
            showBatteryComparisonTable: restoredComparisonTable,
            showSubtotalDiscount: restoredSubtotalDiscount,
            billedToLabel: savedUi?.billedToLabel || 'Billed To',
            shippedToLabel: savedUi?.shippedToLabel || 'Shipped To'
        };
        setConfig(restoredConfig);

        // Restore Column Visibility
        if (savedUi?.visibleColumns) {
            setVisibleColumns(savedUi.visibleColumns);
        } else {
            // Smart defaults when no ui_config exists
            setVisibleColumns({
                index: true,
                description: true,
                image: false,
                hsn: true,
                quantity: true,
                rate: true,
                discount: false,
                taxableValue: hasTaxes, // If no taxes (e.g. standard quotation), don't clutter with redundant Taxable Value column!
                total: true
            });
        }

        // Restore Labels
        if (savedUi?.billedToLabel) setBilledToLabel(savedUi.billedToLabel);
        if (savedUi?.shippedToLabel) setShippedToLabel(savedUi.shippedToLabel);

        // Restore Media Assets
        setLogo(savedUi?.logoUrl || null);
        setStamp(savedUi?.stampUrl || null);
        setSignature(savedUi?.signatureUrl || null);

        // Note section visibility
        if (targetType === 'debit_note' || targetType === 'credit_note' || (loadedData.invoice_metadata as any)?.note_reason) {
            setShowNoteSection(true);
        }

        baselineDocRef.current = JSON.parse(JSON.stringify(dataToLoad));
        baselineConfigRef.current = JSON.parse(JSON.stringify(restoredConfig));

        // Hydrate from Slack AI payload if present
        if ((loadedData.invoice_metadata as any)?.slack_ai_payload) {
            setPendingAiData((loadedData.invoice_metadata as any).slack_ai_payload);
        }
    };

    useEffect(() => {
        if (initialData) {
            loadDocumentIntoEditor(initialData);
        }
    }, [initialData]);

    useEffect(() => {
        if (!baselineDocRef.current && (initialData || doc)) {
            baselineDocRef.current = JSON.parse(JSON.stringify(initialData || doc));
            baselineConfigRef.current = JSON.parse(JSON.stringify(config));
        }
    }, []);

    const handleApplyAiData = (data: any) => {
        if (!data) return;

        // 1. Doc Type & Template
        if (data.document_type) {
            setDocType(data.document_type);
            setCustomTitle(data.document_type === 'delivery_challan' ? 'DELIVERY CHALLAN' : data.document_type === 'invoice' ? 'INVOICE' : data.document_type === 'po' ? 'PURCHASE ORDER' : data.document_type === 'quotation' ? 'QUOTATION' : data.document_type === 'debit_note' ? 'DEBIT NOTE' : data.document_type === 'credit_note' ? 'CREDIT NOTE' : 'PROFORMA INVOICE');
        }
        if (data.template_name) {
            const normalizedAiName = String(data.template_name).toLowerCase().trim();
            const tmpl = templates.find(t => {
                const dbName = (t.name || '').toLowerCase().trim();
                return dbName === normalizedAiName || dbName.includes(normalizedAiName) || normalizedAiName.includes(dbName);
            });
            if (tmpl) {
                setSelectedTemplateId(tmpl.id || '');
                loadTemplate(tmpl);
            }
        }

        // Generate date and invoice number
        const today = new Date().toISOString().split('T')[0];
        setDoc(prev => ({
            ...prev,
            invoice_metadata: { ...prev.invoice_metadata, invoice_date: today }
        }));
        
        generateInvoiceNumber(data.document_type, data.company_match?.name);

        // 2. Company
        if (data.document_type === 'po') {
            if (data.company_match?.name) {
                loadCompanyProfile('supplier', data.company_match.name);
                if (data.company_match.is_new_company) {
                    updateParty('supplier', 'name', data.company_match.name);
                }
            }
            
            // Default Customer (Receiver) and Shipped To to Datlion
            const datlionProfile = companyProfiles.find(c => c.name?.toUpperCase()?.includes('DATLION CNERGY'));
            if (datlionProfile) {
                loadCompanyProfile('receiver', datlionProfile.name);
            } else {
                updateParty('receiver', 'name', 'DATLION CNERGY PRIVATE LIMITED');
            }
            
            setDoc(prev => ({
                ...prev,
                shipped_to_details: {
                    name: datlionProfile?.name || 'DATLION CNERGY PRIVATE LIMITED',
                    address: datlionProfile?.shippingAddress || '',
                    gstin: datlionProfile?.gstNumber || '',
                    phone: datlionProfile?.phoneNumber || '',
                    email: datlionProfile?.email || ''
                }
            }));
        } else {
            if (data.company_match?.name) {
                loadCompanyProfile('receiver', data.company_match.name);
                if (data.company_match.is_new_company) {
                    updateParty('receiver', 'name', data.company_match.name);
                }
            }
        }

        // 3. Items
        if (data.items && Array.isArray(data.items)) {
            const newItems: InvoiceItem[] = data.items.map((aiItem: any) => {
                let unit_price = aiItem.unit_price || 0;
                let hsn_sac = '';
                let igst_rate = 18;

                if (!aiItem.is_custom_product) {
                    const matchedProduct = priceList.find(p => p.model_name === aiItem.description);
                    if (matchedProduct) {
                        unit_price = matchedProduct.price_without_gst;
                        hsn_sac = matchedProduct.hsn_code || '';
                    }
                }

                unit_price = Math.round(Number(unit_price || 0) * 100) / 100;
                const quantity = aiItem.quantity || 1;
                const taxable_value = Math.round((quantity * unit_price) * 100) / 100;
                const item: InvoiceItem = {
                    description: aiItem.description || '',
                    hsn_sac,
                    quantity,
                    unit_price,
                    discount: 0,
                    taxable_value,
                    cgst_rate: 0, cgst_amount: 0, sgst_rate: 0, sgst_amount: 0, igst_rate, igst_amount: 0, total_value: 0
                };
                return item;
            });

            // Calculate taxes and apply to doc state using prev to avoid stale closures
            setDoc(prev => {
                const taxMode = getTaxMode(prev.issuer_details.gstin, prev.receiver_details.gstin, prev.invoice_metadata.tax_mode);
                
                const finalItems = newItems.map(item => {
                    const taxRate = Number(item.igst_rate || 18);
                    const taxable = item.taxable_value || 0;
                    
                    if (taxMode === 'intra') {
                        const halfRate = taxRate / 2;
                        item.cgst_rate = halfRate;
                        item.cgst_amount = Math.round((taxable * (halfRate / 100)) * 100) / 100;
                        item.sgst_rate = halfRate;
                        item.sgst_amount = Math.round((taxable * (halfRate / 100)) * 100) / 100;
                        item.igst_amount = 0;
                    } else {
                        item.igst_amount = Math.round((taxable * (taxRate / 100)) * 100) / 100;
                        item.cgst_rate = 0; item.cgst_amount = 0; item.sgst_rate = 0; item.sgst_amount = 0;
                    }
                    item.total_value = Math.round((taxable + (item.cgst_amount || 0) + (item.sgst_amount || 0) + (item.igst_amount || 0)) * 100) / 100;
                    return item;
                });

                return {
                    ...prev,
                    items: finalItems,
                    totals: { ...prev.totals, ...recalcDocTotals(finalItems) }
                };
            });
        }

        // 4. UI Options
        if (data.ui_options) {
            setConfig(prev => ({
                ...prev,
                showReceiverSign: data.ui_options.showReceiverSign !== null ? data.ui_options.showReceiverSign : prev.showReceiverSign,
                showQRCode: data.ui_options.showQRCode !== null ? data.ui_options.showQRCode : prev.showQRCode,
                showTotalsTable: data.ui_options.showTotalsTable !== null ? data.ui_options.showTotalsTable : prev.showTotalsTable,
                showTaxTable: data.ui_options.showTaxTable !== null ? data.ui_options.showTaxTable : prev.showTaxTable,
                terms: data.ui_options.terms !== null ? data.ui_options.terms : prev.terms,
            }));

            if (data.ui_options.visibleColumns) {
                setVisibleColumns(prev => {
                    const updated = { ...prev };
                    Object.keys(data.ui_options.visibleColumns).forEach(key => {
                        if (data.ui_options.visibleColumns[key] !== null) {
                            (updated as any)[key] = data.ui_options.visibleColumns[key];
                        }
                    });
                    return updated;
                });
            }
        }
    };

    useEffect(() => {
        setAmountInWordsStr(amountToWords(doc.totals.grand_total || 0, doc.totals.currency));
    }, [doc.totals.grand_total, doc.totals.currency]);

    const fetchTemplates = async () => { 
        const { data } = await supabase.from('invoice_templates').select('*'); 
        if (data) setTemplates(data); 
        setTemplatesLoaded(true);
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const saveTemplate = async () => {
        if (!templateName) return alert("Enter template name");
        const payload: InvoiceTemplate = {
            name: templateName,
            type: docType as any,
            config: {
                ...config,
                customTitle,
                selectedTemplateId,
                printMode,
                visibleColumns,
                billedToLabel,
                shippedToLabel,
                logoUrl: logo || undefined,
                stampUrl: stamp || undefined,
                signatureUrl: signature || undefined,
                issuer_details: doc.issuer_details
            }
        };
        const { error } = await supabase.from('invoice_templates').insert([payload]);
        if (!error) { 
            if (addLogEntry) addLogEntry('Saved Template', `Created invoice template '${templateName}'`);
            alert("Template saved!"); 
            fetchTemplates(); 
        } else alert("Error saving template");
    };

    const deleteTemplate = async () => {
        if (!selectedTemplateId) return;
        if (!confirm("Are you sure you want to delete this template?")) return;

        const { error } = await supabase.from('invoice_templates').delete().eq('id', selectedTemplateId);
        if (error) {
            alert("Error deleting template: " + error.message);
        } else {
            if (addLogEntry) addLogEntry('Deleted Template', `Deleted invoice template ID '${selectedTemplateId}'`);
            setSelectedTemplateId('');
            fetchTemplates();
        }
    };

    // Document Search Functions
    const handleDocSearch = async (term: string) => {
        setSearchDocTerm(term);
        if (term.length < 2) {
            setDocSearchResults([]);
            return;
        }
        setIsSearchingDoc(true);
        // Using client-side filter of recent documents to avoid PostgREST JSON .or() operator limitations
        const { data, error } = await supabase
            .from('invoices')
            .select('id, invoice_metadata, receiver_details, issuer_details, totals, document_type, source_type, filename, created_at, items')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (data && !error) {
            const searchStr = term.toLowerCase();
            const filtered = data.filter(d => {
                const invNum = (d.invoice_metadata?.invoice_number || '').toLowerCase();
                const recName = (d.receiver_details?.name || '').toLowerCase();
                const issName = (d.issuer_details?.name || '').toLowerCase();
                return invNum.includes(searchStr) || recName.includes(searchStr) || issName.includes(searchStr);
            });
            setDocSearchResults(filtered.slice(0, 10));
        }
        setIsSearchingDoc(false);
    };

    const loadPreviousDocument = (selectedDoc: ExtractedInvoice) => {
        if (!confirm("This will overwrite your current invoice data. Proceed?")) return;
        loadDocumentIntoEditor(selectedDoc);
        setSearchDocTerm('');
        setDocSearchResults([]);
    };

    const loadTemplate = (tmpl: InvoiceTemplate) => {
        // Cast tmpl.config to include potential new properties
        const loadedConfig = tmpl.config as ExtendedConfig;
        const isQuotation = (tmpl.type as any) === 'quotation';
        
        setConfig({
            ...loadedConfig,
            terms: loadedConfig.terms !== undefined ? loadedConfig.terms : '',
            logoSize: loadedConfig.logoSize || 64,
            showReceiverSign: loadedConfig.showReceiverSign ?? true,
            showQRCode: loadedConfig.showQRCode ?? true,
            showTotalsTable: loadedConfig.showTotalsTable ?? true,
            showTaxTable: loadedConfig.showTaxTable !== undefined ? loadedConfig.showTaxTable : (isQuotation ? false : true)
        });

        // Handle legacy type mapping or new type
        if (isQuotation) {
            setDocType('quotation');
            setCustomTitle(loadedConfig.customTitle || 'QUOTATION');
        } else {
            setDocType(tmpl.type as 'invoice' | 'po');
            setCustomTitle(loadedConfig.customTitle || (tmpl.type === 'invoice' ? 'INVOICE' : 'PURCHASE ORDER'));
        }

        setLogo(loadedConfig.logoUrl || null);
        setStamp(loadedConfig.stampUrl || null);
        setSignature(loadedConfig.signatureUrl || null);

        if (loadedConfig.visibleColumns) {
            setVisibleColumns(loadedConfig.visibleColumns);
        } else if (isQuotation) {
            setVisibleColumns({
                index: true,
                description: true,
                image: false,
                hsn: true,
                quantity: true,
                rate: true,
                discount: false,
                taxableValue: false,
                total: true
            });
        }

        if (loadedConfig.billedToLabel) setBilledToLabel(loadedConfig.billedToLabel);
        if (loadedConfig.shippedToLabel) setShippedToLabel(loadedConfig.shippedToLabel);
        if (loadedConfig.printMode) setPrintMode(loadedConfig.printMode as any);

        if (loadedConfig.issuer_details) {
            setDoc(prev => {
                const updatedIssuer = { ...loadedConfig.issuer_details! };
                // Ensure UPI ID is preserved if missing from template, or set to default if entirely empty
                if (!updatedIssuer.bank_details) {
                    updatedIssuer.bank_details = { upi_id: '8956340980@ibl' };
                } else if (!updatedIssuer.bank_details.upi_id) {
                    updatedIssuer.bank_details.upi_id = '8956340980@ibl';
                }
                return { ...prev, issuer_details: updatedIssuer };
            });
        }

        // Auto-generate date and invoice number
        const today = new Date().toISOString().split('T')[0];
        setDoc(prev => ({
            ...prev,
            invoice_metadata: { ...prev.invoice_metadata, invoice_date: today }
        }));
        generateInvoiceNumber(tmpl.type as string);
    };

    const handleDocTypeChange = (type: 'invoice' | 'delivery_challan' | 'po' | 'quotation' | 'proforma' | 'debit_note' | 'credit_note') => {
        setDocType(type);
        currentDocTypeRef.current = type;
        const titleMap: Record<string, string> = { 
            invoice: 'INVOICE', 
            delivery_challan: 'DELIVERY CHALLAN', 
            po: 'PURCHASE ORDER', 
            quotation: 'QUOTATION', 
            proforma: 'PROFORMA INVOICE', 
            debit_note: 'DEBIT NOTE', 
            credit_note: 'CREDIT NOTE' 
        };
        setCustomTitle(titleMap[type] || 'INVOICE');

        // Optimistically calculate next document number immediately (0ms latency)
        const { prefix } = getDocPrefix(type, new Date(), undefined, doc.receiver_details?.name, doc.issuer_details?.name);
        const cachedSeq = sequenceCache.current[prefix] ?? 0;
        const optimisticNum = `${prefix}${String(cachedSeq + 1).padStart(3, '0')}`;

        setDoc(prev => ({
            ...prev,
            source_type: type === 'po' ? 'purchase' : 'sales',
            document_type: type === 'delivery_challan' ? 'generated_delivery_challan' : type === 'invoice' ? 'generated_invoice' : type === 'po' ? 'generated_po' : type === 'quotation' ? 'generated_quotation' : type === 'debit_note' ? 'generated_debit_note' : type === 'credit_note' ? 'generated_credit_note' : 'generated_proforma_invoice',
            invoice_metadata: { 
                ...prev.invoice_metadata, 
                invoice_number: optimisticNum,
                note_type: (type === 'debit_note' ? 'debit' : type === 'credit_note' ? 'credit' : undefined) as any 
            }
        }));

        // Verify with database in background without blocking or race conditions
        generateInvoiceNumber(type);

        if (type === 'quotation' || type === 'proforma') {
            setShowBatteryComparisonTable(true);
            setConfig(prev => ({ ...prev, showBatteryComparisonTable: true, showTaxTable: false }));
        }
        // Auto-expand note section for DN/CN
        if (type === 'debit_note' || type === 'credit_note') {
            setShowNoteSection(true);
        }
    };

    const updateParty = (side: 'issuer' | 'receiver' | 'supplier', field: string, val: string) => {
        setDoc(prev => {
            const targetKey = side === 'issuer' ? 'issuer_details' : side === 'receiver' ? 'receiver_details' : 'supplier_details';
            return {
                ...prev,
                [targetKey]: { ...(prev[targetKey] || {}), [field]: val }
            };
        });
    };

    const updateBankDetails = (field: keyof BankDetails, val: string) => {
        setDoc(prev => {
            const currentBank = prev.issuer_details.bank_details || { account_name: '', account_number: '', bank_name: '', branch: '', ifsc: '' };
            return { ...prev, issuer_details: { ...prev.issuer_details, bank_details: { ...currentBank, [field]: val } } };
        });
    };

    const loadCompanyProfile = (side: 'issuer' | 'receiver' | 'supplier', companyName: string) => {
        const profile = companyProfiles.find(c => c.name === companyName);
        if (profile) {
            setDoc(prev => {
                const targetKey = side === 'issuer' ? 'issuer_details' : side === 'receiver' ? 'receiver_details' : 'supplier_details';
                return {
                    ...prev,
                    [targetKey]: {
                        ...(prev[targetKey] || {}),
                        name: profile.name, gstin: profile.gstNumber, address: profile.shippingAddress, email: profile.email, phone: profile.phoneNumber, contact_person: profile.contactPerson
                    }
                };
            });
        }
    };

    const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
        const newItems = [...doc.items];
        newItems[index] = { ...newItems[index], [field]: value };
        const item = newItems[index];

        const taxRate = Number(item.igst_rate || 0);
        const taxMode = getTaxMode(doc.issuer_details.gstin, doc.receiver_details.gstin, doc.invoice_metadata.tax_mode);

        if (field === 'total_value') {
            // Back-calculate unit rate (excl. GST) from Total (incl. GST)
            const inputTotal = Math.max(0, Math.round((parseFloat(value) || 0) * 100) / 100);
            const qty = Math.max(1, Number(item.quantity) || 1);
            const discount = Math.round(Number(item.discount || 0) * 100) / 100;

            const calculatedTaxable = taxRate > 0 ? (inputTotal / (1 + (taxRate / 100))) : inputTotal;
            const calculatedUnitPrice = Math.max(0, (calculatedTaxable + discount) / qty);
            const roundedUnitPrice = Math.round(calculatedUnitPrice * 100) / 100;

            item.unit_price = roundedUnitPrice;
            item.taxable_value = Math.round(Math.max(0, (Number(item.quantity) * roundedUnitPrice) - discount) * 100) / 100;
            item.total_value = inputTotal;
        } else if (field === 'quantity' || field === 'unit_price' || field === 'discount') {
            const rawTaxable = Math.max(0, (Number(item.quantity) * Number(item.unit_price)) - Number(item.discount || 0));
            item.taxable_value = Math.round(rawTaxable * 100) / 100;
        }

        if (taxMode === 'intra') {
            const halfRate = taxRate / 2;
            item.cgst_rate = halfRate;
            item.cgst_amount = Math.round((item.taxable_value * (halfRate / 100)) * 100) / 100;
            item.sgst_rate = halfRate;
            item.sgst_amount = Math.round((item.taxable_value * (halfRate / 100)) * 100) / 100;
            item.igst_amount = 0;
        } else {
            item.igst_amount = Math.round((item.taxable_value * (taxRate / 100)) * 100) / 100;
            item.cgst_rate = 0;
            item.cgst_amount = 0;
            item.sgst_rate = 0;
            item.sgst_amount = 0;
        }

        if (field !== 'total_value') {
            item.total_value = Math.round((item.taxable_value + (item.cgst_amount || 0) + (item.sgst_amount || 0) + (item.igst_amount || 0)) * 100) / 100;
        }

        const newTotals = recalcDocTotals(newItems);
        setDoc(prev => ({ ...prev, items: newItems, totals: newTotals }));
    };

    const updateGroupTaxRate = (groupKey: string, newRate: number) => {
        const newItems = doc.items.map(item => {
            const rate = Number(item.igst_rate || 0);
            const key = `${rate}-${item.hsn_sac || ''}`;
            if (key !== groupKey) return item;
            const updatedItem = { ...item, igst_rate: newRate };
            const taxMode = getTaxMode(doc.issuer_details.gstin, doc.receiver_details.gstin, doc.invoice_metadata.tax_mode);
            if (taxMode === 'intra') {
                const halfRate = newRate / 2;
                updatedItem.cgst_rate = halfRate;
                updatedItem.cgst_amount = Math.round(((updatedItem.taxable_value || 0) * (halfRate / 100)) * 100) / 100;
                updatedItem.sgst_rate = halfRate;
                updatedItem.sgst_amount = Math.round(((updatedItem.taxable_value || 0) * (halfRate / 100)) * 100) / 100;
                updatedItem.igst_amount = 0;
            } else {
                updatedItem.igst_amount = Math.round(((updatedItem.taxable_value || 0) * (newRate / 100)) * 100) / 100;
                updatedItem.cgst_rate = 0;
                updatedItem.cgst_amount = 0;
                updatedItem.sgst_rate = 0;
                updatedItem.sgst_amount = 0;
            }
            updatedItem.total_value = Math.round(((updatedItem.taxable_value || 0) + (updatedItem.cgst_amount || 0) + (updatedItem.sgst_amount || 0) + (updatedItem.igst_amount || 0)) * 100) / 100;
            return updatedItem;
        });
        const newTotals = recalcDocTotals(newItems);
        setDoc(prev => ({ ...prev, items: newItems, totals: { ...prev.totals, ...newTotals } }));
    };

    const moveItem = (index: number, direction: number) => {
        if ((direction === -1 && index === 0) || (direction === 1 && index === doc.items.length - 1)) return;
        const newItems = [...doc.items];
        const targetIndex = index + direction;
        [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
        setDoc(prev => ({ ...prev, items: newItems }));
    };

    const deleteItem = (index: number) => {
        const newItems = doc.items.filter((_, i) => i !== index);
        setDoc(prev => ({ ...prev, items: newItems, totals: { ...prev.totals, ...recalcDocTotals(newItems) } }));
    };

    const downloadItemCSVTemplate = () => {
        const csvContent = [
            'Description,HSN/SAC,Quantity,Unit Price,Discount,Tax Rate %',
            'Solar Inverter 5kVA,85044090,2,35000,500,18',
            'LiFePO4 Battery Pack 48V,85076000,1,68000,0,18',
            'Solar Cable 6sqmm (100m Roll),85444990,3,4500,100,18'
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'invoice_items_template.csv';
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleItemImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result;
            if (typeof text === 'string') {
                const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
                if (lines.length < 2) {
                    alert('CSV file must contain a header row and at least one item data row.');
                    return;
                }

                // Check for dynamic headers
                const headerLine = lines[0].toLowerCase();
                const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                
                const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('item') || h.includes('name') || h.includes('product') || h.includes('model'));
                const hsnIdx = headers.findIndex(h => h.includes('hsn') || h.includes('sac') || h.includes('code'));
                const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('count'));
                const rateIdx = headers.findIndex(h => h.includes('price') || h.includes('rate') || h.includes('unit'));
                const totalIdx = headers.findIndex(h => h.includes('total') || h.includes('gross') || h.includes('mrp') || h.includes('amount'));
                const discIdx = headers.findIndex(h => h.includes('disc'));
                const taxIdx = headers.findIndex(h => h.includes('tax') || h.includes('gst') || h.includes('rate %') || h.includes('igst'));

                const newItems: InvoiceItem[] = [];
                const taxMode = getTaxMode(doc.issuer_details.gstin, doc.receiver_details.gstin, doc.invoice_metadata.tax_mode);

                lines.slice(1).forEach(line => {
                    const cols: string[] = [];
                    let cur = '';
                    let inQuotes = false;
                    for (let c = 0; c < line.length; c++) {
                        const char = line[c];
                        if (char === '"') inQuotes = !inQuotes;
                        else if (char === ',' && !inQuotes) {
                            cols.push(cur.trim().replace(/^"|"$/g, ''));
                            cur = '';
                        } else cur += char;
                    }
                    cols.push(cur.trim().replace(/^"|"$/g, ''));

                    const desc = descIdx !== -1 ? cols[descIdx] : cols[0];
                    if (!desc) return;

                    const hsn = hsnIdx !== -1 ? (cols[hsnIdx] || '') : (cols[1] || '');
                    const quantity = qtyIdx !== -1 ? (parseFloat(cols[qtyIdx]) || 1) : (parseFloat(cols[2]) || 1);
                    const discount = discIdx !== -1 ? (parseFloat(cols[discIdx]) || 0) : 0;
                    const igst_rate = taxIdx !== -1 ? (parseFloat(cols[taxIdx]) || 18) : (cols[4] ? parseFloat(cols[4]) : 18);

                    let unit_price = 0;
                    if (rateIdx !== -1) {
                        unit_price = parseFloat(cols[rateIdx]) || 0;
                    } else if (totalIdx !== -1) {
                        // Back-calculate unit_price from Total column
                        const totalColVal = parseFloat(cols[totalIdx]) || 0;
                        const calcTaxable = igst_rate > 0 ? (totalColVal / (1 + (igst_rate / 100))) : totalColVal;
                        unit_price = (calcTaxable + discount) / (quantity || 1);
                    } else {
                        unit_price = parseFloat(cols[3]) || 0;
                    }
                    unit_price = Math.round(unit_price * 100) / 100;

                    const taxable_value = Math.round(Math.max(0, (quantity * unit_price) - discount) * 100) / 100;
                    let cgst_rate = 0;
                    let cgst_amount = 0;
                    let sgst_rate = 0;
                    let sgst_amount = 0;
                    let igst_amount = 0;

                    if (taxMode === 'intra') {
                        const halfRate = igst_rate / 2;
                        cgst_rate = halfRate;
                        cgst_amount = Math.round((taxable_value * (halfRate / 100)) * 100) / 100;
                        sgst_rate = halfRate;
                        sgst_amount = Math.round((taxable_value * (halfRate / 100)) * 100) / 100;
                    } else {
                        igst_amount = Math.round((taxable_value * (igst_rate / 100)) * 100) / 100;
                    }

                    const total_value = Math.round((taxable_value + cgst_amount + sgst_amount + igst_amount) * 100) / 100;

                    newItems.push({
                        description: desc,
                        hsn_sac: hsn,
                        quantity,
                        unit_price,
                        discount,
                        taxable_value,
                        cgst_rate,
                        cgst_amount,
                        sgst_rate,
                        sgst_amount,
                        igst_rate,
                        igst_amount,
                        total_value
                    });
                });

                if (newItems.length > 0) {
                    setDoc(prev => {
                        const updatedItems = [...prev.items, ...newItems];
                        return {
                            ...prev,
                            items: updatedItems,
                            totals: { ...prev.totals, ...recalcDocTotals(updatedItems) }
                        };
                    });
                    if (addLogEntry) addLogEntry('Imported Table Items', `Imported ${newItems.length} items into invoice via CSV.`);
                    alert(`✅ Successfully imported ${newItems.length} line items!`);
                } else {
                    alert('No valid items were parsed from the CSV file.');
                }
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleTaxModeChange = (mode: 'intra' | 'inter' | undefined) => {
        // Recalculate all items with new tax mode
        const newItems = doc.items.map(item => {
            const taxRate = Number(item.igst_rate || 0);
            // Use new mode for calculation
            const effectiveTaxMode = getTaxMode(doc.issuer_details.gstin, doc.receiver_details.gstin, mode);

            const newItem = { ...item };
            if (effectiveTaxMode === 'intra') {
                const halfRate = taxRate / 2;
                newItem.cgst_rate = halfRate;
                newItem.cgst_amount = Math.round(((newItem.taxable_value || 0) * (halfRate / 100)) * 100) / 100;
                newItem.sgst_rate = halfRate;
                newItem.sgst_amount = Math.round(((newItem.taxable_value || 0) * (halfRate / 100)) * 100) / 100;
                newItem.igst_amount = 0;
                newItem.igst_rate = taxRate; // Keep original rate stored
            } else {
                newItem.igst_amount = Math.round(((newItem.taxable_value || 0) * (taxRate / 100)) * 100) / 100;
                newItem.igst_rate = taxRate;
                newItem.cgst_rate = 0;
                newItem.cgst_amount = 0;
                newItem.sgst_rate = 0;
                newItem.sgst_amount = 0;
            }
            newItem.total_value = Math.round(((newItem.taxable_value || 0) + (newItem.cgst_amount || 0) + (newItem.sgst_amount || 0) + (newItem.igst_amount || 0)) * 100) / 100;
            return newItem;
        });

        const newTotals = recalcDocTotals(newItems);

        setDoc(prev => ({
            ...prev,
            invoice_metadata: { ...prev.invoice_metadata, tax_mode: mode },
            items: newItems,
            totals: { ...prev.totals, ...newTotals }
        }));
    };

    const addItem = () => {
        const newItem: InvoiceItem = { description: 'New Item', hsn_sac: '', quantity: 1, unit_price: 0, discount: 0, taxable_value: 0, cgst_rate: 0, cgst_amount: 0, sgst_rate: 0, sgst_amount: 0, igst_rate: 18, igst_amount: 0, total_value: 0 };
        const newItems = [...doc.items, newItem];
        setDoc(prev => ({ ...prev, items: newItems, totals: { ...prev.totals, ...recalcDocTotals(newItems) } }));
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { const reader = new FileReader(); reader.onloadend = () => setLogo(reader.result as string); reader.readAsDataURL(file); }
    };

    const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { const reader = new FileReader(); reader.onloadend = () => setStamp(reader.result as string); reader.readAsDataURL(file); }
    };

    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { const reader = new FileReader(); reader.onloadend = () => setSignature(reader.result as string); reader.readAsDataURL(file); }
    };

    // Remove handlers
    const removeLogo = () => { setLogo(null); if (logoInputRef.current) logoInputRef.current.value = ''; };
    const removeStamp = () => { setStamp(null); if (stampInputRef.current) stampInputRef.current.value = ''; };
    const removeSignature = () => { setSignature(null); if (signatureInputRef.current) signatureInputRef.current.value = ''; };
    const isEditingExistingRecord = Boolean(initialData?.id || doc.id);
    const editingRecordId = doc.id || initialData?.id;

    const handleUpdateRecord = async () => {
        if (currentUser?.role !== 'admin' && currentUser?.role !== 'billing') {
            return alert("Access Denied: Updating existing records is restricted to Director Admins and Billing team.");
        }
        const targetId = editingRecordId;
        if (!targetId) {
            return alert("No existing record ID found to update.");
        }
        const invNum = doc.invoice_metadata.invoice_number;
        if (!invNum) return alert("Please provide an invoice number.");

        setIsSaving(true);
        try {
            const now = new Date().toISOString();
            const editorName = currentUser?.username || username || 'system';
            
            const oldDoc = baselineDocRef.current || initialData || null;
            const oldConfig = baselineConfigRef.current || null;
            const diff = computeInvoiceChanges(oldDoc, doc, oldConfig, config);

            const historyEntry: InvoiceEditHistoryEntry = {
                edited_at: now,
                edited_by: editorName,
                previous_grand_total: oldDoc?.totals?.grand_total ?? doc.totals?.grand_total,
                new_grand_total: doc.totals?.grand_total,
                previous_invoice_number: oldDoc?.invoice_metadata?.invoice_number ?? doc.invoice_metadata?.invoice_number,
                new_invoice_number: doc.invoice_metadata?.invoice_number,
                summary: diff.summary,
                changes: diff.changes
            };

            const prevHistory = doc.invoice_metadata?.edit_history || initialData?.invoice_metadata?.edit_history || [];
            const updatedHistory = [...prevHistory, historyEntry];

            const record = {
                ...doc,
                source_type: doc.source_type || initialData?.source_type || (docType === 'po' ? 'purchase' : 'sales'),
                invoice_metadata: {
                    ...doc.invoice_metadata,
                    terms: config.terms,
                    terms_conditions: config.terms,
                    custom_title: customTitle,
                    edit_history: updatedHistory,
                    shipped_to_details: doc.shipped_to_details,
                    supplier_details: doc.supplier_details,
                    ui_config: {
                        ...config,
                        showSubtotalDiscount,
                        showBatteryComparisonTable,
                        customTitle,
                        selectedTemplateId,
                        printMode,
                        logoUrl: logo || undefined,
                        stampUrl: stamp || undefined,
                        signatureUrl: signature || undefined,
                        visibleColumns,
                        billedToLabel,
                        shippedToLabel
                    }
                },
                filename: invNum,
                document_type: docType === 'delivery_challan' ? 'generated_delivery_challan' : docType === 'invoice' ? (initialData?.document_type === 'invoice' ? 'invoice' : 'generated_invoice') : docType === 'po' ? 'generated_po' : docType === 'quotation' ? 'generated_quotation' : docType === 'debit_note' ? 'generated_debit_note' : docType === 'credit_note' ? 'generated_credit_note' : 'generated_proforma_invoice',
                uploaded_by: doc.uploaded_by || currentUser?.username || 'system',
                requires_review: false
            };

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, timestamp, created_at, shipped_to_details, supplier_details, ...cleanRecord } = record as any;

            const { error: updateError } = await supabase
                .from('invoices')
                .update(cleanRecord)
                .eq('id', targetId);

            if (updateError) throw updateError;

            // Update local baseline ref to newly saved record state
            baselineDocRef.current = JSON.parse(JSON.stringify(record));
            baselineConfigRef.current = JSON.parse(JSON.stringify(config));

            // Update local state with history and id
            setDoc(prev => ({
                ...prev,
                id: targetId,
                invoice_metadata: {
                    ...prev.invoice_metadata,
                    edit_history: updatedHistory
                }
            }));

            try { localStorage.removeItem('invoice_maker_draft'); } catch (e) {}
            if (addLogEntry) addLogEntry('Updated Document', `Updated ${docType.toUpperCase()} document #${invNum}: ${diff.summary}`);
            alert(`✅ Document #${invNum} updated successfully in database! Revision logged with ${diff.changes.length} change(s).`);
        } catch (error: any) {
            alert("Error updating record: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveRecord = async () => {
        const invNum = doc.invoice_metadata.invoice_number;
        if (!invNum) return alert("Please provide an invoice number.");

        setIsSaving(true);
        try {
            // Check for duplicates in Supabase Dashboard
            const { data: existing, error: checkError } = await supabase
                .from('invoices')
                .select('id')
                .or(`filename.eq.${invNum},invoice_metadata->>invoice_number.eq.${invNum}`)
                .maybeSingle();

            if (checkError) {
                console.warn('[Save] Duplicate check query failed:', checkError.message);
                // Don't throw on query error — allow save to proceed with a warning
                const proceed = confirm(`Warning: Could not verify if this invoice number already exists (${checkError.message}). Save anyway?`);
                if (!proceed) { setIsSaving(false); return; }
            }
            if (existing) {
                alert(`Duplicate detected: Invoice #${invNum} already exists in the finance dashboard.`);
                setIsSaving(false);
                return;
            }

            // Force invoice number as filename
            const record = {
                ...doc,
                source_type: doc.source_type || initialData?.source_type || (docType === 'po' ? 'purchase' : 'sales'),
                invoice_metadata: {
                    ...doc.invoice_metadata,
                    terms: config.terms,
                    terms_conditions: config.terms,
                    custom_title: customTitle,
                    shipped_to_details: doc.shipped_to_details,
                    supplier_details: doc.supplier_details,
                    ui_config: {
                        ...config,
                        showSubtotalDiscount,
                        showBatteryComparisonTable,
                        customTitle,
                        selectedTemplateId,
                        printMode,
                        logoUrl: logo || undefined,
                        stampUrl: stamp || undefined,
                        signatureUrl: signature || undefined,
                        visibleColumns,
                        billedToLabel,
                        shippedToLabel
                    }
                },
                filename: invNum,
                document_type: docType === 'delivery_challan' ? 'generated_delivery_challan' : docType === 'invoice' ? (initialData?.document_type === 'invoice' ? 'invoice' : 'generated_invoice') : docType === 'po' ? 'generated_po' : docType === 'quotation' ? 'generated_quotation' : docType === 'debit_note' ? 'generated_debit_note' : docType === 'credit_note' ? 'generated_credit_note' : 'generated_proforma_invoice',
                uploaded_by: currentUser?.username || 'system',
                requires_review: false
            };

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, timestamp, shipped_to_details, supplier_details, ...cleanRecord } = record as any;
            const { error: insertError } = await supabase.from('invoices').insert([cleanRecord]);
            if (insertError) throw insertError;

            // Update sequence cache with saved number so next invoice is immediately +1
            const { prefix } = getDocPrefix(docType, new Date(), undefined, doc.receiver_details?.name, doc.issuer_details?.name);
            if (invNum.startsWith(prefix)) {
                const seq = parseInt(invNum.substring(prefix.length), 10);
                if (!isNaN(seq)) {
                    sequenceCache.current[prefix] = Math.max(sequenceCache.current[prefix] || 0, seq);
                    saveSequenceCacheToStorage(currentFyStr, sequenceCache.current);
                }
            }

            try { localStorage.removeItem('invoice_maker_draft'); } catch (e) {}
            if (addLogEntry) addLogEntry('Saved Document', `Saved ${docType.toUpperCase()} document #${invNum} to Dashboard.`);
            alert("Document saved to Dashboard!");
        } catch (error: any) {
            alert("Error saving record: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePrint = () => {
        const originalTitle = document.title;
        if (doc.invoice_metadata.invoice_number) document.title = doc.invoice_metadata.invoice_number;
        window.print();
        document.title = originalTitle;
    };

    const generateInvoiceNumber = async (overrideDocType?: string, overrideOtherParty?: string, _retryCount = 0) => {
        // Guard: if overrideDocType is an event object (e.g. from onClick), ignore it and use docType
        const targetDocType = typeof overrideDocType === 'string' ? overrideDocType : docType;
        const reqId = ++latestGenRequestId.current;

        const date = new Date();
        const { prefix, isNewSystem } = getDocPrefix(targetDocType, date, overrideOtherParty, doc.receiver_details?.name, doc.issuer_details?.name);

        // Optimistically apply cached sequence immediately if available
        if (sequenceCache.current[prefix] !== undefined) {
            const cachedNext = `${prefix}${String(sequenceCache.current[prefix] + 1).padStart(3, '0')}`;
            setDoc(prev => {
                if (prev.invoice_metadata?.invoice_number === cachedNext) return prev;
                return {
                    ...prev,
                    invoice_metadata: { ...prev.invoice_metadata, invoice_number: cachedNext }
                };
            });
        }

        // Query database for all invoices in this series to find the true maximum sequence number
        const { data, error: queryError } = await supabase
            .from('invoices')
            .select('filename, invoice_metadata->>invoice_number')
            .or(`filename.ilike.${prefix}%,invoice_metadata->>invoice_number.ilike.${prefix}%`);

        // Only retry on actual network/query error (NOT when data is empty - empty means seq starts at 1)
        if (queryError && _retryCount < 2) {
            const backoff = (_retryCount + 1) * 200;
            await new Promise(r => setTimeout(r, backoff));
            return generateInvoiceNumber(targetDocType, overrideOtherParty, _retryCount + 1);
        }

        let maxSeq = 0;
        if (data && data.length > 0) {
            data.forEach((row: any) => {
                const invNum = row.invoice_number || row.filename;
                if (invNum && invNum.startsWith(prefix)) {
                    const seqStr = isNewSystem ? invNum.substring(prefix.length) : invNum.split('.').pop();
                    if (seqStr) {
                        const seq = parseInt(seqStr, 10);
                        if (!isNaN(seq) && seq > maxSeq) {
                            maxSeq = seq;
                        }
                    }
                }
            });
        }

        // Cache the latest verified sequence in memory and localStorage
        sequenceCache.current[prefix] = maxSeq;
        saveSequenceCacheToStorage(currentFyStr, sequenceCache.current);

        // Race condition guard: ignore if a newer request was dispatched or user switched docType
        if (reqId !== latestGenRequestId.current || currentDocTypeRef.current !== targetDocType) {
            return;
        }

        const nextSeq = String(maxSeq + 1).padStart(3, '0');
        const newNumber = `${prefix}${nextSeq}`;

        setDoc(prev => {
            if (prev.invoice_metadata?.invoice_number === newNumber) return prev;
            return {
                ...prev,
                invoice_metadata: { ...prev.invoice_metadata, invoice_number: newNumber }
            };
        });
    };

    // --- Multi-Page Print Pagination ---
    const ITEMS_PER_PAGE = 10;
    const paginatedPages = React.useMemo(() => {
        const items = doc.items || [];
        if (items.length === 0) return [[]] as InvoiceItem[][];
        const pages: InvoiceItem[][] = [];
        for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
            pages.push(items.slice(i, i + ITEMS_PER_PAGE));
        }
        return pages;
    }, [doc.items]);

    const formatPrintDate = (dateStr: string) => {
        if (!dateStr) return '';
        try { return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
        catch { return dateStr; }
    };

    return (
        <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-slate-100">
            <style>{`
                @media print {
                    @page { size: A4; margin: 0; }
                    body { visibility: hidden; }
                    #print-area {
                        visibility: visible;
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 210mm;
                        margin: 0;
                        padding: 0;
                        background: white !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        box-shadow: none;
                        overflow: visible;
                    }
                    #print-area * { visibility: visible; }
                    .screen-only { display: none !important; }
                    .print-only { display: block !important; }
                    .invoice-page {
                        page-break-after: always;
                        width: 210mm;
                        min-height: 296mm;
                        max-height: 296mm;
                        padding: 8mm;
                        box-sizing: border-box;
                        position: relative;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }
                    .invoice-page:last-child { page-break-after: auto; }
                    .no-print, .no-print * { display: none !important; }
                    ::-webkit-scrollbar { display: none; }
                }
            `}</style>

            {/* Sidebar Configuration */}
            <div className="w-full lg:w-1/3 bg-white border-r border-slate-200 overflow-y-auto p-4 no-print shadow-xl z-10 h-full">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800">Document Maker</h2>
                    <div className="flex gap-1 flex-wrap">
                        <button onClick={() => handleDocTypeChange('invoice')} className={`px-2 py-1 text-xs rounded-lg border ${docType === 'invoice' ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-slate-600 border-slate-200'}`}>Invoice</button>
                        <button onClick={() => handleDocTypeChange('delivery_challan')} className={`px-2 py-1 text-xs rounded-lg border ${docType === 'delivery_challan' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-200'}`}>Challan</button>
                        <button onClick={() => handleDocTypeChange('quotation')} className={`px-2 py-1 text-xs rounded-lg border ${docType === 'quotation' ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-slate-600 border-slate-200'}`}>Quote</button>
                        <button onClick={() => handleDocTypeChange('po')} className={`px-2 py-1 text-xs rounded-lg border ${docType === 'po' ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-slate-600 border-slate-200'}`}>PO</button>
                        <button onClick={() => handleDocTypeChange('proforma')} className={`px-2 py-1 text-xs rounded-lg border ${docType === 'proforma' ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-slate-600 border-slate-200'}`}>Proforma</button>
                        <button onClick={() => handleDocTypeChange('debit_note')} className={`px-2 py-1 text-xs rounded-lg border ${docType === 'debit_note' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-500 border-red-200'}`}>DN</button>
                        <button onClick={() => handleDocTypeChange('credit_note')} className={`px-2 py-1 text-xs rounded-lg border ${docType === 'credit_note' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-600 border-emerald-200'}`}>CN</button>
                    </div>
                </div>

                {docType === 'delivery_challan' && (
                    <div className="mb-4 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between shadow-2xs">
                        <div>
                            <span className="text-xs font-bold text-indigo-900 block">Challan Flow</span>
                            <span className="text-[10px] text-indigo-600">Issued = Outward, Received = Inward</span>
                        </div>
                        <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-indigo-200">
                            <button
                                type="button"
                                onClick={() => setDoc(prev => ({ ...prev, source_type: 'sales' }))}
                                className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                                    (doc.source_type || 'sales') === 'sales'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-indigo-600 hover:bg-indigo-50'
                                }`}
                            >
                                Outward
                            </button>
                            <button
                                type="button"
                                onClick={() => setDoc(prev => ({ ...prev, source_type: 'purchase' }))}
                                className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                                    doc.source_type === 'purchase'
                                        ? 'bg-purple-600 text-white shadow-2xs'
                                        : 'text-purple-700 hover:bg-purple-50'
                                }`}
                            >
                                Inward
                            </button>
                        </div>
                    </div>
                )}

                {isEditingExistingRecord && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl shadow-2xs">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                                <span className="p-1 bg-amber-500 text-white rounded font-bold text-[10px] uppercase tracking-wider">Editing Mode</span>
                                <span className="text-xs font-bold text-amber-900 truncate max-w-[180px]">
                                    Doc #{doc.invoice_metadata?.invoice_number || 'N/A'}
                                </span>
                            </div>
                            <button
                                onClick={() => {
                                    if (confirm("Clear active edit mode and start a new blank invoice?")) {
                                        setDoc({ ...EMPTY_INVOICE });
                                        if (setInvoiceDraft) setInvoiceDraft(null);
                                    }
                                }}
                                className="text-[10px] bg-white text-amber-800 border border-amber-300 px-2 py-0.5 rounded hover:bg-amber-100 font-bold"
                            >
                                New Blank
                            </button>
                        </div>
                        <p className="text-[10px] text-amber-700 font-mono mt-1">
                            ID: {editingRecordId?.slice(0, 8)}...
                            {doc.invoice_metadata?.edit_history && doc.invoice_metadata.edit_history.length > 0 && (
                                <span className="ml-2 font-sans font-semibold text-amber-800">
                                    • {doc.invoice_metadata.edit_history.length} revision(s)
                                </span>
                            )}
                        </p>
                    </div>
                )}

                {/* Debit / Credit Note — minimizable */}
                <div className="mb-4 border border-slate-200 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowNoteSection(!showNoteSection)}
                        className="w-full flex justify-between items-center px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-bold text-slate-600 uppercase tracking-wider"
                    >
                        <span>📋 Debit / Credit Note</span>
                        {showNoteSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {showNoteSection && (
                        <div className="p-3 space-y-2 bg-white">
                            <div>
                                <label className="text-[10px] text-slate-400 uppercase font-bold">Type</label>
                                <select
                                    className="w-full text-sm p-1.5 border rounded bg-white outline-none focus:border-[#8EBF45]"
                                    value={doc.invoice_metadata.note_type || ''}
                                    onChange={e => setDoc(prev => ({ ...prev, invoice_metadata: { ...prev.invoice_metadata, note_type: e.target.value as any } }))}
                                >
                                    <option value="">None</option>
                                    <option value="debit">Debit Note</option>
                                    <option value="credit">Credit Note</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase font-bold">Against Invoice No.</label>
                                    <input
                                        className="w-full text-sm p-1.5 border rounded outline-none focus:border-[#8EBF45]"
                                        placeholder="INV-001"
                                        value={doc.invoice_metadata.related_invoice_number || ''}
                                        onChange={e => setDoc(prev => ({ ...prev, invoice_metadata: { ...prev.invoice_metadata, related_invoice_number: e.target.value } }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase font-bold">Dated</label>
                                    <input
                                        type="date"
                                        className="w-full text-sm p-1.5 border rounded outline-none focus:border-[#8EBF45]"
                                        value={doc.invoice_metadata.related_invoice_date || ''}
                                        onChange={e => setDoc(prev => ({ ...prev, invoice_metadata: { ...prev.invoice_metadata, related_invoice_date: e.target.value } }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-400 uppercase font-bold">Reason</label>
                                <input
                                    className="w-full text-sm p-1.5 border rounded outline-none focus:border-[#8EBF45]"
                                    placeholder="e.g. Rate difference, quality issue"
                                    value={doc.invoice_metadata.note_reason || ''}
                                    onChange={e => setDoc(prev => ({ ...prev, invoice_metadata: { ...prev.invoice_metadata, note_reason: e.target.value } }))}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="mb-6 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-slate-500 uppercase">Load Template</span><SettingsIcon size={14} className="text-slate-400" /></div>

                    <div className="flex gap-2 mb-2">
                        <select
                            className="flex-1 text-sm p-2 border rounded bg-white outline-none focus:border-[#8EBF45]"
                            value={selectedTemplateId}
                            onChange={(e) => {
                                const id = e.target.value;
                                setSelectedTemplateId(id);
                                const t = templates.find(t => t.id === id);
                                if (t) loadTemplate(t);
                            }}
                        >
                            <option value="">Select a template...</option>
                            {templates.map((t, i) => <option key={t.id || i} value={t.id}>{safeRender(t.name)}</option>)}
                        </select>
                        <button
                            onClick={deleteTemplate}
                            disabled={!selectedTemplateId}
                            className={`p-2 rounded border transition-colors ${selectedTemplateId ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100 cursor-pointer' : 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'}`}
                            title="Delete Template"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>

                    <div className="flex gap-2"><input className="flex-1 text-sm p-2 border rounded" placeholder="New template name" value={templateName} onChange={e => setTemplateName(e.target.value)} /><button onClick={saveTemplate} className="p-2 bg-slate-200 rounded hover:bg-slate-300"><Save size={16} /></button></div>
                </div>

                {/* Search Previous Document */}
                <div className="mb-6 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase">Search Previous Document</span>
                        <ImportIcon size={14} className="text-slate-400" />
                    </div>
                    <div className="relative">
                        <input 
                            type="text" 
                            className="w-full text-sm p-2 border rounded outline-none focus:border-[#8EBF45]" 
                            placeholder="Search by invoice # or name..."
                            value={searchDocTerm}
                            onChange={(e) => handleDocSearch(e.target.value)}
                        />
                        {isSearchingDoc && <Loader2 size={16} className="absolute right-3 top-2.5 animate-spin text-slate-400" />}
                        {docSearchResults.length > 0 && (
                            <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                {docSearchResults.map((res, i) => (
                                    <li 
                                        key={res.id || i} 
                                        className="p-2 border-b last:border-b-0 hover:bg-slate-50 cursor-pointer text-xs"
                                        onClick={() => loadPreviousDocument(res)}
                                    >
                                        <div className="font-bold text-slate-700">{res.invoice_metadata?.invoice_number || 'No Number'}</div>
                                        <div className="text-slate-500 flex justify-between">
                                            <span>{res.receiver_details?.name || 'Unknown'}</span>
                                            <span>{getCurrencySymbol(res.totals?.currency)} {(res.totals?.grand_total || 0).toFixed(2)}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="mb-6 space-y-3 border-b pb-6">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><SettingsIcon size={14} /> Branding</h3>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Logo</label>
                        <div className="flex gap-2">
                            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs w-full" />
                            {logo && <button onClick={removeLogo} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Remove Logo"><Trash2 size={14} /></button>}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Logo Size ({config.logoSize || 64}px)</label>
                        <input type="range" min="32" max="200" value={config.logoSize || 64} onChange={(e) => setConfig({ ...config, logoSize: parseInt(e.target.value) })} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Stamp / Seal</label>
                        <div className="flex gap-2">
                            <input ref={stampInputRef} type="file" accept="image/*" onChange={handleStampUpload} className="text-xs w-full" />
                            {stamp && <button onClick={removeStamp} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Remove Stamp"><Trash2 size={14} /></button>}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Signature (Issuer)</label>
                        <div className="flex gap-2">
                            <input ref={signatureInputRef} type="file" accept="image/*" onChange={handleSignatureUpload} className="text-xs w-full" />
                            {signature && <button onClick={removeSignature} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Remove Signature"><Trash2 size={14} /></button>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-xs text-slate-500">Font</label><select className="text-sm p-2 border rounded w-full" value={config.font} onChange={e => setConfig({ ...config, font: e.target.value as any })}><option value="font-sans">Sans Serif</option><option value="font-serif">Serif</option></select></div>
                        <div><label className="text-xs text-slate-500">Accent</label><input type="color" className="w-full h-9 p-0 border rounded cursor-pointer" value={config.color} onChange={e => setConfig({ ...config, color: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs text-slate-500">Document Title</label>
                            <input className="w-full text-sm p-2 border rounded font-bold uppercase" value={customTitle} onChange={e => setCustomTitle(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Currency</label>
                            <select className="text-sm p-2 border rounded w-full" value={doc.totals?.currency || 'INR'} onChange={e => setDoc(prev => ({ ...prev, totals: { ...(prev.totals || { subtotal_taxable: 0, cgst_total: 0, sgst_total: 0, igst_total: 0, grand_total: 0 }), currency: e.target.value } }))}>
                                <option value="INR">INR (₹)</option>
                                <option value="USD">USD ($)</option>
                                <option value="RMB">RMB (¥)</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Footer Text</label>
                        <textarea
                            className="w-full text-sm p-2 border rounded"
                            rows={2}
                            value={config.footerText}
                            onChange={e => setConfig({ ...config, footerText: e.target.value })}
                        />
                    </div>
                </div>

                <div className="mb-6 space-y-3 border-b pb-6">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><LayoutDashboard size={14} /> Sections</h3>
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                        <input type="checkbox" checked={config.showTotalsTable ?? true} onChange={e => setConfig({ ...config, showTotalsTable: e.target.checked })} className="rounded border-gray-300 text-[#8EBF45] focus:ring-[#8EBF45]" />
                        Show Amount in Words, Subtotal, Tax & Total
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                        <input type="checkbox" checked={config.showTaxTable ?? true} onChange={e => setConfig({ ...config, showTaxTable: e.target.checked })} className="rounded border-gray-300 text-[#8EBF45] focus:ring-[#8EBF45]" />
                        Show Tax Breakdown Table
                    </label>
                     <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                        <input type="checkbox" checked={config.showQRCode ?? true} onChange={e => setConfig({ ...config, showQRCode: e.target.checked })} className="rounded border-gray-300 text-[#8EBF45] focus:ring-[#8EBF45]" />
                        Show Payment QR Code
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                        <input type="checkbox" checked={config.showReceiverSign ?? true} onChange={e => setConfig({ ...config, showReceiverSign: e.target.checked })} className="rounded border-gray-300 text-[#8EBF45] focus:ring-[#8EBF45]" />
                        Show Receiver's Signature
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showSubtotalDiscount}
                            onChange={e => {
                                const val = e.target.checked;
                                setShowSubtotalDiscount(val);
                                setConfig(prev => ({ ...prev, showSubtotalDiscount: val }));
                                if (!val) handleSubtotalDiscountChange(0, subtotalDiscountType);
                            }}
                            className="rounded border-gray-300 text-[#8EBF45] focus:ring-[#8EBF45]"
                        />
                        <span>Subtotal Discount (Overall Discount)</span>
                    </label>
                    {showSubtotalDiscount && (
                        <div className="ml-5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-700">Discount Type</span>
                                <div className="flex rounded border border-slate-200 text-xs overflow-hidden shadow-2xs">
                                    <button
                                        type="button"
                                        onClick={() => handleSubtotalDiscountChange(subtotalDiscountValue, 'amount')}
                                        className={`px-2 py-0.5 font-bold transition-colors ${subtotalDiscountType === 'amount' ? 'bg-[#0D0D0D] text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        Flat ({currencySymbol})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSubtotalDiscountChange(subtotalDiscountValue, 'percent')}
                                        className={`px-2 py-0.5 font-bold transition-colors ${subtotalDiscountType === 'percent' ? 'bg-[#0D0D0D] text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        Percent (%)
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder={subtotalDiscountType === 'percent' ? 'e.g. 5%' : '0.00'}
                                    className="w-full text-xs p-1.5 border rounded bg-white outline-none focus:border-[#658C3E] font-medium"
                                    value={subtotalDiscountValue || ''}
                                    onChange={e => handleSubtotalDiscountChange(parseFloat(e.target.value) || 0, subtotalDiscountType)}
                                />
                                {subtotalDiscountValue > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => handleSubtotalDiscountChange(0, subtotalDiscountType)}
                                        className="text-slate-400 hover:text-red-500 p-1"
                                        title="Clear discount"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer select-none p-1 rounded hover:bg-slate-50 transition-colors">
                        <span className="flex items-center gap-1.5 font-medium">
                            <span>⚡</span> Lithium vs Lead-Acid Table
                            {(docType === 'quotation' || docType === 'proforma') && (
                                <span className="text-[10px] bg-[#8EBF45]/20 text-[#5f8725] px-1.5 py-0.2 rounded font-semibold">Recommended</span>
                            )}
                        </span>
                        <input
                            type="checkbox"
                            checked={showBatteryComparisonTable}
                            onChange={e => {
                                const val = e.target.checked;
                                setShowBatteryComparisonTable(val);
                                setConfig(prev => ({ ...prev, showBatteryComparisonTable: val }));
                            }}
                            className="rounded border-gray-300 text-[#8EBF45] focus:ring-[#8EBF45]"
                        />
                    </label>
                </div>

                <div className="space-y-6">
                    {/* Issuer */}
                    <div className="bg-slate-50 p-3 rounded border">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-sm font-bold text-slate-700">From (Issuer)</h3>
                            <SearchableSupplierDropdown
                                compact={true}
                                value=""
                                placeholder="Load Profile..."
                                companyProfiles={companyProfiles}
                                onChange={(selectedName) => {
                                    if (selectedName) handleDropdownChange('issuer', selectedName);
                                }}
                                onAddNewCompany={() => {
                                    setLastSelectedType('issuer');
                                    setIsAddCompanyModalOpen(true);
                                }}
                            />
                        </div>
                        <input className="w-full text-sm p-2 border rounded mb-2" placeholder="Company Name" value={doc.issuer_details.name || ''} onChange={e => updateParty('issuer', 'name', e.target.value)} />
                        <textarea className="w-full text-sm p-2 border rounded" placeholder="Address" rows={2} value={doc.issuer_details.address || ''} onChange={e => updateParty('issuer', 'address', e.target.value)} />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <input className="w-full text-sm p-2 border rounded" placeholder="GSTIN" value={doc.issuer_details.gstin || ''} onChange={e => updateParty('issuer', 'gstin', e.target.value)} />
                            <input className="w-full text-sm p-2 border rounded" placeholder="PAN" value={doc.issuer_details.pan || ''} onChange={e => updateParty('issuer', 'pan', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <input className="w-full text-sm p-2 border rounded" placeholder="Email" value={doc.issuer_details.email || ''} onChange={e => updateParty('issuer', 'email', e.target.value)} />
                            <input className="w-full text-sm p-2 border rounded" placeholder="Phone" value={doc.issuer_details.phone || ''} onChange={e => updateParty('issuer', 'phone', e.target.value)} />
                        </div>
                        <div className="mt-4 pt-2 border-t border-slate-200">
                            <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Wallet size={12} /> Bank Details</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <input className="w-full text-xs p-2 border rounded" placeholder="Bank Name" value={doc.issuer_details.bank_details?.bank_name || ''} onChange={e => updateBankDetails('bank_name', e.target.value)} />
                                <input className="w-full text-xs p-2 border rounded" placeholder="A/c Holder Name" value={doc.issuer_details.bank_details?.account_name || ''} onChange={e => updateBankDetails('account_name', e.target.value)} />
                                <input className="w-full text-xs p-2 border rounded" placeholder="Account No" value={doc.issuer_details.bank_details?.account_number || ''} onChange={e => updateBankDetails('account_number', e.target.value)} />
                                <input className="w-full text-xs p-2 border rounded" placeholder="IFSC Code" value={doc.issuer_details.bank_details?.ifsc || ''} onChange={e => updateBankDetails('ifsc', e.target.value)} />
                                <input className="w-full text-xs p-2 border rounded" placeholder="Branch" value={doc.issuer_details.bank_details?.branch || ''} onChange={e => updateBankDetails('branch', e.target.value)} />
                                <input className="w-full text-xs p-2 border rounded col-span-2" placeholder="UPI ID (for QR payment)" value={doc.issuer_details.bank_details?.upi_id || ''} onChange={e => updateBankDetails('upi_id', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    {/* Supplier Details (Only for PO) */}
                    {docType === 'po' && (
                        <div className="bg-orange-50/50 p-3 rounded border mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-bold text-slate-700">Supplier Details</h3>
                                <SearchableSupplierDropdown
                                    compact={true}
                                    value=""
                                    placeholder="Load Profile..."
                                    companyProfiles={companyProfiles}
                                    onChange={(selectedName) => {
                                        if (selectedName) handleDropdownChange('supplier', selectedName);
                                    }}
                                    onAddNewCompany={() => {
                                        setLastSelectedType('supplier');
                                        setIsAddCompanyModalOpen(true);
                                    }}
                                />
                            </div>
                            <input className="w-full text-sm p-2 border rounded mb-2" placeholder="Supplier Name" value={doc.supplier_details?.name || ''} onChange={e => updateParty('supplier', 'name', e.target.value)} />
                            <textarea className="w-full text-sm p-2 border rounded" placeholder="Address" rows={2} value={doc.supplier_details?.address || ''} onChange={e => updateParty('supplier', 'address', e.target.value)} />
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <input className="w-full text-sm p-2 border rounded" placeholder="GSTIN" value={doc.supplier_details?.gstin || ''} onChange={e => updateParty('supplier', 'gstin', e.target.value)} />
                                <input className="w-full text-sm p-2 border rounded" placeholder="PAN" value={doc.supplier_details?.pan || ''} onChange={e => updateParty('supplier', 'pan', e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <input className="w-full text-sm p-2 border rounded" placeholder="Email" value={doc.supplier_details?.email || ''} onChange={e => updateParty('supplier', 'email', e.target.value)} />
                                <input className="w-full text-sm p-2 border rounded" placeholder="Phone" value={doc.supplier_details?.phone || ''} onChange={e => updateParty('supplier', 'phone', e.target.value)} />
                            </div>
                        </div>
                    )}

                    {/* Receiver (Billed To) */}
                    <div className="bg-slate-50 p-3 rounded border">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-sm font-bold text-slate-700">Billed To (Receiver)</h3>
                            <SearchableSupplierDropdown
                                compact={true}
                                value=""
                                placeholder="Load Profile..."
                                companyProfiles={companyProfiles}
                                onChange={(selectedName) => {
                                    if (selectedName) handleDropdownChange('receiver', selectedName);
                                }}
                                onAddNewCompany={() => {
                                    setLastSelectedType('receiver');
                                    setIsAddCompanyModalOpen(true);
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-slate-400">Label:</span>
                            <input className="text-xs p-1 border rounded flex-1" value={billedToLabel} onChange={e => setBilledToLabel(e.target.value)} />
                        </div>
                        <input className="w-full text-sm p-2 border rounded mb-2" placeholder="Client Name" value={doc.receiver_details.name || ''} onChange={e => updateParty('receiver', 'name', e.target.value)} />
                        <textarea className="w-full text-sm p-2 border rounded" placeholder="Address" rows={2} value={doc.receiver_details.address || ''} onChange={e => updateParty('receiver', 'address', e.target.value)} />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <input className="w-full text-sm p-2 border rounded" placeholder="GSTIN" value={doc.receiver_details.gstin || ''} onChange={e => updateParty('receiver', 'gstin', e.target.value)} />
                            <input className="w-full text-sm p-2 border rounded" placeholder="PAN" value={doc.receiver_details.pan || ''} onChange={e => updateParty('receiver', 'pan', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <input className="w-full text-sm p-2 border rounded" placeholder="Email" value={doc.receiver_details.email || ''} onChange={e => updateParty('receiver', 'email', e.target.value)} />
                            <input className="w-full text-sm p-2 border rounded" placeholder="Phone" value={doc.receiver_details.phone || ''} onChange={e => updateParty('receiver', 'phone', e.target.value)} />
                        </div>
                    </div>

                    {/* Shipped To */}
                    <div className="bg-blue-50/50 p-3 rounded border">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-sm font-bold text-slate-700">Shipped To</h3>
                            <button onClick={copyReceiverToShipped} className="text-[10px] bg-white border rounded px-2 py-0.5 text-slate-500 hover:text-[#658C3E] hover:border-[#8EBF45]">Copy from Billed To</button>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-slate-400">Label:</span>
                            <input className="text-xs p-1 border rounded flex-1" value={shippedToLabel} onChange={e => setShippedToLabel(e.target.value)} />
                        </div>
                        <input className="w-full text-sm p-2 border rounded mb-2" placeholder="Name" value={doc.shipped_to_details?.name || ''} onChange={e => updateShippedTo('name', e.target.value)} />
                        <textarea className="w-full text-sm p-2 border rounded" placeholder="Address" rows={2} value={doc.shipped_to_details?.address || ''} onChange={e => updateShippedTo('address', e.target.value)} />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <input className="w-full text-sm p-2 border rounded" placeholder="GSTIN" value={doc.shipped_to_details?.gstin || ''} onChange={e => updateShippedTo('gstin', e.target.value)} />
                            <input className="w-full text-sm p-2 border rounded" placeholder="Phone" value={doc.shipped_to_details?.phone || ''} onChange={e => updateShippedTo('phone', e.target.value)} />
                        </div>
                    </div>

                    {/* Tax Mode Selection */}
                    <div className="bg-slate-50 p-3 rounded border">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-sm font-bold text-slate-700">Tax Mode</h3>
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                                {doc.invoice_metadata.tax_mode ? 'Manual' : 'Auto'}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => handleTaxModeChange(doc.invoice_metadata.tax_mode === 'intra' ? undefined : 'intra')}
                                className={`p-2 text-xs border rounded font-bold transition-all ${doc.invoice_metadata.tax_mode === 'intra' ? 'bg-[#8EBF45] text-[#0D0D0D] border-[#8EBF45]' : getTaxMode(doc.issuer_details.gstin, doc.receiver_details.gstin) === 'intra' && !doc.invoice_metadata.tax_mode ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                            >
                                CGST + SGST (Intra)
                            </button>
                            <button
                                onClick={() => handleTaxModeChange(doc.invoice_metadata.tax_mode === 'inter' ? undefined : 'inter')}
                                className={`p-2 text-xs border rounded font-bold transition-all ${doc.invoice_metadata.tax_mode === 'inter' ? 'bg-[#8EBF45] text-[#0D0D0D] border-[#8EBF45]' : getTaxMode(doc.issuer_details.gstin, doc.receiver_details.gstin) === 'inter' && !doc.invoice_metadata.tax_mode ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                            >
                                IGST (Inter)
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                            Select manually to override GSTIN-based detection. Click selected again to revert to Auto.
                        </p>
                    </div>
                </div>

                {doc.invoice_metadata?.edit_history && doc.invoice_metadata.edit_history.length > 0 && (
                    <div className="mt-6 p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                        <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                            <History size={15} className="text-amber-600" /> Revision & Edit History ({doc.invoice_metadata.edit_history.length})
                        </h4>
                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                            {doc.invoice_metadata.edit_history.map((entry, idx) => (
                                <div key={idx} className="p-3 bg-white rounded-lg border border-amber-100 text-xs shadow-2xs space-y-1.5">
                                    <div className="flex justify-between items-center font-bold text-slate-800">
                                        <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-[11px] font-black">{entry.edited_by || 'User'}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">{entry.edited_at ? new Date(entry.edited_at).toLocaleString('en-IN') : ''}</span>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-700">{entry.summary || 'Document updated'}</p>
                                    {entry.changes && entry.changes.length > 0 && (
                                        <div className="mt-1 pt-1.5 border-t border-slate-100 space-y-1">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Detailed Changes:</span>
                                            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600 font-medium">
                                                {entry.changes.map((changeStr, cIdx) => (
                                                    <li key={cIdx} className="leading-snug">{changeStr}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {entry.previous_grand_total !== undefined && (!entry.changes || entry.changes.length === 0) && (
                                        <p className="text-[10px] text-slate-400 font-mono">Prev Total: ₹{Number(entry.previous_grand_total).toLocaleString('en-IN')}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-8 pt-6 border-t flex flex-col gap-3 mb-10">
                    {isEditingExistingRecord ? (
                        <div className="space-y-2">
                            {(currentUser?.role === 'admin' || currentUser?.role === 'billing') ? (
                                <button
                                    onClick={handleUpdateRecord}
                                    disabled={isSaving}
                                    className={`w-full ${isSaving ? 'bg-amber-400' : 'bg-amber-500 hover:bg-amber-600 text-white'} py-2.5 rounded-lg shadow-md flex items-center justify-center gap-2 text-sm font-black uppercase tracking-wide transition-all`}
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                                    {isSaving ? "Updating Record..." : "Update Existing Record"}
                                </button>
                            ) : (
                                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-center text-xs font-semibold text-amber-800 flex items-center justify-center gap-1.5">
                                    <span>🔒</span>
                                    <span>Update existing record is restricted to Director Admins & Billing Team</span>
                                </div>
                            )}

                            <button
                                onClick={handleSaveRecord}
                                disabled={isSaving}
                                className={`w-full ${isSaving ? 'bg-slate-300' : 'bg-slate-700 hover:bg-slate-800 text-white'} py-2 rounded shadow flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide transition-all`}
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                                Save as New Copy
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleSaveRecord}
                            disabled={isSaving}
                            className={`w-full ${isSaving ? 'bg-slate-400' : 'bg-[#8EBF45] hover:bg-[#658C3E] text-[#0D0D0D] hover:text-white'} py-2 rounded shadow flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide`}
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                            {isSaving ? "Checking for duplicates..." : "Save Draft"}
                        </button>
                    )}
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="flex-1 bg-[#0D0D0D] text-white py-2 rounded shadow hover:bg-[#404040] flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide"><Printer size={16} /> Print</button>
                        <button onClick={handlePrint} className="flex-1 bg-[#8EBF45] text-[#0D0D0D] py-2 rounded shadow hover:bg-[#658C3E] hover:text-white flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide"><Download size={16} /> PDF</button>
                    </div>
                    {!initialData?.id && (
                        <button onClick={() => { if(confirm('Are you sure you want to clear your current draft?')) { try { localStorage.removeItem('invoice_maker_draft'); window.location.reload(); } catch(e){} } }} className="w-full text-xs text-red-500 hover:text-red-600 mt-2 font-bold underline underline-offset-2">
                            Clear Draft & Start Fresh
                        </button>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 font-semibold">Copies:</span>
                        <button
                            onClick={() => setPrintMode('single')}
                            className={`text-xs px-3 py-1 rounded-full border transition-all ${printMode === 'single' ? 'bg-[#8EBF45]/20 text-[#658C3E] border-[#8EBF45] font-bold' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                        >
                            Single Copy
                        </button>
                        <button
                            onClick={() => setPrintMode('dual')}
                            className={`text-xs px-3 py-1 rounded-full border transition-all ${printMode === 'dual' ? 'bg-[#8EBF45]/20 text-[#658C3E] border-[#8EBF45] font-bold' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                        >
                            Dual (Original + Duplicate)
                        </button>
                    </div>
                </div>
            </div>

            {/* Preview Area */}
            <div className="w-full lg:w-2/3 bg-slate-200 overflow-y-auto p-8 h-full">
                <div id="print-area" className={`mx-auto bg-white shadow-2xl min-h-[29.7cm] w-[21cm] ${config.font}`}>
                    {/* === SCREEN EDITING VIEW === */}
                    <div className="screen-only p-8 relative flex flex-col min-h-[29.7cm]">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-4 border-b pb-4">
                            <div className="flex items-start gap-4 flex-1">
                                {logo ? <img src={logo} alt="Logo" className="w-auto object-contain" style={{ height: config.logoSize || 64 }} /> : <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center text-slate-300 text-xs">Logo</div>}
                                <div className="flex-1">
                                    <h2 className="font-bold text-xl uppercase tracking-wide text-slate-900 leading-none mb-1">{safeRender(doc.issuer_details.name)}</h2>
                                    <p className="text-xs text-slate-500 whitespace-pre-line max-w-sm leading-tight mb-1">{safeRender(doc.issuer_details.address)}</p>
                                    <div className="text-[10px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                        {doc.issuer_details.gstin && <span><strong>GSTIN:</strong> {doc.issuer_details.gstin}</span>}
                                        {doc.issuer_details.pan && <span><strong>PAN:</strong> {doc.issuer_details.pan}</span>}
                                        {doc.issuer_details.email && <span>{doc.issuer_details.email}</span>}
                                        {doc.issuer_details.phone && <span>Ph: {doc.issuer_details.phone}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <h1 className="text-3xl font-light tracking-tight mb-1 uppercase" style={{ color: config.color }}>{customTitle}</h1>
                                <div className="text-sm text-slate-600 space-y-2">
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="font-semibold text-sm">No:</span>
                                        <div className="relative group">
                                            <input className="text-right border-b border-transparent hover:border-slate-300 focus:border-[#8EBF45] outline-none w-36 bg-transparent text-sm font-mono" value={doc.invoice_metadata.invoice_number} onChange={(e) => setDoc(prev => ({ ...prev, invoice_metadata: { ...prev.invoice_metadata, invoice_number: e.target.value } }))} />
                                            <button onClick={() => generateInvoiceNumber()} className="absolute -right-6 top-0 opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-700 p-0.5" title="Auto-Generate FY Number"><RefreshCw size={12} /></button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-end gap-0.5">
                                        <span className="font-semibold text-sm">Date:</span>
                                        <input type="date" className="print-date-input text-right border-b border-transparent hover:border-slate-300 focus:border-[#8EBF45] outline-none w-28 bg-transparent text-sm" value={doc.invoice_metadata.invoice_date} onChange={(e) => setDoc(prev => ({ ...prev, invoice_metadata: { ...prev.invoice_metadata, invoice_date: e.target.value } }))} />
                                        <span className="print-date-text text-sm" style={{ display: 'none' }}>{doc.invoice_metadata.invoice_date ? new Date(doc.invoice_metadata.invoice_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                                    </div>
                                </div>
                                {/* Debit/Credit Note Reference */}
                                {doc.invoice_metadata.note_type && (
                                    <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-200 text-[10px] text-slate-500 space-y-0.5">
                                        <div className="font-bold uppercase" style={{ color: config.color }}>
                                            {doc.invoice_metadata.note_type === 'debit' ? 'Debit Note' : 'Credit Note'}
                                        </div>
                                        {doc.invoice_metadata.related_invoice_number && (
                                            <div>Against Inv. No: <strong>{doc.invoice_metadata.related_invoice_number}</strong>
                                                {doc.invoice_metadata.related_invoice_date && (
                                                    <span> dt. {formatPrintDate(doc.invoice_metadata.related_invoice_date)}</span>
                                                )}
                                            </div>
                                        )}
                                        {doc.invoice_metadata.note_reason && (
                                            <div>Reason: {doc.invoice_metadata.note_reason}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Supplier Details (Only for PO) */}
                        {docType === 'po' && doc.supplier_details?.name && (
                            <div className="mb-4">
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Supplier Details</h3>
                                <h3 className="font-bold text-sm text-slate-900 leading-tight">{safeRender(doc.supplier_details.name)}</h3>
                                <p className="text-xs text-slate-600 whitespace-pre-line mb-1 leading-tight">{safeRender(doc.supplier_details.address)}</p>
                                <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                    {doc.supplier_details.gstin && <span><strong>GSTIN:</strong> {doc.supplier_details.gstin}</span>}
                                    {doc.supplier_details.pan && <span><strong>PAN:</strong> {doc.supplier_details.pan}</span>}
                                    {doc.supplier_details.email && <span>{doc.supplier_details.email}</span>}
                                    {doc.supplier_details.phone && <span>Ph: {doc.supplier_details.phone}</span>}
                                </div>
                            </div>
                        )}

                        <div className="mb-4 flex gap-6">
                            {/* Billed To */}
                            <div className="flex-1">
                                <input className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 bg-transparent border-none outline-none w-full p-0" value={billedToLabel} onChange={e => setBilledToLabel(e.target.value)} />
                                <h3 className="font-bold text-sm text-slate-900 leading-tight">{safeRender(doc.receiver_details.name) || 'Client Name'}</h3>
                                <p className="text-xs text-slate-600 whitespace-pre-line mb-1 leading-tight">{safeRender(doc.receiver_details.address)}</p>
                                <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                    {doc.receiver_details.gstin && <span><strong>GSTIN:</strong> {doc.receiver_details.gstin}</span>}
                                    {doc.receiver_details.pan && <span><strong>PAN:</strong> {doc.receiver_details.pan}</span>}
                                    {doc.receiver_details.email && <span>{doc.receiver_details.email}</span>}
                                    {doc.receiver_details.phone && <span>Ph: {doc.receiver_details.phone}</span>}
                                </div>
                            </div>
                            {/* Shipped To */}
                            <div className="flex-1">
                                <input className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 bg-transparent border-none outline-none w-full p-0" value={shippedToLabel} onChange={e => setShippedToLabel(e.target.value)} />
                                <h3 className="font-bold text-sm text-slate-900 leading-tight">{safeRender(doc.shipped_to_details?.name) || safeRender(doc.receiver_details.name) || 'Client Name'}</h3>
                                <p className="text-xs text-slate-600 whitespace-pre-line mb-1 leading-tight">{safeRender(doc.shipped_to_details?.address) || safeRender(doc.receiver_details.address)}</p>
                                <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                    {(doc.shipped_to_details?.gstin || doc.receiver_details.gstin) && <span><strong>GSTIN:</strong> {doc.shipped_to_details?.gstin || doc.receiver_details.gstin}</span>}
                                    {(doc.shipped_to_details?.phone || doc.receiver_details.phone) && <span>Ph: {doc.shipped_to_details?.phone || doc.receiver_details.phone}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap justify-between items-center mb-2 no-print gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={() => setShowColumnMenu(!showColumnMenu)} className="text-xs bg-slate-100 px-3 py-1 rounded-full text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center gap-1"><Columns size={12} /> Columns</button>
                                {showColumnMenu && (
                                    <div className="absolute top-64 left-16 bg-white shadow-xl border rounded p-3 w-48 z-20 grid grid-cols-2 gap-2">
                                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={visibleColumns.index} onChange={e => setVisibleColumns({ ...visibleColumns, index: e.target.checked })} /> No #</label>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={visibleColumns.description} onChange={e => setVisibleColumns({ ...visibleColumns, description: e.target.checked })} /> Desc</label>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={(visibleColumns as any).image} onChange={e => setVisibleColumns({ ...visibleColumns, image: e.target.checked })} /> Photo</label>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={visibleColumns.hsn} onChange={e => setVisibleColumns({ ...visibleColumns, hsn: e.target.checked })} /> HSN</label>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={visibleColumns.quantity} onChange={e => setVisibleColumns({ ...visibleColumns, quantity: e.target.checked })} /> Qty</label>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={visibleColumns.rate} onChange={e => setVisibleColumns({ ...visibleColumns, rate: e.target.checked })} /> Rate</label>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={visibleColumns.discount} onChange={e => setVisibleColumns({ ...visibleColumns, discount: e.target.checked })} /> Discount</label>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={visibleColumns.taxableValue} onChange={e => setVisibleColumns({ ...visibleColumns, taxableValue: e.target.checked })} /> Taxable</label>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={visibleColumns.total} onChange={e => setVisibleColumns({ ...visibleColumns, total: e.target.checked })} /> Total</label>
                                    </div>
                                )}
                                <input type="file" ref={itemFileInputRef} className="hidden" accept=".csv,text/csv" onChange={handleItemImport} />
                            </div>
                            <button onClick={addItem} className="text-xs text-[#658C3E] flex items-center gap-1 font-semibold hover:underline"><Plus size={12} /> Add Line</button>
                        </div>

                        {/* UNIFORM CSV CONTROL BAR */}
                        <div className="mb-4 bg-slate-900 text-slate-100 rounded-2xl p-4 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md no-print">
                            <div className="flex items-start gap-3">
                                <span className="text-xl">📄</span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Required CSV Headers:</span>
                                    </div>
                                    <p className="text-[11px] font-mono text-slate-300 mt-1 leading-relaxed flex flex-wrap gap-1.5 items-center">
                                        <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Description</span>
                                        <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">HSN/SAC</span>
                                        <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Quantity</span>
                                        <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Unit Price</span>
                                        <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Discount</span>
                                        <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Tax Rate %</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2.5 self-end md:self-auto shrink-0">
                                <button
                                    onClick={downloadItemCSVTemplate}
                                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                                    title="Download sample CSV template for invoice items"
                                >
                                    <Download size={14} />
                                    <span>Download Template CSV</span>
                                </button>

                                <button
                                    onClick={() => itemFileInputRef.current?.click()}
                                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-2xs whitespace-nowrap flex items-center gap-1.5"
                                    title="Import line items from CSV file"
                                >
                                    <ImportIcon size={14} />
                                    <span>Import CSV</span>
                                </button>
                            </div>
                        </div>

                        <div className="mb-4">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead>
                                    <tr className="border-b-2" style={{ borderColor: config.color }}>
                                        {visibleColumns.index && <th className="py-2 pl-2 w-8 text-slate-500 font-semibold">#</th>}
                                        {visibleColumns.description && <th className="py-2 text-slate-500 font-semibold uppercase tracking-wider">Description</th>}
                                        {(visibleColumns as any).image && <th className="py-2 text-center w-16 text-slate-500 font-semibold">Photo</th>}
                                        {visibleColumns.hsn && <th className="py-2 text-left w-24 text-slate-500 font-semibold">HSN/SAC</th>}
                                        {visibleColumns.quantity && <th className="py-2 text-right w-14 text-slate-500 font-semibold">Qty</th>}
                                        {visibleColumns.rate && <th className="py-2 text-right w-24 text-slate-500 font-semibold">Rate ({currencySymbol})</th>}
                                        {visibleColumns.discount && <th className="py-2 text-right w-24 text-slate-500 font-semibold">Discount ({currencySymbol})</th>}
                                        {visibleColumns.taxableValue && <th className="py-2 text-right w-24 text-slate-500 font-semibold">Taxable</th>}
                                        {visibleColumns.total && <th className="py-2 text-right w-28 text-slate-900 font-bold pr-2">Total ({currencySymbol})</th>}
                                        <th className="py-2 w-20 no-print"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(doc.items || []).map((item, idx) => (
                                        <tr key={idx} className="group">
                                            {visibleColumns.index && <td className="py-2 pl-2 text-slate-400">{idx + 1}</td>}
                                            {visibleColumns.description && <td className="py-2 relative align-top">
                                                <div className="flex flex-col">
                                                    <input 
                                                        className="w-full bg-transparent outline-none font-medium text-slate-800" 
                                                        value={safeRender(item.description)} 
                                                        onChange={e => handleDescriptionChange(idx, e.target.value)} 
                                                        onBlur={() => setTimeout(() => { setPriceDropdownIdx(null); setPriceSuggestions([]); }, 150)} 
                                                        onFocus={() => { if (safeRender(item.description).length >= 2 && priceList.length > 0) handleDescriptionChange(idx, safeRender(item.description)); }} 
                                                    />
                                                    <div className="no-print mt-1">
                                                        <button 
                                                            onClick={() => { setSerialSearchIdx(serialSearchIdx === idx ? null : idx); setSerialSearchTerm(''); }} 
                                                            className="text-[10px] text-blue-600 font-semibold uppercase hover:underline flex items-center"
                                                        >
                                                            + Add Serial
                                                        </button>
                                                        {serialSearchIdx === idx && (
                                                            <div className="mt-1 relative">
                                                                <input 
                                                                    autoFocus 
                                                                    className="w-full border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-[#8EBF45] shadow-sm" 
                                                                    placeholder="Search S/N..." 
                                                                    value={serialSearchTerm} 
                                                                    onChange={e => setSerialSearchTerm(e.target.value)} 
                                                                />
                                                                {serialSearchTerm.length > 0 && (
                                                                    <div className="absolute left-0 top-full mt-1 w-[350px] bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                                                                        {allAvailableSerials
                                                                            .filter(s => s.id.toLowerCase().includes(serialSearchTerm.toLowerCase()) || s.name.toLowerCase().includes(serialSearchTerm.toLowerCase()))
                                                                            .slice(0, 15)
                                                                            .map(s => (
                                                                                <div key={s.id} className="px-3 py-2 hover:bg-[#8EBF45]/10 cursor-pointer text-xs border-b border-slate-50 last:border-0 transition-colors" onClick={() => handleAddSerial(idx, s.id)}>
                                                                                    <div className="font-mono text-slate-800 font-bold">{s.id}</div>
                                                                                    <div className="text-slate-500 font-medium truncate">{s.name} {s.details && <span className="text-slate-400 bg-slate-100 px-1 rounded ml-1">{s.details}</span>}</div>
                                                                                </div>
                                                                            ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {priceDropdownIdx === idx && priceSuggestions.length > 0 && (
                                                    <div className="absolute left-0 top-full z-50 w-80 bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto no-print" style={{ animation: 'fadeIn 0.1s ease-out' }}>
                                                        {priceSuggestions.map(p => (
                                                            <button
                                                                key={p.id}
                                                                onMouseDown={(e) => { e.preventDefault(); handlePriceSelect(idx, p); }}
                                                                className="w-full text-left px-3 py-2 hover:bg-[#8EBF45]/10 flex justify-between items-center text-sm border-b border-slate-50 last:border-0 transition-colors"
                                                            >
                                                                <span className="font-medium text-slate-800 truncate mr-2">{p.model_name}</span>
                                                                <span className="flex items-center gap-2">
                                                                    {p.hsn_code && <span className="text-[10px] text-slate-400 font-mono">HSN: {p.hsn_code}</span>}
                                                                    <span className="text-xs font-mono text-slate-500 whitespace-nowrap">{currencySymbol}{p.price_without_gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>}
                                            {(visibleColumns as any).image && <td className="py-2 text-center align-top">
                                                <div className="flex flex-col items-center gap-1">
                                                    {item.image_url && <img src={item.image_url} alt="" className="w-12 h-12 object-contain rounded border border-slate-200" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                                                    <input className="w-full bg-transparent outline-none text-[10px] text-blue-600 no-print" value={item.image_url || ''} onChange={e => updateItem(idx, 'image_url', e.target.value)} placeholder="Paste image URL" />
                                                </div>
                                            </td>}
                                            {visibleColumns.hsn && <td className="py-2"><input className="w-full bg-transparent outline-none text-slate-600 text-xs" value={item.hsn_sac || ''} onChange={e => updateItem(idx, 'hsn_sac', e.target.value)} placeholder="—" /></td>}
                                            {visibleColumns.quantity && <td className="py-2 text-right"><input type="number" step="any" className="w-full bg-transparent outline-none text-right" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>}
                                            {visibleColumns.rate && (
                                                <td className="py-2 text-right">
                                                    <input 
                                                        type="number" 
                                                        step="0.01" 
                                                        className="w-full bg-transparent outline-none text-right font-medium text-slate-800" 
                                                        value={item.unit_price !== undefined && item.unit_price !== null ? item.unit_price : ''} 
                                                        onChange={e => updateItem(idx, 'unit_price', e.target.value)} 
                                                        onBlur={e => {
                                                            const val = parseFloat(e.target.value);
                                                            if (!isNaN(val)) updateItem(idx, 'unit_price', Math.round(val * 100) / 100);
                                                        }}
                                                        placeholder="0.00" 
                                                        title="Rate per unit (Excl. GST)" 
                                                    />
                                                </td>
                                            )}
                                            {visibleColumns.discount && (
                                                <td className="py-2 text-right">
                                                    <input 
                                                        type="number" 
                                                        step="0.01" 
                                                        className="w-full bg-transparent outline-none text-right" 
                                                        value={item.discount !== undefined && item.discount !== null ? item.discount : ''} 
                                                        onChange={e => updateItem(idx, 'discount', e.target.value)} 
                                                        onBlur={e => {
                                                            const val = parseFloat(e.target.value);
                                                            if (!isNaN(val)) updateItem(idx, 'discount', Math.round(val * 100) / 100);
                                                        }}
                                                        placeholder="0.00" 
                                                    />
                                                </td>
                                            )}
                                            {visibleColumns.taxableValue && <td className="py-2 text-right text-slate-600">{(item.taxable_value || 0).toFixed(2)}</td>}
                                            {visibleColumns.total && (
                                                <td className="py-2 text-right font-semibold pr-2">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-full bg-transparent outline-none text-right font-semibold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-[#8EBF45]"
                                                        value={item.total_value !== undefined && item.total_value !== null ? item.total_value : ''}
                                                        onChange={e => updateItem(idx, 'total_value', e.target.value)}
                                                        onBlur={e => {
                                                            const val = parseFloat(e.target.value);
                                                            if (!isNaN(val)) updateItem(idx, 'total_value', Math.round(val * 100) / 100);
                                                        }}
                                                        placeholder="0.00"
                                                        title="Total Amount (Incl. GST) - edit to back-calculate unit rate"
                                                    />
                                                </td>
                                            )}
                                            <td className="py-2 text-center no-print w-20">
                                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-blue-600 disabled:opacity-30"><ChevronUp size={14} /></button>
                                                    <button onClick={() => moveItem(idx, 1)} disabled={idx === doc.items.length - 1} className="text-gray-400 hover:text-blue-600 disabled:opacity-30"><ChevronDown size={14} /></button>
                                                    <button onClick={() => deleteItem(idx)} className="text-red-300 hover:text-red-500"><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Grouped Tax Breakdown Table (Editable Rate per group) */}
                        {(config.showTaxTable ?? true) && doc.items.length > 0 && (() => {
                            const taxMode = getTaxMode(doc.issuer_details.gstin, doc.receiver_details.gstin, doc.invoice_metadata.tax_mode);
                            const taxGroups: { [key: string]: { key: string; hsn: string; taxableValue: number; rate: number; cgst: number; sgst: number; igst: number; totalTax: number } } = {};
                            doc.items.forEach(item => {
                                const rate = Number(item.igst_rate || 0);
                                const key = `${rate}-${item.hsn_sac || ''}`;
                                if (!taxGroups[key]) taxGroups[key] = { key, hsn: item.hsn_sac || '-', taxableValue: 0, rate, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
                                taxGroups[key].taxableValue += item.taxable_value || 0;
                                taxGroups[key].cgst += item.cgst_amount || 0;
                                taxGroups[key].sgst += item.sgst_amount || 0;
                                taxGroups[key].igst += item.igst_amount || 0;
                                taxGroups[key].totalTax += (item.cgst_amount || 0) + (item.sgst_amount || 0) + (item.igst_amount || 0);
                            });
                            const groups = Object.values(taxGroups);
                            return (
                                <div className="mb-4">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tax Breakdown {taxMode === 'intra' ? '(Intra-State: CGST + SGST)' : '(Inter-State: IGST)'}</p>
                                    <table className="w-full text-sm border-collapse border border-slate-200">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200">
                                                <th className="py-1.5 px-2 text-left text-slate-500 font-semibold">HSN/SAC</th>
                                                <th className="py-1.5 px-2 text-right text-slate-500 font-semibold">Taxable Value</th>
                                                <th className="py-1.5 px-2 text-center text-slate-500 font-semibold w-20">Rate %</th>
                                                {taxMode === 'intra' ? (
                                                    <>
                                                        <th className="py-1.5 px-2 text-right text-slate-500 font-semibold">CGST</th>
                                                        <th className="py-1.5 px-2 text-right text-slate-500 font-semibold">SGST</th>
                                                    </>
                                                ) : (
                                                    <th className="py-1.5 px-2 text-right text-slate-500 font-semibold">IGST</th>
                                                )}
                                                <th className="py-1.5 px-2 text-right text-slate-500 font-bold">Total Tax</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {groups.map((g, i) => (
                                                <tr key={i}>
                                                    <td className="py-1.5 px-2 text-slate-600">{g.hsn}</td>
                                                    <td className="py-1.5 px-2 text-right">{g.taxableValue.toFixed(2)}</td>
                                                    <td className="py-1.5 px-1 text-center">
                                                        <input
                                                            className="w-full bg-transparent outline-none text-sm text-center border-b border-transparent hover:border-slate-300 focus:border-[#8EBF45] font-medium px-1"
                                                            type="number"
                                                            min="0"
                                                            step="0.5"
                                                            value={g.rate}
                                                            onChange={e => updateGroupTaxRate(g.key, Number(e.target.value))}
                                                        />
                                                    </td>
                                                    {taxMode === 'intra' ? (
                                                        <>
                                                            <td className="py-1.5 px-2 text-right">{g.cgst.toFixed(2)}</td>
                                                            <td className="py-1.5 px-2 text-right">{g.sgst.toFixed(2)}</td>
                                                        </>
                                                    ) : (
                                                        <td className="py-1.5 px-2 text-right">{g.igst.toFixed(2)}</td>
                                                    )}
                                                    <td className="py-1.5 px-2 text-right font-semibold">{g.totalTax.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-slate-300 font-bold">
                                                <td className="py-1.5 px-2">Total</td>
                                                <td className="py-1.5 px-2 text-right">{(doc.totals.subtotal_taxable || 0).toFixed(2)}</td>
                                                <td className="py-1.5 px-2"></td>
                                                {taxMode === 'intra' ? (
                                                    <>
                                                        <td className="py-1.5 px-2 text-right">{(doc.totals.cgst_total || 0).toFixed(2)}</td>
                                                        <td className="py-1.5 px-2 text-right">{(doc.totals.sgst_total || 0).toFixed(2)}</td>
                                                    </>
                                                ) : (
                                                    <td className="py-1.5 px-2 text-right">{(doc.totals.igst_total || 0).toFixed(2)}</td>
                                                )}
                                                <td className="py-1.5 px-2 text-right" style={{ color: config.color }}>{((doc.totals.cgst_total || 0) + (doc.totals.sgst_total || 0) + (doc.totals.igst_total || 0)).toFixed(2)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            );
                        })()}

                        <div className="flex flex-col border-t pt-2 mt-2">
                                {(config.showTotalsTable ?? true) && (
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Amount in Words</p>
                                            <textarea className="w-full text-xs font-bold text-slate-700 bg-transparent border-none focus:ring-0 outline-none resize-none overflow-hidden p-0" rows={2} value={amountInWordsStr} onChange={(e) => setAmountInWordsStr(e.target.value)} />
                                        </div>
                                        <div className="w-48">
                                            <div className="flex justify-between text-xs font-bold text-slate-900 mb-0.5"><span>Subtotal</span><span>{(doc.totals.subtotal_taxable || 0).toFixed(2)}</span></div>
                                            {showSubtotalDiscount ? (
                                                <div className="flex justify-between items-center text-xs text-slate-600 mb-0.5 group">
                                                    <div className="flex items-center gap-1">
                                                        <span>Discount</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSubtotalDiscountChange(subtotalDiscountValue, subtotalDiscountType === 'percent' ? 'amount' : 'percent')}
                                                            className="text-[10px] px-1 py-0.2 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 font-bold"
                                                            title="Toggle between Flat (₹) and Percentage (%)"
                                                        >
                                                            {subtotalDiscountType === 'percent' ? '%' : currencySymbol}
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-red-500 font-medium">-</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            className="w-16 text-right text-xs bg-slate-50 hover:bg-slate-100 focus:bg-white border border-dashed border-slate-300 rounded px-1 py-0.5 text-red-600 font-semibold focus:outline-none focus:border-[#8EBF45]"
                                                            value={subtotalDiscountValue || ''}
                                                            placeholder="0.00"
                                                            onChange={(e) => handleSubtotalDiscountChange(parseFloat(e.target.value) || 0, subtotalDiscountType)}
                                                            onBlur={(e) => {
                                                                const val = parseFloat(e.target.value);
                                                                if (!isNaN(val)) handleSubtotalDiscountChange(Math.round(val * 100) / 100, subtotalDiscountType);
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end mb-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowSubtotalDiscount(true);
                                                            setConfig(prev => ({ ...prev, showSubtotalDiscount: true }));
                                                        }}
                                                        className="text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center"
                                                    >
                                                        + Add Subtotal Discount
                                                    </button>
                                                </div>
                                            )}
                                            {subtotalDiscountType === 'percent' && (doc.totals.subtotal_discount || 0) > 0 && showSubtotalDiscount && (
                                                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                                                    <span>({subtotalDiscountValue}% of subtotal)</span>
                                                    <span>-{(doc.totals.subtotal_discount || 0).toFixed(2)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-xs text-slate-600 mb-0.5"><span>Tax</span><span>{((doc.totals.cgst_total || 0) + (doc.totals.sgst_total || 0) + (doc.totals.igst_total || 0)).toFixed(2)}</span></div>
                                            {(doc.totals.rounding_adjustment || 0) !== 0 && <div className="flex justify-between text-xs text-slate-500 mb-0.5"><span>Rounding</span><span>{(doc.totals.rounding_adjustment || 0) > 0 ? '+' : ''}{(doc.totals.rounding_adjustment || 0).toFixed(2)}</span></div>}
                                            <div className="flex justify-between text-base font-bold border-t border-slate-300 pt-1 mt-1" style={{ color: config.color }}><span>Total</span><span>{currencySymbol} {(doc.totals.grand_total || 0).toFixed(2)}</span></div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-8 mt-4 pt-2 border-t border-slate-100">
                                    <div className="flex-[2] flex gap-5">
                                        {(config.showQRCode ?? true) && doc.issuer_details.bank_details?.upi_id && (
                                            <div className="flex-shrink-0 bg-white p-1 border rounded shadow-sm self-start">
                                                <QRCodeSVG 
                                                    value={`upi://pay?pa=${doc.issuer_details.bank_details.upi_id}&pn=${encodeURIComponent(doc.issuer_details.name || '')}&am=${doc.totals.grand_total}&cu=INR`}
                                                    size={64}
                                                    level="M"
                                                />
                                                <p className="text-[8px] text-center font-bold text-slate-400 mt-1 uppercase">Scan to Pay</p>
                                            </div>
                                        )}
                                        {doc.issuer_details.bank_details?.account_number && (
                                            <div className="flex-1">
                                                <h4 className="font-bold text-[10px] text-slate-500 uppercase mb-1">Bank Details</h4>
                                                <div className="text-[10px] text-slate-600 grid grid-cols-[auto_1fr] gap-x-2">
                                                    <span>Bank:</span><span className="font-medium">{doc.issuer_details.bank_details.bank_name}</span>
                                                    {doc.issuer_details.bank_details.account_name && <><span>Name:</span><span className="font-medium">{doc.issuer_details.bank_details.account_name}</span></>}
                                                    <span>A/c:</span><span className="font-medium">{doc.issuer_details.bank_details.account_number}</span>
                                                    <span>IFSC:</span><span className="font-medium">{doc.issuer_details.bank_details.ifsc}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-[10px] text-slate-500 uppercase mb-1">Terms</h4>
                                        <textarea className="w-full text-[10px] text-slate-600 whitespace-pre-line bg-transparent border-none focus:ring-0 outline-none resize-none overflow-hidden p-0" rows={3} value={config.terms} onChange={(e) => setConfig({ ...config, terms: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                        <div className="flex justify-between items-end mt-6 pt-4 break-inside-avoid relative">
                            {(config.showReceiverSign ?? true) && (
                                <div className="text-center">
                                    <p className="text-xs font-bold text-slate-600 mb-6">&nbsp;</p>
                                    <div className="h-px bg-slate-400 w-32 mb-1 mx-auto"></div>
                                    <p className="text-[10px] font-bold text-slate-600">Receiver's Signature</p>
                                </div>
                            )}
                            {stamp && (
                                <div className="absolute left-1/2 bottom-2 -translate-x-1/2 pointer-events-none">
                                    <img src={stamp} alt="Stamp" className="h-20 w-20 object-contain opacity-80" style={{ transform: 'rotate(-10deg)', mixBlendMode: 'multiply' }} />
                                </div>
                            )}
                            <div className="text-center relative ml-auto">
                                <p className="text-xs font-bold text-slate-800 mb-2">For {safeRender(doc.issuer_details.name)}</p>
                                {signature ? (
                                    <img src={signature} alt="Signature" className="h-12 w-auto mx-auto mb-1 object-contain" />
                                ) : (
                                    <div className="h-12"></div>
                                )}
                                <div className="h-px bg-slate-400 w-32 mb-1 mx-auto"></div>
                                <p className="text-[10px] font-bold text-slate-600">Issuer's Signature</p>
                            </div>
                        </div>

                        {/* Battery Comparison Table (Below Signatures and QR) */}
                        {showBatteryComparisonTable ? (
                            <div className="relative group/comp mt-3 mb-1 break-inside-avoid">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowBatteryComparisonTable(false);
                                        setConfig(prev => ({ ...prev, showBatteryComparisonTable: false }));
                                    }}
                                    className="absolute -top-2 right-2 hidden group-hover/comp:flex items-center gap-1 text-[10px] bg-red-50 hover:bg-red-100 text-red-600 px-2 py-0.5 rounded shadow-sm z-10"
                                    title="Hide comparison table"
                                >
                                    <Trash2 size={11} /> Hide Comparison
                                </button>
                                <BatteryComparisonTable printMode={false} />
                            </div>
                        ) : (
                            <div className="flex justify-start my-2 no-print">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowBatteryComparisonTable(true);
                                        setConfig(prev => ({ ...prev, showBatteryComparisonTable: true }));
                                    }}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-[#8EBF45] hover:text-[#7aa73b] bg-[#8EBF45]/10 hover:bg-[#8EBF45]/20 border border-[#8EBF45]/30 px-3 py-1.5 rounded-md transition-all shadow-sm"
                                >
                                    <span>⚡</span> + Add Lithium vs Lead-Acid Comparison Table
                                </button>
                            </div>
                        )}

                        <div className="mt-auto pt-2 text-center text-[10px] text-slate-400">{safeRender(config.footerText)}</div>
                    </div>{/* end screen-only */}

                    {/* === PRINT-ONLY PAGINATED VIEW === */}
                    <div className="print-only" style={{ display: 'none' }}>
                        {(printMode === 'single' ? [''] : ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER']).map((copyLabel, copyIdx) => (
                            <React.Fragment key={copyIdx}>
                                {paginatedPages.map((pageItems, pageIdx) => {
                                    const taxMode = getTaxMode(doc.issuer_details.gstin, doc.receiver_details.gstin, doc.invoice_metadata.tax_mode);
                                    return (
                                        <div className="invoice-page relative" key={`${copyIdx}-${pageIdx}`}>
                                            {copyLabel && <div className="absolute top-0 right-0 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{copyLabel}</div>}
                                            {/* ---- PAGE HEADER ---- */}
                                            <div className="flex justify-between items-start mt-4 mb-3 border-b pb-3">
                                        <div className="flex items-start gap-4 flex-1">
                                            {logo ? <img src={logo} alt="Logo" className="w-auto object-contain" style={{ height: config.logoSize || 64 }} /> : <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center text-slate-300 text-xs">Logo</div>}
                                            <div className="flex-1">
                                                <h2 className="font-bold text-xl uppercase tracking-wide text-slate-900 leading-none mb-1">{safeRender(doc.issuer_details.name)}</h2>
                                                <p className="text-xs text-slate-500 whitespace-pre-line max-w-sm leading-tight mb-1">{safeRender(doc.issuer_details.address)}</p>
                                                <div className="text-[10px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                                    {doc.issuer_details.gstin && <span><strong>GSTIN:</strong> {doc.issuer_details.gstin}</span>}
                                                    {doc.issuer_details.pan && <span><strong>PAN:</strong> {doc.issuer_details.pan}</span>}
                                                    {doc.issuer_details.email && <span>{doc.issuer_details.email}</span>}
                                                    {doc.issuer_details.phone && <span>Ph: {doc.issuer_details.phone}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <h1 className="text-3xl font-light tracking-tight mb-1 uppercase" style={{ color: config.color }}>{customTitle}</h1>
                                            <div className="text-sm text-slate-600 space-y-1">
                                                <div className="flex items-center justify-end gap-1"><span className="font-semibold">No:</span> <span className="font-mono">{doc.invoice_metadata.invoice_number}</span></div>
                                                <div className="flex items-center justify-end gap-1"><span className="font-semibold">Date:</span> <span>{formatPrintDate(doc.invoice_metadata.invoice_date)}</span></div>
                                                {paginatedPages.length > 1 && <div className="text-xs text-slate-400">Page {pageIdx + 1} of {paginatedPages.length}</div>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ---- SUPPLIER DETAILS (Only for PO) ---- */}
                                    {docType === 'po' && doc.supplier_details?.name && (
                                        <div className="mb-3">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Supplier Details</p>
                                            <h3 className="font-bold text-sm text-slate-900 leading-tight">{safeRender(doc.supplier_details.name)}</h3>
                                            <p className="text-xs text-slate-600 whitespace-pre-line mb-1 leading-tight">{safeRender(doc.supplier_details.address)}</p>
                                            <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                                {doc.supplier_details.gstin && <span><strong>GSTIN:</strong> {doc.supplier_details.gstin}</span>}
                                                {doc.supplier_details.pan && <span><strong>PAN:</strong> {doc.supplier_details.pan}</span>}
                                                {doc.supplier_details.email && <span>{doc.supplier_details.email}</span>}
                                                {doc.supplier_details.phone && <span>Ph: {doc.supplier_details.phone}</span>}
                                            </div>
                                        </div>
                                    )}

                                    {/* ---- RECEIVER (Billed + Shipped) ---- */}
                                    <div className="mb-3 flex gap-6">
                                        <div className="flex-1">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{billedToLabel}</p>
                                            <h3 className="font-bold text-sm text-slate-900 leading-tight">{safeRender(doc.receiver_details.name) || 'Client Name'}</h3>
                                            <p className="text-xs text-slate-600 whitespace-pre-line mb-1 leading-tight">{safeRender(doc.receiver_details.address)}</p>
                                            <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                                {doc.receiver_details.gstin && <span><strong>GSTIN:</strong> {doc.receiver_details.gstin}</span>}
                                                {doc.receiver_details.pan && <span><strong>PAN:</strong> {doc.receiver_details.pan}</span>}
                                                {doc.receiver_details.email && <span>{doc.receiver_details.email}</span>}
                                                {doc.receiver_details.phone && <span>Ph: {doc.receiver_details.phone}</span>}
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{shippedToLabel}</p>
                                            <h3 className="font-bold text-sm text-slate-900 leading-tight">{safeRender(doc.shipped_to_details?.name) || safeRender(doc.receiver_details.name) || 'Client Name'}</h3>
                                            <p className="text-xs text-slate-600 whitespace-pre-line mb-1 leading-tight">{safeRender(doc.shipped_to_details?.address) || safeRender(doc.receiver_details.address)}</p>
                                            <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                                                {(doc.shipped_to_details?.gstin || doc.receiver_details.gstin) && <span><strong>GSTIN:</strong> {doc.shipped_to_details?.gstin || doc.receiver_details.gstin}</span>}
                                                {(doc.shipped_to_details?.phone || doc.receiver_details.phone) && <span>Ph: {doc.shipped_to_details?.phone || doc.receiver_details.phone}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ---- ITEMS TABLE (this page's chunk) ---- */}
                                    <div className="mb-3">
                                        <table className="w-full text-left text-sm border-collapse">
                                            <thead>
                                                <tr className="border-b-2" style={{ borderColor: config.color }}>
                                                    {visibleColumns.index && <th className="py-1.5 pl-2 w-8 text-slate-500 font-semibold">#</th>}
                                                    {visibleColumns.description && <th className="py-1.5 text-slate-500 font-semibold uppercase tracking-wider">Description</th>}
                                                    {(visibleColumns as any).image && <th className="py-1.5 text-center w-14 text-slate-500 font-semibold">Photo</th>}
                                                    {visibleColumns.hsn && <th className="py-1.5 text-left w-20 text-slate-500 font-semibold">HSN/SAC</th>}
                                                    {visibleColumns.quantity && <th className="py-1.5 text-right w-14 text-slate-500 font-semibold">Qty</th>}
                                                    {visibleColumns.rate && <th className="py-1.5 text-right w-24 text-slate-500 font-semibold">Rate ({currencySymbol})</th>}
                                                    {visibleColumns.discount && <th className="py-1.5 text-right w-24 text-slate-500 font-semibold">Discount ({currencySymbol})</th>}
                                                    {visibleColumns.taxableValue && <th className="py-1.5 text-right w-24 text-slate-500 font-semibold">Taxable</th>}
                                                    {visibleColumns.total && <th className="py-1.5 text-right w-28 text-slate-900 font-bold pr-2">Total ({currencySymbol})</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {pageItems.map((item, idx) => {
                                                    const globalIdx = pageIdx * ITEMS_PER_PAGE + idx;
                                                    return (
                                                        <tr key={globalIdx}>
                                                            {visibleColumns.index && <td className="py-1.5 pl-2 text-slate-400">{globalIdx + 1}</td>}
                                                            {visibleColumns.description && <td className="py-1.5 font-medium text-slate-800">{safeRender(item.description)}</td>}
                                                            {(visibleColumns as any).image && <td className="py-1.5 text-center">{item.image_url && <img src={item.image_url} alt="" className="w-10 h-10 object-contain rounded inline-block" />}</td>}
                                                            {visibleColumns.hsn && <td className="py-1.5 text-slate-600 text-xs">{item.hsn_sac || '—'}</td>}
                                                            {visibleColumns.quantity && <td className="py-1.5 text-right">{item.quantity}</td>}
                                                            {visibleColumns.rate && <td className="py-1.5 text-right">{(Number(item.unit_price) || 0).toFixed(2)}</td>}
                                                            {visibleColumns.discount && <td className="py-1.5 text-right">{(Number(item.discount) || 0).toFixed(2)}</td>}
                                                            {visibleColumns.taxableValue && <td className="py-1.5 text-right text-slate-600">{(item.taxable_value || 0).toFixed(2)}</td>}
                                                            {visibleColumns.total && <td className="py-1.5 text-right font-semibold pr-2">{(item.total_value || 0).toFixed(2)}</td>}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* ---- TAX BREAKDOWN (Grouped) ---- */}
                                    {(config.showTaxTable ?? true) && doc.items.length > 0 && (() => {
                                        const taxGrps: { [k: string]: { hsn: string; taxableValue: number; rate: number; cgst: number; sgst: number; igst: number; totalTax: number } } = {};
                                        doc.items.forEach(item => {
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
                                                            <td className="py-1 px-2 text-right">{(doc.totals.subtotal_taxable || 0).toFixed(2)}</td>
                                                            <td className="py-1 px-2"></td>
                                                            {taxMode === 'intra' ? (<><td className="py-1 px-2 text-right">{(doc.totals.cgst_total || 0).toFixed(2)}</td><td className="py-1 px-2 text-right">{(doc.totals.sgst_total || 0).toFixed(2)}</td></>) : (<td className="py-1 px-2 text-right">{(doc.totals.igst_total || 0).toFixed(2)}</td>)}
                                                            <td className="py-1 px-2 text-right" style={{ color: config.color }}>{((doc.totals.cgst_total || 0) + (doc.totals.sgst_total || 0) + (doc.totals.igst_total || 0)).toFixed(2)}</td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        );
                                    })()}

                                    {/* ---- SUMMARY ---- */}
                                    <div className="flex flex-col border-t pt-1 mt-1">
                                            {(config.showTotalsTable ?? true) && (
                                                <div className="flex justify-between items-start gap-4">
                                                    <div className="flex-1">
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Amount in Words</p>
                                                        <p className="text-[10px] font-bold text-slate-700">{amountInWordsStr}</p>
                                                    </div>
                                                    <div className="w-44">
                                                        <div className="flex justify-between text-[10px] font-bold text-slate-900 mb-0.5"><span>Subtotal</span><span>{(doc.totals.subtotal_taxable || 0).toFixed(2)}</span></div>
                                                        {(doc.totals.subtotal_discount || 0) > 0 && (
                                                            <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                                                                <span>Discount {doc.totals.subtotal_discount_type === 'percent' ? `(${doc.totals.subtotal_discount_percent}%)` : ''}</span>
                                                                <span className="text-red-600 font-medium">-{(doc.totals.subtotal_discount || 0).toFixed(2)}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between text-[10px] text-slate-600 mb-0.5"><span>Tax</span><span>{((doc.totals.cgst_total || 0) + (doc.totals.sgst_total || 0) + (doc.totals.igst_total || 0)).toFixed(2)}</span></div>
                                                        {(doc.totals.rounding_adjustment || 0) !== 0 && <div className="flex justify-between text-[10px] text-slate-500 mb-0.5"><span>Rounding</span><span>{(doc.totals.rounding_adjustment || 0) > 0 ? '+' : ''}{(doc.totals.rounding_adjustment || 0).toFixed(2)}</span></div>}
                                                        <div className="flex justify-between text-sm font-bold border-t border-slate-300 pt-1 mt-1" style={{ color: config.color }}><span>Total</span><span>{currencySymbol} {(doc.totals.grand_total || 0).toFixed(2)}</span></div>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex gap-6 mt-2 pt-1 border-t border-slate-100">
                                                <div className="flex-[2] flex gap-4">
                                                    {(config.showQRCode ?? true) && doc.issuer_details.bank_details?.upi_id && (
                                                        <div className="flex-shrink-0 bg-white p-1 border rounded shadow-sm self-start">
                                                            <QRCodeSVG 
                                                                value={`upi://pay?pa=${doc.issuer_details.bank_details.upi_id}&pn=${encodeURIComponent(doc.issuer_details.name || '')}&am=${doc.totals.grand_total}&cu=INR`}
                                                                size={55}
                                                                level="M"
                                                            />
                                                            <p className="text-[7px] text-center font-bold text-slate-400 mt-0.5 uppercase">Scan to Pay</p>
                                                        </div>
                                                    )}
                                                    {doc.issuer_details.bank_details?.account_number && (
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
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-[9px] text-slate-500 uppercase mb-0.5">Terms</h4>
                                                    <p className="text-[9px] text-slate-600 whitespace-pre-line">{config.terms}</p>
                                                </div>
                                            </div>
                                        </div>

                                    {/* ---- SIGNATURES ---- */}
                                    <div className="flex justify-between items-end mt-auto pt-3 break-inside-avoid relative">
                                        {(config.showReceiverSign ?? true) && (
                                            <div className="text-center">
                                                <p className="text-xs font-bold text-slate-600 mb-6">&nbsp;</p>
                                                <div className="h-px bg-slate-400 w-32 mb-1 mx-auto"></div>
                                                <p className="text-[9px] font-bold text-slate-600">Receiver's Signature</p>
                                            </div>
                                        )}
                                        {stamp && (
                                            <div className="absolute left-1/2 bottom-2 -translate-x-1/2 pointer-events-none">
                                                <img src={stamp} alt="Stamp" className="h-16 w-16 object-contain opacity-80" style={{ transform: 'rotate(-10deg)', mixBlendMode: 'multiply' }} />
                                            </div>
                                        )}
                                        <div className="text-center relative ml-auto">
                                            <p className="text-xs font-bold text-slate-800 mb-2">For {safeRender(doc.issuer_details.name)}</p>
                                            {signature ? <img src={signature} alt="Signature" className="h-10 w-auto mx-auto mb-1 object-contain" /> : <div className="h-10"></div>}
                                            <div className="h-px bg-slate-400 w-32 mb-1 mx-auto"></div>
                                            <p className="text-[9px] font-bold text-slate-600">Issuer's Signature</p>
                                        </div>
                                    </div>

                                    {/* ---- BATTERY COMPARISON TABLE (BELOW SIGNATURES & QR) ---- */}
                                    {showBatteryComparisonTable && (pageIdx === paginatedPages.length - 1) && (
                                        <div className="mt-1 break-inside-avoid">
                                            <BatteryComparisonTable printMode={true} />
                                        </div>
                                    )}

                                    {/* ---- FOOTER ---- */}
                                    <div className="pt-1 text-center text-[9px] text-slate-400">{safeRender(config.footerText)}</div>
                                </div>
                            );
                        })}
                            </React.Fragment>
                        ))}
                    </div>{/* end print-only */}
                </div>
            </div>
            {/* Add Company Modal with Iframe */}
            {isAddCompanyModalOpen && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setIsAddCompanyModalOpen(false)}
                >
                    <div 
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[85vh] max-h-[600px] flex flex-col overflow-hidden border border-slate-200 text-left"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center px-4 py-3 border-b bg-slate-50 shrink-0">
                            <h2 className="text-base sm:text-lg font-bold text-slate-800">Add New Company Profile</h2>
                            <button 
                                onClick={() => setIsAddCompanyModalOpen(false)} 
                                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-lg font-bold"
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 w-full h-full min-h-0 bg-white">
                            <iframe 
                                src="/?mode=add_company" 
                                className="w-full h-full border-none block"
                                title="Add Company"
                            />
                        </div>
                    </div>
                </div>
            )}
            
            {/* AI Chat Panel */}
            <AiChatPanel 
                companyProfiles={companyProfiles} 
                priceList={priceList} 
                templates={templates} 
                onApplyAiData={handleApplyAiData} 
            />
        </div>
    );
};

export default InvoiceMaker;
