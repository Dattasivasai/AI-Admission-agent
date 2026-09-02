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
import agentLogo from './assets/agent-logo.png';

interface Message {
  role: 'user' | 'agent';
  content: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

function normalizeAgentText(content: string): string {
  return content
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // The model can still occasionally return Markdown despite the prompt.
    // This interface renders plain text, so remove emphasis markers instead
    // of exposing **word** to students.
    .replace(/\*+/g, '')
    .replace(/`([^`]+)`/g, '$1');
}

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
  const [thinkMode, setThinkMode] = useState(false);
  const [showChatList, setShowChatList] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('general');

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentChat = chats.find((chat) => chat.id === currentChatId);
  const hasMessages = Boolean(currentChat?.messages.length);

  const renderAgentTable = (content: string) => {
    content = normalizeAgentText(content);
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const numbered = lines.filter((line) => /^[0-9]+\./.test(line));
    if (!numbered.length) return content;

    // Parse pipe-delimited format: can be 7 or 8 columns
    // Format 1 (7 cols): 2026 R4 | Institute | Program | Quota | Category | Gender | OR–CR
    // Format 2 (8 cols): 2026 | R4 | Institute | Program | Quota | Category | Gender | OR–CR
    const rows = numbered
      .map((line) => line.replace(/^[0-9]+\.\s*/, ''))
      .map((line) => {
        const parts = line.split('|').map((p) => p.trim());
        
        // If 7 columns and first column looks like "2026 R4", split it
        if (parts.length === 7 && /^\d{4}\s+R\d+/.test(parts[0])) {
          const [year, round] = parts[0].split(/\s+/);
          return [year, round, ...parts.slice(1)];
        }
        
        return parts;
      })
      .filter((cells) => cells.length >= 8); // Only valid rows with all 8 columns

    const hasTable = rows.length > 0;
    if (!hasTable) {
      return (
        <div>
          {lines.map((line, lineIndex) => {
            const bulletMatch = line.match(/^\s*[-*+]\s+(.+)$/);
            const text = bulletMatch ? bulletMatch[1] : line;
            const parts = text.split(/(\*\*[^*]+\*\*)/g);
            const formatted = parts.map((part, partIndex) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
              }
              return part;
            });

            if (bulletMatch) {
              return (
                <div key={lineIndex} style={{ display: 'flex', gap: '8px' }}>
                  <span aria-hidden="true">•</span>
                  <span>{formatted}</span>
                </div>
              );
            }

            const isSubheading = /:\s*$/.test(text);
            return isSubheading ? (
              <strong key={lineIndex} style={{ display: 'block' }}>{formatted}</strong>
            ) : (
              <div key={lineIndex}>{formatted}</div>
            );
          })}
        </div>
      );
    }

    const headers = ['Year', 'Round', 'Institute', 'Program', 'Quota', 'Category', 'Gender', 'Opening Rank', 'Closing Rank'];
    // Keep summary/guidance lines visible after rendering the numbered rows
    // as a table. Previously this renderer discarded every non-row line.
    const tableNotes = lines.filter((line) =>
      /^(Guidance:|Summary:|What this means:|\[Showing|Rows displayed)/i.test(line),
    );
    
    return (
      <div style={{ paddingTop: '4px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              minWidth: '1200px',
              borderCollapse: 'collapse',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderBottom: `1px solid ${colors.border}`,
                    color: colors.textSecondary,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    fontSize: '12px',
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, rowIndex) => {
              // cells[0]=Year, cells[1]=Round, cells[2]=Institute, cells[3]=Program,
              // cells[4]=Quota, cells[5]=Category, cells[6]=Gender, cells[7]=OR–CR
              const [year, round, institute, program, quota, category, gender, rangeStr] = cells;
              
              // Parse OR–CR from format "OR 103 – CR 1331"
              let orRank = '';
              let crRank = '';
              if (rangeStr) {
                const match = rangeStr.match(/OR\s*(\d+)\s*[–-]\s*CR\s*(\d+)/);
                if (match) {
                  orRank = match[1];
                  crRank = match[2];
                } else {
                  crRank = rangeStr;
                }
              }

              return (
                <tr key={rowIndex} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{year}</td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{round}</td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{institute}</td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{program}</td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{quota}</td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{category}</td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{gender}</td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>{orRank}</td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {crRank}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
        {tableNotes.length > 0 && (
          <div
            style={{
              marginTop: '18px',
              padding: '14px 16px',
              borderRadius: '12px',
              background: colors.elevatedBackground,
              border: `1px solid ${colors.border}`,
              fontSize: '14px',
              lineHeight: 1.65,
            }}
          >
            {tableNotes.map((note, index) => (
              <div key={`${note}-${index}`} style={{ marginTop: index ? '8px' : 0 }}>
                {note.startsWith('Summary:') ? <strong>{note}</strong> : note}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const colors = {
    mainBackground: '#000000',
    sidebarBackground: '#000000',
    elevatedBackground: '#1a1a1a',
    hoverBackground: '#262626',
    inputBackground: '#1a1a1a',
    border: 'rgba(255, 255, 255, 0.15)',
    textPrimary: '#ffffff',
    textSecondary: '#ffffff',
    textMuted: '#e0e0e0',
    accent: '#7c3aed',
    accentHover: '#6d28d9',
    accentSoft: 'rgba(124, 58, 237, 0.14)',
    agentMessage: '#1a1a1a',
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

          const emptyChatRequested = localStorage.getItem(`emptyChat_${currentUser.uid}`) === 'true';
          const lastChatId = localStorage.getItem(`lastChat_${currentUser.uid}`);
          if (!emptyChatRequested && lastChatId && userChats.some((chat) => chat.id === lastChatId)) {
            setCurrentChatId(lastChatId);
          } else {
            setCurrentChatId(null);
          }
        } catch (error) {
          console.error('Failed to load chats:', error);
          setChats([]);
          setCurrentChatId(null);
        }
      } else {
        // Guest mode: clear everything, start fresh each visit
        setChats([]);
        setCurrentChatId(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Save current chat ID to localStorage when it changes (logged-in users only)
  useEffect(() => {
    if (user && currentChatId) {
      localStorage.setItem(`lastChat_${user.uid}`, currentChatId);
    }
  }, [currentChatId, user]);

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
    if (user) {
      localStorage.removeItem(`lastChat_${user.uid}`);
      localStorage.setItem(`emptyChat_${user.uid}`, 'true');
    }
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
      if (user) {
        localStorage.removeItem(`emptyChat_${user.uid}`);
      }
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
                fullContent = data.content || 'Something went wrong. Please try again.';
                // Update UI immediately with error message
                setChats((prev) =>
                  prev.map((chat) => {
                    if (chat.id !== chatIdToUse) return chat;
                    const msgs = [...chat.messages];
                    const lastIdx = msgs.length - 1;
                    if (msgs[lastIdx]?.role === 'agent') {
                      msgs[lastIdx] = { role: 'agent', content: fullContent };
                    }
                    return { ...chat, messages: msgs };
                  }),
                );
                continue;
              }

              if (data.type === 'done') {
                break;
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

  const handleInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      const commandKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (commandKey && key === 'n') {
        event.preventDefault();
        startNewChat();
      }

      if (commandKey && key === 'b') {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }

      if (commandKey && key === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }

      if (event.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [sidebarOpen]);

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
          width: sidebarOpen ? (isMobile ? 'min(78vw, 320px)' : '250px') : '0',
          minWidth: sidebarOpen ? (isMobile ? 'min(78vw, 320px)' : '250px') : '0',
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
            height: '60px',
            padding: '0 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src={agentLogo}
              alt="AI Counselor logo"
              style={{ width: '31px', height: '31px', objectFit: 'cover', borderRadius: '9px' }}
            />
            <div style={{ fontSize: '19px', fontWeight: 750 }}>AI Counselor</div>
            {/* <span style={{ color: colors.textMuted, fontSize: '17px' }}></span> */}
          </div>
          {/* <span style={{ color: colors.textMuted, fontSize: '20px' }}>⌕</span> */}
        </div>

        <div style={{ padding: '4px 16px 14px' }}>
          <button
            type="button"
            onClick={startNewChat}
            className="shortcut-tooltip"
            data-shortcut="Ctrl+N"
            aria-label="New chat (Ctrl+N)"
            style={{
              ...buttonReset,
              width: '100%',
              minHeight: '46px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'transparent',
              border: 'none',
              color: colors.textPrimary,
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span><span style={{ marginRight: '13px', fontSize: '20px' }}>♧</span>New chat</span>
            <span style={{ color: colors.textMuted, fontSize: '20px' }}>⊕</span>
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            onClick={() => setShowChatList(!showChatList)}
            style={{
              marginTop: 'clamp(150px, 30vh, 350px)',
              padding: '18px 16px 10px',
              color: colors.textMuted,
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'color 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = colors.textPrimary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = colors.textMuted)}
          >
            Recents&nbsp; <span style={{ display: 'inline-block', transform: showChatList ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }}>›</span>
          </div>

          <div
            className="sidebar-chat-list"
            style={{
              flex: showChatList ? 1 : 0,
              overflowY: 'auto',
              padding: '4px 16px 16px',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              display: showChatList ? 'block' : 'none',
              minHeight: 0,
            }}
          >
          {chats.length === 0 ? (
            <div style={{ padding: '10px 0', color: colors.textMuted, fontSize: '14px' }}>
              No chats
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
                    borderRadius: '11px',
                    background: isActive ? '#303136' : 'transparent',
                    borderLeft: 'none',
                    paddingRight: '4px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentChatId(chat.id);
                      if (user) {
                        localStorage.removeItem(`emptyChat_${user.uid}`);
                      }
                      if (isMobile) setSidebarOpen(false);
                    }}
                    title={chat.title}
                    style={{
                      ...buttonReset,
                      flex: 1,
                      padding: '10px 8px 10px 0',
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
                      deleteChat(chat.id);
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
        </div>

        <div
          style={{
            minHeight: '64px',
            padding: '0 20px',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: colors.accent, display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: 700 }}>
            {(user?.displayName || user?.email || 'AI')[0].toUpperCase()}
          </div>
          <span style={{ color: colors.textPrimary, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.displayName || user?.email || 'AI Counselor'}
          </span>
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
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          background: colors.mainBackground,
        }}
      >
        <header
          style={{
            height: '52px',
            minHeight: '52px',
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
              className="shortcut-tooltip"
              data-shortcut="Ctrl+B"
              aria-label={`${sidebarOpen ? 'Close' : 'Open'} sidebar (Ctrl+B)`}
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
                          setSettingsOpen(true);
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
              className="composer-shell"
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
                  maxWidth: '1200px',
                  textAlign: 'center',
                  // The empty screen follows the focused composer layout.
                  transform: 'translateY(-140px)',
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    margin: '0 auto 22px',
                    borderRadius: '18px',
                    display: 'grid',
                    placeItems: 'center',
                    background: colors.accentSoft,
                    border: '1px solid rgba(124, 58, 237, 0.25)',
                    fontSize: '18px',
                  }}
                >
                  ✦
                </div>

                <h1
                  style={{
                    margin: '0 auto 18px',
                    color: colors.textPrimary,
                    fontSize: 'clamp(20px, 2vw, 28px)',
                    lineHeight: 1.08,
                    fontWeight: 750,
                    letterSpacing: '-0.03em',
                    textAlign: 'center',
                  }}
                >
                  Plan your Admission journey
                </h1>
                <p
                  style={{
                    width: '100%',
                    maxWidth: '1200px',
                    margin: '0 auto',
                    color: colors.textSecondary,
                    fontSize: 'clamp(11px, 1vw, 13px)',
                    lineHeight: 1.55,
                    textAlign: 'center',
                  }}
                >
                  Get personalized guidance about JoSAA cutoffs, colleges, branches and admission possibilities based on your rank.
                </p>

              </div>
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                maxWidth: '900px',
                minHeight: '100%',
                margin: '0 auto',
                padding: '24px 32px 28px',
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
                      marginBottom: '20px',
                      paddingLeft: isUser ? '0' : '12px',
                      paddingRight: isUser ? '12px' : '0',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: isUser ? '84%' : 'min(720px, 90%)',
                        width: isUser ? 'auto' : '100%',
                        marginTop: isUser ? '0' : '16px',
                        marginBottom: isUser ? '0' : '24px',
                        marginLeft: isUser ? '0' : '40px',
                        marginRight: isUser ? '0' : '56px',
                        padding: isUser ? '10px 14px' : '0',
                        borderRadius: isUser ? '16px 5px 16px 16px' : '0',
                        background: isUser ? colors.accent : 'transparent',
                        color: isUser ? '#ffffff' : colors.textPrimary,
                        fontSize: '16px',
                        lineHeight: isUser ? 1.65 : 1.9,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        textAlign: isUser ? 'right' : 'left',
                        boxShadow: isUser ? '0 6px 18px rgba(124, 58, 237, 0.22)' : 'none',
                      }}
                    >
                      {message.role === 'agent' ? renderAgentTable(message.content) : message.content}

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
                );
              })}
            </div>
          )}
        </div>

        {/* Input */}
        <div
          style={{
            padding: '14px 24px 22px',
            background: colors.mainBackground,
            position: hasMessages ? 'relative' : 'absolute',
            left: hasMessages ? undefined : 0,
            right: hasMessages ? undefined : 0,
            top: hasMessages ? undefined : '54%',
            transform: hasMessages ? undefined : 'translateY(-50%)',
            zIndex: 5,
          }}
        >
          <div style={{ width: 'calc(100% - 48px)', maxWidth: '680px', margin: '0 auto' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minHeight: '54px',
                padding: '3px 10px',
                borderRadius: '27px',
                background: colors.inputBackground,
                border: `1px solid ${colors.border}`,
                boxShadow: '0 12px 35px rgba(0, 0, 0, 0.28)',
              }}
            >
              <button
                type="button"
                aria-label="Add to message"
                title="Add to message"
                onClick={() => inputRef.current?.focus()}
                style={{
                  ...buttonReset,
                  width: '48px',
                  height: '48px',
                  flexShrink: 0,
                  borderRadius: '50%',
                  background: 'transparent',
                  color: colors.textPrimary,
                  cursor: 'pointer',
                  fontSize: '32px',
                  fontWeight: 300,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '0 0 0 2px',
                  boxSizing: 'border-box',
                  transform: 'translate(4px, -3px)',
                  marginRight: '-21px',
                }}
              >
                +
              </button>

              <textarea
                className="composer-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask about rank, college, branch or cutoffs..."
                disabled={isCurrentChatLoading}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '2px 8px 2px 2px',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: colors.textPrimary,
                  fontFamily: 'inherit',
                  fontSize: '16px',
                  resize: 'none',
                  height: '34px',
                  minHeight: '34px',
                  maxHeight: '120px',
                  lineHeight: '22px',
                  textAlign: 'left',
                  transform: 'translateY(3px)',
                }}
              />

              <button
                type="button"
                className="think-control"
                aria-pressed={thinkMode}
                aria-label={`${thinkMode ? 'Disable' : 'Enable'} Think mode`}
                title="Think mode"
                onClick={() => setThinkMode((enabled) => !enabled)}
                style={{
                  ...buttonReset,
                  minWidth: '78px',
                  height: '34px',
                  flexShrink: 0,
                  padding: '0 14px',
                  borderRadius: '17px',
                  background: thinkMode ? colors.accentSoft : 'transparent',
                  color: thinkMode ? colors.textPrimary : colors.textSecondary,
                  border: thinkMode ? `1px solid ${colors.border}` : '1px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                ✦ Think
              </button>

              {isCurrentChatLoading ? (
                <button
                  type="button"
                  onClick={stopGenerating}
                  className="shortcut-tooltip"
                  data-shortcut="Stop"
                  aria-label="Stop generating"
                  style={{
                    ...buttonReset,
                    width: '34px',
                    height: '34px',
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
                      width: '10px',
                      height: '10px',
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
                  className="shortcut-tooltip"
                  data-shortcut="Enter"
                  aria-label="Send message (Enter)"
                  style={{
                    ...buttonReset,
                    minWidth: '70px',
                    height: '34px',
                    padding: '0 12px',
                    borderRadius: '17px',
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
              <br />
              AI recommendations may not always match the official JoSAA results.
              Verify important admission information.
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {settingsOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
          }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            style={{
              width: '90vw',
              maxWidth: '900px',
              height: '80vh',
              maxHeight: '600px',
              background: colors.sidebarBackground,
              borderRadius: '16px',
              display: 'flex',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: colors.elevatedBackground,
                border: `1px solid ${colors.border}`,
                color: colors.textSecondary,
                cursor: 'pointer',
                fontSize: '20px',
                display: 'grid',
                placeItems: 'center',
                zIndex: 61,
              }}
            >
              ✕
            </button>

            {/* Settings Sidebar */}
            <div
              style={{
                width: '240px',
                borderRight: `1px solid ${colors.border}`,
                overflowY: 'auto',
                padding: '16px 0',
              }}
            >
              {[
                { id: 'general', label: 'General', icon: '⚙️' },
                { id: 'notifications', label: 'Notifications', icon: '🔔' },
                { id: 'personalization', label: 'Personalization', icon: '🎨' },
                { id: 'privacy', label: 'Privacy & Security', icon: '🔒' },
                { id: 'about', label: 'About', icon: 'ℹ️' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSettingsTab(tab.id)}
                  style={{
                    ...buttonReset,
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 16px',
                    fontSize: '14px',
                    color: activeSettingsTab === tab.id ? colors.accent : colors.textPrimary,
                    background: activeSettingsTab === tab.id ? colors.elevatedBackground : 'transparent',
                    borderLeft: activeSettingsTab === tab.id ? `3px solid ${colors.accent}` : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ marginRight: '8px' }}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Settings Content */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '32px 40px',
              }}
            >
              {activeSettingsTab === 'general' && (
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: colors.textPrimary }}>
                    General
                  </h2>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: colors.textPrimary }}>
                      <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                      Compact mode
                    </label>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'notifications' && (
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: colors.textPrimary }}>
                    Notifications
                  </h2>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: colors.textPrimary }}>
                      <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                      Email notifications for new chats
                    </label>
                  </div>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: colors.textPrimary }}>
                      <input type="checkbox" style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                      Desktop notifications
                    </label>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'personalization' && (
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: colors.textPrimary }}>
                    Personalization
                  </h2>
                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '14px', color: colors.textMuted, marginBottom: '8px' }}>Theme</p>
                    <select
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: colors.elevatedBackground,
                        border: `1px solid ${colors.border}`,
                        color: colors.textPrimary,
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                      defaultValue="dark"
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                      <option value="auto">Auto</option>
                    </select>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'privacy' && (
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: colors.textPrimary }}>
                    Privacy & Security
                  </h2>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: colors.textPrimary }}>
                      <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                      Save chat history
                    </label>
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '14px', color: colors.textMuted, marginBottom: '8px' }}>Data Retention</p>
                    <select
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: colors.elevatedBackground,
                        border: `1px solid ${colors.border}`,
                        color: colors.textPrimary,
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                      defaultValue="30days"
                    >
                      <option value="30days">30 days</option>
                      <option value="90days">90 days</option>
                      <option value="1year">1 year</option>
                      <option value="forever">Forever</option>
                    </select>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'about' && (
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: colors.textPrimary }}>
                    About
                  </h2>
                  <div style={{ color: colors.textMuted, lineHeight: '1.6' }}>
                    <p><strong>AI Admission Assistant</strong></p>
                    <p style={{ marginTop: '8px' }}>Version 1.0.0</p>
                    <p style={{ marginTop: '12px', fontSize: '13px' }}>
                      Your personal admission guidance powered by AI. Get insights about JoSAA cutoffs, colleges, and admission possibilities.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }

        .shortcut-tooltip {
          position: relative;
        }

        .shortcut-tooltip::after {
          content: attr(data-shortcut);
          position: absolute;
          left: 50%;
          top: calc(100% + 8px);
          transform: translate(-50%, -4px);
          z-index: 100;
          padding: 6px 9px;
          border-radius: 7px;
          background: #f4f4f5;
          color: #18181b;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease, transform 0.15s ease;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
        }

        .shortcut-tooltip:hover::after,
        .shortcut-tooltip:focus-visible::after {
          opacity: 1;
          transform: translate(-50%, 0);
        }

        .sidebar-chat-list::-webkit-scrollbar {
          display: none;
        }

        .composer-shell:focus-within {
          border-color: rgba(124, 58, 237, 0.65) !important;
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.28), 0 0 0 3px rgba(124, 58, 237, 0.12) !important;
        }

        .composer-input::placeholder {
          color: #85858f;
          opacity: 1;
        }

        @media (max-width: 600px) {
          .composer-shell {
            gap: 4px !important;
            padding: 4px 6px !important;
          }

          .composer-shell .think-control {
            width: 34px !important;
            min-width: 34px !important;
            padding: 0 !important;
            font-size: 0 !important;
          }

          .composer-shell .think-control::before {
            content: '✦';
            font-size: 16px;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
