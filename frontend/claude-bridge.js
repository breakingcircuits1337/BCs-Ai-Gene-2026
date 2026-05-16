// claude-bridge.js
// Polyfills window.claude.complete so the design prototype's call sites
// transparently hit the real FastAPI backend at POST /api/v1/chat.
//
// The design calls:  window.claude.complete({ system, messages, temperature })
// The backend wants: { messages: [{role, content}], system_prompt?, temperature? }
// The backend returns: { reply: string }

(function () {
  window.claude = {
    complete: async function ({ system, messages, temperature } = {}) {
      const body = { messages };
      if (system != null)      body.system_prompt = system;
      if (temperature != null) body.temperature   = temperature;

      const res = await fetch("/api/v1/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error("Backend error " + res.status + ": " + err);
      }

      const data = await res.json();
      return data.reply;
    },
  };
})();
