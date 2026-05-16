from fastapi import APIRouter, Request
from pydantic import BaseModel, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address

from app import config
from app.services.llm_api import call_llm

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/v1", tags=["chat"])


class Message(BaseModel):
    role: str
    content: str

    @field_validator("role")
    @classmethod
    def role_must_be_valid(cls, v: str) -> str:
        if v not in {"user", "assistant"}:
            raise ValueError("role must be 'user' or 'assistant'")
        return v

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("content must not be empty")
        return v


class ChatRequest(BaseModel):
    messages: list[Message]
    system_prompt: str | None = None
    temperature: float | None = None

    @field_validator("messages")
    @classmethod
    def messages_not_empty(cls, v: list[Message]) -> list[Message]:
        if not v:
            raise ValueError("messages list must not be empty")
        if v[-1].role != "user":
            raise ValueError("last message must be from the user")
        return v

    @field_validator("temperature")
    @classmethod
    def temperature_in_range(cls, v: float | None) -> float | None:
        if v is not None and not (0.0 <= v <= 2.0):
            raise ValueError("temperature must be between 0.0 and 2.0")
        return v


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
@limiter.limit(config.RATE_LIMIT)
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    history = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = await call_llm(history, system_prompt=body.system_prompt, temperature=body.temperature)
    return ChatResponse(reply=reply)
