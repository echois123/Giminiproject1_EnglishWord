import React from 'react';
import { LANGUAGES, Language } from '../types';

interface Props {
  label: string;
  selected: string;
  onSelect: (code: string) => void;
}

export const LanguageSelector: React.FC<Props> = ({ label, selected, onSelect }) => {
  return (
    <div className="mb-4">
      <label className="block text-gray-700 text-sm font-bold mb-2">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => onSelect(lang.code)}
            className={`p-3 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${
              selected === lang.code
                ? 'border-violet-600 bg-violet-50 text-violet-900 shadow-md'
                : 'border-gray-100 bg-white text-gray-600 hover:border-violet-200'
            }`}
          >
            <span className="text-xl">{lang.flag}</span>
            <span className="font-semibold">{lang.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};