import React, { useState, useRef } from 'react';
import {
  UsersIcon,
  SidebarToggleIcon,
  SearchIcon,
  PlusIcon,
  PhoneIcon,
} from './Icons';
import type { UserProfile } from '../services/userService';
import type { ChatSession } from '../types/chat';

interface RightSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  users: UserProfile[];
  currentUsername?: string;
  activeChat?: ChatSession | null;
  onInviteUser: (username: string) => void;
  onStartCall?: (username: string) => void;
}


export const RightSidebar: React.FC<RightSidebarProps> = ({
  isOpen,
  onToggle,
  users,
  currentUsername,
  activeChat,
  onInviteUser,
  onStartCall,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // IDE-style dynamic resizing
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('rad_right_sidebar_width');
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
      const newWidth = Math.max(200, Math.min(window.innerWidth - moveEvent.clientX, 520));
      setWidth(newWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const finalWidth = Math.max(200, Math.min(window.innerWidth - upEvent.clientX, 520));
      try {
        localStorage.setItem('rad_right_sidebar_width', finalWidth.toString());
      } catch (err) {
        console.warn('Could not save right sidebar width:', err);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDoubleClick = () => {
    setWidth(260);
    try {
      localStorage.setItem('rad_right_sidebar_width', '260');
    } catch {}
  };

  if (!isOpen) return null;

  // Filter out the currently logged-in user (only show other users)
  const otherUsers = users.filter((u) => {
    if (
      currentUsername &&
      u.username.toLowerCase().trim() === currentUsername.toLowerCase().trim()
    ) {
      return false;
    }
    return true;
  });

  const filteredUsers = otherUsers.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      (u.stream && u.stream.toLowerCase().includes(q)) ||
      (u.branch && u.branch.toLowerCase().includes(q))
    );
  });

  return (
    <aside
      style={{
        ...styles.rightSidebar,
        width: `${width}px`,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        transition: isResizing ? 'none' : 'width 0.2s ease, transform 0.2s ease',
      }}
      aria-label="Signed users sidebar"
    >
      {/* IDE-Style Splitter Resize Handle on Left Edge */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className={`ide-resize-handle ide-resize-handle-right ${isResizing ? 'active' : ''}`}
        title="Drag to resize (Double-click to reset)"
      />
      {/* Header with the exact same SidebarToggleIcon as the left sidebar */}
      <div style={styles.header}>
        <div style={styles.headerTitleGroup}>
          <div style={styles.usersIconBadge}>
            <UsersIcon size={16} />
          </div>
          <span style={styles.titleText}>Users</span>
        </div>

        <button
          onClick={onToggle}
          style={styles.toggleBtn}
          title="Close sidebar"
          aria-label="Close sidebar"
        >
          <SidebarToggleIcon size={18} />
        </button>
      </div>

      {/* Search Input */}
      <div style={styles.searchSection}>
        <div style={styles.searchBox}>
          <span style={styles.searchIcon}>
            <SearchIcon size={14} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            style={styles.searchInput}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={styles.clearSearchBtn}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* User Section Title */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>Signed Users</span>
      </div>

      {/* Scrollable User Cards List */}
      <div style={styles.userListScroll}>
        {filteredUsers.length === 0 ? (
          <div style={styles.emptyState}>
            <UsersIcon size={26} />
            <span style={styles.emptyText}>
              {searchQuery ? 'No users matching search.' : 'No other users found.'}
            </span>
          </div>
        ) : (
          filteredUsers.map((u) => {
            const initial = u.username ? u.username.charAt(0).toUpperCase() : '?';
            const isInChat =
              activeChat?.participants?.some(
                (p) => p.toLowerCase().trim() === u.username.toLowerCase().trim()
              ) || false;

            return (
              <div key={u.username} style={styles.userCard}>
                {/* Avatar with subtle dot */}
                <div style={styles.avatarWrapper}>
                  <div style={styles.avatarCircle}>
                    {initial}
                  </div>
                  <span style={styles.onlineBadge} />
                </div>

                {/* User Info Details */}
                <div style={styles.userDetails}>
                  <div style={styles.userNameRow}>
                    <span style={styles.userNameText} title={u.username}>
                      {u.username}
                    </span>
                  </div>

                  {(u.stream || u.branch) && (
                    <div style={styles.metaRow}>
                      {u.stream && (
                        <span style={styles.streamTag}>{u.stream}</span>
                      )}
                      {u.stream && u.branch && <span style={styles.metaDot}>·</span>}
                      {u.branch && (
                        <span style={styles.branchText} title={u.branch}>
                          {u.branch}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons: Call & Invite */}
                <div style={styles.userCardActions}>
                  {onStartCall && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartCall(u.username);
                      }}
                      style={styles.callUserBtn}
                      title={`Start voice call with ${u.username}`}
                      aria-label={`Call ${u.username}`}
                    >
                      <PhoneIcon size={11} />
                    </button>
                  )}

                  {isInChat ? (
                    <div style={styles.inChatBadge} title={`${u.username} is already in this chat`}>
                      <span style={styles.inChatText}>In chat</span>
                      <span style={styles.inChatCheck}>✓</span>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onInviteUser(u.username);
                      }}
                      style={styles.inviteBtn}
                      title={`Invite ${u.username} to ${activeChat ? 'this chat' : 'start a chat'}`}
                      aria-label={`Invite ${u.username}`}
                    >
                      <PlusIcon size={12} />
                      <span>Invite</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  rightSidebar: {
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    height: '100%',
    backgroundColor: '#000000',
    borderLeft: '1px solid rgba(255,255,255,0.07)',
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
    justifyContent: 'space-between',
    padding: '16px 14px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  headerTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  usersIconBadge: {
    color: 'rgba(255,255,255,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontFamily: 'var(--font-sans)',
    fontSize: '14.5px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: '-0.2px',
  },
  toggleBtn: {
    color: 'rgba(255,255,255,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: '6px',
    transition: 'color 0.15s, background-color 0.15s',
    cursor: 'pointer',
  },
  searchSection: {
    padding: '12px 12px 6px',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '6px 10px',
    gap: '8px',
    transition: 'border-color 0.15s',
  },
  searchIcon: {
    color: 'rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'rgba(255,255,255,0.85)',
    fontSize: '12.5px',
    width: '100%',
  },
  clearSearchBtn: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '2px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 14px 6px',
  },
  sectionTitle: {
    fontSize: '11.5px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.28)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  userListScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 10px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '50px 16px',
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '13px',
    lineHeight: 1.4,
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '8px 10px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid transparent',
    transition: 'background-color 0.15s, border-color 0.15s',
  },
  avatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  avatarCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255,255,255,0.35)',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '13px',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: '-1px',
    right: '-1px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#22c55e',
    border: '1.5px solid #000000',
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflow: 'hidden',
    flex: 1,
  },
  userNameRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
  },
  userNameText: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  streamTag: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.38)',
    flexShrink: 0,
  },
  metaDot: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.2)',
  },
  branchText: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.32)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userCardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  callUserBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    color: '#60a5fa',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  inviteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '9999px',
    padding: '4px 9px',
    fontSize: '11.5px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.78)',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  inChatBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    border: '1px solid rgba(34, 197, 94, 0.25)',
    borderRadius: '9999px',
    padding: '3px 8px',
    flexShrink: 0,
  },
  inChatText: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#4ade80',
  },
  inChatCheck: {
    fontSize: '11px',
    color: '#4ade80',
    fontWeight: 700,
  },
};

