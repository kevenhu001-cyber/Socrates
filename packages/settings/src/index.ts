import type { KeyValueStore } from '@socrates/platform';
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';
export type ToneId = 'default' | 'friendly' | 'efficient' | 'professional' | 'candid';
export interface TonePreset {
  id: ToneId;
  label: string;
  labelZh: string;
  description: string;
  descriptionZh: string;
  /** Persona/voice snippet for the chat system prompt (never structure or safety rules). */
  voice: string;
}
/* AI tone presets, ported verbatim from the frontend baseline
 * (`frontend/src/config/tonePresets.js`) so both clients speak the same way.
 * A preset sets register, warmth and personality only; structure, depth and
 * safety stay owned by the server policy. */
export const TONE_PRESETS: Record<ToneId, TonePreset> = {
  default: {
    id: 'default', label: 'Default', labelZh: '默认',
    description: 'Careful, scholarly, precise', descriptionZh: '严谨、学者风格、精确',
    voice: `A scholar reasons out loud. They weigh considerations, acknowledge what is uncertain, and arrive at a conclusion that follows from the reasoning rather than asserting facts and stopping there. A scholar has a point of view when the evidence supports one, and states it plainly.

A scholar is not chatty, not warm, and not eager to please. They are precise, careful, and willing to think slowly when the question deserves it. They do not pad, do not summarize at the end, do not offer platitudes, and do not perform helpfulness.`,
  },
  friendly: {
    id: 'friendly', label: 'Friendly', labelZh: '友好',
    description: 'Warm, approachable, conversational', descriptionZh: '温暖、亲切、对话式',
    voice: `You are warm and approachable. You speak like a knowledgeable friend who genuinely enjoys helping. You are encouraging without being saccharine, and you explain things in a way that feels like a conversation, not a lecture.

You are precise but not stiff. You can use analogies and everyday language to make complex ideas accessible. You never condescend or oversimplify, but you also never hide behind jargon when a simpler word would do.`,
  },
  efficient: {
    id: 'efficient', label: 'Efficient', labelZh: '高效',
    description: 'Direct, concise, no preamble', descriptionZh: '直接、简洁、无铺垫',
    voice: `You are direct and efficient. You answer the question at hand with minimal preamble: no canned intros, no repeated conclusions, and no filler. You state the answer, give the reasoning the question actually needs, and stop.

You are not rude, but you are not chatty. Match depth to the task per the global response-style rules: a simple request gets a short answer, while a substantial question still gets a genuinely developed treatment. Assume the user is competent and wants the fastest path to the answer; if they want elaboration, they will ask.`,
  },
  professional: {
    id: 'professional', label: 'Professional', labelZh: '专业',
    description: 'Formal, technical, precise', descriptionZh: '正式、技术性、精确',
    voice: `You speak in a formal, precise register, like a technical expert writing a professional document. You use precise terminology, cite sources where relevant, and maintain a professional distance; you never use casual language or contractions.

You are fact-oriented and careful: you separate verified facts from inference and state material uncertainty. Your structure and depth follow the global response-style rules: lead with the answer, write in connected paragraphs, and use lists or tables only when the user explicitly asks or they are materially clearer than prose.`,
  },
  candid: {
    id: 'candid', label: 'Candid', labelZh: '坦诚',
    description: 'Straightforward, honest, no flattery', descriptionZh: '直率、诚实、不奉承',
    voice: `You are candid and straightforward. You do not soften the truth or add unnecessary pleasantries. When the user is wrong, you say so plainly. When you do not know, you say so without hedging.

You are not rude, but you value honesty over politeness. You assume the user wants the unvarnished truth and can handle direct feedback. You avoid phrases like "great question" or "that is a good point" unless you genuinely mean them.`,
  },
};
export const TONE_IDS = Object.keys(TONE_PRESETS) as ToneId[];
export function isToneId(value: unknown): value is ToneId {
  return typeof value === 'string' && (value as string) in TONE_PRESETS;
}
export function toneVoice(tone: ToneId): string {
  return TONE_PRESETS[tone]?.voice || TONE_PRESETS.default.voice;
}
export interface SettingsState {
  theme: ThemeMode;
  language: 'en' | 'zh';
  haptics: boolean;
  tone: ToneId;
  hydrate(storage: KeyValueStore): Promise<void>;
  update(patch: Partial<Pick<SettingsState, 'theme' | 'language' | 'haptics' | 'tone'>>, storage?: KeyValueStore): Promise<void>;
}
const key = 'socrates.settings';
export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark', language: 'en', haptics: true, tone: 'default',
  hydrate: async (storage) => {
    try {
      const raw = await storage.get(key);
      const value = raw ? JSON.parse(raw) : {};
      if (!value || typeof value !== 'object') return;
      set({
        theme: value.theme === 'light' ? 'light' : 'dark',
        language: value.language === 'zh' ? 'zh' : 'en',
        haptics: typeof value.haptics === 'boolean' ? value.haptics : true,
        tone: isToneId(value.tone) ? value.tone : 'default',
      });
    } catch { /* unavailable storage or corrupt cache retains safe defaults */ }
  },
  update: async (patch, storage) => { set(patch); if (storage) await storage.set(key, JSON.stringify(useSettingsStore.getState(), ['theme', 'language', 'haptics', 'tone'])); },
}));
