from typing import Any
from app import config
from app.core.prompts import SYSTEM_PROMPT


async def call_llm(messages: list[dict[str, str]]) -> str:
    """
    Send the conversation history (with system prompt injected) to the
    configured LLM provider and return the assistant reply as a string.
    """
    provider = config.LLM_PROVIDER

    if provider == "anthropic":
        return await _call_anthropic(messages)
    elif provider == "openai":
        return await _call_openai(messages)
    elif provider == "google":
        return await _call_google(messages)
    elif provider == "ollama":
        return await _call_ollama(messages)
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: '{provider}'. Choose from: anthropic, openai, google, ollama")


async def _call_anthropic(messages: list[dict[str, str]]) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model=config.LLM_MODEL,
        max_tokens=8096,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    return response.content[0].text


async def _call_openai(messages: list[dict[str, str]]) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=config.OPENAI_API_KEY)
    full_messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    response = await client.chat.completions.create(
        model=config.LLM_MODEL,
        messages=full_messages,
    )
    return response.choices[0].message.content


async def _call_google(messages: list[dict[str, str]]) -> str:
    import google.generativeai as genai

    genai.configure(api_key=config.GOOGLE_API_KEY)
    model = genai.GenerativeModel(
        model_name=config.LLM_MODEL,
        system_instruction=SYSTEM_PROMPT,
    )
    # Convert to Google's history format
    history = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [m["content"]]}
        for m in messages[:-1]
    ]
    chat = model.start_chat(history=history)
    response = await chat.send_message_async(messages[-1]["content"])
    return response.text


async def _call_ollama(messages: list[dict[str, str]]) -> str:
    import httpx

    full_messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    async with httpx.AsyncClient(base_url=config.OLLAMA_BASE_URL, timeout=120) as client:
        response = await client.post(
            "/api/chat",
            json={"model": config.LLM_MODEL, "messages": full_messages, "stream": False},
        )
        response.raise_for_status()
        return response.json()["message"]["content"]
