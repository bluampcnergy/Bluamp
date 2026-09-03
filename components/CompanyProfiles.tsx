import React, { useState, useMemo, useRef } from 'react';
import type { CompanyProfile } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TrashIcon } from './icons/TrashIcon';
import { ImportIcon } from './icons/ImportIcon';
import { SearchIcon } from './icons/SearchIcon';
import Modal from './Modal';

interface CompanyProfilesProps {
  companyProfiles: CompanyProfile[];
  setCompanyProfiles: React.Dispatch<React.SetStateAction<CompanyProfile[]>>;
  addLogEntry: (action: string, details: string) => void;
  isIframe?: boolean;
}

export const COMPANY_CATEGORIES = [
  'Supplier: Lithium-Ion & LiFePO4 Cells',
  'Supplier: BMS, Active Balancers & PCB',
  'Supplier: Hardware & Fasteners (Nuts, Bolts, Screws)',
  'Supplier: Nickel Strips, Busbars & Pure Nickel',
  'Supplier: Wires, Cables & High-Current Connectors',
  'Supplier: Cell Holders, Brackets & Insulation',
  'Supplier: Enclosures, Sheet Metal & Battery Cabinets',
  'Supplier: Epoxy Sheets, Sleeves & Heat Shrink',
  'Supplier: Spot Welding & Battery Pack Tooling',
  'Supplier: General Raw Materials & Consumables',
  'B2B Customer (Distributor / OEM / Solar)',
  'B2C Customer (Direct / Retail)',
  'Logistics, Transport & Courier',
  'Subcontractor & Maintenance Services',
  'Other'
];

export const getCategoryBadgeStyle = (category?: string) => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('cell') || cat.includes('battery')) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (cat.includes('bms') || cat.includes('pcb') || cat.includes('balancer')) {
    return 'bg-teal-50 text-teal-800 border-teal-200';
  }
  if (cat.includes('hardware') || cat.includes('fastener') || cat.includes('nut') || cat.includes('bolt') || cat.includes('screw')) {
    return 'bg-amber-50 text-amber-900 border-amber-200';
  }
  if (cat.includes('nickel') || cat.includes('wire') || cat.includes('cable') || cat.includes('connector')) {
    return 'bg-blue-50 text-blue-800 border-blue-200';
  }
  if (cat.includes('enclosure') || cat.includes('cabinet') || cat.includes('epoxy') || cat.includes('holder')) {
    return 'bg-purple-50 text-purple-800 border-purple-200';
  }
  if (cat.includes('b2b')) {
    return 'bg-indigo-50 text-indigo-800 border-indigo-200';
  }
  if (cat.includes('b2c')) {
    return 'bg-violet-50 text-violet-800 border-violet-200';
  }
  if (cat.includes('logistics') || cat.includes('courier') || cat.includes('transport')) {
    return 'bg-cyan-50 text-cyan-800 border-cyan-200';
  }
  if (cat.includes('supplier')) {
    return 'bg-emerald-50/70 text-[#658C3E] border-[#A8BF75]/40';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

interface StagedContact {
  id: string;
  selected: boolean;
  source: string;
  originalName: string;
  verifiedName: string;
  chosenName: string;
  phone: string;
  category: string;
  contactPerson: string;
  gstNumber: string;
  shippingAddress: string;
  email: string;
  isBusiness: boolean;
  status: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  existingProfileId?: string;
}

const initialFormState: Omit<CompanyProfile, 'id'> = {
  name: '',
  category: 'Supplier: General Raw Materials & Consumables',
  gstNumber: '',
  shippingAddress: '',
  email: '',
  contactPerson: '',
  phoneNumber: '',
  source: 'manual',
  verified_name: '',
  is_business: false,
  notes: ''
};

const cleanPhoneNumber = (raw: string) => {
  return (raw || '').replace(/[^0-9+]/g, '').trim();
};

const CompanyProfiles: React.FC<CompanyProfilesProps> = ({
  companyProfiles,
  setCompanyProfiles,
  addLogEntry,
  isIframe
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(initialFormState);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Staging Review Migration Modal State
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [stagedContacts, setStagedContacts] = useState<StagedContact[]>([]);
  const [batchCategory, setBatchCategory] = useState('Supplier: General Raw Materials & Consumables');
  const [stagingSearchTerm, setStagingSearchTerm] = useState('');
  const [stagingFilter, setStagingFilter] = useState<'all' | 'new' | 'duplicate'>('all');

  const downloadCompanyProfilesTemplateCSV = () => {
    const csvContent =
      'Company Name,Category,GST Number,Email,Contact Person,Phone Number,Shipping Address\n' +
      'Acme Solar Ltd,B2B Customer (Distributor / OEM / Solar),27AAACA0000A1Z5,contact@acmesolar.com,John Doe,9876543210,"123 Industrial Area, Pune, Maharashtra 411001"\n' +
      'EVE Energy Co. Ltd,Supplier: Lithium-Ion & LiFePO4 Cells,,sales@evebattery.com,EVE Sales,+8613800138000,"Huizhou, Guangdong, China"\n' +
      'Ravi Fasteners,Supplier: Hardware & Fasteners (Nuts, Bolts, Screws),27BBBCB1111B1Z2,ravi@fasteners.in,Ravi Kumar,+919876543210,"Bhosari MIDC, Pune"';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'company_profiles_template.csv';
    link.click();
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleEdit = (profile: CompanyProfile) => {
    setEditingId(profile.id);
    setFormData({
      name: profile.name,
      category: profile.category || 'Supplier: General Raw Materials & Consumables',
      gstNumber: profile.gstNumber || '',
      shippingAddress: profile.shippingAddress || '',
      email: profile.email || '',
      contactPerson: profile.contactPerson || '',
      phoneNumber: profile.phoneNumber || '',
      source: profile.source || 'manual',
      verified_name: profile.verified_name || '',
      is_business: Boolean(profile.is_business),
      notes: profile.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}? This might affect records linking to this company.`)) {
      setCompanyProfiles(prev => prev.filter(p => p.id !== id));
      addLogEntry('Deleted Company', `Deleted company profile: ${name}`);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Company Name is required.');
      return;
    }

    if (editingId) {
      setCompanyProfiles(prev =>
        prev.map(p => (p.id === editingId ? { ...p, ...formData, name: formData.name.trim() } : p))
      );
      addLogEntry('Updated Company', `Updated company profile: ${formData.name} (${formData.category})`);
    } else {
      const newProfile: CompanyProfile = {
        ...formData,
        name: formData.name.trim(),
        id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        created_at: new Date().toISOString()
      };
      setCompanyProfiles(prev => [newProfile, ...prev]);
      addLogEntry('Added Company', `Added new company profile: ${formData.name} (${formData.category})`);

      if (isIframe) {
        window.parent.postMessage({ type: 'COMPANY_ADDED', company: newProfile }, '*');
      }
    }
    setIsModalOpen(false);
  };

  // CSV Importer: Supports both WhatsApp contacts CSV and Standard ERP CSV
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        parseCsvForStaging(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Robust line splitter handling quoted commas and CRLF
  const parseCsvLines = (text: string): string[][] => {
    const lines: string[][] = [];
    const rawLines = text.split(/\r?\n/);

    for (const rawLine of rawLines) {
      if (!rawLine.trim()) continue;

      const row: string[] = [];
      let inQuotes = false;
      let currentVal = '';

      for (let i = 0; i < rawLine.length; i++) {
        const char = rawLine[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if ((char === ',' || char === '\t') && !inQuotes) {
          row.push(currentVal.trim().replace(/^"|"$/g, ''));
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      row.push(currentVal.trim().replace(/^"|"$/g, ''));
      lines.push(row);
    }

    return lines;
  };

  const parseCsvForStaging = (csvText: string) => {
    const rows = parseCsvLines(csvText);
    if (rows.length < 2) {
      alert('CSV file is empty or has no data rows.');
      return;
    }

    const headerRow = rows[0].map(h => h.toLowerCase().trim());
    const isWhatsAppFormat =
      headerRow.includes('phone') ||
      headerRow.includes('verified_name') ||
      (headerRow.includes('source') && headerRow.includes('name'));

    const staged: StagedContact[] = [];

    // Map existing phones and names for quick duplicate detection
    const existingPhoneMap = new Map<string, CompanyProfile>();
    const existingNameMap = new Map<string, CompanyProfile>();

    companyProfiles.forEach(p => {
      const cleanedPhone = cleanPhoneNumber(p.phoneNumber);
      if (cleanedPhone) existingPhoneMap.set(cleanedPhone, p);
      if (p.name) existingNameMap.set(p.name.toLowerCase().trim(), p);
    });

    if (isWhatsAppFormat) {
      // Find column indices
      const sourceIdx = headerRow.indexOf('source');
      const nameIdx = headerRow.indexOf('name');
      const phoneIdx = headerRow.indexOf('phone');
      const statusIdx = headerRow.indexOf('status');
      const isBizIdx = headerRow.indexOf('is_business');
      const verifiedNameIdx = headerRow.indexOf('verified_name');

      rows.slice(1).forEach((row, idx) => {
        const sourceVal = sourceIdx >= 0 ? row[sourceIdx] || 'whatsapp' : 'whatsapp';
        const rawName = nameIdx >= 0 ? row[nameIdx] || '' : '';
        const rawPhone = phoneIdx >= 0 ? row[phoneIdx] || '' : '';
        const rawStatus = statusIdx >= 0 ? row[statusIdx] || '' : '';
        const rawIsBiz = isBizIdx >= 0 ? row[isBizIdx] : '';
        const rawVerified = verifiedNameIdx >= 0 ? row[verifiedNameIdx] || '' : '';

        const isBusiness =
          String(rawIsBiz).toLowerCase() === 'true' ||
          String(rawIsBiz) === '1' ||
          Boolean(rawVerified);

        const cleanedPhone = cleanPhoneNumber(rawPhone);
        if (!rawName && !rawVerified && !cleanedPhone) return;

        // Preferred Company Name: verified_name if present, otherwise contact name
        const chosenName = rawVerified.trim() || rawName.trim() || `Contact ${cleanedPhone}`;
        const contactPerson = rawName.trim() !== chosenName ? rawName.trim() : '';

        // Duplicate Check
        let isDuplicate = false;
        let duplicateReason = '';
        let existingId: string | undefined;

        if (cleanedPhone && existingPhoneMap.has(cleanedPhone)) {
          const match = existingPhoneMap.get(cleanedPhone)!;
          isDuplicate = true;
          duplicateReason = `Phone matches existing: "${match.name}"`;
          existingId = match.id;
        } else if (chosenName && existingNameMap.has(chosenName.toLowerCase())) {
          const match = existingNameMap.get(chosenName.toLowerCase())!;
          isDuplicate = true;
          duplicateReason = `Company name matches: "${match.name}"`;
          existingId = match.id;
        }

        staged.push({
          id: `staged-${Date.now()}-${idx}`,
          selected: !isDuplicate, // Auto-select new non-duplicate contacts
          source: sourceVal || 'whatsapp',
          originalName: rawName,
          verifiedName: rawVerified,
          chosenName: chosenName,
          phone: cleanedPhone,
          category: 'Supplier: General Raw Materials & Consumables',
          contactPerson: contactPerson,
          gstNumber: '',
          shippingAddress: '',
          email: '',
          isBusiness: isBusiness,
          status: rawStatus,
          isDuplicate: isDuplicate,
          duplicateReason: duplicateReason,
          existingProfileId: existingId
        });
      });
    } else {
      // Standard ERP CSV format: Company Name, Category, GST Number, Email, Contact Person, Phone Number, Shipping Address
      rows.slice(1).forEach((row, idx) => {
        const [name, category, gstNumber, email, contactPerson, phoneNumber, ...addressParts] = row;
        if (!name) return;

        const cleanedPhone = cleanPhoneNumber(phoneNumber || '');
        let isDuplicate = false;
        let duplicateReason = '';
        let existingId: string | undefined;

        if (cleanedPhone && existingPhoneMap.has(cleanedPhone)) {
          const match = existingPhoneMap.get(cleanedPhone)!;
          isDuplicate = true;
          duplicateReason = `Phone matches: "${match.name}"`;
          existingId = match.id;
        } else if (existingNameMap.has(name.toLowerCase().trim())) {
          const match = existingNameMap.get(name.toLowerCase().trim())!;
          isDuplicate = true;
          duplicateReason = `Name matches: "${match.name}"`;
          existingId = match.id;
        }

        staged.push({
          id: `staged-${Date.now()}-${idx}`,
          selected: !isDuplicate,
          source: 'csv',
          originalName: name,
          verifiedName: '',
          chosenName: name,
          phone: cleanedPhone,
          category: category || 'Supplier: General Raw Materials & Consumables',
          contactPerson: contactPerson || '',
          gstNumber: gstNumber || '',
          shippingAddress: addressParts.join(', '),
          email: email || '',
          isBusiness: false,
          status: '',
          isDuplicate: isDuplicate,
          duplicateReason: duplicateReason,
          existingProfileId: existingId
        });
      });
    }

    if (staged.length > 0) {
      setStagedContacts(staged);
      setIsMigrationModalOpen(true);
    } else {
      alert('No valid contact entries found in the file.');
    }
  };

  // Staging Review Actions
  const handleToggleSelectAllStaged = (select: boolean) => {
    setStagedContacts(prev => prev.map(c => ({ ...c, selected: select })));
  };

  const handleToggleSelectStaged = (id: string) => {
    setStagedContacts(prev =>
      prev.map(c => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleUpdateStagedRow = (id: string, field: keyof StagedContact, value: any) => {
    setStagedContacts(prev =>
      prev.map(c => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleBatchApplyCategory = () => {
    const selectedCount = stagedContacts.filter(c => c.selected).length;
    if (selectedCount === 0) {
      alert('Please select at least one contact row to apply this category.');
      return;
    }

    setStagedContacts(prev =>
      prev.map(c => (c.selected ? { ...c, category: batchCategory } : c))
    );
  };

  const handleCommitMigration = () => {
    const toImport = stagedContacts.filter(c => c.selected && c.chosenName.trim());
    if (toImport.length === 0) {
      alert('No contacts selected for import.');
      return;
    }

    const newProfiles: CompanyProfile[] = toImport.map((contact, idx) => ({
      id: contact.existingProfileId || `comp-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
      name: contact.chosenName.trim(),
      category: contact.category || 'Supplier: General Raw Materials & Consumables',
      gstNumber: contact.gstNumber || '',
      shippingAddress: contact.shippingAddress || '',
      email: contact.email || '',
      contactPerson: contact.contactPerson || '',
      phoneNumber: contact.phone || '',
      source: contact.source || 'whatsapp',
      verified_name: contact.verifiedName || undefined,
      is_business: contact.isBusiness,
      notes: contact.status ? `WA Status: ${contact.status}` : undefined,
      created_at: new Date().toISOString()
    }));

    // Merge into state (overwriting existing duplicate profiles if updated)
    setCompanyProfiles(prev => {
      const importIds = new Set(newProfiles.map(p => p.id));
      const filteredPrev = prev.filter(p => !importIds.has(p.id));
      return [...newProfiles, ...filteredPrev];
    });

    addLogEntry('Imported WhatsApp Contacts', `Imported & classified ${newProfiles.length} contacts into Company Directory.`);
    setIsMigrationModalOpen(false);
    alert(`🎉 Successfully integrated ${newProfiles.length} verified suppliers and contacts!`);
  };

  // Filter main directory profiles
  const filteredProfiles = useMemo(() => {
    return companyProfiles.filter(p => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.category || '').toLowerCase().includes(term) ||
        (p.gstNumber || '').toLowerCase().includes(term) ||
        (p.contactPerson || '').toLowerCase().includes(term) ||
        (p.phoneNumber || '').toLowerCase().includes(term) ||
        (p.verified_name || '').toLowerCase().includes(term);

      const matchesCat =
        selectedCategoryFilter === 'All' ||
        (selectedCategoryFilter === 'All Suppliers' && (p.category || '').toLowerCase().includes('supplier')) ||
        p.category === selectedCategoryFilter;

      return matchesSearch && matchesCat;
    });
  }, [companyProfiles, searchTerm, selectedCategoryFilter]);

  // Filter staged contacts in review modal
  const filteredStagedContacts = useMemo(() => {
    return stagedContacts.filter(c => {
      const term = stagingSearchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        c.chosenName.toLowerCase().includes(term) ||
        c.originalName.toLowerCase().includes(term) ||
        c.verifiedName.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term) ||
        c.category.toLowerCase().includes(term);

      const matchesStatus =
        stagingFilter === 'all' ||
        (stagingFilter === 'new' && !c.isDuplicate) ||
        (stagingFilter === 'duplicate' && c.isDuplicate);

      return matchesSearch && matchesStatus;
    });
  }, [stagedContacts, stagingSearchTerm, stagingFilter]);

  if (isIframe) {
    return (
      <div className="p-4 sm:p-6 bg-white h-screen w-full flex flex-col overflow-hidden box-border">
        <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 pb-2">
            <div className="col-span-1 md:col-span-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-1 border-b pb-2">
                Add New Company Profile
              </h2>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full border border-slate-300 rounded-lg shadow-sm p-2 sm:p-2.5 focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">
                Category / Classification
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className="w-full border border-slate-300 rounded-lg shadow-sm p-2 sm:p-2.5 focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm bg-white font-semibold"
              >
                {COMPANY_CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">
                GST Number
              </label>
              <input
                type="text"
                name="gstNumber"
                value={formData.gstNumber}
                onChange={handleInputChange}
                className="w-full border border-slate-300 rounded-lg shadow-sm p-2 sm:p-2.5 focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">
                Contact Person
              </label>
              <input
                type="text"
                name="contactPerson"
                value={formData.contactPerson}
                onChange={handleInputChange}
                className="w-full border border-slate-300 rounded-lg shadow-sm p-2 sm:p-2.5 focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                className="w-full border border-slate-300 rounded-lg shadow-sm p-2 sm:p-2.5 focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full border border-slate-300 rounded-lg shadow-sm p-2 sm:p-2.5 focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">
                Shipping Address
              </label>
              <textarea
                name="shippingAddress"
                value={formData.shippingAddress}
                onChange={handleInputChange}
                rows={2}
                className="w-full border border-slate-300 rounded-lg shadow-sm p-2 sm:p-2.5 focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
              ></textarea>
            </div>
          </div>
          <div className="mt-2 pt-3 border-t border-slate-200 shrink-0 bg-white">
            <button
              type="submit"
              className="w-full bg-[#8EBF45] hover:bg-[#729937] text-[#0D0D0D] p-2.5 sm:p-3 rounded-lg flex items-center justify-center font-bold uppercase tracking-wider transition-colors shadow-md text-xs sm:text-sm"
            >
              Save Company Profile
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>🏢</span>
            <span>Company Profiles & Supplier Directory</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage suppliers, raw material vendors, B2B/B2C customers, and WhatsApp contact integrations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenAdd}
            className="flex items-center bg-[#8EBF45] text-[#0D0D0D] px-4 py-2.5 rounded-xl shadow-sm hover:bg-[#658C3E] hover:text-white transition-all font-black uppercase tracking-wider text-xs gap-1.5"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add Company</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".csv,text/csv"
          />
        </div>
      </div>

      {/* WhatsApp & CSV Migration Control Ribbon */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 sm:p-5 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md no-print">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📥</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                WhatsApp & CSV Contact Migration:
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Interactive Staging & Duplicate Check Active
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">
              Upload your WhatsApp contacts export (with headers{' '}
              <code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-400 font-mono">
                source, name, phone, status, is_business, verified_name
              </code>
              ) or standard ERP CSV to review, assign categories, and sync directly to Supabase.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end md:self-auto shrink-0 flex-wrap">
          <button
            onClick={downloadCompanyProfilesTemplateCSV}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
            title="Download sample CSV template"
          >
            <span>💾 Sample Template</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md whitespace-nowrap flex items-center gap-1.5"
            title="Import WhatsApp contacts or CSV file"
          >
            <ImportIcon size={14} />
            <span>Upload WhatsApp Contacts CSV</span>
          </button>
        </div>
      </div>

      {/* Search & Category Filter Ribbon */}
      <div className="space-y-3">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#8EBF45] transition-colors">
            <SearchIcon className="h-5 w-5" />
          </div>
          <input
            type="text"
            placeholder="Search by company name, category, GST, contact person, phone, or WhatsApp verified name..."
            className="block w-full p-4 pl-12 border-2 border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:border-[#8EBF45] focus:ring-4 focus:ring-[#8EBF45]/10 transition-all text-slate-900 bg-white text-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setSelectedCategoryFilter('All')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-full border transition-all ${
              selectedCategoryFilter === 'All'
                ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Categories ({companyProfiles.length})
          </button>

          <button
            onClick={() => setSelectedCategoryFilter('All Suppliers')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-full border transition-all ${
              selectedCategoryFilter === 'All Suppliers'
                ? 'bg-[#8EBF45] text-[#0D0D0D] border-[#8EBF45] font-black'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            📦 All Suppliers (
            {companyProfiles.filter(p => (p.category || '').toLowerCase().includes('supplier')).length}
            )
          </button>

          {COMPANY_CATEGORIES.slice(0, 7).map(cat => {
            const count = companyProfiles.filter(p => p.category === cat).length;
            if (count === 0 && selectedCategoryFilter !== cat) return null;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategoryFilter(cat)}
                className={`px-3 py-1 text-xs font-bold rounded-full border transition-all truncate max-w-xs ${
                  selectedCategoryFilter === cat
                    ? 'bg-[#8EBF45] text-[#0D0D0D] border-[#8EBF45] font-black'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat.replace('Supplier: ', '')} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Company Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProfiles.map(profile => {
          const badgeStyle = getCategoryBadgeStyle(profile.category);
          const cleanPhone = cleanPhoneNumber(profile.phoneNumber);

          return (
            <div
              key={profile.id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-200 p-5 flex flex-col justify-between transition-all duration-200"
            >
              <div>
                {/* Card Top: Category Badge & Actions */}
                <div className="flex justify-between items-start gap-2 mb-3">
                  <span
                    className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border truncate max-w-[200px] ${badgeStyle}`}
                    title={profile.category || 'Uncategorized'}
                  >
                    🏷️ {profile.category || 'General Supplier'}
                  </span>

                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => handleEdit(profile)}
                      className="text-slate-400 hover:text-[#658C3E] p-1.5 rounded-lg hover:bg-[#8EBF45]/10 transition-colors"
                      title="Edit Company Profile"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => handleDelete(profile.id, profile.name)}
                      className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete Company Profile"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                {/* Company Name & Verified Badges */}
                <div className="mb-3">
                  <h3 className="font-bold text-lg text-slate-900 leading-tight">
                    {profile.name}
                  </h3>
                  {profile.verified_name && profile.verified_name !== profile.name && (
                    <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                      <span>✓ Verified WA:</span>
                      <span className="font-bold">{profile.verified_name}</span>
                    </p>
                  )}
                  {profile.is_business && (
                    <span className="inline-block mt-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-black uppercase px-2 py-0.5 rounded">
                      🏢 Business Contact
                    </span>
                  )}
                </div>

                {/* Key Attributes */}
                <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  {profile.gstNumber && (
                    <p className="flex justify-between items-center font-mono">
                      <span className="font-semibold text-slate-400">GSTIN:</span>
                      <span className="font-bold text-slate-800">{profile.gstNumber}</span>
                    </p>
                  )}
                  {profile.contactPerson && (
                    <p className="flex justify-between items-center">
                      <span className="font-semibold text-slate-400">Contact:</span>
                      <span className="font-bold text-slate-800">{profile.contactPerson}</span>
                    </p>
                  )}
                  {profile.phoneNumber && (
                    <p className="flex justify-between items-center">
                      <span className="font-semibold text-slate-400">Phone:</span>
                      <span className="font-bold text-slate-800 font-mono">{profile.phoneNumber}</span>
                    </p>
                  )}
                  {profile.email && (
                    <p className="flex justify-between items-center truncate">
                      <span className="font-semibold text-slate-400">Email:</span>
                      <a
                        href={`mailto:${profile.email}`}
                        className="text-[#658C3E] hover:underline font-semibold truncate max-w-[180px]"
                      >
                        {profile.email}
                      </a>
                    </p>
                  )}
                  {profile.shippingAddress && (
                    <div className="border-t border-slate-100 pt-2 mt-2">
                      <span className="font-semibold text-slate-400 text-[10px] block uppercase tracking-wider mb-0.5">
                        Address:
                      </span>
                      <p className="text-slate-700 line-clamp-2">{profile.shippingAddress}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer: WhatsApp Direct Action */}
              {cleanPhone && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <a
                    href={`https://wa.me/${cleanPhone.replace('+', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>💬</span>
                    <span>Chat on WhatsApp</span>
                  </a>
                </div>
              )}
            </div>
          );
        })}
        {filteredProfiles.length === 0 && (
          <div className="col-span-full text-center py-12 bg-white rounded-2xl border border-slate-100 text-slate-400 text-sm italic">
            No company profiles match the selected filters.
          </div>
        )}
      </div>

      {/* MANUAL ADD / EDIT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Company Profile' : 'Add New Company Profile'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Company / Vendor Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-bold bg-white"
              required
              placeholder="e.g. EVE Energy Co., Ltd."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Category / Classification <span className="text-red-500">*</span>
            </label>
            <select
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white font-bold text-slate-800"
            >
              {COMPANY_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                GST Number
              </label>
              <input
                type="text"
                name="gstNumber"
                value={formData.gstNumber}
                onChange={handleInputChange}
                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-mono bg-white"
                placeholder="27AAACA0000A1Z5"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white"
                placeholder="sales@company.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Contact Person
              </label>
              <input
                type="text"
                name="contactPerson"
                value={formData.contactPerson}
                onChange={handleInputChange}
                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Phone Number
              </label>
              <input
                type="text"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-mono bg-white"
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Shipping / Plant Address
            </label>
            <textarea
              name="shippingAddress"
              value={formData.shippingAddress}
              onChange={handleInputChange}
              rows={2}
              className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white resize-none"
              placeholder="Full physical address or warehouse location"
            ></textarea>
          </div>

          {/* WhatsApp / Metadata attributes */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="is_business"
                  checked={Boolean(formData.is_business)}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800">
                  🏢 WhatsApp Business Account
                </span>
              </label>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                WhatsApp Verified Business Name (if applicable)
              </label>
              <input
                type="text"
                name="verified_name"
                value={formData.verified_name || ''}
                onChange={handleInputChange}
                className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white"
                placeholder="Official registered name from WhatsApp"
              />
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-100">
            {editingId && (
              <button
                type="button"
                onClick={() => handleDelete(editingId, formData.name)}
                className="text-red-500 hover:text-red-700 text-xs font-bold flex items-center px-2"
              >
                <TrashIcon />
                <span className="ml-1">Delete Profile</span>
              </button>
            )}
            <div className="ml-auto">
              <button
                type="submit"
                className="bg-[#8EBF45] text-[#0D0D0D] px-6 py-2.5 rounded-xl hover:bg-[#658C3E] hover:text-white font-black uppercase tracking-wider text-xs shadow-md transition-all active:scale-95"
              >
                {editingId ? 'Update Profile' : 'Save Profile'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* WHATSAPP & CSV STAGING REVIEW WIZARD MODAL */}
      <Modal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        title="📥 Review & Classify Contacts for Migration"
        size="xl"
      >
        <div className="space-y-5">
          {/* Top Summary & Stats */}
          <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>⚡</span>
                <span>
                  {stagedContacts.length} Contacts Parsed from CSV
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Review each contact, select the official company name, and assign categories before committing to database.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                ✨ {stagedContacts.filter(c => !c.isDuplicate).length} New
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
                ⚠️ {stagedContacts.filter(c => c.isDuplicate).length} Existing/Duplicates
              </span>
            </div>
          </div>

          {/* Batch Category Assigner & Filter Toolbar */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            {/* Left: Batch Apply */}
            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Batch Category:
              </span>
              <select
                value={batchCategory}
                onChange={e => setBatchCategory(e.target.value)}
                className="border border-slate-300 rounded-lg p-1.5 text-xs bg-white font-bold text-slate-800 max-w-xs"
              >
                {COMPANY_CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBatchApplyCategory}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
              >
                Apply to Selected ({stagedContacts.filter(c => c.selected).length})
              </button>
            </div>

            {/* Right: Select All & Status Filter */}
            <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
              <button
                type="button"
                onClick={() =>
                  handleToggleSelectAllStaged(
                    stagedContacts.some(c => !c.selected)
                  )
                }
                className="text-xs text-blue-600 hover:underline font-bold px-2 py-1"
              >
                {stagedContacts.every(c => c.selected)
                  ? 'Deselect All'
                  : 'Select All'}
              </button>

              <div className="inline-flex bg-slate-200/80 p-0.5 rounded-lg text-xs font-bold text-slate-700">
                <button
                  type="button"
                  onClick={() => setStagingFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    stagingFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs font-black'
                      : 'text-slate-600'
                  }`}
                >
                  All ({stagedContacts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStagingFilter('new')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    stagingFilter === 'new'
                      ? 'bg-white text-emerald-800 shadow-xs font-black'
                      : 'text-slate-600'
                  }`}
                >
                  New Only
                </button>
                <button
                  type="button"
                  onClick={() => setStagingFilter('duplicate')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    stagingFilter === 'duplicate'
                      ? 'bg-white text-amber-800 shadow-xs font-black'
                      : 'text-slate-600'
                  }`}
                >
                  Duplicates
                </button>
              </div>
            </div>
          </div>

          {/* Staging Search Input */}
          <input
            type="text"
            placeholder="Filter staged contacts by name, phone, or verified title..."
            value={stagingSearchTerm}
            onChange={e => setStagingSearchTerm(e.target.value)}
            className="w-full border border-slate-200 rounded-xl p-2.5 text-xs bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none"
          />

          {/* Staged Contacts List / Cards */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {filteredStagedContacts.map(contact => (
              <div
                key={contact.id}
                className={`p-4 rounded-2xl border transition-all text-xs ${
                  contact.isDuplicate
                    ? 'bg-amber-50/50 border-amber-200'
                    : contact.selected
                    ? 'bg-white border-slate-300 shadow-xs'
                    : 'bg-slate-50/70 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={contact.selected}
                    onChange={() => handleToggleSelectStaged(contact.id)}
                    className="mt-1.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />

                  <div className="flex-1 space-y-2.5">
                    {/* Row Top Header */}
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {contact.isBusiness && (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 rounded border border-emerald-200">
                            🏢 Business Account
                          </span>
                        )}
                        <span className="text-slate-500 font-mono font-bold">
                          📱 {contact.phone || 'No phone'}
                        </span>
                        {contact.status && (
                          <span className="text-[10px] text-slate-400 italic">
                            ({contact.status})
                          </span>
                        )}
                      </div>

                      {contact.isDuplicate && (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase px-2 py-0.5 rounded">
                          ⚠️ {contact.duplicateReason}
                        </span>
                      )}
                    </div>

                    {/* Inputs Grid: Company Name, Contact Person, and Category */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Company / Vendor Name
                        </label>
                        <input
                          type="text"
                          value={contact.chosenName}
                          onChange={e =>
                            handleUpdateStagedRow(
                              contact.id,
                              'chosenName',
                              e.target.value
                            )
                          }
                          className="w-full border border-slate-200 rounded-lg p-2 font-bold text-slate-900 text-xs bg-white"
                          placeholder="Company Name"
                        />
                        {contact.verifiedName &&
                          contact.originalName &&
                          contact.verifiedName !== contact.originalName && (
                            <div className="flex gap-1.5 mt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStagedRow(
                                    contact.id,
                                    'chosenName',
                                    contact.verifiedName
                                  )
                                }
                                className="text-[9px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded font-bold"
                              >
                                Use Verified: "{contact.verifiedName}"
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStagedRow(
                                    contact.id,
                                    'chosenName',
                                    contact.originalName
                                  )
                                }
                                className="text-[9px] text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-1.5 py-0.5 rounded font-bold"
                              >
                                Use Contact: "{contact.originalName}"
                              </button>
                            </div>
                          )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Contact Person
                        </label>
                        <input
                          type="text"
                          value={contact.contactPerson}
                          onChange={e =>
                            handleUpdateStagedRow(
                              contact.id,
                              'contactPerson',
                              e.target.value
                            )
                          }
                          className="w-full border border-slate-200 rounded-lg p-2 text-slate-800 text-xs bg-white"
                          placeholder="Contact Person Name"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Category / Classification
                        </label>
                        <select
                          value={contact.category}
                          onChange={e =>
                            handleUpdateStagedRow(
                              contact.id,
                              'category',
                              e.target.value
                            )
                          }
                          className="w-full border border-slate-200 rounded-lg p-2 text-slate-900 text-xs bg-white font-bold"
                        >
                          {COMPANY_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filteredStagedContacts.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No staged contacts matching your filter.
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsMigrationModalOpen(false)}
              className="text-slate-600 hover:text-slate-900 font-bold text-xs"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCommitMigration}
              className="w-full sm:w-auto bg-[#8EBF45] hover:bg-[#658C3E] hover:text-white text-[#0D0D0D] px-8 py-3 rounded-xl font-black uppercase tracking-wider text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <span>🚀</span>
              <span>
                Import{' '}
                {stagedContacts.filter(c => c.selected && c.chosenName.trim()).length}{' '}
                Verified Contacts to Database
              </span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CompanyProfiles;
