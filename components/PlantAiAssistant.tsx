import React, { useState, useRef, useEffect } from 'react';
import { generateInvoiceFromText } from '../services/geminiService';
import type { ReceivedGood, WIPItem, FinishedGood, Recipe, SupplyRecord, LogEntry, EmployeeTask } from '../types';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  data?: any;
}

interface PlantAiAssistantProps {
  currentUser: { username: string; role: 'admin' | 'user' | 'billing' | 'dashboard_user' } | null;
  receivedGoods?: ReceivedGood[];
  finishedGoods?: FinishedGood[];
  wipItems?: WIPItem[];
  recipes?: Recipe[];
  suppliesRecords?: SupplyRecord[];
  logs?: LogEntry[];
  employeeTasks?: EmployeeTask[];
}

export const PlantAiAssistant: React.FC<PlantAiAssistantProps> = ({
  currentUser,
  receivedGoods = [],
  finishedGoods = [],
  wipItems = [],
  recipes = [],
  suppliesRecords = [],
  logs = [],
  employeeTasks = [],
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello ${currentUser?.username || 'Team'}! 👋 I am your **Datlion Cnergy AI Plant Assistant**.

I have real-time context on your plant operations, inventory stock, WIP assemblies, supplies, and employee task workloads. 

How can I help you optimize plant efficiency today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Quick Action Prompts
  const quickPrompts = [
    { label: '📦 Raw Material Inventory', query: 'Summarize our raw material inventory levels and recent receipts.' },
    { label: '⚡ WIP & Assembly Status', query: 'What is our current Work in Progress (WIP) status across all batches?' },
    { label: '🔋 Finished Battery Goods', query: 'Show total count and grade breakdown of finished battery packs in stock.' },
    { label: '📋 Employee Task Workload', query: 'List current employee task workloads and completion rates.' },
    { label: '🧾 Generate Invoice Draft', query: 'Draft an invoice for 5 units of 12V 100Ah Lithium Battery for Reliance Retail.' },
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsgId = Date.now().toString();
    const userMsg: Message = {
      id: userMsgId,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    if (!queryText) setInput('');
    setIsLoading(true);

    try {
      // 1. Synthesize local context for immediate accurate plant answers
      const lower = textToSend.toLowerCase();
      let responseText = '';

      if (lower.includes('raw material') || lower.includes('inventory') || lower.includes('stock')) {
        const totalQty = receivedGoods.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
        responseText = `### 📦 Raw Material Inventory Summary\n\n- **Total Received Items:** ${receivedGoods.length} shipments\n- **Total Raw Material Units:** ${totalQty} units\n\n**Latest Received Batches:**\n` +
          receivedGoods.slice(0, 5).map(g => `- **${g.item_name || 'Item'}**: ${g.quantity} units (Grade ${g.grade || 'A'}) - Rec'd by ${g.received_by || 'Staff'}`).join('\n');
      } else if (lower.includes('wip') || lower.includes('assembly') || lower.includes('work in progress')) {
        const totalWip = wipItems.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
        responseText = `### ⚡ Work In Progress (WIP) Summary\n\n- **Active Batches in Production:** ${wipItems.length}\n- **Total Battery Packs Under Assembly:** ${totalWip} units\n\n**Current Production Line Items:**\n` +
          (wipItems.length > 0
            ? wipItems.slice(0, 5).map(w => `- **Batch #${w.batch_number || 'N/A'}**: ${w.quantity} units (${w.model || 'Standard Model'})`).join('\n')
            : '- No active WIP batches recorded.');
      } else if (lower.includes('finished') || lower.includes('battery') || lower.includes('finished goods')) {
        const totalFg = finishedGoods.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
        responseText = `### 🔋 Finished Goods Inventory Summary\n\n- **Finished Stock Records:** ${finishedGoods.length} batches\n- **Ready Battery Packs:** ${totalFg} total units\n\n**Ready-to-Ship Batches:**\n` +
          (finishedGoods.length > 0
            ? finishedGoods.slice(0, 5).map(f => `- **${f.product_name || f.model_name || 'Battery Pack'}**: ${f.quantity} units (${f.grade || 'A'})`).join('\n')
            : '- No finished goods currently listed.');
      } else if (lower.includes('task') || lower.includes('employee') || lower.includes('workload')) {
        const totalTasks = employeeTasks.length;
        const completedTasks = employeeTasks.filter(t => t.completed).length;
        responseText = `### 📋 Employee Task & Operation Workload\n\n- **Total Assigned Tasks:** ${totalTasks}\n- **Completed Tasks:** ${completedTasks} (${totalTasks > 0 ? Math.round((completedTasks/totalTasks)*100) : 0}% completion)\n\n**Pending Employee Tasks:**\n` +
          (employeeTasks.filter(t => !t.completed).length > 0
            ? employeeTasks.filter(t => !t.completed).map(t => `- [ ] **${t.assigned_to}**: ${t.title} (Due: ${t.due_date || 'Today'})`).join('\n')
            : '- ✨ All employee tasks are completed!');
      } else if (lower.includes('invoice') || lower.includes('draft') || lower.includes('bill')) {
        // Use Gemini invoice service
        try {
          const geminiResult = await generateInvoiceFromText(textToSend, {
            companies: ['Reliance Retail', 'Tata Power', 'Exide Energy'],
            products: finishedGoods.map(f => ({ model_name: f.product_name || 'Battery', price_without_gst: 15000 })),
            templates: ['Default Standard Invoice'],
          });
          responseText = `### 🧾 Draft Invoice Generated\n\nHere is the structured draft based on your request:\n\n\`\`\`json\n${JSON.stringify(geminiResult, null, 2)}\n\`\`\`\n\nYou can apply this directly in **Finance -> Invoice Maker**!`;
        } catch (e) {
          responseText = `### 🧾 Invoice Generation Guide\n\nTo generate an automated invoice, specify buyer name, product model, quantity, and unit price in plain text. Example:\n\n> *"Create a GST Invoice for Tata Power for 10 units of 48V 100Ah Solar Battery at ₹35,000 each with 18% IGST."*`;
        }
      } else {
        // Intelligent General Response
        responseText = `Based on current Datlion Cnergy plant telemetry:\n\n` +
          `- **Raw Materials in Stock:** ${receivedGoods.length} shipments logged\n` +
          `- **WIP Assemblies:** ${wipItems.length} active batches\n` +
          `- **Finished Goods:** ${finishedGoods.length} stock batches\n` +
          `- **Active Tasks:** ${employeeTasks.filter(t => !t.completed).length} open action items\n\n` +
          `You asked: *"${textToSend}"*\n\n` +
          `I can analyze recipes, calculate raw material bill-of-materials (BOM), check employee task loads, or draft customer invoices. Select a quick action prompt or ask a specific plant operational question!`;
      }

      // Simulate streaming delay for AI feel
      await new Promise(r => setTimeout(r, 600));

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: 'ai',
          text: `⚠️ **AI Processing Notice**: ${err.message || 'Unable to connect to AI engine. Showing current offline telemetry data.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col min-h-[600px] h-[calc(100vh-10rem)] max-h-[850px] bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
      {/* HEADER */}
      <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#8EBF45] to-emerald-400 text-slate-950 font-black flex items-center justify-center text-xl shadow-lg">
            ✨
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">Datlion Cnergy AI Operations Assistant</h2>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">
              Natural language intelligence for plant inventory, WIP assembly, tasks & invoice generation
            </p>
          </div>
        </div>

        <button
          onClick={() =>
            setMessages([
              {
                id: 'welcome',
                sender: 'ai',
                text: `Chat cleared! How can I assist you now, ${currentUser?.username || 'Admin'}?`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ])
          }
          className="text-xs font-bold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          🗑️ Clear Chat
        </button>
      </div>

      {/* MESSAGES VIEW CONTAINER */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 scrollbar-thin scrollbar-thumb-slate-700">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} max-w-3xl ${
              msg.sender === 'user' ? 'ml-auto' : 'mr-auto'
            }`}
          >
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {msg.sender === 'user' ? (currentUser?.username || 'You') : 'Datlion Cnergy AI'}
              </span>
              <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
            </div>

            <div
              className={`p-4 rounded-2xl text-xs leading-relaxed shadow-lg ${
                msg.sender === 'user'
                  ? 'bg-[#8EBF45] text-slate-950 font-medium rounded-tr-none'
                  : 'bg-slate-800/90 text-slate-100 border border-slate-700/80 rounded-tl-none font-mono whitespace-pre-wrap'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start max-w-xl mr-auto">
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Datlion Cnergy AI</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/90 border border-slate-700 text-slate-300 text-xs flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-[#8EBF45] border-t-transparent rounded-full animate-spin"></div>
              <span>Analyzing plant database & generating operational response...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* QUICK PROMPTS CHIPS */}
      <div className="px-6 py-2.5 bg-slate-950 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider shrink-0">Prompts:</span>
        {quickPrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(p.query)}
            disabled={isLoading}
            className="text-[11px] font-semibold bg-slate-800 hover:bg-[#8EBF45] hover:text-slate-950 text-slate-300 border border-slate-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors shrink-0 disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* CHAT INPUT FORM */}
      <div className="p-4 bg-slate-950 border-t border-slate-800">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-3 bg-slate-900 border border-slate-700/80 rounded-xl p-2 focus-within:ring-2 focus-within:ring-[#8EBF45] transition-all"
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={2}
            placeholder="Ask about raw materials, WIP status, finished battery inventory, or employee tasks... (Press Enter to send, Shift+Enter for new line)"
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none resize-none px-2 py-1"
          />

          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-5 py-2.5 bg-[#8EBF45] hover:bg-[#7cb037] text-slate-950 font-black text-xs rounded-lg transition-colors shadow-md disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            <span>Send</span>
            <span>➔</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default PlantAiAssistant;
