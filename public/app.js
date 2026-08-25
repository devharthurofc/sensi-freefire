'use strict';

/* ================== estado / API ================== */

const LS_DEVICE = 'sensipro_device_id';
const LS_TOKEN = 'sensipro_token';

const state = {
  token: null,
  user: { id: null, label: null, isVip: false },
  contactLink: '',
  lastFree: null,
  lastVip: null,
  lastGen: null,
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

async function initSession() {
  const r = await fetch('/api/session/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: getDeviceId() })
  });
  const data = await r.json();
  state.token = data.token;
  state.user = data.user;
  state.contactLink = (data.settings && data.settings.contactLink) || '';
  localStorage.setItem(LS_TOKEN, '');
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

function renderGrid(gridEl, values) {
  gridEl.innerHTML = "";
  NAMES.forEach(([k, label]) => {
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

function fmtResult(r) {
  let s = "=== SENSI PRO | FREE FIRE ===\n";
  if (r.deviceName) s += "Aparelho: " + r.deviceName + "\n";
  NAMES.forEach(([k, label]) => { s += label + ": " + r.values[k] + "\n"; });
  s += "Botão de disparo: " + r.fireButton + "%\n";
  if (r.ciclos) s += "Ciclos: " + r.ciclos + "\n";
  s += "DPI recomendado: " + r.dpi + "\n";
  return s;
}

/* ================== seletor de modo ================== */

document.querySelectorAll("#modes .mode-card").forEach(btn => {
  btn.addEventListener("click", () => switchMode(btn.dataset.tab));
});

function switchMode(tab) {
  document.querySelectorAll("#modes .mode-card").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("show"));
  document.getElementById("panel-" + tab).classList.add("show");
  if ((tab === 'vip' || tab === 'gerado') && state.user.isVip) {
    loadHistoryOnce();
    loadProfiles();
  }
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
setupOpts("freeRamOpts"); setupOpts("freeStyleOpts");
setupOpts("vipStyleOpts"); setupOpts("vipLevelOpts"); setupOpts("vipAimOpts");
setupOpts("gStyleOpts"); setupOpts("gLevelOpts"); setupOpts("gAimOpts");
setupOpts("ipStyleOpts"); setupOpts("ipLevelOpts"); setupOpts("ipAimOpts");

function selVal(id) {
  const b = document.getElementById(id);
  return b ? b.querySelector(".opt.sel")?.dataset.v : undefined;
}
function setSel(id, v) {
  const b = document.getElementById(id);
  if (!b) return;
  b.querySelectorAll(".opt").forEach(o => o.classList.toggle("sel", o.dataset.v === v));
}

/* ================== estado VIP na interface ================== */

let vipExpireTimer = null;

/* Agenda o reload automático da página no exato momento em que a KEY expira */
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

/* Verifica a cada minuto se o VIP ainda é válido (ex: admin desativou a key) */
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
  ["vipLock", "genLock"].forEach(id => {
    document.getElementById(id).classList.toggle("hide-lock", state.user.isVip);
  });
  ["vipContent", "genContent"].forEach(id => {
    document.getElementById(id).classList.remove("blur-lock");
  });
  if (state.user.isVip) {
    loadHistoryOnce();
    loadProfiles();
  }
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
  switchMode("vip");
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

function fillIphoneSelect() {
  const sel = document.getElementById("ipModel");
  if (!sel) return;
  const iphones = (window.__devices || []).filter(d => d.indexOf("iPhone") === 0);
  sel.innerHTML =
    '<option value="">Selecione o modelo...</option>' +
    iphones.map(d => '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>').join('');
}

function getModelValue(selId, custId) {
  const sel = document.getElementById(selId);
  if (!sel) return '';
  return sel.value === '__other' ? document.getElementById(custId).value.trim() : sel.value.trim();
}

function setDeviceValue(selId, custId, val) {
  const sel = document.getElementById(selId);
  const cust = document.getElementById(custId);
  if (!sel) return;
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

["freeModel", "gModel"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => {
    const other = document.getElementById(id).value === "__other";
    const cust = document.getElementById(id === "freeModel" ? "freeModelCustom" : "gModelCustom");
    cust.style.display = other ? "block" : "none";
    if (other) cust.focus();
  });
});

/* ================== MODO FREE ================== */

document.getElementById("freeGenBtn").addEventListener("click", async () => {
  const warn = document.getElementById("freeWarn");
  const model = getModelValue("freeModel", "freeModelCustom");
  if (!model) {
    warn.textContent = "Informe o modelo do seu celular para continuar.";
    warn.classList.add("show");
    if (document.getElementById("freeModel").value === "__other") document.getElementById("freeModelCustom").focus();
    return;
  }
  warn.classList.remove("show");
  const btn = document.getElementById("freeGenBtn");
  btn.disabled = true;
  btn.innerHTML = "<span class='spinner'></span> Gerando...";
  const r = await api("/api/generate/free", { body: {
    deviceModel: model,
    ram: selVal("freeRamOpts"),
    style: selVal("freeStyleOpts")
  }});
  btn.disabled = false;
  btn.innerHTML = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M13 2L3 14h7l-1 8 10-12h-7l1-8z'/></svg>Gerar Novamente";

  if (r._status === 429) {
    toast(r.message, true);
    document.getElementById("freeRemaining").textContent = "Limite diário atingido — vire VIP 👑";
    openUpsell();
    return;
  }
  if (r.error) { toast(r.message || "Erro ao gerar.", true); return; }

  state.lastFree = r;
  renderGrid(document.getElementById("freeGenGrid"), r.values);
  animateNum(document.getElementById("freeDpiVal"), r.dpi);
  animateNumPercent(document.getElementById("freeBtnVal"), r.fireButton);
  document.getElementById("freeCopyBtn").style.display = "inline-flex";
  document.getElementById("freeResult").classList.add("visible");

  const note = document.getElementById("freeNote");
  if (r.knownDevice) note.innerHTML = "Perfil do dispositivo reconhecido: <b>" + r.deviceName + "</b>.";
  else note.innerHTML = "Modelo não encontrado. Usaremos as características informadas para gerar uma configuração personalizada.";

  updateRemaining(r);
  toast("Config gerada com sucesso!");
});

function animateNumPercent(elm, target) {
  const start = performance.now();
  function step(t) {
    const p = Math.min((t - start) / 700, 1);
    elm.textContent = Math.round(target * p) + "%";
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateRemaining(r) {
  const el = document.getElementById("freeRemaining");
  if (r.unlimited) { el.textContent = "Gerações ilimitadas (VIP)"; el.style.color = "#d8b4fe"; return; }
  if (typeof r.remaining === "number") {
    el.textContent = "Restam " + r.remaining + " de " + r.limit + " gerações hoje";
    el.style.color = "";
  }
}

document.getElementById("freeCopyBtn").addEventListener("click", () => {
  if (state.lastFree) copyText(fmtResult(state.lastFree), "Config copiada!");
});

/* ================== MODO VIP ================== */

document.getElementById("vipGenBtn").addEventListener("click", async () => {
  if (!state.user.isVip) return openUpsell();
  const btn = document.getElementById("vipGenBtn");
  btn.disabled = true;
  btn.innerHTML = "<span class='spinner'></span> Gerando...";
  const r = await api("/api/generate/vip", { body: vipInputs() });
  btn.disabled = false;
  btn.innerHTML = "⚡ Gerar Sensi VIP";
  if (r._status === 403) return openUpsell();
  if (r.error) { toast(r.message || "Erro ao gerar.", true); return; }
  state.lastVip = r;
  renderGrid(document.getElementById("vipGenGrid"), r.values);
  animateNum(document.getElementById("vipDpiVal"), r.dpi);
  animateNumPercent(document.getElementById("vipBtnVal"), r.fireButton);
  document.getElementById("vipCopyBtn").style.display = "inline-flex";
  document.getElementById("vipResult").classList.add("visible");
  document.getElementById("vipNote").innerHTML = "Configuração detalhada gerada com base no seu perfil de jogo.";
  state.historyLoaded = false;
  loadHistoryOnce();
  toast("Sensi VIP gerada!");
});

function vipInputs() {
  return {
    brand: document.getElementById("vipBrand").value,
    ram: document.getElementById("vipRam").value,
    refreshHz: document.getElementById("vipHz").value,
    fps: document.getElementById("vipFps").value,
    style: selVal("vipStyleOpts"),
    level: selVal("vipLevelOpts"),
    aim: selVal("vipAimOpts")
  };
}

document.getElementById("vipCopyBtn").addEventListener("click", () => {
  if (state.lastVip) copyText(fmtResult(state.lastVip), "Config VIP copiada!");
});

document.getElementById("vipSaveProfileBtn").addEventListener("click", saveProfile);

/* ================== MODO GERADO VIP ================== */

document.getElementById("gGenBtn").addEventListener("click", async () => {
  if (!state.user.isVip) return openUpsell();
  const warn = document.getElementById("gWarn");
  const model = getModelValue("gModel", "gModelCustom");
  if (!model) {
    warn.textContent = "Informe o modelo do seu celular para continuar.";
    warn.classList.add("show");
    if (document.getElementById("gModel").value === "__other") document.getElementById("gModelCustom").focus();
    return;
  }
  warn.classList.remove("show");

  const btn = document.getElementById("gGenBtn");
  btn.disabled = true;
  btn.innerHTML = "<span class='spinner'></span> Analisando dispositivo...";
  const r = await api("/api/generate/gerado", { body: geradoInputs() });
  btn.disabled = false;
  btn.innerHTML = "🧠 Analisar e Gerar Config";
  if (r._status === 403) return openUpsell();
  if (r.error) {
    warn.textContent = r.message;
    warn.classList.add("show");
    return;
  }

  state.lastGen = r;
  renderGrid(document.getElementById("gGenGrid"), r.values);
  animateNum(document.getElementById("gDpiVal"), r.dpi);
  animateNumPercent(document.getElementById("gBtnVal"), r.fireButton);
  document.getElementById("gCopyBtn").style.display = "inline-flex";
  document.getElementById("gResult").classList.add("visible");

  const note = document.getElementById("gNote");
  if (r.knownDevice) {
    note.innerHTML = "Dispositivo identificado: <b>" + r.deviceName + "</b>. " + r.summary;
  } else {
    note.innerHTML = r.unknownMessage;
  }
  state.historyLoaded = false;
  loadHistoryOnce();
  toast("Recomendação personalizada gerada!");
});

function geradoInputs() {
  return {
    deviceModel: getModelValue("gModel", "gModelCustom"),
    brand: document.getElementById("gBrand").value,
    ram: document.getElementById("gRam").value,
    refreshHz: document.getElementById("gHz").value,
    fps: document.getElementById("gFps").value,
    dpiAtual: document.getElementById("gDpiAtual").value,
    style: selVal("gStyleOpts"),
    level: selVal("gLevelOpts"),
    aim: selVal("gAimOpts")
  };
}

document.getElementById("gCopyBtn").addEventListener("click", () => {
  if (state.lastGen) copyText(fmtResult(state.lastGen), "Config copiada!");
});

/* ================== MODO IPHONE ================== */

document.getElementById("ipGenBtn").addEventListener("click", async () => {
  const warn = document.getElementById("ipWarn");
  const model = document.getElementById("ipModel").value.trim();
  if (!model) {
    warn.classList.add("show");
    document.getElementById("ipModel").focus();
    return;
  }
  warn.classList.remove("show");

  const btn = document.getElementById("ipGenBtn");
  btn.disabled = true;
  btn.innerHTML = "<span class='spinner'></span> Gerando...";
  const r = await api("/api/generate/iphone", { body: {
    deviceModel: model,
    refreshHz: document.getElementById("ipHz").value,
    style: selVal("ipStyleOpts"),
    level: selVal("ipLevelOpts"),
    aim: selVal("ipAimOpts")
  }});
  btn.disabled = false;
  btn.innerHTML = "🍎 Gerar Sensi iPhone";

  if (r._status === 429) {
    toast(r.message, true);
    document.getElementById("ipRemaining").textContent = "Limite diário atingido — vire VIP 👑";
    openUpsell();
    return;
  }
  if (r.error) { toast(r.message || "Erro ao gerar.", true); return; }

  state.lastIphone = r;
  renderGrid(document.getElementById("ipGenGrid"), r.values);
  animateNum(document.getElementById("ipDpiVal"), r.dpi);
  animateNum(document.getElementById("ipCicVal"), r.ciclos);
  animateNumPercent(document.getElementById("ipBtnVal"), r.fireButton);
  document.getElementById("ipCopyBtn").style.display = "inline-flex";
  document.getElementById("ipResult").classList.add("visible");
  document.getElementById("ipNote").innerHTML =
    "<b>" + escapeHtml(r.deviceName) + "</b> — " + escapeHtml(r.summary);
  updateRemaining(r);
  state.historyLoaded = false;
  loadHistoryOnce();
  toast("Sensi iPhone gerada!");
});

document.getElementById("ipCopyBtn").addEventListener("click", () => {
  if (state.lastIphone) copyText(fmtResult(state.lastIphone), "Config iPhone copiada!");
});

/* ================== histórico ================== */

function loadHistoryOnce(force) {
  if (!state.user.isVip) return;
  if (state.historyLoaded && !force) return;
  state.historyLoaded = true;
  api("/api/history").then(r => {
    if (!r.history) return;
    renderHistory(r.history);
  });
}

function renderHistory(history) {
  const box = document.getElementById("historyList");
  box.innerHTML = "";
  if (!history.length) {
    box.innerHTML = "<div class='empty-hint'>Suas gerações aparecem aqui.</div>";
    return;
  }
  const modeNames = { free: "FREE", vip: "VIP", gerado: "GERADO VIP" };
  history.forEach(h => {
    const row = el("div", "row-item");
    row.appendChild(el("div", "row-main",
      "<b>Sensi " + (modeNames[h.mode] || h.mode) + "</b>" +
      "<span>" + new Date(h.at).toLocaleString("pt-BR") +
      (h.deviceName ? " · " + h.deviceName : "") + "</span>"));
    const btn = el("button", "btn btn-ghost btn-sm", "Copiar");
    btn.onclick = () => copyText(fmtResult(h), "Copiada do histórico!");
    row.appendChild(btn);
    box.appendChild(row);
  });
}

/* ================== perfis salvos ================== */

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
    const loadBtn = el("button", "btn btn-vip btn-sm", "Carregar");
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

function applyProfile(inputs) {
  if (!inputs) return;
  if (inputs.deviceModel !== undefined) {
    switchMode("gerado");
    setDeviceValue("gModel", "gModelCustom", inputs.deviceModel || "");
    if (inputs.brand) document.getElementById("gBrand").value = inputs.brand;
    if (inputs.ram) document.getElementById("gRam").value = inputs.ram;
    if (inputs.refreshHz) document.getElementById("gHz").value = inputs.refreshHz;
    if (inputs.fps) document.getElementById("gFps").value = inputs.fps;
    if (inputs.dpiAtual) document.getElementById("gDpiAtual").value = inputs.dpiAtual;
    if (inputs.style) setSel("gStyleOpts", inputs.style);
    if (inputs.level) setSel("gLevelOpts", inputs.level);
    if (inputs.aim) setSel("gAimOpts", inputs.aim);
  } else {
    switchMode("vip");
    if (inputs.brand) document.getElementById("vipBrand").value = inputs.brand;
    if (inputs.ram) document.getElementById("vipRam").value = inputs.ram;
    if (inputs.refreshHz) document.getElementById("vipHz").value = inputs.refreshHz;
    if (inputs.fps) document.getElementById("vipFps").value = inputs.fps;
    if (inputs.style) setSel("vipStyleOpts", inputs.style);
    if (inputs.level) setSel("vipLevelOpts", inputs.level);
    if (inputs.aim) setSel("vipAimOpts", inputs.aim);
  }
  toast("Perfil carregado!");
}

async function saveProfile() {
  if (!state.user.isVip) return openUpsell();
  const name = prompt("Nome do perfil:", "Meu perfil");
  if (!name) return;
  const r = await api("/api/profiles", { body: { name, inputs: vipInputs() } });
  if (r.profile) { loadProfiles(); toast("Perfil salvo!"); }
  else toast(r.message || "Não foi possível salvar.", true);
}

/* ================== extras ================== */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function shareSite() {
  const data = { title: "SENSI PRO", text: "Olha esse gerador de sensibilidade do Free Fire! 🔥", url: location.origin };
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

(async function boot() {
  try {
    await initSession();
  } catch (e) {
    toast("Falha ao conectar no servidor.", true);
  }
  api("/api/devices/names").then(r => {
    if (!r.devices) return;
    window.__devices = r.devices;
    fillDeviceSelect("freeModel");
    fillDeviceSelect("gModel");
    fillIphoneSelect();
  });
})();
