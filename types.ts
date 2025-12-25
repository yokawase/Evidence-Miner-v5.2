export interface PubMedArticle {
  uid: string;
  title: string;
  translatedTitle?: string; // For Japanese display
  authors: string[];
  journal: string;
  pubDate: string;
  abstract?: string;
  doi?: string;
  url: string;
  references?: string[]; // Added for citation analysis
}

export interface MeSHTerm {
  term: string;
  selected: boolean;
}

export interface DetailedAnalysis {
  pmid: string;
  originalArticle: PubMedArticle;
  analysis: string; // Markdown content
}

export interface WorkflowState {
  // Input Section
  inputText: string;
  
  // MeSH Section
  meshTerms: MeSHTerm[];
  hitCount: number | null;
  isCounting: boolean;
  
  // Search Results Section
  searchResults: PubMedArticle[];
  selectedArticleIds: Set<string>;
  
  // Analysis Section
  detailedAnalyses: DetailedAnalysis[];
  finalReview: string | null;
  
  // Global Loading/Error
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  
  // Simple Analysis Mode Result
  simpleAnalysisResult: string | null;
}