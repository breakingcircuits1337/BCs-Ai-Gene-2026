// audio.js — generative chime / haptic-feeling micro-sounds via Web Audio
// Exposes window.GenieAudio with: chime(name), startAmbient(), stopAmbient(), enable(), enabled

(function () {
  let ctx = null;
  let master = null;
  let ambientGain = null;
  let ambientNodes = [];
  let enabled = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) { /* no audio */ }
    return ctx;
  }

  function tone({ freq = 440, dur = 0.25, type = "sine", attack = 0.005, decay = 0.2, vol = 0.2, detune = 0, delay = 0 }) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  function chime(name) {
    ensure();
    if (!ctx || !enabled) return;
    if (ctx.state === "suspended") ctx.resume();
    switch (name) {
      case "send":
        // ascending shimmer
        tone({ freq: 660, dur: 0.18, type: "sine", vol: 0.12, decay: 0.18 });
        tone({ freq: 990, dur: 0.2, type: "sine", vol: 0.10, decay: 0.22, delay: 0.05 });
        tone({ freq: 1320, dur: 0.25, type: "triangle", vol: 0.06, decay: 0.3, delay: 0.10 });
        break;
      case "receive":
        // bell-like
        tone({ freq: 880, dur: 0.6, type: "sine", vol: 0.14, decay: 0.6 });
        tone({ freq: 1320, dur: 0.6, type: "sine", vol: 0.08, decay: 0.55, delay: 0.02 });
        tone({ freq: 1760, dur: 0.6, type: "sine", vol: 0.04, decay: 0.5, delay: 0.04 });
        break;
      case "tap":
        tone({ freq: 1200, type: "triangle", vol: 0.07, decay: 0.08 });
        break;
      case "tick":
        tone({ freq: 2400, type: "square", vol: 0.025, decay: 0.03 });
        break;
      case "open":
        tone({ freq: 520, type: "sine", vol: 0.08, decay: 0.22 });
        tone({ freq: 780, type: "sine", vol: 0.06, decay: 0.22, delay: 0.04 });
        break;
      case "close":
        tone({ freq: 520, type: "sine", vol: 0.08, decay: 0.18 });
        tone({ freq: 390, type: "sine", vol: 0.06, decay: 0.2, delay: 0.04 });
        break;
      case "magic":
        // mystical sparkle — random arpeggio
        const scale = [523, 659, 784, 988, 1175, 1568];
        for (let i = 0; i < 7; i++) {
          const f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() > 0.7 ? 2 : 1);
          tone({ freq: f, type: "sine", vol: 0.05, decay: 0.4, delay: i * 0.04 });
        }
        break;
      case "error":
        tone({ freq: 220, type: "sawtooth", vol: 0.10, decay: 0.25 });
        tone({ freq: 165, type: "sawtooth", vol: 0.08, decay: 0.3, delay: 0.08 });
        break;
    }
  }

  function startAmbient() {
    ensure();
    if (!ctx || !enabled || ambientNodes.length) return;
    if (ctx.state === "suspended") ctx.resume();
    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0;
    ambientGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 2);
    ambientGain.connect(master);

    // Slow drone — two detuned sines
    [110, 110.5, 165].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = i === 2 ? 0.15 : 0.4;
      o.connect(g).connect(ambientGain);
      o.start();
      ambientNodes.push(o);
    });

    // Slow LFO on master
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain).connect(ambientGain.gain);
    lfo.start();
    ambientNodes.push(lfo);
  }

  function stopAmbient() {
    if (!ctx) return;
    if (ambientGain) {
      ambientGain.gain.cancelScheduledValues(ctx.currentTime);
      ambientGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    }
    setTimeout(() => {
      ambientNodes.forEach(n => { try { n.stop(); } catch (e) {} });
      ambientNodes = [];
      ambientGain = null;
    }, 900);
  }

  window.GenieAudio = {
    chime,
    startAmbient,
    stopAmbient,
    get enabled() { return enabled; },
    enable(on) {
      enabled = !!on;
      ensure();
      if (ctx && ctx.state === "suspended") ctx.resume();
      if (!enabled) stopAmbient();
    }
  };
})();
