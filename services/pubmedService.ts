import { PubMedArticle, MeSHTerm } from "../types";

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

/**
 * Constructs the PubMed query string based on selected MeSH terms and 10-year filter.
 */
const constructQuery = (terms: MeSHTerm[]): string => {
  const selectedTerms = terms.filter(t => t.selected);
  if (selectedTerms.length === 0) return "";

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 10;
  
  // Robust Strategy: 
  // 1. Use "MeSH Terms" (includes minor topics) instead of "MeSH Major Topic".
  // 2. Fallback to "Title/Abstract" to handle cases where Gemini generates a term that isn't 
  //    an exact MeSH Heading (e.g. "Lung Cancer" vs "Lung Neoplasms") or for very recent unindexed papers.
  const meshQuery = selectedTerms
    .map(t => `("${t.term}"[MeSH Terms] OR "${t.term}"[Title/Abstract])`)
    .join(" AND ");

  const dateQuery = `"${startYear}/01/01"[Date - Publication] : "3000"[Date - Publication]`;
  return `(${meshQuery}) AND (${dateQuery})`;
};

/**
 * Gets the number of hits for the current selection without fetching full details.
 */
export const getPubMedHitCount = async (terms: MeSHTerm[]): Promise<number> => {
  const fullQuery = constructQuery(terms);
  if (!fullQuery) return 0;

  const params = new URLSearchParams({
    db: "pubmed",
    term: fullQuery,
    retmode: "json",
    retmax: "0", // Only need count
    sort: "relevance"
  });

  try {
    const response = await fetch(`${BASE_URL}/esearch.fcgi?${params.toString()}`);
    if (!response.ok) throw new Error("PubMed Count Failed");
    
    const data = await response.json();
    return parseInt(data.esearchresult?.count || "0");
  } catch (error) {
    console.warn("PubMed Count Error:", error);
    return 0;
  }
};

/**
 * Searches PubMed using MeSH terms with "Last 10 Years" filter.
 */
export const searchPubMedWithMeSH = async (terms: MeSHTerm[]): Promise<{ articles: PubMedArticle[], count: number }> => {
  const fullQuery = constructQuery(terms);
  if (!fullQuery) throw new Error("No MeSH terms selected.");

  const params = new URLSearchParams({
    db: "pubmed",
    term: fullQuery,
    retmode: "json",
    retmax: "30", // Limit to top 30
    sort: "relevance"
  });

  // 1. ESearch
  const searchResp = await fetch(`${BASE_URL}/esearch.fcgi?${params.toString()}`);
  if (!searchResp.ok) throw new Error("PubMed Search Failed");
  
  const searchData = await searchResp.json();
  const idList: string[] = searchData.esearchresult?.idlist || [];
  const count = parseInt(searchData.esearchresult?.count || "0");

  if (idList.length === 0) return { articles: [], count: 0 };

  // 2. EFetch (Details)
  const articles = await fetchArticleDetails(idList);
  return { articles, count };
};

const fetchArticleDetails = async (ids: string[]): Promise<PubMedArticle[]> => {
  if (ids.length === 0) return [];
  
  const params = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "xml"
  });

  const response = await fetch(`${BASE_URL}/efetch.fcgi?${params.toString()}`);
  if (!response.ok) throw new Error("PubMed Fetch Failed");

  const text = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  
  const articles: PubMedArticle[] = [];
  const articleNodes = xmlDoc.getElementsByTagName("PubmedArticle");

  for (let i = 0; i < articleNodes.length; i++) {
    const node = articleNodes[i];
    
    const uid = node.getElementsByTagName("PMID")[0]?.textContent || "";
    const title = node.getElementsByTagName("ArticleTitle")[0]?.textContent || "Untitled";
    
    // Abstract extraction
    const abstractTexts = node.getElementsByTagName("AbstractText");
    let abstract = "";
    for (let j = 0; j < abstractTexts.length; j++) {
       const label = abstractTexts[j].getAttribute("Label");
       const val = abstractTexts[j].textContent;
       if (label) abstract += `**${label}**: ${val}\n`;
       else abstract += `${val}\n`;
    }

    const journal = node.getElementsByTagName("Title")[0]?.textContent || ""; 
    const pubDateNode = node.getElementsByTagName("PubDate")[0];
    const year = pubDateNode?.getElementsByTagName("Year")[0]?.textContent || "";
    const month = pubDateNode?.getElementsByTagName("Month")[0]?.textContent || "";
    const pubDate = `${year} ${month}`.trim();

    // Authors
    const authorList = node.getElementsByTagName("AuthorList")[0];
    const authors: string[] = [];
    if (authorList) {
      const authorNodes = authorList.getElementsByTagName("Author");
      for (let k = 0; k < Math.min(authorNodes.length, 5); k++) { 
        const lastName = authorNodes[k].getElementsByTagName("LastName")[0]?.textContent || "";
        const initials = authorNodes[k].getElementsByTagName("Initials")[0]?.textContent || "";
        authors.push(`${lastName} ${initials}`);
      }
      if (authorNodes.length > 5) authors.push("et al.");
    }

    // References / Citations
    const references: string[] = [];
    const referenceList = node.getElementsByTagName("ReferenceList")[0];
    if (referenceList) {
      const refNodes = referenceList.getElementsByTagName("Reference");
      for (let r = 0; r < Math.min(refNodes.length, 10); r++) { 
         const citation = refNodes[r].getElementsByTagName("Citation")[0]?.textContent;
         if (citation) references.push(citation);
      }
    }

    articles.push({
      uid,
      title,
      abstract: abstract.trim(),
      journal,
      pubDate,
      authors,
      url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
      references: references.length > 0 ? references : undefined
    });
  }

  return articles;
};

// Legacy support
export const searchPubMed = async (query: string): Promise<PubMedArticle[]> => {
    const idsParams = new URLSearchParams({
        db: "pubmed",
        term: query,
        retmode: "json",
        retmax: "10",
        sort: "relevance"
    });
    const res = await fetch(`${BASE_URL}/esearch.fcgi?${idsParams.toString()}`);
    const data = await res.json();
    const ids = data.esearchresult?.idlist || [];
    return fetchArticleDetails(ids);
};
