
import React from 'react';
import type { ReceivedGood, FinishedGood, Recipe, WIPItem, LogEntry, View, ExtractedInvoice } from '../types';
import { downloadFile } from '../utils/invoiceUtils';
import { FileSpreadsheet, FileText, LayoutDashboard } from './invoices/Icons';

interface ReportsProps {
  receivedGoods: ReceivedGood[];
  finishedGoods: FinishedGood[];
  recipes: Recipe[];
  wipItems: WIPItem[];
  logs: LogEntry[];
  setView: (view: View) => void;
  setInvoiceDraft: (draft: ExtractedInvoice) => void;
}

const Reports: React.FC<ReportsProps> = ({ receivedGoods, finishedGoods, logs }) => {
  
  const handleExportRawMaterials = () => {
    const header = "ID,Name,Category,Make/Model,Supplier,Invoice No,Quantity,Status,Received Date\n";
    const rows = receivedGoods.map(g => [
        `"${g.id}"`,
        `"${g.name.replace(/"/g, '""')}"`,
        `"${g.category || ''}"`,
        `"${g.makeModel.replace(/"/g, '""')}"`,
        `"${g.supplier.replace(/"/g, '""')}"`,
        `"${g.invoiceNumber}"`,
        g.quantity,
        `"${g.status}"`,
        `"${new Date(g.timestamp).toLocaleDateString()}"`
    ].join(','));
    
    const csvContent = header + rows.join('\n');
    downloadFile(csvContent, `raw_materials_inventory_${new Date().toISOString().slice(0, 10)}.csv`, 'csv');
  };

  const handleExportFinishedGoods = () => {
    const header = "ID,Recipe ID,Produced Qty,Dismantled Qty,Available Qty,Quality Remarks,Delivered To,Date\n";
    const rows = finishedGoods.map(g => {
        const dismantled = g.dismantledUnitIds?.length || 0;
        const available = g.quantity - dismantled;
        return [
            `"${g.id}"`,
            `"${g.recipeId}"`,
            g.quantity,
            dismantled,
            available,
            `"${g.qualityRemarks.replace(/"/g, '""')}"`,
            `"${g.deliveredTo || 'In Stock'}"`,
            `"${new Date(g.timestamp).toLocaleDateString()}"`
        ].join(',');
    });
    
    const csvContent = header + rows.join('\n');
    downloadFile(csvContent, `finished_goods_inventory_${new Date().toISOString().slice(0, 10)}.csv`, 'csv');
  };

  const handleDownloadLogCsv = () => {
    if (logs.length === 0) return alert("No activity logs to export.");
    const header = "Timestamp,Username,Action,Details\n";
    const csvRows = logs.map(log => {
        const timestamp = `"${new Date(log.timestamp).toLocaleString()}"`;
        const username = `"${log.username}"`;
        const action = `"${log.action}"`;
        const details = `"${log.details.replace(/"/g, '""')}"`;
        return [timestamp, username, action, details].join(',');
    });
    const csvString = header + csvRows.join('\n');
    downloadFile(csvString, `activity_logs_full_${new Date().toISOString().slice(0, 10)}.csv`, 'csv');
  };

  const totalFinishedStock = finishedGoods.reduce((sum, g) => sum + (g.quantity - (g.dismantledUnitIds?.length || 0)), 0);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Analytics & Exports</h1>
            <p className="text-slate-500 text-sm">Download system data for external analysis.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Inventory Data */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-4">
                  <LayoutDashboard size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Inventory Data</h3>
              <p className="text-sm text-slate-500 mb-6">Download full lists of Raw Materials and Finished Goods.</p>
              <div className="space-y-3">
                  <button onClick={handleExportRawMaterials} className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2 rounded-lg text-sm font-medium transition-colors">
                      <FileSpreadsheet size={16}/> Export Raw Materials
                  </button>
                  <button onClick={handleExportFinishedGoods} className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2 rounded-lg text-sm font-medium transition-colors">
                      <FileSpreadsheet size={16}/> Export Finished Goods
                  </button>
              </div>
          </div>

          {/* Card 2: Logs */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 mb-4">
                  <FileText size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">System Logs</h3>
              <p className="text-sm text-slate-500 mb-6">Audit trail of all user actions, productions, and edits.</p>
              <button onClick={handleDownloadLogCsv} className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                  <FileText size={16}/> Download Activity Log
              </button>
          </div>

          {/* Card 3: Summary Stats */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-xl shadow-sm border border-slate-700 text-white">
              <h3 className="text-lg font-bold mb-4">System Snapshot</h3>
              <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                      <span className="text-slate-400 text-sm">Raw Items</span>
                      <span className="text-xl font-mono font-bold">{receivedGoods.length}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                      <span className="text-slate-400 text-sm">Finished Batches</span>
                      <span className="text-xl font-mono font-bold">{finishedGoods.length}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                      <span className="text-slate-400 text-sm">Finished Units (Available)</span>
                      <span className="text-xl font-mono font-bold text-green-400">{totalFinishedStock}</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Total Actions Logged</span>
                      <span className="text-xl font-mono font-bold">{logs.length}</span>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Reports;
