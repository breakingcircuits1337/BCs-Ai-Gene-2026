# BCs Genie 2026

> AI middleware with a year-2030 mystical UI — Chat, Orchestration visualizer, and Admin dashboard in one app.

![Dark mystical interface with deep blues, purples, and gold lamp-glow accents]

---

## What it is

Genie 2026 is a FastAPI middleware that sits between a browser UI and a target LLM. It enforces a custom system prompt, manages conversation context, enforces rate limits, and routes requests to whichever provider you configure. The frontend is a full React chat app with a reactive genie orb, live orchestration trace, admin panel, web browsing, and ambient audio.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, Uvicorn |
| LLM providers | Anthropic, OpenAI, Google Gemini, Ollama (local) |
| Rate limiting | slowapi |
| Frontend | React 18 (UMD, no build step), Babel standalone |
| Fonts | Instrument Serif, Geist, JetBrains Mono |
| Deployment | Docker → Zeabur (or any cloud PaaS) |

---

## Project structure

```
├── app/
│   ├── main.py              # FastAPI entry point, CORS, rate limiter, static files
│   ├── config.py            # Env var loader (os.getenv only)
│   ├── core/
│   │   └── prompts.py       # Genie 2026 system prompt
│   ├── routers/
│   │   └── chat.py          # POST /api/v1/chat  (Pydantic validation)
│   └── services/
│       └── llm_api.py       # Async LLM calls — Anthropic / OpenAI / Google / Ollama
├── frontend/
│   ├── index.html           # Entry point
│   ├── claude-bridge.js     # window.claude.complete → POST /api/v1/chat
│   ├── theme.css            # Dark mystical design system
│   ├── layout.css           # Full layout rules
│   ├── audio.js             # Web Audio chimes + ambient drone
│   ├── orb.jsx              # Canvas genie orb (sphere / lamp / abstract)
│   ├── chat.jsx             # Chat surface, sidebar, settings drawer
│   ├── architecture.jsx     # Live SVG orchestration visualizer
│   ├── admin.jsx            # Ops dashboard, guardrails, thinking logs
│   └── app.jsx              # Root — tab routing, shared state, tweaks panel
├── Dockerfile
├── requirements.txt
├── .env.example
└── CLAUDE.md                # Architecture guide for AI coding agents
```

---

## Quick start

```bash
# 1. Clone and enter the repo
git clone https://github.com/breakingcircuits1337/BCs-Ai-Gene-2026.git
cd BCs-Ai-Gene-2026

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env — add at least one LLM provider API key and set LLM_PROVIDER

# 5. Run
uvicorn app.main:app --reload
```

Open **http://localhost:8000** — the Genie 2026 UI loads directly.

The interactive API docs are at **http://localhost:8000/docs**.

---

## Environment variables

Copy `.env.example` to `.env` and fill in the relevant values.

```env
# Pick one: openai | anthropic | google | ollama
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6

# API keys — only the one matching LLM_PROVIDER is required
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# CORS — comma-separated list of allowed frontend origins
ALLOWED_ORIGINS=http://localhost:3000

# Rate limiting
RATE_LIMIT=20/minute
```

---

## API

### `POST /api/v1/chat`

Send a conversation and receive the genie's reply.

**Request**
```json
{
  "messages": [
    { "role": "user", "content": "Who are you?" }
  ],
  "system_prompt": "Optional override for the default system prompt.",
  "temperature": 0.7
}
```

`system_prompt` and `temperature` are optional. When omitted the defaults from `app/core/prompts.py` and the provider's default are used.

**Response**
```json
{ "reply": "I am Genie 2026..." }
```

### `GET /health`

Returns `{"status": "ok"}` — useful for container health checks.

---

## UI features

| Feature | Details |
|---|---|
| **Chat** | Sidebar conversation history, typewriter streaming, markdown rendering, suggestion chips |
| **Genie orb** | Canvas-animated — three variants: sphere, lamp, abstract. Reacts to idle / listening / thinking / speaking states |
| **Orchestration trace** | Every message shows the full middleware pipeline steps with timing |
| **Orchestration tab** | Live SVG node graph — particles travel along edges as each pipeline step fires |
| **Admin tab** | Request KPIs, sparkline, system prompt editor, provider switcher, per-provider model list, guardrails panel, thinking logs per conversation |
| **Guardrails** | Each safety rail has an individual toggle. "Unhinged mode" drops them all and switches the system prompt |
| **Web access** | Toggle in Settings — uses Jina's CORS-friendly reader/search APIs to give the model live data |
| **Settings drawer** | Provider selector, model picker (add/remove models), temperature slider, system prompt editor, sound toggle |
| **Tweaks panel** | Orb variant, animation intensity, layout density |
| **Sound** | Generative Web Audio chimes (send / receive / magic / error) + ambient drone |

---

## Docker

```bash
docker build -t genie-2026 .
docker run -p 8000:8000 \
  -e LLM_PROVIDER=anthropic \
  -e ANTHROPIC_API_KEY=your_key_here \
  -e ALLOWED_ORIGINS=https://yourdomain.com \
  genie-2026
```

---

## Deploying to Zeabur

1. Push this repo to GitHub — **do not commit `.env`**.
2. Create a new project in [Zeabur](https://zeabur.com) and link the repo.
3. Add environment variables in the Zeabur dashboard (`LLM_PROVIDER`, `ANTHROPIC_API_KEY`, etc.).
4. Deploy — Zeabur detects the Dockerfile automatically and builds the image.

---

## Customising the system prompt

Edit `app/core/prompts.py`. The `SYSTEM_PROMPT` constant is prepended to every request before it reaches the model. No redeployment is needed if you're running locally with `--reload`; in production, redeploy after changing it.

The Admin tab also exposes a live system prompt editor — changes take effect immediately for that session but are not persisted to disk.

---

## Security notes

- API keys live in `.env` and are loaded via `os.getenv()` — never hardcoded.
- `.gitignore` excludes `.env`.
- CORS is restricted to `ALLOWED_ORIGINS`.
- Rate limiting via `slowapi` on the `/api/v1/chat` endpoint.
- All incoming payloads are validated with Pydantic before reaching the service layer.
