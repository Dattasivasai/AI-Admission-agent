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

// type Theme = 'dark' | 'light';

const EXAMPLE_PROMPTS = [
  'Which NIT can I get with 25,000 rank?',
  'Show CSE cutoffs for NIT Trichy',
  'Compare IIIT Kottayam and IIIT Sri City',
];

function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>('dark');
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentChat = chats.find((chat) => chat.id === currentChatId);
  const hasMessages = Boolean(currentChat?.messages.length);
  const isDark = theme === 'dark';

  const colors = {
    mainBackground: isDark ? '#09090b' : '#f8fafc',
    sidebarBackground: isDark ? '#0c0c0f' : '#ffffff',
    elevatedBackground: isDark ? '#18181b' : '#f1f5f9',
    hoverBackground: isDark ? '#202024' : '#e8edf3',
    inputBackground: isDark ? '#18181b' : '#ffffff',
    border: isDark
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(15, 23, 42, 0.10)',
    textPrimary: isDark ? '#f4f4f5' : '#18181b',
    textSecondary: isDark ? '#a1a1aa' : '#64748b',
    textMuted: isDark ? '#71717a' : '#94a3b8',
    accent: '#7c3aed',
    accentHover: '#6d28d9',
    accentSoft: isDark
      ? 'rgba(124, 58, 237, 0.14)'
      : 'rgba(124, 58, 237, 0.10)',
    agentMessage: isDark ? '#18181b' : '#ffffff',
  };

  // Load saved data → always start on welcome screen
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('theme') as Theme | null;
      const savedChats = localStorage.getItem('jeeChats');

      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
      }

      if (savedChats) {
        const parsed = JSON.parse(savedChats) as Chat[];
        if (Array.isArray(parsed)) {
          setChats(parsed);
        }
      }

      setCurrentChatId(null);
    } catch (error) {
      console.error('Failed to load saved data:', error);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('jeeChats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [currentChat?.messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentChatId]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

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
    inputRef.current?.focus();
  };

  // Delete chat → open next available
  const deleteChat = (chatId: string) => {
    setChats((prev) => {
      const updated = prev.filter((c) => c.id !== chatId);

      if (chatId === currentChatId) {
        setCurrentChatId(updated.length > 0 ? updated[0].id : null);
      }

      return updated;
    });
  };

  const selectPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  // ====================== IMPROVED STREAMING ======================
  const sendMessage = async () => {
    const currentInput = input.trim();
    if (!currentInput || isLoading) return;
  
    setInput('');
    setIsLoading(true);
  
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
      if (fullContent) {
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
      }
    } catch (error) {
      console.error('Streaming error:', error);
  
      const errorText =
        error instanceof Error ? error.message : 'Unknown server error';
  
      // Rollback optimistic agent message → show error instead
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatIdToUse) return chat;
  
          const msgs = [...chat.messages];
          const lastIdx = msgs.length - 1;
  
          if (msgs[lastIdx]?.role === 'agent') {
            msgs[lastIdx] = { role: 'agent', content: errorText };
          } else {
            msgs.push({ role: 'agent', content: errorText });
          }
  
          return { ...chat, messages: msgs };
        }),
      );
    } finally {
      setIsLoading(false);
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
          width: sidebarOpen ? '248px' : '0',
          minWidth: sidebarOpen ? '248px' : '0',
          overflow: 'hidden',
          background: colors.sidebarBackground,
          borderRight: sidebarOpen ? `1px solid ${colors.border}` : 'none',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease, min-width 0.2s ease',
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
                    onClick={() => setCurrentChatId(chat.id)}
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
                      e.currentTarget.style.background = isDark
                        ? 'rgba(239, 68, 68, 0.18)'
                        : 'rgba(239, 68, 68, 0.12)';
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
            padding: '0 22px',
            background: colors.sidebarBackground,
            borderBottom: `1px solid ${colors.border}`,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center',
            gap: '18px',
          }}
        >
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
              <div style={{ fontSize: '15px', fontWeight: 650 }}>Admission Assistant</div>
              <div style={{ marginTop: '2px', color: colors.textMuted, fontSize: '11px' }}>
                Personalized admission guidance
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
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
            </button>

            {/* <button
              type="button"
              onClick={toggleTheme}
              style={{
                ...buttonReset,
                padding: '8px 13px',
                borderRadius: '999px',
                background: colors.elevatedBackground,
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isDark ? '☀ Light' : '☾ Dark'}
            </button> */}
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
                    border: `1px solid ${
                      isDark
                        ? 'rgba(124, 58, 237, 0.25)'
                        : 'rgba(124, 58, 237, 0.18)'
                    }`,
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

                        {isLoading && isLast && message.role === 'agent' && (
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
                boxShadow: isDark
                  ? '0 12px 35px rgba(0, 0, 0, 0.28)'
                  : '0 12px 35px rgba(15, 23, 42, 0.08)',
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask about rank, college, branch or cutoffs..."
                disabled={isLoading}
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

              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!input.trim() || isLoading}
                style={{
                  ...buttonReset,
                  minWidth: '94px',
                  height: '42px',
                  padding: '0 20px',
                  borderRadius: '12px',
                  background:
                    !input.trim() || isLoading
                      ? colors.elevatedBackground
                      : colors.accent,
                  color:
                    !input.trim() || isLoading ? colors.textMuted : '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? '...' : 'Send'}
              </button>
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
