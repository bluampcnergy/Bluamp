
import React, { useState, useRef } from 'react';
import type { CompanyProfile } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TrashIcon } from './icons/TrashIcon';
import { ImportIcon } from './icons/ImportIcon';
import { Download } from 'lucide-react';
import Modal from './Modal';

interface CompanyProfilesProps {
  companyProfiles: CompanyProfile[];
  setCompanyProfiles: React.Dispatch<React.SetStateAction<CompanyProfile[]>>;
  addLogEntry: (action: string, details: string) => void;
  isIframe?: boolean;
}

const initialFormState: Omit<CompanyProfile, 'id'> = {
    name: '',
    gstNumber: '',
    shippingAddress: '',
    email: '',
    contactPerson: '',
    phoneNumber: ''
};

const CompanyProfiles: React.FC<CompanyProfilesProps> = ({ companyProfiles, setCompanyProfiles, addLogEntry, isIframe }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState(initialFormState);
    const [searchTerm, setSearchTerm] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const downloadCompanyProfilesTemplateCSV = () => {
        const csvContent = "Company Name,GST Number,Email,Contact Person,Phone Number,Shipping Address\nAcme Solar Ltd,27AAACA0000A1Z5,contact@acmesolar.com,John Doe,9876543210,\"123 Industrial Area, Pune, Maharashtra 411001\"";
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
            gstNumber: profile.gstNumber,
            shippingAddress: profile.shippingAddress,
            email: profile.email,
            contactPerson: profile.contactPerson,
            phoneNumber: profile.phoneNumber
        });
        setIsModalOpen(true);
    };

    const handleDelete = (id: string, name: string) => {
        if (confirm(`Are you sure you want to delete ${name}? This might affect records linking to this company.`)) {
            setCompanyProfiles(prev => prev.filter(p => p.id !== id));
            addLogEntry('Deleted Company', `Deleted company profile: ${name}`);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingId) {
            setCompanyProfiles(prev => prev.map(p => p.id === editingId ? { ...p, ...formData } : p));
            addLogEntry('Updated Company', `Updated company profile: ${formData.name}`);
        } else {
            const newProfile = {
                ...formData,
                id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
            };
            setCompanyProfiles(prev => [...prev, newProfile]);
            addLogEntry('Added Company', `Added new company profile: ${formData.name}`);
            
            // Notify parent if in iframe
            if (isIframe) {
                window.parent.postMessage({ type: 'COMPANY_ADDED', company: newProfile }, '*');
            }
        }
        setIsModalOpen(false);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result;
            if (typeof text === 'string') {
                parseAndImportCsv(text);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const parseAndImportCsv = (csvText: string) => {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            alert('CSV file is empty or has no data rows.');
            return;
        }

        const newProfiles: CompanyProfile[] = [];
        
        // Skip header
        lines.slice(1).forEach((line, index) => {
            if (!line.trim()) return;
            
            // Simple split, handling potential commas in address if it's the last column
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            
            if (values.length < 1) return;

            // Map based on required order
            const [name, gstNumber, email, contactPerson, phoneNumber, ...addressParts] = values;
            const shippingAddress = addressParts.join(', '); // Join remaining parts as address

            if (!name) return;

            newProfiles.push({
                id: `comp-import-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
                name: name,
                gstNumber: gstNumber || '',
                email: email || '',
                contactPerson: contactPerson || '',
                phoneNumber: phoneNumber || '',
                shippingAddress: shippingAddress || ''
            });
        });

        if (newProfiles.length > 0) {
            setCompanyProfiles(prev => [...prev, ...newProfiles]);
            addLogEntry('Imported Companies', `Imported ${newProfiles.length} company profiles via CSV.`);
            alert(`${newProfiles.length} companies imported successfully.`);
        } else {
             alert('No valid company data found.');
        }
    };

    const filteredProfiles = companyProfiles.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.gstNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isIframe) {
        return (
            <div className="p-6 bg-white min-h-screen flex flex-col justify-start">
                <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto flex flex-col h-full">
                    <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-1 md:col-span-2">
                            <h2 className="text-xl font-bold text-slate-800 mb-2 border-b pb-2">Add New Company</h2>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Company Name <span className="text-red-500">*</span></label>
                            <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg shadow-sm p-2.5 focus:ring-2 focus:ring-blue-500" required />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">GST Number</label>
                            <input type="text" name="gstNumber" value={formData.gstNumber} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg shadow-sm p-2.5 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Contact Person</label>
                            <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg shadow-sm p-2.5 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
                            <input type="text" name="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg shadow-sm p-2.5 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                            <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg shadow-sm p-2.5 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Shipping Address</label>
                            <textarea name="shippingAddress" value={formData.shippingAddress} onChange={handleInputChange} rows={3} className="w-full border border-slate-300 rounded-lg shadow-sm p-2.5 focus:ring-2 focus:ring-blue-500"></textarea>
                        </div>
                    </div>
                    <div className="mt-8 pt-4 border-t border-slate-200">
                        <button type="submit" className="w-full bg-[#8EBF45] hover:bg-[#729937] text-white p-3 rounded-lg flex items-center justify-center font-bold uppercase tracking-wider transition-colors shadow-md">
                            Save Company Profile
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Company Profiles</h1>
                    <p className="text-xs text-gray-500 mt-1">Manage client and vendor profile directories.</p>
                </div>
                <div className="flex space-x-2">
                    <button 
                        onClick={handleOpenAdd}
                        className="flex items-center bg-[#8EBF45] text-[#0D0D0D] px-4 py-2 rounded-lg shadow-md hover:bg-[#658C3E] hover:text-white transition-colors font-bold uppercase tracking-wide text-xs"
                    >
                        <PlusIcon />
                        <span className="ml-2">Add Company</span>
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

            {/* UNIFORM CSV CONTROL BAR */}
            <div className="mb-6 bg-slate-900 text-slate-100 rounded-2xl p-4 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md no-print">
                <div className="flex items-start gap-3">
                    <span className="text-xl">📄</span>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Required CSV Headers:</span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-300 mt-1 leading-relaxed flex flex-wrap gap-1.5 items-center">
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Company Name</span>
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">GST Number</span>
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Email</span>
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Contact Person</span>
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Phone Number</span>
                            <span className="bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-bold">Shipping Address</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 self-end md:self-auto shrink-0">
                    <button
                        onClick={downloadCompanyProfilesTemplateCSV}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                        title="Download sample CSV template with proper headers"
                    >
                        <span>💾 Download Template CSV</span>
                    </button>

                    <button
                        onClick={handleImportClick}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-2xs whitespace-nowrap flex items-center gap-1.5"
                        title="Import company profiles from CSV file"
                    >
                        <ImportIcon size={14} />
                        <span>Import CSV</span>
                    </button>
                </div>
            </div>

            <div className="mb-6">
                <input 
                    type="text" 
                    placeholder="Search companies..." 
                    className="block w-full p-3 pl-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#8EBF45] transition-shadow"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProfiles.map(profile => (
                    <div key={profile.id} className="bg-white rounded-lg shadow-md p-5 hover:shadow-lg transition-shadow relative">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-gray-900">{profile.name}</h3>
                            <div className="flex space-x-2">
                                <button onClick={() => handleEdit(profile)} className="text-gray-500 hover:text-[#658C3E] p-1 rounded-full hover:bg-[#A8BF75]/20">
                                    <PencilIcon />
                                </button>
                                <button onClick={() => handleDelete(profile.id, profile.name)} className="text-gray-500 hover:text-red-600 p-1 rounded-full hover:bg-red-50">
                                    <TrashIcon />
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600">
                            <p><span className="font-semibold text-gray-700">GST:</span> {profile.gstNumber}</p>
                            <p><span className="font-semibold text-gray-700">Contact:</span> {profile.contactPerson}</p>
                            <p><span className="font-semibold text-gray-700">Phone:</span> {profile.phoneNumber}</p>
                            <p><span className="font-semibold text-gray-700">Email:</span> <a href={`mailto:${profile.email}`} className="text-[#658C3E] hover:underline">{profile.email}</a></p>
                            <p className="border-t pt-2 mt-2"><span className="font-semibold text-gray-700 block mb-1">Address:</span> {profile.shippingAddress}</p>
                        </div>
                    </div>
                ))}
                {filteredProfiles.length === 0 && (
                    <div className="col-span-full text-center py-8 text-gray-500">
                        No company profiles found.
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Edit Company Profile" : "Add New Company Profile"}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Company Name <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">GST Number</label>
                        <input type="text" name="gstNumber" value={formData.gstNumber} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Contact Person</label>
                            <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Phone Number</label>
                            <input type="text" name="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Shipping Address</label>
                        <textarea name="shippingAddress" value={formData.shippingAddress} onChange={handleInputChange} rows={3} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"></textarea>
                    </div>
                    <div className="flex justify-end pt-4">
                        <button type="submit" className="bg-[#8EBF45] text-[#0D0D0D] px-4 py-2 rounded-lg hover:bg-[#658C3E] hover:text-white font-bold uppercase tracking-wide text-xs">Save Profile</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default CompanyProfiles;
