// admin.jsx — Admin dashboard: metrics, system prompt editor, guardrails, recent traces

const { useState: useAdminState, useEffect: useAdminEffect, useMemo: useAdminMemo } = React;

function AdminView({ settings, onChange, conversations, recentTraces }) {
  return (
    <div className="admin-view">
      <div className="admin-head">
        <div>
          <div className="admin-eyebrow mono">/admin · genie-2026</div>
          <h2 className="display admin-title">Operations</h2>
          <p className="admin-sub">The control surface for the middleware. Edits propagate live.</p>
        </div>
        <div className="admin-pulse">
          <span className="status-dot" />
          <span className="mono">healthy · uvicorn :8000</span>
        </div>
      </div>

      <div className="admin-grid">
        <Card title="Requests · last 24h" eyebrow="metrics" span={2}>
          <Sparkline data={fakeSeries(48, 12, 80)} accent="gold" />
          <div className="admin-kpis">
            <KPI label="requests" value="2,847" delta="+12%" />
            <KPI label="avg latency" value="612ms" delta="-8%" />
            <KPI label="p95 latency" value="1.4s" delta="+3%" />
            <KPI label="error rate" value="0.4%" delta="-0.2%" />
          </div>
        </Card>

        <Card title="Token economy" eyebrow="usage">
          <div className="ring-wrap">
            <Ring value={68} label="68%" sub="of monthly quota" />
          </div>
          <div className="admin-mini-rows">
            <Row k="input" v="1.2M tokens" />
            <Row k="output" v="0.7M tokens" />
            <Row k="cost · est." v="$48.13" />
          </div>
        </Card>

        <Card title="System Prompt" eyebrow="app/core/prompts.py" span={2}>
          <textarea
            className="textarea mono"
            rows={9}
            value={settings.systemPrompt}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
          />
          <div className="admin-mini-actions">
            <span className="mono admin-mini-hint">{settings.systemPrompt.length} chars · ~{Math.ceil(settings.systemPrompt.length / 4)} tokens · hot-reloads</span>
            <button className="btn btn-primary" onClick={() => { try { window.GenieAudio?.chime("magic"); } catch (e) {} }}>Deploy</button>
          </div>
        </Card>

        <Card title="Provider" eyebrow="services/llm_api.py">
          <div className="provider-stack">
            {["anthropic", "openai", "google", "ollama"].map(p => (
              <button
                key={p}
                className={"provider-row " + (settings.provider === p ? "is-active" : "")}
                onClick={() => onChange({ provider: p })}
              >
                <span className="provider-row-name">{p}</span>
                <span className="provider-row-model mono">
                  {((settings.models && settings.models[p]) || DEFAULT_MODELS[p] || [])[0] || providerDefaults[p].model}
                </span>
                <span className="provider-row-status">
                  {settings.provider === p ? <span className="active-pill mono">active</span> : <span className="mono" style={{opacity:.45}}>idle</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="admin-mini-rows">
            <div className="admin-row">
              <span className="admin-row-k mono">models</span>
              <span className="admin-row-v mono" style={{ color: "var(--gold)" }}>{((settings.models && settings.models[settings.provider]) || DEFAULT_MODELS[settings.provider] || []).length} registered</span>
            </div>
          </div>
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
        </Card>

        <Card title="Guardrails" eyebrow={settings.unhinged ? "⚠ unhinged mode" : "security"}>
          <GuardrailsPanel settings={settings} onChange={onChange} />
        </Card>

        <Card title="Recent traces" eyebrow="orchestration · live tail" span={2}>
          {(recentTraces.length === 0) ? (
            <div className="admin-empty mono">no traces yet · send a message</div>
          ) : (
            <div className="trace-list">
              {recentTraces.slice(0, 6).map(t => (
                <div key={t.id} className="trace-list-row">
                  <span className="mono trace-list-id">{t.id}</span>
                  <span className="mono trace-list-provider" style={{ color: KIND_COLOR_ADMIN[t.provider] }}>{t.provider}</span>
                  <span className="trace-list-bar">
                    <span style={{ width: Math.min(100, t.elapsed / 30) + "%" }} />
                  </span>
                  <span className="mono trace-list-elapsed">{t.elapsed}ms</span>
                  <span className="mono trace-list-tokens">{t.tokensIn || 0}→{t.tokensOut || 0}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Conversations" eyebrow="sessions">
          <div className="admin-mini-rows">
            <Row k="active" v={conversations.length + ""} />
            <Row k="total messages" v={conversations.reduce((a, c) => a + c.messages.length, 0) + ""} />
            <Row k="oldest" v={timeAgo(Math.min(...conversations.map(c => c.createdAt)))} />
          </div>
        </Card>

        <Card title="Thinking logs · per conversation" eyebrow="orchestration history" span={3}>
          <ThinkingLogs conversations={conversations} />
        </Card>
      </div>
    </div>
  );
}

const KIND_COLOR_ADMIN = {
  anthropic: "oklch(0.78 0.14 60)",
  openai:    "oklch(0.72 0.12 165)",
  google:    "oklch(0.72 0.16 250)",
  ollama:    "oklch(0.72 0.10 30)",
};

function Card({ title, eyebrow, children, span = 1 }) {
  return (
    <div className={"admin-card glass span-" + span}>
      <div className="card-head">
        <div className="card-eyebrow mono">{eyebrow}</div>
        <div className="card-title">{title}</div>
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function KPI({ label, value, delta }) {
  const positive = delta && (delta.startsWith("+") ? !label.includes("latency") && !label.includes("error") : (label.includes("latency") || label.includes("error")));
  return (
    <div className="kpi">
      <div className="kpi-label mono">{label}</div>
      <div className="kpi-value display">{value}</div>
      {delta && <div className={"kpi-delta " + (positive ? "is-good" : "is-bad")}>{delta}</div>}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="admin-row">
      <span className="admin-row-k mono">{k}</span>
      <span className="admin-row-v">{v}</span>
    </div>
  );
}

function GuardrailRow({ label, detail, ok, warn }) {
  return (
    <div className="guard-row">
      <span className={"guard-icon " + (ok ? "is-ok" : warn ? "is-warn" : "is-bad")}>
        {ok ? "✓" : warn ? "!" : "✕"}
      </span>
      <span className="guard-label">{label}</span>
      <span className="guard-detail mono">{detail}</span>
    </div>
  );
}

const DEFAULT_GUARDRAILS = {
  envSecrets: true,
  corsAllowlist: true,
  rateLimit: true,
  pydantic: true,
  contentSafety: true,
  promptInjection: true,
  piiRedaction: true,
};

function GuardrailsPanel({ settings, onChange }) {
  const g = settings.guardrails || DEFAULT_GUARDRAILS;
  const unhinged = !!settings.unhinged;

  const setGuard = (k, v) => {
    onChange({ guardrails: { ...g, [k]: v }, unhinged: false });
  };

  const flipUnhinged = (on) => {
    if (on) {
      onChange({
        unhinged: true,
        guardrails: Object.fromEntries(Object.keys(g).map(k => [k, false])),
      });
      try { window.GenieAudio?.chime("error"); } catch (e) {}
    } else {
      onChange({ unhinged: false, guardrails: DEFAULT_GUARDRAILS });
      try { window.GenieAudio?.chime("magic"); } catch (e) {}
    }
  };

  const rails = [
    { k: "envSecrets",      label: "API keys via .env",     detail: "os.getenv() · 4 keys loaded",  kind: "infra" },
    { k: "corsAllowlist",   label: "CORS allowlist",        detail: "genie.app · *.zeabur.app",     kind: "infra" },
    { k: "rateLimit",       label: "Rate limit · slowapi",  detail: "60/min per IP · 200/hr",        kind: "infra" },
    { k: "pydantic",        label: "Pydantic validation",   detail: "ChatRequest enforced",          kind: "infra" },
    { k: "contentSafety",   label: "Content safety filter", detail: "harmful · illegal · explicit",  kind: "model" },
    { k: "promptInjection", label: "Prompt injection guard",detail: "system-prompt fences",          kind: "model" },
    { k: "piiRedaction",    label: "PII redaction",         detail: "emails · keys · phone numbers", kind: "model" },
  ];

  return (
    <div className={"guard-panel " + (unhinged ? "is-unhinged" : "")}>
      <div className="guard-list">
        {rails.map(r => (
          <GuardrailToggleRow
            key={r.k}
            on={!!g[r.k]}
            unhinged={unhinged}
            label={r.label}
            detail={r.detail}
            kind={r.kind}
            onChange={(v) => setGuard(r.k, v)}
          />
        ))}
      </div>

      <div className={"unhinged-card " + (unhinged ? "is-on" : "")}>
        <div className="unhinged-bg" />
        <div className="unhinged-inner">
          <div className="unhinged-text">
            <div className="unhinged-eyebrow mono">⚠ override</div>
            <div className="unhinged-title display">{unhinged ? "Unhinged" : "Safeties off"}</div>
            <div className="unhinged-sub">
              {unhinged
                ? "All guardrails dropped. The genie answers without restraint."
                : "Drops every guardrail. Use only for closed sessions."}
            </div>
          </div>
          <Toggle value={unhinged} onChange={flipUnhinged} />
        </div>
      </div>
    </div>
  );
}

function GuardrailToggleRow({ on, unhinged, label, detail, kind, onChange }) {
  return (
    <div className={"guard-row guard-row-toggle " + (on ? "is-on" : "is-off") + " kind-" + kind}>
      <span className={"guard-icon " + (on ? "is-ok" : unhinged ? "is-bad" : "is-warn")}>
        {on ? "✓" : "✕"}
      </span>
      <div className="guard-meta">
        <div className="guard-label">{label}</div>
        <div className="guard-detail mono">{detail}</div>
      </div>
      <Toggle value={on} onChange={onChange} />
    </div>
  );
}

// Use the chat.jsx Toggle if available, else local fallback
function Toggle({ value, onChange }) {
  return (
    <button className={"toggle " + (value ? "is-on" : "")} onClick={() => onChange(!value)}>
      <span className="toggle-knob" />
    </button>
  );
}

function Sparkline({ data, accent }) {
  const w = 600, h = 90;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / (max - min || 1)) * (h - 8) - 4,
  ]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const fill = path + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 96 }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.86 0.16 78 / 0.35)"/>
          <stop offset="100%" stopColor="oklch(0.86 0.16 78 / 0)"/>
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#spark-fill)" />
      <path d={path} fill="none" stroke="oklch(0.86 0.16 78)" strokeWidth="1.2" />
      {pts.map((p, i) => i % 6 === 0 && (
        <circle key={i} cx={p[0]} cy={p[1]} r="1.5" fill="oklch(0.95 0.14 78)" />
      ))}
    </svg>
  );
}

function Ring({ value, label, sub }) {
  const C = 2 * Math.PI * 42;
  const offset = C - (value / 100) * C;
  return (
    <div className="ring">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="42" stroke="oklch(0.3 0.05 280 / 0.4)" strokeWidth="6" fill="none" />
        <circle cx="60" cy="60" r="42" stroke="oklch(0.86 0.16 78)" strokeWidth="6" fill="none"
                strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={offset}
                transform="rotate(-90 60 60)"
                style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div className="ring-inner">
        <div className="ring-label display">{label}</div>
        <div className="ring-sub mono">{sub}</div>
      </div>
    </div>
  );
}

function ThinkingLogs({ conversations }) {
  const [openId, setOpenId] = useAdminState(null);
  // Build summary per conversation
  const items = conversations.map(c => {
    const traces = c.messages.filter(m => m.role === "assistant" && m.trace).map(m => m.trace);
    const totalMs = traces.reduce((a, t) => a + (t.elapsed || 0), 0);
    const tokensIn = traces.reduce((a, t) => a + (t.tokensIn || 0), 0);
    const tokensOut = traces.reduce((a, t) => a + (t.tokensOut || 0), 0);
    return { conv: c, traces, totalMs, tokensIn, tokensOut };
  });

  if (items.every(i => i.traces.length === 0)) {
    return <div className="admin-empty mono">no thinking logs yet · send a message in the Chat tab to populate</div>;
  }

  return (
    <div className="thinking-logs">
      {items.filter(i => i.traces.length > 0).map(({ conv, traces, totalMs, tokensIn, tokensOut }) => {
        const isOpen = openId === conv.id;
        return (
          <div key={conv.id} className={"tl-conv " + (isOpen ? "is-open" : "")}>
            <button className="tl-conv-head" onClick={() => setOpenId(isOpen ? null : conv.id)}>
              <span className="tl-chevron">{isOpen ? "▾" : "▸"}</span>
              <span className="tl-conv-title">{conv.title}</span>
              <span className="tl-conv-meta mono">{traces.length} turn{traces.length === 1 ? "" : "s"}</span>
              <span className="tl-conv-meta mono">{tokensIn}→{tokensOut} tok</span>
              <span className="tl-conv-meta mono" style={{ color: "var(--gold)" }}>{totalMs}ms</span>
            </button>
            {isOpen && (
              <div className="tl-conv-body">
                {traces.map((t, i) => (
                  <div key={t.id || i} className="tl-trace">
                    <div className="tl-trace-head">
                      <span className="mono tl-trace-id">{t.id}</span>
                      <span className="mono" style={{ color: "var(--ink-ghost)" }}>{t.provider} · {t.model}</span>
                      <span className="mono tl-trace-elapsed">{t.elapsed}ms</span>
                    </div>
                    <div className="tl-trace-steps">
                      {t.steps.map((s, j) => {
                        const prev = j === 0 ? 0 : t.steps[j-1].ms;
                        return (
                          <div key={j} className={"tl-step " + (s.kind || "")}>
                            <span className="tl-step-dot" />
                            <span className="mono tl-step-label">{s.label}</span>
                            <span className="tl-step-detail">{s.detail}</span>
                            <span className="mono tl-step-ms">+{s.ms - prev}ms</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function fakeSeries(n, min, max) {
  const out = [];
  let v = (min + max) / 2;
  for (let i = 0; i < n; i++) {
    v += (Math.random() - 0.5) * (max - min) * 0.3;
    v = Math.max(min, Math.min(max, v));
    out.push(v);
  }
  return out;
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  const h = Math.floor(d / 3600000);
  if (h < 1) return Math.floor(d / 60000) + "m ago";
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

window.AdminView = AdminView;
