import React from 'react';

interface BatteryComparisonTableProps {
    printMode?: boolean;
    customLithiumPrice?: number;
    customLeadAcidPrice?: number;
}

export const BatteryComparisonTable: React.FC<BatteryComparisonTableProps> = ({
    printMode = false,
    customLithiumPrice,
    customLeadAcidPrice
}) => {
    const lithiumPrice = customLithiumPrice || 17700;
    const leadAcidPrice = customLeadAcidPrice || 15000;
    const leadAcid10YearTotal = leadAcidPrice * 4; // 1 initial + 3 replacements
    const savings = leadAcid10YearTotal - lithiumPrice;

    return (
        <div className={`border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs my-2 break-inside-avoid ${printMode ? 'text-[9px]' : 'text-xs'}`}>
            {/* Header Banner */}
            <div className="bg-slate-900 text-white px-3 py-1.5 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="bg-[#8EBF45] text-slate-900 font-extrabold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider">
                        Home Backup Analysis
                    </span>
                    <span className="font-bold tracking-tight">
                        Lithium (LiFePO4) vs Lead-Acid Battery Comparison
                    </span>
                </div>
                <div className="text-[10px] text-slate-300 font-medium">
                    10-Year Lifecycle &amp; Usable Energy Comparison
                </div>
            </div>

            {/* Comparison Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                            <th className="py-1 px-2.5 w-1/4">Key Comparison Parameter</th>
                            <th className="py-1 px-2.5 w-[28%] bg-emerald-50/60 text-emerald-900 border-x border-emerald-100">
                                <span className="flex items-center gap-1">
                                    <span>⚡ Datlion Cnergy Lithium</span>
                                    <span className="text-[8px] bg-emerald-600 text-white px-1 rounded">Recommended</span>
                                </span>
                                <div className="text-[9px] font-normal text-emerald-700">12.8V 100Ah (1,280 Wh)</div>
                            </th>
                            <th className="py-1 px-2.5 w-[24%] text-slate-600">
                                <span>Typical Lead-Acid (Tubular)</span>
                                <div className="text-[9px] font-normal text-slate-500">12V 150Ah (1,800 Wh)</div>
                            </th>
                            <th className="py-1 px-2.5 w-[23%] text-slate-700">Customer Advantage</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {/* 1. Usable Capacity */}
                        <tr className="hover:bg-slate-50/50">
                            <td className="py-1 px-2.5 font-medium text-slate-800">
                                <div>Usable Backup Capacity</div>
                                <div className="text-[8px] text-slate-400">Safe Depth of Discharge (DoD)</div>
                            </td>
                            <td className="py-1 px-2.5 bg-emerald-50/30 border-x border-emerald-100 font-bold text-emerald-800">
                                <div>~1,152 Wh usable (90% DoD)</div>
                                <div className="text-[8px] text-emerald-600 font-normal">Full energy accessible without damage</div>
                            </td>
                            <td className="py-1 px-2.5 text-slate-600">
                                <div>~900 Wh usable (50% DoD max)</div>
                                <div className="text-[8px] text-slate-400 font-normal">&gt;50% discharge damages plates</div>
                            </td>
                            <td className="py-1 px-2.5 font-semibold text-emerald-700">
                                +28% MORE real backup time despite smaller rated Ah
                            </td>
                        </tr>

                        {/* 2. Initial Upfront Cost */}
                        <tr className="hover:bg-slate-50/50">
                            <td className="py-1 px-2.5 font-medium text-slate-800">
                                <div>Initial Purchase Cost</div>
                                <div className="text-[8px] text-slate-400">Upfront price (excl. GST)</div>
                            </td>
                            <td className="py-1 px-2.5 bg-emerald-50/30 border-x border-emerald-100 font-bold text-slate-900">
                                ₹{lithiumPrice.toLocaleString('en-IN')}
                            </td>
                            <td className="py-1 px-2.5 text-slate-600">
                                ~₹{leadAcidPrice.toLocaleString('en-IN')}
                            </td>
                            <td className="py-1 px-2.5 text-slate-600">
                                Lead-acid seems cheaper only initially
                            </td>
                        </tr>

                        {/* 3. Expected Lifespan & Cycle Life */}
                        <tr className="hover:bg-slate-50/50">
                            <td className="py-1 px-2.5 font-medium text-slate-800">
                                <div>Lifespan &amp; Cycle Life</div>
                                <div className="text-[8px] text-slate-400">Daily charging/discharging cycles</div>
                            </td>
                            <td className="py-1 px-2.5 bg-emerald-50/30 border-x border-emerald-100 font-bold text-emerald-800">
                                3,000+ Cycles (8 – 10+ Years)
                            </td>
                            <td className="py-1 px-2.5 text-slate-600">
                                800 – 1,000 Cycles (2.5 – 3 Years)
                            </td>
                            <td className="py-1 px-2.5 font-semibold text-emerald-700">
                                Lasts 3x to 4x longer than tubular
                            </td>
                        </tr>

                        {/* 4. Replacements in 10 Years */}
                        <tr className="hover:bg-slate-50/50">
                            <td className="py-1 px-2.5 font-medium text-slate-800">
                                <div>10-Year Replacements Needed</div>
                                <div className="text-[8px] text-slate-400">New batteries to buy over 10 yrs</div>
                            </td>
                            <td className="py-1 px-2.5 bg-emerald-50/30 border-x border-emerald-100 font-bold text-emerald-800">
                                0 Replacements (1 Battery Total)
                            </td>
                            <td className="py-1 px-2.5 text-red-600 font-medium">
                                3 Replacements (4 Batteries Total)
                            </td>
                            <td className="py-1 px-2.5 font-semibold text-emerald-700">
                                Zero repurchase headache
                            </td>
                        </tr>

                        {/* 5. Equivalent 10-Year Total Cost */}
                        <tr className="bg-slate-50/80 font-bold">
                            <td className="py-1 px-2.5 text-slate-900">
                                <div>10-Year Equivalent Total Cost</div>
                                <div className="text-[8px] text-slate-500 font-normal">Initial + repeat battery purchases</div>
                            </td>
                            <td className="py-1 px-2.5 bg-emerald-100/50 border-x border-emerald-200 text-emerald-900 text-xs">
                                ₹{lithiumPrice.toLocaleString('en-IN')}
                            </td>
                            <td className="py-1 px-2.5 text-red-700 text-xs">
                                ₹{leadAcid10YearTotal.toLocaleString('en-IN')}+
                            </td>
                            <td className="py-1 px-2.5 text-emerald-700 font-extrabold">
                                Saves ₹{savings.toLocaleString('en-IN')}+ (~70% savings)
                            </td>
                        </tr>

                        {/* 6. Maintenance, Weight & Efficiency */}
                        <tr className="hover:bg-slate-50/50">
                            <td className="py-1 px-2.5 font-medium text-slate-800">
                                <div>Home Comfort &amp; Maintenance</div>
                                <div className="text-[8px] text-slate-400">Daily living experience</div>
                            </td>
                            <td className="py-1 px-2.5 bg-emerald-50/30 border-x border-emerald-100 text-slate-700">
                                <div>• <strong>Zero Maintenance</strong> (Smart BMS)</div>
                                <div>• No acid fumes or smell inside home</div>
                                <div>• Lightweight (~11 kg), 2–3 hr fast charge</div>
                            </td>
                            <td className="py-1 px-2.5 text-slate-600">
                                <div>• Regular distilled water topping</div>
                                <div>• Acid fumes &amp; terminal corrosion</div>
                                <div>• Heavy (~55 kg), 10–12 hr slow charge</div>
                            </td>
                            <td className="py-1 px-2.5 text-slate-700">
                                100% clean, compact &amp; fit-and-forget for home
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Bottom Takeaway */}
            <div className="bg-emerald-50 border-t border-emerald-100 px-3 py-1 flex items-center justify-between text-[8.5px] text-emerald-900">
                <span>
                    <strong>Bottom Line:</strong> A 12.8V 100Ah Lithium battery gives <strong>more usable backup</strong> than a 150Ah Lead-Acid battery, lasts <strong>10+ years</strong> without water maintenance, and cuts lifetime cost by <strong>~₹{savings.toLocaleString('en-IN')}</strong>.
                </span>
                <span className="font-bold text-emerald-800 whitespace-nowrap ml-2">
                    Levelized Cost: ₹5.10 vs ₹17.50 / kWh
                </span>
            </div>
        </div>
    );
};
