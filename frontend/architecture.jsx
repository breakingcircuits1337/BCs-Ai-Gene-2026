// architecture.jsx — the orchestration visualizer
// Shows the live middleware pipeline as a flowing diagram.
// When a request arrives (via shared trace state), particles travel along the edges
// and nodes light up in sequence.

const { useState: useArchState, useEffect: useArchEffect, useRef: useArchRef } = React;

// Static node definitions — mapped roughly to the architecture in the spec.
const NODES = [
  { id: "client",     label: "Frontend",         sub: "React · WS",          x: 80,   y: 280, kind: "client" },
  { id: "cors",       label: "CORS",             sub: "main.py",             x: 240,  y: 160, kind: "router" },
  { id: "rate",       label: "Rate Limit",       sub: "slowapi · 60/min",    x: 240,  y: 400, kind: "router" },
  { id: "router",     label: "POST /chat",       sub: "routers/chat.py",     x: 420,  y: 280, kind: "router" },
  { id: "pydantic",   label: "Pydantic",         sub: "ChatRequest",         x: 580,  y: 160, kind: "router" },
  { id: "prompt",     label: "System Prompt",    sub: "core/prompts.py",     x: 580,  y: 400, kind: "core" },
  { id: "service",    label: "Service Layer",    sub: "services/llm_api.py", x: 760,  y: 280, kind: "service" },
  { id: "context",    label: "Context Merge",    sub: "history + new + sys", x: 920,  y: 160, kind: "service" },
  { id: "provider",   label: "LLM Provider",     sub: "anthropic · async",   x: 1100, y: 280, kind: "provider" },
  { id: "model",      label: "Model",            sub: "claude-sonnet-4-6",   x: 1280, y: 280, kind: "model" },
];

const EDGES = [
  ["client", "cors"], ["client", "rate"],
  ["cors", "router"], ["rate", "router"],
  ["router", "pydantic"], ["router", "prompt"],
  ["pydantic", "service"], ["prompt", "service"],
  ["service", "context"], ["context", "provider"],
  ["service", "provider"],
  ["provider", "model"],
];

const KIND_COLOR = {
  client:   "oklch(0.78 0.16 220)",
  router:   "oklch(0.78 0.14 200)",
  core:     "oklch(0.86 0.16 78)",
  service:  "oklch(0.72 0.20 295)",
  provider: "oklch(0.74 0.20 25)",
  model:    "oklch(0.86 0.18 78)",
};

const LABEL_TO_NODE = {
  "POST /api/v1/chat":  "router",
  "validate pydantic":  "pydantic",
  "rate-limit · slowapi": "rate",
  "inject system prompt": "prompt",
  "merge context":      "context",
  "call anthropic":     "provider",
  "call openai":        "provider",
  "call google":        "provider",
  "call ollama":        "provider",
  "provider response":  "model",
  "return to client":   "client",
};

function ArchitectureView({ trace, settings, conversations, onSendDemo }) {
  const svgRef = useArchRef(null);
  const [activeNode, setActiveNode] = useArchState(null);
  const [activeEdges, setActiveEdges] = useArchState({});
  const [particles, setParticles] = useArchState([]);
  const tickRef = useArchRef(0);

  // When trace updates, light up the corresponding node + edge
  useArchEffect(() => {
    if (!trace || !trace.steps.length) return;
    const last = trace.steps[trace.steps.length - 1];
    const stepKey = Object.keys(LABEL_TO_NODE).find(k => last.label.startsWith(k.split(" ")[0]) && (last.label.includes(k.split(" ").slice(1).join(" ")) || k.includes(last.label)));
    let target = LABEL_TO_NODE[last.label];
    if (!target) {
      // fuzzy: match "call <provider>"
      if (last.label.startsWith("call ")) target = "provider";
      else if (last.label.startsWith("POST")) target = "router";
    }
    if (!target) return;
    setActiveNode(target);
    setActiveEdges(prev => ({ ...prev, [target]: Date.now() }));

    // Spawn particles on incoming edges
    EDGES.forEach(([a, b]) => {
      if (b === target) {
        const id = "p_" + Math.random().toString(36).slice(2, 8);
        setParticles(prev => [...prev, { id, from: a, to: b, start: Date.now(), dur: 700 }]);
      }
    });
  }, [trace?.steps.length]);

  // Particle GC
  useArchEffect(() => {
    const t = setInterval(() => {
      setParticles(prev => prev.filter(p => Date.now() - p.start < p.dur + 100));
    }, 200);
    return () => clearInterval(t);
  }, []);

  // Demo pulse — idle ambient flow
  useArchEffect(() => {
    const t = setInterval(() => {
      tickRef.current++;
      if (trace) return; // don't ambient when a real trace is active
      const edge = EDGES[tickRef.current % EDGES.length];
      const id = "amb_" + Math.random().toString(36).slice(2, 8);
      setParticles(prev => [...prev, { id, from: edge[0], to: edge[1], start: Date.now(), dur: 1200, ambient: true }]);
    }, 600);
    return () => clearInterval(t);
  }, [trace]);

  const node = (id) => NODES.find(n => n.id === id);

  return (
    <div className="arch-view">
      <div className="arch-head">
        <div>
          <div className="arch-eyebrow mono">live · /api/v1/chat</div>
          <h2 className="display arch-title">Orchestration</h2>
          <p className="arch-sub">Every request traces a path through the middleware. Watch it breathe.</p>
        </div>
        <div className="arch-stats">
          <Stat label="provider" value={settings.provider} mono />
          <Stat label="model" value={settings.model} mono />
          <Stat label="active reqs" value={trace ? "1" : "0"} />
          <Stat label="conversations" value={conversations.length} />
        </div>
      </div>

      <div className="arch-canvas-wrap">
        <svg ref={svgRef} className="arch-svg" viewBox="0 40 1380 480" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <linearGradient id="edge" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="oklch(0.86 0.14 78 / 0)"/>
              <stop offset="50%" stopColor="oklch(0.86 0.14 78 / 0.4)"/>
              <stop offset="100%" stopColor="oklch(0.86 0.14 78 / 0)"/>
            </linearGradient>
          </defs>

          {/* Edges */}
          {EDGES.map(([a, b], i) => {
            const A = node(a), B = node(b);
            const recent = activeEdges[b] && Date.now() - activeEdges[b] < 1200;
            return (
              <path
                key={i}
                d={curvePath(A, B)}
                stroke={recent ? "oklch(0.86 0.18 78 / 0.85)" : "oklch(0.78 0.10 280 / 0.22)"}
                strokeWidth={recent ? 1.6 : 0.9}
                fill="none"
                filter={recent ? "url(#glow)" : undefined}
                style={{ transition: "stroke 0.3s, stroke-width 0.3s" }}
              />
            );
          })}

          {/* Particles */}
          {particles.map(p => {
            const A = node(p.from), B = node(p.to);
            const elapsed = Date.now() - p.start;
            const t = Math.min(1, elapsed / p.dur);
            const pos = bezierAt(A, B, t);
            const r = p.ambient ? 2.4 : 4;
            const color = p.ambient ? "oklch(0.78 0.14 240 / 0.6)" : "oklch(0.95 0.18 78 / 0.95)";
            return (
              <circle
                key={p.id}
                cx={pos.x} cy={pos.y} r={r}
                fill={color}
                filter="url(#glow)"
                style={{ opacity: p.ambient ? 0.55 : (1 - t * 0.3) }}
              />
            );
          })}

          {/* Nodes */}
          {NODES.map(n => {
            const isActive = activeNode === n.id && activeEdges[n.id] && Date.now() - activeEdges[n.id] < 1500;
            const color = KIND_COLOR[n.kind];
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`}>
                {isActive && (
                  <circle r="38" fill={color} opacity="0.15" filter="url(#glow)">
                    <animate attributeName="r" from="32" to="48" dur="1s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" from="0.3" to="0" dur="1s" repeatCount="indefinite"/>
                  </circle>
                )}
                <circle r="30" fill="oklch(0.12 0.04 278 / 0.7)" stroke={color} strokeWidth={isActive ? 1.6 : 0.7} style={{ transition: "stroke-width .2s" }} />
                <circle r="6" fill={color} opacity={isActive ? 1 : 0.6} filter={isActive ? "url(#glow)" : undefined} />
                <text x="0" y="48" textAnchor="middle" fill="oklch(0.94 0.02 280)" fontSize="12" fontWeight="500" style={{ fontFamily: "var(--font-ui)" }}>{n.label}</text>
                <text x="0" y="64" textAnchor="middle" fill="oklch(0.7 0.04 280 / 0.6)" fontSize="9.5" style={{ fontFamily: "var(--font-mono)" }}>{n.sub}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="arch-bottom">
        <TraceTimeline trace={trace} />
        <ArchLegend />
      </div>
    </div>
  );
}

function curvePath(A, B) {
  const mx = (A.x + B.x) / 2;
  return `M ${A.x + 30} ${A.y} C ${mx} ${A.y}, ${mx} ${B.y}, ${B.x - 30} ${B.y}`;
}
function bezierAt(A, B, t) {
  const mx = (A.x + B.x) / 2;
  const p0 = { x: A.x + 30, y: A.y };
  const p1 = { x: mx, y: A.y };
  const p2 = { x: mx, y: B.y };
  const p3 = { x: B.x - 30, y: B.y };
  const omt = 1 - t;
  const x = omt*omt*omt*p0.x + 3*omt*omt*t*p1.x + 3*omt*t*t*p2.x + t*t*t*p3.x;
  const y = omt*omt*omt*p0.y + 3*omt*omt*t*p1.y + 3*omt*t*t*p2.y + t*t*t*p3.y;
  return { x, y };
}

function Stat({ label, value, mono }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={"stat-value " + (mono ? "mono" : "display")}>{value}</div>
    </div>
  );
}

function TraceTimeline({ trace }) {
  if (!trace || !trace.steps.length) {
    return (
      <div className="trace-timeline empty">
        <span className="mono trace-empty-hint">awaiting request · send a message in the Chat tab</span>
      </div>
    );
  }
  return (
    <div className="trace-timeline">
      <div className="trace-tl-head">
        <span className="mono">{trace.id}</span>
        <span className="trace-tl-elapsed mono">{trace.elapsed || trace.steps[trace.steps.length-1].ms}ms total</span>
      </div>
      <div className="trace-tl-bar">
        {trace.steps.map((s, i) => {
          const total = trace.elapsed || trace.steps[trace.steps.length-1].ms || 1;
          const prev = i === 0 ? 0 : trace.steps[i-1].ms;
          const w = ((s.ms - prev) / total) * 100;
          return (
            <div key={i} className={"trace-tl-seg seg-" + (s.kind || "x")} style={{ width: w + "%" }} title={s.label + " · " + (s.ms - prev) + "ms"}>
              <span className="trace-tl-seg-label mono">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArchLegend() {
  return (
    <div className="arch-legend">
      {Object.entries(KIND_COLOR).map(([k, c]) => (
        <span key={k} className="legend-item">
          <span className="legend-dot" style={{ background: c }} />
          <span className="mono">{k}</span>
        </span>
      ))}
    </div>
  );
}

window.ArchitectureView = ArchitectureView;
