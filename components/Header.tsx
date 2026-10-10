import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { View } from '../types';
import type { User } from '../types';
import { BuildingIcon } from './icons/BuildingIcon';
import { CubeIcon } from './icons/CubeIcon';
import { SearchIcon } from './icons/SearchIcon';
import { FileTextIcon } from './icons/FileTextIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { getActiveBrand } from '../config/brandConfig';

interface HeaderProps {
  currentView: View;
  setView: (view: View) => void;
  username: string;
  userRole: User['role'];
  onLogout: () => void;
}

interface NavButtonProps {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

const TopNavButton: React.FC<NavButtonProps> = ({ isActive, onClick, children, icon }) => {
  const brand = getActiveBrand();
  return (
    <button
      type="button"
      onClick={onClick}
      style={isActive ? { borderColor: brand.theme.secondary, color: brand.theme.secondary } : undefined}
      className={`flex items-center px-2.5 lg:px-4 py-2.5 md:py-3 text-xs lg:text-sm font-semibold transition-all duration-150 border-b-4 focus:outline-none whitespace-nowrap shrink-0 ${
        isActive
          ? 'bg-white/10 font-bold'
          : 'border-transparent text-slate-200 hover:text-white hover:bg-white/5'
      }`}
    >
      {icon && <span style={{ color: isActive ? brand.theme.secondary : undefined }} className="mr-1.5 transition-colors duration-150">{icon}</span>}
      {children}
    </button>
  );
};

const SubNavButton: React.FC<NavButtonProps> = ({ isActive, onClick, children, icon }) => {
  const brand = getActiveBrand();
  return (
    <button
      type="button"
      onClick={onClick}
      style={isActive ? { backgroundColor: brand.theme.subnavActiveBg, color: brand.theme.subnavActiveText, borderColor: brand.theme.subnavActiveBg } : undefined}
      className={`px-3 sm:px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 whitespace-nowrap border focus:outline-none flex items-center gap-1.5 shrink-0 select-none active:scale-95 ${
        isActive
          ? 'shadow-xs font-extrabold ring-2 ring-white/20'
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {icon}
      {children}
    </button>
  );
};

const Header: React.FC<HeaderProps> = ({ currentView, setView, username, userRole, onLogout }) => {
  const brand = getActiveBrand();
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const [suppliesTab, setSuppliesTab] = useState<'procurement' | 'tracking' | 'find_suppliers'>('procurement');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOtherOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOtherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Sync supplies tab from custom event
  useEffect(() => {
    const handleSuppliesTabChanged = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && ['procurement', 'tracking', 'find_suppliers'].includes(customEvent.detail)) {
        setSuppliesTab(customEvent.detail);
      }
    };
    window.addEventListener('supplies-tab-changed', handleSuppliesTabChanged);
    return () => window.removeEventListener('supplies-tab-changed', handleSuppliesTabChanged);
  }, []);

  const handleSuppliesSubTabClick = (tab: 'procurement' | 'tracking' | 'find_suppliers') => {
    setSuppliesTab(tab);
    if (currentView !== 'supplies') {
      setView('supplies');
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('switch-supplies-tab', { detail: tab }));
    }, 50);
  };

  // Group views into major operational pillars
  const categories = useMemo(() => ({
    home: ['home'],
    supplies: ['supplies'],
    operations: ['received', 'testing', 'wip', 'dtf', 'finished', 'storage'],
    finance: ['finance_upload', 'finance_dashboard', 'finance_maker', 'finance_gst', 'finance_prices', 'finance_costing', 'finance_expenses', 'finance_ledger', 'finance_crm'],
    admin: ['companies', 'users', 'employee_tasks', 'ai_assistant', 'reports', 'master', 'log'],
    webmail: ['webmail'],
    help: ['help']
  }), []);

  // Detect current pillar
  const currentCategory = useMemo(() => {
    if (categories.home.includes(currentView)) return 'home';
    if (currentView === 'supplies') return 'supplies';
    if (categories.operations.includes(currentView)) return 'operations';
    if (categories.finance.includes(currentView)) return 'finance';
    if (categories.admin.includes(currentView)) return 'admin';
    if (currentView === 'help') return 'help';
    if (currentView === 'webmail') return 'webmail';
    return 'operations';
  }, [currentView, categories]);

  const isOtherActive = currentCategory === 'help' || currentCategory === 'webmail';

  return (
    <>
    <header style={{ backgroundColor: brand.theme.headerBg }} className="sticky top-0 z-[100] shadow-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 md:h-16">
          
          {/* LOGO & BRANDING */}
          <div className="flex items-center cursor-pointer gap-2.5 shrink-0" onClick={() => setView('home')}>
            <img
              src={brand.logoNavbarUrl}
              alt={`${brand.companyName} Logo`}
              className="h-8 md:h-9 w-auto object-contain rounded-md p-0.5"
            />
            <div className="flex flex-col justify-center">
              <h1 className="text-base md:text-lg font-extrabold text-white leading-none tracking-tight font-brand">
                {brand.companyName}
              </h1>
              <p style={{ color: brand.theme.secondary }} className="text-[9px] md:text-[10px] font-black tracking-widest uppercase mt-0.5">
                {brand.tagline}
              </p>
            </div>
          </div>

          {/* DESKTOP TOP NAVIGATION */}
          <nav className="hidden md:flex items-center space-x-1 md:flex-grow md:justify-center overflow-visible">
            {/* 1. HOME */}
            <TopNavButton
              isActive={currentCategory === 'home'}
              onClick={() => setView('home')}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              }
            >
              Home
            </TopNavButton>

            {/* 2. SUPPLIES */}
            <TopNavButton
              isActive={currentCategory === 'supplies'}
              onClick={() => setView('supplies')}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              }
            >
              Supplies
            </TopNavButton>

            {/* 3. OPERATIONS */}
            <TopNavButton
              isActive={currentCategory === 'operations'}
              onClick={() => setView('received')}
              icon={<CubeIcon className="h-4 w-4" />}
            >
              Operations
            </TopNavButton>

            {/* 4. FINANCE */}
            <TopNavButton
              isActive={currentCategory === 'finance'}
              onClick={() => setView((userRole === 'admin' || userRole === 'billing') ? 'finance_dashboard' : 'finance_maker')}
              icon={<FileTextIcon className="h-4 w-4" />}
            >
              Finance
            </TopNavButton>

            {/* 5. ADMIN */}
            <TopNavButton
              isActive={currentCategory === 'admin'}
              onClick={() => setView('companies')}
              icon={<BuildingIcon className="h-4 w-4" />}
            >
              Admin
            </TopNavButton>

            {/* DIVIDER */}
            <div className="w-px h-5 bg-white/20 mx-1.5 self-center shrink-0"></div>

            {/* 6. OTHER LINKS DROPDOWN */}
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsOtherOpen(!isOtherOpen)}
                style={isOtherOpen || isOtherActive ? { borderColor: brand.theme.secondary, color: brand.theme.secondary } : undefined}
                className={`flex items-center px-2.5 lg:px-4 py-2.5 md:py-3 text-xs lg:text-sm font-semibold transition-all duration-150 border-b-4 focus:outline-none whitespace-nowrap ${
                  isOtherOpen || isOtherActive
                    ? 'bg-white/10 font-bold'
                    : 'border-transparent text-slate-200 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="mr-1.5 transition-colors duration-150">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </span>
                Other Links
                <svg className={`w-3.5 h-3.5 ml-1 transition-transform duration-200 ${isOtherOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* RELATIVE ATTACHED DROPDOWN MENU */}
              {isOtherOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-[199] bg-black/20" 
                    onClick={() => setIsOtherOpen(false)} 
                  />
                  <div className="absolute top-full right-0 mt-1 w-64 bg-slate-900 border border-white/20 rounded-xl shadow-2xl py-2 z-[200] animate-in fade-in slide-in-from-top-1 duration-150">
                    <div style={{ color: brand.theme.secondary }} className="px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest border-b border-white/10 flex justify-between items-center">
                      <span>Resources & Portals</span>
                      <span className="text-slate-400 font-normal">Esc to close</span>
                    </div>

                    {/* 1. Help Guide */}
                    <button
                      type="button"
                      onClick={() => {
                        setView('help');
                        setIsOtherOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs font-bold flex items-center justify-between hover:bg-white/10 transition-colors ${
                        currentView === 'help' ? 'text-white bg-white/20 font-black' : 'text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">📖</span>
                        <div>
                          <div className="leading-tight">Help & User Guide</div>
                          <div className="text-[10px] text-slate-300 font-normal">Component & App Manual</div>
                        </div>
                      </div>
                      <span style={{ color: brand.theme.secondary }} className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-black">GUIDE</span>
                    </button>

                    {/* 2. Webmail Client */}
                    <button
                      type="button"
                      onClick={() => {
                        setView('webmail');
                        setIsOtherOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs font-bold flex items-center justify-between hover:bg-white/10 transition-colors ${
                        currentView === 'webmail' ? 'text-white bg-white/20 font-black' : 'text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">✉️</span>
                        <div>
                          <div className="leading-tight">{brand.shortName || brand.companyName} Webmail</div>
                          <div className="text-[10px] text-slate-300 font-normal">IMAP/SMTP Mail Client</div>
                        </div>
                      </div>
                    </button>

                    {/* 3. Mobile Voice Shell */}
                    <button
                      type="button"
                      onClick={() => {
                        setView('mobile');
                        setIsOtherOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs font-bold flex items-center justify-between hover:bg-white/10 transition-colors ${
                        currentView === 'mobile' ? 'text-white bg-white/20 font-black' : 'text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">🎙️</span>
                        <div>
                          <div className="leading-tight">Mobile Voice Assistant</div>
                          <div className="text-[10px] text-slate-300 font-normal">Hands-Free Audio UI</div>
                        </div>
                      </div>
                    </button>

                    {/* 4. Traceability */}
                    <button
                      type="button"
                      onClick={() => {
                        setView('master');
                        setIsOtherOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs font-bold flex items-center justify-between hover:bg-white/10 transition-colors ${
                        currentView === 'master' ? 'text-white bg-white/20 font-black' : 'text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">🔍</span>
                        <div>
                          <div className="leading-tight">Traceability Matrix</div>
                          <div className="text-[10px] text-slate-300 font-normal">Pack to Cell Genealogy</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </nav>

          {/* USER INFO & LOGOUT */}
          <div className="flex items-center space-x-2 md:space-x-3 shrink-0">
            {username && (
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-white leading-tight">{username.split('@')[0]}</span>
                <span style={{ color: brand.theme.secondary }} className="text-[10px] uppercase font-bold tracking-wider">
                  {userRole?.replace('_', ' ')}
                </span>
              </div>
            )}
            
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 text-slate-300 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                title="Logout"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* SUB-NAVIGATION BAR */}
      <div className="bg-slate-50 border-t border-slate-200 shadow-xs relative">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
          <div 
            className="flex items-center space-x-1.5 sm:space-x-2 py-2 overflow-x-auto scrollbar-hide touch-scroll"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* 1. HOME SUB-NAV */}
            {currentCategory === 'home' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1 shrink-0">Overview:</div>
                <SubNavButton isActive={currentView === 'home'} onClick={() => setView('home')}>
                  📊 Plant Summary
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('employee_tasks')}>
                  📋 My Tasks
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('ai_assistant')}>
                  ✨ AI Assistant
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('help')} icon={<span className="text-xs">📖</span>}>
                  Help Guide
                </SubNavButton>
              </>
            )}

            {/* 2. SUPPLIES SUB-NAV */}
            {currentCategory === 'supplies' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1 shrink-0">Procurement:</div>
                <SubNavButton 
                  isActive={currentView === 'supplies' && suppliesTab === 'procurement'} 
                  onClick={() => handleSuppliesSubTabClick('procurement')}
                >
                  📦 Requisitions
                </SubNavButton>
                <SubNavButton 
                  isActive={currentView === 'supplies' && suppliesTab === 'tracking'} 
                  onClick={() => handleSuppliesSubTabClick('tracking')}
                >
                  🚚 Inbound Tracking
                </SubNavButton>
                <SubNavButton 
                  isActive={currentView === 'supplies' && suppliesTab === 'find_suppliers'} 
                  onClick={() => handleSuppliesSubTabClick('find_suppliers')}
                >
                  🔍 Find Suppliers
                </SubNavButton>
                <div className="w-px h-5 bg-slate-300 mx-1 shrink-0 self-center"></div>
                <SubNavButton isActive={false} onClick={() => setView('received')}>
                  📥 Raw Intake
                </SubNavButton>
              </>
            )}

            {/* 3. OPERATIONS SUB-NAV */}
            {currentCategory === 'operations' && (
              <>
                <SubNavButton isActive={currentView === 'received'} onClick={() => setView('received')}>Raw Materials</SubNavButton>
                <SubNavButton isActive={currentView === 'testing'} onClick={() => setView('testing')}>Testing</SubNavButton>
                <SubNavButton isActive={currentView === 'wip'} onClick={() => setView('wip')}>WIP (Assembly)</SubNavButton>
                <SubNavButton isActive={currentView === 'dtf'} onClick={() => setView('dtf')}>Direct-To-Finished</SubNavButton>
                <SubNavButton isActive={currentView === 'finished'} onClick={() => setView('finished')}>Finished Goods</SubNavButton>
                <SubNavButton isActive={currentView === 'storage'} onClick={() => setView('storage')}>Storage Map</SubNavButton>
                <div className="w-px h-5 bg-slate-300 mx-1 shrink-0 self-center"></div>
                <SubNavButton isActive={false} onClick={() => setView('supplies')}>
                  📦 Supplies
                </SubNavButton>
              </>
            )}

            {/* 4. FINANCE SUB-NAV */}
            {currentCategory === 'finance' && (
              <>
                {(userRole === 'admin' || userRole === 'billing') && (
                  <>
                    <SubNavButton isActive={currentView === 'finance_upload'} onClick={() => setView('finance_upload')}>Scan & Import</SubNavButton>
                    <SubNavButton isActive={currentView === 'finance_dashboard'} onClick={() => setView('finance_dashboard')}>Summary</SubNavButton>
                    <SubNavButton isActive={currentView === 'finance_ledger'} onClick={() => setView('finance_ledger')}>Accounts Ledger</SubNavButton>
                  </>
                )}
                <SubNavButton isActive={currentView === 'finance_maker'} onClick={() => setView('finance_maker')}>Invoice Maker</SubNavButton>
                {(userRole === 'admin' || userRole === 'billing') && (
                  <>
                    <SubNavButton isActive={currentView === 'finance_gst'} onClick={() => setView('finance_gst')}>GST Returns</SubNavButton>
                    <SubNavButton isActive={currentView === 'finance_prices'} onClick={() => setView('finance_prices')}>Prices</SubNavButton>
                  </>
                )}
                {userRole === 'admin' && (
                  <SubNavButton isActive={currentView === 'finance_costing'} onClick={() => setView('finance_costing')} icon={<span className="text-xs">🧮</span>}>BOM Costing</SubNavButton>
                )}
                <SubNavButton isActive={currentView === 'finance_expenses'} onClick={() => setView('finance_expenses')}>Expenses</SubNavButton>
                <SubNavButton isActive={currentView === 'finance_crm'} onClick={() => setView('finance_crm')} icon={<span className="text-xs">🤝</span>}>Sales CRM</SubNavButton>
              </>
            )}

            {/* 5. ADMIN SUB-NAV */}
            {currentCategory === 'admin' && (
              <>
                <SubNavButton isActive={currentView === 'companies'} onClick={() => setView('companies')}>🏢 Companies</SubNavButton>
                {userRole === 'admin' && (
                  <SubNavButton isActive={currentView === 'users'} onClick={() => setView('users')}>👥 Users</SubNavButton>
                )}
                <SubNavButton isActive={currentView === 'employee_tasks'} onClick={() => setView('employee_tasks')}>📋 Tasks</SubNavButton>
                <div className="w-px h-5 bg-slate-300 mx-1 shrink-0 self-center"></div>
                <SubNavButton isActive={currentView === 'ai_assistant'} onClick={() => setView('ai_assistant')} icon={<SparklesIcon className="h-3 w-3" />}>AI Assistant</SubNavButton>
                <SubNavButton isActive={currentView === 'reports'} onClick={() => setView('reports')}>📊 Exports</SubNavButton>
                <SubNavButton isActive={currentView === 'master'} onClick={() => setView('master')}>🔍 Traceability</SubNavButton>
                <SubNavButton isActive={currentView === 'log'} onClick={() => setView('log')}>📜 Logs</SubNavButton>
              </>
            )}

            {/* 6. WEBMAIL SUB-NAV */}
            {currentCategory === 'webmail' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1 shrink-0">Mailbox:</div>
                <SubNavButton isActive={currentView === 'webmail'} onClick={() => setView('webmail')}>
                  ✉️ IMAP/SMTP Client
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('employee_tasks')}>
                  📋 Back to Tasks
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('home')}>
                  ← Home
                </SubNavButton>
              </>
            )}

            {/* 7. HELP GUIDE SUB-NAV */}
            {currentCategory === 'help' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1 shrink-0">Documentation:</div>
                <SubNavButton isActive={currentView === 'help'} onClick={() => setView('help')}>
                  📖 Component Manual
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('home')}>
                  ← Return to Dashboard
                </SubNavButton>
              </>
            )}

          </div>
        </div>
      </div>
    </header>

    {/* FIXED MOBILE BOTTOM NAVIGATION BAR */}
    <nav style={{ backgroundColor: brand.theme.headerBg }} className="md:hidden fixed bottom-0 left-0 right-0 z-[120] backdrop-blur-md border-t border-white/10 px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-inset-bottom">
      {/* 1. Home */}
      <button
        type="button"
        onClick={() => setView('home')}
        style={currentCategory === 'home' ? { color: brand.theme.secondary } : undefined}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all active:scale-90 select-none ${
          currentCategory === 'home' ? 'bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <svg className="h-5 w-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={currentCategory === 'home' ? 2.5 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span className="text-[10px] tracking-tight">Home</span>
      </button>

      {/* 2. Supplies */}
      <button
        type="button"
        onClick={() => setView('supplies')}
        style={currentCategory === 'supplies' ? { color: brand.theme.secondary } : undefined}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all active:scale-90 select-none ${
          currentCategory === 'supplies' ? 'bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <svg className="h-5 w-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={currentCategory === 'supplies' ? 2.5 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        <span className="text-[10px] tracking-tight">Supplies</span>
      </button>

      {/* 3. Operations */}
      <button
        type="button"
        onClick={() => setView('received')}
        style={currentCategory === 'operations' ? { color: brand.theme.secondary } : undefined}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all active:scale-90 select-none ${
          currentCategory === 'operations' ? 'bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <CubeIcon className="h-5 w-5 mb-0.5" />
        <span className="text-[10px] tracking-tight">Operations</span>
      </button>

      {/* 4. Finance */}
      <button
        type="button"
        onClick={() => setView((userRole === 'admin' || userRole === 'billing') ? 'finance_dashboard' : 'finance_maker')}
        style={currentCategory === 'finance' ? { color: brand.theme.secondary } : undefined}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all active:scale-90 select-none ${
          currentCategory === 'finance' ? 'bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <FileTextIcon className="h-5 w-5 mb-0.5" />
        <span className="text-[10px] tracking-tight">Finance</span>
      </button>

      {/* 5. Admin */}
      <button
        type="button"
        onClick={() => setView('companies')}
        style={currentCategory === 'admin' ? { color: brand.theme.secondary } : undefined}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all active:scale-90 select-none ${
          currentCategory === 'admin' ? 'bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <BuildingIcon className="h-5 w-5 mb-0.5" />
        <span className="text-[10px] tracking-tight">Admin</span>
      </button>
    </nav>
    </>
  );
};

export default Header;