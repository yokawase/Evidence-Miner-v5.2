/**
 * Evidence Miner Core Logic - Utilities
 */

// [Security] Input Sanitization
export const sanitizeInput = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, '') 
    .replace(/[<>"'&]/g, (c) => {
      const map: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '&': '&amp;'
      };
      return map[c] || c;
    })
    .trim();
};

export const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  } catch (e) {
    return dateString;
  }
};

/**
 * Downloads content as a text file with BOM for Excel/Windows compatibility (Mojibake Fix).
 */
export const downloadTextFile = (filename: string, content: string) => {
  // Add Byte Order Mark (BOM) for UTF-8 to prevent Mojibake in Excel/Notepad on Windows
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, content], { type: 'text/plain;charset=utf-8' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const generateUniqueFilename = (prefix: string): string => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const uniqueId = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${timestamp}_${uniqueId}.txt`;
};
