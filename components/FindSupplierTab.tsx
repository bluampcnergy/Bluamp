import React, { useState, useEffect } from 'react';
import { CompanyProfile } from '../types';
import { 
  SourcedSupplier, 
  searchSuppliersAcrossWeb, 
  enrichSupplierContactAI, 
  formatWhatsAppNumber,
  isHallucinatedOrDummyContact
} from '../services/supplierSearchService';

const CopyableContact: React.FC<{
  text: string;
  copyValue?: string;
  type: 'phone' | 'email';
  title?: string;
  maxWidthClass?: string;
}> = ({ text, copyValue, type, title, maxWidthClass = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const val = (copyValue || text || '').trim();
    if (!val) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(val);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = val;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <span className="inline-flex items-center gap-1 group/contact relative">
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Copied to clipboard!' : (title || `Click to copy ${type === 'phone' ? 'phone' : 'email'}`)}
        className="inline-flex items-center gap-1 text-left rounded px-1.5 py-0.5 -mx-1 hover:bg-slate-200/70 active:bg-slate-300 transition-colors cursor-pointer"
      >
        <span className={`font-semibold text-slate-800 ${maxWidthClass} hover:underline underline-offset-2 decoration-slate-400 select-all`}>
          {text}
        </span>
        <span
          className={`shrink-0 transition-colors p-0.5 rounded ${
            copied
              ? 'text-emerald-600 bg-emerald-100 ring-1 ring-emerald-300'
              : 'text-slate-400 group-hover/contact:text-slate-700 hover:bg-slate-200'
          }`}
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied ? (
            <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="13" height="13" x="9" y="9" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </span>
      </button>
      {copied && (
        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300 shadow-xs animate-fade-in">
          ✓ Copied!
        </span>
      )}
    </span>
  );
};

interface FindSupplierTabProps {
  companyProfiles: CompanyProfile[];
  setCompanyProfiles: React.Dispatch<React.SetStateAction<CompanyProfile[]>>;
  addLogEntry?: (action: string, details: string) => void;
  onOpenWebmail?: (to: string, subject: string, body?: string) => void;
}

export const FindSupplierTab: React.FC<FindSupplierTabProps> = ({
  companyProfiles,
  setCompanyProfiles,
  addLogEntry,
  onOpenWebmail,
}) => {
  const [city, setCity] = useState('Pune');
  const [productQuery, setProductQuery] = useState('3.2V 280Ah LFP Cell');
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [activeSourceFilter, setActiveSourceFilter] = useState<'all' | 'maps' | 'indiamart' | 'google' | 'other'>('all');
  const [viewMode, setViewMode] = useState<'search' | 'shortlist'>('search');

  const [suppliers, setSuppliers] = useState<SourcedSupplier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  // Quick categories
  const categories = [
    'Solar Cells',
    'BMS Modules',
    'Inverters',
    'LFP Batteries',
    'Enclosures',
    'Connectors',
    'Fasteners',
    'Wires & Cables'
  ];

  // Run search on mount
  useEffect(() => {
    handleSearch();
  }, []);

  const handleSearch = async (overrideProduct?: string, overrideRadius?: number) => {
    const queryToUse = overrideProduct || productQuery;
    const radiusToUse = overrideRadius !== undefined ? overrideRadius : radiusKm;
    if (!queryToUse.trim() || isLoading) return;

    setIsLoading(true);
    setNotification(null);

    try {
      const results = await searchSuppliersAcrossWeb(city, queryToUse, radiusToUse);
      
      // Retain shortlisted status if supplier was already shortlisted
      const updated = results.map(r => {
        const existing = suppliers.find(s => s.name.toLowerCase() === r.name.toLowerCase());
        return existing ? { ...r, isShortlisted: existing.isShortlisted, isAddedToDb: existing.isAddedToDb } : r;
      });

      setSuppliers(updated);
      showNotification('success', `Found ${results.length} suppliers for "${queryToUse}" within ${radiusToUse} km in ${city}`);
    } catch (err: any) {
      showNotification('error', `Search error: ${err.message || 'Failed to search'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnrichContact = async (supplierId: string) => {
    setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, isEnriching: true } : s));

    const target = suppliers.find(s => s.id === supplierId);
    if (!target) return;

    try {
      const enrichedData = await enrichSupplierContactAI(target, city);
      setSuppliers(prev => prev.map(s => {
        if (s.id === supplierId) {
          return {
            ...s,
            ...enrichedData,
            isEnriching: false
          };
        }
        return s;
      }));
      showNotification('info', `✨ Updated contact details for ${target.name}`);
    } catch (err) {
      setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, isEnriching: false } : s));
      showNotification('error', 'Failed to enrich contact info');
    }
  };

  const toggleShortlist = (supplierId: string) => {
    setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, isShortlisted: !s.isShortlisted } : s));
  };

  const showNotification = (type: 'success' | 'info' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Convert shortlisted candidates into CompanyProfile objects and save to state/db
  const handleAddSelectedToDatabase = (singleSupplierId?: string) => {
    const targets = singleSupplierId 
      ? suppliers.filter(s => s.id === singleSupplierId)
      : suppliers.filter(s => s.isShortlisted && !s.isAddedToDb);

    if (targets.length === 0) {
      showNotification('info', 'No new shortlisted suppliers selected to add.');
      return;
    }

    const newProfiles: CompanyProfile[] = [];
    let addedCount = 0;

    targets.forEach(sup => {
      // Check if profile already exists
      const exists = companyProfiles.some(p => p.name.toLowerCase() === sup.name.toLowerCase());
      
      const { cleanPhone } = formatWhatsAppNumber(sup.phoneNumber);
      const safePhone = isHallucinatedOrDummyContact(sup.phoneNumber) ? '' : (cleanPhone || sup.phoneNumber);
      const safeEmail = isHallucinatedOrDummyContact(sup.email) ? '' : sup.email;

      const profileToAdd: CompanyProfile = {
        id: `cp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: sup.name,
        gstNumber: sup.gstNumber || '',
        shippingAddress: sup.address || `${city}, India`,
        email: safeEmail || '',
        contactPerson: sup.contactPerson || 'Sales Department',
        phoneNumber: safePhone || '',
      };

      if (!exists) {
        newProfiles.push(profileToAdd);
      }
      addedCount++;
    });

    if (newProfiles.length > 0) {
      setCompanyProfiles(prev => [...prev, ...newProfiles]);
      if (addLogEntry) {
        addLogEntry('ADD_SUPPLIERS', `Imported ${newProfiles.length} new supplier profile(s) from web sourcing.`);
      }
    }

    // Mark as added in state
    const targetIds = targets.map(t => t.id);
    setSuppliers(prev => prev.map(s => targetIds.includes(s.id) ? { ...s, isAddedToDb: true, isShortlisted: true } : s));

    showNotification('success', `⚡ Successfully added ${addedCount} supplier profile(s) to company database!`);
  };

  const shortlistedList = suppliers.filter(s => s.isShortlisted);
  const mapsSuppliers = suppliers.filter(s => s.source === 'maps' || s.sourceLabel?.toLowerCase().includes('map'));
  const indiamartSuppliers = suppliers.filter(s => s.source === 'indiamart' || s.sourceLabel?.toLowerCase().includes('indiamart'));
  const googleSuppliers = suppliers.filter(s => s.source === 'google' || s.sourceLabel?.toLowerCase().includes('google') || s.sourceLabel?.toLowerCase().includes('web'));
  const otherSuppliers = suppliers.filter(s => s.source === 'tradeindia' || s.source === 'other' || s.sourceLabel?.toLowerCase().includes('director') || s.sourceLabel?.toLowerCase().includes('trade'));

  const filteredSuppliers = suppliers.filter(s => {
    if (activeSourceFilter === 'all') return true;
    if (activeSourceFilter === 'maps') return s.source === 'maps' || s.sourceLabel?.toLowerCase().includes('map');
    if (activeSourceFilter === 'indiamart') return s.source === 'indiamart' || s.sourceLabel?.toLowerCase().includes('indiamart');
    if (activeSourceFilter === 'google') return s.source === 'google' || s.sourceLabel?.toLowerCase().includes('google') || s.sourceLabel?.toLowerCase().includes('web');
    if (activeSourceFilter === 'other') return s.source === 'tradeindia' || s.source === 'other' || s.sourceLabel?.toLowerCase().includes('director') || s.sourceLabel?.toLowerCase().includes('trade');
    return true;
  });

  const mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(`${productQuery} suppliers in ${city} within ${radiusKm}km`)}&t=&z=12&ie=UTF8&iwloc=&output=embed`;

  return (
    <div className="flex flex-col h-full bg-slate-50 space-y-4">
      {/* NOTIFICATION TOAST */}
      {notification && (
        <div className={`px-4 py-3 rounded-xl text-xs font-bold shadow-lg flex items-center justify-between transition-all animate-in fade-in slide-in-from-top-2 ${
          notification.type === 'success' ? 'bg-emerald-500 text-white' :
          notification.type === 'info' ? 'bg-sky-500 text-white' :
          'bg-rose-500 text-white'
        }`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-white/80 hover:text-white font-black text-sm">✕</button>
        </div>
      )}

      {/* SEARCH HEADER & FILTERS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔍</span>
            <div>
              <h2 className="text-base font-bold text-slate-800">Find New Suppliers (AI & Maps Orchestrator)</h2>
              <p className="text-xs text-slate-500">Discover, enrich contact info, shortlist, and 1-tap import supplier company profiles</p>
            </div>
          </div>

          {/* VIEW SWITCHER & SHORTLIST BADGE */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('search')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'search' 
                  ? 'bg-slate-900 text-white shadow' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🌐 Sourcing Feed ({suppliers.length})
            </button>
            <button
              onClick={() => setViewMode('shortlist')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'shortlist' 
                  ? 'bg-[#8EBF45] text-slate-950 shadow-md' 
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <span>📋 Shortlist</span>
              <span className="bg-slate-950 text-white text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">
                {shortlistedList.length}
              </span>
            </button>
          </div>
        </div>

        {/* INPUT FORM & CATEGORIES */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
          {/* City Input */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">City / Region *</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">📍</span>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="e.g. Pune, Mumbai, Delhi"
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none"
              />
            </div>
          </div>

          {/* Product Query Box */}
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Product / Material Name *</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">📦</span>
              <input
                type="text"
                value={productQuery}
                onChange={e => setProductQuery(e.target.value)}
                placeholder="e.g. 3.2V 280Ah LFP Cell, 100A BMS, Solar Inverter"
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          {/* Radius / KM Range Selector */}
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Maps Radius *</label>
            <div className="relative">
              <span className="absolute left-2.5 top-2.5 text-slate-400 text-xs">🎯</span>
              <select
                value={radiusKm}
                onChange={e => {
                  const val = Number(e.target.value);
                  setRadiusKm(val);
                }}
                className="w-full pl-7 pr-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#8EBF45] outline-none cursor-pointer"
              >
                <option value={10}>10 km</option>
                <option value={25}>25 km (Default)</option>
                <option value={50}>50 km</option>
                <option value={100}>100 km</option>
                <option value={200}>200 km (Region)</option>
              </select>
            </div>
          </div>

          {/* Search Button */}
          <div className="md:col-span-3 flex items-end">
            <button
              onClick={() => handleSearch()}
              disabled={isLoading}
              className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Searching Maps & Web...</span>
                </>
              ) : (
                <>
                  <span>⚡ Sourcing Search</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* QUICK CATEGORY PILLS */}
        <div className="flex items-center gap-2 pt-1 overflow-x-auto scrollbar-hide">
          <span className="text-[11px] font-bold text-slate-400 shrink-0">Quick Filters:</span>
          {categories.map((cat, idx) => (
            <button
              key={idx}
              onClick={() => {
                setProductQuery(cat);
                handleSearch(cat);
              }}
              disabled={isLoading}
              className="text-[11px] font-semibold bg-slate-100 hover:bg-[#8EBF45] hover:text-slate-950 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* TOP STICKY BAR FOR SHORTLISTED ACTIONS */}
      {shortlistedList.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-3 rounded-2xl shadow-lg border border-slate-700 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="bg-[#8EBF45] text-slate-950 text-xs font-black px-2.5 py-1 rounded-lg">
              {shortlistedList.length} Shortlisted
            </span>
            <span className="text-xs text-slate-300">
              Ready to import company details into master inventory database
            </span>
          </div>

          {/* MAIN 1-TAP ADD BUTTON */}
          <button
            onClick={() => handleAddSelectedToDatabase()}
            className="px-5 py-2 bg-[#8EBF45] hover:bg-[#7cb037] text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 transform hover:scale-[1.02]"
          >
            <span>⚡ Add All Shortlisted ({shortlistedList.length}) to Database</span>
            <span>➔</span>
          </button>
        </div>
      )}

      {/* MAIN VIEW CONTENT AREA */}
      {viewMode === 'search' ? (
        /* SPLIT SCREEN WORKSPACE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-[500px]">
          {/* LEFT 40% — LIVE GOOGLE MAPS PLUGIN */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">📍</span>
                <h3 className="text-xs font-bold">Google Maps Live Plugin ({city} • {radiusKm}km)</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Interactive Location Map</span>
            </div>
            
            <div className="flex-1 w-full h-full min-h-[350px] bg-slate-100 relative">
              <iframe
                title="Google Maps Sourcing Search"
                src={mapEmbedUrl}
                className="w-full h-full border-none"
                loading="lazy"
                allowFullScreen
              />
            </div>
          </div>

          {/* RIGHT 60% — SOURCED CANDIDATE CARDS */}
          <div className="lg:col-span-7 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* SOURCE TABS HEADER */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveSourceFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    activeSourceFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({suppliers.length})
                </button>
                <button
                  onClick={() => setActiveSourceFilter('maps')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    activeSourceFilter === 'maps' ? 'bg-slate-900 text-white ring-2 ring-emerald-500/50' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                  title={`Google Maps Engine (${radiusKm} km radius) - Primary Engine`}
                >
                  <span>📍 Google Maps</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeSourceFilter === 'maps' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {mapsSuppliers.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveSourceFilter('indiamart')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    activeSourceFilter === 'indiamart' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                  title="IndiaMart Top 5"
                >
                  <span>🏭 IndiaMart</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeSourceFilter === 'indiamart' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {indiamartSuppliers.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveSourceFilter('google')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    activeSourceFilter === 'google' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                  title="Web Search Top 5"
                >
                  <span>🌐 Web Search</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeSourceFilter === 'google' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {googleSuppliers.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveSourceFilter('other')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    activeSourceFilter === 'other' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                  title="Directories Top 5"
                >
                  <span>📦 Directories</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeSourceFilter === 'other' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {otherSuppliers.length}
                  </span>
                </button>
              </div>
            </div>

            {/* CARDS SCROLLABLE FEED */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[600px] scrollbar-thin">
              {isLoading ? (
                <div className="py-20 text-center space-y-3">
                  <div className="w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs font-bold text-slate-600">AI Searching Google Maps, IndiaMart & Web Directories...</p>
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <span className="text-3xl">🔍</span>
                  <p className="text-xs font-semibold">No suppliers found for this filter. Try adjusting your product query.</p>
                </div>
              ) : (
                filteredSuppliers.map(sup => {
                  const { cleanPhone, waUrl } = formatWhatsAppNumber(sup.phoneNumber);
                  return (
                    <div 
                      key={sup.id}
                      className={`p-4 rounded-xl border transition-all ${
                        sup.isAddedToDb
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : sup.isShortlisted
                          ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-300'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-900">{sup.name}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                              {sup.sourceLabel}
                            </span>
                            {sup.rating && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                {sup.rating}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">📍 {sup.address}</p>
                        </div>

                        {/* SHORTLIST TOGGLE BUTTON */}
                        <button
                          onClick={() => toggleShortlist(sup.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                            sup.isShortlisted
                              ? 'bg-amber-400 text-slate-950 font-black shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {sup.isShortlisted ? '✓ Shortlisted' : '+ Shortlist'}
                        </button>
                      </div>

                      {/* CONTACT DETAILS & VERIFIED SEARCH LINKS */}
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* Phone / WhatsApp */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400 shrink-0">📱 Phone:</span>
                          {sup.phoneNumber ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <CopyableContact
                                text={cleanPhone || sup.phoneNumber}
                                copyValue={cleanPhone || sup.phoneNumber}
                                type="phone"
                                title="Click to copy phone number"
                              />
                              {waUrl && (
                                <a 
                                  href={waUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-emerald-600 hover:underline font-bold text-[11px] inline-flex items-center gap-0.5 ml-1"
                                  title="Open WhatsApp chat"
                                  onClick={e => e.stopPropagation()}
                                >
                                  💬 WhatsApp
                                </a>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-slate-400 italic text-[11px]">Not publicly listed</span>
                              <a
                                href={sup.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${sup.name} ${sup.address || city}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-800 hover:underline text-[10px] font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200"
                                title="View supplier place & phone on Google Maps"
                                onClick={e => e.stopPropagation()}
                              >
                                📍 Check Maps
                              </a>
                              <a
                                href={sup.indiaMartUrl || `https://www.indiamart.com/search.mp?ss=${encodeURIComponent(`${sup.name} ${productQuery}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-700 hover:text-emerald-900 hover:underline text-[10px] font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"
                                title="View supplier profile on IndiaMart"
                                onClick={e => e.stopPropagation()}
                              >
                                🏭 IndiaMart
                              </a>
                            </div>
                          )}
                        </div>

                        {/* Email Address */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400 shrink-0">📧 Email:</span>
                          {sup.email ? (
                            <CopyableContact
                              text={sup.email}
                              copyValue={sup.email}
                              type="email"
                              maxWidthClass="truncate max-w-[180px]"
                              title="Click to copy email address"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-slate-400 italic text-[11px]">Not publicly listed</span>
                              <a
                                href={sup.googleSearchUrl || `https://www.google.com/search?q=${encodeURIComponent(`${sup.name} ${city} contact phone email`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-600 hover:text-sky-800 hover:underline text-[10px] font-bold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200"
                                title="Search company contact details on Google"
                                onClick={e => e.stopPropagation()}
                              >
                                🌐 Search Web
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* FOOTER ACTIONS */}
                      <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        {/* AI ENRICHMENT BUTTON IF PHONE/EMAIL MISSING */}
                        {(!sup.phoneNumber || !sup.email) && (
                          <button
                            onClick={() => handleEnrichContact(sup.id)}
                            disabled={sup.isEnriching}
                            className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            {sup.isEnriching ? (
                              <>
                                <div className="w-2.5 h-2.5 border-2 border-sky-700 border-t-transparent rounded-full animate-spin"></div>
                                <span>AI Enriching...</span>
                              </>
                            ) : (
                              <>
                                <span>🔍 Find Info (AI)</span>
                              </>
                            )}
                          </button>
                        )}

                        <div className="ml-auto flex items-center gap-2">
                          {sup.isAddedToDb ? (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-100/80 px-2.5 py-1 rounded-lg flex items-center gap-1">
                              ✓ Saved in Database
                            </span>
                          ) : (
                            <button
                              onClick={() => handleAddSelectedToDatabase(sup.id)}
                              className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors shadow-sm flex items-center gap-1"
                            >
                              <span>⚡ 1-Tap Add to Database</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* SHORTLISTED TRAY VIEW */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Shortlisted Supplier Candidates ({shortlistedList.length})</h3>
              <p className="text-xs text-slate-500">Review selected suppliers before exporting or dispatching RFQs</p>
            </div>

            {shortlistedList.length > 0 && (
              <button
                onClick={() => handleAddSelectedToDatabase()}
                className="px-5 py-2.5 bg-[#8EBF45] hover:bg-[#7cb037] text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
              >
                <span>⚡ Add All Shortlisted ({shortlistedList.length}) to Database</span>
              </button>
            )}
          </div>

          {shortlistedList.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <span className="text-3xl">📋</span>
              <p className="text-xs font-semibold">No suppliers shortlisted yet. Switch back to Sourcing Feed and click "+ Shortlist".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shortlistedList.map(sup => {
                const { cleanPhone, waUrl } = formatWhatsAppNumber(sup.phoneNumber);
                return (
                  <div key={sup.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{sup.name}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                          {sup.sourceLabel}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleShortlist(sup.id)}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1.5">
                      <p>📍 <strong>Address:</strong> {sup.address}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-500 shrink-0">📱 <strong>Phone:</strong></span>
                        {sup.phoneNumber ? (
                          <CopyableContact
                            text={cleanPhone || sup.phoneNumber}
                            copyValue={cleanPhone || sup.phoneNumber}
                            type="phone"
                            title="Click to copy phone number"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="italic text-slate-400">Not listed</span>
                            <a
                              href={sup.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${sup.name} ${sup.address || city}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 hover:underline text-[10px] font-bold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200"
                            >
                              📍 Maps
                            </a>
                            <a
                              href={sup.indiaMartUrl || `https://www.indiamart.com/search.mp?ss=${encodeURIComponent(`${sup.name} ${productQuery}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 hover:text-emerald-900 hover:underline text-[10px] font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200"
                            >
                              🏭 IndiaMart
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-500 shrink-0">📧 <strong>Email:</strong></span>
                        {sup.email ? (
                          <CopyableContact
                            text={sup.email}
                            copyValue={sup.email}
                            type="email"
                            maxWidthClass="truncate max-w-[200px]"
                            title="Click to copy email address"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="italic text-slate-400">Not listed</span>
                            <a
                              href={sup.googleSearchUrl || `https://www.google.com/search?q=${encodeURIComponent(`${sup.name} ${city} contact phone email`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-600 hover:text-sky-800 hover:underline text-[10px] font-bold bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200"
                            >
                              🌐 Search
                            </a>
                          </div>
                        )}
                      </div>
                      <p>👤 <strong>Contact:</strong> {sup.contactPerson}</p>
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-slate-200">
                      {waUrl && (
                        <a 
                          href={waUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded font-bold text-xs hover:bg-emerald-200 transition-colors"
                        >
                          💬 WhatsApp
                        </a>
                      )}

                      {onOpenWebmail && sup.email && (
                        <button
                          onClick={() => onOpenWebmail(sup.email, `RFQ Inquiry for ${productQuery}`, `Dear ${sup.contactPerson || 'Sales Team'},\n\nWe are looking to source ${productQuery} in ${city}.\n\nBest regards,\nDatlion Cnergy`)}
                          className="px-2.5 py-1 bg-sky-100 text-sky-800 rounded font-bold text-xs hover:bg-sky-200 transition-colors"
                        >
                          📧 Webmail RFQ
                        </button>
                      )}

                      {sup.isAddedToDb ? (
                        <span className="text-xs font-bold text-emerald-600">✓ Saved in Database</span>
                      ) : (
                        <button
                          onClick={() => handleAddSelectedToDatabase(sup.id)}
                          className="px-3 py-1 bg-slate-900 text-white font-bold text-xs rounded-lg hover:bg-slate-800"
                        >
                          ⚡ 1-Tap Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FindSupplierTab;
