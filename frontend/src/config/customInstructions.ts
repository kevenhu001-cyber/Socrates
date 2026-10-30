import { reportSwallow } from '../util/reportSwallow.ts';

export interface CustomInstructions {
  response: string;
  about: string;
  savedAt: string;
}

const STORAGE_KEY = 'socrates-custom-instructions';

export function loadCustomInstructions(): CustomInstructions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const value = parsed as Record<string, unknown>;
        return {
          response: typeof value.response === 'string' ? value.response : '',
          about: typeof value.about === 'string' ? value.about : '',
          savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
        };
      }
    }
  } catch (error) {
    reportSwallow(error, 'config/customInstructions.load', 'expected');
  }
  return { response: '', about: '', savedAt: '' };
}

export function saveCustomInstructions(value: CustomInstructions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    reportSwallow(error, 'config/customInstructions.save', 'expected');
  }
}

export function buildCustomInstructionsString(value: Pick<CustomInstructions, 'response' | 'about'>): string {
  const parts: string[] = [];
  if (value.response) parts.push('[How to respond]\n' + value.response);
  if (value.about) parts.push('[About the user]\n' + value.about);
  return parts.join('\n\n');
}

export function getCustomInstructionsString(): string {
  return buildCustomInstructionsString(loadCustomInstructions());
}
