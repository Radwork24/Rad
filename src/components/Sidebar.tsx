import React, { useState, useRef, useEffect } from 'react';
import {
  SidebarToggleIcon,
  PlusIcon,
  NotebooksIcon,
  SharedIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TrashIcon,
} from './Icons';

import type { ChatSession } from '../types/chat';
import type { UserProfile } from '../services/userService';
import { LoadingHint, SkeletonList } from './LoadingState';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => Promise<void> | void;
  activeView?: 'dashboard' | 'notebooks' | 'shared' | 'artifacts';
  onSelectView?: (view: 'dashboard' | 'notebooks' | 'shared' | 'artifacts') => void;
  onLogout?: () => void;
  userProfile?: UserProfile | null;
  onOpenContactUs?: () => void;
  isLoadingChats?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  onNewChat,
  chats,
  activeChatId,
  onSelectChat,
  onDeleteChat,
  activeView = 'dashboard',
  onSelectView,
  onLogout,
  userProfile,
  onOpenContactUs,
  isLoadingChats = false,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isChatsExpanded, setIsChatsExpanded] = useState(true);
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<ChatSession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && chatToDelete && !isDeleting) {
        setChatToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatToDelete, isDeleting]);

  const handleConfirmDelete = async () => {
    if (!chatToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      if (onDeleteChat) {
        await onDeleteChat(chatToDelete.id);
      }
      setChatToDelete(null);
    } catch (err) {
      console.error('Failed to delete chat:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // IDE-style dynamic resizing
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('rad_left_sidebar_width');
      return saved ? parseInt(saved, 10) : 260;
    } catch {
      return 260;
    }
  });
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(180, Math.min(moveEvent.clientX, 520));
      setWidth(newWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const finalWidth = Math.max(180, Math.min(upEvent.clientX, 520));
      try {
        localStorage.setItem('rad_left_sidebar_width', finalWidth.toString());
      } catch (err) {
        console.warn('Could not save sidebar width:', err);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDoubleClick = () => {
    setWidth(260);
    try {
      localStorage.setItem('rad_left_sidebar_width', '260');
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <aside
      style={{
        ...styles.sidebar,
        width: `${width}px`,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        transition: isResizing ? 'none' : 'width 0.2s ease, transform 0.2s ease',
      }}
    >
      {/* IDE-Style Splitter Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className={`ide-resize-handle ide-resize-handle-left ${isResizing ? 'active' : ''}`}
        title="Drag to resize (Double-click to reset)"
      />
      {/* Top Header */}
      <div style={styles.header}>
        <button
          onClick={onToggle}
          style={styles.toggleBtn}
          title="Close sidebar"
          aria-label="Close sidebar"
        >
          <SidebarToggleIcon size={18} />
        </button>
        <div
          style={{ ...styles.brandWrapper, cursor: 'pointer' }}
          onClick={() => {
            onNewChat();
            if (onSelectView) onSelectView('dashboard');
          }}
          title="Return to Dashboard"
        >
          <span style={styles.brandTitle}>Rad</span>
        </div>
      </div>

      {/* Navigation Group */}
      <div style={styles.navSection}>
        {/* + New Button */}
        <button
          onClick={() => {
            onNewChat();
            if (onSelectView) onSelectView('dashboard');
          }}
          style={{
            ...styles.navItem,
            ...styles.newChatBtn,
            backgroundColor:
              activeChatId === null && activeView === 'dashboard'
                ? '#212121'
                : 'transparent',
          }}
        >
          <span style={styles.navIconWrapper}>
            <PlusIcon size={15} />
          </span>
          <span>New</span>
        </button>

        {/* Notebooks */}
        <button
          onClick={() => {
            if (onSelectView) onSelectView('notebooks');
          }}
          style={{
            ...styles.navItem,
            backgroundColor: activeView === 'notebooks' ? '#212121' : 'transparent',
            color: activeView === 'notebooks' ? '#ffffff' : 'var(--text-secondary)',
            fontWeight: activeView === 'notebooks' ? 500 : 450,
          }}
        >
          <span style={styles.navIconWrapper}>
            <NotebooksIcon size={16} />
          </span>
          <span>Notebooks</span>
        </button>

        {/* Shared Contents */}
        <button
          onClick={() => {
            if (onSelectView) onSelectView('shared');
          }}
          style={{
            ...styles.navItem,
            backgroundColor: activeView === 'shared' ? '#212121' : 'transparent',
            color: activeView === 'shared' ? '#ffffff' : 'var(--text-secondary)',
            fontWeight: activeView === 'shared' ? 500 : 450,
          }}
        >
          <span style={styles.navIconWrapper}>
            <SharedIcon size={16} />
          </span>
          <span>Shared Contents</span>
        </button>
      </div>

      {/* Chats and tasks section */}
      <div style={styles.chatsHeader}>
        <button
          onClick={() => setIsChatsExpanded((prev) => !prev)}
          style={{
            ...styles.chatsTitleBtn,
            cursor: 'pointer',
          }}
          title={isChatsExpanded ? 'Collapse chats and tasks' : 'Expand chats and tasks'}
        >
          <span>Chats and tasks</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              transform: isChatsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <ChevronRightIcon size={12} />
          </span>
          {!isLoadingChats && chats.length > 0 && (
            <span style={{ fontSize: '11px', color: '#706c64', marginLeft: '4px' }}>
              {chats.length}
            </span>
          )}
        </button>
      </div>

      {/* Chat list area */}
      {isChatsExpanded ? (
        <div style={styles.chatListScrollArea}>
          {isLoadingChats ? (
            <>
              <LoadingHint label="Loading chats" compact />
              <SkeletonList rows={6} variant="chat" />
            </>
          ) : chats.length === 0 ? (
            <div style={styles.emptyChatsBox}>
              <span style={styles.emptyChatsText}>No recent chats</span>
            </div>
          ) : (
            chats.map((chat) => {
              const isSelected = activeChatId === chat.id;
              const isHovered = hoveredChatId === chat.id;

              return (
                <div
                  key={chat.id}
                  onMouseEnter={() => setHoveredChatId(chat.id)}
                  onMouseLeave={() => setHoveredChatId(null)}
                  onClick={() => {
                    onSelectChat(chat.id);
                    if (onSelectView) onSelectView('dashboard');
                  }}
                  style={{
                    ...styles.chatHistoryItem,
                    backgroundColor: isSelected
                      ? '#212121'
                      : isHovered
                      ? '#171717'
                      : 'transparent',
                    color: isSelected ? '#ffffff' : '#b4b4b4',
                    fontWeight: isSelected ? 500 : 400,
                  }}
                  title={chat.title}
                >
                  <div style={styles.chatItemLeft}>
                    <span style={styles.chatBullet}>○</span>
                    <span style={styles.chatItemTitle}>{chat.title}</span>
                  </div>

                  {(isHovered || isSelected) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setChatToDelete(chat);
                      }}
                      className="rad-chat-delete-btn"
                      style={styles.deleteChatBtn}
                      title="Delete conversation"
                      aria-label={`Delete conversation ${chat.title}`}
                    >
                      <TrashIcon size={13} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Bottom User Profile Section */}
      <div style={styles.profileContainer}>
        <div style={styles.profileRow}>
          <button
            onClick={() => setShowProfileMenu((prev) => !prev)}
            style={styles.userInfoBtn}
          >
            <div style={styles.avatar}>
              {userProfile ? userProfile.username.charAt(0).toUpperCase() : 'M'}
            </div>
            <span style={styles.userName}>
              {userProfile ? userProfile.username : 'mohit'}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                transform: showProfileMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <ChevronDownIcon size={13} />
            </span>
          </button>
        </div>

        {/* Interactive Profile Popup */}
        {showProfileMenu && (
          <div style={styles.profilePopup}>
            <div style={styles.popupHeader}>
              <div style={styles.popupAvatar}>
                {userProfile ? userProfile.username.charAt(0).toUpperCase() : 'M'}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#ece8df' }}>
                  {userProfile ? userProfile.username : 'Mohit'}
                </div>
                {userProfile?.stream && (
                  <div style={{ fontSize: '11px', color: '#8c8880' }}>
                    {userProfile.branch
                      ? `${userProfile.stream} · ${userProfile.branch}`
                      : userProfile.stream}
                  </div>
                )}
              </div>
            </div>
            <div style={styles.popupDivider} />
            <button style={styles.popupItem}>Settings</button>
            <button
              style={styles.popupItem}
              onClick={() => {
                setShowProfileMenu(false);
                if (onOpenContactUs) onOpenContactUs();
              }}
            >
              Contact Us & Feedback
            </button>
            <div style={styles.popupDivider} />
            <button
              onClick={() => {
                setShowProfileMenu(false);
                if (onLogout) onLogout();
              }}
              style={{ ...styles.popupItem, color: '#f87171' }}
            >
              Log out
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {chatToDelete && (
        <div
          style={styles.modalOverlay}
          onClick={() => !isDeleting && setChatToDelete(null)}
        >
          <div
            style={styles.deleteModalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.deleteModalHeader}>
              <div style={styles.deleteIconBadge}>
                <TrashIcon size={18} />
              </div>
              <div style={styles.deleteModalTextGroup}>
                <h3 style={styles.deleteModalTitle}>Delete conversation?</h3>
                <p style={styles.deleteModalDesc}>
                  Are you sure you want to delete <span style={{ color: '#ece8df', fontWeight: 500 }}>"{chatToDelete.title}"</span>? This will permanently delete this conversation and all its messages from Firebase.
                </p>
              </div>
            </div>

            <div style={styles.deleteModalActions}>
              <button
                type="button"
                onClick={() => setChatToDelete(null)}
                disabled={isDeleting}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                style={{
                  ...styles.confirmDeleteBtn,
                  opacity: isDeleting ? 0.7 : 1,
                  cursor: isDeleting ? 'wait' : 'pointer',
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    height: '100%',
    backgroundColor: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    userSelect: 'none',
    zIndex: 20,
    transition: 'width 0.2s ease, transform 0.2s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 14px 12px',
  },
  toggleBtn: {
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: '6px',
    transition: 'color 0.15s, background-color 0.15s',
  },
  brandWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sidebarLogoImg: {
    height: '26px',
    width: 'auto',
    objectFit: 'contain',
    display: 'block',
    filter: 'drop-shadow(0 2px 8px rgba(59, 130, 246, 0.4))',
  },
  brandTitle: {
    fontFamily: 'var(--font-sans)',
    fontSize: '18px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '-0.3px',
  },
  navSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    padding: '6px 10px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    fontSize: '13.5px',
    fontWeight: 450,
    transition: 'background-color 0.15s, color 0.15s',
    textAlign: 'left',
    width: '100%',
  },
  navIconWrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    flexShrink: 0,
  },
  newChatBtn: {
    color: '#ece8df',
    fontWeight: 500,
    marginBottom: '2px',
  },
  upgradeBadge: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--accent-upgrade)',
    backgroundColor: 'var(--accent-upgrade-bg)',
    padding: '1.5px 7px',
    borderRadius: '9999px',
  },
  chatsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 12px 6px 14px',
    marginTop: '6px',
  },
  chatsTitleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12.5px',
    color: 'var(--text-muted)',
    fontWeight: 450,
  },
  iconActionBtn: {
    color: 'var(--text-muted)',
    padding: '4px',
    borderRadius: '5px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s',
  },
  tryBadge: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--accent-upgrade)',
    backgroundColor: 'var(--accent-upgrade-bg)',
    padding: '1px 6px',
    borderRadius: '9999px',
  },
  chatListScrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  chatHistoryItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    padding: '7px 8px 7px 10px',
    borderRadius: '8px',
    fontSize: '13px',
    textAlign: 'left',
    width: '100%',
    transition: 'background-color 0.15s, color 0.15s',
    cursor: 'pointer',
    userSelect: 'none',
  },
  chatItemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    overflow: 'hidden',
    minWidth: 0,
  },
  chatBullet: {
    fontSize: '10px',
    color: '#706c64',
    flexShrink: 0,
  },
  chatItemTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  deleteChatBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3px 4px',
    borderRadius: '4px',
    color: '#848077',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  emptyChatsBox: {
    padding: '20px 10px',
    textAlign: 'center',
  },
  emptyChatsText: {
    fontSize: '12px',
    color: '#706c64',
  },
  profileContainer: {
    borderTop: '1px solid var(--border-subtle)',
    padding: '12px 10px',
    position: 'relative',
  },
  profileRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfoBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#cfcbbe',
    fontSize: '13px',
    padding: '6px 8px',
    borderRadius: '8px',
    width: '100%',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  avatar: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255,255,255,0.35)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'lowercase',
  },
  userName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#ececec',
    textAlign: 'left',
  },
  profileActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  profilePopup: {
    position: 'absolute',
    bottom: '56px',
    left: '10px',
    right: '10px',
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '8px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    zIndex: 50,
  },
  popupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 8px 8px',
  },
  popupAvatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255,255,255,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    color: '#ffffff',
  },
  popupDivider: {
    height: '1px',
    backgroundColor: 'var(--border-subtle)',
    margin: '4px 0',
  },
  popupItem: {
    textAlign: 'left',
    padding: '7px 8px',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.65)',
    width: '100%',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
  },
  deleteModalCard: {
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '14px',
    padding: '22px',
    maxWidth: '430px',
    width: '100%',
    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.9)',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    animation: 'fadeIn 0.15s ease-out',
  },
  deleteModalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
  },
  deleteIconBadge: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    color: '#ef4444',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deleteModalTextGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
  },
  deleteModalTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    margin: 0,
    fontFamily: 'var(--font-sans)',
  },
  deleteModalDesc: {
    fontSize: '13px',
    color: '#b4b4b4',
    lineHeight: '1.5',
    margin: 0,
  },
  deleteModalActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    paddingTop: '6px',
  },
  cancelBtn: {
    padding: '8px 15px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
  },
  confirmDeleteBtn: {
    padding: '8px 18px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'background-color 0.15s, opacity 0.15s',
  },
};

