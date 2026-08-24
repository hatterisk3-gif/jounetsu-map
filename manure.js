const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";
const PIN_ORDER_KEY = "passionMapManurePinOrder";
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
let latestUserPos = null;
let userLocationMarker = null;
let allFields = [];
let polygons = [];
let fieldPolys = {};
let fieldLabels = {};
let selectedId = "";
let sheetCollapsed = false;
let loginReady = false;
let dataLoaded = false;
let currentUserName = localStorage.getItem("passionMapUserName") || "";
let pinOrder = loadPinOrder();
let savingIds = {};

async function callGAS(action, payload = {}) {
  const spreadsheetId = localStorage.getItem("spreadsheetId");
  const body = Object.assign({ action: action, spreadsheetId: spreadsheetId }, payload);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify(body), signal: controller.signal });
    clearTimeout(timeoutId);
    const json = await res.json();
    if (json.status !== "success") throw new Error(json.message || "APIエラー");
    return json.data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("通信がタイムアウトしました。");
    throw err;
  }
}

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
  const poly = fieldPolys[field && field.id];
  if (poly && google.maps.geometry && google.maps.geometry.spherical) {
    const sqm = google.maps.geometry.spherical.computeArea(poly.getPath());
    if (sqm > 0) return Math.round((sqm / 100) * 10) / 10;
  }
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

document.addEventListener("DOMContentLoaded", () => {
  const id = localStorage.getItem("passionMapUserId");
  const pw = localStorage.getItem("passionMapUserPw");
  if (document.getElementById("loginId") && id) document.getElementById("loginId").value = id;
  if (document.getElementById("loginPw") && pw) document.getElementById("loginPw").value = pw;
  document.body.classList.add("sheet-open");
  if (id && pw) {
    document.getElementById("loginScreen").style.display = "none";
    executeLogin(true);
  }
});

async function executeLogin(isAuto) {
  const id = document.getElementById("loginId").value;
  const pw = document.getElementById("loginPw").value;
  const err = document.getElementById("loginError");
  const btn = document.querySelector(".login-btn");
  if (!id || !pw) {
    if (err) err.textContent = "スタッフIDとパスワードを入力してください";
    return;
  }
  if (!isAuto && btn) { btn.textContent = "通信中..."; btn.disabled = true; }
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
    maybeLoadData();
  } catch (e) {
    document.getElementById("loginScreen").style.display = "flex";
    if (err) err.textContent = e.message || "ログイン失敗";
    if (btn) { btn.textContent = "ログイン"; btn.disabled = false; }
  }
}

function maybeLoadData() {
  if (!loginReady || !map || dataLoaded) return;
  dataLoaded = true;
  loadManureData();
}

window.initMap = function initMap() {
  if (map) {
    maybeLoadData();
    return;
  }
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
  maybeLoadData();
};
if (window._manureNeedInit && typeof google !== "undefined" && google.maps) {
  window.initMap();
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

async function loadManureData() {
  const load = window.AppLoading
    ? AppLoading.start({ label: "鶏糞散布を準備中...", detail: "散布依頼の畑を読み込んでいます", current: 0, total: 2, delay: 0 })
    : null;
  try {
    const data = await callGAS("getInitData");
    const polys = (data && data.polygons) || [];
    allFields = polys.filter((p) => parseCoords(p.coords).length >= 3);
    allFields.forEach(migratePDataManure);
    syncPolygonsArray();
    if (load) load.update({ detail: "地図に畑を描画しています", current: 1, total: 2 });
    drawFields();
    fillLocationFilter();
    renderRequestList();
    if (load) load.done();
  } catch (e) {
    if (load) load.fail("読み込みに失敗しました");
    alert("データの読み込みに失敗しました: " + (e.message || e));
  }
}

async function reloadManureData() {
  dataLoaded = false;
  if (loginReady && map) {
    dataLoaded = true;
    await loadManureData();
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
  Object.keys(fieldPolys).forEach((id) => {
    if (fieldPolys[id]) fieldPolys[id].setMap(null);
  });
  Object.keys(fieldLabels).forEach((id) => {
    if (fieldLabels[id]) fieldLabels[id].setMap(null);
  });
  fieldPolys = {};
  fieldLabels = {};
  const bounds = new google.maps.LatLngBounds();
  let has = false;
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
    poly.addListener("click", () => focusField(f.id, true));
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
    coords.forEach((c) => { bounds.extend(c); has = true; });
  });
  if (has && map) map.fitBounds(bounds);
  refreshFieldStyles();
}

function refreshFieldStyles() {
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

function toggleSheet() {
  const card = document.getElementById("listSheet");
  const btn = document.getElementById("btnToggleSheet");
  if (!card) return;
  sheetCollapsed = !sheetCollapsed;
  card.classList.toggle("collapsed", sheetCollapsed);
  document.body.classList.toggle("sheet-open", !sheetCollapsed);
  if (btn) btn.textContent = sheetCollapsed ? "開く" : "縮小";
}

function expandSheet() {
  if (!sheetCollapsed) return;
  sheetCollapsed = false;
  const card = document.getElementById("listSheet");
  const btn = document.getElementById("btnToggleSheet");
  if (card) card.classList.remove("collapsed");
  document.body.classList.add("sheet-open");
  if (btn) btn.textContent = "縮小";
}

function focusField(id, fromMap) {
  selectedId = String(id);
  const field = allFields.find((f) => String(f.id) === selectedId);
  const poly = fieldPolys[id];
  if (poly && map) {
    const bounds = new google.maps.LatLngBounds();
    poly.getPath().forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 72, right: 24, bottom: sheetCollapsed ? 90 : 320, left: 24 });
    google.maps.event.addListenerOnce(map, "idle", () => {
      if (map.getZoom() > 19) map.setZoom(19);
    });
  }
  refreshFieldStyles();
  renderRequestList();
  if (fromMap) expandSheet();
  const card = Array.from(document.querySelectorAll(".field-card")).find((el) => el.getAttribute("data-id") === String(id));
  if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return field;
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
  box.innerHTML = list.map((f) => {
    const st = getCompostStatus(f);
    const amt = formatAmount(fieldAreaA(f));
    const on = String(f.id) === String(selectedId);
    const deadline = f.manure_deadline || (f.catStatuses && f.catStatuses.compost && f.catStatuses.compost.deadline) || "";
    const scheduled = f.manure_scheduled_date || (f.catStatuses && f.catStatuses.compost && f.catStatuses.compost.scheduled_date) || "";
    const extra = st === "accepted" && scheduled ? "予定 " + scheduled : (deadline ? "期限 " + deadline : "");
    const busy = !!savingIds[f.id];
    return '<div class="field-card' + (on ? " on" : "") + (st === "inprogress" ? " inprogress" : "") + '" data-id="' + escapeHtml(f.id) + '">' +
      '<div class="field-top" data-focus="' + escapeHtml(f.id) + '">' +
        '<div class="field-name">' + escapeHtml(f.name || "無名") +
          '<div class="field-meta">' + escapeHtml(amt.area) +
            (f.location ? " ／ " + escapeHtml(f.location) : "") +
            (extra ? " ／ " + escapeHtml(extra) : "") +
          "</div></div>" +
        '<span class="status-pill st-' + st + '">' + escapeHtml(STATUS_LABELS[st] || st) + "</span>" +
      "</div>" +
      '<div class="field-amt"><span>目安 <b>' + escapeHtml(amt.bags) + "</b></span><span>" + escapeHtml(amt.trucks) + "</span></div>" +
      '<div class="act-row">' +
        '<button type="button" class="act act-mid" data-mid="' + escapeHtml(f.id) + '"' + (busy ? " disabled" : "") + ">途中</button>" +
        '<button type="button" class="act act-part" data-part="' + escapeHtml(f.id) + '"' + (busy ? " disabled" : "") + ">一部</button>" +
        '<button type="button" class="act act-done" data-done="' + escapeHtml(f.id) + '"' + (busy ? " disabled" : "") + ">完全</button>" +
      "</div></div>";
  }).join("");

  box.querySelectorAll("[data-focus]").forEach((el) => {
    el.addEventListener("click", () => focusField(el.getAttribute("data-focus")));
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

async function saveFieldStatus(field) {
  await callGAS("updatePolygon", {
    id: field.id,
    userName: currentUserName || localStorage.getItem("passionMapUserName") || "",
    manureData: JSON.stringify(buildManureDataPayload(field))
  });
}

async function markInProgress(id) {
  const field = findField(id);
  if (!field) return;
  pinOrder = [String(id)].concat(pinOrder.filter((x) => x !== String(id)));
  savePinOrder();
  applyCompostStatusUpdate(field, { status: "inprogress", has_pin: true });
  selectedId = String(id);
  renderRequestList();
  refreshFieldStyles();
  savingIds[id] = true;
  renderRequestList();
  try {
    await saveFieldStatus(field);
  } catch (e) {
    alert("途中への更新に失敗しました: " + (e.message || e));
  } finally {
    delete savingIds[id];
    renderRequestList();
  }
}

function markPartial(id) {
  const field = focusField(id);
  if (!field) return;
  if (!sheetCollapsed) toggleSheet();
  if (typeof openFieldMemo !== "function") {
    alert("メモ機能を読み込めませんでした");
    return;
  }
  openFieldMemo(field);
}

async function markComplete(id) {
  const field = findField(id);
  if (!field) return;
  if (!confirm((field.name || "この畑") + " を散布完了（完全）にしますか？\nリストから消えます。")) return;
  const prev = {
    status: getCompostStatus(field),
    deadline: field.manure_deadline || "",
    scheduled_date: field.manure_scheduled_date || "",
    has_pin: !!field.manure_has_pin
  };
  applyCompostStatusUpdate(field, { status: "completed", has_pin: true, deadline: "", scheduled_date: "" });
  pinOrder = pinOrder.filter((x) => x !== String(id));
  savePinOrder();
  if (String(selectedId) === String(id)) selectedId = "";
  renderRequestList();
  refreshFieldStyles();
  savingIds[id] = true;
  try {
    await saveFieldStatus(field);
  } catch (e) {
    applyCompostStatusUpdate(field, prev);
    alert("完了の保存に失敗しました。リストに戻します。\n" + (e.message || e));
    renderRequestList();
    refreshFieldStyles();
  } finally {
    delete savingIds[id];
    renderRequestList();
    refreshFieldStyles();
  }
}

function closeModal() {}

window.executeLogin = executeLogin;
window.toggleSheet = toggleSheet;
window.renderRequestList = renderRequestList;
window.reloadManureData = reloadManureData;
window.focusField = focusField;
window.markInProgress = markInProgress;
window.markPartial = markPartial;
window.markComplete = markComplete;
window.closeModal = closeModal;
window.callGAS = callGAS;
