/**
 * PDF Service
 * High-performance, client-side PDF page rendering and text extraction using pdfjs-dist.
 * Converts PDF pages directly to high-resolution JPEG images for vision-capable chat models.
 */

import * as pdfjsLib from 'pdfjs-dist';
// Vite ?url import gives us the resolved URL of the worker asset (works in dev & prod)
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { logToTerminal } from '../utils/terminalLogger';

// Set worker source using Vite-resolved URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

logToTerminal('info', 'PDF_SERVICE', `PDF Service initialized with workerSrc: ${pdfWorkerUrl}`);

// In-memory cache of loaded PDF documents to avoid re-parsing on subsequent page additions
const pdfDocCache = new Map<string, pdfjsLib.PDFDocumentProxy>();

/**
 * Timeout helper to prevent any operation from hanging indefinitely
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${message} (timed out after ${ms}ms)`)), ms)
    ),
  ]);
}

/**
 * Resolves any input (Blob, ArrayBuffer, Uint8Array, blob: URL, http URL) into raw Uint8Array on the main thread.
 * This guarantees the Web Worker never needs to issue fetch requests for blob: URLs (which fails in Safari/WebKit with 'Load failed').
 */
async function resolveToUint8Array(source: Blob | ArrayBuffer | Uint8Array | string): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    return source;
  }
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  if (source instanceof Blob) {
    logToTerminal('info', 'PDF_SERVICE', `Converting Blob (${source.size} bytes, type: ${source.type}) to Uint8Array on main thread`);
    const buffer = await source.arrayBuffer();
    return new Uint8Array(buffer);
  }
  if (typeof source === 'string') {
    logToTerminal('info', 'PDF_SERVICE', `Fetching source string on main thread: ${source.substring(0, 80)}...`);
    let buffer: ArrayBuffer;
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Direct fetch HTTP ${response.status} ${response.statusText}`);
      }
      buffer = await response.arrayBuffer();
      logToTerminal('info', 'PDF_SERVICE', `Direct fetch succeeded: ${buffer.byteLength} bytes`);
    } catch (directErr: any) {
      // Direct fetch failed (usually CORS on Firebase Storage). Fallback to Vite dev proxy!
      logToTerminal('warn', 'PDF_SERVICE', `Direct fetch failed (${directErr?.message || directErr}), retrying via Vite dev proxy...`);
      try {
        const proxyUrl = `/api/proxy-file?url=${encodeURIComponent(source)}`;
        const proxyResponse = await fetch(proxyUrl);
        if (!proxyResponse.ok) {
          throw new Error(`Proxy fetch HTTP ${proxyResponse.status} ${proxyResponse.statusText}`);
        }
        buffer = await proxyResponse.arrayBuffer();
        logToTerminal('success', 'PDF_SERVICE', `Proxy fetch succeeded: ${buffer.byteLength} bytes`);
      } catch (proxyErr: any) {
        throw new Error(`Failed to load PDF source (Direct: ${directErr?.message}, Proxy: ${proxyErr?.message})`);
      }
    }

    return new Uint8Array(buffer);
  }

  throw new Error(`Unsupported PDF source type: ${typeof source}`);
}

/**
 * Loads a PDF document from a Blob, ArrayBuffer, or URL string.
 */
async function loadPdfDocument(
  source: Blob | ArrayBuffer | string,
  cacheKey?: string
): Promise<pdfjsLib.PDFDocumentProxy> {
  if (cacheKey && pdfDocCache.has(cacheKey)) {
    logToTerminal('info', 'PDF_SERVICE', `Cache hit for PDF document: ${cacheKey}`);
    return pdfDocCache.get(cacheKey)!;
  }

  logToTerminal('info', 'PDF_SERVICE', `Loading PDF document (cacheKey: ${cacheKey || 'none'}). Resolving bytes on main thread...`);

  const data = await resolveToUint8Array(source);
  logToTerminal('info', 'PDF_SERVICE', `Resolved PDF data buffer: ${data.byteLength} bytes. Calling pdfjsLib.getDocument...`);

  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: undefined,
    standardFontDataUrl: undefined,
  });

  // 12 second timeout on loading
  const pdf = await withTimeout(loadingTask.promise, 12000, 'Loading PDF document');
  logToTerminal('success', 'PDF_SERVICE', `PDF document loaded successfully. Total pages: ${pdf.numPages}`);

  if (cacheKey) {
    pdfDocCache.set(cacheKey, pdf);
  }

  return pdf;
}

export interface RenderedPdfPage {
  imageDataUrl: string;
  extractedText: string;
  width: number;
  height: number;
  pageNum: number;
  totalPages: number;
}

/**
 * Renders a specific page of a PDF file to a base64 JPEG image data URL using an off-screen HTML5 Canvas.
 * Also extracts raw text from the page for comprehensive multimodal AI input.
 *
 * @param source - PDF Blob, ArrayBuffer, or URL
 * @param pageNum - 1-indexed page number
 * @param cacheKey - optional file identifier for caching
 * @param scale - rendering scale (default 1.5 provides high DPI for AI vision)
 */
export async function renderPdfPageToImage(
  source: Blob | ArrayBuffer | string,
  pageNum: number,
  cacheKey?: string,
  scale: number = 1.5
): Promise<RenderedPdfPage> {
  const startTime = performance.now();
  logToTerminal('info', 'PDF_CAPTURE', `▶ renderPdfPageToImage started for page ${pageNum} (cacheKey: ${cacheKey || 'none'})`);

  try {
    const pdf = await loadPdfDocument(source, cacheKey);
    const totalPages = pdf.numPages;

    // Clamp pageNum
    const validPageNum = Math.max(1, Math.min(pageNum, totalPages));
    logToTerminal('info', 'PDF_CAPTURE', `Fetching page ${validPageNum} of ${totalPages}...`);
    
    const page = await withTimeout(pdf.getPage(validPageNum), 8000, `Getting PDF Page ${validPageNum}`);
    const viewport = page.getViewport({ scale });
    logToTerminal('info', 'PDF_CAPTURE', `Page ${validPageNum} viewport: ${Math.round(viewport.width)}x${Math.round(viewport.height)} (scale: ${scale})`);

    // Off-screen canvas
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context for PDF rendering.');
    }

    // Fill canvas background with white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render the PDF page into canvas context with timeout
    const renderContext = {
      canvasContext: ctx,
      viewport,
    };

    logToTerminal('info', 'PDF_CAPTURE', `Rendering page ${validPageNum} to canvas...`);
    await withTimeout(page.render(renderContext as any).promise, 10000, `Rendering PDF Page ${validPageNum}`);

    // Extract base64 JPEG image
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const kb = Math.round(imageDataUrl.length / 1024);
    logToTerminal('success', 'PDF_CAPTURE', `Page ${validPageNum} rendered to image: ${kb} KB (took ${Math.round(performance.now() - startTime)}ms)`);

    // Extract text items from the page for combined text + vision accuracy
    let extractedText = '';
    try {
      const textContent = await withTimeout(page.getTextContent(), 4000, 'Extracting text');
      extractedText = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      logToTerminal('info', 'PDF_CAPTURE', `Extracted ${extractedText.length} characters of text from page ${validPageNum}`);
    } catch (textErr: any) {
      logToTerminal('warn', 'PDF_CAPTURE', `Could not extract text from PDF page ${validPageNum}: ${textErr?.message || textErr}`);
    }

    return {
      imageDataUrl,
      extractedText,
      width: canvas.width,
      height: canvas.height,
      pageNum: validPageNum,
      totalPages,
    };
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - startTime);
    logToTerminal('error', 'PDF_CAPTURE', `❌ Failed to render page ${pageNum} after ${elapsed}ms: ${err?.message || err}`, {
      errorName: err?.name,
      message: err?.message,
      stack: err?.stack,
    });
    throw err;
  }
}

/**
 * Helper to clear the PDF cache when appropriate.
 */
export function clearPdfCache(cacheKey?: string) {
  if (cacheKey) {
    logToTerminal('info', 'PDF_SERVICE', `Clearing PDF cache for key: ${cacheKey}`);
    pdfDocCache.delete(cacheKey);
  } else {
    logToTerminal('info', 'PDF_SERVICE', 'Clearing all PDF cache');
    pdfDocCache.clear();
  }
}
