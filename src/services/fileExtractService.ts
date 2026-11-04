/**
 * fileExtractService.ts
 *
 * Reliable client-side text extraction for all document types.
 * Supports: DOCX, PPTX, XLSX, XLS, CSV, TXT, MD, JSON, and all code files.
 *
 * Design principles:
 *  - Every extractor is wrapped in try/catch — it NEVER throws to the caller
 *  - Falls back to raw binary hint if parsing truly fails
 *  - Caps extracted text at MAX_CHARS to avoid context overflow
 *  - Zero network calls — 100% browser/client-side
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CHARS = 80_000; // ~20k tokens — plenty for even large docs
const MAX_FILE_MB = 25;   // hard limit: reject files > 25 MB

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedFile {
  fileName: string;
  fileType: string;      // 'docx' | 'pptx' | 'xlsx' | 'csv' | 'text' | 'code' | ...
  extractedText: string; // ready to inject into AI message
  charCount: number;
  truncated: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the file is a supported document type (not an image, not a PDF).
 * Images and PDFs are handled by the existing image/PDF pipelines.
 */
export function isSupportedDocument(file: File): boolean {
  return getFileCategory(file) !== 'unsupported';
}

/**
 * Extract text from any supported file. Always resolves — never rejects.
 * On failure returns an error description the AI can still read.
 */
export async function extractTextFromFile(file: File): Promise<ExtractedFile> {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_MB) {
    return makeResult(file, 'error',
      `[File too large: ${sizeMB.toFixed(1)} MB. Maximum supported size is ${MAX_FILE_MB} MB.]`);
  }

  const category = getFileCategory(file);

  try {
    switch (category) {
      case 'docx':   return await extractDocx(file);
      case 'pptx':   return await extractPptx(file);
      case 'xlsx':   return await extractXlsx(file);
      case 'csv':    return await extractPlainText(file, 'csv');
      case 'text':   return await extractPlainText(file, 'text');
      case 'code':   return await extractPlainText(file, 'code');
      case 'json':   return await extractJson(file);
      default:
        return makeResult(file, 'unsupported',
          `[Unsupported file type: ${file.name}. Supported types: DOCX, PPTX, XLSX, XLS, CSV, TXT, MD, JSON, and code files.]`);
    }
  } catch (err) {
    console.error(`❌ [FileExtract] Unexpected error extracting "${file.name}":`, err);
    return makeResult(file, 'error',
      `[Could not read file "${file.name}". The file may be corrupted or in an unsupported variant of this format.]`);
  }
}

// ─── File Categorisation ─────────────────────────────────────────────────────

function getFileCategory(file: File): string {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (name.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (name.endsWith('.pptx') || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (name.endsWith('.xlsx') || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (name.endsWith('.xls')  || mime === 'application/vnd.ms-excel') return 'xlsx';
  if (name.endsWith('.csv')  || mime === 'text/csv') return 'csv';
  if (name.endsWith('.json') || mime === 'application/json') return 'json';

  // Plain text & markdown
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown') ||
      name.endsWith('.rst') || name.endsWith('.rtf') || mime.startsWith('text/')) return 'text';

  // Code files
  const codeExts = [
    '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.cpp', '.h', '.hpp',
    '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.dart', '.sql',
    '.sh', '.bash', '.zsh', '.yml', '.yaml', '.toml', '.ini', '.env',
    '.xml', '.html', '.htm', '.css', '.scss', '.sass', '.less',
    '.r', '.m', '.scala', '.lua', '.pl', '.ex', '.exs', '.hs', '.clj',
  ];
  if (codeExts.some((ext) => name.endsWith(ext))) return 'code';

  return 'unsupported';
}

// ─── DOCX Extractor ──────────────────────────────────────────────────────────

async function extractDocx(file: File): Promise<ExtractedFile> {
  // Dynamic import so mammoth is only loaded when needed (code splitting)
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();

  let result: { value: string };
  try {
    result = await mammoth.extractRawText({ arrayBuffer });
  } catch (err) {
    console.warn('⚠️ [FileExtract] mammoth extractRawText failed, trying convertToHtml fallback:', err);
    // Fallback: convert to HTML then strip tags
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    result = { value: stripHtml(htmlResult.value) };
  }

  const rawText = result.value?.trim() || '';
  if (!rawText) {
    return makeResult(file, 'docx',
      '[The DOCX file appears to be empty or contains only images/shapes with no selectable text.]');
  }

  return makeResult(file, 'docx', rawText);
}

// ─── PPTX Extractor ──────────────────────────────────────────────────────────

async function extractPptx(file: File): Promise<ExtractedFile> {
  const JSZip = (await import('jszip')).default;
  const arrayBuffer = await file.arrayBuffer();

  let zip: ReturnType<typeof JSZip.prototype.loadAsync> extends Promise<infer T> ? T : never;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (err) {
    console.error('❌ [FileExtract] PPTX zip load failed:', err);
    return makeResult(file, 'pptx',
      `[Could not open the PPTX file. It may be corrupted or password-protected.]`);
  }

  // Find all slide XML files and sort them numerically
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
      return numA - numB;
    });

  if (slideFiles.length === 0) {
    return makeResult(file, 'pptx',
      '[No slides found in the PPTX file. It may be empty or use an unsupported structure.]');
  }

  const slideTexts: string[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.files[slideFiles[i]].async('text');
    const text = extractTextFromXml(slideXml);
    if (text.trim()) {
      slideTexts.push(`--- Slide ${i + 1} ---\n${text.trim()}`);
    }
  }

  if (slideTexts.length === 0) {
    return makeResult(file, 'pptx',
      '[The PPTX file has slides but no extractable text. It may contain only images or shapes.]');
  }

  return makeResult(file, 'pptx', slideTexts.join('\n\n'));
}

/** Pull text content from PPTX slide XML by extracting all <a:t> text nodes */
function extractTextFromXml(xml: string): string {
  // Extract all <a:t>...</a:t> text runs
  const textRuns: string[] = [];
  const regex = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const decoded = decodeXmlEntities(match[1]);
    if (decoded.trim()) textRuns.push(decoded);
  }

  // Group consecutive runs by paragraph (<a:p> boundaries)
  // Simple heuristic: insert newline at each </a:p>
  const withParas = xml
    .replace(/<\/a:p>/g, '\n')
    .replace(/<\/a:txSp>/g, '\n');

  // Re-extract after paragraph markers
  const paraLines: string[] = [];
  const paraRegex = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  let paraMatch: RegExpExecArray | null;
  const lineXml = withParas;

  while ((paraMatch = paraRegex.exec(lineXml)) !== null) {
    const decoded = decodeXmlEntities(paraMatch[1]);
    if (decoded.trim()) paraLines.push(decoded.trim());
  }

  // If paragraph approach got more content, prefer it
  const result = paraLines.length >= textRuns.length ? paraLines : textRuns;
  return result.join('\n');
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

// ─── XLSX / XLS Extractor ────────────────────────────────────────────────────

async function extractXlsx(file: File): Promise<ExtractedFile> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();

  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(arrayBuffer, { type: 'array', cellText: true, cellDates: true });
  } catch (err) {
    console.error('❌ [FileExtract] XLSX parse failed:', err);
    return makeResult(file, 'xlsx',
      '[Could not parse the spreadsheet. It may be corrupted or password-protected.]');
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return makeResult(file, 'xlsx', '[The spreadsheet file has no sheets.]');
  }

  const sheetTexts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // sheet_to_csv is the most reliable — it handles merged cells, formulas, dates
    let csv: string;
    try {
      csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    } catch {
      // Fallback: sheet_to_txt
      try {
        csv = XLSX.utils.sheet_to_txt(sheet);
      } catch {
        csv = '[Could not read this sheet]';
      }
    }

    const trimmedCsv = csv.trim();
    if (trimmedCsv && trimmedCsv !== ','.repeat(trimmedCsv.length)) {
      sheetTexts.push(`--- Sheet: ${sheetName} ---\n${trimmedCsv}`);
    }
  }

  if (sheetTexts.length === 0) {
    return makeResult(file, 'xlsx', '[The spreadsheet appears to be empty.]');
  }

  return makeResult(file, 'xlsx', sheetTexts.join('\n\n'));
}

// ─── Plain Text / Code Extractor ─────────────────────────────────────────────

async function extractPlainText(file: File, category: string): Promise<ExtractedFile> {
  return new Promise<ExtractedFile>((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      resolve(makeResult(file, category, text));
    };

    reader.onerror = () => {
      console.error('❌ [FileExtract] FileReader error for:', file.name);
      resolve(makeResult(file, category,
        `[Could not read file "${file.name}". The file may be corrupted.]`));
    };

    // Try UTF-8 first; most source code / text files are UTF-8
    reader.readAsText(file, 'UTF-8');
  });
}

// ─── JSON Extractor ───────────────────────────────────────────────────────────

async function extractJson(file: File): Promise<ExtractedFile> {
  const result = await extractPlainText(file, 'json');

  // Pretty-print if valid JSON
  try {
    const parsed = JSON.parse(result.extractedText);
    const pretty = JSON.stringify(parsed, null, 2);
    return makeResult(file, 'json', pretty);
  } catch {
    // Not valid JSON — return raw text anyway, AI can still try to parse it
    return result;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function makeResult(file: File, fileType: string, rawText: string): ExtractedFile {
  const truncated = rawText.length > MAX_CHARS;
  const extractedText = truncated
    ? rawText.slice(0, MAX_CHARS) + `\n\n[... truncated — showing first ${MAX_CHARS.toLocaleString()} of ${rawText.length.toLocaleString()} characters]`
    : rawText;

  return {
    fileName: file.name,
    fileType,
    extractedText,
    charCount: extractedText.length,
    truncated,
  };
}

