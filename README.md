# 🎓 AI Admission Agent

**JEE Main / JoSAA counselling assistant** powered by real opening–closing rank data and an LLM tool-calling agent.

Ask about ranks, colleges and branches, and build a **JoSAA-style preference list**, grounded in historical cutoffs rather than invented numbers.

🌐 **Live:** [ai-admission-agent.vercel.app](https://ai-admission-agent.vercel.app)

![Python](https://img.shields.io/badge/Python-3.10%2B-green)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-teal)
![React](https://img.shields.io/badge/React-Frontend-blue)
![LangGraph](https://img.shields.io/badge/LangGraph-Agent-purple)
![LangChain](https://img.shields.io/badge/LangChain-Groq%20%2B%20Tools-darkgreen)
![Groq](https://img.shields.io/badge/LLM-Groq-orange)
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
- [Important Disclaimers](#-important-disclaimers)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

### 🔍 Cutoff Search
- **JoSAA opening & closing ranks** for IITs, NITs, IIITs and GFTIs
- Filter by institute (aliases like `IITB`, `NIT Trichy` are understood), institute type, branch, year, round, category, quota and gender
- Rank-based queries such as *"What can I get with rank 25,000?"*
- Each result in a rank search is tagged **Close match**, **Realistic option** or **Safer option** relative to your rank
- Fast in-memory filtering with Pandas (the CSV is loaded once at startup)

### 📋 Choice List Builder
- Build a **JoSAA-style preference order** from your rank and an ordered list of courses (e.g. CSE → ECE → IT)
- Two quota modes: **All-India** (`all_india`) and **Home-State first** (`hs_first`)
- Two ordering strategies: **Stronger-first** (`stronger_first`) and **Safer-first** (`safer_first`)
- Defaults: All-India + Stronger-first
- Uses recent data only (2024–2026) and labels each choice with a band

### 🧭 Guided Conversation
- For "what can I get?" style questions, the agent asks only for the details still missing: **rank, branch preference and location preference**
- Percentile → rank helper when you give a percentile instead of a rank
- Conversation context is kept within a chat session

### 📊 Data-Backed Answers
- Every rank and cutoff comes from a tool call over the JoSAA CSV, never from the model's memory
- **LangGraph agent loop** forces a tool round-trip for cutoff data
- For cutoff searches, the verified tool output is returned directly instead of being re-written by the LLM, which avoids altered numbers and truncated answers
- Streaming responses in the chat UI

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
```

---

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                      React UI (frontend/)                       │
│                  ai-admission-agent.vercel.app                  │
│  - Chat interface with streamed responses                       │
└────────────────────────┬────────────────────────────────────────┘
                         │  chat request
┌────────────────────────▼────────────────────────────────────────┐
│                 FastAPI Backend (main.py)                       │
│  - Receives the chat request                                    │
│  - Streams the agent's output back to the UI                    │
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
2. The FastAPI backend passes it to the LangGraph agent.
3. The `agent` node calls the Groq LLM (via LangChain's `ChatGroq`) with the three tools bound to it.
4. If the model requests a tool, the graph routes to the `tools` node, runs it, and returns to the `agent` node.
5. If the tool result is a cutoff table (or a "no matching records" message), the agent node ends the run without asking the LLM to repeat it, and the text is streamed to the UI as it is.
6. Otherwise the LLM writes the final answer, which is streamed to the UI.

---

## 🛠️ Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React (`frontend/`), hosted on Vercel | Chat UI |
| **Backend** | FastAPI + Uvicorn | API and response streaming |
| **Agent orchestration** | **LangGraph** (`StateGraph`, `ToolNode`, conditional edges) | The agent ↔ tools loop |
| **LLM + tools layer** | **LangChain** (`langchain-groq`, `langchain-core`) | `ChatGroq`, `bind_tools`, `@tool`, message classes |
| **LLM provider** | Groq (default model `openai/gpt-oss-20b`) | Fast inference; model is configurable |
| **Data** | Pandas + CSV | Cutoff search and choice-list generation |
| **Data scripts** | `requests`, `beautifulsoup4` | Building and cleaning the dataset |

> The project uses LangGraph for the agent loop and LangChain's integration packages for the model and tools. It does not use LangChain's older chain or `AgentExecutor` APIs.

---

## 📁 Project Structure

```text
AI-Admission-agent/
├── frontend/                 # React app (deployed to Vercel)
├── main.py                   # FastAPI app: chat endpoint and response streaming
├── agent.py                  # LangGraph agent, tools, aliases, system prompt, data loading
├── build_josaa_dataset.py    # Builds the cutoff dataset
├── clean_josaa.py            # Cleans raw JoSAA data
├── add_2025_2026_data.py     # Adds 2025–2026 data to the dataset
├── josaa_cutoffs.csv         # JoSAA cutoff data
├── jeesa_cutoffs.csv         # Additional cutoff data
├── requirements.txt          # Python dependencies
├── setup.txt                 # Setup notes
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js (for the frontend)
- A Groq API key (free tier: [console.groq.com](https://console.groq.com))

### Backend

1. **Clone the repo**
   ```bash
   git clone https://github.com/Dattasivasai/AI-Admission-agent.git
   cd AI-Admission-agent
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create a `.env` file** next to `agent.py`
   ```env
   GROQ_API_KEY=gsk_your_key_here
   # Optional: override the default model
   # GROQ_MODEL=openai/gpt-oss-20b
   ```

5. **Check the data path.** `agent.py` loads the CSV named by `DATA_PATH` at startup. Make sure it points to a file you actually have (for example `josaa_cutoffs.csv`).

6. **Run the backend**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   On startup you should see a line like `Loaded N JoSAA records from <file> (<first year>-<last year>)`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Point the frontend at your backend URL (see the API base URL setting in `frontend/`).

---

## ⚙️ Configuration

### Environment variables (backend)

| Variable | Example | Purpose |
|----------|---------|---------|
| `GROQ_API_KEY` | `gsk_...` | Groq API authentication (`API_key` is accepted as a fallback name) |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Groq model to use (this is the default) |

### Settings in code (`agent.py`)

| Setting | Value | Notes |
|---------|-------|-------|
| `DATA_PATH` | `josaa_cutoffs_2026_round5.csv` | CSV loaded once at startup; change it to match your data file |
| Temperature | `0.1` | Low, to keep answers consistent |
| `max_tokens` | `800` | Keeps responses inside Groq's request/token limits |

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

## 🌐 Deployment

**Frontend:** deployed on Vercel from the `frontend/` directory. Set the backend API URL as an environment variable in your Vercel project.

**Backend:** runs on any host that can run Uvicorn:

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port $PORT
```

- Set `GROQ_API_KEY` (and optionally `GROQ_MODEL`) as environment variables on the host.
- Make sure the dataset CSV that `DATA_PATH` points to is deployed with the code.
- Allow your frontend's origin in the backend's CORS settings.

---

## ⚠️ Important Disclaimers

### Data Accuracy
- This tool is **not official** and not endorsed by NTA or JoSAA.
- **Cutoff data is historical.** Current-year opening/closing ranks may differ based on:
  - Number of test-takers
  - Merit distribution across categories/quotas
  - Counselling dropouts or upgrades
- **Always verify** with the official JoSAA portal before making counselling decisions.

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
- Put `.env` in the same folder as `agent.py`.
- Check the key at [console.groq.com](https://console.groq.com).

**Model not found / decommissioned**
- Groq retires models over time. Set `GROQ_MODEL` in `.env` to a currently available model.

**Rate-limit or token-limit errors from Groq**
- The system prompt is kept short and `max_tokens` is 800 to fit within the free-tier limits. Lower the `limit` used in searches or wait and retry.

**`FileNotFoundError` for the CSV at startup**
- `DATA_PATH` in `agent.py` must match a file in the project folder.

### Frontend

**API request blocked (CORS)**
- Add your frontend URL to the backend's allowed origins and restart the backend.

**Messages not appearing**
- Check the browser console and confirm the frontend's backend URL setting is correct and the backend is reachable.

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
- JoSAA for the historical cutoff data

---

**Happy counselling! 🎓**
