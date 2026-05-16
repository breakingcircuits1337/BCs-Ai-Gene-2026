// app.jsx — root: tab routing, shared state, tweaks panel

const { useState: useAppState, useEffect: useAppEffect, useRef: useAppRef, useMemo: useAppMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "orbVariant": "orb",
  "intensity": 1,
  "density": "regular",
  "accent": "gold"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useAppState(() => {
    const m = location.hash.match(/tab=([a-z]+)/);
    return m ? m[1] : "chat";
  });

  // Persisted state
  const persisted = useAppMemo(() => loadState() || {}, []);
  const [conversations, setConversations] = useAppState(persisted.conversations || seedConversations());
  const [activeId, setActiveId] = useAppState(persisted.activeId || (persisted.conversations || seedConversations())[0].id);
  const [settings, setSettings] = useAppState(persisted.settings || {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0.7,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    showInternals: true,
    sound: false,
    webAccess: true,
    guardrails: { envSecrets: true, corsAllowlist: true, rateLimit: true, pydantic: true, contentSafety: true, promptInjection: true, piiRedaction: true },
    unhinged: false,
  });
  const [settingsOpen, setSettingsOpen] = useAppState(false);
  const [currentTrace, setCurrentTrace] = useAppState(null);
  const [recentTraces, setRecentTraces] = useAppState([]);

  // Persist
  useAppEffect(() => {
    saveState({ conversations, activeId, settings });
  }, [conversations, activeId, settings]);

  // Sync model when provider changes
  useAppEffect(() => {
    const def = providerDefaults[settings.provider];
    if (def && !settings.model.includes(settings.provider.slice(0, 3))) {
      // soft-update model if it doesn't look like it matches
    }
  }, [settings.provider]);

  // Reflect tab in hash
  useAppEffect(() => {
    location.hash = "tab=" + tab;
  }, [tab]);

  // Sound enable
  useAppEffect(() => {
    if (!window.GenieAudio) return;
    window.GenieAudio.enable(settings.sound);
    if (settings.sound) window.GenieAudio.startAmbient();
    else window.GenieAudio.stopAmbient();
  }, [settings.sound]);

  // First-click sound enable nudge
  useAppEffect(() => {
    function resume() {
      if (settings.sound && window.GenieAudio) {
        window.GenieAudio.enable(true);
        window.GenieAudio.startAmbient();
      }
    }
    document.addEventListener("pointerdown", resume, { once: true });
    return () => document.removeEventListener("pointerdown", resume);
  }, []);

  // Density CSS var
  useAppEffect(() => {
    const v = t.density === "compact" ? 0.85 : t.density === "comfy" ? 1.15 : 1;
    document.documentElement.style.setProperty("--density", v);
  }, [t.density]);

  const updateSettings = (patch) => setSettings(s => ({ ...s, ...patch, ...(patch.provider ? { model: providerDefaults[patch.provider]?.model || s.model } : {}) }));

  const handleTraceEvent = (trace) => {
    setCurrentTrace(trace);
    if (trace.elapsed) {
      setRecentTraces(prev => [trace, ...prev.filter(t => t.id !== trace.id)].slice(0, 20));
    }
  };

  return (
    <div className={"app density-" + t.density} data-screen-label={tab}>
      <div className="stars" />

      {/* Top tab bar */}
      <header className="topbar">
        <div className="topbar-tabs glass">
          {[
            { id: "chat", label: "Chat", glyph: "✦" },
            { id: "orchestration", label: "Orchestration", glyph: "◈" },
            { id: "admin", label: "Admin", glyph: "⚙" },
          ].map(x => (
            <button
              key={x.id}
              className={"toptab " + (tab === x.id ? "is-active" : "")}
              onClick={() => { setTab(x.id); try { window.GenieAudio?.chime("tap"); } catch (e) {} }}
            >
              <span className="toptab-glyph">{x.glyph}</span>
              <span className="toptab-label">{x.label}</span>
              {tab === x.id && <span className="toptab-underline" />}
            </button>
          ))}
        </div>
        <div className="topbar-right glass">
          <span className="provider-pill mono">
            <span className="status-dot" />
            {settings.provider} · {settings.model}
          </span>
          <button className="btn-ghost icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M3.3 12.7l1.4-1.4M11.3 4.7l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </header>

      <div className="app-body">
        {tab === "chat" && (
          <ChatView
            settings={settings}
            conversations={conversations}
            setConversations={setConversations}
            activeId={activeId}
            setActiveId={setActiveId}
            orbVariant={t.orbVariant}
            intensity={t.intensity}
            onTabChange={setTab}
            activeTab={tab}
            onOpenSettings={() => setSettingsOpen(true)}
            onTraceEvent={handleTraceEvent}
          />
        )}
        {tab === "orchestration" && (
          <ArchitectureView
            trace={currentTrace}
            settings={settings}
            conversations={conversations}
            onSendDemo={() => setTab("chat")}
          />
        )}
        {tab === "admin" && (
          <AdminView
            settings={settings}
            onChange={updateSettings}
            conversations={conversations}
            recentTraces={recentTraces}
          />
        )}
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); try { window.GenieAudio?.chime("close"); } catch (e) {} }}
        settings={settings}
        onChange={updateSettings}
      />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Genie character" />
        <TweakRadio
          label="Variant"
          value={t.orbVariant}
          options={["orb", "lamp", "abstract", "none"]}
          onChange={(v) => setTweak("orbVariant", v)}
        />
        <TweakSlider
          label="Animation intensity"
          value={t.intensity} min={0} max={1.5} step={0.05}
          onChange={(v) => setTweak("intensity", v)}
        />
        <TweakSection label="Layout" />
        <TweakRadio
          label="Density"
          value={t.density}
          options={["compact", "regular", "comfy"]}
          onChange={(v) => setTweak("density", v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
