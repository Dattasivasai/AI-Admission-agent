# 🎓 AI Admission Agent
**JEE Main / JoSAA counselling assistant** powered by real opening–closing rank data and an LLM tool-calling agent.

Ask about ranks, colleges, branches, and build a **JoSAA-style preference list** — grounded in historical cutoffs, not invented numbers.

🌐 **Live:** [ai-admission-agent.vercel.app](https://ai-admission-agent.vercel.app)

![Python](https://img.shields.io/badge/Python-3.10%2B-green)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-teal)
![React](https://img.shields.io/badge/React-18%2B-blue)
![LangGraph](https://img.shields.io/badge/LangGraph-Agent-purple)
![Groq](https://img.shields.io/badge/LLM-Groq-orange)
![Firebase](https://img.shields.io/badge/Auth-Firebase-yellow)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 📖 Table of Contents
- [Features](#-features)
- [Demo Queries](#-demo-queries)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Configuration](#️-configuration)
- [Agent Tools](#-agent-tools)
- [Deployment](#-deployment)
- [Performance & Metrics](#-performance--metrics)
- [Important Disclaimers](#-important-disclaimers)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

### 🔍 Cutoff Search
- **JoSAA opening & closing ranks** for NITs, IIITs, IITs, GFTIs (2024–2026 data)
- Filter by institute, branch, year, round, category, quota, gender quota
- Rank-based queries: *"What can I get with rank 25,000?"*
- Multi-criteria filtering with Pandas for sub-100ms response times

### 📋 Choice List Builder
- Build a **JoSAA-style preference order** from rank + course priorities (e.g. CSE → ECE → IT)
- Two quota modes: **All-India** vs **Home-State**
- Two ordering strategies: **Stronger-first** (pursue stretch goals) vs **Safer-first** (conservative)
- Defaults: All-India + Stronger-first (configurable per user preference)
- Generates ranked choice lists ready to upload to JoSAA portal

### 💬 Chat Experience
- **Streaming answers** via Server-Sent Events (SSE) for real-time response
- **Google Sign-In** + persistent chat history (Firebase Realtime DB)
- Guest mode: fresh chat session per visit (no account required)
- **Stop generation** button while LLM is streaming
- Conversation context retained within session

### 📊 Data-Backed Answers
- Pandas CSV search over historical JoSAA cutoff data
- **LangGraph agentic loop** ensures LLM uses tools, doesn't hallucinate numbers
- Optional percentile → rank approximation helper (heuristic-based)
- Fallback graceful error messages if data is unavailable

---

## 💡 Demo Queries

```text
Which NIT can I get with rank 25,000?

Show all CSE openings and closings for NIT Trichy, 2024–2025.

Which IIIT can I get with rank 51,000? Category: OPEN, Gender-Neutral, All-India quota.

Build my JoSAA choice list.
  Rank: 25,000 | Category: OPEN | Gender: Male
  Preferred courses: CSE, ECE, IT | Quota: All-India | Order: Stronger-first

I have 98.5 percentile. What's my approximate rank?

Show GFTIs available for rank 80,000, Gender-Neutral, OPEN category.

What are the trends in CSE cutoffs (2024 vs 2025) for top 5 NITs?
```

---

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                      React UI (Frontend)                        │
│                  ai-admission-agent.vercel.app                  │
│  - Chat interface + streaming SSE consumer                      │
│  - Google Sign-In (Firebase Auth)                               │
│  - Chat history (cached in UI, synced via API)                  │
│  - Choice list builder form + download                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
            POST /api/chat (body: { message, sessionId })
            GET /api/history (retrieve past messages)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│               FastAPI Backend (main.py)                         │
│           Deployed on Render / Railway / GCP Cloud Run          │
│  - SSE streaming endpoint                                       │
│  - Session management + Firebase auth verification             │
│  - Request validation & rate limiting                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│          LangGraph Agent (agent.py + llm_chain.py)              │
│  - Agentic loop with tool-calling                               │
│  - Groq LLM (fast, cost-effective)                              │
│  - Streaming token output to frontend                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │search_josaa_ │ │build_choice_ │ │percentile_to_│
    │cutoffs       │ │list          │ │rank          │
    │(Pandas +CSV) │ │(Heuristic)   │ │(Approximation│
    └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
           │                │                │
           └────────────────┼────────────────┘
                            │
                ┌───────────▼────────────┐
                │  josaa_cutoffs.csv     │
                │  (2024–2026 data)      │
                │  17k+ rows, 12 columns │
                └────────────────────────┘
```

**Data Flow:**
1. User types query in React UI
2. Frontend sends SSE request to FastAPI `/chat` endpoint
3. Backend routes to LangGraph agent
4. Agent parses query, decides which tool(s) to call
5. Tools (search_josaa_cutoffs, build_choice_list, etc.) execute in parallel if possible
6. LLM processes tool results and streams natural language response back to frontend
7. Frontend displays streaming text + optionally renders structured data (choice list)

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 18 + TypeScript | Type-safe, fast UI; SSE consumer for streaming |
| **Styling** | Tailwind CSS | Rapid prototyping, responsive design |
| **Backend** | FastAPI + Uvicorn | Async support, SSE streaming, automatic OpenAPI docs |
| **Agent** | LangGraph | Structured agentic loop, tool-calling, state management |
| **LLM** | Groq (free tier) | 2–3× faster than OpenAI, good quality, cost-effective |
| **Data** | Pandas + CSV | Sub-100ms filtering over 17k rows, no DB overhead |
| **Auth** | Firebase Auth + Realtime DB | Google Sign-In, persistent chat history, free tier |
| **Deployment** | Vercel (frontend) + Render/Railway (backend) | One-click deployment, auto-scaling, CORS-friendly |

---

## 📁 Project Structure

```
ai-admission-agent/
│
├── frontend/                       # React app (deployed to Vercel)
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx      # SSE consumer + message display
│   │   │   ├── ChoiceListBuilder.tsx
│   │   │   ├── HistorySidebar.tsx
│   │   │   └── AuthProvider.tsx
│   │   ├── pages/
│   │   │   ├── index.tsx           # Main chat page
│   │   │   └── api/auth.ts         # Firebase config
│   │   ├── styles/
│   │   └── App.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vercel.json
│
├── backend/                        # FastAPI (deployed to Render/Railway)
│   ├── main.py                     # Entry point, SSE endpoint, FastAPI app
│   ├── agent.py                    # LangGraph agent definition
│   ├── llm_chain.py                # Groq LLM initialization + streaming
│   ├── tools.py                    # search_josaa_cutoffs, build_choice_list, etc.
│   ├── data/
│   │   └── josaa_cutoffs.csv       # JoSAA historical data (2024–2026)
│   ├── config.py                   # Env vars, Firebase config
│   ├── firebase_utils.py           # Chat history read/write
│   ├── requirements.txt            # Python dependencies
│   ├── .env.example
│   └── Procfile                    # Render/Railway config
│
├── .gitignore
├── README.md                       # This file
└── LICENSE                         # MIT

```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 16+
- Groq API key (free: [console.groq.com](https://console.groq.com))
- Firebase project (free tier: [console.firebase.google.com](https://console.firebase.google.com))

### Backend Setup

1. **Clone & enter backend directory:**
   ```bash
   git clone https://github.com/yourusername/ai-admission-agent.git
   cd ai-admission-agent/backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```
   GROQ_API_KEY=gsk_your_key_here
   FIREBASE_PROJECT_ID=your-firebase-project
   FIREBASE_PRIVATE_KEY=...
   FIREBASE_CLIENT_EMAIL=...
   ALLOWED_ORIGINS=http://localhost:3000,https://ai-admission-agent.vercel.app
   ```

5. **Run backend:**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   Backend should be live at `http://localhost:8000`

### Frontend Setup

1. **Enter frontend directory:**
   ```bash
   cd ../frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Firebase:**
   Create `src/config/firebase.ts`:
   ```typescript
   import { initializeApp } from "firebase/app";
   import { getAuth } from "firebase/auth";
   import { getDatabase } from "firebase/database";

   const firebaseConfig = {
     apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
     projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
     databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
     // ... other config
   };

   const app = initializeApp(firebaseConfig);
   export const auth = getAuth(app);
   export const db = getDatabase(app);
   ```

4. **Create `.env.local`:**
   ```
   REACT_APP_FIREBASE_API_KEY=...
   REACT_APP_FIREBASE_PROJECT_ID=...
   REACT_APP_FIREBASE_DATABASE_URL=...
   REACT_APP_API_BASE_URL=http://localhost:8000
   ```

5. **Run frontend:**
   ```bash
   npm run dev
   ```
   Frontend should be live at `http://localhost:3000`

---

## ⚙️ Configuration

### Backend Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `GROQ_API_KEY` | `gsk_...` | Groq API authentication |
| `FIREBASE_PROJECT_ID` | `my-project-123` | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----...` | Firebase service account key |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-...@...iam.gserviceaccount.com` | Firebase service account email |
| `ALLOWED_ORIGINS` | `http://localhost:3000,https://example.com` | CORS whitelist |
| `LOG_LEVEL` | `INFO` | Python logging level |
| `MAX_TOKENS` | `2048` | Max tokens per LLM response |

### Frontend Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `REACT_APP_FIREBASE_API_KEY` | `AIzaSyD...` | Firebase public API key |
| `REACT_APP_FIREBASE_PROJECT_ID` | `my-project-123` | Firebase project ID |
| `REACT_APP_FIREBASE_DATABASE_URL` | `https://my-project-123.firebaseio.com` | Realtime DB URL |
| `REACT_APP_API_BASE_URL` | `http://localhost:8000` | Backend API endpoint |

---

## 🔧 Agent Tools

The LangGraph agent has access to the following tools. The LLM decides which to call based on the user's query.

### 1. `search_josaa_cutoffs`
**Purpose:** Find JoSAA opening/closing ranks for specific institutes, branches, years.

**Parameters:**
```python
{
  "institute": str,           # e.g., "NIT Trichy", "IIIT Delhi"
  "branch": str,              # e.g., "CSE", "ECE", "Mechanical"
  "year": int,                # e.g., 2024, 2025
  "round": int,               # 1, 2, 3, etc.
  "category": str,            # "OPEN", "OBC-NCL", "SC", "ST"
  "quota": str,               # "All India", "Home State"
  "gender_quota": str,        # "Neutral", "Female", (optional)
}
```

**Returns:**
```python
{
  "opening_rank": int,
  "closing_rank": int,
  "seats": int,
  "year": int,
  "round": int,
}
```

**Example Query:** *"Which NITs have CSE with closing rank below 30,000 in 2024?"*

### 2. `build_choice_list`
**Purpose:** Generate a ranked preference order for JoSAA based on rank, course preferences, and strategy.

**Parameters:**
```python
{
  "rank": int,                         # e.g., 25000
  "category": str,                     # "OPEN", "OBC-NCL", "SC", "ST"
  "gender": str,                       # "Male", "Female", "Other"
  "preferred_courses": list[str],      # ["CSE", "ECE", "IT"]
  "quota": str,                        # "All India", "Home State"
  "strategy": str,                     # "stronger-first" (default) or "safer-first"
  "limit": int,                        # Max number of choices (default: 20)
}
```

**Returns:**
```python
{
  "choices": [
    {
      "rank": 1,
      "institute": "NIT Trichy",
      "branch": "CSE",
      "quota": "All India",
      "category": "OPEN",
      "expected_closing": 28000,
      "confidence": "High"
    },
    ...
  ],
  "strategy_used": "stronger-first",
  "total_choices": 15,
}
```

**Example Query:** *"Build my choice list. Rank: 25,000. Courses: CSE, ECE. Stronger-first."*

### 3. `percentile_to_rank`
**Purpose:** Convert JEE Main percentile to approximate rank (heuristic).

**Parameters:**
```python
{
  "percentile": float,  # e.g., 98.5
}
```

**Returns:**
```python
{
  "percentile": 98.5,
  "approximate_rank": 22000,
  "confidence": "Medium",
  "note": "Approximation based on historical trend. Actual rank may vary."
}
```

**Example Query:** *"I scored 98.5 percentile. What's my rank?"*

---

## 🌐 Deployment

### Frontend (Vercel)

1. **Push repo to GitHub**
2. **Connect Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Set environment variables (from `.env.local`)
   - Deploy

3. **Vercel Configuration** (`vercel.json`):
   ```json
   {
     "buildCommand": "npm run build",
     "outputDirectory": "build",
     "env": {
       "REACT_APP_API_BASE_URL": "@api_base_url"
     }
   }
   ```

### Backend (Render / Railway)

#### Option A: Render
1. Push backend to GitHub (or subdirectory)
2. Go to [render.com](https://render.com)
3. Create new Web Service → Connect GitHub repo
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`
6. Add environment variables (from `.env`)
7. Deploy

#### Option B: Railway
1. Go to [railway.app](https://railway.app)
2. New Project → GitHub repo
3. Add environment variables
4. Railway auto-detects Python / Procfile
5. Deploy

#### Option C: Docker
```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build & deploy:
```bash
docker build -t ai-admission-agent .
docker run -p 8000:8000 --env-file .env ai-admission-agent
```

### SSL/HTTPS
Both Vercel and Render provide free SSL certificates automatically. Ensure your backend CORS header includes the deployed frontend URL.

---

## 📊 Performance & Metrics

### Latency
- **Tool execution:** < 50ms (Pandas CSV search)
- **LLM token generation:** ~1–2 tokens/second (Groq)
- **End-to-end (query → first token):** ~500ms–1s

### Scalability
- **Concurrent connections:** Firebase Realtime DB free tier supports ~100 simultaneous connections
- **Request rate:** FastAPI + Uvicorn: ~1000 req/s (single instance)
- **Data size:** ~17k rows × 12 columns; loaded entirely in-memory (~5MB)

### Cost (Monthly Estimate)
- **Groq API:** Free tier (fair-use), < $50/month typical usage
- **Firebase:** Free tier (5GB storage, 100 simultaneous connections)
- **Vercel:** Free tier (for frontend)
- **Render/Railway:** ~$5–10/month for 0.5 vCPU backend
- **Total:** ~$15–20/month all-in

### Test Coverage
Currently **manual testing**. Roadmap includes:
- Unit tests for tools (pytest)
- Integration tests for LangGraph agent
- E2E tests for API endpoints (FastAPI TestClient)

---

## ⚠️ Important Disclaimers

### Data Accuracy
- This tool is **not official** and not endorsed by NTA or JoSAA.
- **Cutoff data is historical.** Current year opening/closing ranks may differ based on:
  - Number of test-takers
  - Merit distribution across categories/quotas
  - Unexpected counselling dropouts or upgrades
- **Always verify** with official JoSAA portal and admit cards before making counselling decisions.

### Tool Output Limitations
- **Rank approximation from percentile** is a heuristic. Actual rank may vary by ±5–10%.
- **Choice list suggestions** are based on historical trends, not guaranteed outcomes.
- **The tool does not account for:**
  - Spot rounds or special counselling phases
  - Supernumerary seats or reserved categories
  - Last-minute college closures or mergers

### Recommendations
1. Use this tool **as a reference and learning aid**, not the sole decision factor.
2. Cross-check all data on [josaa.nic.in](https://josaa.nic.in) or your state's counselling portal.
3. Consult college prospectuses and mentor guidance.
4. Contact colleges directly if clarification is needed.

---

## 🐛 Troubleshooting

### Backend Issues

**"GROQ_API_KEY not found"**
- Ensure `.env` is in the `backend/` directory, not root.
- Verify the key is valid at [console.groq.com](https://console.groq.com).

**"Firebase initialization failed"**
- Download your Firebase service account JSON from Firebase Console.
- Ensure all credentials are in `.env` (not in code).
- Test with: `python -c "from config import firebase_app; print(firebase_app)"`

**"SSE connection drops after 30 seconds"**
- Check backend logs for exceptions.
- Increase the `heartbeat_interval` in `main.py` (default: 15s).
- Verify frontend is sending `Accept: text/event-stream` header.

### Frontend Issues

**"API request blocked (CORS)"**
- Ensure backend CORS includes your frontend URL in `ALLOWED_ORIGINS`.
- Test backend CORS: `curl -H "Origin: http://localhost:3000" http://localhost:8000/docs`

**"Messages not streaming in real-time"**
- Verify `EventSource` is instantiated with `withCredentials: true` if using cookies.
- Check browser console for network errors.
- Ensure backend is reachable (test with simple GET request).

**"Firebase login fails"**
- Verify Firebase config is correct in `src/config/firebase.ts`.
- Check Firebase Console → Authentication → Google sign-in is enabled.
- Test locally with `npm run dev` first.

### Data Issues

**"No results for [institute/branch]"**
- Check for typos (e.g., "IITB" vs "IIT Bombay").
- Ensure the branch code matches CSV (e.g., "CSE", not "CS").
- Verify year is in the dataset (currently 2024–2026).

**"LLM returns hallucinated numbers"**
- This indicates the agent skipped tool-calling. Check agent logs.
- Ensure `tools` are properly bound to the LLM chain in `agent.py`.
- Test agent in isolation: `python -c "from agent import run_agent; run_agent('Your query')"`

---

## 📝 Future Roadmap

- [ ] Add support for state-level engineering colleges (state CET data)
- [ ] Predictive rank estimator (ML model trained on historical trends)
- [ ] Preference list export as PDF/JSON
- [ ] Multi-language support (Hindi, Telugu, Tamil)
- [ ] Real-time cutoff updates (webhook from JoSAA)
- [ ] Comprehensive test suite (pytest + Playwright E2E)
- [ ] Mobile app (React Native)

---

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "Add your feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## 👤 Author

**[Your Name]** — AI & Backend Engineer  
🌐 [Portfolio](https://yourportfolio.com)  
🔗 [LinkedIn](https://linkedin.com/in/yourprofile)  
🐙 [GitHub](https://github.com/yourusername)

---

## 🙏 Acknowledgments

- [LangGraph](https://langchain-ai.github.io/langgraph/) for agentic orchestration
- [Groq](https://groq.com/) for fast LLM inference
- [Firebase](https://firebase.google.com/) for auth & real-time database
- JoSAA for historical cutoff data

---

**Happy counselling! 🎓**
