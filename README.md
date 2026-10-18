# 🎓 AI Admission Agent

**JEE Main / JoSAA counselling assistant** powered by real opening–closing rank data and an LLM tool-calling agent.

Ask about ranks, colleges and branches, and build a **JoSAA-style preference list**, grounded in historical cutoffs rather than invented numbers.

🌐 **Live:** [ai-admission-agent.vercel.app](https://ai-admission-agent.vercel.app)

![Python](https://img.shields.io/badge/Python-3.10%2B-green)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-teal)
![React](https://img.shields.io/badge/React-Vite-blue)
![LangGraph](https://img.shields.io/badge/LangGraph-Agent-purple)
![LangChain](https://img.shields.io/badge/LangChain-Groq%20%2B%20Tools-darkgreen)
![Groq](https://img.shields.io/badge/LLM-Groq-orange)
![Firebase](https://img.shields.io/badge/Firebase-Frontend-yellow)
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
- [API](#-api)
- [Agent Tools](#-agent-tools)
- [Data](#-data)
- [Deployment](#-deployment)
- [Important Disclaimers](#-important-disclaimers)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

### 🔍 Cutoff Search
- **JoSAA opening & closing ranks** for IITs, NITs, IIITs and GFTIs (2024–2026 data)
- Filter by institute (aliases like `IITB` and `NIT Trichy` are understood), institute type, branch, year, round, category, quota and gender
- Rank-based queries such as *"What can I get with rank 25,000?"*
- Each result in a rank search is tagged **Close match**, **Realistic option** or **Safer option** relative to your rank
- Fast in-memory filtering with Pandas (the CSV is loaded once at startup)

### 📋 Choice List Builder
- Build a **JoSAA-style preference order** from your rank and an ordered list of courses (e.g. CSE → ECE → IT)
- Two quota modes: **All-India** (`all_india`) and **Home-State first** (`hs_first`)
- Two ordering strategies: **Stronger-first** (`stronger_first`) and **Safer-first** (`safer_first`)
- Defaults: All-India + Stronger-first
- Uses recent data only (2024–2026) and labels each choice with a band

### 🏫 College Overview
- Ask *"Tell me about IIIT Kottayam"* and the backend answers straight from the dataset with the programmes offered in the latest round, without calling the LLM
- Small spelling mistakes in college names are tolerated

### 🧭 Guided Conversation
- For "what can I get?" style questions, the agent asks only for the details still missing: **rank, branch preference and location preference**
- Percentile → rank helper when you give a percentile instead of a rank
- Optional **Think mode**: the request asks the model to reason step by step before answering

### 📊 Data-Backed Answers
- Every rank and cutoff comes from a tool call over the JoSAA CSV, never from the model's memory
- **LangGraph agent loop** forces a tool round-trip for cutoff data
- For cutoff searches, the verified tool output is streamed directly instead of being re-written by the LLM, which avoids altered numbers and truncated answers
- Responses are streamed to the UI as Server-Sent Events (SSE)

---

## 💡 Demo Queries

```text
Which NIT can I get with rank 25,000?

Show all CSE openings and closings for NIT Trichy.

Which IIIT can I get with rank 51,000? Category: OPEN, Gender-Neutral, All-India quota.

Build my JoSAA choice list.
  Rank: 25,000 | Category: OPEN | Gender: Male
  Preferred courses: CSE, ECE, IT | Quota: All-India | Order: Stronger-first

I have 98.5 percentile. What's my approximate rank?

Show GFTIs available for rank 80,000, Gender-Neutral, OPEN category.

Tell me about IIIT Kottayam.
```

---

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                   React UI (frontend/, Vite)                    │
│                  ai-admission-agent.vercel.app                  │
│  - Chat interface, consumes the SSE stream                      │
│  - Keeps the chat transcript in the browser                     │
└────────────────────────┬────────────────────────────────────────┘
                         │  POST /chat  { message, history, think_mode }
┌────────────────────────▼────────────────────────────────────────┐
│                 FastAPI Backend (main.py)                       │
│  - Stateless: uses the last few history messages sent per call  │
│  - "Tell me about <college>" → answered from the CSV (no LLM)   │
│  - Otherwise streams the agent's events back as SSE             │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                  LangGraph Agent (agent.py)                     │
│                                                                 │
│   ┌──────────┐  tool calls?   ┌───────────────────┐             │
│   │  agent   │───── yes ─────▶│  tools (ToolNode) │             │
│   │ (ChatGroq│◀───────────────│                   │             │
│   │ + tools) │                └───────────────────┘             │
│   └────┬─────┘                                                  │
│        │ no tool calls                                          │
│        ▼                                                        │
│       END                                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │search_josaa_ │ │build_choice_ │ │percentile_to_│
    │cutoffs       │ │list          │ │rank          │
    │(Pandas)      │ │(Pandas)      │ │(heuristic)   │
    └──────┬───────┘ └──────┬───────┘ └──────────────┘
           │                │
           └────────┬───────┘
                    ▼
          ┌───────────────────┐
          │  JoSAA cutoff CSV │
          │  (loaded once)    │
          └───────────────────┘
```

**How a request flows**

1. The user types a question in the React UI.
2. The UI sends `POST /chat` with the message, the recent chat history and the Think-mode flag.
3. If the message is a general "tell me about <college>" request, the backend answers from the CSV and streams the result without using the LLM.
4. Otherwise the LangGraph `agent` node calls the Groq LLM (via LangChain's `ChatGroq`) with the three tools bound to it.
5. If the model requests a tool, the graph routes to the `tools` node, runs it, and returns to the `agent` node.
6. If the tool result is a cutoff table (or a "no matching records" message), the backend streams it as it is and the agent node ends the run without asking the LLM to repeat it.
7. Otherwise the LLM writes the final answer, which is streamed token by token.

---

## 🛠️ Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React + Vite (`frontend/`), hosted on Vercel | Chat UI |
| **Frontend services** | Firebase (client side) | Configured through `VITE_FIREBASE_*` variables; the backend does not use Firebase |
| **Backend** | FastAPI + Uvicorn | API and SSE streaming |
| **Agent orchestration** | **LangGraph** (`StateGraph`, `ToolNode`, conditional edges) | The agent ↔ tools loop |
| **LLM + tools layer** | **LangChain** (`langchain-groq`, `langchain-core`) | `ChatGroq`, `bind_tools`, `@tool`, message classes |
| **LLM provider** | Groq (default model `openai/gpt-oss-20b`) | Fast inference; model is configurable |
| **Data** | Pandas + CSV | Cutoff search and choice-list generation |
| **Data scripts** | `requests`, `pandas` | Building and cleaning the dataset |

> The project uses LangGraph for the agent loop and LangChain's integration packages for the model and tools. It does not use LangChain's older chain or `AgentExecutor` APIs.

---

## 📁 Project Structure

```text
AI-Admission-agent/
├── frontend/                 # React + Vite app (deployed to Vercel)
├── main.py                   # FastAPI app: POST /chat, SSE streaming, CORS
├── agent.py                  # LangGraph agent, tools, aliases, system prompt, data loading
├── build_josaa_dataset.py    # Step 1: download 2016–2024 JoSAA data → josaa_cutoffs.csv
├── add_2025_2026_data.py     # Step 2: append 2025 and 2026 data to josaa_cutoffs.csv
├── clean_josaa.py            # Step 3: keep 2024–2026 and clean josaa_cutoffs.csv
├── josaa_cutoffs.csv         # Cleaned cutoff dataset produced by the scripts above
├── jeesa_cutoffs.csv         # Extra dataset (not loaded by the backend)
├── requirements.txt          # Python dependencies
├── setup.txt                 # Short setup notes
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js (for the frontend)
- A Groq API key (free tier: [console.groq.com](https://console.groq.com))
- A Firebase project (the frontend reads its config from `VITE_FIREBASE_*` variables)

### Backend

1. **Clone the repo**
   ```bash
   git clone https://github.com/Dattasivasai/AI-Admission-agent.git
   cd AI-Admission-agent
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate        # Windows: .\venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create a `.env` file in the project root**
   ```env
   GROQ_API_KEY=your_groq_api_key
   # Optional: override the default model
   # GROQ_MODEL=openai/gpt-oss-20b
   ```

5. **Check the data path.** `agent.py` loads the CSV named by `DATA_PATH` at startup. To use the dataset built by the scripts in this repo, set it to `josaa_cutoffs.csv` (see [Data](#-data)).

6. **Run the backend**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   On startup you should see a line like `Loaded N JoSAA records from <file> (<first year>-<last year>)`.

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
# plus any other Firebase keys the app uses
```

Then start the dev server and open the URL Vite prints (usually `http://localhost:5173`):

```bash
npm run dev
```

---

## ⚙️ Configuration

### Backend environment variables (`.env` in the project root)

| Variable | Example | Purpose |
|----------|---------|---------|
| `GROQ_API_KEY` | `gsk_...` | Groq API authentication (`API_key` is accepted as a fallback name) |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Groq model to use (this is the default) |

### Frontend environment variables (`frontend/.env`)

| Variable | Example | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:8000` | Backend base URL |
| `VITE_FIREBASE_API_KEY` | `...` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `...` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | `...` | Firebase project ID |

### Settings in code

| Setting | Value | Where | Notes |
|---------|-------|-------|-------|
| `DATA_PATH` | `josaa_cutoffs_2026_round5.csv` | `agent.py` | CSV loaded once at startup; change it to match your data file |
| Temperature | `0.1` | `agent.py` | Low, to keep answers consistent |
| `max_tokens` | `800` | `agent.py` | Keeps responses inside Groq's request/token limits |
| `MAX_HISTORY_MESSAGES` | `4` | `main.py` | Only the last 4 history messages are sent to the agent |
| `MAX_HISTORY_CONTENT_CHARS` | `1200` | `main.py` | Each history message is trimmed to its last 1200 characters |
| CORS origins | `*` | `main.py` | Open to all origins; restrict this in production |

---

## 🔌 API

Interactive docs are available at `/docs` (FastAPI default).

### `GET /`
Health check. Returns `{"message": "JEE Admission Agent Backend is running!"}`.

### `POST /chat`
Request body:

```json
{
  "message": "Which NIT can I get with rank 25000?",
  "history": [
    { "role": "user",  "content": "..." },
    { "role": "agent", "content": "..." }
  ],
  "think_mode": false
}
```

- `history` is optional. The backend is stateless and only uses the most recent messages (see settings above). Roles are `user` and `agent`.
- `think_mode` is optional. When `true`, the message is prefixed with a "think step by step" instruction.

The response is a `text/event-stream`. Each event is `data: {JSON}` with one of these types:

| `type` | Meaning |
|--------|---------|
| `token` | A chunk of answer text (`content`) |
| `status` | A progress message, e.g. "Searching JoSAA cutoffs..." |
| `end` | The model finished an answer |
| `done` | The stream is over (always sent last) |
| `error` | Something went wrong (`content` has the message) |

---

## 🔧 Agent Tools

The LangGraph agent has three tools, defined with LangChain's `@tool`. The LLM decides which to call. **All tools return formatted plain text**, not JSON.

### 1. `search_josaa_cutoffs`
Find JoSAA opening/closing ranks for institutes, branches, categories and rank ranges.

| Parameter | Type | Description |
|-----------|------|-------------|
| `institute` | str | Institute name or alias, e.g. `"NIT Trichy"`, `"IITB"` |
| `institute_type` | str | One of `IIT`, `NIT`, `IIIT`, `GFTI` |
| `program` | str | Branch or alias, e.g. `"CSE"`, `"ECE"`, `"Mechanical"` |
| `year` | int | e.g. `2025` |
| `round` | int | Counselling round |
| `category` | str | Seat type, e.g. `OPEN`, `EWS`, `OBC-NCL`, `SC`, `ST` |
| `quota` | str | e.g. `OS` (other state / all-India), `HS` (home state), `AI` |
| `gender` | str | e.g. `Gender-Neutral`, `Female` |
| `min_closing_rank` | int | Set to the student's rank for "what can I get with rank X?" |
| `max_closing_rank` | int | Upper bound on closing rank (defaults to 3× the rank in rank searches) |
| `limit` | int | Rows to return (default 100; rank searches use 25) |

**Defaults the tool applies**
- Rank search with no category → `OPEN`; no gender → `Gender-Neutral`
- Rank search for NITs with no quota → `OS` (All-India)
- Institute + branch with no year/round → latest year, final available round, all quotas/categories/genders

**Output**
```text
Total matching rows: <N>. Rows displayed now: <M>.
1. <year> R<round> | <Institute> | <Programme> | <Quota> | <Seat type> | <Gender> | OR <opening> - CR <closing> [<Fit label>]
...
```
Fit labels (only in rank searches): **Close match** (closing rank within about 5% of your rank, minimum 500), **Realistic option** (within 25%), **Safer option** (further above). The tool ends with a summary of how many of each were shown.

### 2. `build_choice_list`
Generate a JoSAA-style preference order.

| Parameter | Type | Description |
|-----------|------|-------------|
| `rank` | int | All India Rank (required) |
| `category` | str | `OPEN`, `OBC-NCL`, `EWS`, `SC`, `ST`, … |
| `gender` | str | `Male` / `Gender-Neutral` are treated as Gender-Neutral; `Female` for female-only seats |
| `courses` | str | Ordered, comma-separated, e.g. `"CSE, ECE, IT"` |
| `quota_mode` | str | `all_india` (default) or `hs_first` |
| `order_style` | str | `stronger_first` (default) or `safer_first` |
| `max_choices` | int | Default 50, capped at 100 |

Uses 2024–2026 data, excludes PwD seats, and keeps programmes whose recent closing rank is at or above your rank. Each row is shown as `Choice No | Institute | Academic Program | Quota | Recent CR | Band`. Bands: **Safe** (closing rank ≥ 1.15× your rank) or **Moderate**.

### 3. `percentile_to_rank`
Convert a JEE Main percentile to a rough All India Rank using a simple piecewise-linear heuristic.

| Parameter | Type | Description |
|-----------|------|-------------|
| `percentile` | float | e.g. `98.5` |

Example: `98.5` → `Approximate Rank ≈ 18,000`. This is a rough estimate only, and the agent is instructed not to use it when you give a rank directly.

---

## 🗂️ Data

The dataset is built in three steps. Each script reads and writes `josaa_cutoffs.csv` in the project root.

| Step | Script | What it does |
|------|--------|--------------|
| 1 | `build_josaa_dataset.py` | Downloads the 2016–2024 JoSAA cutoff CSVs, renames columns to a common schema and writes `josaa_cutoffs.csv` |
| 2 | `add_2025_2026_data.py` | Appends 2025 (rounds 1–6) and 2026 (rounds 1–4) data from public sources and removes duplicates |
| 3 | `clean_josaa.py` | Keeps only 2024, 2025 and 2026, normalises whitespace, drops rows with no closing rank and saves the result |

**Columns:** `year`, `round`, `type`, `institute`, `academic_program`, `quota`, `seat_type`, `gender`, `opening_rank`, `closing_rank`.

**Notes**
- Preparatory-rank suffixes such as `238P` are converted to plain numbers (`238`) when the dataset is built.
- `agent.py` loads whichever file `DATA_PATH` points to. Set it to `josaa_cutoffs.csv` to use the dataset built by these scripts.
- Round coverage for the latest year depends on what was available when the data was collected.

**Sources**
- 2016–2024: [PardhavMaradani/josaa-sql-interface](https://github.com/PardhavMaradani/josaa-sql-interface)
- 2025: [three-tap-com/data-file-TT](https://github.com/three-tap-com/data-file-TT)
- 2026: [Harith-Y/JoSAA-CSAB-Closing-Rank-Predictor](https://github.com/Harith-Y/JoSAA-CSAB-Closing-Rank-Predictor)

---

## 🌐 Deployment

**Frontend (Vercel):**
- Set the project's root directory to `frontend`.
- Build command `npm run build`, output directory `dist` (Vite).
- Add `VITE_API_URL` (your deployed backend URL) and the `VITE_FIREBASE_*` variables in the Vercel project settings.

**Backend:** runs on any host that can run Uvicorn:

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port $PORT
```

- Set `GROQ_API_KEY` (and optionally `GROQ_MODEL`) as environment variables on the host.
- Deploy the dataset CSV that `DATA_PATH` points to together with the code.
- CORS currently allows all origins; restrict `allow_origins` in `main.py` to your frontend's URL for production.

---

## ⚠️ Important Disclaimers

### Data Accuracy
- This tool is **not official** and not endorsed by NTA or JoSAA.
- **Cutoff data is historical.** Current-year opening/closing ranks may differ based on:
  - Number of test-takers
  - Merit distribution across categories/quotas
  - Counselling dropouts or upgrades
- The data comes from third-party public sources (see [Data](#-data)). **Always verify** with the official JoSAA portal before making counselling decisions.

### Tool Output Limitations
- The **percentile → rank** conversion is a rough heuristic.
- **Fit labels, bands and choice lists** compare your rank against past closing ranks. They are not a guarantee of admission.
- The tools do not account for spot rounds or special counselling phases, supernumerary seats, or last-minute college closures or mergers.

### Recommendations
1. Use this tool as a **reference and learning aid**, not the sole decision factor.
2. Cross-check all data on [josaa.nic.in](https://josaa.nic.in).
3. Consult college prospectuses and mentor guidance.

---

## 🐛 Troubleshooting

### Backend

**`GROQ_API_KEY` not found / 401 errors**
- Put `.env` in the project root, next to `agent.py`.
- Check the key at [console.groq.com](https://console.groq.com).

**Model not found / decommissioned**
- Groq retires models over time. Set `GROQ_MODEL` in `.env` to a currently available model.

**Rate-limit or token-limit errors from Groq**
- The system prompt is kept short, history is trimmed and `max_tokens` is 800 to fit within free-tier limits. Wait and retry, or use a model with higher limits.

**`FileNotFoundError` for the CSV at startup**
- `DATA_PATH` in `agent.py` must match a file in the project folder. Run the three data scripts (or use the committed `josaa_cutoffs.csv`) and set `DATA_PATH` accordingly.

### Frontend

**API request blocked (CORS)**
- CORS is open by default. If you restricted `allow_origins`, add your frontend URL and restart the backend.

**Messages not appearing**
- Check the browser console and confirm `VITE_API_URL` points to a reachable backend. Restart `npm run dev` after editing `frontend/.env`.

### Data

**"No matching records found"**
- The message lists the filters used. Loosen them (remove year, round, quota or category) and try again.
- Institute and branch aliases such as `IITB`, `NIT Trichy`, `CSE` and `CS` are supported. Other spellings may not match.

**LLM returns numbers that look wrong**
- Numbers should only come from tool output. Check that tools are bound with `llm.bind_tools(tools)` in `agent.py` and that the system prompt is intact.

---

## 📝 Future Roadmap

- [ ] Add support for state-level engineering colleges (state CET data)
- [ ] Predictive rank estimator (ML model trained on historical trends)
- [ ] Preference list export as PDF/JSON
- [ ] Multi-language support (Hindi, Telugu, Tamil)
- [ ] Automated cutoff updates
- [ ] Test suite (pytest for the tools, integration tests for the agent, E2E for the API)

---

## 🤝 Contributing

Contributions are welcome:
1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## 👤 Author

**[Dattasivasai](https://github.com/Dattasivasai)**

---

## 🙏 Acknowledgments

- [LangGraph](https://langchain-ai.github.io/langgraph/) for agent orchestration
- [LangChain](https://www.langchain.com/) for the Groq integration and tool abstractions
- [Groq](https://groq.com/) for fast LLM inference
- [PardhavMaradani/josaa-sql-interface](https://github.com/PardhavMaradani/josaa-sql-interface), [three-tap-com/data-file-TT](https://github.com/three-tap-com/data-file-TT) and [Harith-Y/JoSAA-CSAB-Closing-Rank-Predictor](https://github.com/Harith-Y/JoSAA-CSAB-Closing-Rank-Predictor) for the public cutoff data
- JoSAA for the original cutoff data

---

**Happy counselling! 🎓**
