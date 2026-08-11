import { auth, googleProvider, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

interface Message {
  role: 'user' | 'agent';
  content: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

const EXAMPLE_PROMPTS = [
  'Which NIT can I get with 25,000 rank?',
  'Show CSE cutoffs for NIT Trichy',
  'Compare IIIT Kottayam and IIIT Sri City',
];

async function loadUserChats(uid: string): Promise<Chat[]> {
  const q = query(
    collection(db, 'users', uid, 'chats'),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: data.title ?? 'New Conversation',
      messages: (data.messages ?? []) as Message[],
    };
  });
}

async function saveChat(uid: string, chat: Chat) {
  await setDoc(
    doc(db, 'users', uid, 'chats', chat.id),
    {
      title: chat.title,
      messages: chat.messages,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function removeChat(uid: string, chatId: string) {
  await deleteDoc(doc(db, 'users', uid, 'chats', chatId));
}

function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loadingChatId, setLoadingChatId] = useState<string | null>(null);

  const isCurrentChatLoading = loadingChatId !== null && loadingChatId === currentChatId;
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  useEffect(() => {
    if (!profileOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-profile-menu]')) {
        setProfileOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [profileOpen]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentChat = chats.find((chat) => chat.id === currentChatId);
  const hasMessages = Boolean(currentChat?.messages.length);

  const colors = {
    mainBackground: '#09090b',
    sidebarBackground: '#0c0c0f',
    elevatedBackground: '#18181b',
    hoverBackground: '#202024',
    inputBackground: '#18181b',
    border: 'rgba(255, 255, 255, 0.08)',
    textPrimary: '#f4f4f5',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    accent: '#7c3aed',
    accentHover: '#6d28d9',
    accentSoft: 'rgba(124, 58, 237, 0.14)',
    agentMessage: '#18181b',
  };

  // Listen for login state + load/clear chats
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        try {
          const userChats = await loadUserChats(currentUser.uid);
          setChats(userChats);
        } catch (error) {
          console.error('Failed to load chats:', error);
          setChats([]);
        }
        setCurrentChatId(null);
      } else {
        setChats([]);
        setCurrentChatId(null);
      }
    });

    return () => unsubscribe();
  }, []);
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google login failed:', error);
      alert('Login failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [currentChat?.messages, loadingChatId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentChatId]);

  const generateChatId = () =>
    `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const generateTitle = (message: string) => {
    const cleaned = message.trim();
    if (!cleaned) return 'New Conversation';
    return cleaned.length > 38 ? `${cleaned.slice(0, 38)}...` : cleaned;
  };

  const createNewChat = (): Chat => ({
    id: generateChatId(),
    title: 'New Conversation',
    messages: [],
  });

  // ChatGPT-style New Chat
  const startNewChat = () => {
    setCurrentChatId(null);
    setInput('');
    if (isMobile) setSidebarOpen(false);
    inputRef.current?.focus();
  };


  const deleteChat = (chatId: string) => {
    setChats((prev) => {
      const updated = prev.filter((c) => c.id !== chatId);

      if (chatId === currentChatId) {
        setCurrentChatId(updated.length > 0 ? updated[0].id : null);
      }

      return updated;
    });

    if (user) {
      void removeChat(user.uid, chatId);
    }
  };

  const selectPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const stopGenerating = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== currentChatId) return chat;
        const msgs = [...chat.messages];
        const last = msgs[msgs.length - 1];
        if (
          last?.role === 'agent' &&
          (last.content === 'Thinking...' ||
            last.content.startsWith('Searching') ||
            last.content.startsWith('Writing'))
        ) {
          msgs[msgs.length - 1] = {
            role: 'agent',
            content: last.content === 'Thinking...' ? '(Stopped)' : last.content,
          };
        }
        return { ...chat, messages: msgs };
      }),
    );

    setLoadingChatId(null);
  };

  // ====================== IMPROVED STREAMING ======================
  const sendMessage = async () => {
    const currentInput = input.trim();
    if (!currentInput) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setInput('');

    const userMessage: Message = { role: 'user', content: currentInput };
    const optimisticAgentMessage: Message = {
      role: 'agent',
      content: 'Thinking...',
    };

    let chatIdToUse = currentChatId;
    let previousMessages: Message[] = [];

    // ========== OPTIMISTIC UPDATE (happens instantly) ==========
    if (!chatIdToUse) {
      // New conversation
      const newChat = createNewChat();
      chatIdToUse = newChat.id;

      setChats((prev) => [
        {
          ...newChat,
          title: generateTitle(currentInput),
          messages: [userMessage, optimisticAgentMessage],
        },
        ...prev,
      ]);
      setCurrentChatId(newChat.id);
    } else {
      // Existing conversation
      const selected = chats.find((c) => c.id === chatIdToUse);
      previousMessages = selected?.messages ?? [];

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatIdToUse
            ? {
              ...chat,
              title:
                chat.messages.length === 0
                  ? generateTitle(currentInput)
                  : chat.title,
              messages: [...chat.messages, userMessage, optimisticAgentMessage],
            }
            : chat,
        ),
      );
    }

    // Prevent double-send on the same chat
    if (loadingChatId === chatIdToUse) return;

    // mark this chat as loading (replaces global isLoading)
    setLoadingChatId(chatIdToUse);

    // ========== NETWORK REQUEST ==========
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentInput,
          history: previousMessages,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let lastUpdate = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Proper SSE buffering
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const lines = event.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'status') {
                const statusText = data.content || 'Working...';
                setChats((prev) =>
                  prev.map((chat) => {
                    if (chat.id !== chatIdToUse) return chat;
                    const msgs = [...chat.messages];
                    const lastIdx = msgs.length - 1;
                    if (msgs[lastIdx]?.role === 'agent') {
                      msgs[lastIdx] = { role: 'agent', content: statusText };
                    }
                    return { ...chat, messages: msgs };
                  }),
                );
                continue;
              }

              if (data.type === 'token') {
                fullContent += data.content;

                const now = Date.now();
                // Throttle UI updates
                if (now - lastUpdate > 80 || fullContent.length < 15) {
                  lastUpdate = now;

                  setChats((prev) =>
                    prev.map((chat) => {
                      if (chat.id !== chatIdToUse) return chat;

                      const msgs = [...chat.messages];
                      const lastIdx = msgs.length - 1;

                      if (msgs[lastIdx]?.role === 'agent') {
                        msgs[lastIdx] = {
                          role: 'agent',
                          content: fullContent,
                        };
                      }

                      return { ...chat, messages: msgs };
                    }),
                  );
                }
              }

              if (data.type === 'error') {
                throw new Error(data.content);
              }
            } catch (err) {
              console.error('SSE parse error:', err);
            }
          }
        }
      }

      // Final update (make sure last tokens are shown)
      // Final update + persist for logged-in users
      // Final update + persist for logged-in users
      if (fullContent) {
        setChats((prev) => {
          const next = prev.map((chat) => {
            if (chat.id !== chatIdToUse) return chat;

            const msgs = [...chat.messages];
            const lastIdx = msgs.length - 1;

            if (msgs[lastIdx]?.role === 'agent') {
              msgs[lastIdx] = { role: 'agent', content: fullContent };
            }

            return { ...chat, messages: msgs };
          });

          if (user && chatIdToUse) {
            const updatedChat = next.find((c) => c.id === chatIdToUse);
            if (updatedChat) {
              void saveChat(user.uid, updatedChat);
            }
          }

          return next;
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error('Streaming error:', error);

      const errorText =
        error instanceof Error ? error.message : 'Unknown server error';

      // Rollback optimistic agent message → show error instead
      setChats((prev) => {
        const next = prev.map((chat) => {
          if (chat.id !== chatIdToUse) return chat;

          const msgs = [...chat.messages];
          const lastIdx = msgs.length - 1;

          if (msgs[lastIdx]?.role === 'agent') {
            msgs[lastIdx] = { role: 'agent', content: errorText };
          } else {
            msgs.push({ role: 'agent', content: errorText });
          }

          return { ...chat, messages: msgs };
        });

        if (user && chatIdToUse) {
          const updatedChat = next.find((c) => c.id === chatIdToUse);
          if (updatedChat) {
            void saveChat(user.uid, updatedChat);
          }
        }

        return next;
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLoadingChatId(null);
    }
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const buttonReset: CSSProperties = {
    border: 'none',
    fontFamily: 'inherit',
    color: 'inherit',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      {/* ====================== SIDEBAR ====================== */}
      <aside
        style={{
          position: isMobile ? 'fixed' : 'relative',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: isMobile ? 40 : 'auto',
          width: sidebarOpen ? '248px' : '0',
          minWidth: sidebarOpen ? '248px' : '0',
          overflow: 'hidden',
          background: colors.sidebarBackground,
          borderRight: sidebarOpen ? `1px solid ${colors.border}` : 'none',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          boxShadow: isMobile && sidebarOpen ? '8px 0 24px rgba(0,0,0,0.45)' : 'none',
        }}
      >
        <div
          style={{
            height: '64px',
            padding: '0 18px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: `1px solid ${colors.border}`,
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '10px',
              marginRight: '10px',
              background: colors.accentSoft,
              fontSize: '19px',
            }}
          >
            🎓
          </div>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>AI Counselor</div>
        </div>

        <div style={{ padding: '14px 12px 10px' }}>
          <button
            type="button"
            onClick={startNewChat}
            style={{
              ...buttonReset,
              width: '100%',
              minHeight: '42px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: colors.elevatedBackground,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            ＋ New chat
          </button>
        </div>

        <div
          style={{
            padding: '14px 18px 8px',
            color: colors.textMuted,
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Recent chats
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
          {chats.length === 0 ? (
            <div style={{ padding: '14px 10px', color: colors.textMuted, fontSize: '13px' }}>
              Your conversations will appear here.
            </div>
          ) : (
            chats.map((chat) => {
              const isActive = chat.id === currentChatId;
              const isHovered = hoveredChatId === chat.id;

              return (
                <div
                  key={chat.id}
                  onMouseEnter={() => setHoveredChatId(chat.id)}
                  onMouseLeave={() => setHoveredChatId(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                    borderRadius: '9px',
                    background: isActive ? colors.accentSoft : 'transparent',
                    borderLeft: isActive
                      ? `3px solid ${colors.accent}`
                      : '3px solid transparent',
                    paddingRight: '4px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentChatId(chat.id);
                      if (isMobile) setSidebarOpen(false);
                    }}
                    title={chat.title}
                    style={{
                      ...buttonReset,
                      flex: 1,
                      padding: '11px 12px',
                      paddingRight: '8px',
                      background: 'transparent',
                      color: isActive ? colors.textPrimary : colors.textSecondary,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {chat.title}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this chat?')) {
                        deleteChat(chat.id);
                      }
                    }}
                    title="Delete chat"
                    style={{
                      ...buttonReset,
                      width: '28px',
                      height: '28px',
                      borderRadius: '7px',
                      background: 'transparent',
                      color: colors.textMuted,
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      opacity: isHovered || isActive ? 0.85 : 0,
                      transition: 'opacity 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.18)';
                      e.currentTarget.style.color = '#ef4444';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = colors.textMuted;
                    }}
                  >
                    🗑
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 30,
          }}
        />
      )}

      {/* ====================== MAIN ====================== */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: colors.mainBackground,
        }}
      >
        <header
          style={{
            height: '64px',
            minHeight: '64px',
            padding: isMobile ? '0 12px' : '0 22px',
            background: colors.sidebarBackground,
            borderBottom: `1px solid ${colors.border}`,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center',
            gap: isMobile ? '8px' : '18px',
          }}
        >
          {/* Left */}
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setSidebarOpen((p) => !p)}
              style={{
                ...buttonReset,
                width: '36px',
                height: '36px',
                display: 'grid',
                placeItems: 'center',
                borderRadius: '9px',
                background: colors.elevatedBackground,
                border: `1px solid ${colors.border}`,
                color: colors.textSecondary,
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              {sidebarOpen ? '←' : '☰'}
            </button>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: 650 }}>
                {isMobile ? 'AI Counselor' : 'Admission Assistant'}
              </div>
              {!isMobile && (
                <div style={{ marginTop: '2px', color: colors.textMuted, fontSize: '11px' }}>
                  Personalized admission guidance
                </div>
              )}
            </div>
          </div>

            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
              {/* <button
              type="button"
              style={{
                ...buttonReset,
                padding: '8px 12px',
                borderRadius: '999px',
                background: colors.elevatedBackground,
                border: `1px solid ${colors.border}`,
                color: colors.textSecondary,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'default',
              }}
            >
              Model: llama-3.3-70b
            </button> */}

              {authLoading ? null : user ? (
                <div style={{ position: 'relative' }} data-profile-menu>
                  {/* Clickable profile area */}
                  <button
                    type="button"
                    onClick={() => setProfileOpen((p) => !p)}
                    style={{
                      ...buttonReset,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 8px 4px 4px',
                      borderRadius: '999px',
                      background: profileOpen ? colors.elevatedBackground : 'transparent',
                      border: `1px solid ${profileOpen ? colors.border : 'transparent'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt=""
                        referrerPolicy="no-referrer"
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: colors.elevatedBackground,
                          border: `1px solid ${colors.border}`,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: colors.textSecondary,
                        }}
                      >
                        {(user.displayName || user.email || '?')[0].toUpperCase()}
                      </div>
                    )}

                    {!isMobile && (
                      <span
                        style={{
                          fontSize: '13px',
                          color: colors.textSecondary,
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {user.displayName || user.email}
                      </span>
                    )}
                  </button>

                  {/* Dropdown */}
                  {profileOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        minWidth: '180px',
                        background: colors.elevatedBackground,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '12px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        padding: '6px',
                        zIndex: 50,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          // TODO: open help
                        }}
                        style={{
                          ...buttonReset,
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          color: colors.textPrimary,
                          fontSize: '13px',
                          cursor: 'pointer',
                          background: 'transparent',
                        }}
                      >
                        Help
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          // TODO: open settings
                        }}
                        style={{
                          ...buttonReset,
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          color: colors.textPrimary,
                          fontSize: '13px',
                          cursor: 'pointer',
                          background: 'transparent',
                        }}
                      >
                        Settings
                      </button>

                      <div style={{ height: '1px', background: colors.border, margin: '4px 0' }} />

                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          handleLogout();
                        }}
                        style={{
                          ...buttonReset,
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          color: '#ef4444',
                          fontSize: '13px',
                          cursor: 'pointer',
                          background: 'transparent',
                        }}
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  style={{
                    ...buttonReset,
                    padding: '8px 14px',
                    borderRadius: '999px',
                    background: '#fff',
                    border: '1px solid #dadce0',
                    color: '#3c4043',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt=""
                    width="16"
                    height="16"
                  />
                  Sign in with Google
                </button>
              )}
            </div>
        </header>
        <div
          ref={chatContainerRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            background: colors.mainBackground,
          }}
        >
          {!hasMessages ? (
            <div
              style={{
                width: '100%',
                minHeight: '100%',
                padding: '70px 24px 48px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '760px',
                  textAlign: 'center',
                  transform: 'translateY(-28px)',
                }}
              >
                <div
                  style={{
                    width: '58px',
                    height: '58px',
                    margin: '0 auto 22px',
                    borderRadius: '18px',
                    display: 'grid',
                    placeItems: 'center',
                    background: colors.accentSoft,
                    border: '1px solid rgba(124, 58, 237, 0.25)',
                    fontSize: '27px',
                  }}
                >
                  ✦
                </div>

                <h1
                  style={{
                    margin: 0,
                    fontSize: 'clamp(27px, 4vw, 36px)',
                    lineHeight: 1.2,
                    letterSpacing: '-0.04em',
                    fontWeight: 750,
                  }}
                >
                  Plan your JEE admission journey
                </h1>

                <p
                  style={{
                    maxWidth: '620px',
                    margin: '16px auto 0',
                    color: colors.textSecondary,
                    fontSize: '16px',
                    lineHeight: 1.7,
                  }}
                >
                  Get personalized guidance about JoSAA cutoffs, colleges,
                  branches and admission possibilities based on your rank.
                </p>

                <div
                  style={{
                    marginTop: '32px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: '12px',
                  }}
                >
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <button
                      type="button"
                      key={prompt}
                      onClick={() => selectPrompt(prompt)}
                      style={{
                        ...buttonReset,
                        minHeight: '88px',
                        padding: '15px',
                        borderRadius: '14px',
                        background: colors.elevatedBackground,
                        border: `1px solid ${colors.border}`,
                        color: colors.textSecondary,
                        textAlign: 'left',
                        fontSize: '13px',
                        lineHeight: 1.55,
                        cursor: 'pointer',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          marginBottom: '7px',
                          color: colors.accent,
                          fontSize: '16px',
                        }}
                      >
                        ↗
                      </span>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                maxWidth: '900px',
                minHeight: '100%',
                margin: '0 auto',
                padding: '36px 24px 48px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
              }}
            >
              {currentChat?.messages.map((message, index) => {
                const isUser = message.role === 'user';
                const isLast = index === (currentChat?.messages.length ?? 0) - 1;

                return (
                  <div
                    key={`${message.role}-${index}`}
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        flexDirection: isUser ? 'row-reverse' : 'row',
                        gap: '10px',
                        maxWidth: '84%',
                      }}
                    >
                      <div
                        style={{
                          width: '30px',
                          height: '30px',
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          borderRadius: '9px',
                          background: isUser
                            ? colors.accent
                            : colors.elevatedBackground,
                          border: `1px solid ${colors.border}`,
                          color: isUser ? '#ffffff' : colors.textPrimary,
                          fontSize: '13px',
                          fontWeight: 700,
                        }}
                      >
                        {isUser ? 'Y' : 'AI'}
                      </div>

                      <div
                        style={{
                          padding: '13px 17px',
                          borderRadius: isUser
                            ? '16px 5px 16px 16px'
                            : '5px 16px 16px 16px',
                          background: isUser
                            ? colors.accent
                            : colors.agentMessage,
                          border: isUser ? 'none' : `1px solid ${colors.border}`,
                          color: isUser ? '#ffffff' : colors.textPrimary,
                          fontSize: '14px',
                          lineHeight: 1.7,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          boxShadow: isUser
                            ? '0 8px 25px rgba(124, 58, 237, 0.16)'
                            : 'none',
                        }}
                      >
                        {message.content}

                        {isCurrentChatLoading && isLast && message.role === 'agent' && (
                          <span
                            style={{
                              display: 'inline-block',
                              width: '7px',
                              height: '14px',
                              background: colors.accent,
                              marginLeft: '2px',
                              verticalAlign: 'middle',
                              animation: 'blink 1s step-end infinite',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: '14px 24px 22px', background: colors.mainBackground }}>
          <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px',
                borderRadius: '18px',
                background: colors.inputBackground,
                border: `1px solid ${colors.border}`,
                boxShadow: '0 12px 35px rgba(0, 0, 0, 0.28)',
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask about rank, college, branch or cutoffs..."
                disabled={isCurrentChatLoading}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '12px 14px',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: colors.textPrimary,
                  fontFamily: 'inherit',
                  fontSize: '14px',
                }}
              />

              {isCurrentChatLoading ? (
                <button
                  type="button"
                  onClick={stopGenerating}
                  title="Stop"
                  style={{
                    ...buttonReset,
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: colors.elevatedBackground,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '2px',
                      background: colors.textPrimary,
                      display: 'block',
                    }}
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim()}
                  style={{
                    ...buttonReset,
                    minWidth: '94px',
                    height: '42px',
                    padding: '0 20px',
                    borderRadius: '12px',
                    background: !input.trim() ? colors.elevatedBackground : colors.accent,
                    color: !input.trim() ? colors.textMuted : '#ffffff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: !input.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  Send
                </button>
              )}
            </div>

            <div
              style={{
                marginTop: '9px',
                color: colors.textMuted,
                fontSize: '11px',
                textAlign: 'center',
              }}
            >
              AI recommendations may not always match the official JoSAA results.
              Verify important admission information.
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default App;
