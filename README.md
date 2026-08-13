# 🎓 AI Admission Agent

**JEE Main / JoSAA counselling assistant** powered by real opening–closing rank data and an LLM tool-calling agent.

Ask about ranks, colleges, branches, and build a **JoSAA-style preference list** — grounded in historical cutoffs, not invented numbers.

🌐 **Live:** [ai-admission-agent.vercel.app](https://ai-admission-agent.vercel.app)

![Python](https://img.shields.io/badge/Python-3.10%2B-green)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-teal)
![React](https://img.shields.io/badge/React-TypeScript-blue)
![LangGraph](https://img.shields.io/badge/LangGraph-Agent-purple)
![Groq](https://img.shields.io/badge/LLM-Groq-orange)
![Firebase](https://img.shields.io/badge/Auth-Firebase-yellow)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 📖 Table of Contents

- [Features](#-features)
- [Demo queries](#-demo-queries)
- [Architecture](#-architecture)
- [Tech stack](#-tech-stack)
- [Project structure](#-project-structure)
- [Quick start](#-quick-start)
- [Configuration](#️-configuration)
- [Agent tools](#-agent-tools)
- [Deployment](#-deployment)
- [Important disclaimers](#-important-disclaimers)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

### 🔍 Cutoff search
- Search **JoSAA opening & closing ranks** (NITs, IIITs, IITs, GFTIs)
- Filter by institute, branch, year, round, category, quota, gender
- Rank-based queries: *“What can I get with rank 25,000?”*

### 📋 Choice list builder
- Build a **JoSAA-style preference order** from rank + course priorities (e.g. CSE → ECE → IT)
- Options: All-India vs HS-first, stronger-first vs safer-first
- Defaults: All-India + stronger-first (unless the user asks otherwise)

### 💬 Chat experience
- Streaming answers (SSE)
- Google sign-in + **chat history** (Firebase)
- Guest mode: fresh chat each visit (no saved history)
- Stop generation while streaming

### 📊 Data-backed answers
- Pandas search over JoSAA CSV (prefer recent years, e.g. 2024–2026)
- LLM uses **tools** — should not invent cutoff numbers
- Optional percentile → approximate rank helper

---

## 💡 Demo queries

```text
Which NIT can I get with 25000 rank?
Show CSE cutoffs for NIT Trichy
Which IIIT can I get with 51000 rank? Category OPEN, Gender-Neutral
Build my JoSAA choice list.
  Rank: 25000 | Category: OPEN | Gender: male
  Courses: CSE, ECE | Quota: All India | Order: stronger first
98.5 percentile is approximately what rank?
