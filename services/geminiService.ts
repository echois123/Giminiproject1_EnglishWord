import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DictionaryEntry, ChatMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to clean JSON text (remove markdown code blocks if present)
const cleanJsonText = (text: string): string => {
  return text.replace(/```json|```/g, '').trim();
};

// -- Dictionary Lookup --
export const lookupWord = async (
  term: string,
  sourceLang: string,
  targetLang: string
): Promise<Partial<DictionaryEntry>> => {
  const model = "gemini-2.5-flash";
  
  const prompt = `
    Role: Expert Language Tutor.
    Task: Create a comprehensive dictionary entry for the term "${term}".
    Context: User speaks ${sourceLang} and is learning ${targetLang}.

    CRITICAL INSTRUCTIONS:
    1. 'translatedTerm': The standard translation of "${term}" in ${targetLang}.
    2. 'definitionTarget': A clear, simple definition written in ${targetLang}.
    3. 'definitionNative': The translation of that definition into ${sourceLang} (as a subtitle).
    4. 'examples': MUST provide exactly 2 distinct example sentences showing how to use the word.
       - 'target': The sentence in ${targetLang}.
       - 'native': The translation in ${sourceLang}.
    5. 'scenario': MUST provide a realistic dialogue (3-4 lines) between two people using the word in context.
       - 'speaker': Name (e.g., A, B, or specific names).
       - 'text': What they say in ${targetLang}.
       - 'translation': Translation in ${sourceLang}.
    6. 'usageNote': A friendly, casual tip in ${sourceLang} about tone/culture.

    Ensure 'examples' and 'scenario' are populated. Do not return empty arrays.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translatedTerm: { type: Type.STRING },
          definitionTarget: { type: Type.STRING },
          definitionNative: { type: Type.STRING },
          examples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                target: { type: Type.STRING },
                native: { type: Type.STRING },
              },
            },
          },
          scenario: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                speaker: { type: Type.STRING },
                text: { type: Type.STRING },
                translation: { type: Type.STRING },
              },
            },
          },
          usageNote: { type: Type.STRING },
        },
      },
    },
  });

  if (!response.text) throw new Error("No text response");
  
  try {
    const cleanedText = cleanJsonText(response.text);
    return JSON.parse(cleanedText);
  } catch (e) {
    console.error("Failed to parse JSON:", response.text);
    throw new Error("Invalid response format");
  }
};

// -- Image Generation --
export const generateConceptImage = async (term: string, context: string): Promise<string | undefined> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: `A simple, modern, flat vector art style illustration representing the concept: "${term}". Context: ${context}. Bright colors, minimalist, icon-like, white background. High contrast.`,
      config: {
        // Nano Banana models use generateContent
      }
    });
    
    // Check for inline image data in parts
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return undefined;
  } catch (e) {
    console.error("Image generation failed", e);
    return undefined; // Fail gracefully
  }
};

// -- Text to Speech (With Caching) --
const ttsCache = new Map<string, string>();

export const generateSpeech = async (text: string): Promise<string | null> => {
  if (!text) return null;
  
  // Check cache first
  if (ttsCache.has(text)) {
    return ttsCache.get(text)!;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' }, // Puck is energetic
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData?.data) {
      const audioData = part.inlineData.data;
      ttsCache.set(text, audioData); // Store in cache
      return audioData;
    }
    return null;
  } catch (e) {
    console.error("TTS failed", e);
    return null;
  }
};

// -- Chat --
export const sendChatMessage = async (
  history: ChatMessage[],
  newMessage: string,
  contextEntry: DictionaryEntry
): Promise<string> => {
  const model = "gemini-2.5-flash";
  
  const contextPrompt = `
    Context: User is learning the word "${contextEntry.translatedTerm}" (Source: "${contextEntry.term}").
    Definition: ${contextEntry.definitionTarget}.
    Role: You are a helpful, fun language tutor. Answer the user's question about this word.
    Chat History:
    ${history.map(h => `${h.role}: ${h.text}`).join('\n')}
    User: ${newMessage}
    Model:
  `;

  const response = await ai.models.generateContent({
    model,
    contents: contextPrompt,
  });

  return response.text || "I couldn't understand that.";
};

// -- Story Generator --
export const generateStory = async (entries: DictionaryEntry[], langCode: string): Promise<string> => {
  const terms = entries.map(e => e.translatedTerm).join(", ");
  const model = "gemini-2.5-flash";
  
  const prompt = `
    You are a creative writer for language learners.
    Target Language Code: ${langCode}.
    
    Task: Write a very short, funny, and coherent story (max 60 words) in the Target Language using EXACLTY these words: ${terms}.
    
    Requirements:
    1. The story must be written entirely in the Target Language.
    2. Highlight the specific words used from the list by wrapping them in **double asterisks** (e.g., **word**).
    3. Keep the grammar simple and suitable for a learner.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });
  return response.text || "Could not generate story.";
};