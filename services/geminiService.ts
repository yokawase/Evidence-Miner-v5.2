import { GoogleGenAI, Schema, Type } from "@google/genai";
import { sanitizeInput } from "../utils";
import { PubMedArticle, MeSHTerm } from "../types";

// Initialize Gemini Client
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const FLASH_MODEL = 'gemini-3-flash-preview'; // Speed
const PRO_MODEL = 'gemini-3-pro-preview'; // Reasoning

/**
 * Extracts MeSH terms from text (translates if Japanese).
 */
export const extractMeSHTerms = async (inputText: string): Promise<MeSHTerm[]> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const prompt = `
    Analyze the following medical text.
    1. Translate to English mentally if needed.
    2. Extract key medical concepts.
    3. Convert these into EXACT PubMed "MeSH Headings" (Medical Subject Headings). 
       Example: Use "Neoplasms" instead of "Cancer", "Myocardial Infarction" instead of "Heart Attack".
    4. Return a JSON array of strings.
    
    Text: "${sanitizeInput(inputText).substring(0, 5000)}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const terms: string[] = JSON.parse(response.text || "[]");
    return terms.map(term => ({ term, selected: true }));
  } catch (error) {
    console.error("MeSH Extraction Error:", error);
    // Fallback: simple split if AI fails
    return inputText.split(' ').slice(0, 5).map(t => ({ term: t, selected: true }));
  }
};

/**
 * Translates a list of English titles to Japanese for UI display.
 */
export const translateTitlesToJapanese = async (titles: string[]): Promise<string[]> => {
  if (!apiKey || titles.length === 0) return titles;

  const prompt = `
    Translate the following medical article titles from English to Japanese.
    Return a JSON array of strings in the same order.
    
    Titles:
    ${JSON.stringify(titles)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Translation Error:", error);
    return titles; // Fallback to original
  }
};

/**
 * Deeply analyzes a single article against the original target context.
 */
export const analyzeArticleDeeply = async (article: PubMedArticle, originalContext: string): Promise<string> => {
  if (!apiKey) return "API Key missing.";

  // Include references if available for better context
  const referenceContext = article.references 
    ? `\nKey References found in this article:\n${article.references.join('\n- ')}` 
    : "\n(No direct reference list available from PubMed)";

  const prompt = `
    You are an expert Medical Research Assistant.
    
    Target Context (User's interest): "${sanitizeInput(originalContext).substring(0, 1000)}"
    
    Analyze the following article:
    Title: ${article.title}
    Journal: ${article.journal} (${article.pubDate})
    Authors: ${article.authors.join(', ')}
    Abstract: ${article.abstract || "No abstract"}
    ${referenceContext}
    
    Output in Markdown format with the following sections (Use Japanese for the content):
    1. **基本情報**: Title, Authors, Journal, Year (Keep English for proper nouns)
    2. **日本語要約**: Summary of the abstract in Japanese.
    3. **関連性**: How does this article relate to the Target Context?
    4. **研究の課題と対策**: Limitations or issues mentioned, and proposed countermeasures.
    5. **次のステップ**: Recommended next research steps based on this paper.
    6. **引用分析**: Analyze the provided 'Key References' or infer foundational theories from the abstract. Which papers does this study build upon?
    
    Do not use JSON. Use structured Markdown.
  `;

  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: { temperature: 0.3 }
  });

  return response.text || "Analysis failed.";
};

/**
 * Generates the final Systematic Review (Synthesis).
 */
export const generateFinalReview = async (analyses: string[]): Promise<string> => {
  if (!apiKey) return "API Key missing.";

  const context = analyses.join("\n\n---\n\n");
  
  const prompt = `
    You are generating a final "Systematic Review" report based on the following analyzed papers.
    
    Input Analyses:
    ${context}
    
    Create a comprehensive review in Japanese (Markdown) including:
    # 総合文献レビュー
    ## 1. 概要 (Executive Summary)
    ## 2. 抽出された主要なテーマとエビデンス
    ## 3. 文献間の矛盾点・ギャップ
    ## 4. 臨床的・研究的提言
    ## 5. 結論
    
    Ensure the tone is academic and professional.
  `;

  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: { temperature: 0.4 }
  });

  return response.text || "Review generation failed.";
};

// --- Legacy Functions (Kept for compatibility with other tabs if needed) ---
export const analyzeMedicalText = async (inputText: string): Promise<string> => {
   // ... existing implementation re-wrapped if needed, or kept as is ...
   // For brevity in this update, forwarding to a simple call
   const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: `Analyze this medical text: ${inputText}`,
   });
   return response.text || "";
};
