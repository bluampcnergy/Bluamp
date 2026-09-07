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
        <div className={`border border-slate-200 rounded overflow-hidden bg-white my-1.5 break-inside-avoid ${printMode ? 'text-[8.5px] leading-tight' : 'text-xs'}`}>
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                        <th className="py-0.5 px-2 w-[24%]">Comparison</th>
                        <th className="py-0.5 px-2 w-[38%] bg-emerald-50/70 text-emerald-900 border-x border-emerald-100">
                            <span className="font-bold">⚡ 12.8V 100Ah Lithium</span>{' '}
                            <span className="text-[8px] bg-emerald-600 text-white px-1 py-0.2 rounded font-bold">Recommended</span>
                        </th>
                        <th className="py-0.5 px-2 w-[38%] text-slate-600">12V 150Ah Lead-Acid (Tubular)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {/* Line 1: Usable Backup Energy */}
                    <tr>
                        <td className="py-0.5 px-2 font-medium text-slate-700">Usable Backup</td>
                        <td className="py-0.5 px-2 bg-emerald-50/30 border-x border-emerald-100 font-semibold text-emerald-800">
                            <strong>1,152 Wh</strong> (90% DoD) — <span className="text-emerald-700 font-bold">+28% more backup</span>
                        </td>
                        <td className="py-0.5 px-2 text-slate-600">
                            900 Wh (50% DoD safe limit)
                        </td>
                    </tr>

                    {/* Line 2: Lifespan & Replacements */}
                    <tr>
                        <td className="py-0.5 px-2 font-medium text-slate-700">Lifespan &amp; Replacements</td>
                        <td className="py-0.5 px-2 bg-emerald-50/30 border-x border-emerald-100 font-semibold text-emerald-800">
                            <strong>10+ Years</strong> / 3,000+ cycles (<span className="text-emerald-700 font-bold">0 replacements</span>)
                        </td>
                        <td className="py-0.5 px-2 text-slate-600">
                            2.5–3 Years (<span className="text-red-600 font-medium">3 replacements needed</span>)
                        </td>
                    </tr>

                    {/* Line 3: 10-Year Total Battery Cost */}
                    <tr className="bg-slate-50/50">
                        <td className="py-0.5 px-2 font-semibold text-slate-800">10-Year Battery Cost</td>
                        <td className="py-0.5 px-2 bg-emerald-100/50 border-x border-emerald-200 font-bold text-emerald-900">
                            ₹{lithiumPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            <span className="text-[8px] font-normal text-emerald-800">(₹5.10 / kWh delivered)</span>
                        </td>
                        <td className="py-0.5 px-2 text-red-700 font-medium">
                            ₹{leadAcid10YearTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}+{' '}
                            <span className="text-[8px] font-normal text-slate-500">(4 batteries, ₹17.50 / kWh)</span>
                        </td>
                    </tr>

                    {/* Line 4: Maintenance & Home Living */}
                    <tr>
                        <td className="py-0.5 px-2 font-medium text-slate-700">Maintenance &amp; Home Safety</td>
                        <td className="py-0.5 px-2 bg-emerald-50/30 border-x border-emerald-100 text-slate-700">
                            <strong>Zero Maintenance</strong>, Smart BMS, no acid fumes, compact (~11 kg)
                        </td>
                        <td className="py-0.5 px-2 text-slate-600">
                            Regular distilled water top-up, toxic acid fumes, heavy (~55 kg)
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* 1 Text Line Below */}
            <div className="bg-emerald-50/80 border-t border-emerald-100 px-2 py-0.5 text-[8.5px] print:text-[8px] text-emerald-900 font-medium flex items-center justify-between">
                <span>
                    <strong>💡 Bottom Line:</strong> 100Ah Lithium delivers <strong>+28% more usable backup time</strong> than 150Ah Lead-Acid, zero acid fumes/maintenance, and saves <strong>₹{savings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}+</strong> over 10 years.
                </span>
            </div>
        </div>
    );
};
