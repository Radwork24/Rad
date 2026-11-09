import React, { useState, useRef, useEffect, useMemo } from 'react';
import { compressImageDataUrl } from '../utils/imageUtils';
import { extractTextFromFile, isSupportedDocument, type ExtractedFile } from '../services/fileExtractService';
import type { ChatSession } from '../types/chat';
import type { UserProfile } from '../services/userService';
import { MarkdownView } from './MarkdownView';
import radLogo from '../assets/logo.png';
import {
  SidebarToggleIcon,
  ChevronDownIcon,
  PlusIcon,
  ArrowUpIcon,
  MicrophoneIcon,
  WaveformIcon,
  FilePdfIcon,
  FilePptIcon,
  BookOpenIcon,
  ReplyIcon,
  UserPlusIcon,
} from './Icons';
import { parseUserMessage, cleanChatTitle } from '../utils/messageParser';
import type { AttachedPage } from '../types/notebook';

interface ChatViewProps {
  chat: ChatSession;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  onSendMessage: (text: string, images?: string[]) => Promise<void>;
  onNewChat: () => void;
  attachedPages?: AttachedPage[];
  onRemoveAttachedPage?: (pageId: string) => void;
  currentUsername: string;
  allUsers?: UserProfile[];
  onInviteUser?: (targetUsername: string) => void;
  onStartCall?: (targetUsername: string) => void;
  pendingInviteUsernames?: string[];
}

export interface AttachedImagePreview {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
}

const USER_COLORS = [
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#d97757', // Terracotta
  '#06b6d4', // Cyan
];

const getUserColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[idx];
};

export const ChatView: React.FC<ChatViewProps> = ({
  chat,
  isSidebarOpen,
  onToggleSidebar,
  isRightSidebarOpen = false,
  onToggleRightSidebar,
  onSendMessage,
  attachedPages = [],
  onRemoveAttachedPage,
  currentUsername,
  allUsers = [],
  onInviteUser,
  pendingInviteUsernames = [],
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [pastedImages, setPastedImages] = useState<AttachedImagePreview[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [attachedDocuments, setAttachedDocuments] = useState<ExtractedFile[]>([]);
  const [isExtractingFile, setIsExtractingFile] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [activeQueryTurn, setActiveQueryTurn] = useState<number>(1);

  // Fixed-position tooltip for bubble navigator (bypasses overflow clipping)
  const [bubbleTooltip, setBubbleTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    turn: { turnNum: number; queryText: string; sender: string; attachedDocNames?: string[]; hasImages?: boolean } | null;
  }>({ visible: false, x: 0, y: 0, turn: null });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const isSubmittingRef = useRef(false);
  // Track streaming state so we don't auto-scroll to bottom during generation
  const isStreamingRef = useRef(false);
  const lastAiMsgIdRef = useRef<string | null>(null);

  // Extract numbered turns of user queries for quick bullet bubble jump & rich hover preview
  const queryTurns = useMemo(() => {
    const turns: {
      userMsgId: string;
      turnNum: number;
      sender: string;
      queryText: string;
      previewSnippet: string;
      attachedDocNames: string[];
      hasImages: boolean;
      createdAt: number;
    }[] = [];
    let count = 0;

    chat.messages.forEach((msg) => {
      if (msg.role === 'user') {
        count++;
        const parsed = parseUserMessage(msg.content);
        const clean = (parsed.cleanText || msg.content || '').trim();
        const docNames = parsed.attachedDocs.map((d) => d.fileName);

        turns.push({
          userMsgId: msg.id,
          turnNum: count,
          sender: msg.sender || (chat.creator ? chat.creator : currentUsername),
          queryText: clean,
          previewSnippet: clean || (docNames.length > 0 ? docNames[0] : `Query #${count}`),
          attachedDocNames: docNames,
          hasImages: Boolean(msg.images && msg.images.length > 0),
          createdAt: msg.createdAt,
        });
      }
    });

    return turns;
  }, [chat.messages, chat.creator, currentUsername]);

  const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
  const isAwaitingAi =
    isSending ||
    lastMsg?.role === 'user' ||
    (lastMsg?.role === 'assistant' && !lastMsg.content);

  // Count assistant messages so we know the latest response turn number
  const assistantMsgCount = useMemo(
    () => chat.messages.filter((m) => m.role === 'assistant').length,
    [chat.messages]
  );

  // When a NEW assistant message starts streaming, scroll to the top of that response.
  // After that, hold position — don't drag the user to the bottom with each chunk.
  useEffect(() => {
    const msgs = chat.messages;
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];

    if (last.role === 'assistant' && last.content) {
      // A new assistant message just started (or is continuing)
      if (last.id !== lastAiMsgIdRef.current) {
        // Brand-new streaming response — scroll its top into view
        lastAiMsgIdRef.current = last.id;
        isStreamingRef.current = true;
        stickToBottomRef.current = false;

        // Scroll to the start of this response turn
        const turnEl = document.getElementById(`response-turn-${assistantMsgCount}`);
        if (turnEl) {
          turnEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return; // Don't do anything else for this update
      }
      // Same assistant message still streaming — stay put (don't scroll)
      return;
    }

    // For non-streaming updates (user messages, loading state), only scroll if
    // the user was already at the bottom before sending.
    if (stickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [chat.messages, isAwaitingAi, assistantMsgCount]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    stickToBottomRef.current = isNearBottom;
    setShowScrollBottom(!isNearBottom);

    // Track which user query is currently active/visible in viewport
    if (queryTurns.length > 0) {
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      let currentActive = queryTurns[0].turnNum;

      for (let i = 0; i < queryTurns.length; i++) {
        const turn = queryTurns[i];
        const el = document.getElementById(`query-turn-${turn.turnNum}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= containerRect.top + 160) {
            currentActive = turn.turnNum;
          }
        }
      }
      setActiveQueryTurn(currentActive);
    }
  };

  const scrollToQuery = (turnNum: number) => {
    setActiveQueryTurn(turnNum);
    const element = document.getElementById(`query-turn-${turnNum}`);
    if (element) {
      stickToBottomRef.current = false;
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Trigger attention glow pulse on the jumped query bubble
      const bubbleEl = document.getElementById(`query-bubble-${turnNum}`) || element;
      bubbleEl.classList.remove('rad-query-pulse');
      void bubbleEl.offsetWidth; // Reflow
      bubbleEl.classList.add('rad-query-pulse');
      setTimeout(() => {
        bubbleEl.classList.remove('rad-query-pulse');
      }, 1800);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      stickToBottomRef.current = false;
      setShowScrollBottom(true);
    }
  };

  const scrollToBottom = () => {
    stickToBottomRef.current = true;
    setShowScrollBottom(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- Voice-to-text (Web Speech API) ---
  const toggleListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    // Stop if already listening
    if (isListening) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false; // simpler & more compatible on Safari
      recognition.continuous = false;     // single utterance mode — most reliable across browsers
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
          setInputMessage((prev) => (prev ? prev + ' ' + transcript.trim() : transcript.trim()));
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

  // Process files: images → preview tray; documents → text extraction
  const processImageFiles = async (files: FileList | File[]) => {
    console.log('📸 [Rad ChatView] Processing image files count:', files.length);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // ── Documents (DOCX / PPTX / XLSX / CSV / TXT / code / JSON) ──
      if (isSupportedDocument(file)) {
        console.log(`📄 [Rad ChatView] Extracting document: "${file.name}" (${file.type}, ${Math.round(file.size / 1024)} KB)`);
        setIsExtractingFile(true);
        const extracted = await extractTextFromFile(file);
        setIsExtractingFile(false);
        setAttachedDocuments((prev) => [...prev, extracted]);
        console.log(`✅ [Rad ChatView] Document extracted: "${file.name}" — ${extracted.charCount} chars${extracted.truncated ? ' (truncated)' : ''}`);
        continue;
      }

      // ── Images ──
      if (!file.type.startsWith('image/')) {
        console.warn('⚠️ [Rad ChatView] Skipping non-image file:', file.name, file.type);
        continue;
      }
      console.log(`📸 [Rad ChatView] Reading image file: "${file.name}" (${file.type}, ${Math.round(file.size / 1024)} KB)`);

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
            };
            setPastedImages((prev) => [...prev, imageItem]);
            console.log('✅ [Rad ChatView] Attached image added to preview tray:', imageItem.id, imageItem.name);
          } catch (compErr) {
            console.error('❌ [Rad ChatView] Compression error:', compErr);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Paste handler: allows pasting screenshots or copied images directly into input bar
  const handlePaste = (e: React.ClipboardEvent) => {
    console.log('📋 [Rad ChatView] Paste event captured on input bar');
    const files: File[] = [];

    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        files.push(e.clipboardData.files[i]);
      }
    }

    if (files.length === 0 && e.clipboardData?.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      console.log('📋 [Rad ChatView] Found', files.length, 'pasted image(s) in clipboard');
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
          if (e.clipboardData.files[i].type.startsWith('image/')) files.push(e.clipboardData.files[i]);
        }
      }
      if (files.length === 0 && e.clipboardData?.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          if (e.clipboardData.items[i].type.indexOf('image') !== -1) {
            const f = e.clipboardData.items[i].getAsFile();
            if (f) files.push(f);
          }
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        console.log('📋 [Rad ChatView] Global window paste captured', files.length, 'image(s)');
        processImageFiles(files);
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  // File picker handler via "+" button
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      console.log('📂 [Rad ChatView] File input selected', e.target.files.length, 'file(s)');
      processImageFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleRemoveImage = (id: string) => {
    console.log('🗑️ [Rad ChatView] Removing attached image:', id);
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
      console.log('📥 [Rad ChatView] Dropped', e.dataTransfer.files.length, 'file(s)');
      // Accept all file types — processImageFiles routes images vs documents internally
      processImageFiles(e.dataTransfer.files);
    }
  };

  const handleSend = async () => {
    if (isSubmittingRef.current) return;
    const hasInput = inputMessage.trim().length > 0;
    const hasAttachments = attachedPages.length > 0;
    const hasImages = pastedImages.length > 0;
    const hasDocs = attachedDocuments.length > 0;

    console.log('🚀 [Rad ChatView] handleSend triggered:', {
      hasInput,
      hasAttachments,
      hasImages,
      hasDocs,
      imagesCount: pastedImages.length,
      docsCount: attachedDocuments.length,
      isSending,
    });

    if ((!hasInput && !hasAttachments && !hasImages && !hasDocs) || isAwaitingAi) {
      console.warn('⚠️ [Rad ChatView] Cannot send: empty input or already waiting for AI.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSending(true);
    // Reset streaming guard — user is sending a new message so scroll-to-bottom
    // should follow normally until the AI response starts appearing.
    isStreamingRef.current = false;
    lastAiMsgIdRef.current = null;
    stickToBottomRef.current = true;
    setShowScrollBottom(false);

    let text = inputMessage.trim();
    if (hasAttachments) {
      const pageRefs = attachedPages
        .map((p) => `[Referenced Document Page: "${p.fileName}", Page ${p.pageNum} of ${p.totalPages}]`)
        .join('\n');
      text = text ? `${pageRefs}\n\n${text}` : `${pageRefs}\n\nPlease analyze and explain this attached document page picture.`;
    } else if (!text && hasImages && !hasDocs) {
      text = 'Please analyze this attached image.';
    } else if (!text && hasDocs && !hasImages) {
      text = 'Please analyze the attached file(s).';
    } else if (!text && hasDocs && hasImages) {
      text = 'Please analyze the attached file(s) and image(s).';
    }

    // Collect images from attached PDF pages, pasted images, AND embedded document images/screenshots
    const pageImages = attachedPages
      .map((p) => p.imageDataUrl)
      .filter((url): url is string => Boolean(url));
    const docEmbeddedImages = attachedDocuments
      .flatMap((doc) => doc.images || []);

    const imageUrls = [
      ...pageImages,
      ...pastedImages.map((img) => img.dataUrl),
      ...docEmbeddedImages,
    ];

    // Append extracted text from PDF notebook pages
    const extractedTextSections = attachedPages
      .filter((p) => p.extractedText && p.extractedText.trim().length > 0)
      .map((p) => `[Text from "${p.fileName}", Page ${p.pageNum}]:\n${p.extractedText}`)
      .join('\n\n');

    if (extractedTextSections) {
      text = text ? `${text}\n\n${extractedTextSections}` : extractedTextSections;
    }

    // Inject extracted document content (DOCX / PPTX / XLSX / CSV / TXT / code)
    if (hasDocs) {
      const docSections = attachedDocuments
        .map((doc) => {
          const typeLabel = doc.fileType.toUpperCase();
          return `--- BEGIN DOCUMENT CONTENT: "${doc.fileName}" (${typeLabel}) ---\n${doc.extractedText}\n--- END DOCUMENT CONTENT ---`;
        })
        .join('\n\n');

      const userText = inputMessage.trim();
      text = userText
        ? `${docSections}\n\nUser Question about the above document: ${userText}`
        : `${docSections}\n\nPlease thoroughly analyze, explain, and summarize the contents of the document provided above.`;
      console.log(`📄 [Rad ChatView] Injecting ${attachedDocuments.length} extracted doc(s) into message (${docSections.length} chars, ${docEmbeddedImages.length} embedded images)`);
    }

    console.log('📤 [Rad ChatView] Submitting message to onSendMessage:', {
      text: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
      imageUrlsCount: imageUrls.length,
      pdfPageImagesCount: pageImages.length,
      docCount: attachedDocuments.length,
    });

    setInputMessage('');
    setPastedImages([]);
    setAttachedDocuments([]);

    try {
      await onSendMessage(text, imageUrls);
      console.log('✅ [Rad ChatView] onSendMessage completed successfully.');
    } catch (sendErr) {
      console.error('❌ [Rad ChatView] onSendMessage failed:', sendErr);
    } finally {
      isSubmittingRef.current = false;
      setIsSending(false);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  };

  return (
    <div style={styles.chatViewWrapper}>
      <style>{`
        @keyframes micPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.18)} }

        @keyframes responsePulseGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
            border-radius: 12px;
          }
          25% {
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7), 0 0 24px rgba(255, 255, 255, 0.35);
            background-color: rgba(255, 255, 255, 0.04);
            border-radius: 12px;
          }
          100% {
            box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
            background-color: transparent;
            border-radius: 12px;
          }
        }
        .rad-response-pulse {
          animation: responsePulseGlow 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes queryPulseGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
          }
          25% {
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8), 0 0 24px rgba(255, 255, 255, 0.4);
            background-color: rgba(255, 255, 255, 0.05);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
            background-color: transparent;
          }
        }
        .rad-query-pulse {
          animation: queryPulseGlow 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        /* Floating Vertical Water-Droplet Bullet Dock - No outer outline, seamless floating */
        .rad-droplet-dock {
          position: absolute;
          right: 18px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 6px 4px;
          background: transparent;
          border: none;
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          z-index: 35;
          max-height: calc(100% - 160px);
          overflow-y: auto;
          scrollbar-width: none;
        }
        .rad-droplet-dock::-webkit-scrollbar {
          display: none;
        }

        .rad-bubble-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Droplet Bubble - Completely transparent background with glowing white outline */
        .rad-drop-bubble {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 
            0 0 6px rgba(255, 255, 255, 0.15),
            inset 0 0 4px rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          color: rgba(255, 255, 255, 0.72);
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
          transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
          user-select: none;
          outline: none;
          padding: 0;
          position: relative;
        }

        .rad-drop-bubble:hover {
          transform: scale(1.18);
          color: #ffffff;
          border-color: #ffffff;
          box-shadow: 
            0 0 12px rgba(255, 255, 255, 0.8),
            0 0 20px rgba(255, 255, 255, 0.35),
            inset 0 0 6px rgba(255, 255, 255, 0.35);
        }

        /* Selected / Active State - Pure Glowing White, Zero Orange */
        .rad-drop-bubble.active {
          background: transparent;
          border: 1.5px solid #ffffff;
          color: #ffffff;
          box-shadow: 
            0 0 14px rgba(255, 255, 255, 0.95),
            0 0 28px rgba(255, 255, 255, 0.5),
            inset 0 0 8px rgba(255, 255, 255, 0.45);
          transform: scale(1.12);
          text-shadow: 0 0 8px rgba(255, 255, 255, 0.9);
        }

        .rad-bubble-sheen {
          position: absolute;
          top: 3px;
          left: 6px;
          width: 9px;
          height: 4px;
          border-radius: 50%;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0) 100%);
          pointer-events: none;
        }

        .rad-bubble-num {
          position: relative;
          z-index: 2;
          font-family: inherit;
          line-height: 1;
        }

        .rad-bubble-tooltip {
          position: absolute;
          right: 44px;
          top: 50%;
          transform: translateY(-50%) translateX(6px);
          background: rgba(14, 14, 16, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 11.5px;
          color: #ece8df;
          width: 270px;
          max-width: 320px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.16s ease, transform 0.16s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.8), 0 0 16px rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 60;
          text-align: left;
        }

        .rad-bubble-wrapper:hover .rad-bubble-tooltip {
          opacity: 1;
          transform: translateY(-50%) translateX(0);
        }

        .rad-bubble-tooltip::after {
          content: '';
          position: absolute;
          right: -5px;
          top: 50%;
          transform: translateY(-50%) rotate(45deg);
          width: 8px;
          height: 8px;
          background: rgba(14, 14, 16, 0.96);
          border-right: 1px solid rgba(255, 255, 255, 0.16);
          border-top: 1px solid rgba(255, 255, 255, 0.16);
        }

        .rad-bubble-tooltip-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
          padding-bottom: 5px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .rad-bubble-tooltip-title {
          font-weight: 700;
          color: #ffffff;
          font-size: 11px;
          letter-spacing: -0.2px;
        }

        .rad-bubble-tooltip-sender {
          font-size: 10.5px;
          color: rgba(255, 255, 255, 0.5);
          font-weight: 500;
        }

        .rad-bubble-tooltip-text {
          color: rgba(255, 255, 255, 0.85);
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.45;
          font-size: 12px;
          word-break: break-word;
        }

        .rad-bubble-tooltip-docs {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
          padding-top: 5px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 10.5px;
          color: rgba(160, 200, 255, 0.95);
        }

        .rad-bubble-tooltip-hint {
          display: block;
          font-size: 9.5px;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 6px;
          text-align: right;
        }

        @media (max-width: 680px) {
          .rad-droplet-dock {
            display: none;
          }
        }
      `}</style>
      {/* Top Header */}
      <header style={styles.topHeader}>
        <div style={styles.headerLeft}>
          {!isSidebarOpen && (
            <button
              onClick={onToggleSidebar}
              style={styles.iconBtn}
              title="Open sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}

          {/* Conversation Title Dropdown */}
          <button style={styles.titleDropdownBtn}>
            <span style={styles.chatTitleText}>{cleanChatTitle(chat.title)}</span>
            <ChevronDownIcon size={13} />
          </button>

          {/* Collaborative Participants Badge & Avatar Stack */}
          {chat.participants && chat.participants.length > 1 && (
            <div
              style={styles.participantsBadge}
              title={`Participants: ${chat.participants.join(', ')}`}
            >
              <div style={styles.avatarStack}>
                {chat.participants.slice(0, 3).map((p) => {
                  const pInitial = p.charAt(0).toUpperCase();
                  const pColor = getUserColor(p);
                  return (
                    <div
                      key={p}
                      style={{
                        ...styles.stackAvatar,
                        backgroundColor: pColor,
                      }}
                      title={p}
                    >
                      {pInitial}
                    </div>
                  );
                })}
              </div>
              <span style={styles.participantsCountText}>
                {chat.participants.length} in chat
              </span>
            </div>
          )}


        </div>

        <div style={styles.headerCenter} />

        {/* Right Action: Share button and Users sidebar toggle */}
        <div style={styles.headerRight}>

          {!isRightSidebarOpen && onToggleRightSidebar && (
            <button
              onClick={onToggleRightSidebar}
              style={{ ...styles.iconBtn, marginLeft: '6px' }}
              title="Open sidebar"
              aria-label="Open sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Scrollable Conversation Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        style={styles.scrollArea}
      >
        <div style={styles.messagesContainer}>
          {(() => {
            let assistantTurnCount = 0;
            let queryTurnCount = 0;
            return chat.messages.map((msg) => {
            // 1. System Invite / Join Notification Message
            if (msg.sender === 'system' || msg.id.startsWith('msg_invite_')) {
              return (
                <div key={msg.id} style={styles.systemInviteRow}>
                  <div style={styles.systemInviteCard}>
                    <div style={styles.systemInviteBody}>
                      <span style={styles.systemInviteHeading}>Collaborator Joined</span>
                      <p style={styles.systemInviteDesc}>
                        {msg.content.replace(/^🤝\s*/, '').replace(/\*\*/g, '')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            // 2. User Query Message
            if (msg.role === 'user') {
              queryTurnCount++;
              const turnNum = queryTurnCount;
              const senderName = msg.sender || (chat.creator ? chat.creator : currentUsername);
              const isSelf = senderName.toLowerCase().trim() === (currentUsername || '').toLowerCase().trim();
              const userProfile = allUsers?.find(
                (u) => u.username.toLowerCase().trim() === senderName.toLowerCase().trim()
              );
              const senderInitial = senderName.charAt(0).toUpperCase();
              const userColor = getUserColor(senderName);
              const parsed = parseUserMessage(msg.content);

              return (
                <div
                  key={msg.id}
                  id={`query-turn-${turnNum}`}
                  style={isSelf ? styles.userRowSelf : styles.userRowOther}
                >
                  {/* Sender Header Badge */}
                  <div style={isSelf ? styles.userHeaderSelf : styles.userHeaderOther}>
                    <div style={{ ...styles.userAvatarMini, backgroundColor: userColor }}>
                      {senderInitial}
                    </div>
                    <span style={styles.userNameBadge}>
                      {isSelf ? 'You' : senderName}
                    </span>
                    {!isSelf && (
                      <span style={styles.collaboratorChip}>Collaborator</span>
                    )}
                    {userProfile?.branch && (
                      <span style={styles.branchChip}>{userProfile.branch}</span>
                    )}
                    <span style={styles.messageTimeText}>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Query Bubble */}
                  <div
                    id={`query-bubble-${turnNum}`}
                    style={isSelf ? styles.userBubbleSelf : styles.userBubbleOther}
                  >
                    {/* Attached Images in user message */}
                    {msg.images && msg.images.length > 0 && (
                      <div style={styles.messageImagesRow}>
                        {msg.images.map((imgUrl, idx) => (
                          <div
                            key={idx}
                            style={styles.messageImageCard}
                            onClick={() => setPreviewModalImage(imgUrl)}
                            title="Click to view full image"
                          >
                            <img
                              src={imgUrl}
                              alt={`Attached screenshot ${idx + 1}`}
                              style={styles.messageImageThumb}
                            />
                            <div style={styles.imageZoomHint}>
                              <span>🔍 View</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Attached Document Chips in User Bubble */}
                    {parsed.attachedDocs.length > 0 && (
                      <div style={styles.bubbleAttachedDocsRow}>
                        {parsed.attachedDocs.map((doc, idx) => {
                          const isPdf = doc.fileType === 'PDF';
                          const isPpt = doc.fileType === 'PPT' || doc.fileType === 'PPTX';
                          const isDocx = doc.fileType === 'DOCX' || doc.fileType === 'DOC';

                          return (
                            <div key={idx} style={styles.bubbleDocChip} title={doc.fileName}>
                              <div
                                style={{
                                  ...styles.bubbleDocIconWrap,
                                  backgroundColor: isPdf
                                    ? 'rgba(239, 68, 68, 0.2)'
                                    : isPpt
                                    ? 'rgba(249, 115, 22, 0.2)'
                                    : isDocx
                                    ? 'rgba(59, 130, 246, 0.2)'
                                    : 'rgba(255, 255, 255, 0.1)',
                                  color: isPdf
                                    ? '#f87171'
                                    : isPpt
                                    ? '#fb923c'
                                    : isDocx
                                    ? '#60a5fa'
                                    : '#ffffff',
                                }}
                              >
                                {isPdf ? (
                                  <FilePdfIcon size={14} />
                                ) : isPpt ? (
                                  <FilePptIcon size={14} />
                                ) : (
                                  <BookOpenIcon size={14} />
                                )}
                              </div>
                              <div style={styles.bubbleDocInfo}>
                                <span style={styles.bubbleDocName}>{doc.fileName}</span>
                                <span style={styles.bubbleDocType}>
                                  {doc.pageNum ? `Page ${doc.pageNum} · ` : ''}
                                  {doc.fileType}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* User Prompt Text */}
                    {parsed.cleanText ? (
                      <div style={styles.bubblePromptText}>{parsed.cleanText}</div>
                    ) : parsed.attachedDocs.length === 0 ? (
                      <div style={styles.bubblePromptText}>{msg.content}</div>
                    ) : null}
                  </div>
                </div>
              );
            }

            // 3. AI Assistant Response Message
            assistantTurnCount++;
            const turnNum = assistantTurnCount;
            const replyTo = msg.replyToUser;
            const isReplyingToSelf =
              replyTo &&
              replyTo.toLowerCase().trim() === (currentUsername || '').toLowerCase().trim();

            return (
              <div
                key={msg.id}
                id={`response-turn-${turnNum}`}
                style={styles.assistantRow}
              >
                {/* AI Response Header with Rad symbol + Replying badge */}
                <div style={styles.assistantHeaderBar}>
                  <div style={styles.assistantHeaderLeft}>
                    <div style={styles.radAvatarCircle}>
                      <img src={radLogo} alt="Rad" style={styles.radAvatarImg} />
                    </div>
                    <span style={styles.radAiName}>Rad</span>

                    {/* Replying indicator badge near response bubble */}
                    {replyTo && (
                      <div
                        style={styles.replyIndicatorPill}
                        title={`Rad answered query asked by ${replyTo}`}
                      >
                        <ReplyIcon size={12} />
                        <span style={styles.replyToLabel}>Replying to</span>
                        <span
                          style={{
                            ...styles.replyMiniAvatar,
                            backgroundColor: getUserColor(replyTo),
                          }}
                        >
                          {replyTo.charAt(0).toUpperCase()}
                        </span>
                        <span style={styles.replyTargetName}>
                          {isReplyingToSelf ? 'You' : `@${replyTo}`}
                        </span>
                      </div>
                    )}
                  </div>

                  <span style={styles.modelTagPill}>Rad 1.1 Flash</span>
                </div>

                <div style={styles.assistantContent}>
                  {msg.content ? (
                    <MarkdownView content={msg.content} />
                  ) : (
                    <div style={styles.thinkingPill}>
                      <span style={styles.pulsingDot} />
                      <span>Rad is thinking...</span>
                    </div>
                  )}
                </div>
              </div>
            );
          });
        })()}

          {/* Loading indicator only if the very last message is a user message without an assistant placeholder */}
          {chat.messages.length > 0 &&
            chat.messages[chat.messages.length - 1].role === 'user' && (
              <div style={styles.assistantRow}>
                <div style={styles.thinkingPill}>
                  <span style={styles.pulsingDot} />
                  <span>Rad is thinking...</span>
                </div>
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          style={styles.scrollBottomBtn}
          title="Scroll to bottom"
        >
          ↓
        </button>
      )}

      {/* Floating Vertical Water-Droplet Bullet Navigator */}
      {queryTurns.length >= 1 && (
        <aside className="rad-droplet-dock" aria-label="Jump to query">
          {queryTurns.map((turn) => {
            const isActive = activeQueryTurn === turn.turnNum;
            return (
              <div key={turn.userMsgId} className="rad-bubble-wrapper">
                <button
                  type="button"
                  className={`rad-drop-bubble ${isActive ? 'active' : ''}`}
                  onClick={() => scrollToQuery(turn.turnNum)}
                  aria-label={`Jump to query #${turn.turnNum}: ${turn.previewSnippet}`}
                  onMouseEnter={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setBubbleTooltip({
                      visible: true,
                      x: rect.left,
                      y: rect.top + rect.height / 2,
                      turn: {
                        turnNum: turn.turnNum,
                        queryText: turn.queryText || '',
                        sender: turn.sender,
                        attachedDocNames: turn.attachedDocNames,
                        hasImages: turn.hasImages,
                      },
                    });
                  }}
                  onMouseLeave={() => setBubbleTooltip(prev => ({ ...prev, visible: false }))}
                >
                  <span className="rad-bubble-sheen" />
                  <span className="rad-bubble-num">{turn.turnNum}</span>
                </button>
              </div>
            );
          })}
        </aside>
      )}

      {/* Fixed-position bubble tooltip — renders outside overflow containers */}
      {bubbleTooltip.visible && bubbleTooltip.turn && (() => {
        const t = bubbleTooltip.turn;
        const isSelf = t.sender.toLowerCase().trim() === (currentUsername || '').toLowerCase().trim();
        const preview = t.queryText.length > 150 ? t.queryText.slice(0, 150) + '…' : t.queryText;
        return (
          <div
            style={{
              position: 'fixed',
              right: `calc(100vw - ${bubbleTooltip.x}px + 12px)`,
              top: bubbleTooltip.y,
              transform: 'translateY(-50%)',
              background: 'rgba(14, 14, 16, 0.97)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 11.5,
              color: '#ece8df',
              width: 270,
              pointerEvents: 'none',
              boxShadow: '0 12px 32px rgba(0,0,0,0.85), 0 0 16px rgba(255,255,255,0.05)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              zIndex: 99999,
              textAlign: 'left',
            }}
          >
            {/* Arrow pointing right */}
            <div style={{
              position: 'absolute',
              right: -5,
              top: '50%',
              transform: 'translateY(-50%) rotate(45deg)',
              width: 8,
              height: 8,
              background: 'rgba(14,14,16,0.97)',
              borderRight: '1px solid rgba(255,255,255,0.16)',
              borderTop: '1px solid rgba(255,255,255,0.16)',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontWeight: 700, color: '#fff', fontSize: 11, letterSpacing: -0.2 }}>Query {t.turnNum}</span>
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                {isSelf ? 'You' : `@${t.sender}`}
              </span>
            </div>

            <span style={{ color: 'rgba(255,255,255,0.85)', display: 'block', lineHeight: 1.45, fontSize: 12, wordBreak: 'break-word' }}>
              {preview || `Query #${t.turnNum}`}
            </span>

            {t.attachedDocNames && t.attachedDocNames.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10.5, color: 'rgba(160,200,255,0.95)' }}>
                <span>📄 {t.attachedDocNames[0]}</span>
                {t.attachedDocNames.length > 1 && <span>+{t.attachedDocNames.length - 1} more</span>}
              </div>
            )}

            {t.hasImages && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10.5, color: 'rgba(160,200,255,0.95)' }}>
                <span>🖼️ Image attached</span>
              </div>
            )}


          </div>
        );
      })()}

      {/* Docked Bottom Chat Input Bar */}
      <div style={styles.bottomBarContainer}>
        {/* Hidden File Picker — accepts images AND all document types */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt,.md,.json,.py,.js,.ts,.jsx,.tsx,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.swift,.kt,.dart,.sql,.sh,.yml,.yaml,.toml,.html,.htm,.css,.xml"
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

        {/* Extracted Document Files Chips (DOCX / PPTX / XLSX / CSV / TXT / code) */}
        {(attachedDocuments.length > 0 || isExtractingFile) && (
          <div style={styles.attachedPagesBar}>
            {isExtractingFile && (
              <div style={{ ...styles.attachedPageChip, opacity: 0.7 }}>
                <span style={{ fontSize: '14px' }}>⏳</span>
                <span style={styles.attachedPageText}>Extracting file…</span>
              </div>
            )}
            {attachedDocuments.map((doc, idx) => {
              const icon = doc.fileType === 'pdf' ? '📕'
                : doc.fileType === 'docx' ? '📝'
                : doc.fileType === 'pptx' ? '📊'
                : (doc.fileType === 'xlsx' || doc.fileType === 'csv') ? '📋'
                : doc.fileType === 'json' ? '🔧'
                : doc.fileType === 'code' ? '💻'
                : '📄';
              return (
                <div key={idx} style={styles.attachedPageChip} title={`${doc.charCount.toLocaleString()} characters extracted${doc.truncated ? ' (truncated)' : ''}`}>
                  <span style={{ fontSize: '13px', flexShrink: 0 }}>{icon}</span>
                  <span style={styles.attachedPageText}>
                    {doc.fileName}
                    {doc.truncated && <span style={{ color: 'var(--accent-terracotta)', marginLeft: '4px' }}>✂</span>}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAttachedDocuments((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    style={styles.removeChipBtn}
                    title="Remove file"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pasted / Uploaded Image Previews Tray */}
        {pastedImages && pastedImages.length > 0 && (
          <div style={styles.imagesPreviewTray}>
            {pastedImages.map((img) => (
              <div key={img.id} style={styles.imageThumbnailCard} title={img.name}>
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  style={styles.thumbnailImg}
                />
                <div style={styles.thumbnailOverlay}>
                  <span style={styles.thumbnailNameText}>{img.name}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage(img.id);
                  }}
                  style={styles.removeImageBtn}
                  title="Remove image"
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            ...styles.inputCard,
            ...(isDraggingOver ? styles.inputCardDragging : {}),
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={styles.plusBtn}
            title="Attach image or content"
            aria-label="Attach file"
          >
            <PlusIcon size={16} />
          </button>

          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isListening
                ? '🎙 Listening... speak now'
                : attachedDocuments.length > 0
                ? `Ask anything about ${attachedDocuments.map((d) => d.fileName).join(', ')}...`
                : pastedImages.length > 0
                ? 'Ask anything about this image...'
                : attachedPages.length > 0
                ? 'Ask a question about the attached page(s)...'
                : 'Write a message... (Paste or drop images, docs, code here)'
            }
            rows={1}
            style={{
              ...styles.inputField,
              ...(isListening ? { borderColor: 'rgba(239,68,68,0.4)', boxShadow: '0 0 0 2px rgba(239,68,68,0.1)' } : {}),
            }}
          />

          <div style={styles.inputActions}>
            <button
              style={{
                ...styles.actionIconBtn,
                backgroundColor: isListening ? 'rgba(239, 68, 68, 0.15)' : undefined,
                color: isListening ? '#ef4444' : undefined,
                animation: isListening ? 'micPulse 1.2s ease-in-out infinite' : undefined,
              }}
              title={isListening ? 'Stop recording' : 'Dictate message'}
              onClick={toggleListening}
            >
              <MicrophoneIcon size={16} />
            </button>
            <button style={styles.actionIconBtn} title="Voice mode">
              <WaveformIcon size={16} />
            </button>

            {/* Send Button */}
            {(() => {
              const canSend = (inputMessage.trim().length > 0 || attachedPages.length > 0 || pastedImages.length > 0 || attachedDocuments.length > 0) && !isAwaitingAi;
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
                  title={canSend ? 'Send message' : 'Type a message or paste an image to send'}
                  aria-label="Send message"
                >
                  <ArrowUpIcon size={15} />
                </button>
              );
            })()}
          </div>
        </div>

        {/* Subtext Disclaimer & Model */}
        <div style={styles.footerSubtextRow}>
          <span style={styles.disclaimerText}>
            Rad is AI and can make mistakes. Please double-check responses.
          </span>
          <span style={styles.modelTagText}>Rad 1.1 Flash</span>
        </div>
      </div>

      {/* In-Chat Invite Collaborator Modal */}
      {showInviteModal && onInviteUser && (
        <div style={styles.modalOverlay} onClick={() => setShowInviteModal(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitleGroup}>
                <div style={styles.modalIconWrap}>
                  <UserPlusIcon size={18} />
                </div>
                <div>
                  <h3 style={styles.modalHeading}>Invite to this Chat</h3>
                  <span style={styles.modalChatSub}>"{chat.title}"</span>
                </div>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              <p style={styles.modalDesc}>
                They'll get a notification in their bell icon. The chat is shared only after they accept.
              </p>

              <div style={styles.modalUserList}>
                {allUsers
                  .filter(
                    (u) =>
                      u.username.toLowerCase().trim() !==
                      (currentUsername || '').toLowerCase().trim()
                  )
                  .map((u) => {
                    const inChat = (chat.participants || []).some(
                      (p) => p.toLowerCase().trim() === u.username.toLowerCase().trim()
                    );
                    const isPending = pendingInviteUsernames.some(
                      (name) => name.toLowerCase().trim() === u.username.toLowerCase().trim()
                    );
                    const color = getUserColor(u.username);
                    return (
                      <div key={u.username} style={styles.modalUserRow}>
                        <div style={styles.modalUserLeft}>
                          <div
                            style={{
                              ...styles.modalUserAvatar,
                              backgroundColor: color,
                            }}
                          >
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span style={styles.modalUserName}>{u.username}</span>
                            <span style={styles.modalUserBranch}>
                              {u.branch || 'B.Tech'}
                            </span>
                          </div>
                        </div>

                        {inChat ? (
                          <div style={styles.alreadyInChatPill}>In Chat ✓</div>
                        ) : isPending ? (
                          <div style={styles.alreadyInChatPill}>Pending</div>
                        ) : (
                          <button
                            onClick={() => {
                              onInviteUser(u.username);
                              setShowInviteModal(false);
                            }}
                            style={styles.modalInviteBtn}
                          >
                            <UserPlusIcon size={12} />
                            <span>Invite</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Fullscreen Preview for Clicked Chat Images */}
      {previewModalImage && (
        <div style={styles.lightboxOverlay} onClick={() => setPreviewModalImage(null)}>
          <div style={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <img src={previewModalImage} alt="Fullscreen preview" style={styles.lightboxImg} />
            <button
              onClick={() => setPreviewModalImage(null)}
              style={styles.lightboxCloseBtn}
              title="Close preview"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  chatViewWrapper: {
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-main)',
    position: 'relative',
    overflow: 'hidden',
  },
  topHeader: {
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    borderBottom: '1px solid transparent',
    zIndex: 10,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
    overflow: 'hidden',
  },
  iconBtn: {
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px',
    borderRadius: '6px',
  },
  titleDropdownBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#ece8df',
    fontSize: '13.5px',
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: '6px',
    maxWidth: '300px',
  },
  chatTitleText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  participantsBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '9999px',
    padding: '2.5px 10px',
    fontSize: '11px',
    marginLeft: '6px',
    flexShrink: 0,
  },
  avatarStack: {
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '4px',
  },
  stackAvatar: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    fontSize: '9px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: 'transparent',
    marginLeft: '-5px',
    border: '1.5px solid rgba(255, 255, 255, 0.4)',
  },
  participantsCountText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: 500,
  },
  headerInviteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#2f2f2f',
    border: '1px solid var(--border-medium)',
    borderRadius: '6px',
    color: '#ececec',
    padding: '3px 9px',
    fontSize: '11.5px',
    fontWeight: 500,
    cursor: 'pointer',
    marginLeft: '6px',
    transition: 'all 0.15s ease',
  },
  headerCallBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    border: '1px solid rgba(59, 130, 246, 0.35)',
    borderRadius: '6px',
    color: '#60a5fa',
    padding: '3px 9px',
    fontSize: '11.5px',
    fontWeight: 500,
    cursor: 'pointer',
    marginLeft: '6px',
    transition: 'all 0.15s ease',
  },
  headerCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#2f2f2f',
    border: '1px solid var(--border-medium)',
    borderRadius: '9999px',
    padding: '3.5px 10px',
    fontSize: '12px',
  },
  closeBannerBtn: {
    color: '#8e8e8e',
    fontSize: '10px',
    marginLeft: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  shareBtn: {
    backgroundColor: '#2f2f2f',
    border: '1px solid var(--border-medium)',
    color: '#ececec',
    fontSize: '13px',
    fontWeight: 500,
    padding: '5px 14px',
    borderRadius: '7px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, color 0.15s',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 20px 140px',
  },
  messagesContainer: {
    maxWidth: '760px',
    width: '100%',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  systemInviteRow: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    margin: '8px 0',
  },
  systemInviteCard: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(120, 180, 255, 0.25)',
    borderRadius: '9999px',
    padding: '6px 18px',
    boxShadow: '0 0 12px rgba(100, 160, 255, 0.18), inset 0 1px 0 rgba(255,255,255,0.06)',
  },
  systemInviteBody: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  systemInviteHeading: {
    fontSize: '11.5px',
    fontWeight: 600,
    color: 'rgba(140, 190, 255, 0.9)',
    whiteSpace: 'nowrap',
  },
  systemInviteDesc: {
    fontSize: '11.5px',
    color: 'rgba(200, 210, 230, 0.65)',
    margin: 0,
    lineHeight: 1.4,
  },
  userRowSelf: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    width: '100%',
    gap: '5px',
  },
  userRowOther: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: '100%',
    gap: '5px',
  },
  userHeaderSelf: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingRight: '4px',
  },
  userHeaderOther: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingLeft: '4px',
  },
  userAvatarMini: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10.5px',
    fontWeight: 700,
    color: '#ffffff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  userNameBadge: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#ffffff',
  },
  collaboratorChip: {
    fontSize: '9.5px',
    fontWeight: 600,
    color: 'var(--accent-terracotta)',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    padding: '1px 6px',
    borderRadius: '6px',
    letterSpacing: '0.02em',
  },
  branchChip: {
    fontSize: '10.5px',
    color: 'var(--text-secondary)',
  },
  messageTimeText: {
    fontSize: '10.5px',
    color: 'var(--text-muted)',
    marginLeft: '2px',
  },
  userBubbleSelf: {
    backgroundColor: '#212121',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    borderRadius: '18px 18px 4px 18px',
    padding: '12px 18px',
    fontSize: '14.5px',
    lineHeight: '1.5',
    maxWidth: '82%',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  userBubbleOther: {
    backgroundColor: '#171717',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderLeft: '3px solid var(--accent-terracotta)',
    color: '#ffffff',
    borderRadius: '18px 18px 18px 4px',
    padding: '12px 18px',
    fontSize: '14.5px',
    lineHeight: '1.5',
    maxWidth: '82%',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  bubbleAttachedDocsRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '8px',
  },
  bubbleDocChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px 12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  bubbleDocIconWrap: {
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubbleDocInfo: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
  },
  bubbleDocName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  bubbleDocType: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: 600,
    letterSpacing: '0.03em',
  },
  bubblePromptText: {
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  assistantRow: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    padding: '4px 0',
    scrollMarginTop: '72px',
    transition: 'background-color 0.4s ease, box-shadow 0.4s ease',
  },
  assistantHeaderBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: '8px',
  },
  assistantHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  radAvatarCircle: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255, 255, 255, 0.35)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  radAvatarImg: {
    width: '18px',
    height: '18px',
    objectFit: 'contain',
    display: 'block',
  },
  radAiName: {
    fontSize: '14px',
    fontWeight: 650,
    color: '#ffffff',
  },
  replyIndicatorPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    backgroundColor: '#262626',
    border: '1px solid #2f2d27',
    borderRadius: '12px',
    padding: '2px 8px',
    fontSize: '11px',
    color: '#a6a197',
  },
  replyToLabel: {
    color: '#7a756c',
  },
  replyMiniAvatar: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '8.5px',
    fontWeight: 700,
    color: '#ffffff',
  },
  replyTargetName: {
    color: 'var(--accent-terracotta)',
    fontWeight: 600,
  },
  modelTagPill: {
    fontSize: '11px',
    color: '#6e6a62',
    backgroundColor: '#1a1917',
    border: '1px solid #282723',
    borderRadius: '6px',
    padding: '2px 6px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalBox: {
    backgroundColor: '#1f1e1b',
    border: '1px solid #33312a',
    borderRadius: '14px',
    width: '92%',
    maxWidth: '460px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.55)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #2c2b26',
  },
  modalTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  modalIconWrap: {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    backgroundColor: '#272622',
    border: '1px solid #3a3831',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-terracotta)',
  },
  modalHeading: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#f5f2eb',
    margin: 0,
  },
  modalChatSub: {
    fontSize: '11.5px',
    color: '#948f86',
    display: 'block',
    maxWidth: '240px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: '#847f77',
    fontSize: '15px',
    cursor: 'pointer',
    padding: '4px',
  },
  modalBody: {
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
  },
  modalDesc: {
    fontSize: '12px',
    color: '#948f86',
    lineHeight: 1.45,
    margin: 0,
  },
  modalUserList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '6px',
    maxHeight: '260px',
    overflowY: 'auto',
  },
  modalUserRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#262420',
    border: '1px solid #33312a',
    borderRadius: '8px',
  },
  modalUserLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  modalUserAvatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
    color: '#ffffff',
  },
  modalUserName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#f5f2eb',
    display: 'block',
  },
  modalUserBranch: {
    fontSize: '11px',
    color: '#8c887e',
    display: 'block',
  },
  alreadyInChatPill: {
    fontSize: '11px',
    color: '#10b981',
    fontWeight: 500,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: '3px 8px',
    borderRadius: '12px',
    border: '1px solid rgba(16, 185, 129, 0.25)',
  },
  modalInviteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 500,
    padding: '5px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  assistantContent: {
    width: '100%',
    lineHeight: 1.6,
  },
  thinkingPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#9c978e',
    fontSize: '13.5px',
  },
  pulsingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-terracotta)',
    animation: 'pulse 1.2s infinite ease-in-out',
  },
  scrollBottomBtn: {
    position: 'absolute',
    bottom: '95px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#242320',
    border: '1px solid #36342e',
    color: '#aba69c',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    zIndex: 15,
  },
  bottomBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '0 20px 14px',
    backgroundColor: 'linear-gradient(to top, var(--bg-main) 80%, transparent)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: 20,
  },
  attachedPagesBar: {
    maxWidth: '760px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  attachedPageChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#272622',
    border: '1px solid #3c3932',
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
  inputCard: {
    maxWidth: '760px',
    width: '100%',
    backgroundColor: '#212121',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '28px',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  inputCardDragging: {
    borderColor: 'var(--accent-terracotta)',
    backgroundColor: '#2a2a2a',
    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.35)',
  },
  imagesPreviewTray: {
    maxWidth: '760px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '8px',
    padding: '2px 0',
  },
  imageThumbnailCard: {
    position: 'relative',
    width: '60px',
    height: '60px',
    borderRadius: '10px',
    overflow: 'hidden',
    backgroundColor: '#161513',
    border: '1px solid #3d3b36',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.35)',
    flexShrink: 0,
    cursor: 'pointer',
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
    padding: '2px 3px',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(3px)',
    overflow: 'hidden',
  },
  thumbnailNameText: {
    display: 'block',
    fontSize: '8.5px',
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
    width: '17px',
    height: '17px',
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
    transition: 'background-color 0.15s',
  },
  messageImagesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  messageImageCard: {
    position: 'relative',
    width: '140px',
    height: '140px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--bg-main)',
    cursor: 'zoom-in',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    transition: 'transform 0.15s, border-color 0.15s',
  },
  messageImageThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  imageZoomHint: {
    position: 'absolute',
    bottom: '4px',
    right: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '6px',
    padding: '2px 6px',
    fontSize: '10px',
    color: '#f0ede6',
    backdropFilter: 'blur(3px)',
  },
  lightboxOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px',
  },
  lightboxContent: {
    position: 'relative',
    maxWidth: '90vw',
    maxHeight: '90vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImg: {
    maxWidth: '100%',
    maxHeight: '85vh',
    borderRadius: '12px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
    objectFit: 'contain',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: '-36px',
    right: 0,
    background: '#2b2a26',
    border: '1px solid #4a473e',
    color: '#ffffff',
    borderRadius: '50%',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '13px',
  },
  plusBtn: {
    color: '#8c887e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: '50%',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  inputField: {
    flex: 1,
    fontSize: '14.5px',
    color: 'var(--text-primary)',
    lineHeight: '1.4',
    resize: 'none',
    maxHeight: '120px',
    minHeight: '24px',
  },
  inputActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    position: 'relative' as const,
    zIndex: 3,
    flexShrink: 0,
  },
  actionIconBtn: {
    color: '#8c887e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px',
    borderRadius: '6px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    zIndex: 2,
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
    marginLeft: '2px',
  },
  footerSubtextRow: {
    maxWidth: '760px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '8px',
    fontSize: '11.5px',
    color: '#6e6a62',
  },
  disclaimerText: {
    color: '#6e6a62',
  },
  modelTagText: {
    color: '#706c64',
    fontWeight: 450,
  },
};
