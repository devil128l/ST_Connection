import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
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

export async function askGeminiAssistant(prompt: string, contextMessages: { sender: string; content: string }[] = []): Promise<string> {
  const settings = db.get().settings;
  if (!settings.features.geminiAi || !settings.aiSettings.enabled) {
    return 'ST AI Assistant is currently disabled by the system administrator.';
  }

  const ai = getAIClient();
  if (!ai) {
    return 'ST AI Assistant is ready! Note: GEMINI_API_KEY is not configured yet in Settings > Secrets. Once configured, full real-time Gemini intelligence is active. (Simulated AI preview: I am here to help you connect with everyone on ST CONNECTION!)';
  }

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
    console.error('Gemini Assistant Error:', error);
    return `AI Assistant temporarily encountered an error: ${error?.message || 'Please check API quota or try again.'}`;
  }
}

export async function generateQuickReplies(lastMessage: string): Promise<string[]> {
  const settings = db.get().settings;
  if (!settings.features.geminiAi || !settings.aiSettings.enabled) {
    return ['Sounds good!', 'Got it, thanks!', 'Talk soon!'];
  }

  const ai = getAIClient();
  if (!ai) {
    return ['Sounds great!', 'I agree! 👍', 'Let me check on that.'];
  }

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

    return lines.length === 3 ? lines : ['Got it!', 'Will do!', 'Thanks for the update!'];
  } catch {
    return ['Sounds great!', 'Got it, thanks!', 'Will get back to you!'];
  }
}

export async function rewriteMessage(text: string, tone: 'professional' | 'concise' | 'friendly' | 'enthusiastic' | 'humorous'): Promise<string> {
  const ai = getAIClient();
  if (!ai) {
    return `[${tone} preview]: ${text}`;
  }

  try {
    const prompt = `Rewrite the following message to sound ${tone}. Keep the original meaning intact and do not include quotes or conversational preamble:
"${text}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    return response.text?.trim() || text;
  } catch (err: any) {
    return text;
  }
}

export async function correctGrammar(text: string): Promise<string> {
  const ai = getAIClient();
  if (!ai) {
    return text;
  }

  try {
    const prompt = `Correct any spelling, punctuation, and grammar mistakes in the following text. Return ONLY the corrected sentence without any explanation:
"${text}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    return response.text?.trim() || text;
  } catch {
    return text;
  }
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  const ai = getAIClient();
  if (!ai) {
    return `[Translated to ${targetLanguage}]: ${text}`;
  }

  try {
    const prompt = `Translate the following text into ${targetLanguage}. Return ONLY the direct translation without extra commentary:
"${text}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    return response.text?.trim() || text;
  } catch {
    return text;
  }
}

export async function summarizeChat(messages: { sender: string; content: string }[]): Promise<string> {
  const ai = getAIClient();
  if (!ai) {
    return 'Summary: Quick conversation exchange between participants regarding platform features.';
  }

  try {
    const textData = messages.map(m => `${m.sender}: ${m.content}`).join('\n');
    const prompt = `Summarize this chat conversation in 3 clear, concise bullet points highlighting key decisions or takeaways:\n${textData}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are an executive chat summarizer. Provide a crisp 3-bullet summary.',
      },
    });

    return response.text?.trim() || 'No summary available.';
  } catch (err: any) {
    return 'Could not generate summary at this time.';
  }
}
