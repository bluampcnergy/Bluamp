import React, { useState, useEffect } from 'react';
import { CompanyProfile } from '../types';
import { 
  SourcedSupplier, 
  searchSuppliersAcrossWeb, 
  enrichSupplierContactAI, 
  formatWhatsAppNumber 
} from '../services/supplierSearchService';

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

  const handleSearch = async (overrideProduct?: string) => {
    const queryToUse = overrideProduct || productQuery;
    if (!queryToUse.trim() || isLoading) return;

    setIsLoading(true);
    setNotification(null);

    try {
      const results = await searchSuppliersAcrossWeb(city, queryToUse);
      
      // Retain shortlisted status if supplier was already shortlisted
      const updated = results.map(r => {
        const existing = suppliers.find(s => s.name.toLowerCase() === r.name.toLowerCase());
        return existing ? { ...r, isShortlisted: existing.isShortlisted, isAddedToDb: existing.isAddedToDb } : r;
      });

      setSuppliers(updated);
      showNotification('success', `Found ${results.length} suppliers for "${queryToUse}" in ${city}`);
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

      const profileToAdd: CompanyProfile = {
        id: `cp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: sup.name,
        gstNumber: sup.gstNumber || '',
        shippingAddress: sup.address || `${city}, India`,
        email: sup.email || '',
        contactPerson: sup.contactPerson || 'Sales Department',
        phoneNumber: cleanPhone || sup.phoneNumber || '',
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
  const filteredSuppliers = suppliers.filter(s => {
    if (activeSourceFilter === 'all') return true;
    if (activeSourceFilter === 'maps') return s.source === 'maps';
    if (activeSourceFilter === 'indiamart') return s.source === 'indiamart';
    if (activeSourceFilter === 'google') return s.source === 'google';
    if (activeSourceFilter === 'other') return s.source === 'tradeindia' || s.source === 'other';
    return true;
  });

  const mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(`${productQuery} suppliers in ${city}`)}&t=&z=12&ie=UTF8&iwloc=&output=embed`;

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
          <div className="md:col-span-6">
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
                  <span>Searching Web & Maps...</span>
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
                <h3 className="text-xs font-bold">Google Maps Live Plugin ({city})</h3>
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
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    activeSourceFilter === 'maps' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📍 Google Maps
                </button>
                <button
                  onClick={() => setActiveSourceFilter('indiamart')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    activeSourceFilter === 'indiamart' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  🏭 IndiaMart
                </button>
                <button
                  onClick={() => setActiveSourceFilter('google')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    activeSourceFilter === 'google' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  🌐 Web Search
                </button>
                <button
                  onClick={() => setActiveSourceFilter('other')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    activeSourceFilter === 'other' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📦 Directories
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

                      {/* CONTACT DETAILS & ENRICHMENT */}
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* Phone / WhatsApp */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">📱 Phone:</span>
                          {sup.phoneNumber ? (
                            <span className="font-semibold text-slate-800 flex items-center gap-1">
                              {cleanPhone || sup.phoneNumber}
                              {waUrl && (
                                <a 
                                  href={waUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-emerald-600 hover:underline font-bold text-[11px]"
                                  title="Open WhatsApp chat"
                                >
                                  💬 WhatsApp
                                </a>
                              )}
                            </span>
                          ) : (
                            <span className="text-rose-500 italic text-[11px]">Missing Phone</span>
                          )}
                        </div>

                        {/* Email Address */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">📧 Email:</span>
                          {sup.email ? (
                            <span className="font-semibold text-slate-800 truncate max-w-[180px]">{sup.email}</span>
                          ) : (
                            <span className="text-rose-500 italic text-[11px]">Missing Email</span>
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

                    <div className="text-xs text-slate-600 space-y-1">
                      <p>📍 <strong>Address:</strong> {sup.address}</p>
                      <p>📱 <strong>Phone:</strong> {cleanPhone || sup.phoneNumber || 'Not found'}</p>
                      <p>📧 <strong>Email:</strong> {sup.email || 'Not found'}</p>
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
