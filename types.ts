export interface Language {
  code: string;
  name: string;
  flag: string;
}

export interface Example {
  target: string;
  native: string;
}

export interface ScenarioLine {
  speaker: string;
  text: string;
  translation: string;
}

export interface DictionaryEntry {
  id: string;
  term: string; // Original search query
  translatedTerm: string; // The specific word/phrase in target language
  definitionTarget: string; // Explanation in target language
  definitionNative: string; // Explanation in native language
  examples: Example[];
  scenario: ScenarioLine[]; // Dialogue
  usageNote: string;
  imageUrl?: string;
  sourceLang: string;
  targetLang: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export enum AppView {
  ONBOARDING = 'ONBOARDING',
  SEARCH = 'SEARCH',
  RESULT = 'RESULT',
  NOTEBOOK = 'NOTEBOOK',
  FLASHCARDS = 'FLASHCARDS',
  STORY = 'STORY'
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
];