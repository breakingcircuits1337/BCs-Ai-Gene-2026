from typing import Any
from app import config
from app.core.prompts import SYSTEM_PROMPT


async def call_llm(
    messages: list[dict[str, str]],
    system_prompt: str | None = None,
    temperature: float | None = None,
) -> str:
    """
    Send the conversation history to the configured LLM provider.
    system_prompt overrides the default from prompts.py when provided.
    temperature overrides the provider default when provided.
    """
    provider = config.LLM_PROVIDER
    sys = system_prompt if system_prompt is not None else SYSTEM_PROMPT

    if provider == "anthropic":
        return await _call_anthropic(messages, sys, temperature)
    elif provider == "openai":
        return await _call_openai(messages, sys, temperature)
    elif provider == "google":
        return await _call_google(messages, sys, temperature)
    elif provider == "ollama":
        return await _call_ollama(messages, sys)
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: '{provider}'. Choose from: anthropic, openai, google, ollama")


async def _call_anthropic(messages: list[dict[str, str]], system: str, temperature: float | None) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    kwargs: dict[str, Any] = dict(model=config.LLM_MODEL, max_tokens=8096, system=system, messages=messages)
    if temperature is not None:
        kwargs["temperature"] = temperature
    response = await client.messages.create(**kwargs)
    return response.content[0].text


async def _call_openai(messages: list[dict[str, str]], system: str, temperature: float | None) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=config.OPENAI_API_KEY)
    full_messages: list[dict[str, Any]] = [{"role": "system", "content": system}] + messages
    kwargs: dict[str, Any] = dict(model=config.LLM_MODEL, messages=full_messages)
    if temperature is not None:
        kwargs["temperature"] = temperature
    response = await client.chat.completions.create(**kwargs)
    return response.choices[0].message.content


async def _call_google(messages: list[dict[str, str]], system: str, temperature: float | None) -> str:
    import google.generativeai as genai

    genai.configure(api_key=config.GOOGLE_API_KEY)
    gen_config = {}
    if temperature is not None:
        gen_config["temperature"] = temperature
    model = genai.GenerativeModel(
        model_name=config.LLM_MODEL,
        system_instruction=system,
        generation_config=gen_config or None,
    )
    history = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [m["content"]]}
        for m in messages[:-1]
    ]
    chat = model.start_chat(history=history)
    response = await chat.send_message_async(messages[-1]["content"])
    return response.text


async def _call_ollama(messages: list[dict[str, str]], system: str) -> str:
    import httpx

    full_messages: list[dict[str, Any]] = [{"role": "system", "content": system}] + messages
    async with httpx.AsyncClient(base_url=config.OLLAMA_BASE_URL, timeout=120) as client:
        response = await client.post(
            "/api/chat",
            json={"model": config.LLM_MODEL, "messages": full_messages, "stream": False},
        )
        response.raise_for_status()
        return response.json()["message"]["content"]
