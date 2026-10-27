import React, { useState, useEffect, useRef } from 'react';
import {
  FilePdfIcon,
  FilePptIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  MaximizeIcon,
  MinimizeIcon,
  DownloadIcon,
  CameraIcon,
  PlusIcon,
} from './Icons';
import type { NotebookFile, AttachedPage } from '../types/notebook';
import { getFileBlob, storeFileBlob } from '../services/fileStore';
import { renderPdfPageToImage } from '../services/pdfService';
import { logToTerminal } from '../utils/terminalLogger';

interface FloatingDocumentViewerProps {
  file: NotebookFile;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  onClose: () => void;
  onAddPageToChat: (page: AttachedPage) => void;
}

export const FloatingDocumentViewer: React.FC<FloatingDocumentViewerProps> = ({
  file,
  isMinimized,
  onToggleMinimize,
  onClose,
  onAddPageToChat,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDockedHalf, setIsDockedHalf] = useState(false);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // Multi-page selection
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);

  // Window geometry (floating & draggable)
  const [windowPos, setWindowPos] = useState({ x: 0, y: 0 }); // offset from default right side
  const [windowSize, setWindowSize] = useState({ width: 560, height: 680 });
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, initialX: 0, initialY: 0 });
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, initialW: 0, initialH: 0 });

  // Parse total pages / slides count
  const totalPages = Math.max(
    1,
    parseInt((file.pageCount || '').replace(/[^0-9]/g, ''), 10) || 12
  );

  // Load document blob from IndexedDB or fall back to downloadUrl
  useEffect(() => {
    let objectUrl: string | null = null;
    let isCancelled = false;

    async function loadDocument() {
      setIsLoading(true);
      try {
        const blob = await getFileBlob(file.id);
        if (!isCancelled && blob) {
          setDocumentBlob(blob);
          objectUrl = URL.createObjectURL(blob);
          setResolvedUrl(objectUrl);
          setIsLoading(false);
          return;
        }

        if (!isCancelled && file.downloadUrl) {
          setResolvedUrl(file.downloadUrl);
          setIsLoading(false);

          // Pre-cache blob in IndexedDB so captures and re-renders are instant and offline
          (async () => {
            try {
              let res = await fetch(file.downloadUrl!).catch(() => null);
              if (!res || !res.ok) {
                res = await fetch(`/api/proxy-file?url=${encodeURIComponent(file.downloadUrl!)}`).catch(() => null);
              }
              if (res && res.ok && !isCancelled) {
                const fetchedBlob = await res.blob();
                await storeFileBlob(file.id, fetchedBlob);
                setDocumentBlob(fetchedBlob);
                logToTerminal('info', 'FLOATING_VIEWER', `Pre-cached blob in IndexedDB for "${file.name}" (${fetchedBlob.size} bytes)`);
              }
            } catch {
              // Ignore background cache errors
            }
          })();

          return;
        }
      } catch (err) {
        console.warn('Could not resolve document blob:', err);
      }

      if (!isCancelled) {
        setIsLoading(false);
      }
    }

    loadDocument();

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file.id, file.downloadUrl]);

  // Keyboard navigation for sliding pages
  useEffect(() => {
    if (isMinimized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in chat input/textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, isMinimized]);

  // Page navigation
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handlePageSelect = (page: number) => {
    setCurrentPage(page);
  };

  // Add current page to chat with high-res JPEG image rendering
  const handleAddCurrentPageToChat = async (pageNum: number = currentPage) => {
    setIsCapturing(true);
    setAddedToast(`Capturing Page ${pageNum}...`);
    logToTerminal('info', 'FLOATING_VIEWER', `Starting capture for file: "${file.name}" (id: ${file.id}), page: ${pageNum}`);

    let imageDataUrl: string | undefined;
    let extractedText: string | undefined;
    let captureError: string | undefined;

    try {
      const source = documentBlob || (await getFileBlob(file.id)) || file.downloadUrl || resolvedUrl;
      logToTerminal('info', 'FLOATING_VIEWER', `Resolved capture source`, {
        hasDocumentBlob: !!documentBlob,
        documentBlobSize: documentBlob?.size,
        sourceType: source instanceof Blob ? `Blob (${source.size} bytes)` : typeof source,
        sourcePreview: typeof source === 'string' ? source.substring(0, 100) : undefined,
        fileName: file.name,
        fileType: file.type,
      });

      if (!source) {
        throw new Error('No PDF source available to capture (blob and download URL are both missing).');
      }

      if (file.type === 'pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const rendered = await renderPdfPageToImage(source, pageNum, file.id);
        imageDataUrl = rendered.imageDataUrl;
        extractedText = rendered.extractedText;
        logToTerminal('success', 'FLOATING_VIEWER', `Successfully captured page ${pageNum} image (${Math.round(imageDataUrl.length / 1024)} KB)`);
      } else {
        logToTerminal('warn', 'FLOATING_VIEWER', `File "${file.name}" is not a PDF, skipping image rendering`);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      logToTerminal('error', 'FLOATING_VIEWER', `❌ Capture failed for page ${pageNum}: ${msg}`, {
        error: err?.message,
        stack: err?.stack,
        fileName: file.name,
      });
      captureError = msg;
    } finally {
      setIsCapturing(false);
    }

    if (captureError) {
      setAddedToast(`⚠️ Capture failed: ${captureError.substring(0, 80)}`);
      setTimeout(() => setAddedToast(null), 6000);
      // Still add the page to chat even without image (text-only reference)
    }

    const pageItem: AttachedPage = {
      id: `page_${file.id}_${pageNum}_${Date.now()}`,
      fileId: file.id,
      fileName: file.name,
      fileType: file.type,
      pageNum,
      totalPages,
      previewUrl: resolvedUrl ? `${resolvedUrl}#page=${pageNum}` : undefined,
      imageDataUrl,
      extractedText,
      addedAt: Date.now(),
    };

    onAddPageToChat(pageItem);
    if (!captureError) {
      setAddedToast(imageDataUrl ? `✅ Page ${pageNum} image added to chat!` : `Page ${pageNum} added to chat (no image)`);
      setTimeout(() => setAddedToast(null), 3000);
    }
  };


  // Add multiple selected pages to chat with image rendering
  const handleAddSelectedPagesToChat = async () => {
    if (selectedPages.length === 0) return;
    setIsCapturing(true);
    setAddedToast(`Capturing ${selectedPages.length} pages...`);

    const source = documentBlob || (await getFileBlob(file.id)) || file.downloadUrl || resolvedUrl;

    const pages = [...selectedPages].sort((a, b) => a - b);
    logToTerminal('info', 'FLOATING_VIEWER', `Capturing ${pages.length} selected pages: [${pages.join(', ')}]`);
    for (const pNum of pages) {
      let imageDataUrl: string | undefined;
      let extractedText: string | undefined;

      try {
        if (source && (file.type === 'pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
          const rendered = await renderPdfPageToImage(source, pNum, file.id);
          imageDataUrl = rendered.imageDataUrl;
          extractedText = rendered.extractedText;
          logToTerminal('success', 'FLOATING_VIEWER', `Selected page ${pNum} captured successfully`);
        }
      } catch (err: any) {
        logToTerminal('error', 'FLOATING_VIEWER', `Could not render selected page ${pNum}: ${err?.message || err}`);
      }

      const pageItem: AttachedPage = {
        id: `page_${file.id}_${pNum}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        fileId: file.id,
        fileName: file.name,
        fileType: file.type,
        pageNum: pNum,
        totalPages,
        previewUrl: resolvedUrl ? `${resolvedUrl}#page=${pNum}` : undefined,
        imageDataUrl,
        extractedText,
        addedAt: Date.now(),
      };
      onAddPageToChat(pageItem);
    }

    setIsCapturing(false);
    setAddedToast(`Added ${pages.length} pages to chat!`);
    setSelectedPages([]);
    setIsSelectMode(false);
    setTimeout(() => setAddedToast(null), 3000);
  };

  const togglePageSelection = (pageNum: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedPages((prev) =>
      prev.includes(pageNum) ? prev.filter((p) => p !== pageNum) : [...prev, pageNum]
    );
  };

  // Window drag handlers
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (isDockedHalf) return;
    // Don't drag if clicking buttons or inputs
    if ((e.target as HTMLElement).closest('button, input, a')) return;

    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: windowPos.x,
      initialY: windowPos.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.mouseX;
      const dy = moveEvent.clientY - dragStartRef.current.mouseY;
      setWindowPos({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Resize handler (drag from bottom-left corner or left edge)
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialW: windowSize.width,
      initialH: windowSize.height,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      // dragging left increases width
      const dx = resizeStartRef.current.mouseX - moveEvent.clientX;
      const dy = moveEvent.clientY - resizeStartRef.current.mouseY;

      const newWidth = Math.max(420, Math.min(window.innerWidth * 0.75, resizeStartRef.current.initialW + dx));
      const newHeight = Math.max(380, Math.min(window.innerHeight * 0.92, resizeStartRef.current.initialH + dy));

      setWindowSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const isPdf = file.type === 'pdf';
  const isPpt = file.type === 'ppt' || file.type === 'pptx';

  // ==========================================================
  // MINIMIZED STATE (Floating pill at bottom right)
  // ==========================================================
  if (isMinimized) {
    return (
      <div style={styles.minimizedPill}>
        <div style={styles.minimizedIconBadge}>
          {isPdf ? <FilePdfIcon size={14} /> : <FilePptIcon size={14} />}
        </div>

        <span style={styles.minimizedTitle} title={file.name}>
          {file.name}
        </span>

        <span style={styles.minimizedPageTag}>
          p. {currentPage}/{totalPages}
        </span>

        {/* Quick Add Page to Chat right from minimized pill! */}
        <button
          onClick={() => handleAddCurrentPageToChat(currentPage)}
          style={styles.minimizedAddChatBtn}
          title={`Add Page ${currentPage} picture to chat`}
        >
          <CameraIcon size={13} />
          <span>+ Chat</span>
        </button>

        {/* Restore / Expand */}
        <button
          onClick={onToggleMinimize}
          style={styles.minimizedActionBtn}
          title="Expand document viewer"
        >
          <MaximizeIcon size={13} />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          style={styles.minimizedActionBtn}
          title="Close document viewer"
        >
          ✕
        </button>
      </div>
    );
  }

  // ==========================================================
  // FLOATING WINDOW STATE
  // ==========================================================
  const windowStyle: React.CSSProperties = isDockedHalf
    ? {
        position: 'fixed',
        top: '48px',
        right: 0,
        bottom: 0,
        width: '50vw',
        zIndex: 9999,
        backgroundColor: '#000000',
        borderLeft: '1px solid rgba(255, 255, 255, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.85)',
      }
    : {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        transform: `translate(${windowPos.x}px, ${windowPos.y}px)`,
        width: `${windowSize.width}px`,
        height: `${windowSize.height}px`,
        maxWidth: '90vw',
        maxHeight: '92vh',
        zIndex: 9999,
        backgroundColor: '#000000',
        border: '1.5px solid rgba(255, 255, 255, 0.22)',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
      };

  return (
    <div style={windowStyle}>
      {/* Toast Notification when Page added to chat */}
      {addedToast && (
        <div style={styles.toastNotification}>
          <span>✓</span>
          <span>{addedToast}</span>
        </div>
      )}

      {/* Resize Handle on Left Edge (visible in floating mode) */}
      {!isDockedHalf && (
        <div
          onMouseDown={handleResizeMouseDown}
          style={styles.leftResizeHandle}
          title="Drag to resize window"
        />
      )}

      {/* Draggable Header Bar */}
      <header
        onMouseDown={handleHeaderMouseDown}
        style={{
          ...styles.windowHeader,
          cursor: isDockedHalf ? 'default' : 'grab',
        }}
      >
        {/* Left: Document Info & Format Badge */}
        <div style={styles.headerLeft}>
          <div
            style={{
              ...styles.formatBadge,
              backgroundColor: isPdf
                ? 'rgba(239, 68, 68, 0.18)'
                : isPpt
                ? 'rgba(249, 115, 22, 0.18)'
                : 'rgba(168, 85, 247, 0.18)',
              color: isPdf ? '#f87171' : isPpt ? '#fb923c' : '#c084fc',
            }}
          >
            {isPdf ? <FilePdfIcon size={13} /> : <FilePptIcon size={13} />}
            <span>{file.type.toUpperCase()}</span>
          </div>

          <h3 style={styles.windowTitle} title={file.name}>
            {file.name}
          </h3>
        </div>

        {/* Center: Slide / Page Navigation */}
        <div style={styles.headerCenter}>
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            style={{
              ...styles.pNavBtn,
              opacity: currentPage <= 1 ? 0.35 : 1,
            }}
            title="Previous page (←)"
          >
            <ChevronLeftIcon size={14} />
          </button>

          <span style={styles.pCounter}>
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            style={{
              ...styles.pNavBtn,
              opacity: currentPage >= totalPages ? 0.35 : 1,
            }}
            title="Next page (→)"
          >
            <ChevronRightIcon size={14} />
          </button>
        </div>

        {/* Right: Window Controls (Dock, Minimize, Cutting Close) */}
        <div style={styles.headerRight}>
          {/* Dock / Split toggle */}
          <button
            onClick={() => setIsDockedHalf((prev) => !prev)}
            style={styles.controlIconBtn}
            title={isDockedHalf ? 'Float window' : 'Dock to side (50% split)'}
          >
            <MaximizeIcon size={13} />
          </button>

          {/* Minimize button */}
          <button
            onClick={onToggleMinimize}
            style={styles.controlIconBtn}
            title="Minimize to floating pill"
          >
            <MinimizeIcon size={14} />
          </button>

          {/* Close / Cutting button */}
          <button
            onClick={onClose}
            style={styles.closeCuttingBtn}
            title="Close document window (Esc)"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Action Bar: "Add Page to Chat" + "Select Pages" + Zoom Controls */}
      <div style={styles.actionBar}>
        <div style={styles.actionBarLeft}>
          {/* Primary Action: Add Current Page to Chat */}
          <button
            onClick={() => handleAddCurrentPageToChat(currentPage)}
            disabled={isCapturing}
            style={{
              ...styles.addPageToChatBtn,
              opacity: isCapturing ? 0.7 : 1,
              cursor: isCapturing ? 'wait' : 'pointer',
            }}
            title={`Add Page ${currentPage} picture into chat input`}
          >
            <CameraIcon size={14} />
            <span>{isCapturing ? 'Capturing Page...' : `Add Page ${currentPage} to Chat`}</span>
          </button>

          {/* Multi-page selection toggle */}
          <button
            onClick={() => setIsSelectMode((prev) => !prev)}
            style={{
              ...styles.selectPagesToggleBtn,
              backgroundColor: isSelectMode ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.05)',
              color: isSelectMode ? '#60a5fa' : 'rgba(255, 255, 255, 0.75)',
              borderColor: isSelectMode ? '#3b82f6' : 'rgba(255, 255, 255, 0.18)',
            }}
            title="Select multiple pages to attach to chat"
          >
            <span>{isSelectMode ? 'Cancel Selection' : 'Select Pages'}</span>
          </button>

          {/* If pages selected, show Add Selected button */}
          {selectedPages.length > 0 && (
            <button
              onClick={handleAddSelectedPagesToChat}
              style={styles.addMultipleBtn}
              title={`Add ${selectedPages.length} selected pages to chat`}
            >
              <CameraIcon size={13} />
              <span>Add {selectedPages.length} to Chat</span>
            </button>
          )}
        </div>

        {/* Zoom controls */}
        <div style={styles.zoomRow}>
          <button
            onClick={() => setZoomLevel((z) => Math.max(z - 20, 60))}
            style={styles.zoomBtn}
            title="Zoom out"
          >
            <ZoomOutIcon size={13} />
          </button>
          <span style={styles.zoomLabel}>{zoomLevel}%</span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(z + 20, 180))}
            style={styles.zoomBtn}
            title="Zoom in"
          >
            <ZoomInIcon size={13} />
          </button>

          {resolvedUrl && (
            <a
              href={resolvedUrl}
              download={file.name}
              target="_blank"
              rel="noreferrer"
              style={styles.downloadIconLink}
              title="Download file"
            >
              <DownloadIcon size={13} />
            </a>
          )}
        </div>
      </div>

      {/* Main Document / PDF Canvas */}
      <div style={styles.canvasArea}>
        {/* Floating Slide Navigation Arrows */}
        <button
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          style={{
            ...styles.floatingArrow,
            left: '12px',
            opacity: currentPage <= 1 ? 0.2 : 0.85,
            cursor: currentPage <= 1 ? 'default' : 'pointer',
          }}
          title="Previous slide (←)"
        >
          <ChevronLeftIcon size={20} />
        </button>

        <button
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          style={{
            ...styles.floatingArrow,
            right: '12px',
            opacity: currentPage >= totalPages ? 0.2 : 0.85,
            cursor: currentPage >= totalPages ? 'default' : 'pointer',
          }}
          title="Next slide (→)"
        >
          <ChevronRightIcon size={20} />
        </button>

        {/* Viewport Frame */}
        <div style={styles.viewportContainer}>
          {isLoading ? (
            <div style={styles.loadingBox}>
              <div style={styles.spinner} />
              <span style={styles.loadingLabel}>Loading document...</span>
            </div>
          ) : resolvedUrl ? (
            <div
              key={`${file.id}_${currentPage}`}
              style={{
                ...styles.documentScaleWrap,
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'center top',
              }}
            >
              <iframe
                src={`${resolvedUrl}#page=${currentPage}&view=FitH&toolbar=0`}
                title={`${file.name} - Page ${currentPage}`}
                style={styles.pdfFrame}
              />
            </div>
          ) : (
            /* Interactive Classroom Page Preview */
            <div
              style={{
                ...styles.fallbackSlideBox,
                transform: `scale(${zoomLevel / 100})`,
              }}
            >
              <div style={styles.fallbackSlideHeader}>
                <span>{file.name}</span>
                <span>Page {currentPage} of {totalPages}</span>
              </div>
              <div style={styles.fallbackSlideBody}>
                <h4>
                  {currentPage === 1
                    ? file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
                    : `Section ${currentPage}: Study Material & Equations`}
                </h4>
                <p>
                  Click <strong>"Add Page {currentPage} to Chat"</strong> above to send this page picture directly into your conversation with Rad AI.
                </p>
              </div>
              <div style={styles.fallbackSlideFooter}>
                <span>Rad Classroom Viewer</span>
                <button
                  onClick={() => handleAddCurrentPageToChat(currentPage)}
                  style={styles.slideAttachPromptBtn}
                >
                  <CameraIcon size={12} />
                  <span>Attach Page {currentPage}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Thumbnail Strip with Multi-Select Checkboxes */}
      <footer style={styles.bottomStrip}>
        <div style={styles.stripLeftLabel}>
          <span>{isSelectMode ? 'Pick Pages' : 'Pages'}</span>
        </div>

        <div style={styles.thumbnailsScroller}>
          {Array.from({ length: totalPages }).map((_, idx) => {
            const pageNum = idx + 1;
            const isSelected = pageNum === currentPage;
            const isChecked = selectedPages.includes(pageNum);

            return (
              <div
                key={pageNum}
                onClick={() => {
                  if (isSelectMode) {
                    togglePageSelection(pageNum);
                  } else {
                    handlePageSelect(pageNum);
                  }
                }}
                style={{
                  ...styles.thumbCard,
                  borderColor: isChecked
                    ? '#3b82f6'
                    : isSelected
                    ? '#3b82f6'
                    : 'rgba(255, 255, 255, 0.2)',
                  backgroundColor: isChecked
                    ? 'rgba(59, 130, 246, 0.2)'
                    : isSelected
                    ? 'rgba(59, 130, 246, 0.12)'
                    : '#000000',
                }}
                title={isSelectMode ? `Toggle Page ${pageNum}` : `Jump to Page ${pageNum}`}
              >
                {/* Checkbox if in multi-select mode */}
                {isSelectMode ? (
                  <div style={styles.thumbCheckboxRow}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => togglePageSelection(pageNum)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={styles.thumbNumText}>p.{pageNum}</span>
                  </div>
                ) : (
                  <div style={styles.thumbMiniPreview}>
                    <div style={styles.thumbMiniLine1} />
                    <div style={styles.thumbMiniLine2} />
                    <span style={styles.thumbNumText}>{pageNum}</span>
                  </div>
                )}

                {/* Quick Add To Chat button on thumb hover */}
                {!isSelectMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddCurrentPageToChat(pageNum);
                    }}
                    style={styles.thumbQuickAddBtn}
                    title={`Add Page ${pageNum} to chat`}
                  >
                    <PlusIcon size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  minimizedPill: {
    position: 'fixed',
    bottom: '20px',
    right: '24px',
    zIndex: 99999,
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '24px',
    padding: '6px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.9)',
    userSelect: 'none',
  },
  minimizedIconBadge: {
    color: '#3b82f6',
    display: 'flex',
    alignItems: 'center',
  },
  minimizedTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  minimizedPageTag: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.7)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  minimizedAddChatBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#3b82f6',
    border: 'none',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  minimizedActionBtn: {
    background: 'transparent',
    border: 'none',
    color: '#a39e94',
    cursor: 'pointer',
    padding: '3px',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
  },
  leftResizeHandle: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '6px',
    cursor: 'ew-resize',
    zIndex: 50,
  },
  toastNotification: {
    position: 'absolute',
    top: '46px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#000000',
    border: '1px solid #10b981',
    color: '#10b981',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
    zIndex: 99,
  },
  windowHeader: {
    height: '44px',
    backgroundColor: '#000000',
    borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    userSelect: 'none',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    maxWidth: '42%',
    overflow: 'hidden',
  },
  formatBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    flexShrink: 0,
  },
  windowTitle: {
    fontSize: '13px',
    fontWeight: 550,
    color: '#ffffff',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: '2px 8px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
  },
  pNavBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.75)',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
  },
  pCounter: {
    fontSize: '12px',
    color: '#ffffff',
    fontWeight: 500,
    minWidth: '48px',
    textAlign: 'center',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  controlIconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#948f86',
    cursor: 'pointer',
    width: '26px',
    height: '26px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeCuttingBtn: {
    background: 'transparent',
    border: 'none',
    color: '#948f86',
    cursor: 'pointer',
    width: '26px',
    height: '26px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
  },
  actionBar: {
    height: '40px',
    backgroundColor: '#000000',
    borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    flexShrink: 0,
    gap: '8px',
  },
  actionBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  addPageToChatBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#3b82f6',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    padding: '5px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
  selectPagesToggleBtn: {
    border: '1px solid rgba(255, 255, 255, 0.18)',
    fontSize: '11px',
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  addMultipleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    border: '1px solid #3b82f6',
    color: '#60a5fa',
    fontSize: '11px',
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  zoomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: '2px 6px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
  },
  zoomBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9e998f',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
  },
  zoomLabel: {
    fontSize: '11px',
    color: '#cfcac0',
    minWidth: '32px',
    textAlign: 'center',
  },
  downloadIconLink: {
    color: '#cfcac0',
    display: 'flex',
    alignItems: 'center',
    marginLeft: '4px',
    textDecoration: 'none',
  },
  canvasArea: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingArrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 25,
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    border: '1.5px solid rgba(255, 255, 255, 0.25)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.8)',
  },
  viewportContainer: {
    width: '100%',
    height: '100%',
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
  },
  documentScaleWrap: {
    width: '96%',
    height: '96%',
    backgroundColor: '#000000',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.8)',
  },
  pdfFrame: {
    width: '100%',
    height: '100%',
    border: 'none',
    backgroundColor: '#ffffff',
  },
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  spinner: {
    width: '28px',
    height: '28px',
    border: '2.5px solid #282723',
    borderTopColor: 'var(--accent-terracotta)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingLabel: {
    fontSize: '12px',
    color: '#8e8980',
  },
  fallbackSlideBox: {
    width: '90%',
    maxWidth: '480px',
    backgroundColor: '#1c1b18',
    border: '1px solid #33312b',
    borderRadius: '10px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  fallbackSlideHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#948f86',
    borderBottom: '1px solid #2b2a26',
    paddingBottom: '8px',
  },
  fallbackSlideBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    color: '#d4cfc5',
    fontSize: '13px',
  },
  fallbackSlideFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid #2b2a26',
    paddingTop: '8px',
    fontSize: '11px',
    color: '#706b63',
  },
  slideAttachPromptBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  bottomStrip: {
    height: '68px',
    backgroundColor: '#000000',
    borderTop: '1px solid rgba(255, 255, 255, 0.15)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: '10px',
    flexShrink: 0,
    overflow: 'hidden',
  },
  stripLeftLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.45)',
    textTransform: 'uppercase',
  },
  thumbnailsScroller: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    overflowX: 'auto',
    padding: '4px 0',
  },
  thumbCard: {
    width: '52px',
    height: '44px',
    borderRadius: '6px',
    border: '1.5px solid',
    cursor: 'pointer',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  thumbCheckboxRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  thumbMiniPreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  thumbMiniLine1: {
    width: '18px',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: '1px',
  },
  thumbMiniLine2: {
    width: '12px',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: '1px',
  },
  thumbNumText: {
    fontSize: '9px',
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: '2px',
  },
  thumbQuickAddBtn: {
    position: 'absolute',
    top: '2px',
    right: '2px',
    backgroundColor: '#3b82f6',
    border: 'none',
    color: '#ffffff',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
};
