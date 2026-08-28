'use strict';

/* Cyber Futuristic Particles — AIMZY Redesign */
(function () {
  if (document.getElementById('bgParticles')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'bgParticles';
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, dpr = 1, parts = [], running = true;

  const LINK_DIST = 120;
  const MOUSE_RADIUS = 180;

  // Full Black Premium colors - subtle white/gray particles
  const COLORS = {
    white1: { r: 255, g: 255, b: 255 },
    white2: { r: 200, g: 200, b: 200 },
    white3: { r: 160, g: 160, b: 160 }
  };

  const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, vx: 0, vy: 0 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spawn();
  }

  function spawn() {
    const target = Math.max(40, Math.min(100, Math.floor((W * H) / 18000)));
    parts = [];
    for (let i = 0; i < target; i++) {
      const colorKey = Math.random() < 0.5 ? 'white1' : Math.random() < 0.7 ? 'white2' : 'white3';
      parts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 0.6 + Math.random() * 1.4,
        tw: Math.random() * Math.PI * 2,
        tws: 0.006 + Math.random() * 0.018,
        color: COLORS[colorKey],
        colorKey
      });
    }
  }

  function onPointer(x, y) {
    mouse.vx = x - mouse.px;
    mouse.vy = y - mouse.py;
    mouse.px = x;
    mouse.py = y;
    mouse.x = x;
    mouse.y = y;
  }

  window.addEventListener('mousemove', e => onPointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', e => {
    if (e.touches && e.touches[0]) onPointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('mouseout', () => { mouse.x = -9999; mouse.y = -9999; });

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(loop);
  });

  function step() {
    const mvx = Math.min(Math.abs(mouse.vx), 40) || 0;
    const mvy = Math.min(Math.abs(mouse.vy), 40) || 0;

    for (const p of parts) {
      p.x += p.vx + Math.sin(p.tw) * 0.05;
      p.y += p.vy + Math.cos(p.tw) * 0.04;
      p.tw += p.tws;

      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
        const d = Math.sqrt(d2) || 1;
        const f = (1 - d / MOUSE_RADIUS) * 1.2;
        p.vx += (dx / d) * f * 0.5;
        p.vy += (dy / d) * f * 0.5;
        p.vx += Math.sign(mouse.vx) * Math.min(mvx / 70, 0.8) * f * 0.3;
        p.vy += Math.sign(mouse.vy) * Math.min(mvy / 70, 0.8) * f * 0.3;
      }

      p.vx *= 0.97;
      p.vy *= 0.97;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 2.2) { p.vx = (p.vx / sp) * 2.2; p.vy = (p.vy / sp) * 2.2; }
      if (sp < 0.04 && sp > 0.001) { p.vx *= 18 / (sp * 180 + 1); }

      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
    }

    mouse.vx *= 0.85;
    mouse.vy *= 0.85;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Lines between nearby particles
    ctx.lineWidth = 0.6;
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST * LINK_DIST) {
          const al = (1 - Math.sqrt(d2) / LINK_DIST) * 0.08;
          const c = a.color;
          ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${al.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Lines from mouse to nearby particles
    if (mouse.x > 0) {
      for (const p of parts) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
          const al = (1 - Math.sqrt(d2) / MOUSE_RADIUS) * 0.15;
          const c = p.color;
          ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${al.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
    }

    // Particle dots
    for (const p of parts) {
      const glow = Math.sin(p.tw) * 0.5 + 0.5;
      const c = p.color;
      const alpha = 0.2 + glow * 0.3;
      
      // Subtle glow effect
      ctx.shadowBlur = 6;
      ctx.shadowColor = `rgba(${c.r},${c.g},${c.b},0.3)`;
      
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
    }
  }

  let last = 0;
  function loop(t) {
    if (!running) return;
    if (!last || t - last >= 16) {
      last = t;
      step();
      draw();
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);
})();
