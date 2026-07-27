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

type Theme = 'dark' | 'light';

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

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("theme") as Theme | null;
      const savedChats = localStorage.getItem("jeeChats");
  
      if (savedTheme === "dark" || savedTheme === "light") {
        setTheme(savedTheme);
      }
  
      if (savedChats) {
        const parsedChats = JSON.parse(savedChats) as Chat[];
  
        if (Array.isArray(parsedChats)) {
          // Load previous chats into the sidebar
          setChats(parsedChats);
  
          // IMPORTANT:
          // Do NOT automatically open the last/first conversation.
          // Show the welcome page instead.
          setCurrentChatId(null);
        }
      }
    } catch (error) {
      console.error("Failed to load saved data:", error);
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
    setTheme((previousTheme) =>
      previousTheme === 'dark' ? 'light' : 'dark',
    );
  };

  const generateChatId = () => {
    return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const generateTitle = (message: string) => {
    const cleanedMessage = message.trim();

    if (!cleanedMessage) {
      return 'New Conversation';
    }

    return cleanedMessage.length > 38
      ? `${cleanedMessage.slice(0, 38)}...`
      : cleanedMessage;
  };

  const createNewChat = (): Chat => ({
    id: generateChatId(),
    title: 'New Conversation',
    messages: [],
  });

  const startNewChat = () => {
    const newChat = createNewChat();

    setChats((previousChats) => [newChat, ...previousChats]);
    setCurrentChatId(newChat.id);
    setInput('');
  };

  const selectPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    const currentInput = input.trim();

    if (!currentInput || isLoading) {
      return;
    }

    setInput('');
    setIsLoading(true);

    const userMessage: Message = {
      role: 'user',
      content: currentInput,
    };

    let chatIdToUse = currentChatId;
    let previousMessages: Message[] = [];

    if (!chatIdToUse) {
      const newChat = createNewChat();

      chatIdToUse = newChat.id;

      setChats((previousChats) => [
        {
          ...newChat,
          title: generateTitle(currentInput),
          messages: [userMessage],
        },
        ...previousChats,
      ]);

      setCurrentChatId(newChat.id);
    } else {
      const selectedChat = chats.find((chat) => chat.id === chatIdToUse);

      previousMessages = selectedChat?.messages ?? [];

      setChats((previousChats) =>
        previousChats.map((chat) => {
          if (chat.id !== chatIdToUse) {
            return chat;
          }

          return {
            ...chat,
            title:
              chat.messages.length === 0
                ? generateTitle(currentInput)
                : chat.title,
            messages: [...chat.messages, userMessage],
          };
        }),
      );
    }

    try {
      const history = [...previousMessages, userMessage];

      const API_URL =
        import.meta.env.VITE_API_URL || 'http://localhost:8000';

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: currentInput,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();

      const agentMessage: Message = {
        role: 'agent',
        content:
          typeof data.response === 'string'
            ? data.response
            : 'I could not generate a valid response.',
      };

      setChats((previousChats) =>
        previousChats.map((chat) =>
          chat.id === chatIdToUse
            ? {
                ...chat,
                messages: [...chat.messages, agentMessage],
              }
            : chat,
        ),
      );
    } catch (error) {
      console.error('Backend error:', error);

      const errorMessage: Message = {
        role: 'agent',
        content:
          'I could not connect to the backend. Make sure the FastAPI server is running on port 8000.',
      };

      setChats((previousChats) =>
        previousChats.map((chat) =>
          chat.id === chatIdToUse
            ? {
                ...chat,
                messages: [...chat.messages, errorMessage],
              }
            : chat,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
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
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? '248px' : '0',
          minWidth: sidebarOpen ? '248px' : '0',
          overflow: 'hidden',
          background: colors.sidebarBackground,
          borderRight: sidebarOpen
            ? `1px solid ${colors.border}`
            : 'none',
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

          <div
            style={{
              fontSize: '17px',
              fontWeight: 700,
              letterSpacing: '-0.2px',
            }}
          >
            JEE AI Counselor
          </div>
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

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 8px 16px',
          }}
        >
          {chats.length === 0 ? (
            <div
              style={{
                padding: '14px 10px',
                color: colors.textMuted,
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              Your conversations will appear here.
            </div>
          ) : (
            chats.map((chat) => {
              const isActive = chat.id === currentChatId;

              return (
                <button
                  type="button"
                  key={chat.id}
                  onClick={() => setCurrentChatId(chat.id)}
                  title={chat.title}
                  style={{
                    ...buttonReset,
                    width: '100%',
                    padding: '11px 12px',
                    marginBottom: '4px',
                    borderRadius: '9px',
                    background: isActive
                      ? colors.accentSoft
                      : 'transparent',
                    color: isActive
                      ? colors.textPrimary
                      : colors.textSecondary,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    borderLeft: isActive
                      ? `3px solid ${colors.accent}`
                      : '3px solid transparent',
                  }}
                >
                  {chat.title}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main area */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: colors.mainBackground,
        }}
      >
        {/* Header */}
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
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={() => setSidebarOpen((previous) => !previous)}
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
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
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 650,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                JEE Admission Assistant
              </div>

              <div
                style={{
                  marginTop: '2px',
                  color: colors.textMuted,
                  fontSize: '11px',
                }}
              >
                Personalized admission guidance
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            <button
              type="button"
              title="Current AI model"
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
              Model: llama3.1:8b
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
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
                whiteSpace: 'nowrap',
              }}
            >
              {isDark ? '☀ Switch to Light' : '☾ Switch to Dark'}
            </button>
          </div>
        </header>

        {/* Chat content */}
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
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(190px, 1fr))',
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
                          border: isUser
                            ? 'none'
                            : `1px solid ${colors.border}`,
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
                      </div>
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      width: '30px',
                      height: '30px',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '9px',
                      background: colors.elevatedBackground,
                      border: `1px solid ${colors.border}`,
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    AI
                  </div>

                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '5px 16px 16px 16px',
                      background: colors.agentMessage,
                      border: `1px solid ${colors.border}`,
                      color: colors.textSecondary,
                      fontSize: '14px',
                    }}
                  >
                    Thinking
                    <span style={{ letterSpacing: '3px' }}>...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input section */}
        <div
          style={{
            padding: '14px 24px 22px',
            background: colors.mainBackground,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '900px',
              margin: '0 auto',
            }}
          >
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
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask about rank, college, branch or cutoffs..."
                disabled={isLoading}
                aria-label="Chat message"
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
                    !input.trim() || isLoading
                      ? colors.textMuted
                      : '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor:
                    !input.trim() || isLoading
                      ? 'not-allowed'
                      : 'pointer',
                  transition:
                    'background 0.15s ease, transform 0.15s ease',
                }}
              >
                {isLoading ? 'Wait...' : 'Send'}
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
              AI recommendations may not always match the official JoSAA
              results. Verify important admission information.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
