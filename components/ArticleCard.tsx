import React, { useState } from 'react';
import { PubMedArticle } from '../types';
import { ExternalLinkIcon } from './Icons';
import ReactMarkdown from 'react-markdown';

interface Props {
  article: PubMedArticle;
  compact?: boolean;
}

const ArticleCard: React.FC<Props> = ({ article, compact = false }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 leading-tight">
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:text-medical-600 transition-colors">
              {article.title}
            </a>
          </h3>
          <div className="text-sm text-slate-500 mt-1">
            <span className="font-medium text-slate-700">{article.journal}</span> • {article.pubDate}
          </div>
          <div className="text-sm text-slate-500 italic mt-0.5">
            {article.authors.join(", ")}
          </div>
        </div>
        <a 
          href={article.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-medical-600 p-1"
        >
          <ExternalLinkIcon className="w-5 h-5" />
        </a>
      </div>

      {!compact && article.abstract && (
        <div className="mt-3">
          <div className={`text-sm text-slate-600 overflow-hidden relative ${expanded ? '' : 'max-h-24'}`}>
             <ReactMarkdown>{article.abstract}</ReactMarkdown>
             {!expanded && (
               <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent" />
             )}
          </div>
          <button 
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-medical-600 hover:text-medical-800 mt-2 focus:outline-none"
          >
            {expanded ? "Show Less" : "Read Abstract"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ArticleCard;
