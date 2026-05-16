from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app import config
from app.routers.chat import router as chat_router

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="BCs Genie 2026",
    description="AI middleware — custom system prompts, context management, secure LLM routing.",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# API routes must be registered before the static-files catch-all
app.include_router(chat_router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


# Serve the React frontend. This must come AFTER API routes.
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
