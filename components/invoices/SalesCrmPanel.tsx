import React, { useState, useMemo, useEffect } from 'react';
import type { User, Lead, LeadStage, LeadLostReason, EmployeeTask, CompanyProfile } from '../../types';
import { supabase } from '../../supabaseClient';
import { 
  PlusCircle, 
  Search, 
  Trash2, 
  CheckCircle, 
  Calendar, 
  Mail, 
  Building, 
  X
} from './Icons';

const PhoneIcon = ({ size = 12, className = '' }: { size?: number; className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

interface SalesCrmPanelProps {
  currentUser: User | null;
  users?: User[];
  companyProfiles?: CompanyProfile[];
  employeeTasks?: EmployeeTask[];
  setEmployeeTasks?: React.Dispatch<React.SetStateAction<EmployeeTask[]>>;
  addLogEntry?: (action: string, details: string) => void;
  onNavigateToInvoiceMaker?: () => void;
}

const STAGES: { id: LeadStage; title: string; color: string; bg: string; border: string; badge: string }[] = [
  { id: 'new_lead', title: 'New Lead / Inquiry', color: 'text-blue-700', bg: 'bg-blue-50/70', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800' },
  { id: 'follow_up', title: 'Follow-Up (Discovery)', color: 'text-amber-700', bg: 'bg-amber-50/70', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  { id: 'quotation_sent', title: 'Quotation Sent', color: 'text-purple-700', bg: 'bg-purple-50/70', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800' },
  { id: 'negotiation', title: 'Negotiation / Revision', color: 'text-orange-700', bg: 'bg-orange-50/70', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-800' },
  { id: 'proforma_issued', title: 'PI Issued', color: 'text-teal-700', bg: 'bg-teal-50/70', border: 'border-teal-200', badge: 'bg-teal-100 text-teal-800' },
  { id: 'won', title: 'Payment Received / Won', color: 'text-emerald-700', bg: 'bg-emerald-50/70', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800' },
  { id: 'lost', title: 'Closed / Lost', color: 'text-rose-700', bg: 'bg-rose-50/70', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-800' },
];

const LOST_REASONS: { id: LeadLostReason; label: string }[] = [
  { id: 'pricing', label: 'Pricing / Budget Constraints' },
  { id: 'competitor', label: 'Competitor Chosen' },
  { id: 'specs_mismatch', label: 'Technical Specifications Mismatch' },
  { id: 'client_delayed', label: 'Client Project Delayed / Postponed' },
  { id: 'unresponsive', label: 'Client Unresponsive / Dropped Out' },
  { id: 'other', label: 'Other Reason' },
];

const DEFAULT_LEADS: Lead[] = [
  {
    id: 'lead-1001',
    dealNumber: 'DEAL-1001',
    companyName: 'SolarTech Microgrid Solutions',
    contactPerson: 'Rajesh Verma',
    phone: '+91 98201 44521',
    email: 'rajesh@solartech.in',
    gstin: '27AABCS1429B1Z8',
    address: 'MIDC Industrial Area, Pune, Maharashtra',
    estimatedValue: 350000,
    productInterest: '48V 100Ah LiFePO4 ESS Pack',
    stage: 'new_lead',
    assignedTo: 'admin',
    assignedBy: 'admin',
    nextFollowUpDate: new Date().toISOString().split('T')[0],
    nextFollowUpNote: 'Understand requirements & load profile',
    notes: [
      { id: 'n1', text: 'Inquiry received via website form for 3 microgrid backup units.', author: 'admin', date: '2026-10-04' }
    ],
    createdAt: '2026-10-04',
    updatedAt: '2026-10-04'
  },
  {
    id: 'lead-1002',
    dealNumber: 'DEAL-1002',
    companyName: 'Voltz Fleet Logistics',
    contactPerson: 'Karan Sharma',
    phone: '+91 97112 88902',
    email: 'karan.s@voltzfleet.com',
    gstin: '29AAACV5421C1Z3',
    address: 'Peenya Industrial Area, Bengaluru, Karnataka',
    estimatedValue: 820000,
    productInterest: '60V 120Ah EV 3-Wheeler Battery Packs',
    stage: 'follow_up',
    assignedTo: 'admin',
    assignedBy: 'admin',
    nextFollowUpDate: new Date().toISOString().split('T')[0],
    nextFollowUpNote: 'Technical parameters discussion call today',
    notes: [
      { id: 'n2', text: 'Client requested battery dimensions and CAN bus BMS protocol details.', author: 'sales', date: '2026-10-03' }
    ],
    createdAt: '2026-10-02',
    updatedAt: '2026-10-03'
  },
  {
    id: 'lead-1003',
    dealNumber: 'DEAL-1003',
    companyName: 'GreenVolt Energy Systems',
    contactPerson: 'Pooja Nair',
    phone: '+91 94471 23901',
    email: 'pnair@greenvolt.co.in',
    gstin: '32AABCG9123D1Z4',
    address: 'Kinfra Park, Kochi, Kerala',
    estimatedValue: 540000,
    productInterest: '10kWh Residential Solar ESS',
    stage: 'quotation_sent',
    assignedTo: 'admin',
    assignedBy: 'admin',
    nextFollowUpDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    nextFollowUpNote: 'Follow up on Quotation #QT-2627-014',
    notes: [
      { id: 'n3', text: 'Formal quotation sent via Invoice Maker. Client reviewing with management.', author: 'sales', date: '2026-10-04' }
    ],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-04'
  },
  {
    id: 'lead-1004',
    dealNumber: 'DEAL-1004',
    companyName: 'Nexus Renewable Infra',
    contactPerson: 'Anand Kulkarni',
    phone: '+91 98811 34120',
    email: 'anand@nexusinfra.com',
    gstin: '27AABCN8831E1Z9',
    address: 'Chakan MIDC Phase 2, Pune',
    estimatedValue: 1400000,
    productInterest: '50kWh Industrial Rack Mount ESS',
    stage: 'negotiation',
    assignedTo: 'admin',
    assignedBy: 'admin',
    nextFollowUpDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    nextFollowUpNote: 'Discuss 5% advance payment discount',
    notes: [
      { id: 'n4', text: 'Client requested revised pricing for order of 2 units.', author: 'sales', date: '2026-10-03' }
    ],
    createdAt: '2026-09-28',
    updatedAt: '2026-10-03'
  },
  {
    id: 'lead-1005',
    dealNumber: 'DEAL-1005',
    companyName: 'Apex Telecom Towers Ltd',
    contactPerson: 'Vikram Joshi',
    phone: '+91 99200 12874',
    email: 'vjoshi@apextower.in',
    gstin: '07AAACA4412F1Z1',
    address: 'Okhla Phase 3, New Delhi',
    estimatedValue: 1150000,
    productInterest: '48V 200Ah Telecom Tower Replacement Packs',
    stage: 'won',
    assignedTo: 'admin',
    assignedBy: 'admin',
    notes: [
      { id: 'n5', text: '100% advance payment confirmed. Order dispatched to production batch.', author: 'admin', date: '2026-10-04' }
    ],
    createdAt: '2026-09-25',
    updatedAt: '2026-10-04'
  }
];

export const SalesCrmPanel: React.FC<SalesCrmPanelProps> = ({
  currentUser,
  users = [],
  companyProfiles = [],
  employeeTasks = [],
  setEmployeeTasks,
  addLogEntry,
  onNavigateToInvoiceMaker
}) => {
  // Load leads from localStorage with fallback & clean legacy emails
  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem('bluamp_crm_leads');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((l: any) => ({
            ...l,
            assignedTo: l.assignedTo?.includes('@') ? (currentUser?.username || 'admin') : (l.assignedTo || 'admin')
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved leads, using defaults', e);
    }
    return DEFAULT_LEADS;
  });

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('bluamp_crm_leads', JSON.stringify(leads));
    } catch (e) {
      console.error('Failed to save leads to localStorage', e);
    }
  }, [leads]);

  // UI state
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRep, setFilterRep] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Modal for Lost reason
  const [lostDialogLeadId, setLostDialogLeadId] = useState<string | null>(null);
  const [lostReasonSelected, setLostReasonSelected] = useState<LeadLostReason>('pricing');
  const [lostNotesText, setLostNotesText] = useState('');

  // Drawer note text
  const [newNoteText, setNewNoteText] = useState('');

  // Follow-up form inside drawer
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [syncToHomeTasks, setSyncToHomeTasks] = useState(true);

  // New Lead Form State
  const [newLeadForm, setNewLeadForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
    estimatedValue: '',
    productInterest: '',
    stage: 'new_lead' as LeadStage,
    assignedTo: currentUser?.username || 'admin',
    initialNote: ''
  });

  const handleCompanyNameChange = (companyName: string) => {
    setNewLeadForm(prev => {
      const updated = { ...prev, companyName };
      const matched = companyProfiles.find(
        p => p.name?.trim().toLowerCase() === companyName.trim().toLowerCase()
      );
      if (matched) {
        if (matched.contactPerson && !prev.contactPerson) updated.contactPerson = matched.contactPerson;
        if (matched.phoneNumber && !prev.phone) updated.phone = matched.phoneNumber;
        if (matched.email && !prev.email) updated.email = matched.email;
        if ((matched.gstNumber || matched.gstin) && !prev.gstin) updated.gstin = matched.gstNumber || matched.gstin || '';
        if (matched.shippingAddress && !prev.address) updated.address = matched.shippingAddress;
      }
      return updated;
    });
  };

  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'billing';

  // Available sales reps
  const salesReps = useMemo(() => {
    const list = users.map(u => u.username).filter(Boolean);
    if (currentUser?.username && !list.includes(currentUser.username)) list.push(currentUser.username);
    if (!list.includes('admin')) list.push('admin');
    if (!list.includes('sales')) list.push('sales');
    return Array.from(new Set(list)).sort();
  }, [users, currentUser]);

  // Selected lead
  const selectedLead = useMemo(() => {
    return leads.find(l => l.id === selectedLeadId) || null;
  }, [leads, selectedLeadId]);

  // Sync drawer follow-up state when selectedLead changes
  useEffect(() => {
    if (selectedLead) {
      setFollowUpDate(selectedLead.nextFollowUpDate || '');
      setFollowUpNote(selectedLead.nextFollowUpNote || '');
    }
  }, [selectedLead]);

  // Filtered leads based on search & rep visibility
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Role-based visibility:
      // If not admin, rep only sees their own assigned leads!
      if (!isAdminOrManager && lead.assignedTo && currentUser?.username && lead.assignedTo !== currentUser.username) {
        return false;
      }

      // Admin filter by rep
      if (isAdminOrManager && filterRep !== 'all' && lead.assignedTo !== filterRep) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = lead.companyName.toLowerCase().includes(q);
        const matchContact = lead.contactPerson.toLowerCase().includes(q);
        const matchPhone = lead.phone.toLowerCase().includes(q);
        const matchDeal = lead.dealNumber.toLowerCase().includes(q);
        const matchProduct = (lead.productInterest || '').toLowerCase().includes(q);
        if (!matchName && !matchContact && !matchPhone && !matchDeal && !matchProduct) return false;
      }

      return true;
    });
  }, [leads, isAdminOrManager, filterRep, currentUser?.username, searchQuery]);

  // Move deal to new stage
  const handleUpdateStage = (leadId: string, newStage: LeadStage) => {
    if (newStage === 'lost') {
      setLostDialogLeadId(leadId);
      setLostReasonSelected('pricing');
      setLostNotesText('');
      return;
    }

    setLeads(prev => prev.map(l => {
      if (l.id === leadId) {
        const updatedNotes = [...(l.notes || [])];
        const oldStageTitle = STAGES.find(s => s.id === l.stage)?.title || l.stage;
        const newStageTitle = STAGES.find(s => s.id === newStage)?.title || newStage;
        updatedNotes.push({
          id: `note-${Date.now()}`,
          text: `Stage changed from "${oldStageTitle}" to "${newStageTitle}".`,
          author: currentUser?.username || 'system',
          date: new Date().toISOString().split('T')[0]
        });
        return {
          ...l,
          stage: newStage,
          lostReason: undefined,
          lostNotes: undefined,
          notes: updatedNotes,
          updatedAt: new Date().toISOString().split('T')[0]
        };
      }
      return l;
    }));

    if (addLogEntry) {
      const lead = leads.find(l => l.id === leadId);
      addLogEntry('Updated Lead Stage', `Moved deal ${lead?.dealNumber || leadId} to ${newStage}`);
    }
  };

  // Confirm Lost Stage
  const handleConfirmLost = () => {
    if (!lostDialogLeadId) return;

    setLeads(prev => prev.map(l => {
      if (l.id === lostDialogLeadId) {
        const updatedNotes = [...(l.notes || [])];
        const reasonObj = LOST_REASONS.find(r => r.id === lostReasonSelected);
        updatedNotes.push({
          id: `note-${Date.now()}`,
          text: `Deal marked Closed / Lost. Reason: ${reasonObj?.label || lostReasonSelected}. ${lostNotesText ? `Notes: ${lostNotesText}` : ''}`,
          author: currentUser?.username || 'system',
          date: new Date().toISOString().split('T')[0]
        });
        return {
          ...l,
          stage: 'lost',
          lostReason: lostReasonSelected,
          lostNotes: lostNotesText,
          notes: updatedNotes,
          updatedAt: new Date().toISOString().split('T')[0]
        };
      }
      return l;
    }));

    setLostDialogLeadId(null);
  };

  // Assign lead to sales rep (Admin only)
  const handleAssignRep = (leadId: string, repUsername: string) => {
    setLeads(prev => prev.map(l => {
      if (l.id === leadId) {
        const updatedNotes = [...(l.notes || [])];
        updatedNotes.push({
          id: `note-${Date.now()}`,
          text: `Lead assigned to ${repUsername} by ${currentUser?.username || 'admin'}.`,
          author: currentUser?.username || 'admin',
          date: new Date().toISOString().split('T')[0]
        });
        return {
          ...l,
          assignedTo: repUsername,
          assignedBy: currentUser?.username || 'admin',
          notes: updatedNotes,
          updatedAt: new Date().toISOString().split('T')[0]
        };
      }
      return l;
    }));

    if (addLogEntry) {
      addLogEntry('Assigned Lead', `Assigned deal to ${repUsername}`);
    }
  };

  // Add new note
  const handleAddNote = () => {
    if (!selectedLeadId || !newNoteText.trim()) return;

    setLeads(prev => prev.map(l => {
      if (l.id === selectedLeadId) {
        const updatedNotes = [...(l.notes || [])];
        updatedNotes.push({
          id: `note-${Date.now()}`,
          text: newNoteText.trim(),
          author: currentUser?.username || 'user',
          date: new Date().toISOString().split('T')[0]
        });
        return {
          ...l,
          notes: updatedNotes,
          updatedAt: new Date().toISOString().split('T')[0]
        };
      }
      return l;
    }));

    setNewNoteText('');
  };

  // Schedule follow-up & sync directly to Home Tasks
  const handleSaveFollowUp = () => {
    if (!selectedLead) return;

    setLeads(prev => prev.map(l => {
      if (l.id === selectedLead.id) {
        const updatedNotes = [...(l.notes || [])];
        if (followUpDate) {
          updatedNotes.push({
            id: `note-${Date.now()}`,
            text: `Follow-up scheduled for ${followUpDate}. Note: ${followUpNote || 'Follow-up call'}`,
            author: currentUser?.username || 'user',
            date: new Date().toISOString().split('T')[0]
          });
        }
        return {
          ...l,
          nextFollowUpDate: followUpDate || undefined,
          nextFollowUpNote: followUpNote || undefined,
          notes: updatedNotes,
          updatedAt: new Date().toISOString().split('T')[0]
        };
      }
      return l;
    }));

    // Sync to Home Page Tasks (employee_tasks)
    if (syncToHomeTasks && followUpDate && setEmployeeTasks) {
      const newTask: EmployeeTask = {
        id: `task-followup-${Date.now()}`,
        title: `Follow-up: ${selectedLead.companyName} (${selectedLead.contactPerson})`,
        description: `Deal ${selectedLead.dealNumber} [${STAGES.find(s => s.id === selectedLead.stage)?.title}] • ${followUpNote || 'Follow-up call'}`,
        assigned_to: selectedLead.assignedTo || currentUser?.username || 'admin',
        due_date: followUpDate,
        completed: false,
        created_at: Date.now(),
        created_by: currentUser?.username || 'Sales CRM'
      };

      setEmployeeTasks(prev => [newTask, ...prev]);

      // Also try to push to Supabase employee_tasks table
      supabase.from('employee_tasks').insert([newTask]).then(({ error }) => {
        if (error) console.warn('Note: employee_tasks synced locally');
      });
    }

    alert('✅ Follow-up saved! Task has been added to the Home page task list.');
  };

  // Create New Lead
  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadForm.companyName.trim()) return;

    const val = parseFloat(newLeadForm.estimatedValue) || 0;
    const dealNum = `DEAL-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toISOString().split('T')[0];

    const initialNotes = [];
    if (newLeadForm.initialNote.trim()) {
      initialNotes.push({
        id: `note-${Date.now()}`,
        text: newLeadForm.initialNote.trim(),
        author: currentUser?.username || 'admin',
        date: today
      });
    }

    const created: Lead = {
      id: `lead-${Date.now()}`,
      dealNumber: dealNum,
      companyName: newLeadForm.companyName.trim(),
      contactPerson: newLeadForm.contactPerson.trim(),
      phone: newLeadForm.phone.trim(),
      email: newLeadForm.email.trim(),
      gstin: newLeadForm.gstin.trim() || undefined,
      address: newLeadForm.address.trim() || undefined,
      estimatedValue: val,
      productInterest: newLeadForm.productInterest.trim() || undefined,
      stage: newLeadForm.stage,
      assignedTo: newLeadForm.assignedTo,
      assignedBy: currentUser?.username || 'admin',
      notes: initialNotes,
      createdAt: today,
      updatedAt: today
    };

    setLeads(prev => [created, ...prev]);
    setIsAddModalOpen(false);

    // Reset
    setNewLeadForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      gstin: '',
      address: '',
      estimatedValue: '',
      productInterest: '',
      stage: 'new_lead',
      assignedTo: currentUser?.username || 'admin',
      initialNote: ''
    });

    if (addLogEntry) {
      addLogEntry('Created Lead', `Added new deal ${dealNum} for ${created.companyName}`);
    }
  };

  // Delete lead
  const handleDeleteLead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this deal from the pipeline?')) return;
    setLeads(prev => prev.filter(l => l.id !== id));
    if (selectedLeadId === id) setSelectedLeadId(null);
  };

  const formatINR = (val: number) => {
    return '₹' + (val || 0).toLocaleString('en-IN');
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in relative min-h-[700px]">
      {/* 1. TOP HEADER & METRICS */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>🤝</span> Customer Management & Sales Pipeline
            </h2>
            <span className="bg-[#205f64]/10 text-[#205f64] text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-[#205f64]/20">
              7 Stages
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Track potential customers through every stage of the sales cycle, assign deals, and manage follow-ups.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-[#205f64] hover:bg-[#18484c] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition flex items-center gap-1.5 active:scale-95 shrink-0"
        >
          <PlusCircle size={15} /> New Lead
        </button>
      </div>

      {/* 2. FILTER & CONTROLS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search company, contact, deal #..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-[#205f64] focus:ring-1 focus:ring-[#205f64]"
            />
          </div>

          {/* Admin Sales Rep Filter */}
          {isAdminOrManager && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Rep:</span>
              <select
                value={filterRep}
                onChange={e => setFilterRep(e.target.value)}
                className="py-1.5 px-2.5 border border-slate-200 rounded-lg text-xs font-semibold bg-white outline-none focus:border-[#205f64]"
              >
                <option value="all">All Sales Reps</option>
                {salesReps.map(rep => (
                  <option key={rep} value={rep}>{rep.split('@')[0]}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1 rounded font-bold transition ${viewMode === 'kanban' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
          >
            Board (7 Stages)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded font-bold transition ${viewMode === 'list' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
          >
            List Table
          </button>
        </div>
      </div>

      {/* 3. KANBAN BOARD VIEW (7 STAGES) */}
      {viewMode === 'kanban' ? (
        <div className="overflow-x-auto pb-4 no-scrollbar">
          <div className="flex gap-3.5 min-w-[1550px] items-start">
            {STAGES.map(stage => {
              const stageLeads = filteredLeads.filter(l => l.stage === stage.id);
              const todayStr = new Date().toISOString().split('T')[0];

              return (
                <div
                  key={stage.id}
                  className={`w-[215px] shrink-0 rounded-2xl border ${stage.border} ${stage.bg} p-2.5 flex flex-col max-h-[750px] shadow-2xs`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 mb-2.5">
                    <h3 className={`text-xs font-black ${stage.color} tracking-tight`}>{stage.title}</h3>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${stage.badge}`}>
                      {stageLeads.length}
                    </span>
                  </div>

                  {/* Cards Container */}
                  <div className="space-y-2.5 overflow-y-auto pr-1 flex-1 no-scrollbar min-h-[120px]">
                    {stageLeads.length === 0 ? (
                      <div className="p-4 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-[11px]">
                        No deals
                      </div>
                    ) : (
                      stageLeads.map(lead => {
                        const isDueToday = lead.nextFollowUpDate === todayStr;
                        const isOverdue = lead.nextFollowUpDate && lead.nextFollowUpDate < todayStr;

                        return (
                          <div
                            key={lead.id}
                            onClick={() => setSelectedLeadId(lead.id)}
                            className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-[#205f64]/50 transition-all cursor-pointer group relative"
                          >
                            {/* Card Top: Deal # & Dropdown */}
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="font-mono font-bold text-slate-400">{lead.dealNumber}</span>
                              {/* 1-Click Stage Changer */}
                              <select
                                value={lead.stage}
                                onClick={e => e.stopPropagation()}
                                onChange={e => handleUpdateStage(lead.id, e.target.value as LeadStage)}
                                className="text-[9px] font-bold py-0.5 px-1 bg-slate-50 border border-slate-200 rounded text-slate-600 outline-none hover:border-slate-400 cursor-pointer"
                              >
                                {STAGES.map(s => (
                                  <option key={s.id} value={s.id}>{s.title}</option>
                                ))}
                              </select>
                            </div>

                            {/* Company Name */}
                            <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-[#205f64] transition line-clamp-1">
                              {lead.companyName}
                            </h4>

                            {/* Contact Person */}
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              👤 {lead.contactPerson}
                            </p>

                            {/* Product Requirement */}
                            {lead.productInterest && (
                              <p className="text-[10px] text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 line-clamp-1 mt-1 font-medium">
                                🔋 {lead.productInterest}
                              </p>
                            )}

                            {/* Assignee */}
                            <div className="flex items-center justify-end mt-2 pt-2 border-t border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase truncate" title={lead.assignedTo}>
                                👤 {lead.assignedTo?.split('@')[0] || 'Unassigned'}
                              </span>
                            </div>

                            {/* Follow-Up Warning Badge */}
                            {lead.nextFollowUpDate && lead.stage !== 'won' && lead.stage !== 'lost' && (
                              <div className="mt-1.5">
                                {isDueToday ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                    ⚠️ Due Today
                                  </span>
                                ) : isOverdue ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                                    🚨 Overdue
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-medium text-slate-400">
                                    📅 {lead.nextFollowUpDate}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Lost Reason Pill */}
                            {lead.stage === 'lost' && lead.lostReason && (
                              <div className="mt-1.5 text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                Reason: {LOST_REASONS.find(r => r.id === lead.lostReason)?.label || lead.lostReason}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* 4. LIST TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">Deal #</th>
                <th className="p-3">Company</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Stage</th>
                <th className="p-3">Assigned To</th>
                <th className="p-3">Next Follow-Up</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">No leads found.</td>
                </tr>
              ) : (
                filteredLeads.map(lead => {
                  const currentStageObj = STAGES.find(s => s.id === lead.stage);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="p-3 font-mono font-bold text-slate-400">{lead.dealNumber}</td>
                      <td className="p-3 font-bold text-slate-900">{lead.companyName}</td>
                      <td className="p-3">
                        <div>{lead.contactPerson}</div>
                        <div className="text-[10px] text-slate-400">{lead.phone}</div>
                      </td>
                      <td className="p-3" onClick={e => e.stopPropagation()}>
                        <select
                          value={lead.stage}
                          onChange={e => handleUpdateStage(lead.id, e.target.value as LeadStage)}
                          className={`text-xs font-bold px-2 py-1 rounded-lg border outline-none ${currentStageObj?.badge} ${currentStageObj?.border}`}
                        >
                          {STAGES.map(s => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 font-semibold text-slate-600">
                        {lead.assignedTo?.split('@')[0] || 'Unassigned'}
                      </td>
                      <td className="p-3 text-[11px]">
                        {lead.nextFollowUpDate ? (
                          <span className="font-semibold text-slate-700">{lead.nextFollowUpDate}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="px-2 py-1 bg-slate-100 hover:bg-[#205f64] hover:text-white rounded text-[11px] font-bold text-slate-700 transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. SLIDE-OUT CUSTOMER DETAIL DRAWER */}
      {selectedLead && (
        <div className="fixed inset-0 z-[150] flex justify-end bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400">{selectedLead.dealNumber}</span>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${STAGES.find(s => s.id === selectedLead.stage)?.badge}`}>
                    {STAGES.find(s => s.id === selectedLead.stage)?.title}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-1">{selectedLead.companyName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLeadId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Stage & Assigned Rep */}
              <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Stage</label>
                  <select
                    value={selectedLead.stage}
                    onChange={e => handleUpdateStage(selectedLead.id, e.target.value as LeadStage)}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold bg-white text-slate-800 outline-none focus:border-[#205f64]"
                  >
                    {STAGES.map(s => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Assigned Rep</label>
                  {isAdminOrManager ? (
                    <select
                      value={selectedLead.assignedTo}
                      onChange={e => handleAssignRep(selectedLead.id, e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold bg-white text-slate-800 outline-none focus:border-[#205f64]"
                    >
                      {salesReps.map(rep => (
                        <option key={rep} value={rep}>{rep}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="font-bold text-slate-700 p-2 bg-white border border-slate-200 rounded-lg text-xs">
                      {selectedLead.assignedTo || 'Unassigned'}
                    </div>
                  )}
                </div>
              </div>

              {/* Client Info */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Client Info</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Contact Person</span>
                    <span className="font-bold text-slate-800">{selectedLead.contactPerson}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Phone</span>
                    <a href={`tel:${selectedLead.phone}`} className="font-bold text-blue-600 hover:underline flex items-center gap-1">
                      <PhoneIcon size={11} /> {selectedLead.phone}
                    </a>
                  </div>
                  {selectedLead.email && (
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Email</span>
                      <a href={`mailto:${selectedLead.email}`} className="font-bold text-blue-600 hover:underline flex items-center gap-1 truncate">
                        <Mail size={11} /> {selectedLead.email}
                      </a>
                    </div>
                  )}
                  {selectedLead.gstin && (
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">GSTIN</span>
                      <span className="font-mono font-bold text-slate-700">{selectedLead.gstin}</span>
                    </div>
                  )}
                </div>

                {selectedLead.address && (
                  <div className="pt-0.5">
                    <span className="text-[10px] text-slate-400 block font-semibold">Address</span>
                    <span className="text-slate-600 text-xs">{selectedLead.address}</span>
                  </div>
                )}

                {selectedLead.productInterest && (
                  <div className="p-2 bg-blue-50/60 border border-blue-100 rounded-lg text-xs">
                    <span className="text-[10px] text-blue-600 block font-bold uppercase">Requirement</span>
                    <span className="font-semibold text-slate-800">{selectedLead.productInterest}</span>
                  </div>
                )}
              </div>

              {/* Next Follow-Up */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                    <Calendar size={12} /> Next Follow-Up
                  </h4>
                  {selectedLead.nextFollowUpDate && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                      {selectedLead.nextFollowUpDate}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={e => setFollowUpDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-[#205f64] font-semibold"
                  />
                  <input
                    type="text"
                    placeholder="Follow-up agenda/note..."
                    value={followUpNote}
                    onChange={e => setFollowUpNote(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-[#205f64]"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncToHomeTasks}
                      onChange={e => setSyncToHomeTasks(e.target.checked)}
                      className="rounded text-[#205f64] focus:ring-[#205f64]"
                    />
                    <span>Sync to Home tasks</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveFollowUp}
                    className="px-3.5 py-1.5 bg-[#205f64] hover:bg-[#18484c] text-white rounded-lg font-bold text-xs shadow-xs transition"
                  >
                    Save Follow-Up
                  </button>
                </div>
              </div>

              {/* Notes & Activity Log */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Activity Notes</h4>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a call note..."
                    value={newNoteText}
                    onChange={e => setNewNoteText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }}
                    className="flex-1 p-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#205f64]"
                  />
                  <button
                    type="button"
                    onClick={handleAddNote}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs transition"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-1.5 mt-2 max-h-44 overflow-y-auto">
                  {(!selectedLead.notes || selectedLead.notes.length === 0) ? (
                    <p className="text-slate-400 text-xs text-center py-2">No notes yet.</p>
                  ) : (
                    selectedLead.notes.slice().reverse().map(note => (
                      <div key={note.id} className="p-2 bg-slate-50 border border-slate-200/60 rounded-lg text-xs">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                          <span className="font-bold text-slate-600">{note.author.split('@')[0]}</span>
                          <span>{note.date}</span>
                        </div>
                        <p className="text-slate-800">{note.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              {isAdminOrManager && (
                <button
                  type="button"
                  onClick={e => handleDeleteLead(selectedLead.id, e)}
                  className="text-rose-600 hover:text-rose-800 text-xs font-bold flex items-center gap-1"
                >
                  <Trash2 size={13} /> Delete Deal
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedLeadId(null)}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg text-xs transition ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: CLOSED / LOST REASON PROMPT */}
      {lostDialogLeadId && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-black text-rose-700 flex items-center gap-2">
              <span>⚠️</span> Mark Deal as Closed / Lost
            </h3>
            <p className="text-xs text-slate-600">
              Please specify the mandatory reason code for why this lead dropped out:
            </p>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-slate-400">Dropout Reason</label>
              <select
                value={lostReasonSelected}
                onChange={e => setLostReasonSelected(e.target.value as LeadLostReason)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-bold bg-white text-slate-800 outline-none focus:border-rose-500"
              >
                {LOST_REASONS.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-400">Notes (Optional)</label>
              <textarea
                rows={2}
                placeholder="Competitor quote, pricing gap details, or feedback..."
                value={lostNotesText}
                onChange={e => setLostNotesText(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLostDialogLeadId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLost}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition shadow-xs"
              >
                Confirm Closed / Lost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: CREATE NEW LEAD */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>➕</span> Create New Deal / Inquiry
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Company / Organization *</label>
                  <input
                    type="text" required
                    placeholder="e.g. GreenVolt Energy"
                    list="crm-companies-datalist"
                    value={newLeadForm.companyName}
                    onChange={e => handleCompanyNameChange(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-[#205f64]"
                  />
                  <datalist id="crm-companies-datalist">
                    {companyProfiles.map(p => (
                      <option key={p.id} value={p.name}>
                        {p.gstNumber || p.contactPerson ? `${p.contactPerson ? p.contactPerson + ' • ' : ''}${p.gstNumber || ''}` : ''}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Contact Person *</label>
                  <input
                    type="text" required
                    placeholder="e.g. Ramesh Kumar"
                    value={newLeadForm.contactPerson}
                    onChange={e => setNewLeadForm({ ...newLeadForm, contactPerson: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-[#205f64]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="tel" required
                    placeholder="+91 98765 43210"
                    value={newLeadForm.phone}
                    onChange={e => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-[#205f64]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="contact@company.com"
                    value={newLeadForm.email}
                    onChange={e => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-[#205f64]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Estimated Value (₹)</label>
                  <input
                    type="number" min="0" step="1000"
                    placeholder="e.g. 500000"
                    value={newLeadForm.estimatedValue}
                    onChange={e => setNewLeadForm({ ...newLeadForm, estimatedValue: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-[#205f64] font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Initial Stage</label>
                  <select
                    value={newLeadForm.stage}
                    onChange={e => setNewLeadForm({ ...newLeadForm, stage: e.target.value as LeadStage })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg font-bold bg-white outline-none focus:border-[#205f64]"
                  >
                    {STAGES.map(s => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Product Requirement / Interest</label>
                <input
                  type="text"
                  placeholder="e.g. 48V 100Ah ESS / EV 3-Wheeler Pack / Solar Inverter"
                  value={newLeadForm.productInterest}
                  onChange={e => setNewLeadForm({ ...newLeadForm, productInterest: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-[#205f64]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Company / Site Address</label>
                <input
                  type="text"
                  placeholder="e.g. Plot No 12, MIDC Bhosari, Pune, Maharashtra"
                  value={newLeadForm.address}
                  onChange={e => setNewLeadForm({ ...newLeadForm, address: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-[#205f64]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">GSTIN (Optional)</label>
                  <input
                    type="text"
                    placeholder="27AABC..."
                    value={newLeadForm.gstin}
                    onChange={e => setNewLeadForm({ ...newLeadForm, gstin: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg font-mono outline-none focus:border-[#205f64]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Assign To Sales Rep</label>
                  <select
                    value={newLeadForm.assignedTo}
                    onChange={e => setNewLeadForm({ ...newLeadForm, assignedTo: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg font-bold bg-white outline-none focus:border-[#205f64]"
                  >
                    {salesReps.map(rep => (
                      <option key={rep} value={rep}>{rep}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Initial Requirement Notes</label>
                <textarea
                  rows={2}
                  placeholder="Details about customer specifications, volume, budget, etc."
                  value={newLeadForm.initialNote}
                  onChange={e => setNewLeadForm({ ...newLeadForm, initialNote: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-[#205f64]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#205f64] hover:bg-[#18484c] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition shadow-xs"
                >
                  Create Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesCrmPanel;
