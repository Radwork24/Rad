import React, { useState } from 'react';
import {
  SidebarToggleIcon,
  SharedIcon,
  PlusIcon,
  SearchIcon,
  MessageSquareIcon,
  UserPlusIcon,
  BookOpenIcon,
  FilePdfIcon,
  FilePptIcon,
  EyeIcon,
} from './Icons';
import type { ChatSession } from '../types/chat';
import type { UserProfile } from '../services/userService';
import type { NotebookItem, NotebookFile } from '../types/notebook';
import { LoadingHint, SkeletonList } from './LoadingState';

interface SharedContentsViewProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  chats: ChatSession[];
  allUsers: UserProfile[];
  currentUsername: string;
  onSelectChat: (chatId: string) => void;
  onInviteUser: (targetUsername: string, specificChatId?: string) => void;
  pendingInviteUsernames?: string[];
  isLoading?: boolean;
  notebooks?: NotebookItem[];
  onOpenNotebook?: (notebookId: string) => void;
  onOpenDocumentViewer?: (file: NotebookFile) => void;
}

// User collaborator card data
interface CollaboratorCardData {
  username: string;
  profile?: UserProfile;
  sharedChats: ChatSession[];
  totalMessages: number;
  lastActive: number;
}


export const SharedContentsView: React.FC<SharedContentsViewProps> = ({
  isSidebarOpen,
  onToggleSidebar,
  isRightSidebarOpen = false,
  onToggleRightSidebar,
  chats,
  allUsers,
  currentUsername,
  onSelectChat,
  onInviteUser,
  pendingInviteUsernames = [],
  isLoading = false,
  notebooks = [],
  onOpenNotebook,
  onOpenDocumentViewer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'invited' | 'available'>('all');
  const [contentTypeTab, setContentTypeTab] = useState<'all' | 'notebooks' | 'chats'>('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedUserToShare, setSelectedUserToShare] = useState<string | null>(null);

  const normalizedCurrent = (currentUsername || '').toLowerCase().trim();

  // Find all shared notebooks & documents
  const sharedNotebooks = (notebooks || []).filter((nb) => {
    const isSharedWithMe = Boolean(
      nb.sharedBy && nb.sharedBy.toLowerCase().trim() !== normalizedCurrent
    );
    const isSharedByMe = Boolean(nb.sharedWith && nb.sharedWith.length > 0);
    return Boolean(nb.isShared || isSharedWithMe || isSharedByMe);
  });

  const filteredSharedNotebooks = sharedNotebooks.filter((nb) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      nb.title.toLowerCase().includes(q) ||
      (nb.description && nb.description.toLowerCase().includes(q)) ||
      (nb.sharedBy && nb.sharedBy.toLowerCase().includes(q)) ||
      (nb.sharedWith && nb.sharedWith.some((sw) => sw.toLowerCase().includes(q))) ||
      nb.files.some((f) => f.name.toLowerCase().includes(q))
    );
  });

  // 1. Find all shared chats (chats with multiple participants or where currentUser invited someone)
  const sharedChatsList = chats.filter((c) => {
    if (!c.participants) return false;
    // has participants other than current user
    return c.participants.some((p) => p.toLowerCase().trim() !== normalizedCurrent);
  });

  // 2. Group shared chats by other collaborator username
  const collaboratorMap = new Map<string, CollaboratorCardData>();

  sharedChatsList.forEach((chat) => {
    const otherParticipants = (chat.participants || []).filter(
      (p) => p.toLowerCase().trim() !== normalizedCurrent
    );

    otherParticipants.forEach((otherUserKey) => {
      // Find profile in allUsers or construct fallback
      const profile = allUsers.find(
        (u) => u.username.toLowerCase().trim() === otherUserKey.toLowerCase().trim()
      );
      const displayName = profile?.username || otherUserKey;
      const key = otherUserKey.toLowerCase().trim();

      const existing = collaboratorMap.get(key) || {
        username: displayName,
        profile,
        sharedChats: [],
        totalMessages: 0,
        lastActive: 0,
      };

      existing.sharedChats.push(chat);
      existing.totalMessages += chat.messages ? chat.messages.length : 0;
      if (chat.updatedAt > existing.lastActive) {
        existing.lastActive = chat.updatedAt;
      }

      collaboratorMap.set(key, existing);
    });
  });

  const invitedCollaborators = Array.from(collaboratorMap.values()).sort(
    (a, b) => b.lastActive - a.lastActive
  );

  // 3. Find other registered Firebase users who have not been invited yet
  const availableUsers = allUsers.filter((u) => {
    const userKey = u.username.toLowerCase().trim();
    if (userKey === normalizedCurrent) return false; // don't show self
    return !collaboratorMap.has(userKey);
  });

  // Filter cards by search query
  const filteredInvited = invitedCollaborators.filter((collab) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      collab.username.toLowerCase().includes(q) ||
      (collab.profile?.branch && collab.profile.branch.toLowerCase().includes(q)) ||
      collab.sharedChats.some((c) => c.title.toLowerCase().includes(q))
    );
  });

  const filteredAvailable = availableUsers.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      (u.branch && u.branch.toLowerCase().includes(q))
    );
  });


  return (
    <main style={styles.container}>
      {/* Top Header Bar */}
      <header style={styles.topBar}>
        <div style={styles.topBarLeft}>
          {!isSidebarOpen && (
            <button
              onClick={onToggleSidebar}
              style={styles.sidebarOpenBtn}
              title="Open left sidebar"
              aria-label="Open left sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}
        </div>

        <div style={styles.topBarCenter}>
          <div style={styles.navPill}>
            <SharedIcon size={14} />
            <span>Shared Contents & Collaborators</span>
          </div>
        </div>

        <div style={styles.topBarRight}>
          {!isRightSidebarOpen && onToggleRightSidebar && (
            <button
              onClick={onToggleRightSidebar}
              style={styles.sidebarOpenBtn}
              title="Open right sidebar"
              aria-label="Open right sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Main Scrollable Area */}
      <div style={styles.scrollArea}>
        <div style={styles.contentWrapper}>
          {/* Hero Section */}
          <div style={styles.heroSection}>
            <div style={styles.heroIconBadge}>
              <SharedIcon size={24} />
            </div>
            <h1 style={styles.heroTitle}>Shared Contents & Collaborators</h1>
            <p style={styles.heroSubtitle}>
              Access shared study chats, co-working sessions, and collaborative materials with users you've invited to chat.
            </p>
          </div>

          {/* Content Type Tabs: All Shared | Notebooks & Docs | Chats */}
          <div style={styles.tabNavRow}>
            {(['all', 'notebooks', 'chats'] as const).map((tab) => {
              const isSelected = contentTypeTab === tab;
              const labels = {
                all: `All Shared (${sharedNotebooks.length + sharedChatsList.length})`,
                notebooks: `Notebooks & Docs (${sharedNotebooks.length})`,
                chats: `Chats & Collaborators (${sharedChatsList.length})`,
              };
              return (
                <button
                  key={tab}
                  onClick={() => setContentTypeTab(tab)}
                  style={{
                    ...styles.tabNavBtn,
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.5)',
                    borderBottom: isSelected ? '2px solid var(--accent-terracotta)' : '2px solid transparent',
                  }}
                >
                  {tab === 'notebooks' ? (
                    <BookOpenIcon size={14} />
                  ) : tab === 'chats' ? (
                    <MessageSquareIcon size={14} />
                  ) : (
                    <SharedIcon size={14} />
                  )}
                  <span>{labels[tab]}</span>
                </button>
              );
            })}
          </div>

          {/* Controls Bar */}
          <div style={styles.controlsBar}>
            {/* Search Input */}
            <div style={styles.searchBox}>
              <SearchIcon size={15} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notebooks, documents, or collaborators..."
                style={styles.searchInput}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={styles.clearBtn}>
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div style={styles.filterPillsGroup}>
              {(['all', 'invited', 'available'] as const).map((ft) => {
                const isSelected = filterType === ft;
                const labels: Record<string, string> = {
                  all: 'All Users',
                  invited: `Invited (${invitedCollaborators.length})`,
                  available: `Available to Invite (${availableUsers.length})`,
                };
                return (
                  <button
                    key={ft}
                    onClick={() => setFilterType(ft)}
                    style={{
                      ...styles.filterPill,
                      backgroundColor: isSelected ? '#2d2c28' : 'transparent',
                      color: isSelected ? '#f5f2eb' : '#948f86',
                      borderColor: isSelected ? '#3f3d37' : '#2b2a26',
                    }}
                  >
                    {labels[ft]}
                  </button>
                );
              })}
            </div>

            {/* Invite Button */}
            <button
              onClick={() => setShowInviteModal(true)}
              style={styles.inviteUserBtn}
              title="Invite another user from Workspace to chat"
            >
              <UserPlusIcon size={15} />
              <span>Invite Collaborator</span>
            </button>
          </div>

          {/* ========================================================
              CARDS GRID: Shared Notebooks, Documents & Collaborator Chats
             ======================================================== */}
          <div style={styles.cardsGrid}>
            {isLoading ? (
              <>
                <div style={{ gridColumn: '1 / -1' }}>
                  <LoadingHint label="Loading shared contents" />
                </div>
                <SkeletonList rows={4} variant="card" />
              </>
            ) : (
            <>
            {/* SHARED NOTEBOOKS & DOCUMENTS CARDS */}
            {(contentTypeTab === 'all' || contentTypeTab === 'notebooks') &&
              filteredSharedNotebooks.map((nb) => {
                const isSharedWithMe = Boolean(
                  nb.sharedBy && nb.sharedBy.toLowerCase().trim() !== normalizedCurrent
                );
                const isDocShare =
                  nb.files.length === 1 &&
                  (nb.description?.includes('Shared document') || nb.title.includes('('));

                return (
                  <div
                    key={`shared_nb_${nb.id}`}
                    style={styles.sharedNotebookCard}
                    onClick={() => onOpenNotebook?.(nb.id)}
                    title={`Open "${nb.title}" in Notebooks`}
                  >
                    {/* Spine Accent */}
                    <div
                      style={{
                        ...styles.sharedBookSpine,
                        background:
                          nb.coverColor ||
                          'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                      }}
                    />

                    <div style={styles.sharedCardBody}>
                      {/* Top Badges */}
                      <div style={styles.sharedCardTopRow}>
                        <div style={styles.sharedFolderBadge}>
                          {isDocShare ? (
                            <FilePdfIcon size={12} />
                          ) : (
                            <BookOpenIcon size={12} />
                          )}
                          <span>
                            {isDocShare ? 'SHARED DOC' : 'SHARED NOTEBOOK'}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: isSharedWithMe
                              ? 'rgba(59, 130, 246, 0.15)'
                              : 'rgba(217, 119, 87, 0.15)',
                            color: isSharedWithMe
                              ? '#60a5fa'
                              : 'var(--accent-terracotta)',
                            fontSize: '11px',
                            fontWeight: 500,
                            border: isSharedWithMe
                              ? '1px solid rgba(59, 130, 246, 0.25)'
                              : '1px solid rgba(217, 119, 87, 0.25)',
                          }}
                        >
                          <SharedIcon size={11} />
                          <span>
                            {isSharedWithMe
                              ? `from @${nb.sharedBy}`
                              : `with ${nb.sharedWith?.join(', ') || 'user'}`}
                          </span>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                        <h3 style={styles.sharedCardTitle} title={nb.title}>
                          {nb.title}
                        </h3>
                        <p style={styles.sharedCardDesc}>
                          {nb.description || 'Shared study materials with Rad AI'}
                        </p>
                      </div>

                      {/* Files list inside notebook */}
                      {nb.files && nb.files.length > 0 && (
                        <div style={styles.sharedFilesListBox}>
                          {nb.files.slice(0, 2).map((file) => (
                            <div key={file.id} style={styles.sharedFileRow}>
                              <div style={styles.sharedFileLeft}>
                                <span
                                  style={{
                                    ...styles.sharedFileTypeTag,
                                    backgroundColor:
                                      file.type === 'pdf'
                                        ? 'rgba(239, 68, 68, 0.2)'
                                        : file.type === 'ppt' || file.type === 'pptx'
                                        ? 'rgba(249, 115, 22, 0.2)'
                                        : 'rgba(168, 85, 247, 0.2)',
                                    color:
                                      file.type === 'pdf'
                                        ? '#f87171'
                                        : file.type === 'ppt' || file.type === 'pptx'
                                        ? '#fb923c'
                                        : '#c084fc',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  {file.type === 'pdf' ? (
                                    <FilePdfIcon size={10} />
                                  ) : file.type === 'ppt' || file.type === 'pptx' ? (
                                    <FilePptIcon size={10} />
                                  ) : (
                                    <BookOpenIcon size={10} />
                                  )}
                                  <span>{file.type.toUpperCase()}</span>
                                </span>
                                <span
                                  style={styles.sharedFileName}
                                  title={file.name}
                                >
                                  {file.name}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenDocumentViewer?.(file);
                                }}
                                style={styles.viewDocMiniBtn}
                                title={`View "${file.name}"`}
                              >
                                <EyeIcon size={11} />
                                <span>View</span>
                              </button>
                            </div>
                          ))}
                          {nb.files.length > 2 && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'rgba(255,255,255,0.4)',
                                marginTop: '4px',
                              }}
                            >
                              +{nb.files.length - 2} more document
                              {nb.files.length - 2 === 1 ? '' : 's'}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Bottom row */}
                      <div style={styles.sharedCardBottomRow}>
                        <span style={styles.sharedFileCountPill}>
                          {nb.files.length}{' '}
                          {nb.files.length === 1 ? 'file' : 'files'}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenNotebook?.(nb.id);
                          }}
                          style={styles.openInNotebooksBtn}
                        >
                          <span>Open in Notebooks</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* If tab is 'notebooks' and no shared notebooks */}
            {contentTypeTab === 'notebooks' && filteredSharedNotebooks.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '48px 20px',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  borderRadius: '12px',
                  border: '1px dashed rgba(255,255,255,0.1)',
                }}
              >
                <BookOpenIcon size={32} />
                <h4 style={{ color: '#fff', margin: '12px 0 4px 0' }}>
                  No shared notebooks yet
                </h4>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
                  Share any notebook or study document from your Notebooks view to collaborate with friends!
                </p>
              </div>
            )}

            {/* CHAT COLLABORATOR CARDS (Shown when tab is 'all' or 'chats') */}
            {(contentTypeTab === 'all' || contentTypeTab === 'chats') && (
              <>
            {/* Card 1: "+ Invite User" Card */}
            <div
              onClick={() => setShowInviteModal(true)}
              style={styles.inviteCard}
              title="Invite someone to chat and share contents"
            >
              <div style={styles.inviteCardBody}>
                <div style={styles.inviteCardIconWrapper}>
                  <UserPlusIcon size={26} />
                </div>
                <h3 style={styles.inviteCardTitle}>Invite to Chat</h3>
                <p style={styles.inviteCardDesc}>
                  Select any registered user from Workspace to create a shared chat and collaborate on notes and questions.
                </p>
                <div style={styles.inviteCardActionBadge}>
                  <PlusIcon size={13} />
                  <span>+ Invite User</span>
                </div>
              </div>
            </div>

            {/* Cards for users with whom I ever invited/shared chats */}
            {(filterType === 'all' || filterType === 'invited') &&
              filteredInvited.map((collab) => {
                const latestChat = collab.sharedChats[0];
                const latestMsg =
                  latestChat?.messages && latestChat.messages.length > 0
                    ? latestChat.messages[latestChat.messages.length - 1]
                    : null;

                return (
                  <div
                    key={collab.username}
                    style={styles.userCard}
                    onClick={() => latestChat && onSelectChat(latestChat.id)}
                    title={`View shared chats with ${collab.username}`}
                  >
                    {/* User Card Header: Name, Avatar, Role */}
                    <div style={styles.userCardHeader}>
                      <div style={styles.userAvatarRow}>
                        <div style={styles.userAvatar}>
                          {collab.username.charAt(0).toUpperCase()}
                        </div>

                        <div style={styles.userMeta}>
                          {/* PROMINENT USERNAME ON CARD */}
                          <h3 style={styles.userName}>{collab.username}</h3>
                          <div style={styles.userSubRow}>
                            <span style={styles.userBranchBadge}>
                              {collab.profile?.branch || 'B.Tech'}
                            </span>
                            <span style={styles.userSharedBadge}>SHARED CHAT</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Shared Statistics */}
                    <div style={styles.userStatsBox}>
                      <div style={styles.statItem}>
                        <span style={styles.statVal}>{collab.sharedChats.length}</span>
                        <span style={styles.statLabel}>
                          {collab.sharedChats.length === 1 ? 'Shared Chat' : 'Shared Chats'}
                        </span>
                      </div>
                      <div style={styles.statDivider} />
                      <div style={styles.statItem}>
                        <span style={styles.statVal}>{collab.totalMessages}</span>
                        <span style={styles.statLabel}>Messages</span>
                      </div>
                      <div style={styles.statDivider} />
                      <div style={styles.statItem}>
                        <span style={styles.statVal}>
                          {collab.lastActive
                            ? new Date(collab.lastActive).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })
                            : 'Recent'}
                        </span>
                        <span style={styles.statLabel}>Active</span>
                      </div>
                    </div>

                    {/* Shared Chats List / Latest Conversation Preview */}
                    <div style={styles.sharedChatsContainer}>
                      <span style={styles.sharedSectionLabel}>Shared Conversations:</span>
                      <div style={styles.chatItemsList}>
                        {collab.sharedChats.slice(0, 2).map((sc) => (
                          <div
                            key={sc.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectChat(sc.id);
                            }}
                            style={styles.chatSnippetItem}
                            title={`Open "${sc.title}"`}
                          >
                            <div style={styles.chatSnippetTop}>
                              <MessageSquareIcon size={12} />
                              <span style={styles.chatSnippetTitle}>{sc.title}</span>
                            </div>
                            {latestMsg && (
                              <p style={styles.chatSnippetMsg}>
                                {latestMsg.content.slice(0, 68)}...
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div style={styles.userCardActions}>
                      {latestChat && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectChat(latestChat.id);
                          }}
                          style={styles.openChatBtn}
                        >
                          <MessageSquareIcon size={13} />
                          <span>Open Chat</span>
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUserToShare(collab.username);
                          setShowInviteModal(true);
                        }}
                        style={styles.newChatWithUserBtn}
                        title={`Share an AI conversation with ${collab.username}`}
                      >
                        <PlusIcon size={12} />
                        <span>+ Share Chat</span>
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* Also show registered Firebase users available to invite */}
            {(filterType === 'all' || filterType === 'available') &&
              filteredAvailable.map((user) => {
                return (
                  <div key={user.username} style={styles.availableUserCard}>
                    <div style={styles.userCardHeader}>
                      <div style={styles.userAvatarRow}>
                        <div style={styles.userAvatar}>
                          {user.username.charAt(0).toUpperCase()}
                        </div>

                        <div style={styles.userMeta}>
                          {/* PROMINENT USERNAME ON CARD */}
                          <h3 style={styles.userName}>{user.username}</h3>
                          <div style={styles.userSubRow}>
                            <span style={styles.userBranchBadge}>
                              {user.branch || 'B.Tech'}
                            </span>
                            <span style={styles.availablePill}>Workspace</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p style={styles.availableUserDesc}>
                      {user.username} is registered on Rad. Click below to invite them to chat and share study contents.
                    </p>

                    <div style={styles.availableCardAction}>
                      <button
                        onClick={() => {
                          setSelectedUserToShare(user.username);
                          setShowInviteModal(true);
                        }}
                        style={styles.inviteActionBtn}
                        title={`Invite ${user.username} to your chat`}
                      >
                        <UserPlusIcon size={14} />
                        <span>Invite to Chat</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              </>
            )}
            </>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================
          INVITE COLLABORATOR MODAL
         ======================================================== */}
      {showInviteModal && (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            setShowInviteModal(false);
            setSelectedUserToShare(null);
          }}
        >
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            {selectedUserToShare ? (
              <>
                <div style={styles.modalHeader}>
                  <div style={styles.modalTitleGroup}>
                    <button
                      onClick={() => setSelectedUserToShare(null)}
                      style={styles.modalBackBtn}
                      title="Back to user selection"
                    >
                      ←
                    </button>
                    <div style={styles.modalIconWrap}>
                      <UserPlusIcon size={18} />
                    </div>
                    <div>
                      <h3 style={styles.modalHeading}>
                        Share AI Chat with {selectedUserToShare}
                      </h3>
                      <span style={styles.modalChatSub}>
                        Collaborate on questions & answers
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowInviteModal(false);
                      setSelectedUserToShare(null);
                    }}
                    style={styles.modalCloseBtn}
                  >
                    ✕
                  </button>
                </div>

                <div style={styles.modalBody}>
                  <p style={styles.modalSubheading}>
                    Choose a recent conversation with Rad AI to share with{' '}
                    <strong>{selectedUserToShare}</strong>. Both of you will see all questions, Rad's answers, and can ask questions together:
                  </p>

                  <div style={styles.chatPickerList}>
                    {chats.filter((c) => c.messages && c.messages.some((m) => m.role === 'user' && m.content.trim().length > 0)).length === 0 ? (
                      <div style={styles.noChatsPickerBox}>
                        <p style={{ margin: 0, color: '#8c887e', fontSize: '13px' }}>
                          You have no active conversations yet. Please start a conversation with Rad AI first before inviting collaborators.
                        </p>
                      </div>
                    ) : (
                      chats
                        .filter((c) => c.messages && c.messages.some((m) => m.role === 'user' && m.content.trim().length > 0))
                        .map((c) => {
                        const inThis = (c.participants || []).some(
                          (p) =>
                            p.toLowerCase().trim() ===
                            selectedUserToShare.toLowerCase().trim()
                        );
                        const isPending = pendingInviteUsernames.some(
                          (name) =>
                            name.toLowerCase().trim() ===
                            selectedUserToShare.toLowerCase().trim()
                        );
                        return (
                          <div key={c.id} style={styles.chatPickerRow}>
                            <div style={styles.chatPickerInfo}>
                              <div style={styles.chatPickerTitleRow}>
                                <MessageSquareIcon size={13} />
                                <span style={styles.chatPickerTitle}>{c.title}</span>
                              </div>
                              <span style={styles.chatPickerMeta}>
                                {c.messages.length} messages ·{' '}
                                {new Date(c.updatedAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>

                            {inThis ? (
                              <span style={styles.alreadySharedBadge}>In Chat ✓</span>
                            ) : isPending ? (
                              <span style={styles.alreadySharedBadge}>Pending</span>
                            ) : (
                              <button
                                onClick={() => {
                                  onInviteUser(selectedUserToShare, c.id);
                                  onSelectChat(c.id);
                                  setShowInviteModal(false);
                                  setSelectedUserToShare(null);
                                }}
                                style={styles.shareChatActionBtn}
                              >
                                <span>Share This Chat</span>
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={styles.modalHeader}>
                  <div style={styles.modalTitleGroup}>
                    <div style={styles.modalIconWrap}>
                      <UserPlusIcon size={18} />
                    </div>
                    <h3 style={styles.modalHeading}>Select Collaborator to Share Chat</h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowInviteModal(false);
                      setSelectedUserToShare(null);
                    }}
                    style={styles.modalCloseBtn}
                  >
                    ✕
                  </button>
                </div>

                <div style={styles.modalBody}>
                  <p style={styles.modalSubheading}>
                    Choose any registered user from Workspace to share your study chat with Rad AI:
                  </p>

                  <div style={styles.userListModalContainer}>
                    {allUsers
                      .filter(
                        (u) =>
                          u.username.toLowerCase().trim() !== normalizedCurrent
                      )
                      .map((user) => {
                        return (
                          <div key={user.username} style={styles.modalUserRow}>
                            <div style={styles.modalUserLeft}>
                              <div style={styles.modalUserAvatar}>
                                {user.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span style={styles.modalUserName}>
                                  {user.username}
                                </span>
                                <span style={styles.modalUserBranch}>
                                  {user.branch || 'B.Tech'}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                setSelectedUserToShare(user.username);
                              }}
                              style={styles.modalInviteBtn}
                            >
                              <span>Select User →</span>
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-primary)',
    position: 'relative',
    overflow: 'hidden',
  },
  topBar: {
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-main)',
    zIndex: 10,
    flexShrink: 0,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '120px',
  },
  topBarCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: '120px',
  },
  sidebarOpenBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
  },
  navPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '16px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 500,
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 32px 48px',
  },
  contentWrapper: {
    maxWidth: '1100px',
    margin: '0 auto',
  },
  heroSection: {
    textAlign: 'center',
    marginBottom: '28px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  heroIconBadge: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--accent-terracotta)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '14px',
  },
  heroTitle: {
    fontSize: '28px',
    fontWeight: 550,
    fontFamily: 'serif',
    color: '#f7f4ed',
    margin: '0 0 8px 0',
    letterSpacing: '-0.02em',
  },
  heroSubtitle: {
    fontSize: '14px',
    color: '#a39e94',
    maxWidth: '580px',
    lineHeight: 1.5,
    margin: 0,
  },
  controlsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: '1 1 240px',
    maxWidth: '360px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '7px 12px',
    color: 'rgba(255,255,255,0.35)',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#f5f2eb',
    fontSize: '13px',
    width: '100%',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: '#7e796f',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '2px',
  },
  filterPillsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  filterPill: {
    padding: '5px 12px',
    borderRadius: '16px',
    border: '1px solid',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  inviteUserBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 500,
    padding: '7px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
  },
  inviteCard: {
    backgroundColor: '#000000',
    border: '1px dashed rgba(255,255,255,0.15)',
    borderRadius: '12px',
    minHeight: '260px',
    display: 'flex',
    position: 'relative',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  inviteCardBody: {
    flex: 1,
    padding: '22px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  inviteCardIconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--accent-terracotta)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '14px',
  },
  inviteCardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#f5f2eb',
    margin: '0 0 6px 0',
  },
  inviteCardDesc: {
    fontSize: '12px',
    color: '#948f86',
    lineHeight: 1.45,
    margin: '0 0 16px 0',
  },
  inviteCardActionBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '16px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '12px',
    fontWeight: 500,
  },
  userCard: {
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    minHeight: '260px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '18px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
  },
  userCardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '14px',
  },
  userAvatarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255,255,255,0.35)',
  },
  userMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  userName: {
    fontSize: '16px',
    fontWeight: 650,
    color: '#f8f5ee',
    margin: 0,
    letterSpacing: '-0.01em',
  },
  userSubRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  userBranchBadge: {
    fontSize: '11px',
    color: '#9e998f',
  },
  userSharedBadge: {
    fontSize: '9.5px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  userStatsBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.07)',
    padding: '8px 6px',
    marginBottom: '12px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  statVal: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#f0ede6',
  },
  statLabel: {
    fontSize: '10px',
    color: '#847f77',
  },
  statDivider: {
    width: '1px',
    height: '20px',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sharedChatsContainer: {
    flex: 1,
    marginBottom: '14px',
  },
  sharedSectionLabel: {
    fontSize: '11px',
    color: '#847f77',
    fontWeight: 500,
    marginBottom: '6px',
    display: 'block',
  },
  chatItemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  chatSnippetItem: {
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    padding: '6px 8px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  chatSnippetTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#cfcac0',
    fontSize: '12px',
    fontWeight: 500,
  },
  chatSnippetTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chatSnippetMsg: {
    fontSize: '11px',
    color: '#7e796f',
    margin: '3px 0 0 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userCardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  openChatBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: '12px',
    fontWeight: 500,
    padding: '7px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  newChatWithUserBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)',
    fontSize: '12px',
    fontWeight: 500,
    padding: '7px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  availableUserCard: {
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    minHeight: '260px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '18px',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
  },
  availablePill: {
    fontSize: '9.5px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  availableUserDesc: {
    fontSize: '12.5px',
    color: '#8e8980',
    lineHeight: 1.45,
    margin: '8px 0 16px 0',
  },
  availableCardAction: {
    marginTop: 'auto',
  },
  inviteActionBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 500,
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
  },

  /* Modal Styles */
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
    padding: '16px',
  },
  modalBox: {
    width: '100%',
    maxWidth: '460px',
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '14px',
    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.8)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  modalTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  modalIconWrap: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: 'var(--accent-terracotta)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeading: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#f7f4ed',
    margin: 0,
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: '#847f77',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px',
  },
  modalBody: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  modalSubheading: {
    fontSize: '13px',
    color: '#9e998f',
    lineHeight: 1.45,
    margin: 0,
  },
  userListModalContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '280px',
    overflowY: 'auto',
  },
  modalUserRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '8px',
    padding: '8px 12px',
  },
  modalUserLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  modalUserAvatar: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255,255,255,0.35)',
  },
  modalUserName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#f5f2eb',
    display: 'block',
  },
  modalUserBranch: {
    fontSize: '11px',
    color: '#847f77',
    display: 'block',
  },
  modalInviteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 500,
    padding: '5px 10px',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  modalBackBtn: {
    background: 'transparent',
    border: 'none',
    color: '#aba69c',
    fontSize: '15px',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    marginRight: '2px',
  },
  modalChatSub: {
    fontSize: '11px',
    color: '#847f77',
    display: 'block',
  },
  chatPickerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '260px',
    overflowY: 'auto',
  },
  noChatsPickerBox: {
    padding: '16px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: '8px',
    textAlign: 'center',
  },
  chatPickerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '8px',
    padding: '10px 14px',
  },
  chatPickerInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    overflow: 'hidden',
  },
  chatPickerTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#f5f2eb',
  },
  chatPickerTitle: {
    fontSize: '13px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '240px',
  },
  chatPickerMeta: {
    fontSize: '11px',
    color: '#7a756c',
  },
  alreadySharedBadge: {
    fontSize: '11px',
    color: '#10b981',
    fontWeight: 500,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: '3px 8px',
    borderRadius: '12px',
    border: '1px solid rgba(16, 185, 129, 0.25)',
  },
  shareChatActionBtn: {
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    color: '#ffffff',
    fontSize: '11.5px',
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  modalBottomActionRow: {
    borderTop: '1px solid #282723',
    paddingTop: '12px',
    marginTop: '4px',
  },
  startFreshChatBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: '12.5px',
    fontWeight: 500,
    padding: '8px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  tabNavRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    paddingBottom: '8px',
    flexWrap: 'wrap',
  },
  tabNavBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  sharedNotebookCard: {
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '260px',
    transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
    cursor: 'pointer',
  },
  sharedBookSpine: {
    height: '4px',
    width: '100%',
  },
  sharedCardBody: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  sharedCardTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },
  sharedFolderBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '10.5px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  sharedCardTitle: {
    margin: '0 0 4px 0',
    fontSize: '15px',
    fontWeight: 600,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sharedCardDesc: {
    margin: 0,
    fontSize: '12px',
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  sharedFilesListBox: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    backgroundColor: '#0d0d0e',
    padding: '8px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  sharedFileRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  sharedFileLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    flex: 1,
  },
  sharedFileTypeTag: {
    fontSize: '9px',
    fontWeight: 700,
    padding: '1px 4px',
    borderRadius: '3px',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#f87171',
  },
  sharedFileName: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.85)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  viewDocMiniBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: 'none',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '11px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  sharedCardBottomRow: {
    marginTop: 'auto',
    paddingTop: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  sharedFileCountPill: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.4)',
  },
  openInNotebooksBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 10px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
};
