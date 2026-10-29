import React, { useState, useRef, useEffect } from 'react';
import { compressImageDataUrl } from '../utils/imageUtils';
import { getTimeGreeting, type TimeGreeting } from '../utils/greetingUtils';
import radLogo from '../assets/logo.png';
import {
  SidebarToggleIcon,
  PlusIcon,
  ArrowUpIcon,
  MicrophoneIcon,
  WaveformIcon,
  WriteIcon,
  LearnIcon,
  CodeIcon,
  CoffeeIcon,
  LightbulbIcon,
  FilePdfIcon,
  FilePptIcon,
} from './Icons';
import type { AttachedPage } from '../types/notebook';

interface DashboardProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  onSubmitPrompt?: (text: string, modelName: string, images?: string[]) => void;
  username?: string;
  attachedPages?: AttachedPage[];
  onRemoveAttachedPage?: (pageId: string) => void;
}

export interface AttachedImagePreview {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
  isPdf?: boolean;
}

const MODELS = [
  { id: 'Rad 1.1 Flash', name: 'Rad 1.1 Flash', tag: 'Rad', desc: 'Ultra-fast Rad 1.1 Flash model — multimodal, built for speed and precision.' },
];

const SUGGESTIONS = [
  { id: 'write', label: 'Write', icon: WriteIcon, prompt: 'Help me draft a clear, persuasive proposal for ' },
  { id: 'learn', label: 'Learn', icon: LearnIcon, prompt: 'Explain how distributed systems achieve consensus like I am 5' },
  { id: 'code', label: 'Code', icon: CodeIcon, prompt: 'Write a clean TypeScript utility for ' },
  { id: 'life', label: 'Life stuff', icon: CoffeeIcon, prompt: 'Help me plan a productive 3-day weekend routine' },
  { id: 'choice', label: "Rad's choice", icon: LightbulbIcon, prompt: 'Surprise me with a fascinating historical fact and its lesson' },
];

export const Dashboard: React.FC<DashboardProps> = ({
  isSidebarOpen,
  onToggleSidebar,
  isRightSidebarOpen = true,
  onToggleRightSidebar,
  onSubmitPrompt,
  username,
  attachedPages = [],
  onRemoveAttachedPage,
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel] = useState(MODELS[0]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [pastedImages, setPastedImages] = useState<AttachedImagePreview[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [greeting] = useState<TimeGreeting>(() => getTimeGreeting());

  const formattedName = username
    ? username.charAt(0).toUpperCase() + username.slice(1)
    : 'there';

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const toggleListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        console.log('[Mic] Recognition started');
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript || '';
        console.log('[Mic] Got result:', transcript);
        if (transcript) {
          setPrompt((prev) => (prev ? prev + ' ' + transcript.trim() : transcript.trim()));
        }
      };

      recognition.onerror = (event: any) => {
        console.error('[Mic] Error:', event.error, event.message);
        setIsListening(false);
        recognitionRef.current = null;
        if (event.error === 'not-allowed') {
          const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
          if (isSafari) {
            alert(
              'Microphone access blocked by Safari or macOS.\n\nTo enable voice dictation in Safari:\n1. Open Mac System Settings → Privacy & Security → Microphone, and ensure Safari is toggled ON.\n2. Open Mac System Settings → Keyboard → Dictation, and turn Dictation ON.\n\nTip: You can also open Rad in Google Chrome or Edge where voice dictation works directly.'
            );
          } else {
            alert('Microphone permission denied. Please allow microphone access in your browser settings.');
          }
        }
      };

      recognition.onend = () => {
        console.log('[Mic] Recognition ended');
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.start();
      console.log('[Mic] recognition.start() called');
    } catch (err) {
      console.error('[Mic] Failed to start recognition:', err);
      setIsListening(false);
    }
  };

  const handleSuggestionClick = (text: string) => {
    setPrompt(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  // Process image & PDF files with compression and add them to preview state
  const processImageFiles = async (files: FileList | File[]) => {
    console.log('📸 [Rad Dashboard] Processing files count:', files.length);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImage = file.type.startsWith('image/');

      if (!isImage && !isPdf) {
        console.warn('⚠️ [Rad Dashboard] Skipping non-image/non-pdf file:', file.name, file.type);
        continue;
      }

      if (isPdf) {
        console.log(`📄 [Rad Dashboard] Reading PDF file: "${file.name}" (${Math.round(file.size / 1024)} KB)`);
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          const rawDataUrl = loadEvent.target?.result as string;
          if (rawDataUrl) {
            const pdfItem: AttachedImagePreview = {
              id: 'pdf_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
              name: file.name,
              dataUrl: rawDataUrl,
              size: file.size,
              isPdf: true,
            };
            setPastedImages((prev) => [...prev, pdfItem]);
            console.log('✅ [Rad Dashboard] Attached PDF added to preview tray:', pdfItem.id, pdfItem.name);
          }
        };
        reader.readAsDataURL(file);
      } else {
        console.log(`📸 [Rad Dashboard] Reading image file: "${file.name}" (${file.type}, ${Math.round(file.size / 1024)} KB)`);
        const reader = new FileReader();
        reader.onload = async (loadEvent) => {
          const rawDataUrl = loadEvent.target?.result as string;
          if (rawDataUrl) {
            try {
              const compressedDataUrl = await compressImageDataUrl(rawDataUrl);
              const imageItem: AttachedImagePreview = {
                id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                name: file.name && file.name !== 'image.png' ? file.name : `Pasted Image`,
                dataUrl: compressedDataUrl,
                size: compressedDataUrl.length,
                isPdf: false,
              };
              setPastedImages((prev) => [...prev, imageItem]);
              console.log('✅ [Rad Dashboard] Attached image added to preview tray:', imageItem.id, imageItem.name);
            } catch (compErr) {
              console.error('❌ [Rad Dashboard] Compression error:', compErr);
            }
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Paste handler: allows pasting screenshots, images, or PDFs directly into input bar
  const handlePaste = (e: React.ClipboardEvent) => {
    console.log('📋 [Rad Dashboard] Paste event captured on input bar');
    const files: File[] = [];

    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        const file = e.clipboardData.files[i];
        if (file.type.startsWith('image/') || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          files.push(file);
        }
      }
    }

    if (files.length === 0 && e.clipboardData?.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.type.indexOf('image') !== -1 || item.type.indexOf('pdf') !== -1) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      console.log('📋 [Rad Dashboard] Found', files.length, 'pasted file(s) in clipboard');
      processImageFiles(files);
    }
  };

  // Global window paste listener: fires ONLY when textarea is NOT focused (avoids double-fire)
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      // If the textarea itself is focused, the inline onPaste handler already handles it — skip here
      if (activeEl === textareaRef.current) return;
      // Skip if any other input/textarea that is not ours is focused
      if (activeEl && activeEl !== textareaRef.current && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }
      const files: File[] = [];
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        for (let i = 0; i < e.clipboardData.files.length; i++) {
          const file = e.clipboardData.files[i];
          if (file.type.startsWith('image/') || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            files.push(file);
          }
        }
      }
      if (files.length === 0 && e.clipboardData?.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.type.indexOf('image') !== -1 || item.type.indexOf('pdf') !== -1) {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        console.log('📋 [Rad Dashboard] Global window paste captured', files.length, 'file(s)');
        processImageFiles(files);
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  // File picker handler via "+" button
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      console.log('📂 [Rad Dashboard] File input selected', e.target.files.length, 'file(s)');
      processImageFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleRemoveImage = (id: string) => {
    console.log('🗑️ [Rad Dashboard] Removing attached image:', id);
    setPastedImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Drag and drop image files onto input bar
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      console.log('📥 [Rad Dashboard] Dropped', e.dataTransfer.files.length, 'file(s)');
      processImageFiles(e.dataTransfer.files);
    }
  };

  const handleSend = () => {
    const hasPrompt = prompt.trim().length > 0;
    const hasAttachments = attachedPages.length > 0;
    const hasImages = pastedImages.length > 0;

    console.log('🚀 [Rad Dashboard] handleSend button clicked:', {
      hasPrompt,
      hasAttachments,
      hasImages,
      imagesCount: pastedImages.length,
      model: selectedModel.id,
    });

    if (hasPrompt || hasAttachments || hasImages) {
      let text = prompt.trim();
      if (hasAttachments) {
        const pageRefs = attachedPages
          .map((p) => `[Referenced Document Page: "${p.fileName}", Page ${p.pageNum} of ${p.totalPages}]`)
          .join('\n');
        text = text ? `${pageRefs}\n\n${text}` : `${pageRefs}\n\nPlease analyze and explain this attached document page picture.`;
      } else if (!text && hasImages) {
        const hasPdf = pastedImages.some((img) => img.isPdf || img.dataUrl.startsWith('data:application/pdf'));
        text = hasPdf ? 'Please analyze this attached PDF document.' : 'Please analyze this attached image.';
      }

      // Collect images from BOTH attached PDF pages AND pasted images
      const pageImages = attachedPages
        .map((p) => p.imageDataUrl)
        .filter((url): url is string => Boolean(url));

      const imageUrls = [...pageImages, ...pastedImages.map((img) => img.dataUrl)];

      // Append extracted text if present for enhanced multi-modal accuracy
      const extractedTextSections = attachedPages
        .filter((p) => p.extractedText && p.extractedText.trim().length > 0)
        .map((p) => `[Text from "${p.fileName}", Page ${p.pageNum}]:\n${p.extractedText}`)
        .join('\n\n');

      if (extractedTextSections) {
        text = text ? `${text}\n\n${extractedTextSections}` : extractedTextSections;
      }

      console.log('📤 [Rad Dashboard] Submitting query to onSubmitPrompt:', {
        text,
        model: selectedModel.id,
        imageUrlsCount: imageUrls.length,
        pdfPageImagesCount: pageImages.length,
      });

      setPrompt('');
      setPastedImages([]);
      if (onSubmitPrompt) {
        onSubmitPrompt(text, selectedModel.id, imageUrls);
      }
    } else {
      console.warn('⚠️ [Rad Dashboard] handleSend called but input is empty and no attachments/images.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <main style={styles.dashboardContainer}>
      <style>{`@keyframes micPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.18)} }`}</style>
      {/* Top Bar Navigation */}
      <header style={styles.topBar}>
        <div style={styles.topBarLeft}>
          {!isSidebarOpen && (
            <button
              onClick={onToggleSidebar}
              style={styles.sidebarOpenBtn}
              title="Open sidebar"
              aria-label="Open sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}
        </div>

        <div style={styles.topBarCenter} />

        {/* Right Sidebar Toggle (Profile icon removed as requested) */}
        <div style={styles.topBarRight}>
          {!isRightSidebarOpen && onToggleRightSidebar && (
            <button
              onClick={onToggleRightSidebar}
              style={styles.sidebarOpenBtn}
              title="Open sidebar"
              aria-label="Open sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content Center Area */}
      <div style={styles.centerSection}>
        {/* Hero Greeting */}
        <div style={styles.heroContainer}>
          <div style={styles.heroLogoWrapper}>
            <img src={radLogo} alt="Rad" style={styles.dashboardHeroLogo} />
          </div>
          <h1 style={styles.greetingTitle}>
            {greeting.salutation}, <span style={styles.greetingName}>{formattedName}</span>
          </h1>
          {greeting.motivationalNote && (
            <p style={styles.greetingSubtitle}>{greeting.motivationalNote}</p>
          )}
        </div>

        {/* Chat Input Container */}
        <div
          style={{
            ...styles.inputCard,
            ...(isDraggingOver ? styles.inputCardDragging : {}),
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Hidden File Input for Image & PDF Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            multiple
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />

          {/* Attached Document Pages Chips from Floating Viewer */}
          {attachedPages && attachedPages.length > 0 && (
            <div style={styles.attachedPagesBar}>
              {attachedPages.map((page) => (
                <div key={page.id} style={styles.attachedPageChip}>
                  {page.imageDataUrl ? (
                    <img
                      src={page.imageDataUrl}
                      alt={`Page ${page.pageNum}`}
                      style={{
                        width: '18px',
                        height: '22px',
                        objectFit: 'cover',
                        borderRadius: '3px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                      }}
                    />
                  ) : (
                    <div style={styles.attachedPageIcon}>
                      {page.fileType === 'pdf' ? <FilePdfIcon size={12} /> : <FilePptIcon size={12} />}
                    </div>
                  )}
                  <span style={styles.attachedPageText}>
                    {page.fileName} · Page {page.pageNum}
                  </span>
                  {onRemoveAttachedPage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveAttachedPage(page.id);
                      }}
                      style={styles.removeChipBtn}
                      title="Remove attached page"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pasted / Uploaded Image & PDF Previews Tray */}
          {pastedImages && pastedImages.length > 0 && (
            <div style={styles.imagesPreviewTray}>
              {pastedImages.map((img) => {
                const isPdf = img.isPdf || img.dataUrl.startsWith('data:application/pdf') || img.name.toLowerCase().endsWith('.pdf');
                return (
                  <div key={img.id} style={isPdf ? styles.pdfThumbnailCard : styles.imageThumbnailCard} title={img.name}>
                    {isPdf ? (
                      <div style={styles.pdfThumbnailContent}>
                        <div style={styles.pdfIconBadge}>
                          <FilePdfIcon size={20} />
                        </div>
                        <div style={styles.pdfMetaInfo}>
                          <span style={styles.pdfNameText}>{img.name}</span>
                          <span style={styles.pdfSizeText}>{Math.round(img.size / 1024)} KB · PDF</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          style={styles.thumbnailImg}
                        />
                        <div style={styles.thumbnailOverlay}>
                          <span style={styles.thumbnailNameText}>{img.name}</span>
                        </div>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage(img.id);
                      }}
                      style={styles.removeImageBtn}
                      title="Remove file"
                      aria-label="Remove file"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              pastedImages.length > 0
                ? "Ask anything about this image..."
                : attachedPages.length > 0
                ? "Ask a question about the attached page(s)..."
                : "How can I help you today? (Paste or drop images here)"
            }
            style={styles.textarea}
            rows={2}
          />

          {/* Bottom Controls Row inside Input Card */}
          <div style={styles.inputBottomBar}>
            {/* Left Controls: Plus + [Chat | Cowork] */}
            <div style={styles.leftControls}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={styles.plusBtn}
                title="Attach image or content"
                aria-label="Attach file"
              >
                <PlusIcon size={16} />
              </button>
            </div>

            {/* Right Controls: Model Selector + Mic + Waveform */}
            <div style={styles.rightControls}>
              {/* Active AI Model Indicator */}
              <div
                style={styles.modelSelectorBtn}
                title="Rad 1.1 Flash"
              >
                <span>{selectedModel.name}</span>
              </div>

              {/* Microphone Button */}
              <button
                onClick={toggleListening}
                style={{
                  ...styles.actionIconBtn,
                  backgroundColor: isListening ? 'rgba(239, 68, 68, 0.15)' : undefined,
                  color: isListening ? '#ef4444' : '#8c887e',
                  animation: isListening ? 'micPulse 1.2s ease-in-out infinite' : undefined,
                }}
                title={isListening ? 'Stop recording' : 'Voice dictation'}
              >
                <MicrophoneIcon size={16} />
              </button>

              {/* Voice Waveform Button */}
              <button
                onClick={() => setIsVoiceActive((prev) => !prev)}
                style={{
                  ...styles.actionIconBtn,
                  color: isVoiceActive ? 'var(--accent-upgrade)' : '#8c887e',
                }}
                title={isVoiceActive ? 'Voice mode on' : 'Voice mode'}
              >
                <WaveformIcon size={16} />
              </button>

              {/* Send Query Button */}
              {(() => {
                const canSend = prompt.trim().length > 0 || attachedPages.length > 0 || pastedImages.length > 0;
                return (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!canSend}
                    style={{
                      ...styles.sendBtn,
                      backgroundColor: canSend ? 'var(--accent-terracotta)' : '#383838',
                      color: canSend ? '#ffffff' : '#676767',
                      cursor: canSend ? 'pointer' : 'default',
                      opacity: canSend ? 1 : 0.65,
                    }}
                    title={canSend ? 'Send query' : 'Type a query or paste an image to send'}
                    aria-label="Send query"
                  >
                    <ArrowUpIcon size={15} />
                  </button>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Suggestion Quick Action Pills */}
        <div style={styles.suggestionsRow}>
          {SUGGESTIONS.map((item) => {
            const IconComponent = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleSuggestionClick(item.prompt)}
                style={styles.suggestionPill}
              >
                <IconComponent size={14} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', color: '#ece8df' }}>
                Upgrade to Rad Pro
              </span>
              <button
                onClick={() => setShowUpgradeModal(false)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>
            <p style={{ color: '#9c978e', fontSize: '14px', margin: '12px 0 20px', lineHeight: 1.5 }}>
              Level up with Rad Opus, higher usage limits, prioritized access during peak traffic, and preview access to new features.
            </p>
            <div style={styles.modalPlanCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#f5f2eb' }}>Pro Plan</span>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#ece8df' }}>$20 <span style={{ fontSize: '13px', fontWeight: 400, color: '#948f85' }}>/ month</span></span>
              </div>
              <ul style={styles.modalFeaturesList}>
                <li>✓ 5x more usage compared to Free tier</li>
                <li>✓ Access to Rad 3.5 Sonnet & Rad 3 Opus</li>
                <li>✓ Create and share Projects & Artifacts</li>
                <li>✓ Priority access during high-volume periods</li>
              </ul>
            </div>
            <button
              onClick={() => {
                alert('Upgrade flow initiated!');
                setShowUpgradeModal(false);
              }}
              style={styles.modalUpgradeBtn}
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

const styles: Record<string, React.CSSProperties> = {
  dashboardContainer: {
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-main)',
    position: 'relative',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    height: '60px',
    width: '100%',
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    width: '120px',
  },
  sidebarOpenBtn: {
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    borderRadius: '6px',
    transition: 'color 0.15s, background-color 0.15s',
  },
  topBarCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  planBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'var(--bg-pill)',
    border: '1px solid var(--border-medium)',
    borderRadius: '9999px',
    padding: '4px 12px',
    fontSize: '12.5px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
  },
  planText: {
    color: 'var(--text-secondary)',
    fontWeight: 450,
  },
  planDot: {
    color: 'var(--text-muted)',
  },
  upgradeLink: {
    color: 'var(--accent-upgrade)',
    fontWeight: 500,
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '120px',
  },
  ghostBtn: {
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    borderRadius: '6px',
    transition: 'color 0.15s',
  },
  centerSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 20px 80px',
    maxWidth: '760px',
    width: '100%',
    margin: '0 auto',
  },
  heroContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '28px',
    textAlign: 'center',
  },
  heroLogoWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '18px',
  },
  dashboardHeroLogo: {
    height: '96px',
    width: 'auto',
    maxHeight: '120px',
    objectFit: 'contain',
    display: 'block',
    filter: 'drop-shadow(0 6px 28px rgba(59, 130, 246, 0.45)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.9))',
    transition: 'transform 0.2s ease',
  },
  greetingTitle: {
    fontFamily: 'var(--font-sans)',
    fontSize: '32px',
    fontWeight: 500,
    color: '#ffffff',
    letterSpacing: '-0.5px',
    lineHeight: 1.2,
    textShadow: '0 0 30px rgba(255, 255, 255, 0.28), 0 0 2px rgba(255, 255, 255, 0.7)',
  },
  greetingName: {
    color: '#ffffff',
  },
  greetingSubtitle: {
    fontFamily: 'var(--font-sans)',
    fontSize: '14.5px',
    fontWeight: 400,
    color: '#8e8e8e',
    letterSpacing: '0.1px',
    margin: 0,
    lineHeight: 1.4,
    maxWidth: '540px',
  },
  inputCard: {
    width: '100%',
    backgroundColor: '#212121',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '28px',
    padding: '16px 18px 12px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 35px rgba(0, 0, 0, 0.7)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  inputCardDragging: {
    borderColor: 'var(--accent-terracotta)',
    backgroundColor: '#2a2a2a',
    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.35)',
  },
  imagesPreviewTray: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '12px',
    padding: '2px 0',
  },
  pdfThumbnailCard: {
    position: 'relative',
    height: '68px',
    minWidth: '140px',
    maxWidth: '240px',
    borderRadius: '12px',
    backgroundColor: '#1c1b18',
    border: '1px solid #4a3830',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    padding: '0 28px 0 12px',
    gap: '8px',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.15s ease',
  },
  pdfThumbnailContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    overflow: 'hidden',
  },
  pdfIconBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    flexShrink: 0,
  },
  pdfMetaInfo: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  pdfNameText: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#f0ede6',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pdfSizeText: {
    fontSize: '10px',
    color: '#8a857b',
  },
  imageThumbnailCard: {
    position: 'relative',
    width: '68px',
    height: '68px',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#161513',
    border: '1px solid #3d3b36',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
    flexShrink: 0,
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.15s ease',
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  thumbnailOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '2px 4px',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(4px)',
    overflow: 'hidden',
  },
  thumbnailNameText: {
    display: 'block',
    fontSize: '9px',
    color: '#e4dfd5',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
  },
  removeImageBtn: {
    position: 'absolute',
    top: '3px',
    right: '3px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    fontSize: '9px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
    transition: 'background-color 0.15s, transform 0.1s',
  },
  attachedPagesBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '10px',
  },
  attachedPageChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#2b2a26',
    border: '1px solid #3c3a33',
    borderRadius: '16px',
    padding: '4px 10px',
    fontSize: '12px',
    color: '#f0ede6',
  },
  attachedPageIcon: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--accent-terracotta)',
  },
  attachedPageText: {
    fontWeight: 500,
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  removeChipBtn: {
    background: 'transparent',
    border: 'none',
    color: '#8e8a80',
    cursor: 'pointer',
    padding: '0 2px',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
  },
  textarea: {
    width: '100%',
    minHeight: '68px',
    resize: 'none',
    fontSize: '15px',
    color: 'var(--text-primary)',
    lineHeight: '1.5',
    caretColor: '#f5f2eb',
  },
  inputBottomBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '8px',
    borderTop: '1px solid transparent',
  },
  leftControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  plusBtn: {
    color: '#8e8a80',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    transition: 'color 0.15s, background-color 0.15s',
  },
  modeToggleGroup: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#171717',
    border: '1px solid var(--border-subtle)',
    borderRadius: '9999px',
    padding: '2px',
  },
  modeTab: {
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12.5px',
    transition: 'all 0.15s ease',
  },
  rightControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  modelSelectorBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '9999px',
    color: '#cfcbbe',
    fontSize: '12.5px',
    fontWeight: 450,
    transition: 'background-color 0.15s',
  },
  actionIconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    borderRadius: '6px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    zIndex: 2,
    transition: 'color 0.15s, background-color 0.15s',
  },
  sendBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    transition: 'background-color 0.15s, color 0.15s, opacity 0.15s, transform 0.1s',
    border: 'none',
  },
  modelMenu: {
    position: 'absolute',
    bottom: '40px',
    right: 0,
    width: '290px',
    backgroundColor: '#1e1d1a',
    border: '1px solid var(--border-medium)',
    borderRadius: '12px',
    padding: '6px',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
    zIndex: 60,
  },
  modelMenuHeader: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#837f76',
    padding: '6px 10px',
  },
  modelMenuItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: '8px',
    transition: 'background-color 0.15s',
  },
  modelMenuInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '100%',
  },
  modelMenuNameRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  modelTag: {
    fontSize: '10.5px',
    padding: '1px 6px',
    borderRadius: '9999px',
    backgroundColor: '#2b2a26',
    color: 'var(--accent-upgrade)',
  },
  modelMenuDesc: {
    fontSize: '11.5px',
    color: '#8a857b',
  },
  suggestionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '18px',
  },
  suggestionPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'var(--bg-pill)',
    border: '1px solid var(--border-medium)',
    borderRadius: '9999px',
    padding: '7px 16px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontWeight: 450,
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '20px',
  },
  modalContent: {
    backgroundColor: '#212121',
    border: '1px solid var(--border-medium)',
    borderRadius: '16px',
    padding: '28px',
    maxWidth: '480px',
    width: '100%',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalCloseBtn: {
    color: '#8e8e8e',
    fontSize: '16px',
    padding: '4px',
  },
  modalPlanCard: {
    backgroundColor: '#2f2f2f',
    border: '1px solid var(--border-medium)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
  },
  modalFeaturesList: {
    listStyle: 'none',
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    color: '#cfcbbe',
    fontSize: '13px',
  },
  modalUpgradeBtn: {
    width: '100%',
    backgroundColor: 'var(--accent-terracotta)',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '14px',
    padding: '12px',
    borderRadius: '10px',
    transition: 'background-color 0.15s',
  },
};
