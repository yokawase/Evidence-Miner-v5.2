import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { WorkflowState, MeSHTerm, PubMedArticle, DetailedAnalysis } from './types';
import { extractMeSHTerms, translateTitlesToJapanese, analyzeArticleDeeply, generateFinalReview, analyzeMedicalText } from './services/geminiService';
import { searchPubMedWithMeSH, getPubMedHitCount } from './services/pubmedService';
import { ActivityIcon, SearchIcon, BrainCircuitIcon, LoaderIcon, AlertCircleIcon, FileTextIcon, ExternalLinkIcon } from './components/Icons';
import { downloadTextFile, generateUniqueFilename } from './utils';

// --- Helper: Smooth Scroll ---
const scrollToRef = (ref: React.RefObject<HTMLDivElement | null>) => {
  if (ref.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

// --- Source Code for Export ---
const getSourceCode = () => `
[Evidence Miner - Source Code Export]
Includes: App.tsx, services/geminiService.ts, services/pubmedService.ts, types.ts, utils.ts
(This is a generated placeholder. In a real environment, this would bundle the actual source files.)
`;

const App: React.FC = () => {
  const [apiKeyMissing] = useState(!process.env.API_KEY);
  
  // Section Refs for Scrolling
  const inputRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

  // --- Main State ---
  const [state, setState] = useState<WorkflowState>({
    inputText: "",
    meshTerms: [],
    hitCount: null,
    isCounting: false,
    searchResults: [],
    selectedArticleIds: new Set(),
    detailedAnalyses: [],
    finalReview: null,
    isLoading: false,
    loadingMessage: "",
    error: null,
    simpleAnalysisResult: null
  });

  // --- Effect: Live Hit Count Update ---
  useEffect(() => {
    // Only count if we have terms
    if (state.meshTerms.length > 0) {
      const timer = setTimeout(async () => {
        setState(prev => ({ ...prev, isCounting: true }));
        try {
          const count = await getPubMedHitCount(state.meshTerms);
          setState(prev => ({ ...prev, hitCount: count, isCounting: false }));
        } catch (error) {
           console.error("Count failed", error);
           setState(prev => ({ ...prev, isCounting: false, hitCount: 0 }));
        }
      }, 500); // 500ms debounce
      return () => clearTimeout(timer);
    } else {
      setState(prev => ({ ...prev, hitCount: null }));
    }
  }, [state.meshTerms]);

  // --- Handlers ---

  const handleReset = () => {
    if (window.confirm("Reset all progress and start over?")) {
      setState({
        inputText: "",
        meshTerms: [],
        hitCount: null,
        isCounting: false,
        searchResults: [],
        selectedArticleIds: new Set(),
        detailedAnalyses: [],
        finalReview: null,
        isLoading: false,
        loadingMessage: "",
        error: null,
        simpleAnalysisResult: null
      });
      setTimeout(() => scrollToRef(inputRef), 100);
    }
  };

  // Step 1: Input -> MeSH
  const handleExtractMeSH = async () => {
    if (!state.inputText.trim()) return;
    setState(prev => ({ ...prev, isLoading: true, loadingMessage: "Analyzing text & extracting MeSH terms...", error: null, simpleAnalysisResult: null }));
    try {
      const terms = await extractMeSHTerms(state.inputText);
      setState(prev => ({ 
        ...prev, 
        meshTerms: terms, 
        isLoading: false 
      }));
      setTimeout(() => scrollToRef(meshRef), 100);
    } catch (e: any) {
      setState(prev => ({ ...prev, isLoading: false, error: e.message }));
    }
  };

  // Step 1 Alternative: Direct Analysis (No PubMed)
  const handleDirectAnalysis = async () => {
    if (!state.inputText.trim()) return;
    setState(prev => ({ ...prev, isLoading: true, loadingMessage: "Analyzing text directly with Gemini...", error: null, meshTerms: [], searchResults: [] }));
    try {
      const result = await analyzeMedicalText(state.inputText);
      setState(prev => ({ ...prev, simpleAnalysisResult: result, isLoading: false }));
      setTimeout(() => scrollToRef(analysisRef), 100);
    } catch (e: any) {
      setState(prev => ({ ...prev, isLoading: false, error: e.message }));
    }
  };

  // Step 2: MeSH Selection
  const toggleMeSHTerm = (index: number) => {
    const newTerms = [...state.meshTerms];
    newTerms[index].selected = !newTerms[index].selected;
    setState(prev => ({ ...prev, meshTerms: newTerms }));
  };

  // Step 2 -> Step 3: Search PubMed
  const handleSearch = async () => {
    // Double check count just in case, though button should be disabled
    if (state.hitCount === 0) return;

    setState(prev => ({ ...prev, isLoading: true, loadingMessage: "Retrieving articles from PubMed...", error: null }));
    try {
      const { articles, count } = await searchPubMedWithMeSH(state.meshTerms);
      
      setState(prev => ({ ...prev, loadingMessage: `Found ${count} articles. Translating titles...` }));
      const titles = articles.map(a => a.title);
      const translatedTitles = await translateTitlesToJapanese(titles);
      
      const articlesWithJapanese = articles.map((a, i) => ({
        ...a,
        translatedTitle: translatedTitles[i] || a.title
      }));

      setState(prev => ({ 
        ...prev, 
        searchResults: articlesWithJapanese, 
        isLoading: false 
      }));
      setTimeout(() => scrollToRef(resultsRef), 100);
    } catch (e: any) {
      setState(prev => ({ ...prev, isLoading: false, error: e.message }));
    }
  };

  // Step 3: Selection
  const toggleArticleSelection = (uid: string) => {
    const newSet = new Set(state.selectedArticleIds);
    if (newSet.has(uid)) newSet.delete(uid);
    else newSet.add(uid);
    setState(prev => ({ ...prev, selectedArticleIds: newSet }));
  };

  // Step 3 -> Step 4: Analysis
  const handleAnalyzeSelected = async () => {
    const selectedArticles = state.searchResults.filter(a => state.selectedArticleIds.has(a.uid));
    if (selectedArticles.length === 0) return;

    setState(prev => ({ ...prev, isLoading: true, loadingMessage: "Initializing analysis...", error: null }));

    try {
      const analyses: DetailedAnalysis[] = [];
      
      for (let i = 0; i < selectedArticles.length; i++) {
        const article = selectedArticles[i];
        setState(prev => ({ ...prev, loadingMessage: `Analyzing paper ${i + 1}/${selectedArticles.length}: ${article.uid}...` }));
        const analysisText = await analyzeArticleDeeply(article, state.inputText);
        analyses.push({ pmid: article.uid, originalArticle: article, analysis: analysisText });
      }

      setState(prev => ({ ...prev, loadingMessage: "Synthesizing Final Review..." }));
      const review = await generateFinalReview(analyses.map(a => a.analysis));

      setState(prev => ({ 
        ...prev, 
        detailedAnalyses: analyses, 
        finalReview: review,
        isLoading: false 
      }));
      setTimeout(() => scrollToRef(analysisRef), 100);
    } catch (e: any) {
      setState(prev => ({ ...prev, isLoading: false, error: e.message }));
    }
  };

  const handleDownload = () => {
    let content = `# Evidence Miner Report\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Query Context: ${state.inputText}\n\n`;
    
    if (state.simpleAnalysisResult) {
      content += `### Direct Text Analysis\n${state.simpleAnalysisResult}\n`;
    } else {
      content += state.finalReview + "\n\n";
      content += `## Individual Papers Analysis\n\n`;
      state.detailedAnalyses.forEach(da => {
        content += `### ${da.originalArticle.title}\n`;
        content += `Source: ${da.originalArticle.url}\n`;
        if (da.originalArticle.references) {
            content += `References Cited: ${da.originalArticle.references.length}\n`;
        }
        content += `\n${da.analysis}\n\n`;
      });
    }

    const filename = generateUniqueFilename("EvidenceMiner");
    downloadTextFile(filename, content);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-medical-100 selection:text-medical-900 pb-20">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-medical-600 rounded-lg flex items-center justify-center text-white">
              <ActivityIcon className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-slate-800 tracking-tight">Evidence Miner <span className="text-medical-600">v5.2</span></span>
          </div>
          <div className="flex gap-3">
             {apiKeyMissing && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">Demo Mode</span>}
             <button onClick={handleReset} className="text-sm text-slate-500 hover:text-red-600 font-medium">Reset All</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Error Banner */}
        {state.error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-100 flex items-center gap-2 sticky top-20 z-30 shadow-md animate-bounce">
            <AlertCircleIcon className="w-5 h-5" />
            <span>{state.error}</span>
            <button onClick={() => setState(s => ({...s, error: null}))} className="ml-auto text-sm underline">Dismiss</button>
          </div>
        )}

        {/* Loading Overlay */}
        {state.isLoading && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
            <LoaderIcon className="w-12 h-12 text-medical-600 animate-spin mb-4" />
            <p className="text-xl font-medium text-medical-800 animate-pulse">{state.loadingMessage}</p>
          </div>
        )}

        {/* SECTION 1: INPUT */}
        <section ref={inputRef} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24">
          <div className="flex items-center gap-3 mb-4">
             <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">1</div>
             <h2 className="text-xl font-bold text-slate-800">Define Research Topic</h2>
          </div>
          <p className="text-slate-500 mb-4 pl-11">Paste an abstract, clinical question, or notes. (Japanese or English)</p>
          <div className="pl-11">
            <textarea
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-medical-500 outline-none resize-none h-40 font-mono text-sm"
              placeholder="e.g. Immunotherapy efficacy in non-small cell lung cancer patients with autoimmune disease..."
              value={state.inputText}
              onChange={(e) => setState(prev => ({ ...prev, inputText: e.target.value }))}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleExtractMeSH}
                disabled={state.isLoading || !state.inputText}
                className="bg-medical-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-medical-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-medical-500/20"
              >
                <BrainCircuitIcon className="w-4 h-4" />
                Step 2: Extract MeSH & Search
              </button>
              <button
                onClick={handleDirectAnalysis}
                disabled={state.isLoading || !state.inputText}
                className="bg-white text-slate-700 border border-slate-300 px-6 py-3 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
              >
                <FileTextIcon className="w-4 h-4" />
                Analyze Text Only
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 2: MeSH STRATEGY (Visible if terms exist) */}
        {state.meshTerms.length > 0 && (
          <section ref={meshRef} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">2</div>
               <h2 className="text-xl font-bold text-slate-800">Refine Search Strategy</h2>
             </div>
             <p className="text-slate-500 mb-6 pl-11">Select MeSH terms to filter PubMed (Last 10 Years).</p>
             
             <div className="pl-11 grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">MeSH Keywords</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {state.meshTerms.map((item, idx) => (
                      <label key={idx} className="flex items-center gap-3 p-2 hover:bg-white rounded cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={item.selected} 
                          onChange={() => toggleMeSHTerm(idx)}
                          className="w-5 h-5 text-medical-600 rounded focus:ring-medical-500 border-slate-300"
                        />
                        <span className={`text-sm ${item.selected ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{item.term}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col justify-center items-center bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
                   <h3 className="text-blue-800 font-semibold mb-2">Estimated PubMed Results</h3>
                   {state.isCounting ? (
                     <LoaderIcon className="w-8 h-8 text-blue-400 animate-spin" />
                   ) : (
                     <div className={`text-4xl font-bold mb-2 ${state.hitCount === 0 ? 'text-red-500' : 'text-blue-600'}`}>
                       {state.hitCount !== null ? state.hitCount.toLocaleString() : '-'}
                     </div>
                   )}
                   <p className="text-xs text-blue-600/70 mb-4">
                     {state.hitCount === 0 
                        ? "Too specific (0 hits). Uncheck some terms." 
                        : state.hitCount && state.hitCount > 100 
                          ? "Broad search. Consider adding more terms." 
                          : "Good range for analysis."}
                   </p>
                   <button
                    onClick={handleSearch}
                    disabled={state.isLoading || !state.hitCount || state.hitCount === 0}
                    className="w-full bg-medical-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-medical-700 disabled:opacity-50 disabled:bg-slate-300 flex items-center justify-center gap-2 transition-all"
                  >
                    <SearchIcon className="w-4 h-4" />
                    Get Articles
                  </button>
                </div>
             </div>
          </section>
        )}

        {/* SECTION 3: RESULTS (Visible if results exist) */}
        {state.searchResults.length > 0 && (
          <section ref={resultsRef} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">3</div>
                  <h2 className="text-xl font-bold text-slate-800">Select Evidence</h2>
                </div>
                <button
                  onClick={handleAnalyzeSelected}
                  disabled={state.selectedArticleIds.size === 0}
                  className="bg-medical-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-medical-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-medical-500/20"
                >
                  Analyze {state.selectedArticleIds.size} Papers
                  <BrainCircuitIcon className="w-4 h-4" />
                </button>
             </div>
             
             <div className="pl-11 space-y-4">
                {state.searchResults.map((article) => (
                   <div key={article.uid} className={`relative border rounded-xl p-5 transition-all cursor-pointer ${state.selectedArticleIds.has(article.uid) ? 'border-medical-500 bg-medical-50 ring-1 ring-medical-500' : 'border-slate-200 hover:border-medical-300 hover:shadow-sm'}`}
                        onClick={() => toggleArticleSelection(article.uid)}>
                     <div className="flex gap-4">
                       <div className="pt-1">
                         <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${state.selectedArticleIds.has(article.uid) ? 'bg-medical-600 border-medical-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {state.selectedArticleIds.has(article.uid) && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                         </div>
                       </div>
                       <div className="flex-1">
                         <h3 className="font-bold text-lg text-slate-900 mb-1 leading-snug">
                            {article.translatedTitle} 
                         </h3>
                         <div className="text-sm text-slate-500 font-normal mb-2">{article.title}</div>
                         <div className="flex items-center gap-3 text-sm text-slate-600">
                           <span className="font-medium text-slate-800">{article.journal}</span>
                           <span>•</span>
                           <span>{article.pubDate}</span>
                           <span>•</span>
                           <span className="italic">{article.authors[0]} et al.</span>
                         </div>
                         <div className="mt-3 flex justify-end">
                            <a href={article.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-medical-600 flex items-center gap-1 hover:underline bg-white px-2 py-1 rounded border border-medical-100">
                              View on PubMed <ExternalLinkIcon className="w-3 h-3"/>
                            </a>
                         </div>
                       </div>
                     </div>
                   </div>
                ))}
             </div>
          </section>
        )}

        {/* SECTION 4: ANALYSIS OUTPUT (Visible if analysis exists) */}
        {(state.finalReview || state.simpleAnalysisResult) && (
           <section ref={analysisRef} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100">
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">✓</div>
                   <h2 className="text-xl font-bold text-slate-800">Final Report</h2>
                 </div>
                 <div className="flex gap-3">
                    <button onClick={() => downloadTextFile(generateUniqueFilename("SourceCode"), getSourceCode())} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-2">
                       Dev: Download Source
                    </button>
                    <button onClick={handleDownload} className="bg-medical-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-medical-700 flex items-center gap-2 shadow-lg shadow-medical-500/20">
                      <FileTextIcon className="w-4 h-4" />
                      Download Report (.txt)
                    </button>
                 </div>
              </div>

              <div className="pl-11 markdown-body">
                 {state.simpleAnalysisResult && (
                    <div className="mb-8 p-6 bg-slate-50 rounded-xl border border-slate-200">
                       <ReactMarkdown>{state.simpleAnalysisResult}</ReactMarkdown>
                    </div>
                 )}

                 {state.finalReview && (
                    <>
                      <div className="mb-10">
                         <ReactMarkdown>{state.finalReview}</ReactMarkdown>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-6 pb-2 border-b border-slate-200">Analyzed Literature</h3>
                      <div className="space-y-8">
                        {state.detailedAnalyses.map((da) => (
                          <div key={da.pmid} className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                             <div className="mb-4">
                               <h4 className="font-bold text-lg text-slate-900">{da.originalArticle.translatedTitle}</h4>
                               <div className="text-sm text-slate-500 mt-1">{da.originalArticle.title}</div>
                             </div>
                             <ReactMarkdown>{da.analysis}</ReactMarkdown>
                          </div>
                        ))}
                      </div>
                    </>
                 )}
              </div>
           </section>
        )}

      </main>
    </div>
  );
};

export default App;