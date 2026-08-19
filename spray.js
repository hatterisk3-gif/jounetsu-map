const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";
const SPRAY_SETTINGS_KEY = "passionMapSpraySettings";
const SPRAY_SESSION_KEY = "passionMapSpraySession";

let map;
let latestUserPos = null;
let userLocationMarker = null;
let allFields = [];
let pesticides = [];
let fieldPolys = {};
let selectedIds = [];
let chemicals = [];
let runIndex = 0;
let runDoneIds = [];
let sheetCollapsed = false;

async function callGAS(action, payload = {}) {
  const spreadsheetId = localStorage.getItem("spreadsheetId");
  const body = Object.assign({ action: action, spreadsheetId: spreadsheetId }, payload);
  const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify(body) });
  const json = await res.json();
  if (json.status !== "success") throw new Error(json.message || "APIエラー");
  return json.data;
}

let loginReady = false;
let dataLoaded = false;

document.addEventListener("DOMContentLoaded", () => {
  const id = localStorage.getItem("passionMapUserId");
  const pw = localStorage.getItem("passionMapUserPw");
  if (document.getElementById("loginId") && id) document.getElementById("loginId").value = id;
  if (document.getElementById("loginPw") && pw) document.getElementById("loginPw").value = pw;
  restoreSettings();
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
    document.getElementById("loginScreen").style.display = "none";
    loginReady = true;
    maybeLoadSprayData();
  } catch (e) {
    document.getElementById("loginScreen").style.display = "flex";
    if (err) err.textContent = e.message || "ログイン失敗";
    if (btn) { btn.textContent = "ログイン"; btn.disabled = false; }
  }
}

function maybeLoadSprayData() {
  if (!loginReady || !map || dataLoaded) return;
  dataLoaded = true;
  loadSprayData();
}

window.initMap = function initMap() {
  if (map) {
    maybeLoadSprayData();
    return;
  }
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 35.6895, lng: 139.6917 },
    zoom: 15,
    mapTypeId: "hybrid",
    tilt: 0,
    disableDefaultUI: true,
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
        if (!userLocationMarker) {
          userLocationMarker = new google.maps.Marker({
            position: latestUserPos, map: map,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 }
          });
        } else userLocationMarker.setPosition(latestUserPos);
      }, () => alert("現在地を取得できませんでした。"), { enableHighAccuracy: true });
    };
  }
  maybeLoadSprayData();
};
if (window._sprayNeedInit && typeof google !== "undefined" && google.maps) {
  window.initMap();
}

function parseCoords(raw) {
  let coords = raw;
  if (typeof coords === "string") {
    try { coords = JSON.parse(coords); } catch (e) { return []; }
  }
  return Array.isArray(coords) ? coords : [];
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
  const coords = parseCoords(field.coords);
  if (!coords.length) return null;
  let lat = 0, lng = 0, n = 0;
  coords.forEach((c) => {
    const la = Number(c.lat != null ? c.lat : c[0]);
    const ln = Number(c.lng != null ? c.lng : c[1]);
    if (!isNaN(la) && !isNaN(ln)) { lat += la; lng += ln; n++; }
  });
  return n ? { lat: lat / n, lng: lng / n } : null;
}

async function loadSprayData() {
  const load = window.AppLoading
    ? AppLoading.start({ label: "防除アプリを準備中...", detail: "圃場と農薬マスタを読み込んでいます", current: 0, total: 2, delay: 0 })
    : null;
  try {
    const data = await callGAS("getInitData");
    const polys = (data && data.polygons) || [];
    pesticides = (data && data.pdl && data.pdl.pesticides) || [];
    allFields = polys.filter((p) => {
      const coords = parseCoords(p.coords);
      return coords.length >= 3;
    });
    if (load) load.update({ detail: "地図に圃場を描画しています", current: 1, total: 2 });
    drawFields();
    fillLocationFilter();
    renderFieldPicker();
    renderChemList();
    updateSetupPreview();
    restoreSession();
    if (load) load.done();
  } catch (e) {
    if (load) load.fail("読み込みに失敗しました");
    alert("データの読み込みに失敗しました: " + (e.message || e));
  }
}

function fillLocationFilter() {
  const sel = document.getElementById("sprayLocation");
  if (!sel) return;
  const locs = [];
  allFields.forEach((f) => {
    const loc = String(f.location || "").trim();
    if (loc && locs.indexOf(loc) < 0) locs.push(loc);
  });
  locs.sort((a, b) => a.localeCompare(b, "ja"));
  const prev = sel.value;
  sel.innerHTML = '<option value="">すべての拠点</option>' + locs.map((l) => {
    const esc = escapeHtml(l);
    return '<option value="' + esc + '">' + esc + "</option>";
  }).join("");
  if (prev) sel.value = prev;
}

function visibleFields() {
  const loc = document.getElementById("sprayLocation")?.value || "";
  const q = String(document.getElementById("fieldSearch")?.value || "").trim().toLowerCase();
  return allFields.filter((f) => {
    if (loc && String(f.location || "") !== loc) return false;
    if (q && String(f.name || "").toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}

function drawFields() {
  Object.keys(fieldPolys).forEach((id) => {
    if (fieldPolys[id]) fieldPolys[id].setMap(null);
  });
  fieldPolys = {};
  const bounds = new google.maps.LatLngBounds();
  let has = false;
  allFields.forEach((f) => {
    const coords = parseCoords(f.coords);
    if (coords.length < 3) return;
    const poly = new google.maps.Polygon({
      paths: coords,
      map: map,
      fillColor: "#66BB6A",
      fillOpacity: 0.18,
      strokeColor: "#2E7D32",
      strokeWeight: 2,
      clickable: true
    });
    poly.addListener("click", () => toggleField(f.id));
    fieldPolys[f.id] = poly;
    coords.forEach((c) => {
      bounds.extend(c);
      has = true;
    });
  });
  if (has && map) map.fitBounds(bounds);
  refreshFieldStyles();
}

function refreshFieldStyles() {
  const currentId = isRunMode() ? selectedIds[runIndex] : "";
  allFields.forEach((f) => {
    const poly = fieldPolys[f.id];
    if (!poly) return;
    const selected = selectedIds.indexOf(f.id) >= 0;
    const done = runDoneIds.indexOf(f.id) >= 0;
    const current = currentId && String(f.id) === String(currentId);
    poly.setOptions({
      fillColor: current ? "#E65100" : (done ? "#90A4AE" : (selected ? "#FF9800" : "#66BB6A")),
      fillOpacity: current ? 0.45 : (selected ? 0.32 : 0.16),
      strokeColor: current ? "#BF360C" : (selected ? "#E65100" : "#2E7D32"),
      strokeWeight: current ? 4 : (selected ? 3 : 2),
      zIndex: current ? 5 : (selected ? 3 : 1)
    });
  });
}

function toggleField(id) {
  if (isRunMode()) return;
  const idx = selectedIds.indexOf(id);
  if (idx >= 0) selectedIds.splice(idx, 1);
  else selectedIds.push(id);
  renderFieldPicker();
  renderOrderList();
  refreshFieldStyles();
  updateSetupPreview();
}

function onSprayLocationChange() {
  renderFieldPicker();
}

function renderFieldPicker() {
  const box = document.getElementById("fieldPicker");
  if (!box) return;
  const list = visibleFields().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"));
  if (!list.length) {
    box.innerHTML = '<div class="hint">該当する圃場がありません</div>';
    return;
  }
  box.innerHTML = list.map((f) => {
    const on = selectedIds.indexOf(f.id) >= 0;
    const area = fieldAreaA(f);
    return '<button type="button" class="chip' + (on ? " on" : "") + '" onclick="toggleField(\'' + String(f.id).replace(/'/g, "\\'") + "')\">" +
      (on ? "✓ " : "") + escapeHtml(f.name || "無名") +
      (area ? '<span style="font-weight:normal; opacity:.85;"> ' + area + "a</span>" : "") +
      "</button>";
  }).join("");
}

function renderOrderList() {
  const box = document.getElementById("orderList");
  if (!box) return;
  if (!selectedIds.length) {
    box.innerHTML = '<div class="hint">地図または上のチップで圃場を選ぶと、回る順番が出ます</div>';
    return;
  }
  box.innerHTML = selectedIds.map((id, i) => {
    const f = allFields.find((x) => String(x.id) === String(id));
    const area = f ? fieldAreaA(f) : 0;
    return '<div class="field-item">' +
      '<div class="ord">' + (i + 1) + "</div>" +
      '<div class="name">' + escapeHtml((f && f.name) || id) +
      '<div class="meta">' + (area ? area + "a" : "面積未設定") + (f && f.location ? " ／ " + escapeHtml(f.location) : "") + "</div></div>" +
      '<button type="button" class="ord-btn" onclick="moveFieldOrder(' + i + ',-1)">↑</button>' +
      '<button type="button" class="ord-btn" onclick="moveFieldOrder(' + i + ',1)">↓</button>' +
      '<button type="button" class="ord-btn" onclick="toggleField(\'' + String(id).replace(/'/g, "\\'") + "')\">×</button>" +
      "</div>";
  }).join("");
}

function moveFieldOrder(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= selectedIds.length) return;
  const tmp = selectedIds[index];
  selectedIds[index] = selectedIds[next];
  selectedIds[next] = tmp;
  renderOrderList();
  refreshFieldStyles();
}

function sortFieldsNorthToSouth() {
  selectedIds.sort((a, b) => {
    const fa = allFields.find((x) => String(x.id) === String(a));
    const fb = allFields.find((x) => String(x.id) === String(b));
    const ca = fa ? fieldCenter(fa) : null;
    const cb = fb ? fieldCenter(fb) : null;
    return ((cb && cb.lat) || 0) - ((ca && ca.lat) || 0);
  });
  renderOrderList();
  refreshFieldStyles();
}

function clearSelectedFields() {
  selectedIds = [];
  renderFieldPicker();
  renderOrderList();
  refreshFieldStyles();
  updateSetupPreview();
}

function parseDilution(raw) {
  const m = String(raw || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : 0;
}

function onChemSearchInput() {
  const q = String(document.getElementById("chemSearch")?.value || "").trim().toLowerCase();
  const box = document.getElementById("chemHits");
  if (!box) return;
  if (!q) { box.innerHTML = ""; return; }
  const hits = pesticides.filter((p) => {
    const hay = [p.name, p.activeIngredient, p.manufacturer, p.cropName].map((x) => String(x || "").toLowerCase()).join(" ");
    return hay.indexOf(q) >= 0;
  }).slice(0, 8);
  box.innerHTML = hits.length
    ? hits.map((p, i) => {
      const sub = [p.activeIngredient, p.dilution ? p.dilution + "倍" : "", p.cropName].filter(Boolean).join(" ／ ");
      return '<button type="button" class="search-hit" onclick="addChemicalFromMaster(' + i + ')">' +
        "<b>" + escapeHtml(p.name) + "</b>" + (sub ? '<div class="hint">' + escapeHtml(sub) + "</div>" : "") +
        "</button>";
    }).join("")
    : '<div class="hint">マスタにありません。下に名前と倍率を入れて追加できます。</div>';
  box._hits = hits;
}

function addChemicalFromMaster(idx) {
  const hits = document.getElementById("chemHits")?._hits || [];
  const p = hits[idx];
  if (!p) return;
  addChemical(p.name, parseDilution(p.dilution) || 1000, p.id);
  const search = document.getElementById("chemSearch");
  if (search) search.value = "";
  const box = document.getElementById("chemHits");
  if (box) box.innerHTML = "";
}

function addCustomChemical() {
  const name = String(document.getElementById("chemCustomName")?.value || "").trim();
  const dil = parseDilution(document.getElementById("chemCustomDilution")?.value);
  if (!name) { alert("薬剤名を入力してください"); return; }
  if (!dil) { alert("倍率を入力してください（例: 1000）"); return; }
  addChemical(name, dil, "");
  document.getElementById("chemCustomName").value = "";
  document.getElementById("chemCustomDilution").value = "";
}

function addChemical(name, dilution, masterId) {
  if (chemicals.some((c) => c.name === name && Number(c.dilution) === Number(dilution))) {
    alert("同じ薬剤・倍率はすでに入っています");
    return;
  }
  chemicals.push({ id: masterId || ("c-" + Date.now()), name: name, dilution: Number(dilution) });
  renderChemList();
  updateSetupPreview();
  saveSettings();
}

function removeChemical(idx) {
  chemicals.splice(idx, 1);
  renderChemList();
  updateSetupPreview();
  saveSettings();
}

function updateChemicalDilution(idx, value) {
  if (!chemicals[idx]) return;
  const n = parseDilution(value);
  if (n) chemicals[idx].dilution = n;
  updateSetupPreview();
  saveSettings();
}

function renderChemList() {
  const box = document.getElementById("chemList");
  if (!box) return;
  if (!chemicals.length) {
    box.innerHTML = '<div class="hint">薬剤が未設定です。検索して追加してください。</div>';
    return;
  }
  box.innerHTML = chemicals.map((c, i) => {
    return '<div class="chem-card">' +
      '<div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">' +
      "<b>" + escapeHtml(c.name) + "</b>" +
      '<button type="button" class="ghost" onclick="removeChemical(' + i + ')">削除</button></div>' +
      '<div style="display:flex; align-items:center; gap:6px; margin-top:6px;">' +
      '<span class="hint">倍率</span>' +
      '<input type="number" class="inp" min="1" value="' + escapeHtml(c.dilution) + '" onchange="updateChemicalDilution(' + i + ', this.value)" style="width:110px; padding:6px;">' +
      "<span class=\"hint\">倍</span></div></div>";
  }).join("");
}

function spraySettings() {
  const vol = Number(document.getElementById("sprayVolumePer10a")?.value || 100) || 100;
  const loss = Math.max(0, Number(document.getElementById("sprayLossPct")?.value || 0) || 0);
  return { volumePer10a: vol, lossPct: loss };
}

function calcFieldSpray(field) {
  const st = spraySettings();
  const areaA = fieldAreaA(field);
  const baseL = (areaA / 10) * st.volumePer10a;
  const solutionL = baseL * (1 + st.lossPct / 100);
  const chems = chemicals.map((c) => {
    const dil = Number(c.dilution) || 0;
    const amountL = dil > 0 ? (solutionL / dil) : 0;
    return { name: c.name, dilution: dil, amountL: amountL };
  });
  return { areaA: areaA, baseL: baseL, solutionL: solutionL, chems: chems, lossPct: st.lossPct, volumePer10a: st.volumePer10a };
}

function formatLiters(l) {
  const n = Number(l) || 0;
  if (n >= 1) return (Math.round(n * 100) / 100).toLocaleString("ja-JP") + " L";
  return Math.round(n * 1000).toLocaleString("ja-JP") + " ml";
}

function updateSetupPreview() {
  const box = document.getElementById("setupPreview");
  if (!box) return;
  if (!selectedIds.length) { box.style.display = "none"; return; }
  let area = 0, sol = 0;
  const chemTot = {};
  selectedIds.forEach((id) => {
    const f = allFields.find((x) => String(x.id) === String(id));
    if (!f) return;
    const calc = calcFieldSpray(f);
    area += calc.areaA;
    sol += calc.solutionL;
    calc.chems.forEach((c) => { chemTot[c.name] = (chemTot[c.name] || 0) + c.amountL; });
  });
  const chemHtml = Object.keys(chemTot).map((n) => escapeHtml(n) + " " + formatLiters(chemTot[n])).join(" ／ ");
  box.style.display = "block";
  box.innerHTML = "<b>全体見積</b>　圃場 " + selectedIds.length + " ／ 面積 " + (Math.round(area * 10) / 10) + "a" +
    '<div class="qty-big" style="font-size:22px; margin-top:4px;">薬液 ' + formatLiters(sol) + "</div>" +
    (chemHtml ? '<div class="hint" style="margin-top:4px;">' + chemHtml + "</div>" : "");
}

["sprayVolumePer10a", "sprayLossPct"].forEach((id) => {
  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === id) {
      updateSetupPreview();
      saveSettings();
    }
  });
});

function startSprayRun() {
  if (!selectedIds.length) { alert("圃場を1つ以上選んでください"); return; }
  if (!chemicals.length) {
    if (!confirm("薬剤が未設定です。薬液量だけ表示して開始しますか？")) return;
  }
  saveSettings();
  runIndex = 0;
  runDoneIds = [];
  showRunCard();
  renderRunCard();
  saveSession();
}

function isRunMode() {
  return document.getElementById("runCard")?.style.display === "flex";
}

function showRunCard() {
  document.getElementById("setupCard").style.display = "none";
  document.getElementById("runCard").style.display = "flex";
  window.setAppExitGuardActive && window.setAppExitGuardActive(true);
}

function backToSetup() {
  document.getElementById("runCard").style.display = "none";
  document.getElementById("setupCard").style.display = "flex";
  window.setAppExitGuardActive && window.setAppExitGuardActive(false);
  refreshFieldStyles();
  renderOrderList();
  updateSetupPreview();
}

function renderRunCard() {
  const total = selectedIds.length;
  const done = runDoneIds.length;
  if (runIndex >= total) {
    document.getElementById("runTitle").textContent = "防除完了";
    document.getElementById("runProgressLabel").textContent = "全 " + total + " 圃場";
    document.getElementById("runProgressBar").style.width = "100%";
    document.getElementById("runFieldName").textContent = "すべての畑が完了しました";
    document.getElementById("runFieldMeta").textContent = "完了 " + done + " ／ スキップ " + (total - done);
    document.getElementById("runSolution").textContent = "—";
    document.getElementById("runChems").innerHTML = "";
    const btn = document.getElementById("btnCompleteNext");
    btn.textContent = "設定に戻る";
    btn.onclick = backToSetup;
    refreshFieldStyles();
    clearSession();
    return;
  }
  const id = selectedIds[runIndex];
  const field = allFields.find((x) => String(x.id) === String(id));
  const calc = field ? calcFieldSpray(field) : { areaA: 0, solutionL: 0, chems: [] };
  document.getElementById("runTitle").textContent = "防除 " + (runIndex + 1) + " / " + total;
  document.getElementById("runProgressLabel").textContent = "完了 " + done + " ／ 残り " + (total - runIndex);
  document.getElementById("runProgressBar").style.width = Math.round((runIndex / total) * 100) + "%";
  document.getElementById("runFieldName").textContent = (field && field.name) || "圃場";
  document.getElementById("runFieldMeta").textContent =
    (calc.areaA ? calc.areaA + "a" : "面積未設定") +
    (field && field.location ? " ／ " + field.location : "") +
    " ／ " + calc.volumePer10a + "L/10a・ロス" + calc.lossPct + "%";
  document.getElementById("runSolution").textContent = formatLiters(calc.solutionL);
  document.getElementById("runChems").innerHTML = calc.chems.length
    ? calc.chems.map((c) => {
      return '<div class="chem-card"><div style="display:flex; justify-content:space-between; gap:8px;">' +
        "<b>" + escapeHtml(c.name) + "</b><span>" + c.dilution + "倍</span></div>" +
        '<div class="qty-big" style="font-size:22px; margin-top:4px;">' + formatLiters(c.amountL) + "</div></div>";
    }).join("")
    : '<div class="hint">薬剤未設定のため薬液量のみ表示しています</div>';
  const btn = document.getElementById("btnCompleteNext");
  btn.textContent = (runIndex === total - 1) ? "この畑を完了して終了" : "完了して次の畑";
  btn.onclick = completeCurrentField;
  refreshFieldStyles();
  const center = field ? fieldCenter(field) : null;
  if (center && map) {
    map.panTo(center);
    if (map.getZoom() < 17) map.setZoom(17);
  }
}

function completeCurrentField() {
  const id = selectedIds[runIndex];
  if (id && runDoneIds.indexOf(id) < 0) runDoneIds.push(id);
  runIndex += 1;
  renderRunCard();
  saveSession();
}

function skipCurrentField() {
  runIndex += 1;
  renderRunCard();
  saveSession();
}

function toggleSheet() {
  const card = document.getElementById("setupCard");
  if (!card) return;
  sheetCollapsed = !sheetCollapsed;
  card.style.maxHeight = sheetCollapsed ? "72px" : "72vh";
}

function restoreSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SPRAY_SETTINGS_KEY) || "null");
    if (!raw) return;
    if (raw.volumePer10a) {
      const el = document.getElementById("sprayVolumePer10a");
      if (el) el.value = raw.volumePer10a;
    }
    if (raw.lossPct != null) {
      const el = document.getElementById("sprayLossPct");
      if (el) el.value = raw.lossPct;
    }
    if (Array.isArray(raw.chemicals)) chemicals = raw.chemicals;
  } catch (e) {}
}

function saveSettings() {
  try {
    localStorage.setItem(SPRAY_SETTINGS_KEY, JSON.stringify({
      volumePer10a: spraySettings().volumePer10a,
      lossPct: spraySettings().lossPct,
      chemicals: chemicals
    }));
  } catch (e) {}
}

function saveSession() {
  try {
    sessionStorage.setItem(SPRAY_SESSION_KEY, JSON.stringify({
      selectedIds: selectedIds,
      runIndex: runIndex,
      runDoneIds: runDoneIds,
      running: isRunMode()
    }));
  } catch (e) {}
}

function restoreSession() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SPRAY_SESSION_KEY) || "null");
    if (!raw || !Array.isArray(raw.selectedIds) || !raw.selectedIds.length) return;
    selectedIds = raw.selectedIds.filter((id) => allFields.some((f) => String(f.id) === String(id)));
    renderFieldPicker();
    renderOrderList();
    refreshFieldStyles();
    updateSetupPreview();
    if (raw.running && selectedIds.length) {
      runIndex = Number(raw.runIndex) || 0;
      runDoneIds = Array.isArray(raw.runDoneIds) ? raw.runDoneIds : [];
      showRunCard();
      renderRunCard();
    }
  } catch (e) {}
}

function clearSession() {
  try { sessionStorage.removeItem(SPRAY_SESSION_KEY); } catch (e) {}
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

window.executeLogin = executeLogin;
window.toggleField = toggleField;
window.moveFieldOrder = moveFieldOrder;
window.sortFieldsNorthToSouth = sortFieldsNorthToSouth;
window.clearSelectedFields = clearSelectedFields;
window.onSprayLocationChange = onSprayLocationChange;
window.renderFieldPicker = renderFieldPicker;
window.onChemSearchInput = onChemSearchInput;
window.addChemicalFromMaster = addChemicalFromMaster;
window.addCustomChemical = addCustomChemical;
window.removeChemical = removeChemical;
window.updateChemicalDilution = updateChemicalDilution;
window.startSprayRun = startSprayRun;
window.completeCurrentField = completeCurrentField;
window.skipCurrentField = skipCurrentField;
window.backToSetup = backToSetup;
window.toggleSheet = toggleSheet;
