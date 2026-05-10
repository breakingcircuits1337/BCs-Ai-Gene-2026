# BCs Genie 2026 — AI Middleware Architecture Guide

## Project Overview

**BCs Genie 2026** is an AI middleware application. It sits between the user interface and a target LLM, acting as the orchestration layer to enforce custom system prompts, manage context, and secure API interactions.

## Technology Stack

- **Language**: Python 3.11+
- **Framework**: FastAPI (high-performance, async API routing)
- **Server**: Uvicorn (ASGI)
- **Environment Management**: python-dotenv
- **LLM SDKs**: `openai`, `anthropic`, `google-generativeai` (external) OR `ollama` (local open-weights)
- **Rate Limiting**: `slowapi`
- **Containerization**: Docker
- **Deployment Target**: Zeabur (or similar cloud PaaS)

## Project Structure

```
bcs-genie-2026/
├── .env                        # Secret API keys — NEVER commit
├── .gitignore
├── requirements.txt            # Python dependencies
├── Dockerfile                  # Container build instructions
└── app/
    ├── __init__.py
    ├── main.py                 # FastAPI app entry point, CORS config
    ├── config.py               # Loads env vars via os.getenv()
    ├── routers/
    │   └── chat.py             # POST /api/v1/chat endpoint
    ├── services/
    │   └── llm_api.py          # Outbound LLM provider calls (async)
    └── core/
        └── prompts.py          # Genie 2026 system instructions
```

## Core Components

### `app/core/prompts.py` — System Prompt Engine

Defines the persona, operational boundaries, and response formatting for "Genie 2026". The middleware intercepts every user input and prepends/appends these instructions before the payload reaches the LLM. Store the system prompt as a constant string, or load it dynamically from a database if updates are needed without redeployment.

### `app/services/llm_api.py` — API Service Layer

Handles all outbound calls to the LLM provider.

- **Open-Weights Option**: Use Ollama for local model deployment to avoid dependency on external APIs.
- **Context Management**: Take the user's new message, append it to the running chat history, and inject the system instructions so every call includes full context.
- **Async**: All LLM calls must use `async def` — never block the server waiting on a response.

### `app/routers/chat.py` — Routing Layer

Exposes `POST /api/v1/chat` — the single endpoint the frontend communicates with.

1. Receives and validates the incoming JSON payload (Pydantic model).
2. Passes data to the Service Layer.
3. Returns the LLM response to the client.

### `app/main.py` — Application Entry Point

- Instantiates the FastAPI app.
- Registers the chat router.
- Configures CORS middleware to restrict requests to the specific frontend origin.
- Mounts the rate limiter (`slowapi`).

### `app/config.py` — Configuration

Loads all environment variables using `os.getenv()`. Never hardcode keys.

## Security & Guardrails

| Concern | Implementation |
|---|---|
| API keys | Stored in `.env`, accessed via `os.getenv()`, excluded from version control via `.gitignore` |
| CORS | Configure in `main.py` to only allow requests from the designated frontend domain |
| Rate limiting | Use `slowapi` on the `/api/v1/chat` endpoint |
| Input validation | Use Pydantic request models in `chat.py`; reject malformed payloads immediately |

## Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /code
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt
COPY ./app /code/app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Deployment (Zeabur)

1. Push the repository to GitHub — **exclude `.env`**.
2. Link the repository to your Zeabur project.
3. Add environment variables (API keys) in the Zeabur dashboard.
4. Deploy — Zeabur auto-detects the Dockerfile and builds the image.

## Development Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your API keys
uvicorn app.main:app --reload
```

## Environment Variables (`.env`)

```
# Choose one LLM provider
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# Active provider: openai | anthropic | google | ollama
LLM_PROVIDER=anthropic

# Model name
LLM_MODEL=claude-sonnet-4-6
```

## Key Conventions

- All LLM calls are `async`.
- No API keys in source code — always `os.getenv()`.
- Pydantic models validate every incoming request at the router boundary.
- The system prompt lives exclusively in `app/core/prompts.py` — not scattered across the codebase.
- Rate limiting is applied at the router level via `slowapi` decorators.
