import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim() || apiKey === 'your_key_here') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export function setGeminiApiKey(newKey: string): void {
  const cleanKey = newKey.trim();
  process.env.GEMINI_API_KEY = cleanKey;
  aiClient = new GoogleGenAI({
    apiKey: cleanKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getGeminiKeyStatus(): { configured: boolean; maskedKey?: string } {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !key.trim()) return { configured: false };
  const clean = key.trim();
  const masked = clean.length > 10 ? `${clean.slice(0, 6)}...${clean.slice(-4)}` : '***';
  return { configured: true, maskedKey: masked };
}

function getValidGeminiModel(configuredModel?: string): string {
  if (!configuredModel || configuredModel.includes('2.5') || configuredModel.includes('1.5')) {
    return 'gemini-3.8-flash';
  }
  return configuredModel;
}

async function callOllamaIfAvailable(prompt: string, systemPrompt?: string): Promise<string | null> {
  const ollamaUrl = process.env.OLLAMA_URL;
  if (!ollamaUrl && process.env.USE_OLLAMA !== 'true') {
    return null;
  }
  const endpoint = (ollamaUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: systemPrompt ? `System: ${systemPrompt}\nUser: ${prompt}` : prompt,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as any;
      if (data && data.response) {
        return data.response.trim();
      }
    }
  } catch {}
  return null;
}

function getSmartOfflineReply(prompt: string): string {
  const p = prompt.toLowerCase().trim();
  if (p.includes('hello') || p.includes('hi') || p.includes('hey') || p.includes('salam') || p.includes('namaste')) {
    return '👋 Hello! Welcome to ST CONNECTION. I am your built-in AI Assistant. How can I help you today? You can chat with contacts, start a voice/video call, create channels, or ask me anything!';
  }
  if (p.includes('who are you') || p.includes('what are you') || p.includes('kya ho')) {
    return '🤖 I am the ST CONNECTION AI Assistant. I can help answer questions, summarize your chats, draft messages, and assist with platform features.';
  }
  if (p.includes('call') || p.includes('video') || p.includes('audio')) {
    return '📞 ST CONNECTION supports real-time WebRTC voice and video calling. To start a call, open any contact or chat and tap the Phone or Video camera icon in the top right corner!';
  }
  if (p.includes('channel') || p.includes('group')) {
    return '📢 You can create public or private channels to broadcast updates, or create group chats with multiple participants from the "+" button in the chats list!';
  }
  if (p.includes('admin') || p.includes('badge') || p.includes('blue tick')) {
    return '🛡️ The platform features a dedicated Admin Portal (accessible via ?portal=admin). Platform administrators can grant Verified Blue Ticks, Developer Badges, manage reports, and broadcast system announcements.';
  }
  if (p.includes('help') || p.includes('madad')) {
    return '💡 Here are a few things you can do on ST CONNECTION:\n1. 💬 Send instant messages with typing indicators & read receipts\n2. 🎙️ Record and send voice notes\n3. 📹 Start HD Voice & Video calls\n4. 📸 Share 24-hour stories\n5. 📢 Create announcement channels';
  }
  return `✨ I received your message: "${prompt}".\n\nI am running on the server. If you want full generative conversational capabilities, you can enter a free Google Gemini API Key in the Admin Portal (> Gemini AI Engine) or run a local model like Ollama (llama3.2) on your VPS!`;
}

export async function askGeminiAssistant(prompt: string, contextMessages: { sender: string; content: string }[] = []): Promise<string> {
  const settings = db.get().settings;
  if (!settings.features.geminiAi || !settings.aiSettings.enabled) {
    return 'ST AI Assistant is currently disabled by the system administrator.';
  }

  // 1. Try local self-hosted Ollama on VPS first if running (Zero API keys needed!)
  const ollamaReply = await callOllamaIfAvailable(prompt, settings.aiSettings.systemPrompt);
  if (ollamaReply) {
    return ollamaReply;
  }

  // 2. Try Google Gemini API client if configured
  const ai = getAIClient();
  if (ai) {
    try {
      const formattedHistory = contextMessages.map(m => `${m.sender}: ${m.content}`).join('\n');
      const fullPrompt = formattedHistory
        ? `Recent Conversation Context:\n${formattedHistory}\n\nUser Question:\n${prompt}`
        : prompt;

      const response = await ai.models.generateContent({
        model: getValidGeminiModel(settings.aiSettings.model),
        contents: fullPrompt,
        config: {
          systemInstruction: settings.aiSettings.systemPrompt || 'You are the ST CONNECTION AI Assistant. Provide helpful, concise, and friendly responses.',
        },
      });

      return response.text || 'No response generated.';
    } catch (error: any) {
      console.warn('Gemini Assistant API Error, using smart offline reply:', error?.message);
    }
  }

  // 3. Fallback to built-in smart conversational engine (Works without any API key!)
  return getSmartOfflineReply(prompt);
}

export async function generateQuickReplies(lastMessage: string): Promise<string[]> {
  const settings = db.get().settings;
  if (!settings.features.geminiAi || !settings.aiSettings.enabled) {
    return ['Sounds good!', 'Got it, thanks!', 'Talk soon!'];
  }

  const ai = getAIClient();
  if (ai) {
    try {
      const prompt = `Given this chat message: "${lastMessage}", provide exactly 3 short, natural, conversational quick replies (each under 6 words). Return only the 3 options, one per line, without numbers or quotes.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are a messaging smart reply generator. Output exactly 3 short smart suggestions, one per line.',
        },
      });

      const lines = (response.text || '')
        .split('\n')
        .map(l => l.replace(/^[-*0-9.)\s]+/, '').trim())
        .filter(l => l.length > 0)
        .slice(0, 3);

      if (lines.length === 3) return lines;
    } catch {}
  }

  const lower = lastMessage.toLowerCase();
  if (lower.includes('?') || lower.includes('when') || lower.includes('where') || lower.includes('how')) {
    return ['Sure, let me check!', 'I am not sure yet.', 'Yes, absolutely!'];
  }
  if (lower.includes('thank') || lower.includes('thanks') || lower.includes('shukriya')) {
    return ['You are welcome! 😊', 'Anytime!', 'No problem at all!'];
  }
  return ['Sounds great! 👍', 'Got it, thanks!', 'Talk to you soon!'];
}

export async function rewriteMessage(text: string, tone: 'professional' | 'concise' | 'friendly' | 'enthusiastic' | 'humorous'): Promise<string> {
  const prompt = `Rewrite the following message to sound ${tone}. Keep the original meaning intact and do not include quotes or conversational preamble:\n"${text}"`;
  
  const ollama = await callOllamaIfAvailable(prompt);
  if (ollama) return ollama;

  const ai = getAIClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });
      return response.text?.trim() || text;
    } catch {}
  }
  return text;
}

export async function correctGrammar(text: string): Promise<string> {
  const prompt = `Correct any spelling, punctuation, and grammar mistakes in the following text. Return ONLY the corrected sentence without any explanation:\n"${text}"`;
  
  const ollama = await callOllamaIfAvailable(prompt);
  if (ollama) return ollama;

  const ai = getAIClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });
      return response.text?.trim() || text;
    } catch {}
  }
  return text;
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  const prompt = `Translate the following text into ${targetLanguage}. Return ONLY the direct translation without extra commentary:\n"${text}"`;

  const ollama = await callOllamaIfAvailable(prompt);
  if (ollama) return ollama;

  const ai = getAIClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });
      return response.text?.trim() || text;
    } catch {}
  }
  return text;
}

export async function summarizeChat(messages: { sender: string; content: string }[]): Promise<string> {
  const textData = messages.map(m => `${m.sender}: ${m.content}`).join('\n');
  const prompt = `Summarize this chat conversation in 3 clear, concise bullet points highlighting key decisions or takeaways:\n${textData}`;

  const ollama = await callOllamaIfAvailable(prompt, 'You are an executive chat summarizer. Provide a crisp 3-bullet summary.');
  if (ollama) return ollama;

  const ai = getAIClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are an executive chat summarizer. Provide a crisp 3-bullet summary.',
        },
      });
      return response.text?.trim() || 'No summary available.';
    } catch {}
  }

  // Smart offline summary
  const senders = Array.from(new Set(messages.map(m => m.sender))).join(', ');
  return `• Conversation between: ${senders}\n• Total messages exchanged: ${messages.length}\n• Latest message: "${messages[messages.length - 1]?.content.slice(0, 50)}..."`;
}
