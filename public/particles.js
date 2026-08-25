'use strict';

/* Fundo de partículas interativo — reage ao movimento do mouse/toque */
(function () {
  if (document.getElementById('bgParticles')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'bgParticles';
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, dpr = 1, parts = [], running = true;

  const LINK_DIST = 115;
  const MOUSE_RADIUS = 170;

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
    const target = Math.max(45, Math.min(120, Math.floor((W * H) / 15000)));
    parts = [];
    for (let i = 0; i < target; i++) {
      parts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: 0.7 + Math.random() * 1.6,
        tw: Math.random() * Math.PI * 2,
        tws: 0.008 + Math.random() * 0.02
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
      // deriva natural suave
      p.x += p.vx + Math.sin(p.tw) * 0.06;
      p.y += p.vy + Math.cos(p.tw) * 0.05;
      p.tw += p.tws;

      // reação ao mouse
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
        const d = Math.sqrt(d2) || 1;
        const f = (1 - d / MOUSE_RADIUS) * 1.5;
        // empurra para longe do cursor
        p.vx += (dx / d) * f * 0.55;
        p.vy += (dy / d) * f * 0.55;
        // arrasto na direção do movimento do mouse
        p.vx += Math.sign(mouse.vx) * Math.min(mvx / 60, 0.9) * f * 0.35;
        p.vy += Math.sign(mouse.vy) * Math.min(mvy / 60, 0.9) * f * 0.35;
      }

      // limita velocidade e atrito
      p.vx *= 0.96;
      p.vy *= 0.96;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 2.4) { p.vx = (p.vx / sp) * 2.4; p.vy = (p.vy / sp) * 2.4; }
      if (sp < 0.05 && sp > 0.001) { p.vx *= 20 / (sp * 200 + 1); }

      // bordas com volta suave
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
    }

    mouse.vx *= 0.8;
    mouse.vy *= 0.8;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // linhas entre partículas próximas
    ctx.lineWidth = 1;
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST * LINK_DIST) {
          const al = (1 - Math.sqrt(d2) / LINK_DIST) * 0.16;
          ctx.strokeStyle = 'rgba(56,189,248,' + al.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // brilho perto do mouse nas linhas
    if (mouse.x > 0) {
      for (const p of parts) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
          const al = (1 - Math.sqrt(d2) / MOUSE_RADIUS) * 0.35;
          ctx.strokeStyle = 'rgba(125,211,252,' + al.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
    }

    // pontos
    for (const p of parts) {
      const glow = Math.sin(p.tw) * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(148,197,255,' + (0.35 + glow * 0.45).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
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
