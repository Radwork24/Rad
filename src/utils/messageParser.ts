export interface AttachedDocInfo {
  fileName: string;
  fileType: string;
  pageNum?: number;
}

export interface ParsedUserMessage {
  cleanText: string;
  attachedDocs: AttachedDocInfo[];
}

/**
 * Parses user message content to separate extracted document text from
 * the user's actual prompt/question, allowing the query box to display
 * only the user's question and clean document badge(s).
 */
export function parseUserMessage(content: string): ParsedUserMessage {
  if (!content) return { cleanText: '', attachedDocs: [] };

  const attachedDocs: AttachedDocInfo[] = [];
  let remaining = content;

  // 1. Match all `--- BEGIN DOCUMENT CONTENT: "<fileName>" (<fileType>) --- ... --- END DOCUMENT CONTENT ---`
  const docContentRegex = /--- BEGIN DOCUMENT CONTENT: "([^"]+)" \(([^)]+)\) ---[\s\S]*?--- END DOCUMENT CONTENT ---/g;
  let docMatch: RegExpExecArray | null;
  while ((docMatch = docContentRegex.exec(content)) !== null) {
    const fileName = docMatch[1].trim();
    const fileType = docMatch[2].toUpperCase().trim();
    if (!attachedDocs.some((d) => d.fileName === fileName)) {
      attachedDocs.push({ fileName, fileType });
    }
  }
  remaining = remaining.replace(docContentRegex, '').trim();

  // 2. Match `[Text from "<fileName>", Page <pageNum>]: ...`
  const pageRegex = /\[Text from "([^"]+)", Page (\d+)\]:[\s\S]*?(?=(\[Text from "|\n\nUser Question|$))/g;
  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = pageRegex.exec(content)) !== null) {
    const fileName = pageMatch[1].trim();
    const pageNum = parseInt(pageMatch[2], 10);
    const existing = attachedDocs.find((d) => d.fileName === fileName);
    if (!existing) {
      attachedDocs.push({ fileName, fileType: 'PDF', pageNum });
    }
  }
  remaining = remaining.replace(pageRegex, '').trim();

  // 3. Match `[Attached DOCX File: "<fileName>"]` / `[Attached PDF File: "<fileName>"]`
  const attachedFileRegex = /\[Attached (DOCX|DOC|PDF|PPT|PPTX|TXT|XLSX) File:\s*"([^"]+)"\]/gi;
  let attMatch: RegExpExecArray | null;
  while ((attMatch = attachedFileRegex.exec(content)) !== null) {
    const fileType = attMatch[1].toUpperCase().trim();
    const fileName = attMatch[2].trim();
    if (!attachedDocs.some((d) => d.fileName === fileName)) {
      attachedDocs.push({ fileName, fileType });
    }
  }
  remaining = remaining.replace(attachedFileRegex, '').trim();

  // 4. Strip embedded screenshot annotations e.g. `[Attached X embedded screenshot(s)...]`
  remaining = remaining.replace(/\[Attached \d+ embedded screenshot\(s\)\/image\(s\)[^\]]*\]/gi, '').trim();
  remaining = remaining.replace(/\[Attached \d+ slide image\(s\)[^\]]*\]/gi, '').trim();

  // 5. Clean up "User Question about the above document: "
  remaining = remaining.replace(/^User Question about the above document:\s*/i, '').trim();

  // 6. If the remaining text matches the auto-generated fallback prompt, clean it up
  if (
    remaining === 'Please thoroughly analyze, explain, and summarize the contents of the document provided above.' ||
    remaining === 'Please analyze the attached file(s) and image(s).'
  ) {
    remaining = attachedDocs.length > 0 ? '' : remaining;
  }

  return {
    cleanText: remaining,
    attachedDocs,
  };
}

/**
 * Extracts a human-friendly title from a raw prompt that may start with
 * document extraction headers.
 */
export function cleanChatTitle(rawTitle: string): string {
  if (!rawTitle) return 'New Chat';

  let title = rawTitle.trim();

  // If title has document extraction block:
  if (title.includes('--- BEGIN DOCUMENT CONTENT:')) {
    const questionMatch = title.match(/User Question about the above document:\s*(.*)/i);
    if (questionMatch && questionMatch[1].trim()) {
      title = questionMatch[1].trim();
    } else {
      const docMatch = title.match(/--- BEGIN DOCUMENT CONTENT: "([^"]+)"/i);
      if (docMatch && docMatch[1].trim()) {
        title = docMatch[1].trim();
      }
    }
  } else if (title.startsWith('[Text from "')) {
    const fileMatch = title.match(/\[Text from "([^"]+)"/);
    if (fileMatch && fileMatch[1].trim()) {
      title = fileMatch[1].trim();
    }
  } else if (title.startsWith('[Attached ')) {
    const fileMatch = title.match(/\[Attached [A-Z]+ File:\s*"([^"]+)"\]/i);
    if (fileMatch && fileMatch[1].trim()) {
      title = fileMatch[1].trim();
    }
  }

  title = title.replace(/^User Question about the above document:\s*/i, '').trim();

  if (title.length > 36) {
    return title.substring(0, 36) + '...';
  }
  return title || 'Document analysis';
}

