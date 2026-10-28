import { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { Dashboard } from './components/Dashboard';
import { ChatView } from './components/ChatView';
import { NotebooksView } from './components/NotebooksView';
import { SharedContentsView } from './components/SharedContentsView';
import { FloatingDocumentViewer } from './components/FloatingDocumentViewer';
import { FloatingCallWidget } from './components/FloatingCallWidget';
import { ContactUsPage } from './components/ContactUsPage';
import type { ChatSession, ChatMessage } from './types/chat';
import type { NotebookFile, AttachedPage } from './types/notebook';
import type { UserProfile } from './services/userService';
import type { ActiveCallState } from './services/callService';
import {
  startVoiceCall,
  subscribeToIncomingCalls,
} from './services/callService';
import { syncPendingLocalUsersToFirestore, subscribeToAllUsers } from './services/userService';
import {
  subscribeToChats,
  createNewChat,
  sendChatMessage,
  deleteChatSession,
} from './services/chatService';
import {
  sendChatInvite,
  subscribeToIncomingInvites,
  subscribeToSentInvites,
  acceptChatInvite,
  declineChatInvite,
  type ChatInvite,
} from './services/inviteService';
import { setAuthCookie, getAuthCookie, clearAuthCookie } from './utils/cookieUtils';

export default function App() {
  // Authentication State: persists in both localStorage and 1-year Cookie so user stays logged in across visits on Vercel
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const raw = localStorage.getItem('rad_current_user');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return getAuthCookie();
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [showContactUs, setShowContactUs] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'notebooks' | 'shared' | 'artifacts'>('dashboard');
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [pendingChat, setPendingChat] = useState<ChatSession | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<ChatInvite[]>([]);
  const [sentInvites, setSentInvites] = useState<ChatInvite[]>([]);
  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const [isUsersLoading, setIsUsersLoading] = useState(true);

  // Floating Document Viewer & Page Picture Attachment State
  const [activeViewingFile, setActiveViewingFile] = useState<NotebookFile | null>(null);
  const [isViewerMinimized, setIsViewerMinimized] = useState(false);
  const [attachedPages, setAttachedPages] = useState<AttachedPage[]>([]);

  // WebRTC Real-Time Voice Call State
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);

  // Sync any pending local accounts created earlier to Firestore
  useEffect(() => {
    syncPendingLocalUsersToFirestore();
  }, []);

  // Real-time listener for all signed users from Firebase Firestore
  useEffect(() => {
    setIsUsersLoading(true);
    const unsubscribe = subscribeToAllUsers((users) => {
      setAllUsers(users);
      setIsUsersLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time listener for incoming voice calls directed to currentUser
  useEffect(() => {
    if (!currentUser?.username) return;
    const unsubscribe = subscribeToIncomingCalls(currentUser.username, (incomingCall) => {
      setActiveCall(incomingCall);
    });
    return () => unsubscribe();
  }, [currentUser?.username]);

  useEffect(() => {
    if (!currentUser?.username) {
      setIncomingInvites([]);
      setSentInvites([]);
      return;
    }
    const unsubIncoming = subscribeToIncomingInvites(currentUser.username, setIncomingInvites);
    const unsubSent = subscribeToSentInvites(currentUser.username, setSentInvites);
    return () => {
      unsubIncoming();
      unsubSent();
    };
  }, [currentUser?.username]);

  const handleStartCall = async (targetUsername: string) => {
    if (!currentUser?.username) return;
    if (targetUsername.toLowerCase().trim() === currentUser.username.toLowerCase().trim()) {
      alert('You cannot start a voice call with yourself.');
      return;
    }
    try {
      await startVoiceCall(currentUser.username, targetUsername, (callState) => {
        setActiveCall(callState);
      });
    } catch (err: any) {
      alert(err?.message || 'Could not start voice call. Please verify microphone access.');
    }
  };

  // Sync in real-time with Firebase Firestore for this specific user (users/{userId}/chats)
  useEffect(() => {
    if (!currentUser?.username) {
      setChats([]);
      setIsChatsLoading(false);
      return;
    }

    setIsChatsLoading(true);
    const unsubscribe = subscribeToChats(currentUser.username, (updatedChats) => {
      setChats(updatedChats);
      setIsChatsLoading(false);
      // Once the real chat arrives in Firestore, clear the pending optimistic chat
      setPendingChat((prev) => {
        if (prev && updatedChats.some((c) => c.id === prev.id)) {
          return null;
        }
        return prev;
      });
    });

    return () => unsubscribe();
  }, [currentUser?.username]);

  const handleLoginSuccess = (userProfile: UserProfile) => {
    setCurrentUser(userProfile);
    try {
      localStorage.setItem('rad_current_user', JSON.stringify(userProfile));
      setAuthCookie(userProfile);
    } catch (e) {
      console.warn('Could not persist current user:', e);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('rad_current_user');
    clearAuthCookie();
    setActiveChatId(null);
    setActiveView('dashboard');
    setChats([]);
  };

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleToggleRightSidebar = () => {
    setIsRightSidebarOpen((prev) => !prev);
  };

  // "Start New Chat" cleanly switches to the fresh dashboard view
  const handleNewChat = () => {
    setActiveChatId(null);
    setActiveView('dashboard');
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setActiveView('dashboard');
  };

  // Floating Document Viewer Handlers
  const handleOpenDocumentViewer = (file: NotebookFile) => {
    setActiveViewingFile(file);
    setIsViewerMinimized(false);
    // Switch to dashboard so user has access to both Document and Chat beside each other!
    setActiveView('dashboard');
  };

  const handleAddPageToChat = (page: AttachedPage) => {
    setAttachedPages((prev) => {
      if (prev.some((p) => p.id === page.id || (p.fileId === page.fileId && p.pageNum === page.pageNum))) {
        return prev;
      }
      return [...prev, page];
    });

    // Ensure user has access to Chat or Dashboard
    if (activeView === 'notebooks') {
      setActiveView('dashboard');
    }
  };

  const handleRemoveAttachedPage = (pageId: string) => {
    setAttachedPages((prev) => prev.filter((p) => p.id !== pageId));
  };

  // When a prompt is submitted from the initial Dashboard
  const handleDashboardSubmit = async (promptText: string, modelName: string, images?: string[]) => {
    if (!currentUser?.username) return;
    setAttachedPages([]);

    // 1. Generate chatId and optimistic chat synchronously for 0ms UI transition
    const newChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = Date.now();
    const aiMsgId = 'msg_ai_' + (now + 1);

    let title = promptText.trim();
    if (!title && images && images.length > 0) {
      title = 'Image analysis';
    } else if (title.length > 36) {
      title = title.substring(0, 36) + '...';
    }

    const optimisticUserMsg: ChatMessage = {
      id: 'msg_opt_user_' + now,
      role: 'user',
      content: promptText,
      createdAt: now,
      sender: currentUser.username,
      images: images && images.length > 0 ? images : undefined,
    };

    const optimisticAiMsg: ChatMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      sender: 'Rad AI',
      replyToUser: currentUser.username,
    };

    const optimisticChat: ChatSession = {
      id: newChatId,
      title: title || 'New Chat',
      messages: [optimisticUserMsg, optimisticAiMsg],
      model: modelName,
      creator: currentUser.username,
      participants: [currentUser.username.toLowerCase().trim()],
      createdAt: now,
      updatedAt: now,
    };

    // 2. Instantly switch to ChatView before awaiting any async network calls
    setPendingChat(optimisticChat);
    setActiveChatId(newChatId);
    setActiveView('dashboard');

    console.log('🚀 [Rad App] Instantly transitioned to ChatView with streaming session:', newChatId);

    const handleStreamUpdate = (streamedText: string) => {
      setPendingChat((prev) => {
        if (!prev || prev.id !== newChatId) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === aiMsgId ? { ...m, content: streamedText } : m
          ),
        };
      });

      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== newChatId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === aiMsgId ? { ...m, content: streamedText } : m
            ),
          };
        })
      );
    };

    // 3. Persist session and stream AI completion in real-time
    try {
      await createNewChat(
        currentUser.username,
        promptText,
        modelName,
        images,
        newChatId,
        handleStreamUpdate,
        aiMsgId
      );
      console.log('✅ [Rad App] createNewChat streaming completed for:', newChatId);
    } catch (err) {
      console.error('❌ [Rad App] Failed to create new chat in background:', err);
    }
  };

  // When a message is sent inside ChatView
  const handleChatSendMessage = async (text: string, images?: string[]) => {
    if (!activeChatId || !currentUser?.username) return;
    setAttachedPages([]);
    console.log('🚀 [Rad App] handleChatSendMessage triggered:', {
      text,
      activeChatId,
      imageCount: images?.length || 0,
    });

    const currentChat = chats.find((c) => c.id === activeChatId);
    const model = currentChat ? currentChat.model : undefined;

    const now = Date.now();
    const userMsgId = 'msg_' + now;
    const aiMsgId = 'msg_ai_' + (now + 1);

    // Optimistically update React state immediately with user message + streaming AI placeholder
    const optimisticUserMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      createdAt: now,
      sender: currentUser.username,
      images: images && images.length > 0 ? images : undefined,
    };

    const optimisticAiMsg: ChatMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      sender: 'Rad AI',
      replyToUser: currentUser.username,
    };

    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId
          ? { ...c, messages: [...c.messages, optimisticUserMsg, optimisticAiMsg], updatedAt: now }
          : c
      )
    );

    const handleStreamUpdate = (streamedText: string) => {
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== activeChatId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === aiMsgId ? { ...m, content: streamedText } : m
            ),
          };
        })
      );
    };

    try {
      await sendChatMessage(
        currentUser.username,
        activeChatId,
        text,
        model,
        images,
        handleStreamUpdate,
        aiMsgId
      );
    } catch (err) {
      console.error('❌ [Rad App] sendChatMessage failed:', err);
    }
  };

  // When an invite is triggered from the right sidebar, in-chat header, or shared contents
  const handleInviteUser = async (targetUsername: string, specificChatId?: string) => {
    if (!currentUser?.username) return;
    const cid = specificChatId || activeChatId;
    const targetChat = cid
      ? chats.find((c) => c.id === cid) || (pendingChat?.id === cid ? pendingChat : undefined)
      : chats[0];

    try {
      const invite = await sendChatInvite(
        currentUser.username,
        targetUsername,
        cid || targetChat?.id,
        targetChat?.title
      );
      if (invite.chatId) {
        setActiveChatId(invite.chatId);
      }
    } catch (err) {
      console.error('Failed to send chat invite:', err);
    }
  };

  const handleAcceptInvite = async (invite: ChatInvite) => {
    try {
      await acceptChatInvite(invite);
      setActiveChatId(invite.chatId);
      setActiveView('dashboard');
    } catch (err) {
      console.error('Failed to accept invite:', err);
    }
  };

  const handleDeclineInvite = async (invite: ChatInvite) => {
    try {
      await declineChatInvite(invite);
    } catch (err) {
      console.error('Failed to decline invite:', err);
    }
  };

  // When a chat is deleted from the sidebar
  const handleDeleteChat = async (chatId: string) => {
    if (!currentUser?.username) return;
    try {
      await deleteChatSession(currentUser.username, chatId);
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  // If not logged in, render the login/signup page as the first page
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (showContactUs) {
    return <ContactUsPage onBack={() => setShowContactUs(false)} currentUser={currentUser} />;
  }

  const activeChat = chats.find((c) => c.id === activeChatId) || (pendingChat?.id === activeChatId ? pendingChat : undefined);

  return (
    <div style={styles.appWrapper}>
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={handleToggleSidebar}
        onNewChat={handleNewChat}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        activeView={activeView}
        onSelectView={(view) => {
          setActiveView(view);
          if (view === 'notebooks' || view === 'shared') {
            setActiveChatId(null);
          }
        }}
        onLogout={handleLogout}
        userProfile={currentUser}
        onOpenContactUs={() => setShowContactUs(true)}
        isLoadingChats={isChatsLoading}
      />

      {activeChatId && activeChat ? (
        <ChatView
          chat={activeChat}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          isRightSidebarOpen={isRightSidebarOpen}
          onToggleRightSidebar={handleToggleRightSidebar}
          onSendMessage={handleChatSendMessage}
          onNewChat={handleNewChat}
          attachedPages={attachedPages}
          onRemoveAttachedPage={handleRemoveAttachedPage}
          currentUsername={currentUser.username}
          allUsers={allUsers}
          onInviteUser={handleInviteUser}
          onStartCall={handleStartCall}
          pendingInviteUsernames={sentInvites
            .filter((invite) => !activeChatId || invite.chatId === activeChatId)
            .map((invite) => invite.toUsername)}
        />
      ) : activeView === 'shared' ? (
        <SharedContentsView
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          isRightSidebarOpen={isRightSidebarOpen}
          onToggleRightSidebar={handleToggleRightSidebar}
          chats={chats}
          allUsers={allUsers}
          currentUsername={currentUser.username}
          onSelectChat={handleSelectChat}
          onInviteUser={handleInviteUser}
          pendingInviteUsernames={sentInvites.map((invite) => invite.toUsername)}
          isLoading={isChatsLoading || isUsersLoading}
        />
      ) : activeView === 'notebooks' ? (
        <NotebooksView
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          isRightSidebarOpen={isRightSidebarOpen}
          onToggleRightSidebar={handleToggleRightSidebar}
          username={currentUser.username}
          onOpenDocumentViewer={handleOpenDocumentViewer}
        />
      ) : (
        <Dashboard
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          isRightSidebarOpen={isRightSidebarOpen}
          onToggleRightSidebar={handleToggleRightSidebar}
          onSubmitPrompt={handleDashboardSubmit}
          username={currentUser.username}
          attachedPages={attachedPages}
          onRemoveAttachedPage={handleRemoveAttachedPage}
        />
      )}

      <RightSidebar
        isOpen={isRightSidebarOpen}
        onToggle={handleToggleRightSidebar}
        users={allUsers}
        currentUsername={currentUser.username}
        activeChat={activeChat}
        onInviteUser={handleInviteUser}
        onStartCall={handleStartCall}
        incomingInvites={incomingInvites}
        pendingInviteUsernames={sentInvites
          .filter((invite) => !activeChatId || invite.chatId === activeChatId)
          .map((invite) => invite.toUsername)}
        onAcceptInvite={handleAcceptInvite}
        onDeclineInvite={handleDeclineInvite}
        isLoadingUsers={isUsersLoading}
      />

      {/* Floating, Movable, Resizable Document Viewer Window */}
      {activeViewingFile && (
        <FloatingDocumentViewer
          file={activeViewingFile}
          isMinimized={isViewerMinimized}
          onToggleMinimize={() => setIsViewerMinimized((prev) => !prev)}
          onClose={() => setActiveViewingFile(null)}
          onAddPageToChat={handleAddPageToChat}
        />
      )}

      {/* Floating Real-Time Voice Call Widget (allows speaking with friends while interacting with Rad) */}
      <FloatingCallWidget
        call={activeCall}
        onCallEnded={() => setActiveCall(null)}
        onCallStateChange={setActiveCall}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  appWrapper: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-main)',
  },
};
