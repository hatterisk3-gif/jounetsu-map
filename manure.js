
const PIN_ORDER_KEY = "passionMapManurePinOrder";
const CACHE_KEY = "manureMapData";
const PENDING_KEY = "manurePendingSync";
const COMPOST_CATEGORY_ID = "compost";
const LIST_STATUSES = ["inprogress", "request", "accepted"];
const BAGS_PER_A = 3.4;
const TRUCKS_PER_A = 0.05;

const STATUS_COLORS = {
  none: "#90A4AE",
  request: "#E53935",
  accepted: "#FB8C00",
  inprogress: "#F9A825",
  completed: "#43A047",
  canceled: "#EEEEEE"
};
const STATUS_LABELS = {
  none: "未着手",
  request: "依頼中",
  accepted: "予定",
  inprogress: "途中",
  completed: "完了",
  canceled: "中止"
};

let map;
let mapsApiReady = false;
let latestUserPos = null;
let userLocationMarker = null;
let cachedAll = [];
let allFields = [];
let polygons = [];
let fieldPolys = {};
let fieldLabels = {};
let selectedId = "";
let loginReady = false;
let dataLoaded = false;
let currentUserName = localStorage.getItem("passionMapUserName") || "";
let pinOrder = loadPinOrder();
let pendingPanId = "";
const fieldSyncQueue_ = [];
let fieldSyncRunning_ = false;
const FIELD_SYNC_GAP_MS = 350;

function loadPinOrder() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(PIN_ORDER_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch (e) {
    return [];
  }
}

function savePinOrder() {
  try { sessionStorage.setItem(PIN_ORDER_KEY, JSON.stringify(pinOrder)); } catch (e) {}
}

function emptyCatStatus() {
  return {
    status: "none",
    deadline: "",
    scheduled_date: "",
    cancel_reason: "",
    has_pin: false,
    route_selected: false
  };
}

function migratePDataManure(pData) {
  if (!pData || typeof pData !== "object") return pData;
  if (!pData.catStatuses || typeof pData.catStatuses !== "object") pData.catStatuses = {};
  if (!pData.catStatuses[COMPOST_CATEGORY_ID]) {
    pData.catStatuses[COMPOST_CATEGORY_ID] = {
      status: pData.manure_status || "none",
      deadline: pData.manure_deadline || "",
      scheduled_date: pData.manure_scheduled_date || "",
      cancel_reason: pData.manure_cancel_reason || "",
      has_pin: !!pData.manure_has_pin,
      route_selected: !!pData.manure_route_selected
    };
  }
  const compost = pData.catStatuses[COMPOST_CATEGORY_ID];
  if (compost.route_selected == null && pData.manure_route_selected) compost.route_selected = true;
  compost.route_selected = !!compost.route_selected;
  pData.manure_status = compost.status || "none";
  pData.manure_deadline = compost.deadline || "";
  pData.manure_scheduled_date = compost.scheduled_date || "";
  pData.manure_cancel_reason = compost.cancel_reason || "";
  pData.manure_has_pin = !!compost.has_pin;
  pData.manure_route_selected = !!compost.route_selected;
  return pData;
}

function getCompostStatus(pData) {
  migratePDataManure(pData);
  const c = pData.catStatuses[COMPOST_CATEGORY_ID] || emptyCatStatus();
  return c.status || "none";
}

function applyCompostStatusUpdate(pData, patch) {
  migratePDataManure(pData);
  const c = pData.catStatuses[COMPOST_CATEGORY_ID];
  Object.assign(c, patch || {});
  pData.manure_status = c.status || "none";
  pData.manure_deadline = c.deadline || "";
  pData.manure_scheduled_date = c.scheduled_date || "";
  pData.manure_cancel_reason = c.cancel_reason || "";
  pData.manure_has_pin = !!c.has_pin;
  pData.manure_route_selected = !!c.route_selected;
}

function buildManureDataPayload(pData) {
  migratePDataManure(pData);
  return {
    catStatuses: pData.catStatuses || {},
    manure_status: pData.manure_status || "none",
    manure_deadline: pData.manure_deadline || "",
    manure_scheduled_date: pData.manure_scheduled_date || "",
    manure_cancel_reason: pData.manure_cancel_reason || "",
    manure_has_pin: !!pData.manure_has_pin,
    manure_route_selected: !!pData.manure_route_selected,
    transplant_jun: pData.transplant_jun || ""
  };
}

function parseCoords(raw) {
  let coords = raw;
  if (typeof coords === "string") {
    try { coords = JSON.parse(coords); } catch (e) { return []; }
  }
  if (!Array.isArray(coords)) return [];
  return coords.map((c) => {
    const lat = Number(c && (c.lat != null ? c.lat : c[0]));
    const lng = Number(c && (c.lng != null ? c.lng : c[1]));
    return { lat: lat, lng: lng };
  }).filter((c) => !isNaN(c.lat) && !isNaN(c.lng));
}

function fieldAreaA(field) {
  const n = Number(field && field.area);
  if (!isNaN(n) && n > 0) return n;
  return 0;
}

function fieldCenter(field) {
  const coords = parseCoords(field && field.coords);
  if (!coords.length) return null;
  let lat = 0, lng = 0;
  coords.forEach((c) => { lat += c.lat; lng += c.lng; });
  return { lat: lat / coords.length, lng: lng / coords.length };
}

function formatAmount(areaA) {
  if (!areaA || areaA <= 0) return { area: "未設定", bags: "—", trucks: "—" };
  const a = Math.round(areaA * 10) / 10;
  const bags = Math.round(areaA * BAGS_PER_A * 10) / 10;
  const trucks = Math.round(areaA * TRUCKS_PER_A * 100) / 100;
  return { area: a + " a", bags: bags + "袋", trucks: trucks + "車" };
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function syncPolygonsArray() {
  polygons = allFields.map((f) => ({ pData: f }));
}

function showMapSyncToast(msg, kind) {
  kind = kind || "info";
  const el = document.getElementById("mapSyncToast");
  if (!el) return;
  el.style.background = kind === "error" ? "#c62828" : (kind === "ok" ? "#2e7d32" : "#1565c0");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(window._mapSyncToastTimer);
  window._mapSyncToastTimer = setTimeout(() => {
    el.style.display = "none";
  }, kind === "error" ? 8000 : 2800);
}
window.showMapSyncToast = showMapSyncToast;

function persistManureMapCache_() {
  try {
    const list = cachedAll.length ? cachedAll : allFields;
    if (!list.length) return;
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("manureMapData cache persist failed", e);
  }
}

function rememberPendingFieldSync_(pData) {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    const entry = { id: pData.id, manureData: buildManureDataPayload(pData), updatedAt: Date.now() };
    const idx = list.findIndex((x) => String(x.id) === String(pData.id));
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-80)));
  } catch (e) {
    console.warn("rememberPendingFieldSync_ failed", e);
  }
}

function clearPendingFieldSync_(fieldId) {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    const next = list.filter((x) => String(x.id) !== String(fieldId));
    if (next.length) localStorage.setItem(PENDING_KEY, JSON.stringify(next));
    else localStorage.removeItem(PENDING_KEY);
  } catch (e) {}
}

function readPendingSyncs() {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function applyPendingToField(field, manureData) {
  if (!field || !manureData) return;
  const md = typeof manureData === "string" ? JSON.parse(manureData) : manureData;
  if (md.catStatuses) field.catStatuses = md.catStatuses;
  field.manure_status = md.manure_status || field.manure_status;
  field.manure_deadline = md.manure_deadline != null ? md.manure_deadline : field.manure_deadline;
  field.manure_scheduled_date = md.manure_scheduled_date != null ? md.manure_scheduled_date : field.manure_scheduled_date;
  field.manure_cancel_reason = md.manure_cancel_reason != null ? md.manure_cancel_reason : field.manure_cancel_reason;
  field.manure_has_pin = md.manure_has_pin != null ? !!md.manure_has_pin : field.manure_has_pin;
  field.manure_route_selected = md.manure_route_selected != null ? !!md.manure_route_selected : field.manure_route_selected;
  if (md.transplant_jun != null) field.transplant_jun = md.transplant_jun;
  migratePDataManure(field);
}

function applyPendingSyncsToFields() {
  const pending = readPendingSyncs();
  if (!pending.length) return;
  pending.forEach((item) => {
    const field = allFields.find((f) => String(f.id) === String(item.id));
    if (field) applyPendingToField(field, item.manureData);
  });
}

function enqueueFieldSync_(task) {
  return new Promise((resolve, reject) => {
    fieldSyncQueue_.push({ task: task, resolve: resolve, reject: reject });
    drainFieldSyncQueue_();
  });
}

async function drainFieldSyncQueue_() {
  if (fieldSyncRunning_) return;
  fieldSyncRunning_ = true;
  while (fieldSyncQueue_.length) {
    const item = fieldSyncQueue_.shift();
    try { item.resolve(await item.task()); }
    catch (e) { item.reject(e); }
    if (fieldSyncQueue_.length) await new Promise((r) => setTimeout(r, FIELD_SYNC_GAP_MS));
  }
  fieldSyncRunning_ = false;
}

function syncFieldToServer_(pData) {
  if (!pData || !pData.id) return Promise.resolve(false);
  rememberPendingFieldSync_(pData);
  return enqueueFieldSync_(() => callGAS("updatePolygon", {
    id: pData.id,
    userName: currentUserName || localStorage.getItem("passionMapUserName") || "",
    manureData: JSON.stringify(buildManureDataPayload(pData))
  })).then(() => {
    clearPendingFieldSync_(pData.id);
    persistManureMapCache_();
    showMapSyncToast("☁️ サーバーへ保存完了", "ok");
    return true;
  }).catch((e) => {
    console.error("syncFieldToServer_ failed", e);
    showMapSyncToast("⚠️ 保存に失敗（未同期として保持・自動再送します）: " + (e.message || e), "error");
    return false;
  });
}

async function flushPendingFieldSyncs_() {
  const list = readPendingSyncs();
  if (!list.length) return;
  showMapSyncToast("☁️ 未同期の更新を再送中…", "info");
  let ok = 0;
  for (const item of list) {
    if (!item || !item.id) continue;
    const field = findField(item.id);
    try {
      await enqueueFieldSync_(() => callGAS("updatePolygon", {
        id: item.id,
        manureData: JSON.stringify(item.manureData || {})
      }));
      clearPendingFieldSync_(item.id);
      ok++;
    } catch (e) {
      console.warn("flushPendingFieldSyncs_ item failed", item.id, e);
      if (field) rememberPendingFieldSync_(field);
    }
  }
  if (ok > 0) showMapSyncToast("☁️ 未同期 " + ok + "件をサーバーへ反映しました", "ok");
}

function schedulePendingFieldSyncFlush_() {
  setTimeout(() => { flushPendingFieldSyncs_().catch(() => {}); }, 2500);
}

window.addEventListener("online", () => { schedulePendingFieldSyncFlush_(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") schedulePendingFieldSyncFlush_();
});

function applyFieldList(list, opts) {
  const options = opts || {};
  cachedAll = Array.isArray(list) ? list : [];
  allFields = cachedAll.filter((p) => parseCoords(p.coords).length >= 3);
  allFields.forEach((f) => {
    f.coords = parseCoords(f.coords);
    migratePDataManure(f);
  });
  applyPendingSyncsToFields();
  syncPolygonsArray();
  fillLocationFilter();
  renderRequestList();
  if (map) drawFields();
  if (!options.skipPersist) persistManureMapCache_();
}

function loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || !list.length) return false;
    applyFieldList(list, { skipPersist: true });
    return true;
  } catch (e) {
    return false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const id = localStorage.getItem("passionMapUserId");
  const pw = localStorage.getItem("passionMapUserPw");
  if (document.getElementById("loginId") && id) document.getElementById("loginId").value = id;
  if (document.getElementById("loginPw") && pw) document.getElementById("loginPw").value = pw;
  if (!(id && pw)) return;

  document.getElementById("loginScreen").style.display = "none";
  currentUserName = localStorage.getItem("passionMapUserName") || "";
  const hasCache = loadFromCache();
  loginReady = true;
  if (hasCache) {
    showMapSyncToast("📦 キャッシュで起動（最新を裏で確認中…）", "info");
    schedulePendingFieldSyncFlush_();
    executeLogin(true, { fromCache: true });
  } else {
    executeLogin(true);
  }
});

async function executeLogin(isAuto, options) {
  const fromCache = !!(options && options.fromCache);
  const id = document.getElementById("loginId").value;
  const pw = document.getElementById("loginPw").value;
  const err = document.getElementById("loginError");
  const btn = document.querySelector(".login-btn");
  if (!id || !pw) {
    if (err) err.textContent = "スタッフIDとパスワードを入力してください";
    return;
  }
  if (fromCache) {
    document.getElementById("loginScreen").style.display = "none";
    loginReady = true;
    try {
      const result = await callGAS("login", { orgId: "default", userId: id, password: pw });
      if (result && result.success) {
        currentUserName = result.name || currentUserName;
        localStorage.setItem("passionMapUserName", result.name || "");
        localStorage.setItem("passionMapUserRole", result.role || "作業員");
        if (result.spreadsheetId) localStorage.setItem("spreadsheetId", result.spreadsheetId);
      } else {
        showMapSyncToast("⚠️ ログイン確認に失敗（キャッシュで続行）", "error");
      }
    } catch (e) {
      showMapSyncToast("⚠️ 通信エラー（キャッシュで続行）", "error");
    }
    await loadManureData({ background: true });
    return;
  }
  if (!isAuto && btn) { btn.textContent = "通信中..."; btn.disabled = true; }
  const needBlock = !cachedAll.length;
  const load = needBlock && window.AppLoading
    ? AppLoading.start({ label: "鶏糞散布を準備中...", detail: "ログインを確認しています", current: 0, total: 2, delay: 0 })
    : null;
  try {
    const result = await callGAS("login", { orgId: "default", userId: id, password: pw });
    if (!result || !result.success) throw new Error((result && result.message) || "ログイン失敗");
    localStorage.setItem("passionMapUserId", id);
    localStorage.setItem("passionMapUserPw", pw);
    localStorage.setItem("passionMapUserName", result.name || "");
    localStorage.setItem("passionMapUserRole", result.role || "作業員");
    localStorage.setItem("spreadsheetId", result.spreadsheetId);
    currentUserName = result.name || "";
    document.getElementById("loginScreen").style.display = "none";
    loginReady = true;
    if (load) load.update({ detail: "散布依頼の畑を読み込んでいます", current: 1, total: 2 });
    await loadManureData({ background: !needBlock, loadingHandle: load });
  } catch (e) {
    if (cachedAll.length || loadFromCache()) {
      document.getElementById("loginScreen").style.display = "none";
      loginReady = true;
      if (load) load.done();
      showMapSyncToast("⚠️ 通信エラー（キャッシュで続行）", "error");
      return;
    }
    document.getElementById("loginScreen").style.display = "flex";
    if (err) err.textContent = e.message || "ログイン失敗";
    if (btn) { btn.textContent = "ログイン"; btn.disabled = false; }
    if (load) load.fail("ログインに失敗しました");
  }
}

async function loadManureData(options) {
  const opts = options || {};
  const background = !!opts.background;
  const load = opts.loadingHandle || null;
  try {
    const data = await callGAS("getInitData");
    const polys = (data && data.polygons) || [];
    if (cachedAll.length && !polys.length) {
      if (background) showMapSyncToast("☁️ 読み込み完了しました", "ok");
      if (load) load.done();
      return;
    }
    applyFieldList(polys);
    dataLoaded = true;
    if (load) load.done();
    else if (background) showMapSyncToast("☁️ 読み込み完了しました（最新に更新）", "ok");
    schedulePendingFieldSyncFlush_();
  } catch (e) {
    if (cachedAll.length) {
      if (load) load.done();
      showMapSyncToast("⚠️ 最新の取得に失敗（キャッシュで続行）", "error");
      return;
    }
    if (load) load.fail("読み込みに失敗しました");
    else alert("データの読み込みに失敗しました: " + (e.message || e));
  }
}

async function reloadManureData() {
  showMapSyncToast("🔄 最新データを確認中…", "info");
  await loadManureData({ background: true });
}

window.initMap = function initMap() {
  mapsApiReady = true;
  const overlay = document.getElementById("mapOverlay");
  if (overlay && overlay.classList.contains("open")) {
    createMap();
    if (pendingPanId) {
      setTimeout(() => {
        if (map) google.maps.event.trigger(map, "resize");
        panMapToField(pendingPanId);
      }, 80);
    }
  }
};
if (window._manureNeedInit && typeof google !== "undefined" && google.maps) {
  window.initMap();
}

function createMap() {
  if (map || typeof google === "undefined" || !google.maps) return;
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 35.6895, lng: 139.6917 },
    zoom: 15,
    mapTypeId: "hybrid",
    tilt: 0,
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: "greedy"
  });
  const gps = document.getElementById("btnCurrentLocation");
  if (gps) {
    gps.onclick = () => {
      if (latestUserPos) { map.setCenter(latestUserPos); map.setZoom(18); return; }
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((p) => {
        latestUserPos = { lat: p.coords.latitude, lng: p.coords.longitude };
        map.setCenter(latestUserPos);
        map.setZoom(18);
        showUserMarker(latestUserPos);
      }, () => alert("現在地を取得できませんでした。"), { enableHighAccuracy: true });
    };
  }
  drawFields();
}

function showUserMarker(pos) {
  if (!userLocationMarker) {
    userLocationMarker = new google.maps.Marker({
      position: pos,
      map: map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#4285F4",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2
      },
      zIndex: 999
    });
  } else {
    userLocationMarker.setPosition(pos);
    userLocationMarker.setMap(map);
  }
}

function fillLocationFilter() {
  const sel = document.getElementById("manureLocation");
  if (!sel) return;
  const locs = [];
  allFields.forEach((f) => {
    const loc = String(f.location || "").trim();
    if (loc && locs.indexOf(loc) < 0) locs.push(loc);
  });
  locs.sort((a, b) => a.localeCompare(b, "ja"));
  const prev = sel.value;
  sel.innerHTML = '<option value="">すべての拠点</option>' + locs.map((l) => {
    return '<option value="' + escapeHtml(l) + '">' + escapeHtml(l) + "</option>";
  }).join("");
  if (prev) sel.value = prev;
}

function requestFields() {
  const loc = document.getElementById("manureLocation")?.value || "";
  const q = String(document.getElementById("fieldSearch")?.value || "").trim().toLowerCase();
  return allFields.filter((f) => {
    const st = getCompostStatus(f);
    if (LIST_STATUSES.indexOf(st) < 0) return false;
    if (loc && String(f.location || "") !== loc) return false;
    if (q && String(f.name || "").toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}

function sortRequestFields(list) {
  const rank = { inprogress: 0, request: 1, accepted: 2 };
  return list.slice().sort((a, b) => {
    const sa = getCompostStatus(a);
    const sb = getCompostStatus(b);
    const pa = pinOrder.indexOf(String(a.id));
    const pb = pinOrder.indexOf(String(b.id));
    const pinA = pa >= 0 ? pa : 9999;
    const pinB = pb >= 0 ? pb : 9999;
    if (pinA !== pinB) return pinA - pinB;
    const ra = rank[sa] != null ? rank[sa] : 9;
    const rb = rank[sb] != null ? rank[sb] : 9;
    if (ra !== rb) return ra - rb;
    const da = String((a.manure_deadline || a.catStatuses?.compost?.deadline) || "");
    const db = String((b.manure_deadline || b.catStatuses?.compost?.deadline) || "");
    if (da !== db) return da.localeCompare(db);
    return String(a.name || "").localeCompare(String(b.name || ""), "ja");
  });
}

function drawFields() {
  if (!map) return;
  Object.keys(fieldPolys).forEach((id) => {
    if (fieldPolys[id]) fieldPolys[id].setMap(null);
  });
  Object.keys(fieldLabels).forEach((id) => {
    if (fieldLabels[id]) fieldLabels[id].setMap(null);
  });
  fieldPolys = {};
  fieldLabels = {};
  allFields.forEach((f) => {
    const coords = parseCoords(f.coords);
    if (coords.length < 3) return;
    f.coords = coords;
    const st = getCompostStatus(f);
    const active = LIST_STATUSES.indexOf(st) >= 0;
    const color = STATUS_COLORS[st] || STATUS_COLORS.none;
    const poly = new google.maps.Polygon({
      paths: coords,
      map: map,
      fillColor: color,
      fillOpacity: active ? 0.38 : 0.08,
      strokeColor: color,
      strokeOpacity: active ? 0.95 : 0.35,
      strokeWeight: active ? 2 : 1,
      clickable: true,
      zIndex: active ? 3 : 1
    });
    poly.pData = f;
    poly.addListener("click", () => panMapToField(f.id));
    fieldPolys[f.id] = poly;
    const center = fieldCenter(f);
    if (center && active) {
      fieldLabels[f.id] = new google.maps.Marker({
        position: center,
        map: map,
        clickable: false,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
        label: { text: f.name || "", color: "#fff", fontSize: "11px", fontWeight: "bold" }
      });
    }
  });
  refreshFieldStyles();
}

function refreshFieldStyles() {
  if (!map) return;
  allFields.forEach((f) => {
    const poly = fieldPolys[f.id];
    if (!poly) return;
    const st = getCompostStatus(f);
    const active = LIST_STATUSES.indexOf(st) >= 0;
    const selected = String(f.id) === String(selectedId);
    const color = selected ? "#BF360C" : (STATUS_COLORS[st] || STATUS_COLORS.none);
    poly.setOptions({
      fillColor: color,
      fillOpacity: selected ? 0.55 : (active ? 0.38 : 0.08),
      strokeColor: color,
      strokeOpacity: selected ? 1 : (active ? 0.95 : 0.35),
      strokeWeight: selected ? 4 : (active ? 2 : 1),
      zIndex: selected ? 8 : (active ? 3 : 1)
    });
  });
}

function panMapToField(id) {
  selectedId = String(id);
  const field = findField(id);
  const nameEl = document.getElementById("mapTargetName");
  if (nameEl) nameEl.textContent = (field && field.name) || "";
  const poly = fieldPolys[id];
  if (poly && map) {
    const bounds = new google.maps.LatLngBounds();
    poly.getPath().forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 72, right: 24, bottom: 24, left: 24 });
    google.maps.event.addListenerOnce(map, "idle", () => {
      if (map.getZoom() > 19) map.setZoom(19);
    });
  } else if (field) {
    const center = fieldCenter(field);
    if (center && map) {
      map.setCenter(center);
      map.setZoom(18);
    }
  }
  refreshFieldStyles();
  renderRequestList();
  return field;
}

function openMapOverlay(id) {
  pendingPanId = String(id);
  selectedId = String(id);
  const field = findField(id);
  const overlay = document.getElementById("mapOverlay");
  if (overlay) overlay.classList.add("open");
  const nameEl = document.getElementById("mapTargetName");
  if (nameEl) nameEl.textContent = (field && field.name) || "";
  if (!mapsApiReady) {
    showMapSyncToast("🗺 地図を準備中…", "info");
    return;
  }
  createMap();
  setTimeout(() => {
    if (map) google.maps.event.trigger(map, "resize");
    panMapToField(id);
  }, 80);
}

function closeMapOverlay() {
  const overlay = document.getElementById("mapOverlay");
  if (overlay) overlay.classList.remove("open");
}

function renderRequestList() {
  const box = document.getElementById("requestList");
  const countEl = document.getElementById("requestCount");
  if (!box) return;
  const list = sortRequestFields(requestFields());
  if (countEl) countEl.textContent = String(list.length);
  if (!list.length) {
    box.innerHTML = '<div class="hint">散布依頼中の畑はありません</div>';
    return;
  }
  box.innerHTML = '<table class="manure-table"><thead><tr>' +
    "<th>畑名</th><th>拠点</th><th>状態</th><th>面積</th><th>袋</th><th>車</th><th>期限 / 予定</th><th>操作</th>" +
    "</tr></thead><tbody>" + list.map((f) => {
      const st = getCompostStatus(f);
      const amt = formatAmount(fieldAreaA(f));
      const on = String(f.id) === String(selectedId);
      const deadline = f.manure_deadline || (f.catStatuses && f.catStatuses.compost && f.catStatuses.compost.deadline) || "";
      const scheduled = f.manure_scheduled_date || (f.catStatuses && f.catStatuses.compost && f.catStatuses.compost.scheduled_date) || "";
      const extra = st === "accepted" && scheduled ? scheduled : (deadline || "—");
      return '<tr class="' + (on ? "on " : "") + (st === "inprogress" ? "inprogress" : "") + '" data-id="' + escapeHtml(f.id) + '">' +
        '<td><button type="button" class="name-link" data-focus="' + escapeHtml(f.id) + '">' + escapeHtml(f.name || "無名") + "</button></td>" +
        "<td>" + escapeHtml(f.location || "—") + "</td>" +
        '<td><span class="status-pill st-' + st + '">' + escapeHtml(STATUS_LABELS[st] || st) + "</span></td>" +
        "<td>" + escapeHtml(amt.area) + "</td>" +
        "<td>" + escapeHtml(amt.bags) + "</td>" +
        "<td>" + escapeHtml(amt.trucks) + "</td>" +
        "<td>" + escapeHtml(extra) + "</td>" +
        '<td><div class="act-row">' +
          '<button type="button" class="act act-mid" data-mid="' + escapeHtml(f.id) + '">途中</button>' +
          '<button type="button" class="act act-part" data-part="' + escapeHtml(f.id) + '">一部</button>' +
          '<button type="button" class="act act-done" data-done="' + escapeHtml(f.id) + '">完全</button>' +
        "</div></td></tr>";
    }).join("") + "</tbody></table>";

  box.querySelectorAll("[data-focus]").forEach((el) => {
    el.addEventListener("click", () => openMapOverlay(el.getAttribute("data-focus")));
  });
  box.querySelectorAll("[data-mid]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); markInProgress(el.getAttribute("data-mid")); });
  });
  box.querySelectorAll("[data-part]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); markPartial(el.getAttribute("data-part")); });
  });
  box.querySelectorAll("[data-done]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); markComplete(el.getAttribute("data-done")); });
  });
}

function findField(id) {
  return allFields.find((f) => String(f.id) === String(id));
}

function markInProgress(id) {
  const field = findField(id);
  if (!field) return;
  pinOrder = [String(id)].concat(pinOrder.filter((x) => x !== String(id)));
  savePinOrder();
  applyCompostStatusUpdate(field, { status: "inprogress", has_pin: true });
  selectedId = String(id);
  persistManureMapCache_();
  renderRequestList();
  refreshFieldStyles();
  showMapSyncToast("✅ 途中にしました（同期中…）", "ok");
  syncFieldToServer_(field);
}

function markPartial(id) {
  const field = findField(id);
  if (!field) return;
  selectedId = String(id);
  renderRequestList();
  if (typeof openFieldMemo !== "function") {
    alert("メモ機能を読み込めませんでした");
    return;
  }
  openFieldMemo(field);
}

function markComplete(id) {
  const field = findField(id);
  if (!field) return;
  if (!confirm((field.name || "この畑") + " を散布完了（完全）にしますか？\nリストから消えます。")) return;
  applyCompostStatusUpdate(field, { status: "completed", has_pin: true, deadline: "", scheduled_date: "" });
  pinOrder = pinOrder.filter((x) => x !== String(id));
  savePinOrder();
  if (String(selectedId) === String(id)) selectedId = "";
  persistManureMapCache_();
  renderRequestList();
  refreshFieldStyles();
  showMapSyncToast("✅ 完了にしました（同期中…）", "ok");
  syncFieldToServer_(field);
}

function closeModal() {}

window.executeLogin = executeLogin;
window.renderRequestList = renderRequestList;
window.reloadManureData = reloadManureData;
window.openMapOverlay = openMapOverlay;
window.closeMapOverlay = closeMapOverlay;
window.markInProgress = markInProgress;
window.markPartial = markPartial;
window.markComplete = markComplete;
window.closeModal = closeModal;
window.callGAS = callGAS;
