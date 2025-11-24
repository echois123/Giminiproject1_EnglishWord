import React, { useState, useEffect, useRef } from 'react';
import { 
  AppView, 
  Language, 
  LANGUAGES, 
  DictionaryEntry, 
  ChatMessage 
} from './types';
import { LanguageSelector } from './components/LanguageSelector';
import { 
  lookupWord, 
  generateConceptImage, 
  generateSpeech, 
  sendChatMessage,
  generateStory 
} from './services/geminiService';
import { audioPlayer } from './services/audioUtils';
import { 
  BookOpenIcon, 
  SparklesIcon, 
  SpeakerWaveIcon, 
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  HomeIcon,
  AcademicCapIcon,
  PlusIcon,
  CheckIcon,
  UserGroupIcon,
  ChevronLeftIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  CursorArrowRaysIcon
} from '@heroicons/react/24/solid';

const App: React.FC = () => {
  // -- State --
  const [view, setView] = useState<AppView>(AppView.ONBOARDING);
  const [history, setHistory] = useState<AppView[]>([]); // Navigation Stack

  const [nativeLang, setNativeLang] = useState<string>('en');
  const [targetLang, setTargetLang] = useState<string>('es');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<DictionaryEntry | null>(null);
  
  const [notebook, setNotebook] = useState<DictionaryEntry[]>(() => {
    const saved = localStorage.getItem('lingopop_notebook');
    return saved ? JSON.parse(saved) : [];
  });

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Story State
  const [story, setStory] = useState<string | null>(null);
  const [isStoryLoading, setIsStoryLoading] = useState(false);
  const [selectedStoryWordIds, setSelectedStoryWordIds] = useState<string[]>([]);

  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Audio loading state tracking (key: text content or ID)
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);

  // -- Effects --
  useEffect(() => {
    localStorage.setItem('lingopop_notebook', JSON.stringify(notebook));
  }, [notebook]);

  // Pre-fetch audio for the main term when entry loads to reduce perceived latency
  useEffect(() => {
    if (currentEntry?.translatedTerm) {
      generateSpeech(currentEntry.translatedTerm).then(() => {
        // Cached quietly
        console.log("Pre-fetched audio for", currentEntry.translatedTerm);
      });
    }
  }, [currentEntry]);

  // -- Navigation Handlers --

  const navigateTo = (newView: AppView) => {
    if (newView === view) return;
    setHistory(prev => [...prev, view]);
    setView(newView);
  };

  const goBack = () => {
    if (history.length === 0) {
        if (view !== AppView.SEARCH && view !== AppView.ONBOARDING) {
          setView(AppView.SEARCH);
        }
        return;
    }
    const prevView = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setView(prevView);
  };

  // -- Feature Handlers --

  const performLookup = async (term: string) => {
    if (!term.trim()) return;

    setLoading(true);
    // If we are looking up from a double click, ensure we are in RESULT view or move there
    // If triggered from Search view, natural flow. If from Story, we push Story to history.
    
    // We don't reset currentEntry immediately if we want to show a loading overlay, 
    // but to keep it clean, let's reset or show loading state over it.
    // setCurrentEntry(null); 
    setIsChatOpen(false);
    setChatHistory([]);
    setSearchQuery(term); // Sync input with the lookup

    try {
      // 1. Text Data
      const textData = await lookupWord(term, nativeLang, targetLang);
      
      // 2. Image Generation
      const promptTerm = textData.translatedTerm || term;
      const imageUrl = await generateConceptImage(promptTerm, textData.definitionNative || "");

      const newEntry: DictionaryEntry = {
        id: Date.now().toString(),
        term: term,
        translatedTerm: textData.translatedTerm || term,
        definitionTarget: textData.definitionTarget || "Definition not found",
        definitionNative: textData.definitionNative || "Definition not found",
        examples: textData.examples || [],
        scenario: textData.scenario || [],
        usageNote: textData.usageNote || "No usage note available.",
        imageUrl: imageUrl,
        sourceLang: nativeLang,
        targetLang: targetLang,
        createdAt: Date.now()
      };

      setCurrentEntry(newEntry);
      navigateTo(AppView.RESULT);
    } catch (err) {
      console.error(err);
      alert("Oops! We couldn't find that word. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLookup(searchQuery);
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection) return;
    
    // Clean punctuation
    const text = selection.toString().trim().replace(/[.,!?;:"'()]/g, '');
    
    if (text.length > 0) {
      // Small delay to let the selection visual settle, then lookup
      performLookup(text);
    }
  };

  const playAudio = async (text: string, uniqueId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (audioLoadingId) return; // Prevent concurrent plays for now
    if (!text) return;

    setAudioLoadingId(uniqueId);
    try {
      const audioData = await generateSpeech(text);
      if (audioData) {
        await audioPlayer.playBase64Audio(audioData);
      }
    } catch (err) {
      console.error("Audio playback error", err);
    } finally {
      setAudioLoadingId(null);
    }
  };

  const addToNotebook = () => {
    if (currentEntry && !notebook.find(n => n.id === currentEntry.id)) {
      setNotebook([currentEntry, ...notebook]);
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || !currentEntry) return;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');

    try {
      const response = await sendChatMessage(chatHistory, chatInput, currentEntry);
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: response };
      setChatHistory(prev => [...prev, aiMsg]);
    } catch (e) {
      console.error("Chat error", e);
    }
  };

  // -- Story Logic --

  const toggleStoryWordSelection = (id: string) => {
    if (selectedStoryWordIds.includes(id)) {
      setSelectedStoryWordIds(prev => prev.filter(wId => wId !== id));
    } else {
      if (selectedStoryWordIds.length >= 5) {
        alert("You can only select up to 5 words!");
        return;
      }
      setSelectedStoryWordIds(prev => [...prev, id]);
    }
  };

  const handleGenerateSelectedStory = async () => {
    if (selectedStoryWordIds.length === 0) return;
    
    const selectedEntries = notebook.filter(n => selectedStoryWordIds.includes(n.id));
    
    setIsStoryLoading(true);
    setStory(null);
    
    try {
      const generatedStory = await generateStory(selectedEntries, targetLang);
      setStory(generatedStory);
    } catch (e) {
      alert("Failed to generate story. Please try again.");
    } finally {
      setIsStoryLoading(false);
    }
  };

  const resetStory = () => {
    setStory(null);
    setSelectedStoryWordIds([]);
  };

  const startFlashcards = () => {
    if (notebook.length === 0) return alert("Your Notebook is empty! Add some words first.");
    setFlashcardIndex(0);
    setIsFlipped(false);
    navigateTo(AppView.FLASHCARDS);
  };

  // -- Render Helpers --

  const getNativeLangName = () => LANGUAGES.find(l => l.code === nativeLang)?.name;
  const getTargetLangName = () => LANGUAGES.find(l => l.code === targetLang)?.name;

  // -- Views --

  if (view === AppView.ONBOARDING) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-yellow-100 to-orange-100">
        <h1 className="text-4xl font-extrabold text-violet-900 mb-2">LingoPop! 🎈</h1>
        <p className="text-gray-600 mb-8 text-center">Your fun, AI-powered language buddy.</p>
        
        <div className="w-full max-w-md bg-white p-6 rounded-3xl shadow-xl">
          <LanguageSelector label="I speak..." selected={nativeLang} onSelect={setNativeLang} />
          <LanguageSelector label="I want to learn..." selected={targetLang} onSelect={setTargetLang} />
          
          <button 
            onClick={() => setView(AppView.SEARCH)}
            className="w-full mt-6 bg-violet-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-violet-700 transform hover:scale-[1.02] transition-all"
          >
            Let's Go! 🚀
          </button>
        </div>
      </div>
    );
  }

  // Common Layout for other views
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto shadow-2xl overflow-hidden relative">
      
      {/* Header */}
      <div className="bg-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        {history.length > 0 || view !== AppView.SEARCH ? (
          <button onClick={goBack} className="p-2 text-gray-600 hover:text-violet-600 rounded-full hover:bg-violet-50 transition">
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        ) : (
          <div className="w-10"></div>
        )}
        
        <div className="font-bold text-violet-900 text-lg flex items-center gap-2">
           <span>LingoPop</span>
           <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full">
             {getNativeLangName()} → {getTargetLangName()}
           </span>
        </div>
        
        {view !== AppView.SEARCH ? (
           <button onClick={() => { setHistory([]); setView(AppView.SEARCH); }} className="p-2 text-gray-400 hover:text-violet-600">
             <HomeIcon className="h-6 w-6" />
           </button>
        ) : (
          <div className="w-10"></div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto hide-scrollbar pb-24">
        
        {/* VIEW: SEARCH (Dashboard) */}
        {view === AppView.SEARCH && (
          <div className="p-6 flex flex-col items-center min-h-[80vh]">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 mt-4">What do you want to learn?</h2>
            <form onSubmit={handleSearchSubmit} className="w-full relative mb-12">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type a word..."
                className="w-full p-5 text-lg rounded-2xl border-2 border-violet-100 focus:border-violet-500 focus:outline-none shadow-sm"
              />
              <button 
                type="submit"
                disabled={loading}
                className="absolute right-3 top-3 bg-violet-600 text-white p-2 rounded-xl hover:bg-violet-700 disabled:opacity-50"
              >
                {loading ? <ArrowPathIcon className="h-6 w-6 animate-spin" /> : <SparklesIcon className="h-6 w-6" />}
              </button>
            </form>
            
            <div className="w-full grid grid-cols-2 gap-4">
               {/* Notebook */}
               <button onClick={() => navigateTo(AppView.NOTEBOOK)} className="bg-orange-100 p-5 rounded-3xl flex flex-col items-center justify-center gap-2 hover:bg-orange-200 transition h-32">
                 <BookOpenIcon className="h-8 w-8 text-orange-600" />
                 <span className="font-bold text-orange-800">Notebook</span>
                 <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{notebook.length} words</span>
               </button>
               
               {/* Flashcards */}
               <button onClick={startFlashcards} className="bg-blue-100 p-5 rounded-3xl flex flex-col items-center justify-center gap-2 hover:bg-blue-200 transition h-32">
                 <AcademicCapIcon className="h-8 w-8 text-blue-600" />
                 <span className="font-bold text-blue-800">Flashcards</span>
               </button>

               {/* AI Story - Full Width */}
               <button 
                 onClick={() => { resetStory(); navigateTo(AppView.STORY); }} 
                 className="col-span-2 bg-gradient-to-r from-violet-100 to-fuchsia-100 p-5 rounded-3xl flex flex-row items-center justify-center gap-4 hover:from-violet-200 hover:to-fuchsia-200 transition h-24"
               >
                 <div className="bg-white p-2 rounded-full shadow-sm">
                    <PencilSquareIcon className="h-6 w-6 text-fuchsia-600" />
                 </div>
                 <div className="text-left">
                   <span className="font-bold text-fuchsia-900 block">AI Story Time</span>
                   <span className="text-xs text-fuchsia-700">Practice with a custom story</span>
                 </div>
               </button>
            </div>
          </div>
        )}

        {/* VIEW: RESULT */}
        {view === AppView.RESULT && (
           <>
            {loading ? (
                <div className="h-full flex flex-col items-center justify-center p-10 space-y-4">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-violet-600"></div>
                    <p className="text-violet-600 font-bold animate-pulse">Consulting the linguistic spirits...</p>
                </div>
            ) : currentEntry && (
              <div className="p-4 space-y-6 animate-fade-in-up">
                {/* Main Card */}
                <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col">
                        <h1 className="text-3xl font-extrabold text-violet-900">{currentEntry.translatedTerm}</h1>
                        {currentEntry.term.toLowerCase() !== currentEntry.translatedTerm.toLowerCase() && (
                          <span className="text-sm text-gray-400 font-medium">{currentEntry.term}</span>
                        )}
                    </div>
                    <button 
                      onClick={() => addToNotebook()}
                      className={`p-2 rounded-full transition-colors ${notebook.find(n => n.id === currentEntry.id) ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                    >
                      {notebook.find(n => n.id === currentEntry.id) ? <CheckIcon className="h-6 w-6"/> : <PlusIcon className="h-6 w-6"/>}
                    </button>
                  </div>

                  {/* Image & Definition */}
                  <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="w-full md:w-1/3 shrink-0 flex justify-center">
                        {currentEntry.imageUrl ? (
                          <img src={currentEntry.imageUrl} alt="concept" className="w-32 h-32 md:w-full md:h-auto aspect-square object-cover rounded-2xl bg-gray-100 shadow-sm" />
                        ) : (
                          <div className="w-32 h-32 bg-gray-100 rounded-2xl animate-pulse flex items-center justify-center text-gray-300">
                            <SparklesIcon className="h-8 w-8" />
                          </div>
                        )}
                    </div>
                    <div className="flex-1 flex flex-col justify-center">
                        <p className="text-xl font-bold text-gray-800 leading-snug">{currentEntry.definitionTarget}</p>
                        <p className="text-sm text-gray-500 mt-2">{currentEntry.definitionNative}</p>
                        <button 
                          onClick={(e) => playAudio(currentEntry.translatedTerm, `main-${currentEntry.id}`, e)}
                          className="mt-3 flex items-center gap-2 text-violet-600 font-bold text-sm bg-violet-50 px-3 py-1.5 rounded-full w-fit active:scale-95 transition hover:bg-violet-100"
                        >
                          {audioLoadingId === `main-${currentEntry.id}` ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <SpeakerWaveIcon className="h-4 w-4" />
                          )}
                          Listen
                        </button>
                    </div>
                  </div>

                  {/* Usage Note */}
                  {currentEntry.usageNote && (
                    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-2xl relative mb-6">
                      <div className="absolute -top-3 left-4 bg-orange-200 text-orange-800 text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wide shadow-sm">
                        Tips
                      </div>
                      <p className="text-gray-700 italic text-sm mt-1">"{currentEntry.usageNote}"</p>
                    </div>
                  )}
                  
                  {/* Scenario Dialogue */}
                  {currentEntry.scenario && currentEntry.scenario.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-bold text-gray-400 text-xs uppercase tracking-wider mb-3 flex items-center gap-1">
                        <UserGroupIcon className="h-4 w-4" /> Real Context
                      </h3>
                      <div className="bg-indigo-50 rounded-2xl p-4 space-y-4">
                        {currentEntry.scenario.map((line, idx) => (
                          <div key={idx} className="flex gap-3 items-start group">
                            <div className="font-bold text-indigo-400 text-sm shrink-0 pt-1">{line.speaker}</div>
                            <div className="flex-1">
                              <p 
                                className="text-indigo-900 font-medium text-sm cursor-pointer hover:bg-indigo-100/50 rounded px-1 transition-colors"
                                onDoubleClick={handleTextSelection}
                                title="Double-click to translate word"
                              >
                                {line.text}
                              </p>
                              <p className="text-indigo-400 text-xs px-1">{line.translation}</p>
                            </div>
                            <button 
                              onClick={(e) => playAudio(line.text, `scenario-${idx}-${currentEntry.id}`, e)}
                              className="text-indigo-300 hover:text-indigo-600 p-1"
                            >
                              {audioLoadingId === `scenario-${idx}-${currentEntry.id}` ? (
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                              ) : (
                                <SpeakerWaveIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Examples */}
                  {currentEntry.examples && currentEntry.examples.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-bold text-gray-400 text-xs uppercase tracking-wider">Examples</h3>
                      {currentEntry.examples.map((ex, idx) => (
                        <div key={idx} className="bg-gray-50 p-3 rounded-xl flex justify-between items-start gap-3 hover:bg-gray-100 transition">
                          <div className="flex-1">
                            <p 
                                className="text-gray-900 font-medium mb-1 cursor-pointer hover:bg-gray-200/50 rounded px-1 transition-colors"
                                onDoubleClick={handleTextSelection}
                                title="Double-click to translate word"
                            >
                                {ex.target}
                            </p>
                            <p className="text-gray-500 text-sm px-1">{ex.native}</p>
                          </div>
                          <button 
                              onClick={(e) => playAudio(ex.target, `example-${idx}-${currentEntry.id}`, e)}
                              className="text-gray-400 hover:text-violet-600 p-2 bg-white rounded-full shadow-sm"
                            >
                              {audioLoadingId === `example-${idx}-${currentEntry.id}` ? (
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                              ) : (
                                <SpeakerWaveIcon className="h-4 w-4" />
                              )}
                            </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="h-20"></div> {/* Spacer for FAB */}
              </div>
            )}
           </>
        )}

        {/* VIEW: NOTEBOOK */}
        {view === AppView.NOTEBOOK && (
          <div className="p-4">
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-2xl font-bold text-gray-800">My Notebook</h2>
               <span className="bg-violet-100 text-violet-800 px-3 py-1 rounded-full text-xs font-bold">{notebook.length} words</span>
             </div>
             
             {notebook.length === 0 ? (
               <div className="text-center text-gray-400 mt-20 flex flex-col items-center">
                 <BookOpenIcon className="h-12 w-12 mb-2 opacity-20" />
                 <p>No words saved yet!</p>
               </div>
             ) : (
               <div className="grid gap-4">
                 {notebook.map((entry) => (
                   <div key={entry.id} onClick={() => { setCurrentEntry(entry); navigateTo(AppView.RESULT); }} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex gap-4 cursor-pointer hover:shadow-md transition">
                      {entry.imageUrl && <img src={entry.imageUrl} className="w-16 h-16 rounded-xl object-cover bg-gray-100" />}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{entry.translatedTerm || entry.term}</h3>
                        <p className="text-xs text-gray-400 truncate">{entry.definitionTarget}</p>
                        <p className="text-sm text-gray-500 line-clamp-1 mt-1">{entry.definitionNative}</p>
                      </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* VIEW: STORY */}
        {view === AppView.STORY && (
          <div className="p-6">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <SparklesIcon className="h-6 w-6 text-fuchsia-500" />
              AI Story Time
            </h2>
            
            {/* Case 1: Loading */}
            {isStoryLoading ? (
              <div className="text-center py-20 flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
                <p className="text-gray-500 animate-pulse font-medium">Weaving your words into a story...</p>
              </div>
            ) : story ? (
              // Case 2: Story Result
              <div className="bg-white p-6 rounded-3xl shadow-lg border border-fuchsia-100 animate-fade-in-up">
                <div className="mb-4 flex items-center justify-between">
                   <span className="text-xs font-bold text-fuchsia-600 bg-fuchsia-50 px-2 py-1 rounded-md uppercase">Target Language</span>
                   <div className="flex items-center gap-1 text-xs text-gray-400">
                     <CursorArrowRaysIcon className="h-3 w-3" />
                     Double-click words to translate
                   </div>
                </div>
                <div 
                    className="whitespace-pre-wrap text-lg text-gray-700 leading-relaxed font-medium cursor-pointer" 
                    onDoubleClick={handleTextSelection}
                    dangerouslySetInnerHTML={{ __html: story.replace(/\*\*(.*?)\*\*/g, '<span class="text-fuchsia-600 font-bold bg-fuchsia-50 px-1 rounded mx-1">$1</span>') }}
                ></div>
                
                <div className="mt-8 flex flex-col gap-3">
                   <button onClick={() => playAudio(story.replace(/\*\*/g, ''), "story-main")} className="w-full bg-violet-100 text-violet-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-violet-200">
                      {audioLoadingId === "story-main" ? <ArrowPathIcon className="h-5 w-5 animate-spin"/> : <SpeakerWaveIcon className="h-5 w-5"/>}
                      Listen
                   </button>
                   <button onClick={resetStory} className="w-full bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200">
                     Create New Story
                   </button>
                </div>
              </div>
            ) : (
              // Case 3: Selection Mode
              <div className="animate-fade-in-up">
                <p className="text-gray-600 mb-4">Select up to <span className="font-bold text-fuchsia-600">5 words</span> from your notebook to generate a story.</p>
                
                {notebook.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-2xl">
                    <p className="text-gray-400">Your notebook is empty.</p>
                    <button onClick={() => navigateTo(AppView.SEARCH)} className="mt-4 text-violet-600 font-bold">Go find some words!</button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 mb-6">
                      {notebook.map((entry) => {
                        const isSelected = selectedStoryWordIds.includes(entry.id);
                        return (
                          <div 
                            key={entry.id}
                            onClick={() => toggleStoryWordSelection(entry.id)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                              isSelected 
                                ? 'border-fuchsia-500 bg-fuchsia-50 shadow-sm' 
                                : 'border-gray-100 bg-white hover:border-fuchsia-200'
                            }`}
                          >
                             <div className="flex items-center gap-3">
                               {entry.imageUrl && <img src={entry.imageUrl} className="w-10 h-10 rounded-lg object-cover bg-gray-100" />}
                               <div>
                                 <h4 className={`font-bold ${isSelected ? 'text-fuchsia-900' : 'text-gray-700'}`}>{entry.translatedTerm}</h4>
                                 <p className="text-xs text-gray-400">{entry.definitionTarget}</p>
                               </div>
                             </div>
                             {isSelected ? (
                               <CheckCircleIcon className="h-6 w-6 text-fuchsia-600" />
                             ) : (
                               <div className="h-6 w-6 rounded-full border-2 border-gray-200"></div>
                             )}
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="sticky bottom-4 z-10">
                      <button 
                        onClick={handleGenerateSelectedStory}
                        disabled={selectedStoryWordIds.length === 0}
                        className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:shadow-none transition-all flex justify-center items-center gap-2"
                      >
                         <SparklesIcon className="h-5 w-5" />
                         Generate Story ({selectedStoryWordIds.length})
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* VIEW: FLASHCARDS */}
        {view === AppView.FLASHCARDS && notebook.length > 0 && (
          <div className="flex flex-col items-center justify-center h-[85vh] p-6 perspective-1000">
             <div className="w-full max-w-sm aspect-[3/4] cursor-pointer group" onClick={() => setIsFlipped(!isFlipped)}>
                <div className={`flip-card w-full h-full ${isFlipped ? 'flipped' : ''}`}>
                   <div className="flip-card-inner relative w-full h-full shadow-2xl rounded-3xl transition-transform duration-500">
                      
                      {/* FRONT */}
                      <div className="flip-card-front bg-white rounded-3xl p-8 flex flex-col items-center justify-between border-4 border-violet-100">
                        <div className="w-full text-right text-sm text-gray-400 font-bold tracking-wider">TARGET</div>
                        <div className="flex-1 flex flex-col items-center justify-center gap-6">
                           {notebook[flashcardIndex].imageUrl && (
                             <img src={notebook[flashcardIndex].imageUrl} className="w-40 h-40 object-cover rounded-full border-4 border-violet-50 shadow-inner" />
                           )}
                           <h2 className="text-4xl font-extrabold text-violet-900 text-center">{notebook[flashcardIndex].translatedTerm || notebook[flashcardIndex].term}</h2>
                           
                           <button 
                             onClick={(e) => playAudio(notebook[flashcardIndex].translatedTerm, `flash-${flashcardIndex}`, e)}
                             className="p-3 bg-violet-50 text-violet-600 rounded-full hover:bg-violet-100"
                           >
                              {audioLoadingId === `flash-${flashcardIndex}` ? <ArrowPathIcon className="h-6 w-6 animate-spin" /> : <SpeakerWaveIcon className="h-6 w-6" />}
                           </button>
                        </div>
                        <div className="text-gray-400 text-sm animate-bounce">Tap to flip</div>
                      </div>

                      {/* BACK */}
                      <div className="flip-card-back bg-violet-600 text-white rounded-3xl p-8 flex flex-col items-center justify-center border-4 border-violet-700">
                         <div className="w-full text-right text-sm text-violet-200 mb-4 font-bold tracking-wider">NATIVE</div>
                         <h3 className="text-2xl font-bold text-center mb-4 leading-tight">{notebook[flashcardIndex].definitionTarget}</h3>
                         <p className="text-base text-center text-violet-200 mb-8">{notebook[flashcardIndex].definitionNative}</p>
                         
                         {notebook[flashcardIndex].examples && notebook[flashcardIndex].examples.length > 0 && (
                           <div className="bg-white/10 p-4 rounded-xl w-full backdrop-blur-sm">
                             <p className="italic text-center text-sm font-medium">"{notebook[flashcardIndex].examples[0].target}"</p>
                             <p className="text-center text-xs text-violet-200 mt-2">{notebook[flashcardIndex].examples[0].native}</p>
                           </div>
                         )}
                      </div>

                   </div>
                </div>
             </div>

             {/* Controls */}
             <div className="flex gap-6 mt-8 items-center">
               <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setFlashcardIndex((i) => i > 0 ? i - 1 : notebook.length - 1);
                  setIsFlipped(false);
                }}
                className="p-4 bg-white rounded-full shadow-lg text-gray-600 hover:bg-gray-50 active:scale-95 transition"
               >
                 <ChevronLeftIcon className="h-6 w-6" />
               </button>
               <span className="font-bold text-gray-500 bg-white px-4 py-2 rounded-full shadow-sm">{flashcardIndex + 1} / {notebook.length}</span>
               <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setFlashcardIndex((i) => i < notebook.length - 1 ? i + 1 : 0);
                  setIsFlipped(false);
                }}
                className="p-4 bg-white rounded-full shadow-lg text-gray-600 hover:bg-gray-50 active:scale-95 transition"
               >
                 <ChevronLeftIcon className="h-6 w-6 rotate-180" />
               </button>
             </div>
          </div>
        )}

      </div>

      {/* Floating Chat Interface (Only on Result View) */}
      {view === AppView.RESULT && !loading && currentEntry && (
        <>
          {!isChatOpen ? (
            <button 
              onClick={() => setIsChatOpen(true)}
              className="absolute bottom-6 right-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition z-50 animate-bounce-subtle"
            >
              <ChatBubbleLeftRightIcon className="h-8 w-8" />
            </button>
          ) : (
            <div className="absolute bottom-0 left-0 w-full bg-white rounded-t-3xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] z-50 border-t border-gray-100 flex flex-col h-[60vh] animate-slide-up">
              <div className="p-4 flex justify-between items-center border-b border-gray-100 bg-gray-50 rounded-t-3xl">
                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                  <span className="bg-violet-600 text-white text-xs px-2 py-0.5 rounded">AI</span>
                  Chat Tutor
                </h3>
                <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold text-xl px-2">&times;</button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 {chatHistory.length === 0 && (
                   <div className="text-center text-gray-400 text-sm mt-10">
                     Ask anything about "{currentEntry.translatedTerm}"! <br/>
                     Example: "Is this formal?" or "How do I pronounce it?"
                   </div>
                 )}
                 {chatHistory.map((msg) => (
                   <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-violet-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                       {msg.text}
                     </div>
                   </div>
                 ))}
              </div>

              <div className="p-4 border-t border-gray-100 flex gap-2 bg-white pb-6">
                <input 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                  placeholder="Ask a question..."
                  className="flex-1 bg-gray-100 rounded-full px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                />
                <button onClick={handleChatSend} className="bg-violet-600 text-white p-3 rounded-full hover:bg-violet-700 active:scale-95 transition">
                  <ArrowPathIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
};

export default App;