import { VoiceIntentResult, VoiceIntentType } from '../types';
import { supabase } from '../supabaseClient';
import { getActiveBrand } from '../config/brandConfig';

// --- Speech Recognition Interface Setup ---
export interface SpeechRecognitionHandlers {
  onStart?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

// Clean duplicate words and repeated echo phrases
export const cleanSpeechTranscript = (rawText: string): string => {
  if (!rawText) return '';
  
  // Normalize whitespace
  let text = rawText.replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean);
  if (words.length <= 1) return text;

  const resultWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const currentWord = words[i];

    // 1. Remove immediate consecutive single-word repeat (e.g. "to to")
    if (resultWords.length > 0 && resultWords[resultWords.length - 1].toLowerCase() === currentWord.toLowerCase()) {
      continue;
    }

    // 2. Remove multi-word phrase repeats (e.g. "order solar panel from" repeated)
    let isDuplicatePhrase = false;
    for (let phraseLen = 6; phraseLen >= 2; phraseLen--) {
      if (i >= phraseLen && i + phraseLen <= words.length) {
        const prevPhrase = words.slice(i - phraseLen, i).map(w => w.toLowerCase()).join(' ');
        const currPhrase = words.slice(i, i + phraseLen).map(w => w.toLowerCase()).join(' ');
        if (prevPhrase === currPhrase) {
          isDuplicatePhrase = true;
          i += phraseLen - 1; // Skip the duplicate phrase
          break;
        }
      }
    }

    if (!isDuplicatePhrase) {
      resultWords.push(currentWord);
    }
  }

  return resultWords.join(' ');
};

export class MobileSpeechController {
  private recognition: any = null;
  private isListening: boolean = false;
  private shouldKeepListening: boolean = false;
  private currentTranscript: string = '';
  private silenceTimer: any = null;
  private handlers: SpeechRecognitionHandlers | null = null;
  private silenceTimeoutMs: number = 3500; // 3.5s of silence before auto-submission

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-IN'; // Indian English
        this.recognition.maxAlternatives = 1;
      }
    }
  }

  public isSupported(): boolean {
    return Boolean(this.recognition);
  }

  public startListening(handlers: SpeechRecognitionHandlers, silenceTimeoutMs: number = 3500) {
    if (!this.recognition) return;

    // Reset previous instance cleanly
    this.stopListening(false);

    this.handlers = handlers;
    this.silenceTimeoutMs = silenceTimeoutMs;
    this.shouldKeepListening = true;
    this.currentTranscript = '';
    this.clearSilenceTimer();

    this.setupListeners();

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (e: any) {
      console.warn('[MobileSpeechController] Start error:', e.message);
      this.isListening = true;
    }
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private resetSilenceTimer() {
    this.clearSilenceTimer();
    if (this.shouldKeepListening) {
      this.silenceTimer = setTimeout(() => {
        const text = this.getFullTranscript();
        if (text) {
          this.stopListening(true);
        }
      }, this.silenceTimeoutMs);
    }
  }

  public getFullTranscript(): string {
    return cleanSpeechTranscript(this.currentTranscript);
  }

  private setupListeners() {
    this.recognition.onstart = () => {
      this.isListening = true;
      this.handlers?.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      let finalStr = '';
      let interimStr = '';

      for (let i = 0; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          finalStr += result[0].transcript + ' ';
        } else {
          interimStr += result[0].transcript + ' ';
        }
      }

      const combined = `${finalStr} ${interimStr}`.trim();
      this.currentTranscript = combined;

      const cleaned = this.getFullTranscript();
      if (cleaned) {
        this.handlers?.onResult?.(cleaned, false);
        this.resetSilenceTimer();
      }
    };

    this.recognition.onerror = (event: any) => {
      console.warn('[MobileSpeechController] Recognition event notice:', event.error);
      if (event.error === 'no-speech') {
        return;
      }
      this.handlers?.onError?.(event.error || 'Speech recognition error');
    };

    this.recognition.onend = () => {
      if (this.shouldKeepListening) {
        try {
          this.recognition.start();
          return;
        } catch (e) {}
      }

      this.isListening = false;
      this.shouldKeepListening = false;
      this.clearSilenceTimer();
      this.handlers?.onEnd?.();
    };
  }

  public stopListening(isAutoTimeout: boolean = false) {
    this.shouldKeepListening = false;
    this.clearSilenceTimer();
    const finalCleaned = this.getFullTranscript();

    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isListening = false;
    }

    if (this.handlers) {
      this.handlers.onResult?.(finalCleaned, true);
      this.handlers.onEnd?.();
    }
  }
}

// --- Voice Intent Schema for Gemini ---
const voiceIntentSchema = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "create_task",
        "delete_task",
        "complete_task",
        "query_stock",
        "query_tasks",
        "download_invoice",
        "finance_summary",
        "unknown"
      ]
    },
    confidence: { type: "number" },
    parameters: {
      type: "object",
      properties: {
        assigned_to: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        due_date: { type: "string" },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        task_id: { type: "string" },
        task_title_match: { type: "string" },
        completed: { type: "boolean" },
        item_name: { type: "string" },
        category: { type: "string" },
        low_stock_only: { type: "boolean" },
        invoice_number: { type: "string" },
        party_name: { type: "string" }
      }
    },
    explanation: { type: "string" }
  },
  required: ["intent", "parameters"]
};

// --- Fast Local Regex Matcher (Fallback & Instant Actions) ---
export const parseLocalVoiceIntent = (
  text: string,
  employees: string[] = []
): VoiceIntentResult | null => {
  const cleaned = cleanSpeechTranscript(text);
  const lower = cleaned.toLowerCase().trim();

  // 1. Delete task pattern: "delete task [xyz]", "remove task [xyz]"
  if (lower.startsWith('delete task') || lower.startsWith('remove task')) {
    const match = lower.replace(/^(delete|remove)\s+task\s+/i, '').trim();
    return {
      intent: 'delete_task',
      confidence: 0.95,
      spoken_query: cleaned,
      parameters: { task_title_match: match },
      explanation: `Delete task matching "${match}"`
    };
  }

  // 2. Complete task pattern: "complete task [xyz]", "mark task [xyz] done", "finish task [xyz]"
  if (lower.startsWith('complete task') || lower.startsWith('finish task') || lower.includes('mark task') || lower.includes('as done') || lower.includes('completed')) {
    const match = lower.replace(/^(complete|finish|mark)\s+task\s+/i, '').replace(/\s+(done|completed|as done)$/i, '').trim();
    return {
      intent: 'complete_task',
      confidence: 0.95,
      spoken_query: cleaned,
      parameters: { task_title_match: match, completed: true },
      explanation: `Mark task "${match}" as completed`
    };
  }

  // 3. Stock queries: "stock of [xyz]", "how many [xyz] in stock", "check stock [xyz]"
  if (lower.includes('stock') || lower.includes('how many') || lower.includes('inventory of') || lower.includes('quantity of')) {
    const isLow = lower.includes('low stock') || lower.includes('below threshold') || lower.includes('shortage');
    let itemQuery = lower
      .replace(/^(check|what is the|show me|tell me the|how many)\s+/i, '')
      .replace(/^(stock of|inventory of|quantity of|units of)\s+/i, '')
      .replace(/\s+(in stock|available|we have|left)$/i, '')
      .trim();

    return {
      intent: 'query_stock',
      confidence: 0.9,
      spoken_query: cleaned,
      parameters: { item_name: itemQuery, low_stock_only: isLow },
      explanation: isLow ? `Check low-stock items` : `Check stock count for "${itemQuery}"`
    };
  }

  // 4. Invoice download: "download invoice [xyz]", "get invoice [xyz]", "invoice for [xyz]"
  if (lower.includes('invoice') && (lower.includes('download') || lower.includes('pdf') || lower.includes('get') || lower.includes('show'))) {
    const invMatch = lower.match(/(?:invoice|bill|inv)\s+(?:number\s+|#\s*)?([a-z0-9\-\/]+)/i);
    const invNum = invMatch ? invMatch[1].trim() : '';
    return {
      intent: 'download_invoice',
      confidence: 0.9,
      spoken_query: cleaned,
      parameters: { invoice_number: invNum, party_name: cleaned.replace(/^(download|get|find|show)\s+(invoice|pdf)\s+/i, '').trim() },
      explanation: invNum ? `Download Invoice #${invNum} PDF` : `Download Invoice PDF for query "${cleaned}"`
    };
  }

  // 5. Add / Assign / Order task pattern:
  const isTaskInstruction = 
    lower.startsWith('add task') || 
    lower.startsWith('assign task') || 
    lower.startsWith('new task') || 
    lower.startsWith('create task') ||
    lower.startsWith('to order') ||
    lower.startsWith('order ') ||
    lower.startsWith('buy ') ||
    lower.startsWith('procure ') ||
    lower.startsWith('tell ') ||
    lower.startsWith('ask ');

  if (isTaskInstruction) {
    let clean = lower
      .replace(/^(add|assign|new|create)\s+task\s+(to|for)?\s*/i, '')
      .replace(/^(tell|ask)\s+/i, '')
      .replace(/^to\s+/i, '')
      .trim();

    let assigned = '';
    
    // Check if mentions employee name
    for (const emp of employees) {
      if (clean.toLowerCase().startsWith(emp.toLowerCase())) {
        assigned = emp;
        clean = clean.substring(emp.length).replace(/^(:|-|to|,|\s)+/i, '').trim();
        break;
      }
    }

    const finalTitle = clean ? (clean.charAt(0).toUpperCase() + clean.slice(1)) : cleaned;

    return {
      intent: 'create_task',
      confidence: 0.85,
      spoken_query: cleaned,
      parameters: {
        assigned_to: assigned || (employees.length > 0 ? employees[0] : 'Unassigned'),
        title: finalTitle,
        due_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
      },
      explanation: `Create task: "${finalTitle}"`
    };
  }

  return null;
};

// --- Parse Voice Intent using Gemini AI ---
export const parseVoiceIntentWithAI = async (
  spokenText: string,
  context: {
    employees: string[];
    products: string[];
    tasks: { id: string; title: string; assigned_to: string }[];
  }
): Promise<VoiceIntentResult> => {
  const cleaned = cleanSpeechTranscript(spokenText);
  const localMatch = parseLocalVoiceIntent(cleaned, context.employees);
  if (localMatch && localMatch.confidence >= 0.9) {
    return localMatch;
  }

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const systemPrompt = `You are an AI Voice Controller for the ${getActiveBrand().companyName} Mobile Plant OS.
Translate the user's spoken voice command into a structured database action JSON.

TODAY'S DATE: ${todayStr}

SYSTEM CONTEXT:
[EMPLOYEES]: ${JSON.stringify(context.employees)}
[RECENT_TASKS]: ${JSON.stringify(context.tasks.slice(0, 15).map(t => ({ id: t.id, title: t.title, assigned_to: t.assigned_to })))}
[PRODUCT_CATALOG_SAMPLE]: ${JSON.stringify(context.products.slice(0, 20))}

INTENT RULES:
1. **create_task**: Spoken request to create, add, or assign work/tasks, orders, or procurement to employees (e.g. "order solar panel from ...", "buy connectors", "ask Rahul to assemble packs"). Match closest employee in [EMPLOYEES] or default to first available.
2. **delete_task**: Request to delete, remove, or cancel a task. Try to match task_id or title in [RECENT_TASKS].
3. **complete_task**: Request to mark a task as finished, done, or complete.
4. **query_stock**: Questions about quantity, stock, inventory, low stock alert count.
5. **query_tasks**: Questions asking what tasks are pending, who has what tasks, or overdue tasks.
6. **download_invoice**: Request to download, get, or view an invoice PDF by invoice number or client name.
7. **finance_summary**: Questions about sales total, purchase total, or monthly revenue.
8. **unknown**: If the voice query is completely unrelated or unrecognizable.

User Spoken Query: "${cleaned}"`;

    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'parseVoiceIntent',
        payload: {
          prompt: systemPrompt,
          schema: voiceIntentSchema
        }
      })
    });

    if (!response.ok) {
      if (localMatch) return localMatch;
      throw new Error(`AI Gateway error (${response.status})`);
    }

    const data = await response.json();
    let text = (data.text || '').trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(text);

    return {
      intent: parsed.intent || 'unknown',
      confidence: parsed.confidence || 0.85,
      spoken_query: cleaned,
      parameters: parsed.parameters || {},
      explanation: parsed.explanation
    };
  } catch (error: any) {
    console.warn('[mobileVoiceService] AI parsing fallback to local matcher:', error);
    return localMatch || {
      intent: 'unknown',
      confidence: 0,
      spoken_query: cleaned,
      parameters: { title: cleaned },
      explanation: `Could not parse command: "${cleaned}"`
    };
  }
};
