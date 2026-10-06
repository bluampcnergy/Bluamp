import React, { useState } from 'react';

export interface BatterySizingData {
  presetName: string;
  // Category 1: UPS Specifications & System Requirements
  upsKva: number;
  dcBusVoltage: number;
  floatVoltage: number;
  eodVoltage: number;
  pf: number;
  inverterEfficiency: number;
  peakCurrent: number;
  reqUsableEnergy: number;

  // Category 2: Battery Category & Module Specifications
  moduleType: string;
  remarksSpec: string;
  moduleNomVoltage: number;
  modulePeakCurrent: number;
  ratedModuleEnergy: number;
  moduleChargeCutOff: number;
  seriesModules: number;
  physicalEnergy: number;
  chargeCutOffSoc: number;
  dischargeCutOffSoc: number;
  dodRatio: number;
  usableEnergy: number;
  parallelRacks: number;
  rackPeakCurrent: number;
  agingFactor: number;
  wiringType: string;
  backupTimeMinutes: number;

  // Derived / Display helpers
  loadKw: number;
  totalModules: number;
  stringConfig: string;

  // Notes & Sign-offs
  engineeringNotes?: string[];
  preparedBy?: string;
}

export const DEFAULT_BATTERY_SIZING: BatterySizingData = {
  presetName: '20 kVA / 360V DC (7S1P - 18 kWh)',
  upsKva: 20,
  dcBusVoltage: 360,
  floatVoltage: 387.0,
  eodVoltage: 319.2,
  pf: 0.8,
  inverterEfficiency: 89,
  peakCurrent: 56,
  reqUsableEnergy: 18.0,

  moduleType: 'BE-LFP51100',
  remarksSpec: '51.2V/100Ah',
  moduleNomVoltage: 51.2,
  modulePeakCurrent: 100,
  ratedModuleEnergy: 2.56,
  moduleChargeCutOff: 56,
  seriesModules: 7,
  physicalEnergy: 17.92,
  chargeCutOffSoc: 95,
  dischargeCutOffSoc: 10,
  dodRatio: 85,
  usableEnergy: 15.23,
  parallelRacks: 1,
  rackPeakCurrent: 56,
  agingFactor: 100,
  wiringType: '2 Wire',
  backupTimeMinutes: 50.8,

  loadKw: 16.0,
  totalModules: 7,
  stringConfig: '7S1P',

  engineeringNotes: [
    'Calculations are based on prismatic LiFePO4 cells operating at standard 25°C ± 3°C ambient temperature.',
    'Operating DOD window (10% to 95% SOC) optimizes thermal stability and guarantees 3,500+ design cycles.',
    'Integrated Smart Battery Management System (BMS) provides active cell balancing and multi-tier cut-off protection.',
    'Standard high-reliability battery sizing calculated for UPS backup application.'
  ],
  preparedBy: 'Bluamp Application Engineering'
};

export const BATTERY_SIZING_PRESETS: { name: string; data: Partial<BatterySizingData> }[] = [
  {
    name: '20 kVA / 360V DC (7S1P - 18 kWh)',
    data: {
      upsKva: 20,
      dcBusVoltage: 360,
      floatVoltage: 387.0,
      eodVoltage: 319.2,
      pf: 0.8,
      inverterEfficiency: 89,
      reqUsableEnergy: 18.0,
      moduleType: 'BE-LFP51100',
      remarksSpec: '51.2V/100Ah',
      moduleNomVoltage: 51.2,
      modulePeakCurrent: 100,
      ratedModuleEnergy: 2.56,
      moduleChargeCutOff: 56,
      seriesModules: 7,
      parallelRacks: 1,
      chargeCutOffSoc: 95,
      dischargeCutOffSoc: 10,
      agingFactor: 100,
      wiringType: '2 Wire'
    }
  },
  {
    name: '10 kVA / 192V DC (4S1P - 10 kWh)',
    data: {
      upsKva: 10,
      dcBusVoltage: 192,
      floatVoltage: 224.0,
      eodVoltage: 182.4,
      pf: 0.8,
      inverterEfficiency: 89,
      reqUsableEnergy: 9.0,
      moduleType: 'BE-LFP51100',
      remarksSpec: '51.2V/100Ah',
      moduleNomVoltage: 51.2,
      modulePeakCurrent: 100,
      ratedModuleEnergy: 2.56,
      moduleChargeCutOff: 56,
      seriesModules: 4,
      parallelRacks: 1,
      chargeCutOffSoc: 95,
      dischargeCutOffSoc: 10,
      agingFactor: 100,
      wiringType: '2 Wire'
    }
  },
  {
    name: '15 kVA / 288V DC (6S1P - 15 kWh)',
    data: {
      upsKva: 15,
      dcBusVoltage: 288,
      floatVoltage: 336.0,
      eodVoltage: 273.6,
      pf: 0.8,
      inverterEfficiency: 89,
      reqUsableEnergy: 14.0,
      moduleType: 'BE-LFP51100',
      remarksSpec: '51.2V/100Ah',
      moduleNomVoltage: 51.2,
      modulePeakCurrent: 100,
      ratedModuleEnergy: 2.56,
      moduleChargeCutOff: 56,
      seriesModules: 6,
      parallelRacks: 1,
      chargeCutOffSoc: 95,
      dischargeCutOffSoc: 10,
      agingFactor: 100,
      wiringType: '2 Wire'
    }
  },
  {
    name: '30 kVA / 384V DC (8S1P - 20 kWh)',
    data: {
      upsKva: 30,
      dcBusVoltage: 384,
      floatVoltage: 448.0,
      eodVoltage: 364.8,
      pf: 0.8,
      inverterEfficiency: 90,
      reqUsableEnergy: 20.0,
      moduleType: 'BE-LFP51100',
      remarksSpec: '51.2V/100Ah',
      moduleNomVoltage: 51.2,
      modulePeakCurrent: 100,
      ratedModuleEnergy: 2.56,
      moduleChargeCutOff: 56,
      seriesModules: 8,
      parallelRacks: 1,
      chargeCutOffSoc: 95,
      dischargeCutOffSoc: 10,
      agingFactor: 100,
      wiringType: '2 Wire'
    }
  },
  {
    name: '40 kVA / 384V DC (8S2P - 41 kWh)',
    data: {
      upsKva: 40,
      dcBusVoltage: 384,
      floatVoltage: 448.0,
      eodVoltage: 364.8,
      pf: 0.8,
      inverterEfficiency: 91,
      reqUsableEnergy: 40.0,
      moduleType: 'BE-LFP51100',
      remarksSpec: '51.2V/100Ah',
      moduleNomVoltage: 51.2,
      modulePeakCurrent: 100,
      ratedModuleEnergy: 2.56,
      moduleChargeCutOff: 56,
      seriesModules: 8,
      parallelRacks: 2,
      chargeCutOffSoc: 95,
      dischargeCutOffSoc: 10,
      agingFactor: 100,
      wiringType: '2 Wire'
    }
  },
  {
    name: '50 kVA / 480V DC (10S1P - 25 kWh)',
    data: {
      upsKva: 50,
      dcBusVoltage: 480,
      floatVoltage: 560.0,
      eodVoltage: 456.0,
      pf: 0.8,
      inverterEfficiency: 92,
      reqUsableEnergy: 25.0,
      moduleType: 'BE-LFP51100',
      remarksSpec: '51.2V/100Ah',
      moduleNomVoltage: 51.2,
      modulePeakCurrent: 100,
      ratedModuleEnergy: 2.56,
      moduleChargeCutOff: 56,
      seriesModules: 10,
      parallelRacks: 1,
      chargeCutOffSoc: 95,
      dischargeCutOffSoc: 10,
      agingFactor: 100,
      wiringType: '2 Wire'
    }
  },
  {
    name: '60 kVA / 480V DC (10S2P - 51 kWh)',
    data: {
      upsKva: 60,
      dcBusVoltage: 480,
      floatVoltage: 560.0,
      eodVoltage: 456.0,
      pf: 0.8,
      inverterEfficiency: 92,
      reqUsableEnergy: 50.0,
      moduleType: 'BE-LFP51100',
      remarksSpec: '51.2V/100Ah',
      moduleNomVoltage: 51.2,
      modulePeakCurrent: 100,
      ratedModuleEnergy: 2.56,
      moduleChargeCutOff: 56,
      seriesModules: 10,
      parallelRacks: 2,
      chargeCutOffSoc: 95,
      dischargeCutOffSoc: 10,
      agingFactor: 100,
      wiringType: '2 Wire'
    }
  },
  {
    name: '100 kVA / 480V DC (10S3P - 77 kWh)',
    data: {
      upsKva: 100,
      dcBusVoltage: 480,
      floatVoltage: 560.0,
      eodVoltage: 456.0,
      pf: 0.8,
      inverterEfficiency: 93,
      reqUsableEnergy: 75.0,
      moduleType: 'BE-LFP51100',
      remarksSpec: '51.2V/100Ah',
      moduleNomVoltage: 51.2,
      modulePeakCurrent: 100,
      ratedModuleEnergy: 2.56,
      moduleChargeCutOff: 56,
      seriesModules: 10,
      parallelRacks: 3,
      chargeCutOffSoc: 95,
      dischargeCutOffSoc: 10,
      agingFactor: 100,
      wiringType: '2 Wire'
    }
  },
  {
    name: 'Custom Configuration',
    data: {}
  }
];

export function calculateBatterySizing(input: Partial<BatterySizingData>, manualField?: keyof BatterySizingData): BatterySizingData {
  const upsKva = Math.max(0, Number(input.upsKva) || 0);
  const dcBusVoltage = Math.max(0, Number(input.dcBusVoltage) || 360);
  const floatVoltage = Math.max(0, Number(input.floatVoltage) || 387);
  const eodVoltage = Math.max(0.1, Number(input.eodVoltage) || 319.2);
  const pf = Math.max(0, Math.min(1, Number(input.pf) || 0.8));
  const inverterEfficiency = Math.max(1, Math.min(100, Number(input.inverterEfficiency) || 89));
  const reqUsableEnergy = Math.max(0, Number(input.reqUsableEnergy) || 18);

  const moduleType = input.moduleType || 'BE-LFP51100';
  const remarksSpec = input.remarksSpec || '51.2V/100Ah';
  const moduleNomVoltage = Math.max(0, Number(input.moduleNomVoltage) || 51.2);
  const modulePeakCurrent = Math.max(0, Number(input.modulePeakCurrent) || 100);
  const ratedModuleEnergy = Math.max(0, Number(input.ratedModuleEnergy) || 2.56);
  const moduleChargeCutOff = Math.max(0, Number(input.moduleChargeCutOff) || 56);
  const seriesModules = Math.max(1, Math.round(Number(input.seriesModules) || 7));
  const parallelRacks = Math.max(1, Math.round(Number(input.parallelRacks) || 1));
  const chargeCutOffSoc = Math.max(0, Math.min(100, Number(input.chargeCutOffSoc) ?? 95));
  const dischargeCutOffSoc = Math.max(0, Math.min(100, Number(input.dischargeCutOffSoc) ?? 10));
  const agingFactor = Math.max(1, Math.min(100, Number(input.agingFactor) ?? 100));
  const wiringType = input.wiringType || '2 Wire';

  // Calculations
  const loadKw = Math.round(upsKva * pf * 10) / 10;
  const inputKw = inverterEfficiency > 0 ? loadKw / (inverterEfficiency / 100) : loadKw;

  const calculatedPeakCurrent = eodVoltage > 0 ? Math.round((inputKw * 1000) / eodVoltage) : 0;
  const peakCurrent = (manualField === 'peakCurrent' && typeof input.peakCurrent === 'number')
    ? input.peakCurrent
    : calculatedPeakCurrent;

  const totalModules = seriesModules * parallelRacks;
  const calculatedPhysicalEnergy = Math.round(totalModules * ratedModuleEnergy * 100) / 100;
  const physicalEnergy = (manualField === 'physicalEnergy' && typeof input.physicalEnergy === 'number')
    ? input.physicalEnergy
    : calculatedPhysicalEnergy;

  const dodRatio = (manualField === 'dodRatio' && typeof input.dodRatio === 'number')
    ? input.dodRatio
    : Math.max(0, chargeCutOffSoc - dischargeCutOffSoc);

  const calculatedUsableEnergy = Math.round(physicalEnergy * (dodRatio / 100) * (agingFactor / 100) * 100) / 100;
  const usableEnergy = (manualField === 'usableEnergy' && typeof input.usableEnergy === 'number')
    ? input.usableEnergy
    : calculatedUsableEnergy;

  const calculatedBackupMinutes = inputKw > 0 ? Math.round(((usableEnergy / inputKw) * 60) * 10) / 10 : 0;
  const backupTimeMinutes = (manualField === 'backupTimeMinutes' && typeof input.backupTimeMinutes === 'number')
    ? input.backupTimeMinutes
    : calculatedBackupMinutes;

  const rackPeakCurrent = parallelRacks > 0 ? Math.round(peakCurrent / parallelRacks) : peakCurrent;
  const stringConfig = `${seriesModules}S${parallelRacks}P`;

  return {
    presetName: input.presetName || 'Custom Configuration',
    upsKva,
    dcBusVoltage,
    floatVoltage,
    eodVoltage,
    pf,
    inverterEfficiency,
    peakCurrent,
    reqUsableEnergy,
    moduleType,
    remarksSpec,
    moduleNomVoltage,
    modulePeakCurrent,
    ratedModuleEnergy,
    moduleChargeCutOff,
    seriesModules,
    physicalEnergy,
    chargeCutOffSoc,
    dischargeCutOffSoc,
    dodRatio,
    usableEnergy,
    parallelRacks,
    rackPeakCurrent,
    agingFactor,
    wiringType,
    backupTimeMinutes,
    loadKw,
    totalModules,
    stringConfig,
    engineeringNotes: input.engineeringNotes || DEFAULT_BATTERY_SIZING.engineeringNotes,
    preparedBy: input.preparedBy || DEFAULT_BATTERY_SIZING.preparedBy
  };
}

interface TechnicalBatterySizingSheetProps {
  data: BatterySizingData;
  onChange: (data: BatterySizingData) => void;
  onRemove: () => void;
  invoiceNumber?: string;
  companyName?: string;
  logoUrl?: string;
  viewMode?: 'edit' | 'preview';
  onViewModeChange?: (mode: 'edit' | 'preview') => void;
}

export const TechnicalBatterySizingSheet: React.FC<TechnicalBatterySizingSheetProps> = ({
  data,
  onChange,
  onRemove,
  invoiceNumber = 'QUO/BA/26-27/001',
  companyName = 'BLUAMP ENERGY',
  logoUrl,
  viewMode: controlledViewMode,
  onViewModeChange
}) => {
  const [internalViewMode, setInternalViewMode] = useState<'edit' | 'preview'>('edit');
  const viewMode = controlledViewMode !== undefined ? controlledViewMode : internalViewMode;

  const setViewMode = (mode: 'edit' | 'preview') => {
    if (onViewModeChange) onViewModeChange(mode);
    setInternalViewMode(mode);
  };

  const handleFieldChange = (field: keyof BatterySizingData, value: any) => {
    const updated = { ...data, [field]: value };
    if (field !== 'presetName') {
      updated.presetName = 'Custom Configuration';
    }
    const recalculated = calculateBatterySizing(updated, field);
    onChange(recalculated);
  };

  const handlePresetSelect = (presetName: string) => {
    const found = BATTERY_SIZING_PRESETS.find(p => p.name === presetName);
    if (!found) return;
    const recalculated = calculateBatterySizing({
      ...data,
      ...found.data,
      presetName
    });
    onChange(recalculated);
  };

  const handleRefresh = () => {
    const recalculated = calculateBatterySizing(data);
    onChange(recalculated);
  };

  return (
    <div className="w-full font-sans">
      {/* 1. Status Banner */}
      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-2.5 mb-3 shadow-sm">
        <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs sm:text-sm">
          <span className="text-base">🔋</span>
          <span>Technical Battery Sizing Sheet (Page 2 - Joint Document)</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-rose-600 hover:text-rose-800 hover:underline font-semibold transition-colors"
        >
          Remove Sizing Sheet
        </button>
      </div>

      {/* 2. Dark Header Container */}
      <div className="bg-[#0b1329] text-white rounded-2xl p-4 sm:p-5 shadow-xl border border-slate-800 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-lg shadow-sm flex-shrink-0">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm tracking-wide text-white uppercase">
                  Technical Battery Sizing Sheet
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-700/60 uppercase tracking-wider">
                  Optional Joint Page
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Configures UPS &amp; Battery specifications and automatically appends a formal engineering sheet to your PDF quotation/invoice.
              </p>
            </div>
          </div>
        </div>

        {/* Controls Row */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          {/* Preset Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
              Preset:
            </span>
            <select
              value={data.presetName}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="bg-slate-900 text-amber-300 font-bold text-xs border border-amber-500/50 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer shadow-inner max-w-[280px] sm:max-w-none"
            >
              {BATTERY_SIZING_PRESETS.map((p) => (
                <option key={p.name} value={p.name} className="bg-slate-900 text-white">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'edit'
                  ? 'bg-[#8EBF45] text-slate-950 shadow-md ring-2 ring-[#8EBF45]/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <span>⚙</span> Edit Values
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'preview'
                  ? 'bg-[#8EBF45] text-slate-950 shadow-md ring-2 ring-[#8EBF45]/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <span>👁</span> Sheet Preview
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-slate-400 hover:text-white p-1 text-sm font-bold transition-colors ml-1"
              title="Close Sizing Sheet"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* 3. MODE: EDIT VALUES */}
      {viewMode === 'edit' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5 animate-in fade-in duration-150">
          {/* Summary / Calculated Backup Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="border border-amber-300 bg-amber-50/70 rounded-xl p-3 min-w-[170px] text-center shadow-xs">
                <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">
                  CALCULATED BACKUP
                </span>
                <span className="text-2xl font-black text-amber-950 block mt-0.5">
                  {data.backupTimeMinutes.toFixed(1)} Minutes
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Load: {data.upsKva} kVA ({data.loadKw.toFixed(1)} kW) @ {data.inverterEfficiency}% Inverter Efficiency
                </p>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Configuration: {data.stringConfig} ({data.totalModules} modules total, {data.parallelRacks} rack{data.parallelRacks > 1 ? 's' : ''})
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              className="border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <span>🔄</span> Refresh Calculations
            </button>
          </div>

          {/* 2-Column Categories Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Category 1: UPS Specifications */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏢</span>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    UPS Specifications &amp; System Requirements
                  </h4>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Category 1
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    UPS Rating [kVA]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.upsKva}
                    onChange={(e) => handleFieldChange('upsKva', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64] focus:ring-1 focus:ring-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    DC Bus Voltage [Vdc]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.dcBusVoltage}
                    onChange={(e) => handleFieldChange('dcBusVoltage', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64] focus:ring-1 focus:ring-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Float Charging Voltage [V]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.floatVoltage}
                    onChange={(e) => handleFieldChange('floatVoltage', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64] focus:ring-1 focus:ring-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    End of Discharge (EOD) [V]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.eodVoltage}
                    onChange={(e) => handleFieldChange('eodVoltage', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64] focus:ring-1 focus:ring-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Power Factor [PF]
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={data.pf}
                    onChange={(e) => handleFieldChange('pf', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64] focus:ring-1 focus:ring-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Inverter Efficiency [%]
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={data.inverterEfficiency}
                    onChange={(e) => handleFieldChange('inverterEfficiency', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64] focus:ring-1 focus:ring-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-amber-700 block mb-1">
                    Peak Current [A]
                  </label>
                  <input
                    type="number"
                    value={data.peakCurrent}
                    onChange={(e) => handleFieldChange('peakCurrent', parseFloat(e.target.value) || 0)}
                    className="w-full bg-amber-50/40 border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-black text-amber-950 outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Req. Usable Energy [kWh]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.reqUsableEnergy}
                    onChange={(e) => handleFieldChange('reqUsableEnergy', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64] focus:ring-1 focus:ring-[#205f64]"
                  />
                </div>
              </div>
            </div>

            {/* Category 2: Battery Specifications */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔋</span>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Battery Category &amp; Module Specifications
                  </h4>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Category 2
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Module Type
                  </label>
                  <input
                    type="text"
                    value={data.moduleType}
                    onChange={(e) => handleFieldChange('moduleType', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Remarks / Spec
                  </label>
                  <input
                    type="text"
                    value={data.remarksSpec}
                    onChange={(e) => handleFieldChange('remarksSpec', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Module Nom. Voltage [V]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.moduleNomVoltage}
                    onChange={(e) => handleFieldChange('moduleNomVoltage', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Module Peak Current [A]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.modulePeakCurrent}
                    onChange={(e) => handleFieldChange('modulePeakCurrent', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Rated Module Energy [kWh]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.ratedModuleEnergy}
                    onChange={(e) => handleFieldChange('ratedModuleEnergy', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Module Charge Cut-Off [V]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.moduleChargeCutOff}
                    onChange={(e) => handleFieldChange('moduleChargeCutOff', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Series Modules [Ns]
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={data.seriesModules}
                    onChange={(e) => handleFieldChange('seriesModules', parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Physical Energy [kWh]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.physicalEnergy}
                    onChange={(e) => handleFieldChange('physicalEnergy', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Charge Cut-Off SOC [%]
                  </label>
                  <input
                    type="number"
                    value={data.chargeCutOffSoc}
                    onChange={(e) => handleFieldChange('chargeCutOffSoc', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Discharge Cut-Off SOC [%]
                  </label>
                  <input
                    type="number"
                    value={data.dischargeCutOffSoc}
                    onChange={(e) => handleFieldChange('dischargeCutOffSoc', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    DOD / Energy Ratio [%]
                  </label>
                  <input
                    type="number"
                    value={data.dodRatio}
                    onChange={(e) => handleFieldChange('dodRatio', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-emerald-700 block mb-1">
                    Usable Energy [kWh]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.usableEnergy}
                    onChange={(e) => handleFieldChange('usableEnergy', parseFloat(e.target.value) || 0)}
                    className="w-full bg-emerald-50/50 border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs font-black text-emerald-900 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Parallel Racks [Np]
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={data.parallelRacks}
                    onChange={(e) => handleFieldChange('parallelRacks', parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Aging Factor [%]
                  </label>
                  <input
                    type="number"
                    value={data.agingFactor}
                    onChange={(e) => handleFieldChange('agingFactor', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Wiring Type
                  </label>
                  <input
                    type="text"
                    value={data.wiringType}
                    onChange={(e) => handleFieldChange('wiringType', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#205f64]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-amber-700 block mb-1">
                    Back-Up Time [Minutes]
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={data.backupTimeMinutes}
                    onChange={(e) => handleFieldChange('backupTimeMinutes', parseFloat(e.target.value) || 0)}
                    className="w-full bg-amber-50/40 border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-black text-amber-950 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODE: SHEET PREVIEW (Formal engineering A4 preview on screen) */}
      {viewMode === 'preview' && (
        <div className="bg-white rounded-2xl border border-slate-300 p-6 sm:p-8 shadow-xl max-w-[210mm] mx-auto text-slate-900 animate-in fade-in duration-150">
          <TechnicalBatterySizingPreviewBody
            data={data}
            invoiceNumber={invoiceNumber}
            companyName={companyName}
            logoUrl={logoUrl}
          />
        </div>
      )}
    </div>
  );
};

interface BodyProps {
  data: BatterySizingData;
  invoiceNumber: string;
  companyName: string;
  logoUrl?: string;
}

export const TechnicalBatterySizingPreviewBody: React.FC<BodyProps> = ({
  data,
  invoiceNumber,
  companyName,
  logoUrl
}) => {
  return (
    <div className="w-full text-left leading-normal font-sans">
      {/* Top Header */}
      <div className="flex justify-between items-start pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Bluamp Logo" className="h-10 sm:h-12 w-auto object-contain" />
          ) : (
            <div className="flex items-center gap-2.5">
              <img
                src="/logos/bluamp-logo-color.png"
                alt="Bluamp Logo"
                className="h-9 sm:h-11 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div>
                <span className="text-xs sm:text-sm font-black tracking-wider text-[#205f64] block leading-tight">
                  {companyName || 'BLUAMP ENERGY'}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">
                  ENERGY STORAGE SYSTEMS
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="text-right">
          <span className="bg-black text-white text-[9px] font-black tracking-widest px-2.5 py-0.5 rounded uppercase inline-block">
            TECHNICAL APPENDIX
          </span>
          <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-900 mt-0.5">
            BATTERY SIZING SHEET
          </h2>
          <span className="text-[10px] font-mono font-bold text-slate-600 block">
            Ref No: {invoiceNumber || 'QUO/BA/26-27/001'}
          </span>
        </div>
      </div>

      {/* Dark System Configuration Banner */}
      <div className="bg-slate-950 text-white rounded-lg px-4 py-2.5 my-3 flex flex-wrap items-center justify-between gap-2 shadow-sm">
        <div>
          <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase block">
            SYSTEM CONFIGURATION
          </span>
          <h3 className="text-xs sm:text-sm font-bold text-slate-100">
            Battery Sizing Sheet For [{data.upsKva}] KVA [{data.dcBusVoltage}] Vdc UPS
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-900 border border-amber-500/40 px-2.5 py-1 rounded">
            <span className="text-[9px] font-bold text-slate-400 uppercase block">BACKUP DURATION</span>
            <span className="text-xs font-black text-amber-400">{data.backupTimeMinutes.toFixed(1)} Minutes</span>
          </div>
          <div className="bg-slate-800 px-2.5 py-1 rounded">
            <span className="text-[9px] font-bold text-slate-400 uppercase block">STRING CONFIG</span>
            <span className="text-xs font-bold text-slate-200">{data.stringConfig}</span>
          </div>
        </div>
      </div>

      {/* 4 Quick Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
          <span className="text-[9px] font-bold text-slate-500 uppercase block">TARGET LOAD</span>
          <span className="text-xs sm:text-sm font-black text-slate-900 block mt-0.5">
            {data.upsKva} kVA / {data.loadKw.toFixed(1)} kW
          </span>
          <span className="text-[9px] text-slate-500 block">PF {data.pf} @ {data.inverterEfficiency}% Eff.</span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
          <span className="text-[9px] font-bold text-slate-500 uppercase block">PEAK DC DISCHARGE</span>
          <span className="text-xs sm:text-sm font-black text-slate-900 block mt-0.5">
            {data.peakCurrent} A
          </span>
          <span className="text-[9px] text-slate-500 block">EOD Cut-off: {data.eodVoltage} V</span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
          <span className="text-[9px] font-bold text-slate-500 uppercase block">TOTAL INSTALLED ENERGY</span>
          <span className="text-xs sm:text-sm font-black text-slate-900 block mt-0.5">
            {data.physicalEnergy.toFixed(2)} kWh
          </span>
          <span className="text-[9px] text-slate-500 block">{data.totalModules} Modules ({data.stringConfig})</span>
        </div>

        <div className="bg-emerald-50/60 border border-emerald-300 rounded-lg p-2.5 text-center">
          <span className="text-[9px] font-bold text-emerald-800 uppercase block">
            USABLE ENERGY ({data.dodRatio}% DOD)
          </span>
          <span className="text-xs sm:text-sm font-black text-emerald-700 block mt-0.5">
            {data.usableEnergy.toFixed(2)} kWh
          </span>
          <span className="text-[9px] text-emerald-600 block">Aging: {data.agingFactor}%</span>
        </div>
      </div>

      {/* 2 Side-by-Side Parameter Tables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {/* Table 1: UPS Category */}
        <div className="border border-slate-300 rounded-lg overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-[9px] font-black uppercase tracking-wider border-b border-slate-300">
                <th className="py-1 px-2.5 text-left">UPS Category / Parameters</th>
                <th className="py-1 px-2.5 text-right">Design Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[10px]">
              <tr>
                <td className="py-1 px-2.5 text-slate-600">KVA</td>
                <td className="py-1 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.upsKva} ]</td>
              </tr>
              <tr>
                <td className="py-1 px-2.5 text-slate-600">Float Charging Voltage [V]</td>
                <td className="py-1 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.floatVoltage.toFixed(1)} ]</td>
              </tr>
              <tr>
                <td className="py-1 px-2.5 text-slate-600">End of Discharge Voltage [V]</td>
                <td className="py-1 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.eodVoltage.toFixed(1)} ]</td>
              </tr>
              <tr>
                <td className="py-1 px-2.5 text-slate-600">PF (Power Factor)</td>
                <td className="py-1 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.pf} ]</td>
              </tr>
              <tr>
                <td className="py-1 px-2.5 text-slate-600">Inverter Efficiency</td>
                <td className="py-1 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.inverterEfficiency}% ]</td>
              </tr>
              <tr>
                <td className="py-1 px-2.5 text-slate-600">Peak Current [A]</td>
                <td className="py-1 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.peakCurrent} ]</td>
              </tr>
              <tr>
                <td className="py-1 px-2.5 text-slate-600">Required Usable Energy [kWh]</td>
                <td className="py-1 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.reqUsableEnergy.toFixed(1)} ]</td>
              </tr>
              <tr className="bg-slate-50 font-bold">
                <td className="py-1 px-2.5 text-slate-800">Load Active Power (kW)</td>
                <td className="py-1 px-2.5 text-right font-mono text-slate-900">[ {data.loadKw.toFixed(1)} kW ]</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Table 2: Battery Category */}
        <div className="border border-slate-300 rounded-lg overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-[9px] font-black uppercase tracking-wider border-b border-slate-300">
                <th className="py-1 px-2.5 text-left">Battery Category / Module Specs</th>
                <th className="py-1 px-2.5 text-right">Value / Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[10px]">
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Module Type</td>
                <td className="py-0.5 px-2.5 text-right font-bold text-slate-800">[ {data.moduleType} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Remarks / Spec</td>
                <td className="py-0.5 px-2.5 text-right font-bold text-slate-800">[ {data.remarksSpec} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Module Nominal Voltage [V]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.moduleNomVoltage.toFixed(1)} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Module Peak Current [A]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.modulePeakCurrent} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Rated Module Energy [kWh]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.ratedModuleEnergy.toFixed(2)} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Module Charge Cut-Off [V]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.moduleChargeCutOff} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">No. of Modules [Series]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.seriesModules} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Physical Module Energy [kWh]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.physicalEnergy.toFixed(2)} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Module Charge Cut-Off SOC</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.chargeCutOffSoc}% ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Module Discharge Cut-Off SOC</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.dischargeCutOffSoc}% ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">DOD or Energy Ratio</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.dodRatio}% ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Usable Module Energy [kWh]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.usableEnergy.toFixed(2)} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Required Usable Energy [kWh]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.reqUsableEnergy} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">No. of Rack [Parallel]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.parallelRacks} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Rack Peak Current [A]</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.rackPeakCurrent} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Total No. of Modules</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.totalModules} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Series X Parallel Config</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.stringConfig} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">System Configuration</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.wiringType} ]</td>
              </tr>
              <tr>
                <td className="py-0.5 px-2.5 text-slate-600">Aging Factor</td>
                <td className="py-0.5 px-2.5 text-right font-mono font-bold text-slate-800">[ {data.agingFactor}% ]</td>
              </tr>
              <tr className="bg-amber-50 font-bold">
                <td className="py-0.5 px-2.5 text-amber-950">Back-Up Time [Minutes]</td>
                <td className="py-0.5 px-2.5 text-right font-mono text-amber-950 font-black">[ {data.backupTimeMinutes.toFixed(1)} ]</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Engineering Notes & Design Basis */}
      <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/70 mb-4 text-[9px] text-slate-700">
        <h5 className="font-bold uppercase tracking-wider text-slate-800 mb-1">
          Engineering Notes &amp; Design Basis:
        </h5>
        <ul className="list-disc pl-4 space-y-0.5 leading-relaxed text-slate-600">
          {(data.engineeringNotes || DEFAULT_BATTERY_SIZING.engineeringNotes!).map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      </div>

      {/* Signatures & Approvals */}
      <div className="flex justify-between items-end pt-3 border-t border-slate-300 text-[10px]">
        <div>
          <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">
            Prepared &amp; Verified By:
          </span>
          <div className="h-6"></div>
          <span className="font-bold text-slate-800 border-t border-dashed border-slate-400 pt-0.5 inline-block min-w-[180px]">
            {companyName || 'Bluamp Energy'} Application Engineering
          </span>
        </div>

        <div className="text-center text-[9px] text-slate-400">
          Page Technical Appendix • Battery Sizing Sheet
        </div>

        <div className="text-right">
          <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">
            Customer Acceptance / Stamp:
          </span>
          <div className="h-6"></div>
          <span className="font-bold text-slate-800 border-t border-dashed border-slate-400 pt-0.5 inline-block min-w-[180px]">
            Authorized Signatory
          </span>
        </div>
      </div>
    </div>
  );
};

export const TechnicalBatterySizingPrintView: React.FC<BodyProps> = ({
  data,
  invoiceNumber,
  companyName,
  logoUrl
}) => {
  return (
    <div className="w-full bg-white text-slate-900 p-2 font-sans box-border">
      <TechnicalBatterySizingPreviewBody
        data={data}
        invoiceNumber={invoiceNumber}
        companyName={companyName}
        logoUrl={logoUrl}
      />
    </div>
  );
};
