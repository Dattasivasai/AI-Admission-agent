\# AI Admission Agent



JEE Main / JoSAA counselling assistant that answers cutoff questions and helps build preference (choice) lists using real historical opening–closing rank data.



\*\*Live app:\*\* \[ai-admission-agent.vercel.app](https://ai-admission-agent.vercel.app)



\---



\## Features



\- Chat UI for rank- and college-based questions

\- JoSAA opening/closing rank search (NITs, IIITs, IITs, GFTIs)

\- Rank-based “what can I get?” suggestions

\- JoSAA-style \*\*choice list\*\* builder (course order, All-India vs HS, stronger vs safer)

\- Approximate percentile → rank conversion

\- Google sign-in and chat history (Firebase Auth + Firestore)

\- Guest mode: new empty chat each visit (no persisted history)



\---



\## Tech stack



| Layer | Stack |

|-------|--------|

| Frontend | React, TypeScript, Vite |

| Backend | FastAPI, Uvicorn |

| Agent | LangGraph, LangChain, Groq LLM |

| Data | Pandas + JoSAA CSV |

| Auth / DB | Firebase Authentication, Cloud Firestore |

| Deploy | Vercel (frontend) |



\---



\## Project structure



```text

AI-Admission-agent/

├── agent.py                 # LLM agent + tools (search, choice list, percentile)

├── main.py                  # FastAPI app + SSE streaming

├── josaa\_cutoffs.csv        # Cutoff dataset

├── requirements.txt

├── frontend/                # React app

│   └── src/

│       ├── App.tsx

│       └── firebase.ts

└── README.md

