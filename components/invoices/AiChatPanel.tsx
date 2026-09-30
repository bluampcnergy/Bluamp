import React, { useState } from 'react';
import { generateInvoiceFromText } from '../../services/geminiService';
import { CompanyProfile, PriceListItem, InvoiceTemplate } from '../../types';
import { MessageSquare, Loader2 } from './Icons';

interface AiChatPanelProps {
    companyProfiles: CompanyProfile[];
    priceList: PriceListItem[];
    templates: InvoiceTemplate[];
    onApplyAiData: (data: any) => void;
}

const AiChatPanel: React.FC<AiChatPanelProps> = ({ companyProfiles, priceList, templates, onApplyAiData }) => {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setIsLoading(true);
        try {
            const context = {
                companies: companyProfiles.map(c => c.name),
                products: priceList.map(p => ({ model_name: p.model_name, price_without_gst: p.price_without_gst })),
                templates: templates.map(t => t.name)
            };

            const data = await generateInvoiceFromText(prompt, context);
            onApplyAiData(data);
            setPrompt('');
        } catch (error: any) {
            alert('AI Assistant Error: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-20 right-8 z-50 flex flex-col items-end">
            {isOpen && (
                <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-80 mb-4 overflow-hidden animate-fade-in flex flex-col">
                    <div className="bg-slate-800 text-white p-3 font-bold text-sm flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <MessageSquare size={16} />
                            AI Invoice Assistant
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                    </div>
                    <div className="p-4 bg-slate-50 text-xs text-slate-600 h-48 overflow-y-auto">
                        <p className="mb-2"><strong>Tip:</strong> Describe your invoice in plain English.</p>
                        <p className="italic opacity-80">"Make a GST invoice for ABC Corp for 2 units of product XYZ and 1 custom item. Hide the discount column."</p>
                    </div>
                    <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 bg-white relative">
                        <textarea
                            className="w-full text-xs p-2 border border-slate-300 rounded-lg resize-none pr-10 focus:outline-none focus:border-indigo-500"
                            rows={3}
                            placeholder="Type your request here..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
                            disabled={isLoading}
                        />
                        <button 
                            type="submit"
                            disabled={isLoading || !prompt.trim()}
                            className="absolute bottom-5 right-5 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Send'}
                        </button>
                    </form>
                </div>
            )}
            
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-indigo-600 text-white p-4 rounded-full shadow-xl hover:bg-indigo-700 transition-transform transform hover:scale-105 flex items-center justify-center"
                >
                    <MessageSquare size={24} />
                </button>
            )}
        </div>
    );
};

export default AiChatPanel;
