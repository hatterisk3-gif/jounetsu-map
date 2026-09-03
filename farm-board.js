
const LAYOUT_KEY = "passionMapFarmBoardLayout";
const PROGRESS_KEY = "passionMapFarmBoardProgress";
const LAYOUT_VERSION = 1;

const FIELD_STAGE_CATS = [
  { source: "field.empty", cats: [] },
  { source: "field.chipper", cats: ["chipper_disk"] },
  { source: "field.ridge_crush", cats: ["ridge_crush"] },
  { source: "field.compost", cats: ["compost"] },
  { source: "field.dolomite", cats: ["dolomite"] },
  { source: "field.fertilizer", cats: ["fertilizer"] },
  { source: "field.forward_pull", cats: ["forward_pull"] },
  { source: "field.ridge_make", cats: ["ridge_make"] },
  { source: "plant.done", cats: ["planted"] }
];

const SOURCE_OPTIONS = [
  { id: "plan.unexecuted", label: "計画・未実行（計画別）" },
  { id: "plan.waiting", label: "計画・実行待機中（計画別）" },
  { id: "procure.unexecuted", label: "調達・未実行（計画別）" },
  { id: "procure.done", label: "調達・実行済み待機中（計画別）" },
  { id: "sow.unexecuted", label: "播種・未実行（計画ータグ別）" },
  { id: "sow.waiting", label: "播種済み・定植待ち（計画ータグ別）" },
  { id: "field.empty", label: "空き圃場（圃場名）" },
  { id: "field.chipper", label: "チッパー・ディスク済み（圃場名）" },
  { id: "field.ridge_crush", label: "畝つぶし済み（圃場名）" },
  { id: "field.compost", label: "堆肥散布済み（圃場名）" },
  { id: "field.dolomite", label: "苦土石灰散布済み（圃場名）" },
  { id: "field.fertilizer", label: "肥料散布済み（圃場名）" },
  { id: "field.forward_pull", label: "正転引き済み（圃場名）" },
  { id: "field.ridge_make", label: "畝立て済み（圃場名）" },
  { id: "plant.done", label: "定植済み（計画ータグ別）" },
  { id: "empty", label: "空（カードなし）" }
];

let boardData = { plans: [], fields: [], tasks: [], prodCategories: [] };
let layout = defaultLayout();
let lastCards = [];
let progressMap = loadProgressMap();
let naturalIndexCache = null;
let swipeState = null;
let progressBusy = false;

function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

function defaultLayout() {
  return {
    version: LAYOUT_VERSION,
    columns: [
      {
        id: "col_plan",
        title: "1 計画",
        hint: "計画別",
        color: "#FF9800",
        children: [
          { id: "c_plan_1", title: "1-1 未実行", source: "plan.unexecuted" },
          { id: "c_plan_2", title: "1-2 実行（待機中）", source: "plan.waiting" }
        ]
      },
      {
        id: "col_procure",
        title: "2 調達",
        hint: "計画別",
        color: "#26C6DA",
        children: [
          { id: "c_proc_1", title: "2-1 未実行", source: "procure.unexecuted" },
          { id: "c_proc_2", title: "2-2 実行済み（待機中）", source: "procure.done" }
        ]
      },
      {
        id: "col_sow",
        title: "3 播種・苗床数",
        hint: "計画ータグ別",
        color: "#7E57C2",
        children: [
          { id: "c_sow_1", title: "3-1 未実行", source: "sow.unexecuted" },
          { id: "c_sow_2", title: "3-2 実行済み（定植待ち）", source: "sow.waiting" }
        ]
      },
      {
        id: "col_plant",
        title: "4 定植",
        hint: "圃場名／計画ータグ別",
        color: "#EF5350",
        children: [
          { id: "c_pl_1", title: "4-1 空き圃場", source: "field.empty" },
          { id: "c_pl_2", title: "4-2 チッパー・ディスク済み", source: "field.chipper" },
          { id: "c_pl_3", title: "4-3 畝つぶし済み", source: "field.ridge_crush" },
          { id: "c_pl_4", title: "4-4 堆肥散布済み", source: "field.compost" },
          { id: "c_pl_5", title: "4-5 苦土石灰散布済み", source: "field.dolomite" },
          { id: "c_pl_6", title: "4-6 肥料散布済み", source: "field.fertilizer" },
          { id: "c_pl_7", title: "4-7 正転引き済み", source: "field.forward_pull" },
          { id: "c_pl_8", title: "4-8 畝立て済み", source: "field.ridge_make" },
          { id: "c_pl_9", title: "4-9 定植済み", source: "plant.done" }
        ]
      }
    ]
  };
}

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return defaultLayout();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.columns)) return defaultLayout();
    return parsed;
  } catch (e) {
    return defaultLayout();
  }
}

function saveLayout() {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

function loadProgressMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveProgressMap() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressMap));
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeColor(v) {
  const s = String(v || "").trim();
  return /^#[0-9A-Fa-f]{3,8}$/.test(s) ? s : "#58a6ff";
}

function setStatus(text) {
  const el = document.getElementById("loadStatus");
  if (el) el.textContent = text;
}

document.addEventListener("DOMContentLoaded", () => {
  layout = loadLayout();
  const id = localStorage.getItem("passionMapUserId") || "";
  const pw = localStorage.getItem("passionMapUserPw") || "";
  const sid = localStorage.getItem("spreadsheetId") || "";
  if (document.getElementById("loginId") && id) document.getElementById("loginId").value = id;
  if (document.getElementById("loginPw") && pw) document.getElementById("loginPw").value = pw;
  if (id && sid) {
    hideLogin();
    loadBoard();
  } else if (id && pw) {
    executeLogin(true);
  } else {
    showLogin();
    setStatus("ログインしてください");
  }
});

function showLogin() {
  const el = document.getElementById("loginScreen");
  if (el) el.style.display = "flex";
}
function hideLogin() {
  const el = document.getElementById("loginScreen");
  if (el) el.style.display = "none";
}

async function executeLogin(isAuto) {
  const id = (document.getElementById("loginId") || {}).value || "";
  const pw = (document.getElementById("loginPw") || {}).value || "";
  const err = document.getElementById("loginError");
  if (!id || !pw) {
    if (err) err.textContent = "スタッフIDとパスワードを入力してください";
    showLogin();
    return;
  }
  try {
    const result = await callGAS("login", { orgId: "default", userId: id, password: pw });
    if (!result || !result.success) throw new Error((result && result.message) || "ログイン失敗");
    localStorage.setItem("passionMapUserId", id);
    localStorage.setItem("passionMapUserPw", pw);
    localStorage.setItem("passionMapUserName", result.name || "");
    localStorage.setItem("passionMapUserRole", result.role || "作業員");
    localStorage.setItem("spreadsheetId", result.spreadsheetId);
    hideLogin();
    loadBoard();
  } catch (e) {
    showLogin();
    if (err) err.textContent = e.message || "ログイン失敗";
    if (!isAuto) setStatus("ログイン失敗");
  }
}

async function loadBoard() {
  setStatus("読み込み中…");
  try {
    let data = null;
    try {
      data = await callGAS("getFarmBoardData");
    } catch (e) {
      data = await loadBoardFallback();
    }
    boardData = {
      plans: (data && data.plans) || [],
      fields: (data && data.fields) || [],
      tasks: (data && data.tasks) || [],
      prodCategories: (data && data.prodCategories) || []
    };
    fillYearFilter();
    pruneProgressMap();
    renderBoard();
    const n = (boardData.plans || []).length;
    setStatus("計画 " + n + "件");
  } catch (e) {
    setStatus(e.message || "読み込み失敗");
    boardData = { plans: [], fields: [], tasks: [], prodCategories: [] };
    renderBoard();
  }
}

async function loadBoardFallback() {
  const [plans, init] = await Promise.all([
    callGAS("getSavedCultivationPlanList").catch(() => []),
    callGAS("getInitData").catch(() => ({ polygons: [] }))
  ]);
  return {
    plans: plans || [],
    fields: (init && init.polygons) || [],
    tasks: [],
    prodCategories: (init && init.prodCategories) || []
  };
}

function fillYearFilter() {
  const sel = document.getElementById("yearFilter");
  if (!sel) return;
  const keep = sel.value;
  const years = {};
  (boardData.plans || []).forEach((g) => { if (g.year) years[g.year] = true; });
  const list = Object.keys(years).sort().reverse();
  sel.innerHTML = '<option value="">全年度</option>' + list.map((y) => {
    return '<option value="' + escapeHtml(y) + '">' + escapeHtml(y) + "年度</option>";
  }).join("");
  if (keep && years[keep]) sel.value = keep;
}

function selectedYear() {
  return String((document.getElementById("yearFilter") || {}).value || "").trim();
}

function searchText() {
  return String((document.getElementById("q") || {}).value || "").trim().toLowerCase();
}

function matchYearGroup(g) {
  const y = selectedYear();
  if (!y) return true;
  return String(g.year || "") === y;
}

function matchYearTask(t) {
  const y = selectedYear();
  if (!y) return true;
  if (!t.year) return true;
  return String(t.year) === y;
}

function matchSearch(card) {
  const q = searchText();
  if (!q) return true;
  const blob = [card.kicker, card.title, card.meta, card.detail].join(" ").toLowerCase();
  return blob.indexOf(q) >= 0;
}

function planByIdMap() {
  const map = {};
  (boardData.plans || []).forEach((g) => {
    (g.plans || []).forEach((p) => {
      if (p && p.id) map[String(p.id)] = { group: g, plan: p };
    });
  });
  return map;
}

function catDone(field, ids) {
  const st = (field && field.catStatuses) || {};
  const names = {};
  (boardData.prodCategories || []).forEach((c) => {
    if (c && c.id) names[String(c.id)] = String(c.name || "");
  });
  for (let i = 0; i < ids.length; i++) {
    const row = st[ids[i]] || {};
    const status = String(row.status || "").trim();
    if (status === "completed" || status === "完了") return true;
  }
  const needles = ids.map((id) => String(names[id] || "").replace(/済み$/g, "")).filter(Boolean);
  return Object.keys(st).some((key) => {
    const row = st[key] || {};
    const status = String(row.status || "").trim();
    if (status !== "completed" && status !== "完了") return false;
    const nm = String(names[key] || key);
    return needles.some((w) => w && nm.indexOf(w) >= 0);
  });
}

function fieldHasCompletedTask(fieldName, kinds) {
  const name = String(fieldName || "").trim();
  if (!name) return false;
  return (boardData.tasks || []).some((t) => {
    if (!t.completed || kinds.indexOf(t.kind) < 0) return false;
    return String(t.fieldName || "").split(",").some((n) => String(n).trim() === name);
  });
}

function plantedFieldNames() {
  const set = {};
  (boardData.tasks || []).forEach((t) => {
    if (t.kind !== "plant" || !t.completed) return;
    String(t.fieldName || "").split(",").forEach((n) => {
      const s = String(n).trim();
      if (s && s !== "(圃場未選択)") set[s] = true;
    });
  });
  return set;
}

function fieldStage(field, planted) {
  const name = String(field.name || "").trim();
  if (planted[name] || catDone(field, ["planted"])) return "plant.done";
  if (catDone(field, ["ridge_make"]) || fieldHasCompletedTask(name, ["ridge_make"])) return "field.ridge_make";
  if (catDone(field, ["forward_pull", "forward_pull_finish"]) || fieldHasCompletedTask(name, ["forward_pull"])) return "field.forward_pull";
  if (catDone(field, ["fertilizer"]) || fieldHasCompletedTask(name, ["fertilizer"])) return "field.fertilizer";
  if (catDone(field, ["dolomite"]) || fieldHasCompletedTask(name, ["dolomite"])) return "field.dolomite";
  if (catDone(field, ["compost"]) || fieldHasCompletedTask(name, ["compost"])) return "field.compost";
  if (catDone(field, ["ridge_crush"]) || fieldHasCompletedTask(name, ["ridge_crush"])) return "field.ridge_crush";
  if (catDone(field, ["chipper_disk", "chipper", "disk"]) || fieldHasCompletedTask(name, ["chipper"])) return "field.chipper";
  const st = field.catStatuses || {};
  const chipperByName = Object.keys(st).some((key) => {
    const row = st[key] || {};
    const status = String(row.status || "");
    if (status !== "completed" && status !== "完了") return false;
    return /チッパー|ディスク|chipper|disk/i.test(key);
  });
  if (chipperByName) return "field.chipper";
  return "field.empty";
}

function fieldCard(field) {
  const area = Number(field.area) ? Number(field.area).toFixed(1) + "a" : "";
  return {
    id: "field_" + (field.id || field.name),
    entityKey: "field:" + (field.id || field.name),
    kind: "field",
    payload: { fieldId: field.id || "", fieldName: field.name || "" },
    kicker: [field.location, field.origin].filter(Boolean).join(" · ") || "圃場",
    title: field.name || "(無名圃場)",
    meta: area,
    detail: (field.location || "") + (area ? " / " + area : "")
  };
}

function cardsForSource(source) {
  const byId = planByIdMap();
  if (source === "plan.unexecuted") {
    return (boardData.plans || []).filter(matchYearGroup).filter((g) => Number(g.plannedCount) > 0).map((g) => ({
      id: "plan_u_" + g.year + "_" + g.planName,
      entityKey: "plan:" + g.year + "\t" + g.planName,
      kind: "plan",
      payload: {
        year: g.year,
        crop: g.crop,
        planType: g.planType,
        planName: g.planName,
        planIds: (g.plans || []).filter((p) => p && p.status !== "executed").map((p) => p.id)
      },
      kicker: g.year + " · " + g.crop + (g.planType ? " · " + g.planType : ""),
      title: g.planName || "(計画名なし)",
      meta: "未実行 " + g.plannedCount + "件" + (g.seedPlannedTotal ? " / 種子 " + g.seedPlannedTotal : ""),
      detail: (g.location || "") + " / 実行済 " + (g.executedCount || 0) + "件"
    }));
  }
  if (source === "plan.waiting") {
    return (boardData.plans || []).filter(matchYearGroup).filter((g) => Number(g.executedCount) > 0).map((g) => ({
      id: "plan_w_" + g.year + "_" + g.planName,
      entityKey: "plan:" + g.year + "\t" + g.planName,
      kind: "plan",
      payload: {
        year: g.year,
        crop: g.crop,
        planType: g.planType,
        planName: g.planName,
        planIds: (g.plans || []).filter((p) => p && p.status === "executed").map((p) => p.id)
      },
      kicker: g.year + " · " + g.crop + (g.planType ? " · " + g.planType : ""),
      title: g.planName || "(計画名なし)",
      meta: "実行済 " + g.executedCount + "件（待機中）",
      detail: (g.location || "") + " / 未実行 " + (g.plannedCount || 0) + "件"
    }));
  }
  if (source === "procure.unexecuted" || source === "procure.done") {
    const done = source === "procure.done";
    const grouped = {};
    (boardData.tasks || []).filter((t) => t.kind === "procure" && !!t.completed === done && matchYearTask(t)).forEach((t) => {
      const ids = (t.planIds && t.planIds.length) ? t.planIds : [""];
      ids.forEach((id) => {
        const hit = id ? byId[id] : null;
        const g = hit ? hit.group : null;
        const planName = (g && g.planName) || (t.planNames && t.planNames[0]) || t.crop || "調達";
        const year = (g && g.year) || t.year || "";
        const crop = (g && g.crop) || t.crop || "";
        if (selectedYear() && year && year !== selectedYear()) return;
        const key = year + "\t" + planName;
        if (!grouped[key]) {
          grouped[key] = {
            id: "proc_" + (done ? "d_" : "u_") + key,
            entityKey: "procure:" + key,
            year: year,
            crop: crop,
            planName: planName,
            planIds: [],
            kicker: [year, crop].filter(Boolean).join(" · ") || "調達",
            title: planName,
            bags: 0,
            hours: t.hours || "",
            tags: []
          };
        }
        grouped[key].bags += Number(t.bags) || 0;
        if (t.hours) grouped[key].hours = t.hours;
        if (id && grouped[key].planIds.indexOf(id) < 0) grouped[key].planIds.push(id);
        (t.tags || []).forEach((tag) => {
          if (tag && grouped[key].tags.indexOf(tag) < 0) grouped[key].tags.push(tag);
        });
      });
    });
    return Object.keys(grouped).map((k) => {
      const c = grouped[k];
      return {
        id: c.id,
        entityKey: c.entityKey,
        kind: "procure",
        payload: { year: c.year, crop: c.crop, planName: c.title, planIds: c.planIds || [] },
        kicker: c.kicker,
        title: c.title,
        meta: c.hours || (c.bags ? c.bags + "袋" : (done ? "調達完了" : "未調達")),
        detail: (c.tags || []).join(" ")
      };
    });
  }
  if (source === "sow.unexecuted" || source === "sow.waiting") {
    const done = source === "sow.waiting";
    const grouped = {};
    (boardData.tasks || []).filter((t) => t.kind === "sow" && !!t.completed === done && matchYearTask(t)).forEach((t) => {
      const id = (t.planIds && t.planIds[0]) || "";
      const hit = id ? byId[id] : null;
      const g = hit ? hit.group : null;
      const p = hit ? hit.plan : null;
      const planName = (g && g.planName) || (t.planNames && t.planNames[0]) || t.crop || "播種";
      const tag = (p && p.tag) || (t.tags && t.tags[0]) || t.tag || "タグなし";
      const year = (g && g.year) || t.year || "";
      const crop = (g && g.crop) || t.crop || "";
      if (selectedYear() && year && year !== selectedYear()) return;
      const key = year + "\t" + planName + "\t" + tag;
      if (!grouped[key]) {
        grouped[key] = {
          id: "sow_" + (done ? "d_" : "u_") + key,
          entityKey: "sow:" + key,
          year: year,
          crop: crop,
          planName: planName,
          tag: tag,
          planIds: [],
          kicker: [year, crop, planName].filter(Boolean).join(" · "),
          title: tag,
          trays: 0,
          hours: t.hours || "",
          fields: []
        };
      }
      grouped[key].trays += Number(t.trays) || 0;
      if (t.hours) grouped[key].hours = t.hours;
      if (id && grouped[key].planIds.indexOf(id) < 0) grouped[key].planIds.push(id);
      String(t.fieldName || "").split(",").forEach((n) => {
        const s = String(n).trim();
        if (s && grouped[key].fields.indexOf(s) < 0) grouped[key].fields.push(s);
      });
    });
    return Object.keys(grouped).map((k) => {
      const c = grouped[k];
      const trayLabel = c.trays ? c.trays + "枚" : (c.hours || "苗床");
      return {
        id: c.id,
        entityKey: c.entityKey,
        kind: "sow",
        payload: { year: c.year, crop: c.crop, planName: c.planName, tag: c.tag, planIds: c.planIds || [] },
        kicker: c.kicker,
        title: c.title,
        meta: trayLabel + (done ? " · 定植待ち" : ""),
        detail: (c.fields || []).join("、")
      };
    });
  }
  if (source.indexOf("field.") === 0) {
    const planted = plantedFieldNames();
    return (boardData.fields || []).filter((f) => fieldStage(f, planted) === source).map(fieldCard);
  }
  if (source === "plant.done") {
    const grouped = {};
    (boardData.tasks || []).filter((t) => t.kind === "plant" && t.completed && matchYearTask(t)).forEach((t) => {
      const id = (t.planIds && t.planIds[0]) || "";
      const hit = id ? byId[id] : null;
      const g = hit ? hit.group : null;
      const p = hit ? hit.plan : null;
      const planName = (g && g.planName) || (t.planNames && t.planNames[0]) || t.crop || "定植";
      const tag = (p && p.tag) || (t.tags && t.tags[0]) || t.tag || "タグなし";
      const year = (g && g.year) || t.year || "";
      if (selectedYear() && year && year !== selectedYear()) return;
      const key = year + "\t" + planName + "\t" + tag;
      if (!grouped[key]) {
        grouped[key] = {
          id: "plant_" + key,
          entityKey: "plant:" + key,
          year: year,
          crop: (g && g.crop) || t.crop,
          planName: planName,
          tag: tag,
          planIds: [],
          kicker: [year, (g && g.crop) || t.crop, planName].filter(Boolean).join(" · "),
          title: tag,
          fields: []
        };
      }
      if (id && grouped[key].planIds.indexOf(id) < 0) grouped[key].planIds.push(id);
      String(t.fieldName || "").split(",").forEach((n) => {
        const s = String(n).trim();
        if (s && grouped[key].fields.indexOf(s) < 0) grouped[key].fields.push(s);
      });
    });
    return Object.keys(grouped).map((k) => {
      const c = grouped[k];
      return {
        id: c.id,
        entityKey: c.entityKey,
        kind: "plant",
        payload: { year: c.year, crop: c.crop, planName: c.planName, tag: c.tag, planIds: c.planIds || [], fieldName: (c.fields || []).join(",") },
        kicker: c.kicker,
        title: c.title,
        meta: (c.fields || []).join("、") || "定植済み",
        detail: (c.fields || []).join("、")
      };
    });
  }
  return [];
}

function uniqueLayoutSources() {
  const set = {};
  SOURCE_OPTIONS.forEach((s) => { if (s.id && s.id !== "empty") set[s.id] = true; });
  ((layout && layout.columns) || []).forEach((col) => {
    (col.children || []).forEach((ch) => {
      if (ch.source && ch.source !== "empty") set[ch.source] = true;
    });
  });
  return Object.keys(set);
}

function rebuildNaturalIndex() {
  naturalIndexCache = {};
  uniqueLayoutSources().forEach((src) => {
    naturalIndexCache[src] = cardsForSource(src) || [];
  });
}

function pruneProgressMap() {
  rebuildNaturalIndex();
  const natOf = {};
  Object.keys(naturalIndexCache).forEach((src) => {
    (naturalIndexCache[src] || []).forEach((c) => {
      if (c.entityKey) natOf[c.entityKey] = src;
    });
  });
  let changed = false;
  Object.keys(progressMap).forEach((k) => {
    if (natOf[k] === progressMap[k]) {
      delete progressMap[k];
      changed = true;
    }
  });
  if (changed) saveProgressMap();
}

function displayedCardsFor(source) {
  if (!naturalIndexCache) rebuildNaturalIndex();
  const out = [];
  const seen = {};
  Object.keys(naturalIndexCache).forEach((natSource) => {
    (naturalIndexCache[natSource] || []).forEach((c) => {
      if (!c.entityKey) return;
      const shown = progressMap[c.entityKey] || natSource;
      if (shown !== source || seen[c.entityKey]) return;
      seen[c.entityKey] = true;
      out.push(Object.assign({}, c, { source: shown }));
    });
  });
  return out;
}

function siblingSources(source) {
  const cols = (layout && layout.columns) || [];
  for (let i = 0; i < cols.length; i++) {
    const kids = cols[i].children || [];
    for (let j = 0; j < kids.length; j++) {
      if ((kids[j].source || "empty") !== source) continue;
      return {
        prev: j > 0 ? (kids[j - 1].source || "empty") : "",
        next: j < kids.length - 1 ? (kids[j + 1].source || "empty") : "",
        prevTitle: j > 0 ? kids[j - 1].title : "",
        nextTitle: j < kids.length - 1 ? kids[j + 1].title : ""
      };
    }
  }
  return { prev: "", next: "" };
}

function renderBoard() {
  const root = document.getElementById("board");
  if (!root) return;
  lastCards = [];
  naturalIndexCache = null;
  rebuildNaturalIndex();
  const cols = (layout && layout.columns) || [];
  if (!cols.length) {
    root.innerHTML = '<div class="empty">列がありません。「構成を編集」から追加してください。</div>';
    return;
  }
  root.innerHTML = cols.map((col) => {
    const color = safeColor(col.color);
    const children = col.children || [];
    const lanes = children.map((ch) => {
      const cards = displayedCardsFor(ch.source || "empty").filter(matchSearch);
      cards.forEach((c) => lastCards.push(c));
      const body = cards.length
        ? cards.map((c) => cardHtml(c)).join("")
        : '<div class="empty">カードなし</div>';
      return `<div class="lane">
        <div class="lane-head"><span>${escapeHtml(ch.title || "")}</span><span class="count">${cards.length}</span></div>
        <div class="cards">${body}</div>
      </div>`;
    }).join("");
    return `<section class="parent" style="border-color:${escapeHtml(color)}; --accent:${escapeHtml(color)}">
      <div class="parent-head">
        <span class="title">${escapeHtml(col.title || "")}</span>
        <span class="hint">${escapeHtml(col.hint ? "※" + col.hint : "")}</span>
      </div>
      <div class="lanes">${lanes || '<div class="empty">子列がありません</div>'}</div>
      <div class="parent-foot" style="color:${escapeHtml(color)}">${escapeHtml(col.title || "")}</div>
    </section>`;
  }).join("");
  bindCardSwipe();
}

function cardHtml(c) {
  return `<article class="card" data-id="${escapeHtml(c.id)}" data-entity="${escapeHtml(c.entityKey || "")}" data-source="${escapeHtml(c.source || "")}" data-kind="${escapeHtml(c.kind || "")}">
    <div class="kicker">${escapeHtml(c.kicker || "")}</div>
    <div class="ctitle">${escapeHtml(c.title || "")}</div>
    <div class="meta">${escapeHtml(c.meta || "")}</div>
  </article>`;
}

function openCardModal(id) {
  const card = lastCards.find((c) => c.id === id);
  const bg = document.getElementById("cardModalBg");
  if (!card || !bg) return;
  document.getElementById("cardModalTitle").textContent = card.title || "";
  document.getElementById("cardModalBody").innerHTML =
    "<p>" + escapeHtml(card.kicker || "") + "</p>" +
    "<p>" + escapeHtml(card.meta || "") + "</p>" +
    (card.detail ? "<p>" + escapeHtml(card.detail) + "</p>" : "");
  bg.style.display = "flex";
}

function closeCardModal() {
  const bg = document.getElementById("cardModalBg");
  if (bg) bg.style.display = "none";
}

function openCustomize(mode) {
  document.getElementById("drawerBg").style.display = "block";
  document.getElementById("drawer").style.display = "block";
  renderLayoutEditor();
  if (mode === "add") addParent();
}

function closeCustomize() {
  document.getElementById("drawerBg").style.display = "none";
  document.getElementById("drawer").style.display = "none";
}

function renderLayoutEditor() {
  const box = document.getElementById("layoutEditor");
  if (!box) return;
  box.innerHTML = (layout.columns || []).map((col, pi) => {
    const kids = (col.children || []).map((ch, ci) => {
      const srcOpts = SOURCE_OPTIONS.map((s) => {
        const sel = s.id === ch.source ? " selected" : "";
        return `<option value="${s.id}"${sel}>${escapeHtml(s.label)}</option>`;
      }).join("");
      return `<div class="child-edit">
        <div class="row">
          <input type="text" value="${escapeHtml(ch.title || "")}" onchange="renameChild(${pi},${ci},this.value)">
          <button type="button" class="text-btn tiny" onclick="moveChild(${pi},${ci},-1)">↑</button>
          <button type="button" class="text-btn tiny" onclick="moveChild(${pi},${ci},1)">↓</button>
          <button type="button" class="text-btn tiny danger" onclick="removeChild(${pi},${ci})">削除</button>
        </div>
        <div class="row">
          <select onchange="changeChildSource(${pi},${ci},this.value)">${srcOpts}</select>
        </div>
      </div>`;
    }).join("");
    return `<div class="col-edit" style="border-color:${safeColor(col.color)}">
      <div class="row">
        <input type="color" value="${safeColor(col.color)}" onchange="recolorParent(${pi},this.value)" title="色">
        <input type="text" value="${escapeHtml(col.title || "")}" onchange="renameParent(${pi},this.value)">
        <button type="button" class="text-btn tiny" onclick="moveParent(${pi},-1)">←</button>
        <button type="button" class="text-btn tiny" onclick="moveParent(${pi},1)">→</button>
        <button type="button" class="text-btn tiny danger" onclick="removeParent(${pi})">削除</button>
      </div>
      <div class="row">
        <input type="text" value="${escapeHtml(col.hint || "")}" placeholder="※の補足（計画別 など）" onchange="renameParentHint(${pi},this.value)">
      </div>
      ${kids}
      <button type="button" class="text-btn tiny add-btn" onclick="addChild(${pi})">子列を追加</button>
    </div>`;
  }).join("");
}

function persistAndRefresh() {
  saveLayout();
  renderLayoutEditor();
  renderBoard();
}

function renameParent(i, v) {
  layout.columns[i].title = v;
  persistAndRefresh();
}
function renameParentHint(i, v) {
  layout.columns[i].hint = v;
  persistAndRefresh();
}
function recolorParent(i, v) {
  layout.columns[i].color = v;
  persistAndRefresh();
}
function moveParent(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= layout.columns.length) return;
  const t = layout.columns[i];
  layout.columns[i] = layout.columns[j];
  layout.columns[j] = t;
  persistAndRefresh();
}
function removeParent(i) {
  if (!confirm("この親列と中の子列を削除しますか？")) return;
  layout.columns.splice(i, 1);
  persistAndRefresh();
}
function addParent() {
  layout.columns.push({
    id: uid("col"),
    title: (layout.columns.length + 1) + " 新しい列",
    hint: "",
    color: "#58a6ff",
    children: [{ id: uid("c"), title: "未分類", source: "empty" }]
  });
  persistAndRefresh();
}
function renameChild(pi, ci, v) {
  layout.columns[pi].children[ci].title = v;
  persistAndRefresh();
}
function changeChildSource(pi, ci, v) {
  layout.columns[pi].children[ci].source = v;
  persistAndRefresh();
}
function moveChild(pi, ci, dir) {
  const arr = layout.columns[pi].children;
  const j = ci + dir;
  if (j < 0 || j >= arr.length) return;
  const t = arr[ci];
  arr[ci] = arr[j];
  arr[j] = t;
  persistAndRefresh();
}
function removeChild(pi, ci) {
  layout.columns[pi].children.splice(ci, 1);
  persistAndRefresh();
}
function addChild(pi) {
  layout.columns[pi].children.push({
    id: uid("c"),
    title: "新しい子列",
    source: "empty"
  });
  persistAndRefresh();
}
function resetLayout() {
  if (!confirm("列の名前・並びを初期状態に戻しますか？（カードデータは消えません）")) return;
  layout = defaultLayout();
  persistAndRefresh();
}

function bindCardSwipe() {
  const root = document.getElementById("board");
  if (!root || root.dataset.swipeBound === "1") return;
  root.dataset.swipeBound = "1";
  root.addEventListener("pointerdown", onCardPointerDown);
  root.addEventListener("pointermove", onCardPointerMove);
  root.addEventListener("pointerup", onCardPointerUp);
  root.addEventListener("pointercancel", onCardPointerUp);
}

function onCardPointerDown(e) {
  if (progressBusy) return;
  const card = e.target.closest(".card");
  if (!card || !card.dataset.entity) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  swipeState = {
    card: card,
    x: e.clientX,
    y: e.clientY,
    dx: 0,
    moved: false
  };
  try { card.setPointerCapture(e.pointerId); } catch (err) {}
}

function onCardPointerMove(e) {
  if (!swipeState) return;
  swipeState.dx = e.clientX - swipeState.x;
  const dy = e.clientY - swipeState.y;
  if (!swipeState.moved && Math.abs(swipeState.dx) > 14 && Math.abs(swipeState.dx) > Math.abs(dy) * 1.2) {
    swipeState.moved = true;
    swipeState.card.classList.add("swiping");
  }
  if (!swipeState.moved) return;
  e.preventDefault();
  const dx = Math.max(-130, Math.min(130, swipeState.dx));
  swipeState.card.style.transform = "translateX(" + dx + "px)";
  swipeState.card.classList.toggle("hint-next", dx > 48);
  swipeState.card.classList.toggle("hint-back", dx < -48);
}

function onCardPointerUp(e) {
  if (!swipeState) return;
  const card = swipeState.card;
  const dx = swipeState.dx;
  const moved = swipeState.moved;
  swipeState = null;
  card.classList.remove("swiping", "hint-next", "hint-back");
  if (!moved) {
    card.style.transform = "";
    openCardModal(card.dataset.id);
    return;
  }
  if (dx > 72) {
    commitCardMove(card, 1);
    return;
  }
  if (dx < -72) {
    commitCardMove(card, -1);
    return;
  }
  card.style.transition = "transform .18s ease";
  card.style.transform = "";
  setTimeout(() => { card.style.transition = ""; }, 200);
}

function applyFieldStageLocal(field, source) {
  if (!field.catStatuses || typeof field.catStatuses !== "object") field.catStatuses = {};
  let targetIdx = -1;
  FIELD_STAGE_CATS.forEach((row, i) => {
    if (row.source === source) targetIdx = i;
  });
  if (targetIdx < 0) return;
  FIELD_STAGE_CATS.forEach((row, i) => {
    (row.cats || []).forEach((catId) => {
      if (!field.catStatuses[catId]) field.catStatuses[catId] = { status: "none" };
      field.catStatuses[catId].status = i > 0 && i <= targetIdx ? "completed" : "none";
    });
  });
}

function manurePayloadFromField(field) {
  const catStatuses = field.catStatuses || {};
  const compost = catStatuses.compost || {};
  return {
    catStatuses: catStatuses,
    manure_status: compost.status || "none",
    manure_deadline: compost.deadline || "",
    manure_scheduled_date: compost.scheduled_date || "",
    manure_cancel_reason: compost.cancel_reason || "",
    manure_has_pin: !!compost.has_pin,
    manure_route_selected: !!compost.route_selected
  };
}

function applyPlanLocal(payload, dest) {
  const g = (boardData.plans || []).find((x) => x.year === payload.year && x.planName === payload.planName);
  if (!g) return;
  if (dest === "plan.waiting") {
    g.executedCount = g.count;
    g.plannedCount = 0;
    (g.plans || []).forEach((p) => { if (p) p.status = "executed"; });
  }
}

function applyTaskLocal(kind, payload, completed) {
  const ids = {};
  (payload.planIds || []).forEach((id) => { if (id) ids[String(id)] = true; });
  (boardData.tasks || []).forEach((t) => {
    if (t.kind !== kind) return;
    const hit = (t.planIds || []).some((id) => ids[String(id)]);
    if (hit) t.completed = completed;
  });
}

async function commitCardMove(card, dir) {
  const entity = card.dataset.entity;
  const from = card.dataset.source;
  const info = lastCards.find((c) => c.entityKey === entity) || {};
  const sib = siblingSources(from);
  const dest = dir > 0 ? sib.next : sib.prev;
  const destTitle = dir > 0 ? sib.nextTitle : sib.prevTitle;
  if (!dest) {
    card.style.transition = "transform .18s ease";
    card.style.transform = "";
    setStatus(dir > 0 ? "これ以上先はありません" : "これ以上戻れません");
    setTimeout(() => { card.style.transition = ""; }, 200);
    return;
  }
  const kind = info.kind || card.dataset.kind;
  const payload = info.payload || {};
  const label = info.title || "このカード";
  if (kind === "plan" && dest === "plan.unexecuted") {
    card.style.transform = "";
    setStatus("実行の取り消しは計画画面から行ってください");
    return;
  }
  if (kind === "plan" && dest === "plan.waiting") {
    if (!confirm("「" + label + "」を実行し、調達へ進めますか？")) {
      card.style.transform = "";
      return;
    }
  } else if (dir > 0 && (kind === "procure" || kind === "sow" || kind === "plant") && (dest === "procure.done" || dest === "sow.waiting" || dest === "plant.done")) {
    const work = kind === "procure" ? "調達" : (kind === "sow" ? "播種" : "定植");
    if (!confirm("「" + label + "」の" + work + "を完了にしますか？")) {
      card.style.transform = "";
      return;
    }
  } else if (kind === "field" && dir > 0) {
    if (!confirm("「" + label + "」を「" + (destTitle || dest) + "」へ進めますか？")) {
      card.style.transform = "";
      return;
    }
  }

  const prev = progressMap[entity];
  progressMap[entity] = dest;
  saveProgressMap();
  if (kind === "field") {
    const field = (boardData.fields || []).find((f) => ("field:" + (f.id || f.name)) === entity);
    if (field) applyFieldStageLocal(field, dest);
  } else if (kind === "plan") {
    applyPlanLocal(payload, dest);
  } else if (kind === "procure") {
    applyTaskLocal("procure", payload, dest === "procure.done");
  } else if (kind === "sow") {
    applyTaskLocal("sow", payload, dest === "sow.waiting");
  } else if (kind === "plant") {
    applyTaskLocal("plant", payload, dest === "plant.done");
  }
  renderBoard();
  setStatus("「" + label + "」→ " + (destTitle || dest));

  progressBusy = true;
  try {
    await syncCardMove(kind, payload, dest, dir > 0);
  } catch (e) {
    if (kind === "procure" || kind === "sow" || kind === "plant") {
      setStatus("列は動かしました。" + (e.message || "作業予定への同期は再デプロイ後に有効です"));
    } else {
      if (prev) progressMap[entity] = prev;
      else delete progressMap[entity];
      saveProgressMap();
      setStatus(e.message || "進捗の保存に失敗しました");
      renderBoard();
    }
  } finally {
    progressBusy = false;
  }
}

async function syncCardMove(kind, payload, dest, forward) {
  const userName = localStorage.getItem("passionMapUserName") || "";
  if (kind === "field") {
    const field = (boardData.fields || []).find((f) => f.id === payload.fieldId || f.name === payload.fieldName);
    if (!field || !field.id) return;
    applyFieldStageLocal(field, dest);
    await callGAS("updatePolygon", {
      id: field.id,
      userName: userName,
      manureData: JSON.stringify(manurePayloadFromField(field))
    });
    return;
  }
  if (kind === "plan" && dest === "plan.waiting" && forward) {
    const res = await callGAS("executeCultivationPlans", {
      year: payload.year,
      crop: payload.crop,
      planType: payload.planType,
      planName: payload.planName,
      planIds: payload.planIds || []
    });
    if (res && res.success === false) throw new Error(res.message || "実行に失敗しました");
    return;
  }
  if (kind === "plan") return;
  const taskKind = kind === "plant" ? "plant" : kind;
  const completed = forward && (dest === "procure.done" || dest === "sow.waiting" || dest === "plant.done");
  if (taskKind === "procure" || taskKind === "sow" || taskKind === "plant") {
    if (!forward && !completed) {
      await callGAS("completeFarmBoardTasks", {
        kind: taskKind,
        completed: false,
        planIds: payload.planIds || [],
        tag: payload.tag || "",
        fieldName: payload.fieldName || ""
      });
      return;
    }
    if (completed) {
      await callGAS("completeFarmBoardTasks", {
        kind: taskKind,
        completed: true,
        planIds: payload.planIds || [],
        tag: payload.tag || "",
        fieldName: payload.fieldName || ""
      });
    }
  }
}

window.executeLogin = executeLogin;
window.loadBoard = loadBoard;
window.renderBoard = renderBoard;
window.openCustomize = openCustomize;
window.closeCustomize = closeCustomize;
window.openCardModal = openCardModal;
window.closeCardModal = closeCardModal;
window.addParent = addParent;
window.removeParent = removeParent;
window.moveParent = moveParent;
window.renameParent = renameParent;
window.renameParentHint = renameParentHint;
window.recolorParent = recolorParent;
window.addChild = addChild;
window.removeChild = removeChild;
window.moveChild = moveChild;
window.renameChild = renameChild;
window.changeChildSource = changeChildSource;
window.resetLayout = resetLayout;
