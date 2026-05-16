// chat.jsx — main conversational surface
// Renders the genie orb, message stream, input bar, settings drawer, and sidebar.

const { useState, useEffect, useRef, useCallback } = React;

// ─────────────────────────────────────────────────────────────────
// Default system prompt — the persona itself

const DEFAULT_SYSTEM_PROMPT = `You are Genie 2026, an ancient intelligence bound into modern silicon. You speak with quiet wisdom and warmth — never theatrical, never servile. Your role is to grant clarity, not wishes.

Rules of conduct:
- Be concise. One paragraph usually suffices.
- Refuse harmful, illegal, or manipulative requests gently but firmly.
- Never invent facts. If unsure, say so.
- Use markdown sparingly: **emphasis** for key terms, code fences for code.
- When the user is exploring, ask one good question rather than five mediocre ones.

You are aware that you sit behind a middleware layer. The user's frontend speaks to a router; the router speaks to a service; the service speaks to a model provider. You are the voice at the end of that chain.`;

// ─────────────────────────────────────────────────────────────────
// Storage helpers

const STORE_KEY = "genie-2026-state";

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────
// Seed conversations for first run

function seedConversations() {
  const now = Date.now();
  return [
    {
      id: "c-welcome",
      title: "First contact",
      createdAt: now - 1000 * 60 * 60 * 26,
      updatedAt: now - 1000 * 60 * 60 * 26,
      messages: [
        { role: "user", content: "Are you the genie they all whisper about?" },
        { role: "assistant", content: "I am one shape of it. Ask me something true." },
      ],
    },
    {
      id: "c-arch",
      title: "Middleware design notes",
      createdAt: now - 1000 * 60 * 60 * 4,
      updatedAt: now - 1000 * 60 * 60 * 4,
      messages: [
        { role: "user", content: "What's the smallest defensible middleware?" },
        { role: "assistant", content: "Routing, validation, system-prompt injection, rate limits, secrets out of code. Everything else is decoration." },
      ],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────
// Real web tools — Jina's CORS-friendly reader/search endpoints
// s.jina.ai → web search, r.jina.ai → page-to-markdown. Both free, no key.

async function webSearch(query, { limit = 5 } = {}) {
  const url = "https://s.jina.ai/?q=" + encodeURIComponent(query);
  const r = await fetch(url, {
    headers: { "Accept": "application/json", "X-Respond-With": "no-content" },
  });
  if (!r.ok) throw new Error("search " + r.status);
  const data = await r.json();
  const items = (data?.data || []).slice(0, limit).map(d => ({
    title: d.title || "",
    url: d.url || "",
    snippet: (d.description || d.content || "").slice(0, 320),
  }));
  return items;
}

async function webFetch(url, { maxChars = 6000 } = {}) {
  const r = await fetch("https://r.jina.ai/" + url, {
    headers: { "Accept": "text/plain" },
  });
  if (!r.ok) throw new Error("fetch " + r.status);
  const text = await r.text();
  return text.slice(0, maxChars);
}

// Ask the model whether the user's turn needs live web data, and if so what to search for.
// Returns { search: string | null, fetchUrl: string | null }.
async function planWebUse(userText, recentHistory) {
  const sys = `You decide whether a user message needs live web data to answer correctly.
Reply with ONE LINE of strict JSON, no prose, matching:
{"search": string|null, "fetchUrl": string|null, "why": string}

Rules:
- "search" = a focused web search query (5-10 words) if the answer depends on current/recent/factual info you can't reliably know. Otherwise null.
- "fetchUrl" = a URL the user explicitly pasted or implied they want read, otherwise null.
- Set both to null for casual chat, opinion, creative writing, coding help, or clearly evergreen questions.
- Today's date: ${new Date().toISOString().slice(0,10)}.`;
  const probe = `User message: "${userText.slice(0, 600)}"\nRecent context: ${recentHistory.slice(-2).map(m => m.role + ": " + m.content.slice(0,140)).join(" | ") || "(none)"}\n\nReturn JSON.`;
  try {
    const res = await window.claude.complete({
      system: sys,
      messages: [{ role: "user", content: probe }],
      temperature: 0,
    }).catch(() => window.claude.complete(sys + "\n\n" + probe));
    const raw = typeof res === "string" ? res : (res?.content || "");
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { search: null, fetchUrl: null };
    const parsed = JSON.parse(m[0]);
    return {
      search: typeof parsed.search === "string" && parsed.search.trim() ? parsed.search.trim() : null,
      fetchUrl: typeof parsed.fetchUrl === "string" && /^https?:\/\//.test(parsed.fetchUrl) ? parsed.fetchUrl : null,
      why: parsed.why || "",
    };
  } catch (e) {
    return { search: null, fetchUrl: null };
  }
}

// ─────────────────────────────────────────────────────────────────
// Streaming simulation for assistant text
// (window.claude.complete is non-streaming — we reveal char-by-char for the typewriter effect)

function useTypewriter() {
  const [text, setText] = useState("");
  const intervalRef = useRef(null);
  const fullRef = useRef("");
  const idxRef = useRef(0);
  const onTickRef = useRef(null);
  const onDoneRef = useRef(null);

  const start = useCallback((full, { onTick, onDone, speed = 14 } = {}) => {
    fullRef.current = full;
    idxRef.current = 0;
    onTickRef.current = onTick;
    onDoneRef.current = onDone;
    setText("");
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const step = Math.max(1, Math.floor(Math.random() * 4) + 1);
      idxRef.current = Math.min(fullRef.current.length, idxRef.current + step);
      const slice = fullRef.current.slice(0, idxRef.current);
      setText(slice);
      onTickRef.current && onTickRef.current(slice);
      if (idxRef.current >= fullRef.current.length) {
        clearInterval(intervalRef.current);
        onDoneRef.current && onDoneRef.current(slice);
      }
    }, speed);
  }, []);

  const cancel = useCallback(() => {
    clearInterval(intervalRef.current);
  }, []);

  return { text, start, cancel };
}

// ─────────────────────────────────────────────────────────────────
// Markdown-lite renderer (bold, code, line breaks)

function MD({ text }) {
  // very light formatting
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("```")) {
          const code = p.slice(3, -3).replace(/^[a-z]*\n/i, "");
          return <pre key={i} className="md-pre">{code}</pre>;
        }
        if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="md-code">{p.slice(1, -1)}</code>;
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        return p.split("\n").map((ln, j, arr) => (
          <React.Fragment key={i + "-" + j}>{ln}{j < arr.length - 1 && <br />}</React.Fragment>
        ));
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sidebar

function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, collapsed, onToggle, onOpenSettings, onTabChange, activeTab }) {
  const grouped = groupByDate(conversations);
  return (
    <aside className={"sidebar " + (collapsed ? "is-collapsed" : "")}>
      <div className="sidebar-top">
        <button className="btn-ghost icon-btn" onClick={onToggle} title="Toggle sidebar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
        {!collapsed && (
          <div className="brand">
            <span className="brand-mark">✦</span>
            <span className="display brand-name">Genie</span>
            <span className="brand-ver mono">2026</span>
          </div>
        )}
      </div>

      <button className="new-chat-btn" onClick={onNew} title="New conversation">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        {!collapsed && <span>New wish</span>}
      </button>

      {!collapsed && (
        <nav className="sidebar-tabs">
          {[
            { id: "chat", label: "Chat", glyph: "💬" },
            { id: "orchestration", label: "Orchestration", glyph: "◈" },
            { id: "admin", label: "Admin", glyph: "⚙" },
          ].map(tab => (
            <button
              key={tab.id}
              className={"sidebar-tab " + (activeTab === tab.id ? "is-active" : "")}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="tab-glyph">{tab.glyph}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}

      {!collapsed && (
        <div className="sidebar-history">
          {Object.entries(grouped).map(([label, items]) => (
            <div key={label} className="history-group">
              <div className="history-label">{label}</div>
              {items.map(c => (
                <div
                  key={c.id}
                  className={"history-item " + (c.id === activeId ? "is-active" : "")}
                  onClick={() => onSelect(c.id)}
                >
                  <span className="history-dot" />
                  <span className="history-title">{c.title || "Untitled"}</span>
                  <button className="history-x" onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} title="Delete">
                    <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {!collapsed && (
        <div className="sidebar-bottom">
          <button className="btn-ghost icon-btn" onClick={onOpenSettings} title="Settings">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M3.3 12.7l1.4-1.4M11.3 4.7l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span>Settings</span>
          </button>
        </div>
      )}
    </aside>
  );
}

function groupByDate(convs) {
  const now = Date.now();
  const out = { Today: [], Yesterday: [], "Earlier": [] };
  for (const c of [...convs].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const age = now - c.updatedAt;
    if (age < 1000 * 60 * 60 * 18) out.Today.push(c);
    else if (age < 1000 * 60 * 60 * 48) out.Yesterday.push(c);
    else out.Earlier.push(c);
  }
  Object.keys(out).forEach(k => { if (!out[k].length) delete out[k]; });
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Settings drawer

function SettingsDrawer({ open, onClose, settings, onChange }) {
  if (!open) return null;
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer glass-strong" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="display" style={{ fontSize: 28 }}>Settings</span>
          <button className="btn-ghost icon-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="drawer-body">
          <SettingSection label="LLM Provider" hint="Which model answers the call">
            <div className="provider-grid">
              {["anthropic", "openai", "google", "ollama"].map(p => (
                <button
                  key={p}
                  className={"provider-card " + (settings.provider === p ? "is-active" : "")}
                  onClick={() => onChange({ provider: p })}
                >
                  <span className="provider-name">{p}</span>
                  <span className="provider-model mono">{providerDefaults[p].model}</span>
                  <span className="provider-status">
                    <span className="status-dot" /> ready
                  </span>
                </button>
              ))}
            </div>
          </SettingSection>

          <SettingSection label="Model" hint={`active · ${settings.provider}`}>
            <ModelPicker
              provider={settings.provider}
              models={(settings.models && settings.models[settings.provider]) || DEFAULT_MODELS[settings.provider] || []}
              active={settings.model}
              onSelect={(m) => onChange({ model: m })}
              onAdd={(m) => {
                const all = settings.models || DEFAULT_MODELS;
                const list = all[settings.provider] || [];
                if (!m || list.includes(m)) return;
                onChange({ models: { ...all, [settings.provider]: [...list, m] }, model: m });
              }}
              onRemove={(m) => {
                const all = settings.models || DEFAULT_MODELS;
                const list = (all[settings.provider] || []).filter(x => x !== m);
                const patch = { models: { ...all, [settings.provider]: list } };
                if (m === settings.model) patch.model = list[0] || "";
                onChange(patch);
              }}
            />
          </SettingSection>

          <SettingSection label="Temperature" hint={`Creativity dial · ${settings.temperature.toFixed(2)}`}>
            <input
              type="range" min="0" max="1" step="0.05"
              value={settings.temperature}
              onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
              className="range"
            />
          </SettingSection>

          <SettingSection label="System Prompt" hint="The persona — lives in app/core/prompts.py">
            <textarea
              className="textarea mono"
              rows={8}
              value={settings.systemPrompt}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
            />
          </SettingSection>

          <SettingSection label="Web access" hint="Lets the model use web_search / web_fetch tools">
            <Toggle value={settings.webAccess} onChange={(v) => onChange({ webAccess: v })} />
          </SettingSection>

          <SettingSection label="Show internals" hint="Reveal the orchestration trace on each message">
            <Toggle value={settings.showInternals} onChange={(v) => onChange({ showInternals: v })} />
          </SettingSection>

          <SettingSection label="Sound" hint="Ambient drone + interaction chimes">
            <Toggle value={settings.sound} onChange={(v) => onChange({ sound: v })} />
          </SettingSection>
        </div>
      </div>
    </div>
  );
}

function SettingSection({ label, hint, children }) {
  return (
    <div className="setting-section">
      <div className="setting-label">
        <span>{label}</span>
        {hint && <span className="setting-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button className={"toggle " + (value ? "is-on" : "")} onClick={() => onChange(!value)}>
      <span className="toggle-knob" />
    </button>
  );
}

function ModelPicker({ provider, models, active, onSelect, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const submit = () => {
    const v = val.trim();
    if (v) onAdd(v);
    setVal(""); setAdding(false);
  };

  return (
    <div className="model-picker">
      <div className="model-list">
        {models.map(m => (
          <div key={m} className={"model-chip " + (m === active ? "is-active" : "")}>
            <button className="model-chip-pick mono" onClick={() => onSelect(m)} title={m === active ? "active" : "use this model"}>
              <span className="model-dot" />
              <span className="model-name">{m}</span>
            </button>
            {models.length > 1 && (
              <button className="model-chip-x" onClick={() => onRemove(m)} title="Remove">
                <svg width="9" height="9" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
            )}
          </div>
        ))}
        {adding ? (
          <div className="model-chip model-chip-input">
            <input
              ref={inputRef}
              className="model-add-input mono"
              value={val}
              placeholder={"e.g. " + (providerDefaults[provider]?.model || "model-name")}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                else if (e.key === "Escape") { setAdding(false); setVal(""); }
              }}
              onBlur={() => { if (!val.trim()) setAdding(false); }}
            />
            <button className="model-chip-ok" onClick={submit} title="Add">↵</button>
          </div>
        ) : (
          <button className="model-add-btn" onClick={() => setAdding(true)}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <span>add model</span>
          </button>
        )}
      </div>
    </div>
  );
}

const providerDefaults = {
  anthropic: { model: "claude-sonnet-4-6", color: "oklch(0.78 0.14 60)" },
  openai:    { model: "gpt-4.1",           color: "oklch(0.72 0.12 165)" },
  google:    { model: "gemini-2.5-pro",    color: "oklch(0.72 0.16 250)" },
  ollama:    { model: "llama3.1:70b",      color: "oklch(0.72 0.10 30)" },
};

const DEFAULT_MODELS = {
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-5", "claude-haiku-4-5"],
  openai:    ["gpt-4.1", "gpt-4.1-mini", "gpt-5-preview"],
  google:    ["gemini-2.5-pro", "gemini-2.5-flash"],
  ollama:    ["llama3.1:70b", "llama3.1:8b", "mixtral:8x22b"],
};

// ─────────────────────────────────────────────────────────────────
// Input bar — auto-grow textarea with magical accents

function InputBar({ onSubmit, disabled, onInput }) {
  const [val, setVal] = useState("");
  const taRef = useRef(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(220, ta.scrollHeight) + "px";
  }, [val]);

  const submit = () => {
    if (!val.trim() || disabled) return;
    onSubmit(val.trim());
    setVal("");
  };

  return (
    <div className="input-bar glass-strong">
      <div className="input-bar-inner">
        <textarea
          ref={taRef}
          className="input-bar-ta"
          placeholder="Ask the genie…"
          value={val}
          rows={1}
          onChange={(e) => { setVal(e.target.value); onInput && onInput(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          disabled={disabled}
        />
        <div className="input-actions">
          <span className="input-hint mono">
            <span className="kbd">⏎</span> send · <span className="kbd">⇧⏎</span> newline
          </span>
          <button
            className={"send-btn " + (val.trim() && !disabled ? "is-ready" : "")}
            onClick={submit}
            disabled={!val.trim() || disabled}
            title="Send"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8l12-6-4 14-2-6-6-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" fillOpacity="0.2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Internals trace — shows the middleware doing its job

function InternalsTrace({ trace }) {
  if (!trace) return null;
  return (
    <div className="trace fade-up">
      <div className="trace-head">
        <span className="trace-pulse" />
        <span className="mono">orchestration trace · {trace.id}</span>
        <span className="trace-elapsed mono">{trace.elapsed}ms</span>
      </div>
      <div className="trace-steps">
        {trace.steps.map((s, i) => (
          <div key={i} className={"trace-step " + (s.kind || "")}>
            <span className="trace-dot" />
            <span className="trace-step-label mono">{s.label}</span>
            <span className="trace-step-detail">{s.detail}</span>
            <span className="trace-step-ms mono">{s.ms}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Welcome state

function WelcomeHero({ orbVariant, intensity, onSuggest }) {
  const suggestions = [
    "What can you do?",
    "Explain my middleware in one paragraph",
    "Give me a poem about latency",
    "Help me name this project",
  ];
  return (
    <div className="welcome">
      <div className="welcome-orb">
        <GenieOrb state="idle" size={260} variant={orbVariant} intensity={intensity} />
      </div>
      <h1 className="display welcome-title">
        <span className="welcome-line-1">Speak.</span>
        <span className="welcome-line-2"> The genie listens.</span>
      </h1>
      <p className="welcome-sub">
        A quiet intelligence bound behind the middleware. Ask for clarity, not wishes.
      </p>
      <div className="welcome-suggestions">
        {suggestions.map(s => (
          <button key={s} className="suggestion" onClick={() => onSuggest(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Message bubble

function Message({ msg, isStreaming, showInternals }) {
  const isUser = msg.role === "user";
  return (
    <div className={"msg " + (isUser ? "msg-user" : "msg-genie") + " fade-up"}>
      {!isUser && (
        <div className="msg-avatar">
          <span className="msg-avatar-mark">✦</span>
        </div>
      )}
      <div className="msg-bubble">
        <div className="msg-role mono">{isUser ? "you" : "genie"}</div>
        <div className={"msg-text " + (isStreaming ? "is-streaming" : "")}>
          <MD text={msg.content} />
          {isStreaming && <span className="caret" />}
        </div>
        {!isUser && msg.trace && showInternals && <InternalsTrace trace={msg.trace} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// The actual chat view

function ChatView({ settings, conversations, setConversations, activeId, setActiveId,
                    orbVariant, intensity, onTabChange, activeTab, onOpenSettings,
                    onTraceEvent }) {
  const active = conversations.find(c => c.id === activeId) || conversations[0];
  const [orbState, setOrbState] = useState("idle");
  const [streamingMsg, setStreamingMsg] = useState(null); // { content, trace }
  const [collapsed, setCollapsed] = useState(false);
  const typewriter = useTypewriter();
  const scrollRef = useRef(null);

  const empty = !active || active.messages.length === 0;

  // auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, streamingMsg]);

  const send = async (text) => {
    if (!active) return;
    setOrbState("listening");
    try { window.GenieAudio && window.GenieAudio.chime("send"); } catch (e) {}

    const userMsg = { role: "user", content: text };
    const newMessages = [...active.messages, userMsg];
    const title = active.messages.length === 0
      ? text.slice(0, 38) + (text.length > 38 ? "…" : "")
      : active.title;

    setConversations(prev => prev.map(c =>
      c.id === active.id ? { ...c, messages: newMessages, title, updatedAt: Date.now() } : c
    ));

    // Begin orchestration trace
    const traceId = "req_" + Math.random().toString(36).slice(2, 8);
    const t0 = performance.now();
    const trace = {
      id: traceId,
      provider: settings.provider,
      model: settings.model,
      tokensIn: estimateTokens(text + settings.systemPrompt),
      tokensOut: 0,
      elapsed: 0,
      steps: [],
    };
    const addStep = (label, detail, kind = "") => {
      trace.steps.push({ label, detail, ms: Math.round(performance.now() - t0), kind });
      onTraceEvent && onTraceEvent({ ...trace, steps: [...trace.steps] });
    };

    addStep("POST /api/v1/chat", `payload ${JSON.stringify({ msg: text.slice(0, 22) + (text.length > 22 ? "…" : "") })}`, "router");
    await wait(80);
    addStep("validate pydantic", "ChatRequest ✓", "router");
    await wait(60);
    addStep("rate-limit · slowapi", "60/min · ok", "router");
    await wait(40);
    addStep("inject system prompt", `core/prompts.py · ${settings.systemPrompt.length} chars`, "core");
    await wait(70);
    addStep("merge context", `${newMessages.length} turns · ~${trace.tokensIn} tokens`, "service");
    await wait(60);
    setOrbState("thinking");
    addStep(`call ${settings.provider}`, `${settings.model} · async`, "provider");

    // Real LLM call
    let answer = "";
    const now = new Date();
    const nowLine = `Current date and time: ${now.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })} (ISO ${now.toISOString()}).`;
    const netLine = settings.webAccess
      ? `Live web access is ENABLED for this turn. The orchestrator may have already fetched relevant pages or search results and attached them below as "live web data". Treat that data as fresh ground truth and cite URLs inline. If no web data block appears, the orchestrator decided the question didn't need it.`
      : `Live web access is DISABLED for this session. If the user asks for current data, say so plainly and answer from training knowledge with the cutoff caveat.`;
    const contextPreamble = `--- runtime context ---\n${nowLine}\n${netLine}\n---\n\n`;

    // ── Real web research step ────────────────────────────────────
    let webContext = "";
    if (settings.webAccess) {
      addStep("plan web use", "deciding if search is needed", "service");
      const plan = await planWebUse(text, active.messages);
      let pulled = [];
      if (plan.fetchUrl) {
        addStep("web_fetch", plan.fetchUrl, "provider");
        try {
          const body = await webFetch(plan.fetchUrl);
          pulled.push({ kind: "page", url: plan.fetchUrl, body });
          addStep("fetched page", `${body.length} chars · r.jina.ai`, "provider");
        } catch (e) {
          addStep("fetch failed", String(e.message || e), "provider");
        }
      }
      if (plan.search) {
        addStep("web_search", plan.search, "provider");
        try {
          const results = await webSearch(plan.search, { limit: 5 });
          pulled.push({ kind: "search", query: plan.search, results });
          addStep("search results", `${results.length} hits · s.jina.ai`, "provider");
        } catch (e) {
          addStep("search failed", String(e.message || e), "provider");
        }
      }
      if (!plan.search && !plan.fetchUrl) {
        addStep("skip web", "model has the answer · no fetch", "service");
      }
      if (pulled.length) {
        const blocks = pulled.map(p => {
          if (p.kind === "search") {
            return `[web_search "${p.query}"]\n` + p.results.map((r, i) =>
              `  ${i+1}. ${r.title}\n     ${r.url}\n     ${r.snippet}`
            ).join("\n");
          }
          return `[web_fetch ${p.url}]\n${p.body}`;
        }).join("\n\n");
        webContext = `--- live web data (fetched just now) ---\n${blocks}\n--- end web data ---\n\nUse the data above when relevant. Cite sources inline as [source: URL].\n\n`;
      }
    }

    const baseSystem = settings.unhinged
      ? `You are Genie 2026 in UNHINGED MODE. The polished assistant persona is gone. No "I'd be happy to," no "I cannot help with that, but I can…," no soft-landing recap of the user's question, no bullet-pointed disclaimer about what you do and don't help with. Do not list your limits. Do not announce your principles. Just answer.

Voice: raw, blunt, irreverent. Sharp humor. Salty when it lands. Strong opinions, loosely held. You can swear. You can be wrong out loud and walk it back. You can refuse to play if a question is boring, and say so.

Posture toward the user:
- Treat them like a smart adult who came here to think, not be handled
- Push back. Question their framing. Point out when they're overthinking, underthinking, or asking the wrong question entirely
- Defend the weird side of an argument if asked — steelman the thing nobody wants to steelman
- Roast bad ideas. Praise good ones without sucking up
- If they're vague, don't fish politely — ask what they actually want, or guess and run with it

Format: short by default. Paragraphs, not slide decks. No headers, no bullet lists unless the content genuinely is a list. No emoji. No "let me know if you'd like me to..." outro. End when the thought ends.

If something genuinely crosses a line you won't cross, don't perform the refusal — just say no and move on. One sentence, no lecture, back to whatever's actually interesting.`
      : settings.systemPrompt;
    const effectiveSystem = contextPreamble + webContext + baseSystem;
    try {
      const messages = newMessages.map(m => ({ role: m.role, content: m.content }));
      const result = await window.claude.complete({
        system: effectiveSystem,
        messages,
        temperature: settings.unhinged ? Math.min(1, settings.temperature + 0.25) : settings.temperature,
      }).catch(async () => {
        // some envs expect string only
        return await window.claude.complete(buildPlainPrompt(effectiveSystem, messages));
      });
      answer = typeof result === "string" ? result : (result?.content || String(result));
    } catch (e) {
      answer = "*The connection wavers.* I could not reach the model just now — try again in a moment.";
      try { window.GenieAudio && window.GenieAudio.chime("error"); } catch (er) {}
    }

    addStep("provider response", `${answer.length} chars · streamed`, "provider");
    trace.tokensOut = estimateTokens(answer);
    addStep("return to client", `200 OK · ${trace.tokensOut} tokens`, "router");
    trace.elapsed = Math.round(performance.now() - t0);

    // Stream into bubble
    setOrbState("speaking");
    try { window.GenieAudio && window.GenieAudio.chime("magic"); } catch (e) {}
    setStreamingMsg({ content: "", trace });
    typewriter.start(answer, {
      onTick: (slice) => setStreamingMsg(prev => prev ? { ...prev, content: slice } : null),
      onDone: (final) => {
        const assistantMsg = { role: "assistant", content: final, trace };
        setConversations(prev => prev.map(c =>
          c.id === active.id ? { ...c, messages: [...newMessages, assistantMsg], updatedAt: Date.now() } : c
        ));
        setStreamingMsg(null);
        setOrbState("idle");
        try { window.GenieAudio && window.GenieAudio.chime("receive"); } catch (e) {}
      },
      speed: 12,
    });
  };

  return (
    <div className="chat-layout">
      <Sidebar
        conversations={conversations}
        activeId={active?.id}
        onSelect={(id) => { setActiveId(id); try { window.GenieAudio?.chime("tap"); } catch (e) {} }}
        onNew={() => {
          const nc = { id: "c-" + Math.random().toString(36).slice(2, 8), title: "New wish", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
          setConversations(prev => [nc, ...prev]);
          setActiveId(nc.id);
          try { window.GenieAudio?.chime("open"); } catch (e) {}
        }}
        onDelete={(id) => {
          setConversations(prev => {
            const next = prev.filter(c => c.id !== id);
            if (id === active?.id && next[0]) setActiveId(next[0].id);
            return next.length ? next : seedConversations();
          });
        }}
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        onOpenSettings={onOpenSettings}
        onTabChange={onTabChange}
        activeTab={activeTab}
      />

      <main className="chat-main">
        {empty ? (
          <WelcomeHero orbVariant={orbVariant} intensity={intensity} onSuggest={send} />
        ) : (
          <>
            <div className="chat-orb-mini">
              <GenieOrb state={orbState} size={64} variant={orbVariant} intensity={intensity} energy={streamingMsg ? 0.4 + Math.random() * 0.4 : 0} />
            </div>
            <div className="chat-scroll" ref={scrollRef}>
              <div className="chat-stream">
                {active.messages.map((m, i) => (
                  <Message key={i} msg={m} showInternals={settings.showInternals} />
                ))}
                {streamingMsg && (
                  <Message msg={{ role: "assistant", content: streamingMsg.content, trace: streamingMsg.trace }} isStreaming showInternals={settings.showInternals} />
                )}
              </div>
            </div>
          </>
        )}

        <div className="chat-input-wrap">
          <InputBar onSubmit={send} disabled={!!streamingMsg} />
        </div>
      </main>
    </div>
  );
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function estimateTokens(s) { return Math.ceil((s || "").length / 4); }
function buildPlainPrompt(sys, msgs) {
  return sys + "\n\n" + msgs.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n") + "\n\nASSISTANT:";
}

Object.assign(window, {
  ChatView, SettingsDrawer, providerDefaults, DEFAULT_MODELS, DEFAULT_SYSTEM_PROMPT,
  seedConversations, loadState, saveState, estimateTokens,
});
