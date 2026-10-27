import React, { useState, useRef, useEffect } from 'react';
import { compressImageDataUrl } from '../utils/imageUtils';
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
  ReplyIcon,
  UserPlusIcon,
} from './Icons';
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
  isRightSidebarOpen = true,
  onToggleRightSidebar,
  onSendMessage,
  attachedPages = [],
  onRemoveAttachedPage,
  currentUsername,
  allUsers = [],
  onInviteUser,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [pastedImages, setPastedImages] = useState<AttachedImagePreview[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
  const isAwaitingAi =
    isSending ||
    lastMsg?.role === 'user' ||
    (lastMsg?.role === 'assistant' && !lastMsg.content);

  // Auto-scroll to bottom on new messages or when waiting for AI
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages, isAwaitingAi]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    setShowScrollBottom(!isNearBottom);
  };

  const scrollToBottom = () => {
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

  // Process image files with compression and add them to preview tray
  const processImageFiles = async (files: FileList | File[]) => {
    console.log('📸 [Rad ChatView] Processing image files count:', files.length);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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
        const file = e.clipboardData.files[i];
        if (file.type.startsWith('image/')) files.push(file);
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
      processImageFiles(e.dataTransfer.files);
    }
  };

  const handleSend = async () => {
    const hasInput = inputMessage.trim().length > 0;
    const hasAttachments = attachedPages.length > 0;
    const hasImages = pastedImages.length > 0;

    console.log('🚀 [Rad ChatView] handleSend triggered:', {
      hasInput,
      hasAttachments,
      hasImages,
      imagesCount: pastedImages.length,
      isSending,
    });

    if ((!hasInput && !hasAttachments && !hasImages) || isAwaitingAi) {
      console.warn('⚠️ [Rad ChatView] Cannot send: empty input or already waiting for AI.');
      return;
    }

    let text = inputMessage.trim();
    if (hasAttachments) {
      const pageRefs = attachedPages
        .map((p) => `[Referenced Document Page: "${p.fileName}", Page ${p.pageNum} of ${p.totalPages}]`)
        .join('\n');
      text = text ? `${pageRefs}\n\n${text}` : `${pageRefs}\n\nPlease analyze and explain this attached document page picture.`;
    } else if (!text && hasImages) {
      text = 'Please analyze this attached image.';
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

    console.log('📤 [Rad ChatView] Submitting message to onSendMessage:', {
      text,
      imageUrlsCount: imageUrls.length,
      pdfPageImagesCount: pageImages.length,
    });

    setInputMessage('');
    setPastedImages([]);
    setIsSending(true);

    try {
      await onSendMessage(text, imageUrls);
      console.log('✅ [Rad ChatView] onSendMessage completed successfully.');
    } catch (sendErr) {
      console.error('❌ [Rad ChatView] onSendMessage failed:', sendErr);
    } finally {
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
      <style>{`@keyframes micPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.18)} }`}</style>
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
            <span style={styles.chatTitleText}>{chat.title}</span>
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
        style={styles.scrollArea}
      >
        <div style={styles.messagesContainer}>
          {chat.messages.map((msg) => {
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
              const senderName = msg.sender || (chat.creator ? chat.creator : currentUsername);
              const isSelf = senderName.toLowerCase().trim() === (currentUsername || '').toLowerCase().trim();
              const userProfile = allUsers?.find(
                (u) => u.username.toLowerCase().trim() === senderName.toLowerCase().trim()
              );
              const senderInitial = senderName.charAt(0).toUpperCase();
              const userColor = getUserColor(senderName);

              return (
                <div
                  key={msg.id}
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
                  <div style={isSelf ? styles.userBubbleSelf : styles.userBubbleOther}>
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
                    {msg.content}
                  </div>
                </div>
              );
            }

            // 3. AI Assistant Response Message
            const replyTo = msg.replyToUser;
            const isReplyingToSelf =
              replyTo &&
              replyTo.toLowerCase().trim() === (currentUsername || '').toLowerCase().trim();

            return (
              <div key={msg.id} style={styles.assistantRow}>
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
          })}

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

      {/* Docked Bottom Chat Input Bar */}
      <div style={styles.bottomBarContainer}>
        {/* Hidden File Picker for Image Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
                : pastedImages.length > 0
                ? 'Ask anything about this image...'
                : attachedPages.length > 0
                ? 'Ask a question about the attached page(s)...'
                : 'Write a message... (Paste or drop images here)'
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
              const canSend = (inputMessage.trim().length > 0 || attachedPages.length > 0 || pastedImages.length > 0) && !isAwaitingAi;
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
                The invited user will get access to this full chat history with Rad AI in their Shared Contents, and can ask questions alongside you in real time.
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
  assistantRow: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    padding: '4px 0',
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
