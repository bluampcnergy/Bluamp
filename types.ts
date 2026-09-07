
export type View =
  | 'home'
  | 'received'
  | 'testing'
  | 'wip'
  | 'dtf'
  | 'finished'
  | 'storage'
  | 'reports'
  | 'master'
  | 'log'
  | 'companies'
  | 'users'
  | 'employee_tasks'
  | 'ai_assistant'
  | 'finance_dashboard'
  | 'finance_upload'
  | 'finance_gst'
  | 'finance_expenses'
  | 'finance_prices'
  | 'finance_maker'
  | 'finance_ledger'
  | 'supplies'
  | 'help'
  | 'webmail'
  | 'mobile';

export interface WebmailAccount {
  id: string;
  email: string;
  senderName: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password?: string;
  isDefault?: boolean;
}

export interface EmailAttachment {
  filename: string;
  size: string;
  type: string;
  dataUrl?: string;
}

export interface EmailMessage {
  id: string;
  accountEmail: string;
  folder: 'inbox' | 'sent' | 'drafts' | 'trash';
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  timestamp: number;
  snippet: string;
  bodyHtml: string;
  bodyText?: string;
  isUnread: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  attachments?: EmailAttachment[];
}

export interface PriceListItem {
  id: string;
  model_name: string;
  hsn_code: string;
  price_without_gst: number;
}

export interface User {
  username: string;
  password?: string;
  role: 'admin' | 'user' | 'billing' | 'dashboard_user';
  name?: string;
  whatsapp_number?: string;
  is_active?: boolean;
}

export interface EmployeeTask {
  id: string;
  assigned_to: string; // employee username
  title: string;
  description?: string;
  completed: boolean;
  due_date?: string;
  created_at: number;
  created_by: string; // admin username
}

export interface LogEntry {
  id: string;
  timestamp: number;
  username: string;
  action: string;
  details: string;
}

export enum ReceivedGoodStatus {
  ND = 'ND',
  PR = 'PR',
  D = 'D',
  Other = 'Other',
}

export interface ReceivedGood {
  id: string;
  name: string;
  category: string;
  makeModel: string;
  supplier: string;
  quantity: number;
  initialQuantity?: number; // Initial batch size / entry quantity
  uom?: 'qty' | 'grams' | 'cm' | string; // Unit of Measurement (default: 'qty')
  lowStockThresholdPercent?: number; // Configured safety limit percentage (0 - 100%, default: 20%)
  isIgnoredForAlerts?: boolean; // Set true if item should not be replenished and low stock alerts are disabled
  status: ReceivedGoodStatus | string;
  damagedCount: number;
  invoiceNumber: string;
  serials: string[];
  serialIndexMap?: Record<string, number>; // Persistent # for each serial — survives production consumption
  timestamp: number;
  testReportLink?: string;
  notes?: string; // Stock verification notes, default: "actual physical qty = "
  gradingConfig?: {
    lowerLimit: number;
    upperLimit: number;
    numGrades: number;
    mode: 'capacity' | 'resistance' | 'voltage';
  };
}

export interface TestResult {
  id: string;
  receivedGoodId: string;
  serialNumber: string;
  category: 'Cell' | 'BMS';
  voltage?: number;
  resistance?: number;
  capacity?: number;
  passed?: boolean;
  grade?: string;
  location?: string;
  timestamp: number;
  testedBy: string;
}

export interface RecipeComponent {
  masterItemName?: string;
  receivedGoodId?: string;
  quantityPerUnit: number;
  uom?: string;
}

export interface Recipe {
  id: string;
  name: string;
  components: RecipeComponent[];
}

export interface WIPItem {
  id: string;
  recipeId: string;
  quantity: number;
  timestamp: number;
  consumedSerials: { [receivedGoodId: string]: string[] };
}

export interface UnitMetadata {
  itemType?: 'Battery' | 'Solar Panel' | 'Inverter' | 'Other';
  weight?: number;
  
  // Battery Specific
  chemistry?: 'LFP' | 'NMC';
  balancing?: string;
  voltage?: number;
  capacity?: number;
  resistance?: number;

  // Solar Panel Specific
  peakPower?: number;
  vmp?: number;
  imp?: number;
  dcrType?: 'DCR' | 'Non DCR';

  // Inverter Specific
  ratedPower?: number;
  inputVoltage?: number;
  outputVoltage?: number;
  inverterType?: 'Solar PWM' | 'Non Solar' | 'Solar MPPT';

  // Other Specific
  description?: string;
}

export interface DeliveryHistoryEntry {
  unitId: string;
  customerName: string;
  deliveredAt: number;
  returnedAt: number;
  returnReason?: string;
  operator?: string;
}

export interface RepairSwapEntry {
  unitId: string;
  damagedSerial: string;
  replacementSerial: string;
  timestamp: number;
  swappedBy?: string;
}

export interface FinishedGood {
  id: string;
  recipeId: string;
  quantity: number;
  timestamp: number;
  consumedSerials: { [receivedGoodId: string]: string[] };
  qualityRemarks: string;
  deliveredTo?: string;
  unitDeliveries?: { [unitId: string]: string };
  deliveryHistory?: DeliveryHistoryEntry[];
  repairSwapHistory?: RepairSwapEntry[];
  inRepairUnitIds?: string[];
  repairedUnitIds?: string[];
  dismantledUnitIds?: string[];
  unitMetadata?: { [unitId: string]: UnitMetadata };
  // Map of Unit ID -> { ReceivedGood ID -> [Serials Used] }
  unitComponentMap?: { [unitId: string]: { [receivedGoodId: string]: string[] } };
  isDTF?: boolean;
}

export interface RepairItem {
  id: string;
  finishedGoodId: string;
  recipeId: string;
  unitId: string;
  timestamp: number;
}

export interface CompanyProfile {
  id: string;
  name: string;
  category?: string;
  gstNumber: string;
  gstin?: string;
  shippingAddress: string;
  email: string;
  contactPerson: string;
  phoneNumber: string;
  source?: 'manual' | 'whatsapp' | 'csv' | string;
  verified_name?: string;
  is_business?: boolean;
  notes?: string;
  created_at?: string | number;
}

// --- Storage Management Types ---

export interface StorageRoom {
  id: string;
  name: string;
}

export interface StorageUnit {
  id: string;
  roomId: string;
  name: string;
  type: 'rack' | 'cupboard' | 'drawer';
  sectionCount: number;
}

export interface StorageItem {
  id: string;
  unitId: string;
  sectionIndex: number;
  name: string;
  description?: string;
  quantity: number;
  linkedInventoryId?: string;
  timestamp: number;
}

// --- Employee Expense Ledger ---

export interface Expense {
  id: string;
  employee_name: string;
  date: string;
  type: 'debit' | 'credit';
  category: string;
  description: string;
  amount: number;
  image_link?: string;
  created_by: string;
  created_at?: string;
}

// --- Finance & Invoice Types ---

export interface BankDetails {
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  branch?: string;
  ifsc?: string;
  upi_id?: string;
}

export interface InvoiceParty {
  name?: string;
  gstin?: string;
  address?: string;
  state?: string;
  state_code?: string;
  email?: string;
  phone?: string;
  contact_person?: string;
  pan?: string;
  bank_details?: BankDetails;
}

export interface InvoiceItem {
  description: string;
  item_type?: string;
  make_model?: string;
  status?: string;
  hsn_sac?: string;
  image_url?: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  taxable_value: number;
  cgst_rate?: number;
  cgst_amount?: number;
  sgst_rate?: number;
  sgst_amount?: number;
  igst_rate?: number;
  igst_amount?: number;
  total_value: number;
}

export interface SupplyRecord {
  id: string;
  item_name: string;
  specification?: string;
  direction?: 'inward' | 'outward';
  from_company?: string;
  to_company?: string;
  supplier_id?: string;
  website_url?: string;
  contact_name?: string;
  contact_number?: string;
  contact_email?: string;
  status?: 'to_be_ordered' | 'ordered' | 'delivered';
  target_quantity?: number;
  uom?: string;
  rfq_text?: string;
  is_ignored_for_alerts?: boolean;
  raw_good_id?: string;
  is_ordered?: boolean;
  is_received?: boolean;
  is_shipped?: boolean;
  timestamp: number;
  created_by?: string;
}

export interface InvoiceEditHistoryEntry {
  edited_at: string;
  edited_by: string;
  previous_grand_total?: number;
  new_grand_total?: number;
  previous_invoice_number?: string;
  new_invoice_number?: string;
  notes?: string;
  summary?: string;
  changes?: string[];
}

export interface ExtractedInvoice {
  id?: string;
  created_at?: string;
  timestamp?: string;
  filename: string;
  document_type: 'invoice' | 'receipt' | 'credit_note' | 'debit_note' | 'delivery_challan' | 'generated_invoice' | 'generated_po' | 'generated_delivery_challan' | 'generated_debit_note' | 'generated_credit_note' | 'generated_quotation' | 'generated_proforma_invoice' | 'purchase_order' | 'quotation' | 'proforma_invoice' | 'other';
  source_type: 'sales' | 'purchase';
  issuer_details: InvoiceParty;
  receiver_details: InvoiceParty;
  shipped_to_details?: InvoiceParty;
  supplier_details?: InvoiceParty;
  invoice_metadata: {
    invoice_number: string;
    invoice_date: string;
    due_date?: string;
    purchase_order_number?: string;
    ewaybill_number?: string;
    input_tax_credit?: 'set_off' | 'non_set_off' | 'not_applicable';
    related_invoice_number?: string;
    related_invoice_date?: string;
    note_type?: 'debit' | 'credit' | '';
    note_reason?: string;
    employee_name?: string;
    expense_category?: string;
    tax_mode?: 'intra' | 'inter';
    mail_sent?: boolean;
    terms?: string;
    terms_conditions?: string;
    custom_terms?: string;
    custom_title?: string;
    title?: string;
    notes?: string;
    template_id?: string;
    template_name?: string;
    ui_config?: Record<string, any>;
    edit_history?: InvoiceEditHistoryEntry[];
  };
  items: InvoiceItem[];
  totals: {
    subtotal_taxable: number;
    cgst_total: number;
    sgst_total: number;
    igst_total: number;
    round_off?: number;
    grand_total: number;
    currency?: string;
  };
  ocr_confidence_score?: number;
  raw_text?: string;
  requires_review: boolean;
  uploaded_by?: string;
  image_link?: string;
}

export interface InvoiceTemplate {
  id?: string;
  name: string;
  type: 'invoice' | 'po';
  config: {
    font: 'font-sans' | 'font-serif' | 'font-mono';
    color: string;
    headerText: string;
    footerText: string;
    terms: string;
    logoUrl?: string;
    stampUrl?: string;
    logoSize?: number;
    signatureUrl?: string;
    issuer_details?: InvoiceParty;
  }
}

export interface GST3BSummary {
  outward_taxable: number;
  outward_igst: number;
  outward_cgst: number;
  outward_sgst: number;
  itc_igst: number;
  itc_cgst: number;
  itc_sgst: number;
  itc_ineligible: number;
}

export const EMPTY_INVOICE: ExtractedInvoice = {
  filename: '',
  document_type: 'invoice',
  source_type: 'purchase',
  issuer_details: {},
  receiver_details: {},
  invoice_metadata: { invoice_number: '', invoice_date: '' },
  items: [],
  totals: { subtotal_taxable: 0, cgst_total: 0, sgst_total: 0, igst_total: 0, grand_total: 0 },
  requires_review: true,
  image_link: ''
};

export type VoiceIntentType = 
  | 'create_task'
  | 'delete_task'
  | 'complete_task'
  | 'query_stock'
  | 'query_tasks'
  | 'download_invoice'
  | 'finance_summary'
  | 'unknown';

export interface VoiceIntentResult {
  intent: VoiceIntentType;
  confidence: number;
  spoken_query: string;
  parameters: {
    assigned_to?: string;
    title?: string;
    description?: string;
    due_date?: string;
    priority?: 'high' | 'medium' | 'low';
    task_id?: string;
    task_title_match?: string;
    completed?: boolean;
    item_name?: string;
    category?: string;
    low_stock_only?: boolean;
    invoice_number?: string;
    party_name?: string;
  };
  explanation?: string;
}

export interface MobileActionPreview {
  id: string;
  intent: VoiceIntentType;
  title: string;
  details: string;
  params: VoiceIntentResult['parameters'];
  status: 'pending' | 'executing' | 'success' | 'failed';
  resultMessage?: string;
}
