// orb.jsx — Genie orb / lamp / abstract character. Canvas-rendered, reactive to state.
//
// Props:
//   state: "idle" | "listening" | "thinking" | "speaking"
//   size:  px
//   variant: "orb" | "lamp" | "abstract" | "none"
//   intensity: 0..1
//   energy: 0..1  (live audio/text level for speaking)
//   hue: optional override
//
// Exposes window.GenieOrb

const { useRef, useEffect, useState, useMemo } = React;

function GenieOrb({ state = "idle", size = 220, variant = "orb", intensity = 1, energy = 0, hue = null }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const energyRef = useRef(energy);
  const intensityRef = useRef(intensity);
  const variantRef = useRef(variant);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { energyRef.current = energy; }, [energy]);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);
  useEffect(() => { variantRef.current = variant; }, [variant]);

  useEffect(() => {
    if (variant === "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const baseR = size * 0.28;

    // particles
    const particles = [];
    const N = 60;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      particles.push({
        a: ang,
        r: baseR * (1.1 + Math.random() * 0.5),
        speed: 0.0006 + Math.random() * 0.0015,
        size: 0.6 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        wobble: 0.3 + Math.random() * 0.7,
        hueOff: Math.random() * 60 - 30,
      });
    }

    // sparks (transient)
    const sparks = [];

    let raf = 0;
    let t0 = performance.now();
    let smoothedEnergy = 0;

    function spawnSpark() {
      const a = Math.random() * Math.PI * 2;
      sparks.push({
        x: cx + Math.cos(a) * baseR * 0.8,
        y: cy + Math.sin(a) * baseR * 0.8,
        vx: Math.cos(a) * (0.6 + Math.random() * 1.4),
        vy: Math.sin(a) * (0.6 + Math.random() * 1.4) - 0.2,
        life: 1,
        size: 0.8 + Math.random() * 1.6,
      });
    }

    function drawOrb(now) {
      const t = (now - t0) / 1000;
      const s = stateRef.current;
      const it = intensityRef.current;
      const v = variantRef.current;
      const targetEnergy = energyRef.current;
      smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.1;

      ctx.clearRect(0, 0, size, size);

      // State-driven parameters
      const pulse =
        s === "thinking" ? (1 + Math.sin(t * 4.5) * 0.06 * it) :
        s === "speaking" ? (1 + smoothedEnergy * 0.18 + Math.sin(t * 8) * 0.03 * it) :
        s === "listening" ? (1 + Math.sin(t * 2) * 0.04 * it) :
        (1 + Math.sin(t * 1.2) * 0.02 * it);

      const r = baseR * pulse;

      // BG glow
      const glowR = r * 3.2;
      const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      const goldStop = `oklch(0.86 0.18 78 / ${0.32 * it})`;
      const purpStop = `oklch(0.62 0.22 295 / ${0.18 * it})`;
      glowGrad.addColorStop(0, goldStop);
      glowGrad.addColorStop(0.35, purpStop);
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, size, size);

      // Particles
      for (const p of particles) {
        p.a += p.speed * (s === "thinking" ? 3 : s === "speaking" ? 2 : 1);
        const wobble = Math.sin(t * p.wobble + p.phase) * (s === "thinking" ? 8 : 4);
        const pr = p.r + wobble + (s === "speaking" ? smoothedEnergy * 14 : 0);
        const px = cx + Math.cos(p.a) * pr;
        const py = cy + Math.sin(p.a) * pr;
        const alpha = (0.4 + Math.sin(t * 2 + p.phase) * 0.3) * it;
        ctx.fillStyle = `oklch(0.86 0.15 ${78 + p.hueOff} / ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sparks
      if (s === "thinking" && Math.random() < 0.5) spawnSpark();
      if (s === "speaking" && Math.random() < 0.3 * smoothedEnergy) spawnSpark();
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.02;
        sp.life -= 0.018;
        if (sp.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.fillStyle = `oklch(0.92 0.16 78 / ${sp.life * it})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size * sp.life, 0, Math.PI * 2);
        ctx.fill();
      }

      // Variant rendering
      if (v === "lamp") drawLamp(ctx, cx, cy, r, t, s, it, smoothedEnergy);
      else if (v === "abstract") drawAbstract(ctx, cx, cy, r, t, s, it, smoothedEnergy);
      else drawSphere(ctx, cx, cy, r, t, s, it, smoothedEnergy);

      raf = requestAnimationFrame(drawOrb);
    }

    raf = requestAnimationFrame(drawOrb);
    return () => cancelAnimationFrame(raf);
  }, [size, variant]);

  if (variant === "none") {
    return (
      <div style={{
        width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
        opacity: 0.5
      }}>
        <div className="display" style={{ fontSize: size * 0.18, color: "var(--gold)" }}>genie</div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {state === "speaking" && (
        <>
          <div className="orb-ring" style={ringStyle(size, 0)} />
          <div className="orb-ring" style={ringStyle(size, 0.6)} />
        </>
      )}
    </div>
  );
}

function ringStyle(size, delay) {
  return {
    position: "absolute",
    left: "50%", top: "50%",
    width: size * 0.55, height: size * 0.55,
    marginLeft: -size * 0.275, marginTop: -size * 0.275,
    border: "0.5px solid oklch(0.86 0.18 78 / 0.5)",
    borderRadius: "50%",
    pointerEvents: "none",
    animation: `pulseRing 1.8s ease-out ${delay}s infinite`,
  };
}

function drawSphere(ctx, cx, cy, r, t, state, it, energy) {
  // Outer aura
  const aura = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.4);
  aura.addColorStop(0, `oklch(0.86 0.18 78 / ${0.5 * it})`);
  aura.addColorStop(1, "transparent");
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2); ctx.fill();

  // Core sphere with iridescent gradient
  const core = ctx.createRadialGradient(
    cx - r * 0.25, cy - r * 0.35, r * 0.05,
    cx, cy, r
  );
  core.addColorStop(0, `oklch(0.98 0.05 80 / ${1})`);
  core.addColorStop(0.3, `oklch(0.88 0.16 78 / ${0.95})`);
  core.addColorStop(0.7, `oklch(0.55 0.22 300 / ${0.85})`);
  core.addColorStop(1, `oklch(0.20 0.12 280 / ${0.8})`);
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  // Highlight
  const hi = ctx.createRadialGradient(
    cx - r * 0.35, cy - r * 0.45, 0,
    cx - r * 0.35, cy - r * 0.45, r * 0.5
  );
  hi.addColorStop(0, `oklch(1 0 0 / ${0.55})`);
  hi.addColorStop(1, "transparent");
  ctx.fillStyle = hi;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  // Inner shimmer ribbons
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.3);
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 3; i++) {
    const rib = ctx.createLinearGradient(-r, 0, r, 0);
    rib.addColorStop(0, "transparent");
    rib.addColorStop(0.5, `oklch(0.95 0.12 ${200 + i * 40} / ${0.18 * it})`);
    rib.addColorStop(1, "transparent");
    ctx.fillStyle = rib;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.12, (i * Math.PI) / 3 + t * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLamp(ctx, cx, cy, r, t, state, it, energy) {
  // Stylized lamp: base + spout + smoke
  ctx.save();
  ctx.translate(cx, cy);

  // smoke plume above
  const plumeH = r * 1.2 + Math.sin(t * 2) * 4 + energy * 20;
  for (let i = 0; i < 14; i++) {
    const yy = -r * 0.9 - i * (plumeH / 14);
    const sway = Math.sin(t * 1.5 + i * 0.4) * (4 + i * 1.2);
    const radius = (0.6 + i * 0.18) * (10 - i * 0.4);
    ctx.fillStyle = `oklch(0.85 0.14 78 / ${(0.3 - i * 0.02) * it})`;
    ctx.beginPath();
    ctx.arc(sway, yy, Math.max(2, radius), 0, Math.PI * 2);
    ctx.fill();
  }

  // Lamp body
  const lampW = r * 1.6;
  const lampH = r * 0.95;
  const grad = ctx.createLinearGradient(0, -lampH/2, 0, lampH/2);
  grad.addColorStop(0, "oklch(0.85 0.14 78)");
  grad.addColorStop(0.5, "oklch(0.68 0.16 70)");
  grad.addColorStop(1, "oklch(0.38 0.09 65)");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, lampW * 0.5, lampH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // Spout
  ctx.fillStyle = "oklch(0.65 0.13 68)";
  ctx.beginPath();
  ctx.moveTo(lampW * 0.45, -lampH * 0.05);
  ctx.quadraticCurveTo(lampW * 0.75, -lampH * 0.35, lampW * 0.85, -lampH * 0.5);
  ctx.lineTo(lampW * 0.7, -lampH * 0.55);
  ctx.quadraticCurveTo(lampW * 0.6, -lampH * 0.35, lampW * 0.4, -lampH * 0.15);
  ctx.closePath();
  ctx.fill();

  // Handle
  ctx.strokeStyle = "oklch(0.65 0.13 68)";
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(-lampW * 0.4, -lampH * 0.05, r * 0.32, -Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();

  // Lid + flame tip
  ctx.fillStyle = "oklch(0.78 0.14 75)";
  ctx.beginPath();
  ctx.ellipse(0, -lampH * 0.55, r * 0.18, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top jewel
  ctx.fillStyle = "oklch(0.95 0.18 78)";
  ctx.beginPath();
  ctx.arc(0, -lampH * 0.65, r * 0.06 + Math.sin(t * 3) * 1, 0, Math.PI * 2);
  ctx.fill();

  // Highlight on body
  const hi = ctx.createLinearGradient(-lampW * 0.4, -lampH * 0.4, lampW * 0.4, lampH * 0.4);
  hi.addColorStop(0, "oklch(1 0 0 / 0.3)");
  hi.addColorStop(0.5, "transparent");
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.ellipse(0, 0, lampW * 0.5, lampH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawAbstract(ctx, cx, cy, r, t, state, it, energy) {
  // Morphing polygon with iridescent fill
  const sides = state === "thinking" ? 6 : state === "speaking" ? 8 : 5;
  const morphR = r * (1 + Math.sin(t * 2) * 0.03);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.2);

  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const ang = (i / sides) * Math.PI * 2;
    const rr = morphR * (1 + Math.sin(t * 3 + i) * 0.08 + energy * 0.15);
    const x = Math.cos(ang) * rr;
    const y = Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, "oklch(0.95 0.18 78)");
  g.addColorStop(0.5, "oklch(0.65 0.22 295)");
  g.addColorStop(1, "oklch(0.55 0.20 240)");
  ctx.fillStyle = g;
  ctx.fill();

  // inner stroke shape
  ctx.strokeStyle = "oklch(1 0 0 / 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const ang = (i / sides) * Math.PI * 2 + Math.PI / sides;
    const rr = morphR * 0.5;
    const x = Math.cos(ang) * rr;
    const y = Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

window.GenieOrb = GenieOrb;
