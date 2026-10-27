import React, { useState, useEffect, useRef } from 'react';
import {
  FilePdfIcon,
  FilePptIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  MaximizeIcon,
  DownloadIcon,
} from './Icons';
import type { NotebookFile } from '../types/notebook';
import { getFileBlob } from '../services/fileStore';

interface DocumentViewerModalProps {
  file: NotebookFile;
  onClose: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ file, onClose }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Parse total pages/slides count (e.g. "18 pages" -> 18, "24 slides" -> 24)
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
          objectUrl = URL.createObjectURL(blob);
          setResolvedUrl(objectUrl);
          setIsLoading(false);
          return;
        }

        if (!isCancelled && file.downloadUrl) {
          setResolvedUrl(file.downloadUrl);
          setIsLoading(false);
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

  // Keyboard navigation for sliding pages (Classroom app style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
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
  }, [currentPage, totalPages]);

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
    if (page === currentPage) return;
    setCurrentPage(page);
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 25, 50));
  };

  const handleFitPage = () => {
    setZoomLevel(100);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const isPdf = file.type === 'pdf';
  const isPpt = file.type === 'ppt' || file.type === 'pptx';

  return (
    <div ref={containerRef} style={styles.modalOverlay}>
      {/* Top Header Bar */}
      <header style={styles.viewerHeader}>
        {/* Left: Document Info */}
        <div style={styles.headerLeft}>
          <button onClick={onClose} style={styles.closeBackBtn} title="Close viewer (Esc)">
            ✕
          </button>

          <div
            style={{
              ...styles.docTypeBadge,
              backgroundColor: isPdf
                ? 'rgba(239, 68, 68, 0.2)'
                : isPpt
                ? 'rgba(249, 115, 22, 0.2)'
                : 'rgba(168, 85, 247, 0.2)',
              color: isPdf ? '#f87171' : isPpt ? '#fb923c' : '#c084fc',
            }}
          >
            {isPdf ? <FilePdfIcon size={14} /> : isPpt ? <FilePptIcon size={14} /> : <BookOpenIcon size={14} />}
            <span>{file.type.toUpperCase()}</span>
          </div>

          <h2 style={styles.docTitle} title={file.name}>
            {file.name}
          </h2>
          <span style={styles.fileSizeTag}>{file.size}</span>
        </div>

        {/* Center: Slide / Page Navigation Scrubber */}
        <div style={styles.headerCenter}>
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            style={{
              ...styles.navArrowBtn,
              opacity: currentPage <= 1 ? 0.35 : 1,
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            }}
            title="Previous page (Left arrow)"
          >
            <ChevronLeftIcon size={16} />
          </button>

          <div style={styles.pageIndicatorBox}>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (val >= 1 && val <= totalPages) {
                  setCurrentPage(val);
                }
              }}
              style={styles.pageInput}
            />
            <span style={styles.pageTotalText}>/ {totalPages}</span>
          </div>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            style={{
              ...styles.navArrowBtn,
              opacity: currentPage >= totalPages ? 0.35 : 1,
              cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            }}
            title="Next page (Right arrow)"
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>

        {/* Right: Zoom & Tool Actions */}
        <div style={styles.headerRight}>
          <div style={styles.zoomControlGroup}>
            <button onClick={handleZoomOut} style={styles.toolIconBtn} title="Zoom out">
              <ZoomOutIcon size={15} />
            </button>
            <span style={styles.zoomText}>{zoomLevel}%</span>
            <button onClick={handleZoomIn} style={styles.toolIconBtn} title="Zoom in">
              <ZoomInIcon size={15} />
            </button>
          </div>

          <button onClick={handleFitPage} style={styles.toolTextBtn} title="Fit to 100%">
            Fit
          </button>

          <button
            onClick={handleToggleFullscreen}
            style={{
              ...styles.toolIconBtn,
              color: isFullscreen ? 'var(--accent-terracotta)' : '#cfcac0',
            }}
            title={isFullscreen ? 'Exit fullscreen' : 'Toggle fullscreen'}
          >
            <MaximizeIcon size={15} />
          </button>

          {resolvedUrl && (
            <a
              href={resolvedUrl}
              download={file.name}
              target="_blank"
              rel="noreferrer"
              style={styles.downloadLinkBtn}
              title="Download file"
            >
              <DownloadIcon size={15} />
            </a>
          )}
        </div>
      </header>

      {/* Main Slide / Document Canvas */}
      <div style={styles.mainCanvas}>
        {/* Floating Slide Navigation Arrow - LEFT */}
        <button
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          style={{
            ...styles.floatingSlideArrow,
            ...styles.floatingLeftArrow,
            opacity: currentPage <= 1 ? 0.15 : 0.85,
            cursor: currentPage <= 1 ? 'default' : 'pointer',
          }}
          title="Previous slide (←)"
        >
          <ChevronLeftIcon size={28} />
        </button>

        {/* Floating Slide Navigation Arrow - RIGHT */}
        <button
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          style={{
            ...styles.floatingSlideArrow,
            ...styles.floatingRightArrow,
            opacity: currentPage >= totalPages ? 0.15 : 0.85,
            cursor: currentPage >= totalPages ? 'default' : 'pointer',
          }}
          title="Next slide (→)"
        >
          <ChevronRightIcon size={28} />
        </button>

        {/* Document Frame / Page Presentation */}
        <div style={styles.documentViewport}>
          {isLoading ? (
            <div style={styles.loadingBox}>
              <div style={styles.spinner} />
              <p style={styles.loadingText}>Loading {file.name}...</p>
            </div>
          ) : resolvedUrl ? (
            <div
              key={`${file.id}_${currentPage}`}
              style={{
                ...styles.slideTransitionWrapper,
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'center top',
              }}
            >
              {/* Native PDF / Document Viewport embedding */}
              <iframe
                src={`${resolvedUrl}#page=${currentPage}&view=FitH&toolbar=0`}
                title={`${file.name} - Page ${currentPage}`}
                style={styles.pdfIframe}
              />
            </div>
          ) : (
            /* Interactive Classroom Fallback Slide if no binary available */
            <div
              style={{
                ...styles.slideFallbackCard,
                transform: `scale(${zoomLevel / 100})`,
              }}
            >
              <div style={styles.fallbackHeader}>
                <div style={styles.fallbackDocBadge}>
                  {isPdf ? <FilePdfIcon size={16} /> : <FilePptIcon size={16} />}
                  <span>{file.name}</span>
                </div>
                <span style={styles.fallbackPageNum}>Slide {currentPage} of {totalPages}</span>
              </div>

              <div style={styles.fallbackBody}>
                <h3 style={styles.fallbackTopicTitle}>
                  {currentPage === 1
                    ? file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
                    : `Topic ${currentPage}: Core Principles & Lecture Notes`}
                </h3>
                <p style={styles.fallbackTopicDesc}>
                  {currentPage === 1
                    ? 'Unit Overview, Course Introduction, and Syllabus Topics'
                    : `Detailed notes, formulas, calculations, and lecture explanations for section ${currentPage}.`}
                </p>

                <div style={styles.fallbackContentGrid}>
                  <div style={styles.fallbackNoteCard}>
                    <strong>Key Concept {currentPage}.1</strong>
                    <p>Mathematical derivation, operational principles, and schematic diagrams.</p>
                  </div>
                  <div style={styles.fallbackNoteCard}>
                    <strong>Formulas & Parameters</strong>
                    <p>Governing equations, boundary conditions, and typical numerical values.</p>
                  </div>
                </div>
              </div>

              <div style={styles.fallbackFooter}>
                <span>Rad Classroom Document Viewer</span>
                <span>Slide {currentPage}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Slide Strip / Thumbnail Carousel (Google Classroom / Slides style) */}
      <footer style={styles.bottomSlideStrip}>
        <div style={styles.stripLabel}>
          <span>Slides</span>
        </div>
        <div style={styles.thumbnailsScrollArea}>
          {Array.from({ length: totalPages }).map((_, idx) => {
            const pageNum = idx + 1;
            const isSelected = pageNum === currentPage;
            return (
              <button
                key={pageNum}
                onClick={() => handlePageSelect(pageNum)}
                style={{
                  ...styles.thumbnailItem,
                  borderColor: isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.18)',
                  backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.18)' : '#000000',
                  boxShadow: isSelected ? '0 0 10px rgba(59, 130, 246, 0.4)' : 'none',
                }}
                title={`Jump to Page ${pageNum}`}
              >
                <div style={styles.thumbnailInner}>
                  <div style={styles.thumbMiniPage}>
                    <div style={styles.thumbLine1} />
                    <div style={styles.thumbLine2} />
                    <div style={styles.thumbLine3} />
                  </div>
                  <span
                    style={{
                      ...styles.thumbNumber,
                      color: isSelected ? '#f5f2eb' : '#8a857c',
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {pageNum}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 99999,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    userSelect: 'none',
  },
  viewerHeader: {
    height: '52px',
    backgroundColor: '#000000',
    borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    zIndex: 10,
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '240px',
    maxWidth: '40%',
  },
  closeBackBtn: {
    background: '#000000',
    border: '1.5px solid rgba(255, 255, 255, 0.25)',
    color: '#ececec',
    cursor: 'pointer',
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    transition: 'all 0.15s ease',
  },
  docTypeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    flexShrink: 0,
  },
  docTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#f7f4ed',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileSizeTag: {
    fontSize: '11px',
    color: '#847f77',
    flexShrink: 0,
  },
  headerCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: '4px 8px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
  },
  navArrowBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.15s ease',
  },
  pageIndicatorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    color: '#d4cfc5',
  },
  pageInput: {
    width: '42px',
    height: '24px',
    textAlign: 'center',
    backgroundColor: '#000000',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '4px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    outline: 'none',
  },
  pageTotalText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '12px',
    marginRight: '4px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '240px',
    justifyContent: 'flex-end',
  },
  zoomControlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: '3px 6px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
  },
  toolIconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#cfcac0',
    cursor: 'pointer',
    width: '26px',
    height: '26px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  zoomText: {
    fontSize: '11px',
    color: '#a39e94',
    minWidth: '36px',
    textAlign: 'center',
  },
  toolTextBtn: {
    background: '#000000',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: 'rgba(255, 255, 255, 0.8)',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: '4px',
  },
  downloadLinkBtn: {
    background: '#000000',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  mainCanvas: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  floatingSlideArrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 20,
    width: '54px',
    height: '54px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    border: '1.5px solid rgba(255, 255, 255, 0.25)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.8)',
    transition: 'all 0.2s ease',
    backdropFilter: 'blur(6px)',
  },
  floatingLeftArrow: {
    left: '24px',
  },
  floatingRightArrow: {
    right: '24px',
  },
  documentViewport: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    padding: '16px',
  },
  slideTransitionWrapper: {
    width: '90%',
    maxWidth: '920px',
    height: '92%',
    backgroundColor: '#000000',
    borderRadius: '10px',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.85)',
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    transition: 'transform 0.15s ease',
  },
  pdfIframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    backgroundColor: '#ffffff',
  },
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid #282723',
    borderTopColor: 'var(--accent-terracotta)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: '13px',
    color: '#a39e94',
    margin: 0,
  },
  slideFallbackCard: {
    width: '840px',
    height: '520px',
    backgroundColor: '#1a1917',
    border: '1px solid #33312b',
    borderRadius: '12px',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '32px 40px',
    transition: 'all 0.2s ease',
  },
  fallbackHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #2a2924',
    paddingBottom: '16px',
  },
  fallbackDocBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#f5f2eb',
  },
  fallbackPageNum: {
    fontSize: '12px',
    color: '#847f77',
    backgroundColor: '#22211d',
    padding: '3px 10px',
    borderRadius: '12px',
    border: '1px solid #33312b',
  },
  fallbackBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  fallbackTopicTitle: {
    fontSize: '22px',
    fontWeight: 600,
    fontFamily: 'serif',
    color: '#f7f4ed',
    margin: 0,
  },
  fallbackTopicDesc: {
    fontSize: '14px',
    color: '#a39e94',
    lineHeight: 1.5,
    margin: 0,
  },
  fallbackContentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginTop: '12px',
  },
  fallbackNoteCard: {
    backgroundColor: '#22211e',
    border: '1px solid #2e2d28',
    borderRadius: '8px',
    padding: '16px',
    fontSize: '12px',
    color: '#cfcac0',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fallbackFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#706b63',
    borderTop: '1px solid #2a2924',
    paddingTop: '14px',
  },
  bottomSlideStrip: {
    height: '84px',
    backgroundColor: '#000000',
    borderTop: '1px solid rgba(255, 255, 255, 0.15)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '16px',
    flexShrink: 0,
    overflow: 'hidden',
  },
  stripLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  thumbnailsScrollArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    overflowX: 'auto',
    padding: '8px 0',
  },
  thumbnailItem: {
    width: '68px',
    height: '52px',
    borderRadius: '6px',
    border: '1.5px solid',
    cursor: 'pointer',
    padding: '4px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  thumbnailInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
  },
  thumbMiniPage: {
    width: '28px',
    height: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '2px',
    padding: '0 3px',
  },
  thumbLine1: {
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: '1px',
    width: '80%',
  },
  thumbLine2: {
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: '1px',
    width: '60%',
  },
  thumbLine3: {
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: '1px',
    width: '90%',
  },
  thumbNumber: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.7)',
  },
};
