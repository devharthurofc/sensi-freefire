'use strict';

/* ================== estado / API ================== */

const LS_DEVICE = 'sensipro_device_id';
const LS_TOKEN = 'sensipro_token';
const LS_TIER = 'sensipro_tier';
const LS_NAME = 'sensipro_user_name';

const TIER_INFO = {
  normal: {
    label: 'AIMZY NORMAL',
    desc: 'Configuração equilibrada gerada na hora. Informe o modelo do seu celular e comece.',
    btn: 'Gerar Sensi Normal',
    resTitle: 'Sua Sensi Normal',
    lock: false
  },
  premium: {
    label: 'AIMZY PREMIUM',
    desc: 'Análise do seu aparelho + suas preferências para uma config refinada.',
    btn: 'Gerar Sensi Premium',
    resTitle: 'Sua Sensi Premium',
    lock: true
  },
  proibida: {
    label: 'AIMZY VIP',
    desc: 'AGRESSIVA. Drag insano pra quem já tem controle. Exige treino.',
    btn: 'Gerar Sensi VIP',
    resTitle: 'Sua Sensi VIP',
    lock: true
  },
  vip: {
    label: 'AIMZY VIP',
    tier: 'proibida',
    desc: 'AGRESSIVA. Drag insano pra quem já tem controle. Exige treino.',
    btn: 'Gerar Sensi VIP',
    resTitle: 'Sua Sensi VIP',
    lock: true
  },
  emulador: {
    label: 'AIMZY EMULADOR',
    desc: 'Configuração gratuita para BlueStacks, GameLoop, LDPlayer e MSI App Player. Não precisa de KEY.',
    btn: 'Gerar Sensi Emulador',
    resTitle: 'Sua Sensi Emulador',
    lock: false
  }
};

const state = {
  token: null,
  user: { id: null, label: null, isVip: false },
  contactLink: '',
  lastResult: null,
  tier: 'normal',
  dpiSel: 'equilibrada',
  historyLoaded: false
};

function getDeviceId() {
  let d = localStorage.getItem(LS_DEVICE);
  if (!d || !/^[a-zA-Z0-9_-]{8,64}$/.test(d)) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    d = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(LS_DEVICE, d);
  }
  return d;
}

async function api(path, opts = {}, retry = true) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401 && retry && path !== '/api/session/init') {
    await initSession();
    return api(path, opts, false);
  }
  data._status = res.status;
  return data;
}

async function initSession(name) {
  // restaura sessão salva (conta e-mail/senha ou dispositivo)
  const saved = localStorage.getItem(LS_TOKEN);
  if (saved) {
    state.token = saved;
    const me = await api("/api/me", {}, false);
    if (me && me.user) {
      state.user = me.user;
      api("/api/settings").then(function(r2) {
        if (r2 && r2.settings && r2.settings.contactLink) state.contactLink = r2.settings.contactLink;
      }).catch(function() {});
      applyVipState();
      return;
    }
    state.token = null;
    localStorage.removeItem(LS_TOKEN);
  }

  const body = { deviceId: getDeviceId() };
  if (name) body.name = name;
  const r = await fetch('/api/session/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  state.token = data.token;
  state.user = data.user;
  state.contactLink = (data.settings && data.settings.contactLink) || '';
  localStorage.setItem(LS_TOKEN, data.token || '');
  applyVipState();
}

/* ================== utilidades UI ================== */

const NAMES = [
  ["geral", "Geral"],
  ["redDot", "Red Dot"],
  ["mira2x", "Mira 2X"],
  ["mira4x", "Mira 4X"],
  ["miraAwm", "Mira AWM"],
  ["olhadinha", "Olhadinha"]
];
const EMU_NAMES = [
  ["geral", "Geral"],
  ["redDot", "Red Dot"],
  ["mira2x", "Mira 2X"],
  ["mira4x", "Mira 4X"],
  ["miraAwm", "Mira AWM"],
  ["sensX", "Sensibilidade X"],
  ["sensY", "Sensibilidade Y"]
];
const MAX_SENSI = 200;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

let toastTimer;
function toast(msg, isErr) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.toggle('err', !!isErr);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function animateNum(elm, target) {
  const start = performance.now();
  function step(t) {
    const p = Math.min((t - start) / 800, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    elm.textContent = Math.round(eased * target);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function animateNumPercent(elm, target) {
  const start = performance.now();
  function step(t) {
    const p = Math.min((t - start) / 700, 1);
    elm.textContent = Math.round(target * p) + "%";
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderGrid(gridEl, values, names) {
  gridEl.innerHTML = "";
  (names || NAMES).forEach(([k, label]) => {
    const c = el("div", "sensi-card");
    c.appendChild(el("div", "label", label));
    c.appendChild(el("div", "value", "<span class='num'>0</span>"));
    c.appendChild(el("div", "bar", "<i></i>"));
    c.dataset.val = values[k];
    gridEl.appendChild(c);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    gridEl.querySelectorAll(".sensi-card").forEach(card => {
      const v = +card.dataset.val;
      card.querySelector(".num").textContent = v;
      card.querySelector(".bar i").style.width = (v / MAX_SENSI * 100) + "%";
    });
  }));
}

async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
  }
  toast(msg || "Copiado!");
}

function tierLabelOf(mode) {
  return (TIER_INFO[mode] && TIER_INFO[mode].label.replace('AIMZY ', '')) ||
    { normal: 'Normal', premium: 'Premium', vip: 'VIP' }[mode] || mode.toUpperCase();
}

function fmtResult(r) {
  let s = "=== AIMZY | FREE FIRE ===\n";
  s += "Sensi: " + tierLabelOf(r.mode || r.tier) + "\n";
  if (r.mode === "emulador") {
    if (r.emulatorLabel) s += "Emulador: " + r.emulatorLabel + "\n";
    EMU_NAMES.forEach(([k, label]) => { s += label + ": " + r.values[k] + "\n"; });
    s += "DPI recomendado do mouse: " + r.dpi + "\n";
    return s;
  }
  if (r.deviceName) s += "Aparelho: " + r.deviceName + "\n";
  const values = (state.dpiSel && r.valuesByDpi) ? r.valuesByDpi[state.dpiSel] : r.values;
  NAMES.forEach(([k, label]) => { s += label + ": " + values[k] + "\n"; });
  s += "Botão de disparo: " + r.fireButton + "%\n";
  if (r.ciclos != null) s += "Ciclos: " + r.ciclos + "\n";
  if (r.dpiOptions && state.dpiSel) {
    s += "DPI (" + state.dpiSel + "): " + r.dpiOptions[state.dpiSel].dpi + "\n";
  } else {
    s += "DPI recomendado: " + r.dpi + "\n";
  }
  return s;
}

/* ================== seletor de tier ================== */

document.querySelectorAll("#modes .mode-card").forEach(btn => {
  btn.addEventListener("click", () => switchTier(btn.dataset.tier));
});

function switchTier(tier) {
  // normaliza apelidos antigos: 'vip' -> 'proibida'
  if (tier === 'vip') tier = 'proibida';
  if (!TIER_INFO[tier]) tier = 'normal';
  state.tier = tier;
  localStorage.setItem(LS_TIER, tier);
  document.querySelectorAll("#modes .mode-card").forEach(b => b.classList.toggle("active", b.dataset.tier === tier));
  document.body.dataset.tier = tier;

  const info = TIER_INFO[tier];
  document.getElementById("heroTitle").innerHTML = "<em>" + info.label + "</em>";
  document.getElementById("heroDesc").textContent = info.desc || "";
  document.getElementById("genBtnLabel").textContent = info.btn;
  document.getElementById("resTitle").textContent = info.resTitle;

  // gerador emulador usa campos próprios
  const isEmu = tier === "emulador";
  document.getElementById("genBox").style.display = isEmu ? "none" : "";
  document.getElementById("emuBox").style.display = isEmu ? "" : "none";
  document.getElementById("genWarn").classList.remove("show");

  const vipType = (state.user.vipType || '').toLowerCase();
  const tierKey = tier === 'proibida' ? 'proibida' : tier;
  const locked = info.lock && (!state.user.isVip || (vipType && vipType !== tierKey) || (!vipType && state.user.isVip));
  document.getElementById("tierLock").classList.toggle("hide-lock", !locked);
  document.getElementById("genBox").classList.toggle("blur-lock", locked);

  // ícone do cadeado: ouro no premium, vermelho na vip
  document.getElementById("lockIcon").className = "lock-icon" + (tier === 'premium' ? ' gold' : '');
  document.getElementById("lockTitle").textContent =
    "🔒 Sensi " + tierLabelOf(tier) + " · Área VIP";

  if (!locked && state.user.isVip) loadExtrasOnce();
}

/* ================== opções (chips) ================== */

function setupOpts(id) {
  const box = document.getElementById(id);
  if (!box) return;
  box.querySelectorAll(".opt").forEach(o => {
    o.addEventListener("click", () => {
      box.querySelectorAll(".opt").forEach(x => x.classList.remove("sel"));
      o.classList.add("sel");
    });
  });
}
setupOpts("styleOpts"); setupOpts("levelOpts"); setupOpts("aimOpts"); setupOpts("emuStyleOpts");

function selVal(id) {
  const b = document.getElementById(id);
  return b ? b.querySelector(".opt.sel")?.dataset.v : undefined;
}

/* ================== estado VIP na interface ================== */

let vipExpireTimer = null;

function scheduleVipExpiryCheck() {
  clearTimeout(vipExpireTimer);
  if (!state.user.isVip || !state.user.vipExpiresAt) return;
  let ms = new Date(state.user.vipExpiresAt).getTime() - Date.now();
  if (ms < 0) ms = 0;
  const MAX_TIMEOUT = 2147483000;
  if (ms > MAX_TIMEOUT) {
    vipExpireTimer = setTimeout(scheduleVipExpiryCheck, MAX_TIMEOUT);
    return;
  }
  vipExpireTimer = setTimeout(() => location.reload(), ms + 800);
}

setInterval(async () => {
  if (!state.user.isVip) return;
  try {
    const r = await api("/api/me");
    if (r && r.user) {
      const eraVip = state.user.isVip;
      state.user = r.user;
      if (eraVip && !r.user.isVip) {
        location.reload();
        return;
      }
      applyVipState();
    }
  } catch (_) {}
}, 60000);

let chipCountdown = null;

function updateVipChipText() {
  const txt = document.getElementById("vipChipTxt");
  if (!state.user.isVip || !state.user.vipExpiresAt) {
    txt.textContent = "VIP Ativo";
    return;
  }
  const ms = new Date(state.user.vipExpiresAt).getTime() - Date.now();
  if (ms <= 0) { location.reload(); return; }
  const s = Math.floor(ms / 1000);
  if (s >= 86400) {
    const d = new Date(state.user.vipExpiresAt);
    txt.textContent = "VIP até " + d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } else {
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    txt.textContent = "VIP expira em " + h + ":" + m + ":" + ss;
  }
}

function applyVipState() {
  const chip = document.getElementById("vipChip");
  const wasVip = localStorage.getItem("sensipro_was_vip") === "1";
  if (state.user.isVip) {
    localStorage.setItem("sensipro_was_vip", "1");
    chip.style.display = "inline-flex";
    clearInterval(chipCountdown);
    updateVipChipText();
    chipCountdown = setInterval(updateVipChipText, 1000);
  } else {
    clearInterval(chipCountdown);
    if (wasVip) {
      localStorage.removeItem("sensipro_was_vip");
      toast("⏰ Sua KEY VIP expirou — acesso VIP encerrado.", true);
    }
    document.getElementById("vipChipTxt").textContent = "VIP Ativo";
    chip.style.display = "none";
  }
  scheduleVipExpiryCheck();
  switchTier(state.tier); // reavalia o bloqueio do tier atual
}

/* ================== ativação de KEY ================== */

document.querySelectorAll(".activate-btn").forEach(btn => {
  btn.addEventListener("click", () => activateKey(btn.closest(".lock-overlay")));
});
document.querySelectorAll(".activate-key").forEach(inp => {
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter") activateKey(inp.closest(".lock-overlay"));
  });
});

async function activateKey(zone) {
  const input = zone.querySelector(".activate-key");
  const btn = zone.querySelector(".activate-btn");
  const code = input.value.trim();
  if (!code) { toast("Digite sua KEY para continuar.", true); return; }
  btn.disabled = true;
  btn.innerHTML = "<span class='spinner'></span>";
  const r = await api("/api/key/activate", { body: { key: code } });
  btn.disabled = false;
  btn.textContent = "Ativar KEY";
  if (r._status === 429) { toast(r.message, true); return; }
  if (r.status === "ok") {
    input.value = "";
    const me = await api("/api/me");
    if (me.user) state.user = me.user;
    applyVipState();
    toast(r.message.replace(/[✅⏰⚠️❌]\s*/g, "") || "KEY ativada!", false);
  } else {
    toast((r.message || "❌ KEY inválida ou expirada.").replace(/^[^\wÀ-ÿ]+/, ""), true);
  }
}

document.querySelectorAll(".contact-btn").forEach(btn => {
  btn.addEventListener("click", requestVipContact);
});

async function requestVipContact() {
  if (!state.contactLink) {
    toast("O administrador ainda não configurou o canal de contato.", true);
    return;
  }
  window.open(state.contactLink, "_blank");
}

/* ================== modal upsell ================== */

function openUpsell() {
  document.getElementById("upsellModal").classList.add("show");
}
function closeUpsell() {
  document.getElementById("upsellModal").classList.remove("show");
}
document.getElementById("upsellClose").addEventListener("click", closeUpsell);
document.getElementById("upsellModal").addEventListener("click", e => {
  if (e.target.id === "upsellModal") closeUpsell();
});
document.getElementById("upsellGo").addEventListener("click", () => {
  closeUpsell();
  document.getElementById("tierLock").scrollIntoView({ behavior: "smooth", block: "center" });
});

/* ================== seleção de modelo ================== */

function fillDeviceSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML =
    '<option value="">Selecione o modelo...</option>' +
    (window.__devices || []).map(d => '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>').join('') +
    '<option value="__other">Outro modelo (digitar)</option>';
}

["modelSel"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => {
    const sel = document.getElementById(id);
    const other = sel.value === "__other";
    const cust = document.getElementById("modelCustom");
    cust.style.display = other ? "block" : "none";
    if (other) cust.focus();
  });
});

function getModelValue() {
  const sel = document.getElementById("modelSel");
  if (!sel) return '';
  return sel.value === '__other' ? document.getElementById("modelCustom").value.trim() : sel.value.trim();
}

/* ================== seletor de DPI ================== */

function renderDpiPicker(r) {
  animateNum(document.getElementById("dpiB"), r.dpiOptions.baixa.dpi);
  animateNum(document.getElementById("dpiEq"), r.dpiOptions.equilibrada.dpi);
  animateNum(document.getElementById("dpiA"), r.dpiOptions.alta.dpi);
  document.querySelectorAll("#dpiPicker .dp-opt").forEach(b => {
    b.classList.toggle("sel", b.dataset.dpi === state.dpiSel);
  });
}

document.querySelectorAll("#dpiPicker .dp-opt").forEach(btn => {
  btn.addEventListener("click", () => {
    const r = state.lastResult;
    if (!r || !r.valuesByDpi) return;
    state.dpiSel = btn.dataset.dpi;
    document.querySelectorAll("#dpiPicker .dp-opt").forEach(b =>
      b.classList.toggle("sel", b.dataset.dpi === state.dpiSel));
    const opt = r.dpiOptions[state.dpiSel];
    renderGrid(document.getElementById("resGrid"), r.valuesByDpi[state.dpiSel]);

    const note = document.getElementById("resDpiNote");
    if (opt.delta < 0) {
      note.innerHTML = "<b>DPI Alta (" + opt.dpi + ")</b> — a tela responde mais, então <b>reduzimos a sensi em " +
        Math.abs(opt.delta) + " pontos</b> para a mira não ficar acelerada demais.";
    } else if (opt.delta > 0) {
      note.innerHTML = "<b>DPI Baixa (" + opt.dpi + ")</b> — a tela responde menos, então <b>subimos a sensi em " +
        opt.delta + " pontos</b> para o drag continuar rápido.";
    } else {
      note.style.display = "none";
      return;
    }
    note.style.display = "block";
  });
});

/* ================== GERADOR UNIFICADO ================== */

document.getElementById("genBtn").addEventListener("click", async () => {
  if (state.tier === "emulador") { await generateEmulatorSensi(); return; }
  const warn = document.getElementById("genWarn");
  const model = getModelValue();
  if (!model) {
    warn.textContent = "Informe o modelo do seu celular para continuar.";
    warn.classList.add("show");
    if (document.getElementById("modelSel").value === "__other") document.getElementById("modelCustom").focus();
    return;
  }
  warn.classList.remove("show");

  const btn = document.getElementById("genBtn");
  btn.disabled = true;
  btn.innerHTML = "<span class='spinner'></span> Gerando...";
  const r = await api("/api/generate", { body: genInputs() });
  btn.disabled = false;
  btn.innerHTML = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M13 2L3 14h7l-1 8 10-12h-7l1-8z'/></svg><span id='genBtnLabel'>Gerar Novamente</span>";

  if (r._status === 403) {
    openUpsell();
    return;
  }
  if (r._status === 429) {
    toast(r.message, true);
    document.getElementById("remaining").textContent = "Limite diário atingido — vire VIP 👑";
    openUpsell();
    return;
  }
  if (r.error) { toast(r.message || "Erro ao gerar.", true); return; }

  state.lastResult = r;
  state.dpiSel = 'equilibrada';
  renderDpiPicker(r);
  document.getElementById("dpiPicker").style.display = "";
  document.getElementById("resBtn").parentElement.style.display = "";
  renderGrid(document.getElementById("resGrid"), r.valuesByDpi.equilibrada);
  animateNumPercent(document.getElementById("resBtn"), r.fireButton);
  document.getElementById("resDpiNote").style.display = "none";

  const cicChip = document.getElementById("cicChip");
  if (r.ciclos != null) {
    cicChip.style.display = "";
    animateNum(document.getElementById("resCic"), r.ciclos);
  } else {
    cicChip.style.display = "none";
  }

  const note = document.getElementById("resNote");
  if (r.knownDevice) {
    note.innerHTML = "Dispositivo identificado: <b>" + escapeHtml(r.deviceName) + "</b>. " + escapeHtml(r.summary);
  } else {
    note.innerHTML = escapeHtml(r.unknownMessage || "");
  }
  if (r.ciclos != null) note.innerHTML += " Aparelho Apple detectado — <b>ciclos recomendados</b> incluídos.";

  document.getElementById("copyBtn").style.display = "inline-flex";
  const result = document.getElementById("result");
  result.classList.add("visible");

  updateRemaining(r);
  state.historyLoaded = false;
  if (state.user.isVip) loadExtrasOnce(true);
  toast(tierLabelOf(r.mode) + " gerada! Agora treine com ela 💪");
  setTimeout(() => result.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
});

/* ================== GERADOR EMULADOR (grátis) ================== */

async function generateEmulatorSensi() {
  const warn = document.getElementById("genWarn");
  const emu = document.getElementById("emuSel").value;
  if (!emu) {
    warn.textContent = "Escolha o seu emulador para continuar.";
    warn.classList.add("show");
    return;
  }
  warn.classList.remove("show");

  const btn = document.getElementById("genBtn");
  btn.disabled = true;
  btn.innerHTML = "<span class='spinner'></span> Gerando...";
  const r = await api("/api/generate/emulator", { body: {
    emulator: emu,
    mouseDpi: document.getElementById("mouseDpi").value,
    mouseSens: document.getElementById("mouseSens").value,
    style: selVal("emuStyleOpts"),
    preset: document.getElementById("emuPreset").value
  }});
  btn.disabled = false;
  btn.innerHTML = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M13 2L3 14h7l-1 8 10-12h-7l1-8z'/></svg><span id='genBtnLabel'>Gerar Novamente</span>";

  if (r._status === 429) {
    toast(r.message, true);
    document.getElementById("remaining").textContent = "Limite diário atingido — vire VIP 👑";
    openUpsell();
    return;
  }
  if (r.error) { toast(r.message || "Erro ao gerar.", true); return; }

  state.lastResult = r;
  state.dpiSel = null;
  document.getElementById("dpiPicker").style.display = "none";
  document.getElementById("resBtn").parentElement.style.display = "none";
  document.getElementById("cicChip").style.display = "none";
  document.getElementById("resDpiNote").style.display = "none";
  renderGrid(document.getElementById("resGrid"), r.values, EMU_NAMES);

  const note = document.getElementById("resNote");
  note.innerHTML =
    "Emulador: <b>" + escapeHtml(r.emulatorLabel) + "</b> · " +
    "<b>DPI recomendado do mouse: " + r.dpi + "</b><br>" + escapeHtml(r.summary);

  document.getElementById("copyBtn").style.display = "inline-flex";
  const result = document.getElementById("result");
  result.classList.add("visible");

  updateRemaining(r);
  state.historyLoaded = false;
  if (state.user.isVip) loadExtrasOnce(true);
  toast("Sensi Emulador gerada! Agora treine com ela 💪");
  setTimeout(() => result.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
}

function genInputs() {
  return {
    tier: state.tier,
    deviceModel: getModelValue(),
    dpiAtual: document.getElementById("dpiAtual").value,
    style: selVal("styleOpts"),
    level: selVal("levelOpts"),
    aim: selVal("aimOpts")
  };
}

function updateRemaining(r) {
  const elm = document.getElementById("remaining");
  if (r.unlimited) { elm.textContent = "Gerações ilimitadas (VIP)"; return; }
  if (typeof r.remaining === "number") {
    elm.textContent = "Restam " + r.remaining + " de " + r.limit + " gerações hoje (Sensi Normal)";
  }
}

document.getElementById("copyBtn").addEventListener("click", () => {
  if (state.lastResult) copyText(fmtResult(state.lastResult), "Config copiada!");
});

/* ================== extras VIP (histórico / perfis) ================== */

function loadExtrasOnce(force) {
  if (!state.user.isVip) return;
  document.getElementById("vipExtras").style.display = "";
  if (!state.historyLoaded || force) {
    state.historyLoaded = true;
    api("/api/history").then(r => {
      if (r.history) renderHistory(r.history);
    });
  }
  loadProfiles();
}

function renderHistory(history) {
  const box = document.getElementById("historyList");
  box.innerHTML = "";
  if (!history.length) {
    box.innerHTML = "<div class='empty-hint'>Suas gerações aparecem aqui.</div>";
    return;
  }
  history.forEach(h => {
    const row = el("div", "row-item");
    row.appendChild(el("div", "row-main",
      "<b>Sensi " + escapeHtml(tierLabelOf(h.mode)) + "</b>" +
      "<span>" + new Date(h.at).toLocaleString("pt-BR") +
      (h.deviceName ? " · " + escapeHtml(h.deviceName) : "") + "</span>"));
    const btn = el("button", "btn btn-ghost btn-sm", "Copiar");
    btn.onclick = () => copyText(fmtResult(h), "Copiada do histórico!");
    row.appendChild(btn);
    box.appendChild(row);
  });
}

async function loadProfiles() {
  if (!state.user.isVip) return;
  const r = await api("/api/profiles");
  if (!r.profiles) return;
  renderProfiles(r.profiles);
}

function renderProfiles(profiles) {
  const box = document.getElementById("profileList");
  box.innerHTML = "";
  if (!profiles.length) {
    box.innerHTML = "<div class='empty-hint'>Nenhum perfil salvo ainda.</div>";
    return;
  }
  profiles.forEach(p => {
    const row = el("div", "row-item");
    row.appendChild(el("div", "row-main",
      "<b>" + escapeHtml(p.name) + "</b><span>" + new Date(p.at).toLocaleDateString("pt-BR") + "</span>"));
    const actions = el("div", null);
    actions.style.display = "flex";
    actions.style.gap = "8px";
    const loadBtn = el("button", "btn btn-red btn-sm", "Carregar");
    loadBtn.onclick = () => applyProfile(p.inputs);
    const delBtn = el("button", "btn btn-ghost btn-sm", "Excluir");
    delBtn.onclick = async () => {
      await api("/api/profiles/" + p.id, { method: "DELETE" });
      loadProfiles();
    };
    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);
    box.appendChild(row);
  });
}

function setOpt(id, v) {
  const b = document.getElementById(id);
  if (!b || !v) return;
  b.querySelectorAll(".opt").forEach(o => o.classList.toggle("sel", o.dataset.v === v));
}

function applyProfile(inputs) {
  if (!inputs) return;
  switchTier(inputs.tier || 'normal');
  if (inputs.deviceModel !== undefined) setDeviceValue(inputs.deviceModel || "");
  if (inputs.dpiAtual) document.getElementById("dpiAtual").value = inputs.dpiAtual;
  setOpt("styleOpts", inputs.style);
  setOpt("levelOpts", inputs.level);
  setOpt("aimOpts", inputs.aim);
  toast("Perfil carregado!");
}

function setDeviceValue(val) {
  const sel = document.getElementById("modelSel");
  const cust = document.getElementById("modelCustom");
  const opts = [...sel.options].map(o => o.value);
  if (val && opts.includes(val)) {
    sel.value = val;
    cust.style.display = 'none';
    cust.value = '';
  } else if (val) {
    sel.value = '__other';
    cust.style.display = 'block';
    cust.value = val;
  } else {
    sel.value = '';
    cust.style.display = 'none';
    cust.value = '';
  }
}

async function saveProfile() {
  if (!state.user.isVip) return openUpsell();
  const name = prompt("Nome do perfil:", "Meu perfil");
  if (!name) return;
  const r = await api("/api/profiles", { body: { name, inputs: genInputs() } });
  if (r.profile) { loadProfiles(); toast("Perfil salvo!"); }
  else toast(r.message || "Não foi possível salvar.", true);
}

/* botão salvar perfil (aparece para VIPs via tecla de atalho? mantemos simples) */
document.addEventListener("keydown", e => {
  if (e.altKey && (e.key === 'p' || e.key === 'P')) saveProfile();
});

/* ================== vídeos: clique para carregar ================== */

document.querySelectorAll(".video-card").forEach(card => {
  card.addEventListener("click", () => {
    const frame = card.querySelector(".video-frame");
    if (frame.querySelector("iframe")) return;
    const id = card.dataset.yt;
    frame.innerHTML =
      "<iframe src='https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) +
      "?autoplay=1&rel=0' title='Vídeo de treino' loading='lazy' allowfullscreen " +
      "allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'></iframe>";
  });
});

/* ================== extras ================== */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function shareSite() {
  const data = { title: "AIMZY", text: "Olha esse gerador de sensibilidade do Free Fire! 🔥", url: location.origin };
  if (navigator.share) {
    try { await navigator.share(data); } catch (e) {}
  } else {
    window.open("https://wa.me/?text=" + encodeURIComponent(data.text + " " + data.url), "_blank");
  }
}

document.getElementById("shareFab").addEventListener("click", shareSite);

document.querySelectorAll(".faq-item").forEach(item => {
  item.querySelector(".faq-q").addEventListener("click", () => {
    const wasOpen = item.classList.contains("open");
    document.querySelectorAll(".faq-item").forEach(i => {
      i.classList.remove("open");
      i.querySelector(".faq-a").style.maxHeight = null;
    });
    if (!wasOpen) {
      item.classList.add("open");
      const a = item.querySelector(".faq-a");
      a.style.maxHeight = a.scrollHeight + "px";
    }
  });
});

/* ================== modal de nome ================== */

function showNameModal() {
  var m = document.getElementById("nameModal");
  if (m) m.classList.add("show");
  var inp = document.getElementById("nameInput");
  if (inp) setTimeout(function() { inp.focus(); }, 100);
}

function hideNameModal() {
  var m = document.getElementById("nameModal");
  if (m) m.classList.remove("show");
}

function confirmName() {
  var input = document.getElementById("nameInput");
  if (!input) return;
  var name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }
  localStorage.setItem(LS_NAME, name);
  var chipName = document.getElementById("userChipName");
  var chip = document.getElementById("userChip");
  if (chipName) chipName.textContent = name;
  if (chip) chip.style.display = "inline-flex";
  hideNameModal();
  api("/api/me/name", { method: "PUT", body: { name: name } }).catch(function() {});
}

document.getElementById("nameConfirm").addEventListener("click", function(e) {
  e.preventDefault();
  confirmName();
});

document.getElementById("nameInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmName();
  }
});

/* ================== conta (e-mail / senha) ================== */

let accMode = "login";

function setAccMode(m) {
  accMode = m;
  var tabs = document.getElementById("accTabs");
  if (tabs) tabs.querySelectorAll(".opt").forEach(function(o) { o.classList.toggle("sel", o.dataset.v === m); });
  var nameRow = document.getElementById("accNameRow");
  if (nameRow) nameRow.style.display = m === "register" ? "" : "none";
  var go = document.getElementById("accGo");
  if (go) go.textContent = m === "register" ? "Criar conta" : "Entrar";
  var pw = document.getElementById("accPwInp");
  if (pw) pw.setAttribute("autocomplete", m === "register" ? "new-password" : "current-password");
}

function openAccountModal() {
  var m = document.getElementById("accountModal");
  if (m) m.classList.add("show");
  setAccMode(accMode);
  var inp = document.getElementById("accEmailInp");
  if (inp) setTimeout(function() { inp.focus(); }, 100);
}

function closeAccountModal() {
  var m = document.getElementById("accountModal");
  if (m) m.classList.remove("show");
}

function refreshAccountChip() {
  var chipTxt = document.getElementById("accountChipTxt");
  if (!chipTxt) return;
  api("/api/auth/me").then(function(r) {
    if (r && r._status === 200 && r.account) {
      chipTxt.textContent = r.account.email;
      document.getElementById("accLogged").style.display = "";
      document.getElementById("accForms").style.display = "none";
      var em = document.getElementById("accEmail");
      if (em) em.textContent = r.account.email;
    } else {
      chipTxt.textContent = "Entrar";
      document.getElementById("accLogged").style.display = "none";
      document.getElementById("accForms").style.display = "";
    }
  }).catch(function() {});
}

document.getElementById("accountChip").addEventListener("click", openAccountModal);
document.getElementById("accClose").addEventListener("click", closeAccountModal);
document.getElementById("accClose2").addEventListener("click", closeAccountModal);
document.getElementById("accountModal").addEventListener("click", function(e) {
  if (e.target.id === "accountModal") closeAccountModal();
});
document.getElementById("accTabs").addEventListener("click", function(e) {
  var opt = e.target.closest(".opt");
  if (opt) setAccMode(opt.dataset.v);
});

document.getElementById("accGo").addEventListener("click", async function() {
  var email = document.getElementById("accEmailInp").value.trim();
  var password = document.getElementById("accPwInp").value;
  var name = document.getElementById("accName").value.trim();
  if (!email || !password) { toast("Preencha e-mail e senha.", true); return; }
  if (accMode === "register" && password.length < 8) { toast("A senha precisa ter pelo menos 8 caracteres.", true); return; }

  var btn = this;
  btn.disabled = true;
  var path = accMode === "register" ? "/api/auth/register" : "/api/auth/login";
  var body = accMode === "register" ? { email: email, password: password, name: name } : { email: email, password: password };
  var r = await api(path, { body: body });
  btn.disabled = false;

  if (r && r.token) {
    localStorage.setItem(LS_TOKEN, r.token);
    toast(accMode === "register" ? "Conta criada! Bem-vindo 🎮" : "Bem-vindo de volta!");
    setTimeout(function() { location.reload(); }, 900);
  } else {
    toast((r && r.message) || "Não foi possível entrar.", true);
  }
});

document.getElementById("accLogoutBtn").addEventListener("click", async function() {
  await api("/api/auth/logout", { method: "POST" });
  localStorage.removeItem(LS_TOKEN);
  location.reload();
});

document.getElementById("accPwBtn").addEventListener("click", async function() {
  var oldPw = document.getElementById("accOldPw").value;
  var newPw = document.getElementById("accNewPw").value;
  if (!oldPw || newPw.length < 8) { toast("A nova senha precisa ter pelo menos 8 caracteres.", true); return; }
  var r = await api("/api/auth/change-password", { body: { currentPassword: oldPw, newPassword: newPw } });
  if (r && r.ok) {
    toast("Senha alterada com sucesso!");
    document.getElementById("accOldPw").value = "";
    document.getElementById("accNewPw").value = "";
  } else {
    toast((r && r.message) || "Erro ao trocar a senha.", true);
  }
});

(async function boot() {
  var saved = localStorage.getItem(LS_TIER);
  if (saved && TIER_INFO[saved]) state.tier = saved;

  var savedName = localStorage.getItem(LS_NAME);

  try {
    await initSession(savedName || undefined);
  } catch (e) {
    toast("Falha ao conectar no servidor.", true);
  }

  if (savedName) {
    hideNameModal();
    var cn = document.getElementById("userChipName");
    var cc = document.getElementById("userChip");
    if (cn) cn.textContent = savedName;
    if (cc) cc.style.display = "inline-flex";
  } else if (state.user && state.user.label && state.user.label.indexOf("Jogador #") !== 0) {
    hideNameModal();
    localStorage.setItem(LS_NAME, state.user.label);
    var cn2 = document.getElementById("userChipName");
    var cc2 = document.getElementById("userChip");
    if (cn2) cn2.textContent = state.user.label;
    if (cc2) cc2.style.display = "inline-flex";
  } else {
    // Defer name modal until welcome screen is dismissed
    if (window.__welcomeDismissed) {
      showNameModal();
    } else {
      window.__pendingShowNameModal = true;
    }
  }

  switchTier(state.tier);
  refreshAccountChip();
  api("/api/devices/names").then(function(r) {
    if (!r.devices) return;
    window.__devices = r.devices;
    fillDeviceSelect("modelSel");
  });
  api("/api/announcement").then(function(r) {
    if (r._status === 200 && r.announcement && r.announcement.message) {
      var el = document.getElementById("announceModal");
      var t = document.getElementById("announceTitle");
      var m = document.getElementById("announceMsg");
      if (t) t.textContent = r.announcement.title || "⚠️ Aviso";
      if (m) m.textContent = r.announcement.message;
      if (el) el.style.display = "flex";
    }
  });
  api("/api/prices").then(function(r) {
    if (r._status === 200 && r.prices) {
      var premEl = document.getElementById("premiumPrices");
      var vipEl = document.getElementById("vipPrices");
      if (premEl && r.prices.premium) {
        premEl.innerHTML = Object.entries(r.prices.premium).map(function(e) {
          var labels = {'1h':'1 Hora','2h':'2 Horas','3h':'3 Horas','6h':'6 Horas','12h':'12 Horas','1d':'1 Dia','3d':'3 Dias','7d':'7 Dias','15d':'15 Dias','30d':'30 Dias','permanent':'Permanente'};
          return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">' + (labels[e[0]]||e[0]) + '</span><b style="color:#86efac">R$ ' + e[1].toFixed(2) + '</b></div>';
        }).join('');
      }
      if (vipEl && r.prices.vip) {
        vipEl.innerHTML = Object.entries(r.prices.vip).map(function(e) {
          var labels = {'1d':'1 Dia','7d':'7 Dias','30d':'30 Dias','permanent':'Permanente'};
          return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">' + (labels[e[0]]||e[0]) + '</span><b style="color:#86efac">R$ ' + e[1].toFixed(2) + '</b></div>';
        }).join('');
      }
      // planos personalizados cadastrados pelo admin
      if (Array.isArray(r.plans) && r.plans.length) {
        function appendCustomPlans(el, type) {
          if (!el) return;
          var list = r.plans.filter(function(p) { return type === 'premium' ? p.type === 'premium' : p.type !== 'premium'; });
          if (!list.length) return;
          el.innerHTML += list.map(function(p) {
            return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">' + escapeHtml(p.name) + '</span><b style="color:#86efac">R$ ' + Number(p.price).toFixed(2) + '</b></div>';
          }).join('');
        }
        appendCustomPlans(premEl, 'premium');
        appendCustomPlans(vipEl, 'proibida');
      }
    }
  });
  api("/api/settings").then(function(r) {
    if (r._status === 200 && r.settings && r.settings.contactLink) {
      var buyPrem = document.getElementById("buyPremiumBtn");
      var buyVip = document.getElementById("buyVipBtn");
      var link = r.settings.contactLink;
      if (buyPrem) buyPrem.href = link;
      if (buyVip) buyVip.href = link;
    }
  });
  initPWA();

  // Voz de boas-vindas
  setTimeout(function() {
    if (window.AIMZYVoice) {
      AIMZYVoice.playSound();
      AIMZYVoice.playWelcome();
    }
  }, 1200);
})();

/* ================== PWA: offline + instalar app ================== */

let deferredInstallPrompt = null;

function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const chip = document.getElementById('installChip');
    if (chip && !localStorage.getItem('sensipro_installed')) chip.style.display = '';
  });

  window.addEventListener('appinstalled', () => {
    localStorage.setItem('sensipro_installed', '1');
    document.getElementById('installChip').style.display = 'none';
    toast('App instalado! Abra pelo ícone na sua tela inicial 📱');
  });

  const chip = document.getElementById('installChip');
  if (chip) {
    chip.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try {
        const res = await deferredInstallPrompt.userChoice;
        if (res && res.outcome === 'accepted') {
          localStorage.setItem('sensipro_installed', '1');
          chip.style.display = 'none';
        }
      } catch (_) {}
      deferredInstallPrompt = null;
    });
  }

  // já instalado nesta tela? esconde o botão
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    localStorage.setItem('sensipro_installed', '1');
    if (chip) chip.style.display = 'none';
  }
}
