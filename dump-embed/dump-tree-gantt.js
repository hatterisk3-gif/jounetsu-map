/* dump-embed: tree + gantt extracted for 情熱MAP schedule */

'use strict';

// ===== dump-embed helpers (localStorage + optional GAS sync) =====
window.DUMP_GAS_API_URL = window.DUMP_GAS_API_URL || "https://script.google.com/macros/s/AKfycbxP-ENobvgAGiVgXKgzLmKBLZn4_6KzZXwXXZAbDBqmSdLxiJOCf5whFrUv5ikUo5evvQ/exec";

if (typeof window.escapeHtmlText !== "function") {
  window.escapeHtmlText = function (text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
}
function escapeHtmlText(text) { return window.escapeHtmlText(text); }

if (typeof window.runInBackground !== "function") {
  window.runInBackground = function (task, opts) {
    opts = opts || {};
    Promise.resolve()
      .then(function () { return task(); })
      .catch(function (err) {
        console.error("Background task failed:", err);
        if (typeof opts.onError === "function") opts.onError(err);
      });
  };
}
function runInBackground(task, opts) { return window.runInBackground(task, opts); }

if (typeof window.callAPI !== "function") {
  window.callAPI = async function (action, data, options) {
    options = options || {};
    data = data || {};
    try {
      var body = JSON.stringify(Object.assign({ action: action }, data));
      var response = await fetch(window.DUMP_GAS_API_URL, {
        method: "POST",
        body: body,
        headers: { "Content-Type": "text/plain;charset=UTF-8" }
      });
      var text = await response.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        if (!options.silent) alert("通信エラーが発生しました");
        return { error: true, message: "invalid_json" };
      }
    } catch (error) {
      console.error("API Error:", error);
      if (!options.silent) alert("通信エラーが発生しました");
      return { error: true, message: String(error && error.message ? error.message : error) };
    }
  };
}
function callAPI(action, data, options) { return window.callAPI(action, data, options); }

if (typeof window.callBatch !== "function") {
  window.callBatch = async function (ops, options) {
    if (!ops || !ops.length) return { success: true, results: [] };
    if (ops.length === 1) {
      var only = ops[0];
      var action = only.action;
      var rest = Object.assign({}, only);
      delete rest.action;
      var result = await window.callAPI(action, rest, options);
      var failed = !!(result && result.error);
      return { success: !failed, results: [result], error: failed };
    }
    var batchRes = await window.callAPI("batch", { ops: ops }, options);
    if (batchRes && batchRes.error) return { success: false, results: [], error: true };
    var results = batchRes && Array.isArray(batchRes.results) ? batchRes.results : [];
    var hasErr = results.some(function (r) { return r && r.error; });
    var failed2 = hasErr || (batchRes && batchRes.success === false);
    return { success: !failed2, results: results, error: failed2 };
  };
}
function callBatch(ops, options) { return window.callBatch(ops, options); }

if (typeof window.openContextHelp !== "function") {
  window.openContextHelp = function () {};
}
function openContextHelp(key, trigger) { return window.openContextHelp(key, trigger); }

if (typeof window.getLocalInputHistory !== "function") {
  window.getLocalInputHistory = function () {
    try {
      var raw = JSON.parse(localStorage.getItem("input_history") || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  };
}
function getLocalInputHistory() { return window.getLocalInputHistory(); }

if (typeof window.pushAppNavLocation !== "function") {
  window.pushAppNavLocation = function () {};
}
function pushAppNavLocation(k) { return window.pushAppNavLocation(k); }

if (typeof window.getAppLocationKey !== "function") {
  window.getAppLocationKey = function () { return "schedule-dump"; };
}
function getAppLocationKey() { return window.getAppLocationKey(); }


// ----- TREE -----

// ========== ツリー（レール揃えフロー） ==========
const TREE_STORAGE_KEY = 'dump_tree_v1'; // 旧単一パレット（移行用）
const TREE_LIBRARY_KEY = 'dump_tree_library_v1';
const TREE_LIBRARY_UPDATED_AT_KEY = 'dump_tree_library_updated_at';
const TREE_LIBRARY_DIRTY_KEY = 'dump_tree_library_dirty';
const TREE_LIBRARY_FOLDER = '__SYSTEM__';
const TREE_LIBRARY_FILE = 'tree_library';
const TREE_COL_W = 180; // 等間隔グリッド（旧 228×132 の平均）
const TREE_ROW_H = 180;
const TREE_NODE_W = 88;
const TREE_NODE_H = 88;
const TREE_PAD = 42;
const TREE_DEFAULT_COLS = 24;
const TREE_DEFAULT_ROWS = 16;
const TREE_EDGE_BUFFER = 6; // 端からの空きセル数（ここに近づくと自動で広がる）
const TREE_GROW_CHUNK_BUSY = 32; // ノード移動時はまとめて広げて拡張回数を減らす
const TREE_GROW_THROTTLE_BUSY_MS = 90; // 操作中の端拡張チェック間隔
const TREE_NODE_VIRTUALIZE_AT = 40; // これ以上なら表示範囲のノードだけ DOM 化
const TREE_HARD_MAX = 500; // 暴走防止の上限（実用上は無限に近い）
const TREE_PORT_SIDES = ['t', 'r', 'b', 'l'];
const TREE_SIDE_LABEL = { t: '上', r: '右', b: '下', l: '左' };
const TREE_ZOOM_MIN = 0.3;
const TREE_ZOOM_MAX = 2.5;
const TREE_HISTORY_LIMIT = 80;

let treeState = null;
let treeLibrary = null;
let treeSelectedNodeId = null;
let treeSelectedEdgeId = null;
let treeDrag = null;
let treePan = null; // { pointerId, startX, startY, scrollLeft, scrollTop, moved, button }
let treePinch = null; // { startDist, startZoom }
const treeTouchPoints = new Map(); // pointerId -> { x, y }
let treeZoomHintTimer = null;
let treeEdgeRefreshRaf = 0;
let treeLastRoutes = [];
let treeSaveTimer = null;
let treeCloudPublishTimer = null;
let treeLibraryStoreReady = false;
let treeLibrarySyncing = false;
let treeLibrarySyncPromise = null;
let treeLibraryDirty = false;
try { treeLibraryDirty = localStorage.getItem(TREE_LIBRARY_DIRTY_KEY) === '1'; } catch (e) {}
let treeLocalEditGen = 0; // ローカル編集世代（同期の途中上書き防止）
let treeLastLocalEditAt = 0;
const TREE_EDIT_GRACE_MS = 8000; // 編集直後はクラウド取り込みしない
let treeInitSyncGen = 0;
let treeLastRulerKey = '';
let treeBound = false;
let treeLastTap = { id: '', at: 0 };
let treeEditTargetId = null;
let treeInlineEdit = null; // { nodeId, input, labelEl }
let treeUndoStack = [];
let treeRedoStack = [];
let treePortLink = null; // { fromId, fromSide, pointerId, startX, startY, moved }
let treePortTap = null; // { nodeId, side }
let treeEdgeRebind = null; // { edgeId, end:'from'|'to', pointerId, startX, startY, moved }
let treeEdgeRebindPending = null; // { edgeId, end:'from'|'to' } タップで端を選んだあと
let treeRailsRaf = 0;
let treeRulerScrollRaf = 0;
let treeLastRailsKey = '';
let treeGrowingBounds = false;
let treeGrowRaf = 0;
let treeEdgesDirty = false;
let treeLiveRouting = false; // ドラッグ中の簡易配線モード
let treeUiLite = false; // パン／ドラッグ中は定規・交点の再生成を抑える
let treeLiteOriginTx = 0; // 操作中の原点ずらしをレイヤー transform で吸収（px）
let treeLiteOriginTy = 0;
let treeGrowLastAt = 0;
let treeDomCache = null;
let treeSaveSuppressed = false;
let treeZoomSaveTimer = null;
let treeMemoPaintToken = 0;
const TREE_MEMO_PAINT_CHUNK = 36;
const TREE_SYNC_POLL_MS = 3000;
let treeLibraryPollTimer = null;
let treeSyncPendingPull = false;

function emptyTreeState() {
  return {
    cols: TREE_DEFAULT_COLS,
    rows: TREE_DEFAULT_ROWS,
    originCol: 0,
    originRow: 0,
    linkStyle: 'arrow',
    zoom: 1,
    nodes: [
      { id: 'n1', label: 'はじまり', col: 2, row: 2, accent: false }
    ],
    edges: []
  };
}

function treeNormalizeZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return 1;
  return Math.max(TREE_ZOOM_MIN, Math.min(TREE_ZOOM_MAX, Math.round(n * 1000) / 1000));
}

function treeGetZoom() {
  return treeNormalizeZoom(treeState && treeState.zoom);
}

function treeDom() {
  if (treeDomCache && treeDomCache.wrap && treeDomCache.wrap.isConnected) return treeDomCache;
  treeDomCache = {
    wrap: document.getElementById('tree-canvas-wrap'),
    sizer: document.getElementById('tree-zoom-sizer'),
    stage: document.getElementById('tree-stage'),
    layer: document.getElementById('tree-nodes-layer'),
    rails: document.getElementById('tree-rails-svg'),
    edges: document.getElementById('tree-edges-svg'),
    lanes: document.getElementById('tree-lanes-layer'),
    rulerTop: document.getElementById('tree-ruler-top'),
    rulerBottom: document.getElementById('tree-ruler-bottom'),
    rulerLeft: document.getElementById('tree-ruler-left'),
    rulerRight: document.getElementById('tree-ruler-right')
  };
  return treeDomCache;
}

function treeApplyLiteLayerTransform() {
  const d = treeDom();
  const t = (treeLiteOriginTx || treeLiteOriginTy)
    ? ('translate(' + treeLiteOriginTx + 'px,' + treeLiteOriginTy + 'px)')
    : '';
  if (d.layer) d.layer.style.transform = t;
  if (d.edges) d.edges.style.transform = t;
}

function treeBakeLiteOriginShift() {
  if (!treeLiteOriginTx && !treeLiteOriginTy) {
    treeApplyLiteLayerTransform();
    return;
  }
  treeLiteOriginTx = 0;
  treeLiteOriginTy = 0;
  treeApplyLiteLayerTransform();
  const d = treeDom();
  if (!d.layer || !treeState) return;
  const byId = new Map((treeState.nodes || []).map((n) => [n.id, n]));
  d.layer.querySelectorAll('.tree-node').forEach((el) => {
    const n = byId.get(el.dataset.nodeId);
    if (n) treePlaceNodeEl(el, n);
  });
}

/** 操作中のキャンバス拡張: 寸法だけ更新（定規・CSS変数の再設定はしない） */
function treeApplyStageSizeOnly() {
  const d = treeDom();
  if (!d.stage) return;
  const zoom = treeGetZoom();
  const size = treeStageSize();
  d.stage.style.width = size.w + 'px';
  d.stage.style.height = size.h + 'px';
  if (d.sizer) {
    d.sizer.style.width = Math.max(size.w * zoom, d.wrap ? d.wrap.clientWidth : 0) + 'px';
    d.sizer.style.height = Math.max(size.h * zoom, d.wrap ? d.wrap.clientHeight : 0) + 'px';
  }
}

function treeApplyZoomTransform(opts) {
  opts = opts || {};
  const d = treeDom();
  const wrap = d.wrap;
  const sizer = d.sizer;
  const stage = d.stage;
  if (!stage) return;
  // 操作中の拡張は寸法更新だけで十分（scale / 定規の再生成はしない）
  if (opts.sizeOnly || (treeUiLite && !opts.forceFull && !opts.keepCenter)) {
    treeApplyStageSizeOnly();
    treeSyncRulerScrollOnly();
    return;
  }
  const zoom = treeGetZoom();
  const size = treeStageSize();
  stage.style.setProperty('--tree-col-w', TREE_COL_W + 'px');
  stage.style.setProperty('--tree-row-h', TREE_ROW_H + 'px');
  stage.style.setProperty('--tree-pad', TREE_PAD + 'px');
  stage.style.transform = 'scale(' + zoom + ')';
  stage.style.width = size.w + 'px';
  stage.style.height = size.h + 'px';
  if (sizer) {
    sizer.style.width = Math.max(size.w * zoom, wrap ? wrap.clientWidth : 0) + 'px';
    sizer.style.height = Math.max(size.h * zoom, wrap ? wrap.clientHeight : 0) + 'px';
  }
  if (opts.keepCenter && wrap) {
    const cx = (opts.prevScrollLeft + (opts.prevViewW || wrap.clientWidth) / 2) / (opts.prevZoom || 1);
    const cy = (opts.prevScrollTop + (opts.prevViewH || wrap.clientHeight) / 2) / (opts.prevZoom || 1);
    wrap.scrollLeft = Math.max(0, cx * zoom - wrap.clientWidth / 2);
    wrap.scrollTop = Math.max(0, cy * zoom - wrap.clientHeight / 2);
  }
  if (opts.skipRulers || treeUiLite) {
    treeSyncRulerScrollOnly();
    return;
  }
  treeLastRulerKey = '';
  treeRenderRulers();
}

/** 操作中用: 定規トラックのスクロール位置だけ合わせる（DOM再生成なし） */
function treeSyncRulerScrollOnly() {
  const d = treeDom();
  if (!d.wrap) return;
  const sl = d.wrap.scrollLeft;
  const st = d.wrap.scrollTop;
  if (d.rulerTop) d.rulerTop.scrollLeft = sl;
  if (d.rulerBottom) d.rulerBottom.scrollLeft = sl;
  if (d.rulerLeft) d.rulerLeft.scrollTop = st;
  if (d.rulerRight) d.rulerRight.scrollTop = st;
}

function treeScheduleRulerScrollSync() {
  if (treeRulerScrollRaf) return;
  treeRulerScrollRaf = requestAnimationFrame(() => {
    treeRulerScrollRaf = 0;
    treeSyncRulerScrollOnly();
  });
}

function treeEnterUiLite() {
  if (treeUiLite) return;
  treeUiLite = true;
  treeLiteOriginTx = 0;
  treeLiteOriginTy = 0;
  const d = treeDom();
  if (d.wrap) d.wrap.classList.add('is-lite');
  treeApplyLiteLayerTransform();
}

function treeExitUiLite() {
  if (!treeUiLite) return;
  // まだ操作中なら終了描画はしない（パンとドラッグの重なり対策）
  if (treeIsInteractBusy()) return;
  treeUiLite = false;
  const d = treeDom();
  if (d.wrap) d.wrap.classList.remove('is-lite');
  treeBakeLiteOriginShift();
  treeLastRulerKey = '';
  treeLastRailsKey = '';
  // 仮想化中はパン後に表示範囲のノードを作り直す
  if (treeState && (treeState.nodes || []).length > TREE_NODE_VIRTUALIZE_AT) {
    renderTree();
  } else {
    treeRenderRailsOnly();
  }
}

/** 画面上の指定点（既定は表示中央）を固定したまま拡大率を変更する */
function treeZoomTo(nextZoom, clientX, clientY) {
  if (!treeState) return;
  const wrap = document.getElementById('tree-canvas-wrap');
  const prevZoom = treeGetZoom();
  const zoom = treeNormalizeZoom(nextZoom);
  if (!wrap) {
    treeState.zoom = zoom;
    treeApplyZoomTransform();
    treeScheduleZoomSave();
    return;
  }
  if (Math.abs(zoom - prevZoom) < 0.0005) return;
  const rect = wrap.getBoundingClientRect();
  const anchorX = (clientX == null ? rect.left + rect.width / 2 : clientX) - rect.left;
  const anchorY = (clientY == null ? rect.top + rect.height / 2 : clientY) - rect.top;
  const stageX = (wrap.scrollLeft + anchorX) / prevZoom;
  const stageY = (wrap.scrollTop + anchorY) / prevZoom;
  treeState.zoom = zoom;
  treeApplyZoomTransform();
  wrap.scrollLeft = Math.max(0, stageX * zoom - anchorX);
  wrap.scrollTop = Math.max(0, stageY * zoom - anchorY);
  treeScheduleGrowNearEdges();
  treeScheduleZoomSave();
  treeShowZoomHint();
}

function treeShowZoomHint() {
  setTreeHint('表示 ' + Math.round(treeGetZoom() * 100) + '%');
  if (treeZoomHintTimer) clearTimeout(treeZoomHintTimer);
  treeZoomHintTimer = setTimeout(() => {
    treeZoomHintTimer = null;
    treeResetInteractionHint();
  }, 1200);
}

/** ホイール／トラックパッドのスクロールを全体の拡大縮小に割り当てる */
function treeOnCanvasWheel(e) {
  if (!treeState) return;
  e.preventDefault();
  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 16;
  else if (e.deltaMode === 2) delta *= 400;
  if (!delta) return;
  const factor = Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.0018);
  treeZoomTo(treeGetZoom() * factor, e.clientX, e.clientY);
}

function treeNormalizeEdgeStyle(style) {
  return style === 'line' ? 'line' : 'arrow';
}

function treeCloneState(state) {
  return JSON.parse(JSON.stringify(state || emptyTreeState()));
}

function treeNormalizeLaneBag(rawBag) {
  const out = {};
  if (!rawBag || typeof rawBag !== 'object') return out;
  Object.keys(rawBag).forEach((k) => {
    const i = Number(k);
    if (!Number.isFinite(i) || Math.abs(i) >= TREE_HARD_MAX) return;
    const name = String((rawBag[k] && rawBag[k].name) || '').trim().slice(0, 24);
    if (!name) return;
    out[String(Math.floor(i))] = { name };
  });
  return out;
}

function normalizeTreeStateObject(raw) {
  if (!raw || typeof raw !== 'object') return emptyTreeState();
  const originCol = Number.isFinite(Number(raw.originCol)) ? Math.floor(Number(raw.originCol)) : 0;
  const originRow = Number.isFinite(Number(raw.originRow)) ? Math.floor(Number(raw.originRow)) : 0;
  const nodes = Array.isArray(raw.nodes) ? raw.nodes.map((n, i) => ({
    id: String(n.id || ('n' + i)),
    label: String(n.label || 'ノード').slice(0, 40),
    // ワールド座標（スクロール／キャンバス拡張で変わらない固有番号）
    col: Math.max(-TREE_HARD_MAX, Math.min(TREE_HARD_MAX - 1, Math.floor(Number(n.col) || 0))),
    row: Math.max(-TREE_HARD_MAX, Math.min(TREE_HARD_MAX - 1, Math.floor(Number(n.row) || 0))),
    accent: !!n.accent
  })) : [];
  let maxLayoutCol = TREE_DEFAULT_COLS - 1;
  let maxLayoutRow = TREE_DEFAULT_ROWS - 1;
  nodes.forEach((n) => {
    maxLayoutCol = Math.max(maxLayoutCol, (n.col - originCol) + TREE_EDGE_BUFFER);
    maxLayoutRow = Math.max(maxLayoutRow, (n.row - originRow) + TREE_EDGE_BUFFER);
  });
  const cols = Math.max(TREE_DEFAULT_COLS, Math.min(TREE_HARD_MAX, Math.max(Number(raw.cols) || 0, maxLayoutCol + 1)));
  const rows = Math.max(TREE_DEFAULT_ROWS, Math.min(TREE_HARD_MAX, Math.max(Number(raw.rows) || 0, maxLayoutRow + 1)));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges = Array.isArray(raw.edges) ? raw.edges.map((e, i) => {
    const from = String(e.from || '');
    const to = String(e.to || '');
    if (!from || !to || from === to) return null;
    const fromNode = nodeById.get(from);
    const toNode = nodeById.get(to);
    if (!fromNode || !toNode) return null;
    let fromSide = treeNormalizeSide(e.fromSide || e.fromPort);
    let toSide = treeNormalizeSide(e.toSide || e.toPort);
    if (!fromSide || !toSide) {
      const inferred = treeInferSides(fromNode, toNode);
      fromSide = fromSide || inferred.fromSide;
      toSide = toSide || inferred.toSide;
    }
    return {
      id: String(e.id || ('e' + i)),
      from,
      to,
      fromSide,
      toSide,
      style: treeNormalizeEdgeStyle(e.style || e.kind || e.linkStyle)
    };
  }).filter(Boolean) : [];
  const laneCols = treeNormalizeLaneBag(raw.laneLabels && raw.laneLabels.cols);
  const laneRows = treeNormalizeLaneBag(raw.laneLabels && raw.laneLabels.rows);
  const state = {
    cols,
    rows,
    originCol,
    originRow,
    linkStyle: treeNormalizeEdgeStyle(raw.linkStyle),
    zoom: treeNormalizeZoom(raw.zoom),
    nodes: nodes.length ? nodes : emptyTreeState().nodes,
    edges
  };
  if (Object.keys(laneCols).length || Object.keys(laneRows).length) {
    state.laneLabels = { cols: laneCols, rows: laneRows };
  }
  return state;
}

function treeNewPaletteId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function loadTreeLibrary() {
  try {
    const raw = JSON.parse(localStorage.getItem(TREE_LIBRARY_KEY) || 'null');
    if (raw && Array.isArray(raw.palettes) && raw.palettes.length) {
      const palettes = raw.palettes.map((p, i) => ({
        id: String(p.id || ('p' + i)),
        name: String(p.name || ('パレット ' + (i + 1))).slice(0, 40),
        updatedAt: p.updatedAt || '',
        state: normalizeTreeStateObject(p.state)
      }));
      let activeId = String(raw.activeId || palettes[0].id);
      if (!palettes.some((p) => p.id === activeId)) activeId = palettes[0].id;
      return { activeId, palettes };
    }
  } catch (e) {}
  let legacy = null;
  try {
    legacy = JSON.parse(localStorage.getItem(TREE_STORAGE_KEY) || 'null');
  } catch (e) {}
  const id = treeNewPaletteId();
  return {
    activeId: id,
    palettes: [{
      id,
      name: 'パレット 1',
      updatedAt: '',
      state: normalizeTreeStateObject(legacy)
    }]
  };
}

function saveTreeLibrary(opts) {
  if (!treeLibrary) return;
  opts = opts || {};
  try {
    localStorage.setItem(TREE_LIBRARY_KEY, JSON.stringify(treeLibrary));
    // 互換: 旧キーにもアクティブ状態を残す
    if (treeState) localStorage.setItem(TREE_STORAGE_KEY, JSON.stringify(treeState));
    if (opts.touch !== false) {
      localStorage.setItem(TREE_LIBRARY_UPDATED_AT_KEY, new Date().toISOString());
      treeLibraryDirty = true;
      try { localStorage.setItem(TREE_LIBRARY_DIRTY_KEY, '1'); } catch (e) {}
      if (opts.queueCloud !== false) queueTreeLibraryCloudSync();
    }
  } catch (e) {}
}

function treeActivePalette() {
  if (!treeLibrary) return null;
  return treeLibrary.palettes.find((p) => p.id === treeLibrary.activeId) || treeLibrary.palettes[0] || null;
}

function treeFlushActiveToLibrary() {
  if (!treeLibrary || !treeState) return;
  const pal = treeActivePalette();
  if (!pal) return;
  const next = treeCloneState(treeState);
  const changed = !treeSnapshotEquals(pal.state, next);
  pal.state = next;
  if (changed) pal.updatedAt = new Date().toISOString();
}

function normalizeTreeLibraryObject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.palettes) || !raw.palettes.length) return null;
  const palettes = raw.palettes.map((p, i) => ({
    id: String(p.id || ('p' + i)),
    name: String(p.name || ('パレット' + (i + 1))).slice(0, 40),
    updatedAt: p.updatedAt || '',
    state: normalizeTreeStateObject(p.state)
  }));
  let activeId = String(raw.activeId || palettes[0].id);
  if (!palettes.some((p) => p.id === activeId)) activeId = palettes[0].id;
  return { activeId, palettes };
}

async function ensureTreeLibraryStore() {
  if (treeLibraryStoreReady) return;
  await callAPI('addConfigRecord', {
    folder: TREE_LIBRARY_FOLDER,
    file: TREE_LIBRARY_FILE
  }, { silent: true });
  treeLibraryStoreReady = true;
}

function parseTreeLibrarySnapshot(row) {
  if (!row || row.content == null) return null;
  try {
    const payload = JSON.parse(row.content);
    const library = normalizeTreeLibraryObject(payload && payload.library ? payload.library : payload);
    const updatedAt = new Date(payload && payload.updatedAt).getTime();
    if (!library || !Number.isFinite(updatedAt)) return null;
    return {
      cloudId: row.id ? String(row.id) : '',
      library,
      updatedAt,
      updatedAtIso: new Date(updatedAt).toISOString()
    };
  } catch (e) {
    return null;
  }
}

async function fetchCloudTreeLibrarySnapshot() {
  const items = await callAPI('getFolderFileItems', {
    folder: TREE_LIBRARY_FOLDER,
    file: TREE_LIBRARY_FILE
  }, { silent: true });
  if (!Array.isArray(items) || !items.length) return null;
  const parsed = items.map(parseTreeLibrarySnapshot).filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return parsed[0] || null;
}

function treeLibrarySignature(lib) {
  if (!lib) return '';
  try {
    return JSON.stringify({
      activeId: lib.activeId,
      palettes: (lib.palettes || []).map((p) => ({
        id: p.id,
        name: p.name,
        state: p.state
      }))
    });
  } catch (e) {
    return '';
  }
}

function treeClearLibraryDirty() {
  treeLibraryDirty = false;
  try { localStorage.removeItem(TREE_LIBRARY_DIRTY_KEY); } catch (e) {}
}

function treeLibraryLocalUpdatedAtMs() {
  const fromKey = new Date(localStorage.getItem(TREE_LIBRARY_UPDATED_AT_KEY) || 0).getTime();
  let maxPal = 0;
  const lib = treeLibrary || null;
  if (lib && Array.isArray(lib.palettes)) {
    for (let i = 0; i < lib.palettes.length; i++) {
      const t = new Date((lib.palettes[i] && lib.palettes[i].updatedAt) || 0).getTime();
      if (Number.isFinite(t) && t > maxPal) maxPal = t;
    }
  }
  return Math.max(Number.isFinite(fromKey) ? fromKey : 0, maxPal);
}

function treeRenderIfTreeTabActive() {
  const tab = document.getElementById('tree-mode');
  if (!tab || !tab.classList.contains('active')) return;
  treeRenderPaletteSelect();
  renderTree();
  treeUpdateLinkStyleButton();
  treeUpdateHistoryButtons();
}

async function publishTreeLibrary(prefetched) {
  if (!treeLibrary) treeLibrary = loadTreeLibrary();
  if (treeState) treeFlushActiveToLibrary();
  await ensureTreeLibraryStore();
  let localUpdatedAt = treeLibraryLocalUpdatedAtMs();
  if (!localUpdatedAt) {
    const nowIso = new Date().toISOString();
    localStorage.setItem(TREE_LIBRARY_UPDATED_AT_KEY, nowIso);
    localUpdatedAt = new Date(nowIso).getTime();
  }
  const existing = prefetched === undefined ? await fetchCloudTreeLibrarySnapshot() : prefetched;
  // fetch 後にもう一度ローカルを確定（待ち時間中の編集を落とさない）
  if (treeState) treeFlushActiveToLibrary();
  localUpdatedAt = Math.max(localUpdatedAt, treeLibraryLocalUpdatedAtMs());
  // 競合: クラウドの方が新しく、かつローカル保護が無いときだけ取り込む
  if (existing && existing.updatedAt > localUpdatedAt && !treeShouldProtectLocalEdits()) {
    if (applyTreeLibraryFromCloud(existing.library, existing.updatedAtIso)) {
      treeRenderIfTreeTabActive();
    }
    return;
  }
  if (existing && existing.updatedAt > localUpdatedAt && treeShouldProtectLocalEdits()) {
    // ローカル編集を守る。あとで取り込み
    treeSyncPendingPull = true;
  }
  const updatedAt = new Date(Math.max(localUpdatedAt, Date.now())).toISOString();
  localStorage.setItem(TREE_LIBRARY_UPDATED_AT_KEY, updatedAt);
  const payload = JSON.stringify({
    v: 1,
    updatedAt,
    library: {
      activeId: treeLibrary.activeId,
      palettes: treeLibrary.palettes
    }
  });
  const ops = [];
  if (existing && existing.cloudId) {
    ops.push({ action: 'deleteDataRecord', id: existing.cloudId });
  }
  ops.push({
    action: 'addDataRecord',
    folder: TREE_LIBRARY_FOLDER,
    file: TREE_LIBRARY_FILE,
    content: payload
  });
  const res = await callBatch(ops, { silent: true });
  if (res && (res.error || res.success === false)) throw new Error('tree_library_sync');
  treeClearLibraryDirty();
}

function queueTreeLibraryCloudSync() {
  if (treeCloudPublishTimer) clearTimeout(treeCloudPublishTimer);
  treeCloudPublishTimer = setTimeout(() => {
    publishTreeLibrary().catch(() => {});
  }, 200);
}

function treeNoteLocalEdit() {
  treeLocalEditGen += 1;
  treeLastLocalEditAt = Date.now();
  treeLibraryDirty = true;
  try { localStorage.setItem(TREE_LIBRARY_DIRTY_KEY, '1'); } catch (e) {}
}

function treeIsBusyEditing() {
  return !!(treeDrag || treePortLink || treeEdgeRebind || treeEdgeRebindPending
    || treeInlineEdit || treePan || treePinch || treeUiLite || treeSaveSuppressed);
}

function treeShouldProtectLocalEdits() {
  if (treeLibraryDirty || treeIsBusyEditing()) return true;
  if (treeLocalEditGen > 0 && (Date.now() - treeLastLocalEditAt) < TREE_EDIT_GRACE_MS) return true;
  if (treeSaveTimer) return true;
  return false;
}

function applyTreeLibraryFromCloud(library, updatedAtIso) {
  // ローカル編集の保護（同期の二重チェック）
  if (treeShouldProtectLocalEdits()) {
    treeSyncPendingPull = true;
    return false;
  }
  const next = normalizeTreeLibraryObject(library);
  if (!next) return false;
  treeLibrary = next;
  const pal = treeActivePalette();
  treeState = treeCloneState(pal && pal.state ? pal.state : emptyTreeState());
  treeSelectedNodeId = null;
  treeSelectedEdgeId = null;
  treePortTap = null;
  treeEdgeRebind = null;
  treeEdgeRebindPending = null;
  treeResetHistory();
  treeSyncPendingPull = false;
  try {
    localStorage.setItem(TREE_LIBRARY_KEY, JSON.stringify(treeLibrary));
    if (treeState) localStorage.setItem(TREE_STORAGE_KEY, JSON.stringify(treeState));
    if (updatedAtIso) localStorage.setItem(TREE_LIBRARY_UPDATED_AT_KEY, updatedAtIso);
  } catch (_) {}
  treeClearLibraryDirty();
  return true;
}

async function syncTreeLibrary(options) {
  options = options || {};
  const wantRender = options.render !== false;

  // 進行中の同期を待ってから描画（裏同期が render:false でもツリー表示を取りこぼさない）
  if (treeLibrarySyncPromise) {
    try { await treeLibrarySyncPromise; } catch (_) {}
    if (wantRender) treeRenderIfTreeTabActive();
    return treeLibrary;
  }

  treeLibrarySyncing = true;
  treeLibrarySyncPromise = (async () => {
    if (!treeLibrary) treeLibrary = loadTreeLibrary();
    if (treeState) treeFlushActiveToLibrary();
    const startGen = treeLocalEditGen;

    // 取得を先に行う（毎回の addConfigRecord 待ちを避ける）
    let cloud = null;
    try {
      cloud = await fetchCloudTreeLibrarySnapshot();
    } catch (_) {
      cloud = null;
    }

    // fetch 待ちのあいだに編集が入っていたら必ずローカル優先
    if (treeState) treeFlushActiveToLibrary();
    const editedDuringFetch = treeLocalEditGen !== startGen;
    const protect = treeShouldProtectLocalEdits() || editedDuringFetch;

    if (protect) {
      if (treeLibraryDirty || editedDuringFetch) {
        try { await publishTreeLibrary(cloud); } catch (_) {}
      } else if (cloud) {
        treeSyncPendingPull = true;
      }
      return treeLibrary;
    }

    const localUpdatedAt = treeLibraryLocalUpdatedAtMs();
    const cloudNewer = !!(cloud && (!Number.isFinite(localUpdatedAt) || cloud.updatedAt > localUpdatedAt));
    const contentDiffers = !!(cloud && treeLibrarySignature(treeLibrary) !== treeLibrarySignature(cloud.library));

    if (treeLibraryDirty) {
      await publishTreeLibrary(cloud);
    } else if (cloud && cloudNewer) {
      // クラウドの方が新しいときだけ取り込む（contentDiffers だけでは上書きしない）
      if (applyTreeLibraryFromCloud(cloud.library, cloud.updatedAtIso)) {
        treeRenderIfTreeTabActive();
      }
    } else if (cloud && contentDiffers && Number.isFinite(localUpdatedAt) && localUpdatedAt >= cloud.updatedAt) {
      // 内容が違うがローカルが同じか新しい → 上げる
      await publishTreeLibrary(cloud);
    } else if (!cloud) {
      ensureTreeLibraryStore().catch(() => {});
    }
    return treeLibrary;
  })();

  try {
    await treeLibrarySyncPromise;
    if (wantRender) treeRenderIfTreeTabActive();
    return treeLibrary;
  } catch (e) {
    return treeLibrary;
  } finally {
    treeLibrarySyncPromise = null;
    treeLibrarySyncing = false;
  }
}

function startTreeLibraryPoll() {
  if (treeLibraryPollTimer) return;
  treeLibraryPollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const onTree = !!(document.getElementById('tree-mode')
      && document.getElementById('tree-mode').classList.contains('active'));
    // 編集中／未送信は取り込みせず、送信だけ試みる
    if (treeShouldProtectLocalEdits()) {
      if (treeLibraryDirty) queueTreeLibraryCloudSync();
      return;
    }
    syncTreeLibrary({ render: onTree }).catch(() => {});
  }, TREE_SYNC_POLL_MS);
}

function stopTreeLibraryPoll() {
  if (!treeLibraryPollTimer) return;
  clearInterval(treeLibraryPollTimer);
  treeLibraryPollTimer = null;
}

/** 編集が終わったら、保留中のクラウド取り込みを拾う */
function treeMaybeSyncAfterIdle() {
  if (!treeSyncPendingPull || treeShouldProtectLocalEdits()) return;
  const onTree = !!(document.getElementById('tree-mode')
    && document.getElementById('tree-mode').classList.contains('active'));
  syncTreeLibrary({ render: onTree }).catch(() => {});
}

function treeRenderPaletteSelect() {
  const sel = document.getElementById('tree-palette-select');
  if (!sel || !treeLibrary) return;
  const active = treeLibrary.activeId;
  sel.innerHTML = treeLibrary.palettes.map((p) =>
    `<option value="${p.id}"${p.id === active ? ' selected' : ''}>${escapeHtmlText(p.name)}</option>`
  ).join('');
}

function treeSwitchPalette(id) {
  if (!treeLibrary || !id || id === treeLibrary.activeId) return;
  treeFlushActiveToLibrary();
  const next = treeLibrary.palettes.find((p) => p.id === id);
  if (!next) return;
  treeLibrary.activeId = id;
  treeState = treeCloneState(next.state);
  treeResetHistory();
  treeSelectedNodeId = null;
  treeSelectedEdgeId = null;
  treePortTap = null;
  treeClearLinkPreview();
  saveTreeLibrary();
  treeRenderPaletteSelect();
  renderTree();
  setTreeHint('「' + next.name + '」を開きました');
}

function treeAddPalette() {
  if (!treeLibrary) return;
  treeFlushActiveToLibrary();
  const n = treeLibrary.palettes.length + 1;
  const name = window.prompt('新しいパレット名', 'パレット ' + n);
  if (name == null) return;
  const trimmed = String(name).trim().slice(0, 40) || ('パレット ' + n);
  const id = treeNewPaletteId();
  treeLibrary.palettes.push({
    id,
    name: trimmed,
    updatedAt: new Date().toISOString(),
    state: emptyTreeState()
  });
  treeLibrary.activeId = id;
  treeState = emptyTreeState();
  treeResetHistory();
  treeSelectedNodeId = treeState.nodes[0] ? treeState.nodes[0].id : null;
  treeSelectedEdgeId = null;
  saveTreeLibrary();
  treeRenderPaletteSelect();
  renderTree();
  setTreeHint('「' + trimmed + '」を作成しました');
}

function treeRenamePalette() {
  if (!treeLibrary) return;
  const pal = treeActivePalette();
  if (!pal) return;
  const name = window.prompt('パレット名', pal.name);
  if (name == null) return;
  const trimmed = String(name).trim().slice(0, 40);
  if (!trimmed) return;
  pal.name = trimmed;
  pal.updatedAt = new Date().toISOString();
  saveTreeLibrary();
  treeRenderPaletteSelect();
  setTreeHint('名前を「' + trimmed + '」に変更');
}

function treeDeletePalette() {
  if (!treeLibrary) return;
  if (treeLibrary.palettes.length <= 1) {
    setTreeHint('最後の1つは削除できません');
    return;
  }
  const pal = treeActivePalette();
  if (!pal) return;
  if (!confirm('パレット「' + pal.name + '」を削除しますか？\n（中のノードも消えます）')) return;
  treeLibrary.palettes = treeLibrary.palettes.filter((p) => p.id !== pal.id);
  treeLibrary.activeId = treeLibrary.palettes[0].id;
  treeState = treeCloneState(treeLibrary.palettes[0].state);
  treeResetHistory();
  treeSelectedNodeId = null;
  treeSelectedEdgeId = null;
  saveTreeLibrary();
  treeRenderPaletteSelect();
  renderTree();
  setTreeHint('パレットを削除しました');
}

function treeGetDrawStyle() {
  return treeNormalizeEdgeStyle(treeState && treeState.linkStyle);
}

function treeUpdateLinkStyleButton() {
  const btn = document.getElementById('tree-link-style-btn');
  if (!btn) return;
  let style = treeGetDrawStyle();
  if (treeSelectedEdgeId && treeState) {
    const edge = treeState.edges.find((e) => e.id === treeSelectedEdgeId);
    if (edge) style = treeNormalizeEdgeStyle(edge.style);
  }
  const isLine = style === 'line';
  btn.textContent = isLine ? '—' : '→';
  btn.title = treeSelectedEdgeId
    ? (isLine ? '選択中: 線 → タップで矢印に変更' : '選択中: 矢印 → タップで線に変更')
    : (isLine ? '次の接続: 線（タップで矢印に）' : '次の接続: 矢印（タップで線に）');
  btn.setAttribute('aria-label', btn.title);
  btn.classList.toggle('is-active', isLine);
}

function treeToggleLinkStyle() {
  if (!treeState) return;
  if (treeSelectedEdgeId) {
    const edge = treeState.edges.find((e) => e.id === treeSelectedEdgeId);
    if (edge) {
      treePushUndoSnapshot();
      edge.style = treeNormalizeEdgeStyle(edge.style) === 'line' ? 'arrow' : 'line';
      treeState.linkStyle = edge.style;
      scheduleTreeSave();
      renderTree();
      treeUpdateLinkStyleButton();
      setTreeHint(edge.style === 'line' ? '線に変更しました' : '矢印に変更しました');
      return;
    }
  }
  treePushUndoSnapshot();
  treeState.linkStyle = treeGetDrawStyle() === 'line' ? 'arrow' : 'line';
  scheduleTreeSave();
  treeUpdateLinkStyleButton();
  const prev = document.getElementById('tree-link-preview');
  if (prev) prev.classList.toggle('is-line', treeState.linkStyle === 'line');
  setTreeHint(treeState.linkStyle === 'line'
    ? '次の接続は「線」で追加します'
    : '次の接続は「矢印」で追加します');
}

function treeNormalizeSide(side) {
  const s = String(side || '').toLowerCase();
  if (s === 't' || s === 'top' || s === 'u' || s === 'up' || s === 'n') return 't';
  if (s === 'b' || s === 'bottom' || s === 'd' || s === 'down' || s === 's') return 'b';
  if (s === 'l' || s === 'left' || s === 'w') return 'l';
  if (s === 'r' || s === 'right' || s === 'e') return 'r';
  return '';
}

function treeInferSides(fromNode, toNode) {
  const a = treeNodeCenter(fromNode);
  const b = treeNodeCenter(toNode);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { fromSide: dx >= 0 ? 'r' : 'l', toSide: dx >= 0 ? 'l' : 'r' };
  }
  return { fromSide: dy >= 0 ? 'b' : 't', toSide: dy >= 0 ? 't' : 'b' };
}

function loadTreeState() {
  treeLibrary = loadTreeLibrary();
  const pal = treeActivePalette();
  return treeCloneState(pal && pal.state ? pal.state : emptyTreeState());
}

function saveTreeState() {
  if (!treeState) return;
  if (!treeLibrary) treeLibrary = loadTreeLibrary();
  treeNoteLocalEdit();
  treeFlushActiveToLibrary();
  saveTreeLibrary();
}

function treeSnapshotEquals(a, b) {
  try {
    return JSON.stringify(a || null) === JSON.stringify(b || null);
  } catch (_) {
    return false;
  }
}

function treeUpdateHistoryButtons() {
  const undoBtn = document.getElementById('tree-undo-btn');
  const redoBtn = document.getElementById('tree-redo-btn');
  if (undoBtn) undoBtn.disabled = !treeUndoStack.length;
  if (redoBtn) redoBtn.disabled = !treeRedoStack.length;
}

function treeResetHistory() {
  treeUndoStack = [];
  treeRedoStack = [];
  treeUpdateHistoryButtons();
}

function treePushUndoSnapshot(snapshot) {
  if (!treeState) return;
  const snap = treeCloneState(snapshot || treeState);
  const last = treeUndoStack.length ? treeUndoStack[treeUndoStack.length - 1] : null;
  if (treeSnapshotEquals(last, snap)) return;
  treeUndoStack.push(snap);
  if (treeUndoStack.length > TREE_HISTORY_LIMIT) treeUndoStack.shift();
  treeRedoStack = [];
  treeUpdateHistoryButtons();
}

function treeNormalizeSelectionAfterHistoryRestore() {
  if (treeSelectedNodeId && !treeFindNode(treeSelectedNodeId)) treeSelectedNodeId = null;
  if (treeSelectedEdgeId && !treeState.edges.some((e) => e.id === treeSelectedEdgeId)) treeSelectedEdgeId = null;
  treePortTap = null;
  treePortLink = null;
  treeEdgeRebind = null;
  treeEdgeRebindPending = null;
  treeClearLinkPreview();
}

function treeUndo() {
  if (!treeState || !treeUndoStack.length) return;
  closeTreeInlineEdit(false);
  if (treeSaveTimer) {
    clearTimeout(treeSaveTimer);
    treeSaveTimer = null;
  }
  const prev = treeUndoStack.pop();
  treeRedoStack.push(treeCloneState(treeState));
  if (treeRedoStack.length > TREE_HISTORY_LIMIT) treeRedoStack.shift();
  treeState = treeCloneState(prev);
  treeNormalizeSelectionAfterHistoryRestore();
  saveTreeState();
  renderTree();
  treeUpdateHistoryButtons();
  setTreeHint('1つ前に戻しました');
}

function treeRedo() {
  if (!treeState || !treeRedoStack.length) return;
  closeTreeInlineEdit(false);
  if (treeSaveTimer) {
    clearTimeout(treeSaveTimer);
    treeSaveTimer = null;
  }
  const next = treeRedoStack.pop();
  treeUndoStack.push(treeCloneState(treeState));
  if (treeUndoStack.length > TREE_HISTORY_LIMIT) treeUndoStack.shift();
  treeState = treeCloneState(next);
  treeNormalizeSelectionAfterHistoryRestore();
  saveTreeState();
  renderTree();
  treeUpdateHistoryButtons();
  setTreeHint('やり直しました');
}

function treeIsInteractBusy() {
  return !!(treePan || treeDrag || treePinch || treePortLink || treeEdgeRebind);
}

function scheduleTreeSave() {
  // 同期レース対策: 保存前でも即座に dirty / 世代を上げる
  treeNoteLocalEdit();
  if (treeSaveSuppressed || treeIsInteractBusy()) {
    treeSaveSuppressed = true;
    return;
  }
  if (treeSaveTimer) clearTimeout(treeSaveTimer);
  treeSaveTimer = setTimeout(saveTreeState, 200);
}

function treeFlushDeferredSave() {
  treeSaveSuppressed = false;
  if (treeSaveTimer) clearTimeout(treeSaveTimer);
  treeSaveTimer = setTimeout(() => {
    saveTreeState();
    treeMaybeSyncAfterIdle();
  }, 120);
}

function treeScheduleZoomSave() {
  if (treeZoomSaveTimer) clearTimeout(treeZoomSaveTimer);
  treeZoomSaveTimer = setTimeout(() => {
    treeZoomSaveTimer = null;
    treeSaveSuppressed = false;
    scheduleTreeSave();
  }, 700);
}

function treeOriginCol() {
  return (treeState && Number.isFinite(Number(treeState.originCol)))
    ? Math.floor(Number(treeState.originCol))
    : 0;
}

function treeOriginRow() {
  return (treeState && Number.isFinite(Number(treeState.originRow)))
    ? Math.floor(Number(treeState.originRow))
    : 0;
}

/** レイアウト列（キャンバス上 0..cols-1）→ 固有ワールド列 */
function treeLayoutToWorldCol(layoutCol) {
  return Math.floor(Number(layoutCol) || 0) + treeOriginCol();
}

function treeLayoutToWorldRow(layoutRow) {
  return Math.floor(Number(layoutRow) || 0) + treeOriginRow();
}

/** 固有ワールド列 → レイアウト列 */
function treeWorldToLayoutCol(worldCol) {
  return Math.floor(Number(worldCol) || 0) - treeOriginCol();
}

function treeWorldToLayoutRow(worldRow) {
  return Math.floor(Number(worldRow) || 0) - treeOriginRow();
}

/** 表示用の固有番号（1始まり。スクロールしても変わらない） */
function treeWorldLabelCol(worldCol) {
  return Math.floor(Number(worldCol) || 0) + 1;
}

function treeWorldLabelRow(worldRow) {
  return Math.floor(Number(worldRow) || 0) + 1;
}

function treeCellCenter(layoutCol, layoutRow) {
  return {
    x: TREE_PAD + layoutCol * TREE_COL_W + TREE_COL_W / 2,
    y: TREE_PAD + layoutRow * TREE_ROW_H + TREE_ROW_H / 2
  };
}

function treeNodeCenter(node) {
  if (!node) return { x: TREE_PAD + TREE_COL_W / 2, y: TREE_PAD + TREE_ROW_H / 2 };
  return treeCellCenter(treeWorldToLayoutCol(node.col), treeWorldToLayoutRow(node.row));
}

function treeNodeAtWorld(worldCol, worldRow) {
  return (treeState.nodes || []).some((n) => n && n.col === worldCol && n.row === worldRow);
}

function treePlaceNodeEl(el, n) {
  if (!el || !n) return;
  const center = treeNodeCenter(n);
  el.style.left = (center.x - TREE_NODE_W / 2) + 'px';
  el.style.top = (center.y - TREE_NODE_H / 2) + 'px';
}

function treeScrollNodeIntoView(nodeId) {
  const n = treeFindNode(nodeId);
  const wrap = document.getElementById('tree-canvas-wrap');
  if (!n || !wrap) return;
  const center = treeNodeCenter(n);
  const zoom = treeGetZoom() || 1;
  const targetLeft = Math.max(0, center.x * zoom - wrap.clientWidth * 0.5);
  const targetTop = Math.max(0, center.y * zoom - wrap.clientHeight * 0.5);
  try {
    wrap.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
  } catch (_) {
    wrap.scrollLeft = targetLeft;
    wrap.scrollTop = targetTop;
  }
}

function treePortPoint(node, side) {
  const c = treeNodeCenter(node);
  const hw = TREE_NODE_W / 2;
  const hh = TREE_NODE_H / 2;
  const s = treeNormalizeSide(side) || 'r';
  if (s === 't') return { x: c.x, y: c.y - hh };
  if (s === 'b') return { x: c.x, y: c.y + hh };
  if (s === 'l') return { x: c.x - hw, y: c.y };
  return { x: c.x + hw, y: c.y };
}

function treePortOut(pt, side, len) {
  const d = len == null ? 18 : len;
  const s = treeNormalizeSide(side) || 'r';
  if (s === 't') return { x: pt.x, y: pt.y - d };
  if (s === 'b') return { x: pt.x, y: pt.y + d };
  if (s === 'l') return { x: pt.x - d, y: pt.y };
  return { x: pt.x + d, y: pt.y };
}

function treeSnapColRow(clientX, clientY) {
  const pt = treeClientToStage(clientX, clientY);
  if (!treeState) return { col: treeOriginCol(), row: treeOriginRow() };
  let layoutCol = Math.round((pt.x - TREE_PAD - TREE_COL_W / 2) / TREE_COL_W);
  let layoutRow = Math.round((pt.y - TREE_PAD - TREE_ROW_H / 2) / TREE_ROW_H);
  const cols = treeState.cols || TREE_DEFAULT_COLS;
  const rows = treeState.rows || TREE_DEFAULT_ROWS;
  const margin = TREE_EDGE_BUFFER;
  // 端付近だけで拡張。中央のドラッグでは毎フレーム ensure しない
  const nearEdge = layoutCol < margin || layoutRow < margin
    || layoutCol >= cols - margin || layoutRow >= rows - margin
    || layoutCol < 0 || layoutRow < 0 || layoutCol >= cols || layoutRow >= rows;
  if (nearEdge) {
    const ensured = treeEnsureCanvasBounds({
      includeCol: layoutCol,
      includeRow: layoutRow,
      apply: true,
      rerender: false,
      skipViewport: true,
      skipRulers: true
    });
    layoutCol += ensured.dCol;
    layoutRow += ensured.dRow;
  }
  layoutCol = Math.max(0, Math.min((treeState.cols || cols) - 1, layoutCol));
  layoutRow = Math.max(0, Math.min((treeState.rows || rows) - 1, layoutRow));
  return {
    col: treeLayoutToWorldCol(layoutCol),
    row: treeLayoutToWorldRow(layoutRow)
  };
}

function treeClientToStage(clientX, clientY) {
  const wrap = document.getElementById('tree-canvas-wrap');
  if (!wrap) return { x: 0, y: 0 };
  const zoom = treeGetZoom() || 1;
  const rect = wrap.getBoundingClientRect();
  return {
    x: (clientX - rect.left + wrap.scrollLeft) / zoom,
    y: (clientY - rect.top + wrap.scrollTop) / zoom
  };
}

function treeFindNode(id) {
  return (treeState.nodes || []).find((n) => n.id === id) || null;
}

function setTreeHint(text) {
  const el = document.getElementById('tree-hint');
  if (el) el.textContent = text || '';
}

function treeResetInteractionHint() {
  setTreeHint('交点で追加 · 番号でジャンル · メモから挿入 · ホイール/ピンチで拡大縮小 · 右ドラッグで移動');
  treeUpdateLinkStyleButton();
}

function treeStageSize() {
  if (!treeState) return { w: 800, h: 500 };
  return {
    w: Math.max(TREE_PAD * 2 + treeState.cols * TREE_COL_W, 640),
    h: Math.max(TREE_PAD * 2 + treeState.rows * TREE_ROW_H, 480)
  };
}

/** いま見えている範囲をセル座標で返す（やや広め） */
function treeViewportCellRange() {
  const wrap = document.getElementById('tree-canvas-wrap');
  if (!wrap || !treeState) {
    return { c0: 0, c1: (treeState && treeState.cols ? treeState.cols : TREE_DEFAULT_COLS) - 1, r0: 0, r1: (treeState && treeState.rows ? treeState.rows : TREE_DEFAULT_ROWS) - 1 };
  }
  const zoom = treeGetZoom() || 1;
  const left = wrap.scrollLeft / zoom;
  const top = wrap.scrollTop / zoom;
  const right = (wrap.scrollLeft + Math.max(wrap.clientWidth, 1)) / zoom;
  const bottom = (wrap.scrollTop + Math.max(wrap.clientHeight, 1)) / zoom;
  return {
    c0: Math.floor((left - TREE_PAD) / TREE_COL_W) - 1,
    c1: Math.ceil((right - TREE_PAD - TREE_COL_W / 2) / TREE_COL_W) + 1,
    r0: Math.floor((top - TREE_PAD) / TREE_ROW_H) - 1,
    r1: Math.ceil((bottom - TREE_PAD - TREE_ROW_H / 2) / TREE_ROW_H) + 1
  };
}

/** 左／上に余白を足す。ノードのワールド座標は変えず、原点だけずらす */
function treeShiftOrigin(dCol, dRow) {
  if (!treeState || (!dCol && !dRow)) return;
  treeState.originCol = treeOriginCol() - dCol;
  treeState.originRow = treeOriginRow() - dRow;
  const d = treeDom();
  if (treeUiLite) {
    // 操作中は全ノードの left/top を触らず、レイヤー transform で吸収
    treeLiteOriginTx += dCol * TREE_COL_W;
    treeLiteOriginTy += dRow * TREE_ROW_H;
    treeApplyLiteLayerTransform();
  } else if (d.layer) {
    const byId = new Map((treeState.nodes || []).map((n) => [n.id, n]));
    d.layer.querySelectorAll('.tree-node').forEach((el) => {
      const n = byId.get(el.dataset.nodeId);
      if (n) treePlaceNodeEl(el, n);
    });
  }
  const wrap = d.wrap;
  const zoom = treeGetZoom() || 1;
  const dx = dCol * TREE_COL_W * zoom;
  const dy = dRow * TREE_ROW_H * zoom;
  if (wrap) {
    wrap.scrollLeft += dx;
    wrap.scrollTop += dy;
  }
  if (treePan) {
    treePan.scrollLeft += dx;
    treePan.scrollTop += dy;
  }
  treeLastRailsKey = '';
  treeLastRulerKey = '';
  treeEdgesDirty = true;
  // 操作中は配線の本計算を後回し（終了時にまとめて）
  if (!treeIsInteractBusy() && !treeUiLite) treeScheduleEdgeRefresh(false);
}

/**
 * 無限キャンバスの境界を広げる。
 * - ノード／指定セル／表示範囲の外側に TREE_EDGE_BUFFER 分の空きを確保
 * - 左・上にはみ出す必要があれば原点をずらす（ノード番号は不変）
 * @returns {{ changed:boolean, dCol:number, dRow:number }}
 */
function treeEnsureCanvasBounds(opts) {
  opts = opts || {};
  if (!treeState) return { changed: false, dCol: 0, dRow: 0 };

  let minLayoutCol = 0;
  let minLayoutRow = 0;
  let maxLayoutCol = Math.max(0, (treeState.cols || TREE_DEFAULT_COLS) - 1);
  let maxLayoutRow = Math.max(0, (treeState.rows || TREE_DEFAULT_ROWS) - 1);

  (treeState.nodes || []).forEach((n) => {
    if (!n) return;
    const lc = treeWorldToLayoutCol(n.col);
    const lr = treeWorldToLayoutRow(n.row);
    minLayoutCol = Math.min(minLayoutCol, lc - TREE_EDGE_BUFFER);
    minLayoutRow = Math.min(minLayoutRow, lr - TREE_EDGE_BUFFER);
    maxLayoutCol = Math.max(maxLayoutCol, lc + TREE_EDGE_BUFFER);
    maxLayoutRow = Math.max(maxLayoutRow, lr + TREE_EDGE_BUFFER);
  });

  if (Number.isFinite(opts.includeCol)) {
    minLayoutCol = Math.min(minLayoutCol, opts.includeCol - TREE_EDGE_BUFFER);
    maxLayoutCol = Math.max(maxLayoutCol, opts.includeCol + TREE_EDGE_BUFFER);
  }
  if (Number.isFinite(opts.includeRow)) {
    minLayoutRow = Math.min(minLayoutRow, opts.includeRow - TREE_EDGE_BUFFER);
    maxLayoutRow = Math.max(maxLayoutRow, opts.includeRow + TREE_EDGE_BUFFER);
  }

  if (!opts.skipViewport) {
    const vp = treeViewportCellRange();
    minLayoutCol = Math.min(minLayoutCol, vp.c0 - TREE_EDGE_BUFFER + 1);
    maxLayoutCol = Math.max(maxLayoutCol, vp.c1 + TREE_EDGE_BUFFER - 1);
    minLayoutRow = Math.min(minLayoutRow, vp.r0 - TREE_EDGE_BUFFER + 1);
    maxLayoutRow = Math.max(maxLayoutRow, vp.r1 + TREE_EDGE_BUFFER - 1);
  }

  let dCol = 0;
  let dRow = 0;
  if (minLayoutCol < 0) dCol = -minLayoutCol;
  if (minLayoutRow < 0) dRow = -minLayoutRow;
  if (dCol || dRow) {
    treeShiftOrigin(dCol, dRow);
    maxLayoutCol += dCol;
    maxLayoutRow += dRow;
    minLayoutCol += dCol;
    minLayoutRow += dRow;
  }

  const nextCols = Math.max(TREE_DEFAULT_COLS, Math.min(TREE_HARD_MAX, maxLayoutCol + 1));
  const nextRows = Math.max(TREE_DEFAULT_ROWS, Math.min(TREE_HARD_MAX, maxLayoutRow + 1));
  let changed = !!(dCol || dRow);
  if (nextCols > treeState.cols) {
    treeState.cols = nextCols;
    changed = true;
  }
  if (nextRows > treeState.rows) {
    treeState.rows = nextRows;
    changed = true;
  }

  if (changed && opts.apply !== false) {
    const lite = !!(opts.skipRulers || treeUiLite || treeIsInteractBusy());
    if (lite) treeApplyZoomTransform({ sizeOnly: true });
    else {
      treeApplyZoomTransform({ skipRulers: !!opts.skipRulers });
      if (opts.rerender !== false) treeRenderRailsOnly();
    }
  }
  return { changed, dCol, dRow };
}

/** 端に近づいたら余白を足す（パン中は拡張しない＝抜本的に軽くする） */
function treeGrowNearEdges() {
  if (!treeState || treeGrowingBounds) return false;
  // パン中の自動拡張が重さの主因。ノード配置時だけ広げる
  if (treePan || (treeUiLite && !treeDrag)) return false;
  const wrap = treeDom().wrap || document.getElementById('tree-canvas-wrap');
  if (!wrap) return false;
  treeGrowingBounds = true;
  try {
    const zoom = treeGetZoom() || 1;
    const busy = treeUiLite || treeIsInteractBusy();
    const edgePx = Math.max(TREE_COL_W, TREE_ROW_H) * zoom * (busy ? 2.2 : 1.2);
    const needLeft = wrap.scrollLeft < edgePx;
    const needTop = wrap.scrollTop < edgePx;
    const needRight = wrap.scrollLeft + wrap.clientWidth > wrap.scrollWidth - edgePx;
    const needBottom = wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - edgePx;
    if (!needLeft && !needTop && !needRight && !needBottom) {
      // 端でなければ拡張しない（交点は scroll 側の rails refresh で更新）
      return false;
    }
    const chunk = busy ? TREE_GROW_CHUNK_BUSY : TREE_EDGE_BUFFER;
    const includeCol = needLeft
      ? -chunk
      : (needRight ? treeState.cols + chunk - 1 : null);
    const includeRow = needTop
      ? -chunk
      : (needBottom ? treeState.rows + chunk - 1 : null);
    const res = treeEnsureCanvasBounds({
      includeCol,
      includeRow,
      apply: true,
      rerender: !busy,
      skipRulers: busy
    });
    if (res.changed && !treeIsInteractBusy()) scheduleTreeSave();
    else if (res.changed) treeSaveSuppressed = true;
    return !!res.changed;
  } finally {
    treeGrowingBounds = false;
  }
}

function treeScheduleGrowNearEdges() {
  if (treeGrowRaf) return;
  treeGrowRaf = requestAnimationFrame(() => {
    treeGrowRaf = 0;
    const busy = treeUiLite || treeIsInteractBusy();
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (busy && (now - treeGrowLastAt) < TREE_GROW_THROTTLE_BUSY_MS) return;
    treeGrowLastAt = now;
    treeGrowNearEdges();
  });
}

function treeScheduleRailsRefresh() {
  if (treeRailsRaf) return;
  treeRailsRaf = requestAnimationFrame(() => {
    treeRailsRaf = 0;
    treeRenderRailsOnly();
  });
}

const TREE_LANE_COLORS = [
  'rgba(34, 211, 238, 0.34)',
  'rgba(251, 191, 36, 0.36)',
  'rgba(167, 139, 250, 0.36)',
  'rgba(52, 211, 153, 0.34)',
  'rgba(251, 113, 133, 0.34)',
  'rgba(96, 165, 250, 0.36)',
  'rgba(244, 114, 182, 0.34)',
  'rgba(163, 230, 53, 0.32)'
];

function treeShiftLaneKeys(dCol, dRow) {
  const lanes = treeState && treeState.laneLabels;
  if (!lanes) return;
  const move = (bag, delta) => {
    if (!bag || !delta) return bag || {};
    const next = {};
    Object.keys(bag).forEach((k) => {
      const i = Number(k) + delta;
      if (!Number.isFinite(i) || i < 0) return;
      next[String(i)] = bag[k];
    });
    return next;
  };
  if (dCol) lanes.cols = move(lanes.cols, dCol);
  if (dRow) lanes.rows = move(lanes.rows, dRow);
  if (!Object.keys(lanes.cols || {}).length && !Object.keys(lanes.rows || {}).length) {
    delete treeState.laneLabels;
  }
}

function treeLaneBag(axis) {
  const lanes = treeState && treeState.laneLabels;
  if (!lanes) return null;
  return axis === 'col' ? lanes.cols : lanes.rows;
}

function treeLaneName(axis, index) {
  const bag = treeLaneBag(axis);
  const item = bag && bag[String(index)];
  return item && item.name ? String(item.name) : '';
}

function treeLaneColor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TREE_LANE_COLORS[h % TREE_LANE_COLORS.length];
}

function treeLaneSignature() {
  const lanes = treeState && treeState.laneLabels;
  if (!lanes) return '';
  const pack = (bag) => Object.keys(bag || {}).sort().map((k) => k + '=' + bag[k].name).join(',');
  return pack(lanes.cols) + '/' + pack(lanes.rows);
}

function treeSetLaneName(axis, index, name) {
  if (!treeState || !Number.isFinite(index) || Math.abs(index) >= TREE_HARD_MAX) return;
  if (!treeState.laneLabels) treeState.laneLabels = { cols: {}, rows: {} };
  const key = axis === 'col' ? 'cols' : 'rows';
  if (!treeState.laneLabels[key]) treeState.laneLabels[key] = {};
  if (!name) delete treeState.laneLabels[key][String(index)];
  else treeState.laneLabels[key][String(index)] = { name };
  if (!Object.keys(treeState.laneLabels.cols || {}).length && !Object.keys(treeState.laneLabels.rows || {}).length) {
    delete treeState.laneLabels;
  }
}

function treeRenameLane(axis, index) {
  if (!treeState || (axis !== 'col' && axis !== 'row') || !Number.isFinite(index)) return;
  const axisLabel = axis === 'col' ? '列' : '行';
  const labelNum = axis === 'col' ? treeWorldLabelCol(index) : treeWorldLabelRow(index);
  const current = treeLaneName(axis, index);
  const next = window.prompt(axisLabel + ' ' + labelNum + ' のジャンル名（空欄で解除）', current);
  if (next == null) return;
  const name = String(next).trim().slice(0, 24);
  if (name === current) return;
  treePushUndoSnapshot();
  treeSetLaneName(axis, index, name);
  scheduleTreeSave();
  treeLastRulerKey = '';
  const laneLayer = document.getElementById('tree-lanes-layer');
  if (laneLayer) delete laneLayer.dataset.key;
  treeRenderRulers();
  setTreeHint(name
    ? (axisLabel + labelNum + ' を「' + name + '」にしました')
    : (axisLabel + labelNum + ' の名前を外しました'));
}

function treeRenderLanes() {
  const layer = document.getElementById('tree-lanes-layer');
  if (!layer || !treeState) return;
  const wrap = document.getElementById('tree-canvas-wrap');
  const zoom = treeGetZoom() || 1;
  const lanes = treeState.laneLabels || { cols: {}, rows: {} };
  const colKeys = Object.keys(lanes.cols || {});
  const rowKeys = Object.keys(lanes.rows || {});
  if (!colKeys.length && !rowKeys.length) {
    if (layer.dataset.key !== '') {
      layer.dataset.key = '';
      layer.innerHTML = '';
    }
    return;
  }
  const viewLeft = wrap ? wrap.scrollLeft / zoom : 0;
  const viewTop = wrap ? wrap.scrollTop / zoom : 0;
  const viewKey = treeLaneSignature() + '@' + treeState.cols + 'x' + treeState.rows
    + ':' + treeOriginCol() + ',' + treeOriginRow()
    + ':' + Math.round(viewLeft / 12) + ',' + Math.round(viewTop / 12);
  if (layer.dataset.key === viewKey) return;
  layer.dataset.key = viewKey;
  const inset = 10;
  const gridW = treeState.cols * TREE_COL_W;
  const gridH = treeState.rows * TREE_ROW_H;
  const parts = [];
  colKeys.forEach((k) => {
    const worldC = Number(k);
    const layoutC = treeWorldToLayoutCol(worldC);
    if (layoutC < -1 || layoutC > treeState.cols) return;
    const name = lanes.cols[k].name;
    const x = TREE_PAD + layoutC * TREE_COL_W + inset;
    const nameTop = Math.max(inset, viewTop - TREE_PAD + 8);
    parts.push(
      '<div class="tree-lane-bar is-col" style="left:' + x + 'px;top:' + TREE_PAD + 'px;width:'
      + (TREE_COL_W - inset * 2) + 'px;height:' + gridH + 'px;background:' + treeLaneColor(name) + '">'
      + '<span class="tree-lane-name" style="top:' + nameTop.toFixed(0) + 'px">' + escapeHtmlText(name) + '</span></div>'
    );
  });
  rowKeys.forEach((k) => {
    const worldR = Number(k);
    const layoutR = treeWorldToLayoutRow(worldR);
    if (layoutR < -1 || layoutR > treeState.rows) return;
    const name = lanes.rows[k].name;
    const y = TREE_PAD + layoutR * TREE_ROW_H + inset;
    const nameLeft = Math.max(inset, viewLeft - TREE_PAD + 8);
    parts.push(
      '<div class="tree-lane-bar is-row" style="left:' + TREE_PAD + 'px;top:' + y + 'px;width:'
      + gridW + 'px;height:' + (TREE_ROW_H - inset * 2) + 'px;background:' + treeLaneColor(name) + '">'
      + '<span class="tree-lane-name" style="left:' + nameLeft.toFixed(0) + 'px">' + escapeHtmlText(name) + '</span></div>'
    );
  });
  layer.innerHTML = parts.join('');
  layer.style.width = (TREE_PAD * 2 + gridW) + 'px';
  layer.style.height = (TREE_PAD * 2 + gridH) + 'px';
}

/** 上・下に列番号、左・右に行番号（固有ワールド座標・1始まり）。選択中のマスを強調 */
function treeRenderRulers() {
  if (!treeState) return;
  const wrap = document.getElementById('tree-canvas-wrap');
  const top = document.getElementById('tree-ruler-top');
  const bottom = document.getElementById('tree-ruler-bottom');
  const left = document.getElementById('tree-ruler-left');
  const right = document.getElementById('tree-ruler-right');
  if (!wrap || !top || !bottom || !left || !right) return;
  const zoom = treeGetZoom() || 1;
  const size = treeStageSize();
  const vr = treeViewportCellRange();
  const c0 = Math.max(0, Math.min(treeState.cols - 1, vr.c0));
  const c1 = Math.max(c0, Math.min(treeState.cols - 1, vr.c1));
  const r0 = Math.max(0, Math.min(treeState.rows - 1, vr.r0));
  const r1 = Math.max(r0, Math.min(treeState.rows - 1, vr.r1));
  const sel = (treeState.nodes || []).find((n) => n.id === treeSelectedNodeId) || null;
  const selLayoutCol = sel ? treeWorldToLayoutCol(sel.col) : null;
  const selLayoutRow = sel ? treeWorldToLayoutRow(sel.row) : null;
  const w = Math.max(size.w * zoom, wrap.clientWidth || 0);
  const h = Math.max(size.h * zoom, wrap.clientHeight || 0);
  const stepX = Math.max(1, Math.ceil(16 / (TREE_COL_W * zoom)));
  const stepY = Math.max(1, Math.ceil(14 / (TREE_ROW_H * zoom)));
  const key = [c0, c1, r0, r1, zoom, Math.round(w), Math.round(h), stepX, stepY,
    treeOriginCol(), treeOriginRow(),
    sel ? sel.col : '', sel ? sel.row : '', treeLaneSignature()].join(':');
  if (key !== treeLastRulerKey) {
    treeLastRulerKey = key;
    const xParts = [];
    for (let c = c0; c <= c1; c++) {
      const worldC = treeLayoutToWorldCol(c);
      const colName = treeLaneName('col', worldC);
      if (c % stepX !== 0 && !(selLayoutCol === c) && !colName) continue;
      const x = (TREE_PAD + c * TREE_COL_W + TREE_COL_W / 2) * zoom;
      const color = colName ? treeLaneColor(colName) : '';
      const label = treeWorldLabelCol(worldC);
      xParts.push(
        '<button type="button" class="tree-ruler-label' + (selLayoutCol === c ? ' is-active' : '') + (colName ? ' is-named' : '')
        + '" data-axis="col" data-index="' + worldC + '" title="' + (colName ? escapeHtmlText(colName) : ('列 ' + label))
        + '" style="left:' + x.toFixed(1) + 'px' + (color ? ';background:' + color : '') + '">' + label + '</button>'
      );
    }
    const yParts = [];
    for (let r = r0; r <= r1; r++) {
      const worldR = treeLayoutToWorldRow(r);
      const rowName = treeLaneName('row', worldR);
      if (r % stepY !== 0 && !(selLayoutRow === r) && !rowName) continue;
      const y = (TREE_PAD + r * TREE_ROW_H + TREE_ROW_H / 2) * zoom;
      const color = rowName ? treeLaneColor(rowName) : '';
      const label = treeWorldLabelRow(worldR);
      yParts.push(
        '<button type="button" class="tree-ruler-label' + (selLayoutRow === r ? ' is-active' : '') + (rowName ? ' is-named' : '')
        + '" data-axis="row" data-index="' + worldR + '" title="' + (rowName ? escapeHtmlText(rowName) : ('行 ' + label))
        + '" style="top:' + y.toFixed(1) + 'px' + (color ? ';background:' + color : '') + '">' + label + '</button>'
      );
    }
    const xTrack = '<div class="tree-ruler-track" style="width:' + Math.round(w) + 'px;height:100%">' + xParts.join('') + '</div>';
    const yTrack = '<div class="tree-ruler-track" style="width:100%;height:' + Math.round(h) + 'px">' + yParts.join('') + '</div>';
    top.innerHTML = xTrack;
    bottom.innerHTML = xTrack;
    left.innerHTML = yTrack;
    right.innerHTML = yTrack;
  }
  const sl = wrap.scrollLeft;
  const st = wrap.scrollTop;
  top.scrollLeft = sl;
  bottom.scrollLeft = sl;
  left.scrollTop = st;
  right.scrollTop = st;
  // 操作中はレーン帯の再生成もスキップ（スクロール追従のみ）
  if (!treeUiLite) treeRenderLanes();
}

/** ステージ寸法＋表示範囲の交点（treeCellCenter と同一座標で SVG 描画） */
function treeRenderRailsOnly() {
  if (!treeState) return;
  if (treeUiLite) {
    treeSyncRulerScrollOnly();
    return;
  }
  treeRenderRulers();
  const stage = document.getElementById('tree-stage');
  const railsSvg = document.getElementById('tree-rails-svg');
  const edgesSvg = document.getElementById('tree-edges-svg');
  const layer = document.getElementById('tree-nodes-layer');
  const size = treeStageSize();
  const vr = treeViewportCellRange();
  const c0 = Math.max(0, Math.min(treeState.cols - 1, vr.c0));
  const c1 = Math.max(c0, Math.min(treeState.cols - 1, vr.c1));
  const r0 = Math.max(0, Math.min(treeState.rows - 1, vr.r0));
  const r1 = Math.max(r0, Math.min(treeState.rows - 1, vr.r1));
  const occupied = new Set((treeState.nodes || []).map((n) =>
    treeWorldToLayoutCol(n.col) + ',' + treeWorldToLayoutRow(n.row)
  ));
  let occBits = '';
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      occBits += occupied.has(c + ',' + r) ? '1' : '0';
    }
  }
  const key = [treeState.cols, treeState.rows, treeOriginCol(), treeOriginRow(), size.w, size.h, c0, c1, r0, r1, occBits].join(':');
  if (key === treeLastRailsKey) return;
  treeLastRailsKey = key;

  if (stage) {
    stage.style.width = size.w + 'px';
    stage.style.height = size.h + 'px';
  }
  if (layer) {
    layer.style.width = size.w + 'px';
    layer.style.height = size.h + 'px';
  }
  [railsSvg, edgesSvg].forEach((svg) => {
    if (!svg) return;
    svg.setAttribute('width', String(size.w));
    svg.setAttribute('height', String(size.h));
    svg.setAttribute('viewBox', '0 0 ' + size.w + ' ' + size.h);
    svg.style.width = size.w + 'px';
    svg.style.height = size.h + 'px';
  });
  if (!railsSvg) return;
  const parts = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (occupied.has(c + ',' + r)) continue;
      const center = treeCellCenter(c, r);
      parts.push(
        '<circle class="tree-cross" cx="' + center.x.toFixed(1)
        + '" cy="' + center.y.toFixed(1)
        + '" r="6.5" data-col="' + c + '" data-row="' + r + '"></circle>'
      );
    }
  }
  railsSvg.innerHTML = parts.join('');
}

/** 空き交点のヒット（SVGサークルなし）。返す col/row は固有ワールド座標 */
function treeHitEmptyCellAt(clientX, clientY) {
  if (!treeState) return null;
  const pt = treeClientToStage(clientX, clientY);
  const layoutCol = Math.round((pt.x - TREE_PAD - TREE_COL_W / 2) / TREE_COL_W);
  const layoutRow = Math.round((pt.y - TREE_PAD - TREE_ROW_H / 2) / TREE_ROW_H);
  if (layoutCol < 0 || layoutRow < 0 || layoutCol >= treeState.cols || layoutRow >= treeState.rows) return null;
  const center = treeCellCenter(layoutCol, layoutRow);
  if (Math.hypot(pt.x - center.x, pt.y - center.y) > 16) return null;
  const worldCol = treeLayoutToWorldCol(layoutCol);
  const worldRow = treeLayoutToWorldRow(layoutRow);
  if (treeNodeAtWorld(worldCol, worldRow)) return null;
  return { col: worldCol, row: worldRow };
}

function treeDedupePathPts(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 0.75 && Math.abs(prev.y - p.y) < 0.75) continue;
    // 直前の折れが一直線なら中間点を省略
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = prev;
      const colinear =
        (Math.abs(a.x - b.x) < 0.75 && Math.abs(b.x - p.x) < 0.75) ||
        (Math.abs(a.y - b.y) < 0.75 && Math.abs(b.y - p.y) < 0.75);
      if (colinear) out.pop();
    }
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function treeNodeRect(node, pad) {
  pad = Number(pad) || 0;
  const center = treeNodeCenter(node);
  const hw = TREE_NODE_W / 2 + pad;
  const hh = TREE_NODE_H / 2 + pad;
  return {
    left: center.x - hw,
    right: center.x + hw,
    top: center.y - hh,
    bottom: center.y + hh
  };
}

function treeSegIntersectsRect(a, b, rect) {
  const isVertical = Math.abs(a.x - b.x) < 0.75;
  const isHorizontal = Math.abs(a.y - b.y) < 0.75;
  if (!isVertical && !isHorizontal) return false;
  if (isVertical) {
    const x = a.x;
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    return x > rect.left && x < rect.right && y2 > rect.top && y1 < rect.bottom;
  }
  const y = a.y;
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  return y > rect.top && y < rect.bottom && x2 > rect.left && x1 < rect.right;
}

function treePathIntersectsNodes(pts, ignoreIds) {
  if (!treeState || !Array.isArray(treeState.nodes) || !pts || pts.length < 2) return false;
  const ignores = new Set((ignoreIds || []).map((id) => String(id)));
  for (let n = 0; n < treeState.nodes.length; n++) {
    const node = treeState.nodes[n];
    if (!node || ignores.has(String(node.id))) continue;
    const rect = treeNodeRect(node, 10);
    for (let i = 1; i < pts.length; i++) {
      if (treeSegIntersectsRect(pts[i - 1], pts[i], rect)) return true;
    }
  }
  return false;
}

function treePathLength(pts) {
  if (!pts || pts.length < 2) return Infinity;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

// ===== 配線ルーター =====
// 目的: ノードの内側を通らず、他の線とも交差・重複しにくい直交経路を選ぶ。
// 方針: 列／行から作った格子（レーン）の上でダイクストラ探索し、
//       「距離 + 曲がり + 他線との交差 + 他線との重なり」が最小の道を採用する。
const TREE_ROUTE_MARGIN = 14;          // ノード外周からの離隔
const TREE_ROUTE_STUB = 14;            // 接続点から出る助走の長さ
const TREE_ROUTE_BEND_COST = 24;       // 曲がり1回あたり
const TREE_ROUTE_CROSS_COST = 460;     // 他の線と交差する
const TREE_ROUTE_OVERLAP_COST = 1600;  // 他の線と同じレーンを重なって走る
const TREE_ROUTE_LANE_EPS = 5;         // 同一レーンとみなす距離
const TREE_ROUTE_SPAN = 2;             // 探索範囲を端点の外側へ広げるマス数
const TREE_ROUTE_GUARD = 240000;       // 探索の打ち切り

function treeRouteObstacles() {
  const rects = [];
  const nodes = (treeState && treeState.nodes) || [];
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i]) continue;
    rects.push(treeNodeRect(nodes[i], TREE_ROUTE_MARGIN - 2));
  }
  return rects;
}

/** 経路を「水平／垂直セグメント」の一覧にする（両端のスタブは除く） */
function treeRouteSegments(pts, skipStubs) {
  const segs = [];
  if (!pts || pts.length < 2) return segs;
  const start = skipStubs ? 1 : 0;
  const end = skipStubs ? pts.length - 2 : pts.length - 1;
  for (let i = start; i < end; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    if (Math.abs(a.y - b.y) < 0.5) {
      segs.push({ horiz: true, lane: a.y, a: Math.min(a.x, b.x), b: Math.max(a.x, b.x) });
    } else if (Math.abs(a.x - b.x) < 0.5) {
      segs.push({ horiz: false, lane: a.x, a: Math.min(a.y, b.y), b: Math.max(a.y, b.y) });
    }
  }
  return segs;
}

/** 端点まわりの列・行から、配線に使えるレーン（格子線）を作る */
function treeRouteGrid(a1, b1) {
  const cols = (treeState && treeState.cols) || TREE_DEFAULT_COLS;
  const rows = (treeState && treeState.rows) || TREE_DEFAULT_ROWS;
  const colOf = (x) => Math.max(0, Math.min(cols - 1, Math.floor((x - TREE_PAD) / TREE_COL_W)));
  const rowOf = (y) => Math.max(0, Math.min(rows - 1, Math.floor((y - TREE_PAD) / TREE_ROW_H)));
  const c0 = Math.max(0, Math.min(colOf(a1.x), colOf(b1.x)) - TREE_ROUTE_SPAN);
  const c1 = Math.min(cols - 1, Math.max(colOf(a1.x), colOf(b1.x)) + TREE_ROUTE_SPAN);
  const r0 = Math.max(0, Math.min(rowOf(a1.y), rowOf(b1.y)) - TREE_ROUTE_SPAN);
  const r1 = Math.min(rows - 1, Math.max(rowOf(a1.y), rowOf(b1.y)) + TREE_ROUTE_SPAN);
  const xs = [];
  const ys = [];
  const add = (arr, v) => {
    if (!Number.isFinite(v)) return;
    for (let i = 0; i < arr.length; i++) {
      if (Math.abs(arr[i] - v) < 1) return;
    }
    arr.push(v);
  };
  const offX = TREE_NODE_W / 2 + TREE_ROUTE_MARGIN;
  const offY = TREE_NODE_H / 2 + TREE_ROUTE_MARGIN;
  for (let c = c0; c <= c1; c++) {
    const cx = TREE_PAD + c * TREE_COL_W + TREE_COL_W / 2;
    add(xs, TREE_PAD + c * TREE_COL_W);
    add(xs, cx - offX);
    add(xs, cx);
    add(xs, cx + offX);
  }
  add(xs, TREE_PAD + (c1 + 1) * TREE_COL_W);
  for (let r = r0; r <= r1; r++) {
    const cy = TREE_PAD + r * TREE_ROW_H + TREE_ROW_H / 2;
    add(ys, TREE_PAD + r * TREE_ROW_H);
    add(ys, cy - offY);
    add(ys, cy);
    add(ys, cy + offY);
  }
  add(ys, TREE_PAD + (r1 + 1) * TREE_ROW_H);
  add(xs, a1.x);
  add(xs, b1.x);
  add(ys, a1.y);
  add(ys, b1.y);
  xs.sort((p, q) => p - q);
  ys.sort((p, q) => p - q);
  return { xs, ys };
}

function treeRouteNearestIndex(arr, v) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** 格子上の最小コスト経路。dir: 0=水平, 1=垂直 */
function treeRouteSolve(a1, b1, startDir, goalDir, occ, obstacles) {
  const grid = treeRouteGrid(a1, b1);
  const xs = grid.xs;
  const ys = grid.ys;
  const nx = xs.length;
  const ny = ys.length;
  if (nx < 2 || ny < 2) return null;
  const sxi = treeRouteNearestIndex(xs, a1.x);
  const syi = treeRouteNearestIndex(ys, a1.y);
  const txi = treeRouteNearestIndex(xs, b1.x);
  const tyi = treeRouteNearestIndex(ys, b1.y);
  const cells = nx * ny;
  const states = cells * 2;
  const dist = new Float64Array(states).fill(Infinity);
  const prev = new Int32Array(states).fill(-1);
  const done = new Uint8Array(states);
  const hCost = new Float64Array(cells).fill(-1);
  const vCost = new Float64Array(cells).fill(-1);

  // 障害物と既存配線は数値配列に展開しておく（内側ループを軽くするため）
  const obsN = obstacles.length;
  const obsL = new Float64Array(obsN);
  const obsR = new Float64Array(obsN);
  const obsT = new Float64Array(obsN);
  const obsB = new Float64Array(obsN);
  for (let i = 0; i < obsN; i++) {
    obsL[i] = obstacles[i].left;
    obsR[i] = obstacles[i].right;
    obsT[i] = obstacles[i].top;
    obsB[i] = obstacles[i].bottom;
  }
  const occN = occ.length;
  const occH = new Uint8Array(occN);
  const occLane = new Float64Array(occN);
  const occA = new Float64Array(occN);
  const occB = new Float64Array(occN);
  for (let i = 0; i < occN; i++) {
    occH[i] = occ[i].horiz ? 1 : 0;
    occLane[i] = occ[i].lane;
    occA[i] = occ[i].a;
    occB[i] = occ[i].b;
  }

  // horiz: lane=y, lo..hi=x / vert: lane=x, lo..hi=y
  const segWeight = (horiz, lane, lo, hi) => {
    for (let i = 0; i < obsN; i++) {
      if (horiz) {
        if (lane > obsT[i] && lane < obsB[i] && hi > obsL[i] && lo < obsR[i]) return Infinity;
      } else if (lane > obsL[i] && lane < obsR[i] && hi > obsT[i] && lo < obsB[i]) {
        return Infinity;
      }
    }
    let w = hi - lo;
    const self = horiz ? 1 : 0;
    for (let i = 0; i < occN; i++) {
      if (occH[i] === self) {
        const d = occLane[i] - lane;
        if (d > TREE_ROUTE_LANE_EPS || d < -TREE_ROUTE_LANE_EPS) continue;
        const ov = Math.min(hi, occB[i]) - Math.max(lo, occA[i]);
        if (ov > 3) w += TREE_ROUTE_OVERLAP_COST;
      } else if (occLane[i] > lo + 1 && occLane[i] < hi - 1 && lane > occA[i] + 1 && lane < occB[i] - 1) {
        w += TREE_ROUTE_CROSS_COST;
      }
    }
    return w;
  };

  const hWeight = (xi, yi) => {
    const k = yi * nx + xi;
    if (hCost[k] < 0) hCost[k] = segWeight(true, ys[yi], xs[xi], xs[xi + 1]);
    return hCost[k];
  };
  const vWeight = (xi, yi) => {
    const k = yi * nx + xi;
    if (vCost[k] < 0) vCost[k] = segWeight(false, xs[xi], ys[yi], ys[yi + 1]);
    return vCost[k];
  };

  const heapC = [];
  const heapS = [];
  const heapPush = (c, s) => {
    heapC.push(c);
    heapS.push(s);
    let i = heapC.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapC[p] <= heapC[i]) break;
      const tc = heapC[p]; heapC[p] = heapC[i]; heapC[i] = tc;
      const ts = heapS[p]; heapS[p] = heapS[i]; heapS[i] = ts;
      i = p;
    }
  };
  const heapPop = () => {
    const topS = heapS[0];
    const lastC = heapC.pop();
    const lastS = heapS.pop();
    if (heapC.length) {
      heapC[0] = lastC;
      heapS[0] = lastS;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heapC.length && heapC[l] < heapC[m]) m = l;
        if (r < heapC.length && heapC[r] < heapC[m]) m = r;
        if (m === i) break;
        const tc = heapC[m]; heapC[m] = heapC[i]; heapC[i] = tc;
        const ts = heapS[m]; heapS[m] = heapS[i]; heapS[i] = ts;
        i = m;
      }
    }
    return topS;
  };

  const startState = (syi * nx + sxi) * 2 + (startDir ? 1 : 0);
  const goalCell = tyi * nx + txi;
  dist[startState] = 0;
  heapPush(0, startState);
  let guard = 0;

  while (heapC.length) {
    const st = heapPop();
    if (done[st]) continue;
    done[st] = 1;
    if (done[goalCell * 2] && done[goalCell * 2 + 1]) break;
    if (++guard > TREE_ROUTE_GUARD) break;
    const cell = st >> 1;
    const dir = st & 1;
    const xi = cell % nx;
    const yi = (cell - xi) / nx;
    const base = dist[st];
    const relax = (nxi, nyi, ndir, w) => {
      if (!Number.isFinite(w)) return;
      const ns = (nyi * nx + nxi) * 2 + ndir;
      if (done[ns]) return;
      const nc = base + w + (ndir === dir ? 0 : TREE_ROUTE_BEND_COST);
      if (nc < dist[ns] - 0.0001) {
        dist[ns] = nc;
        prev[ns] = st;
        heapPush(nc, ns);
      }
    };
    if (xi + 1 < nx) relax(xi + 1, yi, 0, hWeight(xi, yi));
    if (xi > 0) relax(xi - 1, yi, 0, hWeight(xi - 1, yi));
    if (yi + 1 < ny) relax(xi, yi + 1, 1, vWeight(xi, yi));
    if (yi > 0) relax(xi, yi - 1, 1, vWeight(xi, yi - 1));
  }

  let goalState = -1;
  let goalCost = Infinity;
  for (let d = 0; d < 2; d++) {
    const st = (tyi * nx + txi) * 2 + d;
    const c = dist[st] + (d === (goalDir ? 1 : 0) ? 0 : TREE_ROUTE_BEND_COST);
    if (c < goalCost) {
      goalCost = c;
      goalState = st;
    }
  }
  if (goalState < 0 || !Number.isFinite(goalCost)) return null;

  const pts = [];
  let cur = goalState;
  let steps = 0;
  while (cur >= 0 && steps++ < states) {
    const cell = cur >> 1;
    const xi = cell % nx;
    const yi = (cell - xi) / nx;
    pts.push({ x: xs[xi], y: ys[yi] });
    cur = prev[cur];
  }
  pts.reverse();
  return { pts, cost: goalCost };
}

/**
 * 1本ぶんの経路点。occ に既存の線のセグメントを渡すと、それを避けて通る。
 */
function treeRouteEdgePoints(fromNode, toNode, fromSide, toSide, occ) {
  if (!fromNode || !toNode) return [];
  if (!fromSide || !toSide) {
    const inferred = treeInferSides(fromNode, toNode);
    fromSide = fromSide || inferred.fromSide;
    toSide = toSide || inferred.toSide;
  }
  fromSide = treeNormalizeSide(fromSide) || 'r';
  toSide = treeNormalizeSide(toSide) || 'l';

  const a0 = treePortPoint(fromNode, fromSide);
  const b0 = treePortPoint(toNode, toSide);
  const a1 = treePortOut(a0, fromSide, TREE_ROUTE_STUB);
  const b1 = treePortOut(b0, toSide, TREE_ROUTE_STUB);
  const startDir = (fromSide === 'l' || fromSide === 'r') ? 0 : 1;
  const goalDir = (toSide === 'l' || toSide === 'r') ? 0 : 1;

  const solved = treeRouteSolve(a1, b1, startDir, goalDir, occ || [], treeRouteObstacles());
  let mid;
  if (solved && solved.pts && solved.pts.length >= 2) {
    mid = solved.pts;
  } else {
    // 保険: 経路が見つからないときは単純なL字
    mid = startDir === 0
      ? [a1, { x: b1.x, y: a1.y }, b1]
      : [a1, { x: a1.x, y: b1.y }, b1];
  }
  return treeDedupePathPts([a0].concat(mid, [b0]));
}

function treeEdgePathPoints(fromNode, toNode, fromSide, toSide) {
  return treeRouteEdgePoints(fromNode, toNode, fromSide, toSide, []);
}

function treePointsToPath(pts) {
  if (!pts || !pts.length) return '';
  return pts.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.y).join(' ');
}

function treePointsToRoundedPath(pts, radius) {
  if (!pts || !pts.length) return '';
  if (pts.length <= 2) return treePointsToPath(pts);
  const r = Math.max(0, Number(radius) || 0);
  if (r < 0.5) return treePointsToPath(pts);
  let d = 'M ' + pts[0].x + ' ' + pts[0].y;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 0.01 || len2 < 0.01) {
      d += ' L ' + curr.x + ' ' + curr.y;
      continue;
    }
    const cut = Math.min(r, len1 * 0.5, len2 * 0.5);
    const inX = curr.x - (v1x / len1) * cut;
    const inY = curr.y - (v1y / len1) * cut;
    const outX = curr.x + (v2x / len2) * cut;
    const outY = curr.y + (v2y / len2) * cut;
    d += ' L ' + inX + ' ' + inY;
    d += ' Q ' + curr.x + ' ' + curr.y + ' ' + outX + ' ' + outY;
  }
  const last = pts[pts.length - 1];
  d += ' L ' + last.x + ' ' + last.y;
  return d;
}

function treeArrowHeadPath(tip, back, size) {
  const s = size == null ? 9 : size;
  const dx = tip.x - back.x;
  const dy = tip.y - back.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const baseX = tip.x - ux * s;
  const baseY = tip.y - uy * s;
  const px = -uy * s * 0.46;
  const py = ux * s * 0.46;
  return 'M ' + tip.x + ' ' + tip.y
    + ' L ' + (baseX + px) + ' ' + (baseY + py)
    + ' L ' + (baseX - px) + ' ' + (baseY - py)
    + ' Z';
}

function treeEdgePath(fromNode, toNode, fromSide, toSide, opts) {
  opts = opts || {};
  const pts = opts.pts || treeEdgePathPoints(fromNode, toNode, fromSide, toSide);
  const withArrow = opts.arrow !== false;
  if (!withArrow || pts.length < 2) return treePointsToRoundedPath(pts, 12);
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const arrowLen = 9;
  const segLen = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
  const cut = Math.min(arrowLen, Math.max(0, segLen - 2));
  const t = cut / segLen;
  const base = {
    x: tip.x - (tip.x - prev.x) * t,
    y: tip.y - (tip.y - prev.y) * t
  };
  const linePts = pts.slice(0, -1).concat([base]);
  return {
    line: treePointsToRoundedPath(linePts, 12),
    head: treeArrowHeadPath(tip, prev, arrowLen)
  };
}

/**
 * すべての接続を順番にルーティングする。
 * 先に確定した線のセグメントを占有情報として渡すことで、
 * 後の線が交差・重なりを避けて通るようになる。
 */
function treeBuildAllEdgeRoutes() {
  if (!treeState) return [];
  const nodeById = new Map(treeState.nodes.map((n) => [n.id, n]));
  const order = new Map((treeState.edges || []).map((e, i) => [e.id, i]));
  const pending = [];
  (treeState.edges || []).forEach((e) => {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to) return;
    const fromSide = treeNormalizeSide(e.fromSide) || 'r';
    const toSide = treeNormalizeSide(e.toSide) || 'l';
    const a = treePortPoint(from, fromSide);
    const b = treePortPoint(to, toSide);
    pending.push({
      edge: e,
      from,
      to,
      fromSide,
      toSide,
      span: Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    });
  });
  // 短い線から確定させると、長い線が迂回しやすくなる
  pending.sort((p, q) => (p.span - q.span) || ((order.get(p.edge.id) || 0) - (order.get(q.edge.id) || 0)));

  const routes = [];
  const occ = [];
  pending.forEach((p) => {
    const pts = treeRouteEdgePoints(p.from, p.to, p.fromSide, p.toSide, occ);
    treeRouteSegments(pts, true).forEach((s) => occ.push(s));
    routes.push({ edge: p.edge, from: p.from, to: p.to, fromSide: p.fromSide, toSide: p.toSide, pts });
  });
  routes.sort((a, b) => (order.get(a.edge.id) || 0) - (order.get(b.edge.id) || 0));
  treeLastRoutes = routes;
  return routes;
}

function treeEdgeSvgHtml(edge, fromNode, toNode, prePts) {
  if (!fromNode || !toNode) return '';
  const isLine = treeNormalizeEdgeStyle(edge.style) === 'line';
  const sel = edge.id === treeSelectedEdgeId ? ' is-selected' : '';
  const fromSide = treeNormalizeSide(edge.fromSide) || 'r';
  const toSide = treeNormalizeSide(edge.toSide) || 'l';
  if (isLine) {
    const d = treeEdgePath(fromNode, toNode, fromSide, toSide, { arrow: false, pts: prePts });
    return '<g class="tree-edge-group' + sel + ' is-line" data-edge-id="' + edge.id + '">'
      + '<path class="tree-edge' + sel + ' is-line" data-edge-id="' + edge.id + '" d="' + d + '"></path>'
      + '</g>';
  }
  const geo = treeEdgePath(fromNode, toNode, fromSide, toSide, { arrow: true, pts: prePts });
  return '<g class="tree-edge-group' + sel + '" data-edge-id="' + edge.id + '">'
    + '<path class="tree-edge' + sel + '" data-edge-id="' + edge.id + '" d="' + geo.line + '"></path>'
    + '<path class="tree-edge-head" d="' + geo.head + '"></path>'
    + '</g>';
}

function treeClearLinkPreview() {
  const prev = document.getElementById('tree-link-preview');
  if (!prev) return;
  prev.classList.add('hidden');
  prev.setAttribute('d', '');
}

function treeShowLinkPreview(fromNode, fromSide, toX, toY) {
  const prev = document.getElementById('tree-link-preview');
  if (!prev || !fromNode) return;
  const a0 = treePortPoint(fromNode, fromSide);
  const a1 = treePortOut(a0, fromSide, 12);
  const previewPts = treeDedupePathPts([a0, a1, { x: toX, y: toY }]);
  prev.setAttribute('d', treePointsToRoundedPath(previewPts, 10));
  prev.classList.toggle('is-line', treeGetDrawStyle() === 'line');
  prev.classList.remove('hidden');
}

function treeFindEdgeByPort(nodeId, side) {
  if (!treeState || !nodeId) return null;
  side = treeNormalizeSide(side);
  const selected = treeSelectedEdgeId
    ? treeState.edges.find((e) => e.id === treeSelectedEdgeId)
    : null;
  if (selected) {
    if (selected.from === nodeId && (!side || selected.fromSide === side)) return { edge: selected, end: 'from' };
    if (selected.to === nodeId && (!side || selected.toSide === side)) return { edge: selected, end: 'to' };
    if (selected.from === nodeId) return { edge: selected, end: 'from' };
    if (selected.to === nodeId) return { edge: selected, end: 'to' };
  }
  if (!side) return null;
  for (let i = 0; i < treeState.edges.length; i++) {
    const e = treeState.edges[i];
    if (e.from === nodeId && e.fromSide === side) return { edge: e, end: 'from' };
    if (e.to === nodeId && e.toSide === side) return { edge: e, end: 'to' };
  }
  return null;
}

function treeApplyEdgeRebind(edgeId, end, nodeId, side) {
  if (!treeState) return false;
  const edge = treeState.edges.find((e) => e.id === edgeId);
  if (!edge) return false;
  side = treeNormalizeSide(side);
  nodeId = String(nodeId || '');
  if (!side || !nodeId) return false;
  const nextFrom = end === 'from' ? nodeId : edge.from;
  const nextTo = end === 'to' ? nodeId : edge.to;
  if (nextFrom === nextTo) {
    setTreeHint('始点と終点に同じノードは指定できません');
    return false;
  }
  const nextFromSide = end === 'from' ? side : edge.fromSide;
  const nextToSide = end === 'to' ? side : edge.toSide;
  treePushUndoSnapshot();
  // 完全に同一（from/to＋両ポート）の別線があるときだけ、そちらに寄せて重複を解消。
  // ポートが違えば別の線として残す（勝手に上書きしない）。
  const dup = treeState.edges.find((e) =>
    e.id !== edge.id && e.from === nextFrom && e.to === nextTo
    && e.fromSide === nextFromSide && e.toSide === nextToSide
  );
  if (dup) {
    treeState.edges = treeState.edges.filter((e) => e.id !== edge.id);
  } else {
    if (end === 'from') {
      edge.from = nodeId;
      edge.fromSide = side;
    } else {
      edge.to = nodeId;
      edge.toSide = side;
    }
  }
  // 確定後は選択を外す。残すと次の点タップがまたつなぎ直しになる。
  treeSelectedEdgeId = null;
  treeSelectedNodeId = null;
  treePortTap = null;
  treeEdgeRebind = null;
  treeEdgeRebindPending = null;
  scheduleTreeSave();
  renderTree();
  setTreeHint('つなぎ直しました（' + TREE_SIDE_LABEL[side] + '）。次は点どうしで新規接続');
  return true;
}

function treeCreateEdge(fromId, fromSide, toId, toSide) {
  if (!treeState || !fromId || !toId || fromId === toId) return false;
  fromSide = treeNormalizeSide(fromSide);
  toSide = treeNormalizeSide(toSide);
  if (!fromSide || !toSide) return false;

  // 完全に同一（from/to＋両ポート）の接続だけ重複扱い。
  // 同じ2ノード間でもポート（辺）が違えば別の線として共存させる
  // （既存の線を上書きしない＝つなぎ直しは線を選択してから行う）。
  const existing = treeState.edges.find((ed) =>
    ed.from === fromId && ed.to === toId
    && ed.fromSide === fromSide && ed.toSide === toSide
  );
  if (existing) {
    setTreeHint('同じ接続はすでにあります');
    // 選択は残さない（次の点がつなぎ直しになるのを防ぐ）
    treeSelectedEdgeId = null;
    renderTree();
    return false;
  }

  const style = treeGetDrawStyle();
  treePushUndoSnapshot();
  const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  treeState.edges.push({
    id,
    from: fromId,
    to: toId,
    fromSide,
    toSide,
    style
  });
  // 確定直後は選択を外す。選択のままだと次の点タップが端のつなぎ直しになってしまう。
  // つなぎ直しは「線をタップして選択 → 端の点を動かす」で行う。
  treeSelectedEdgeId = null;
  treeSelectedNodeId = null;
  treePortTap = null;
  treeEdgeRebind = null;
  treeEdgeRebindPending = null;
  scheduleTreeSave();
  setTreeHint(style === 'line'
    ? ('線を追加（' + TREE_SIDE_LABEL[fromSide] + ' — ' + TREE_SIDE_LABEL[toSide] + '）。次は点どうしで新規接続')
    : ('矢印を追加（' + TREE_SIDE_LABEL[fromSide] + ' → ' + TREE_SIDE_LABEL[toSide] + '）。次は点どうしで新規接続'));
  renderTree();
  return true;
}

function treeUpdatePortActiveClass() {
  document.querySelectorAll('.tree-port.is-active').forEach((el) => el.classList.remove('is-active'));
  if (treePortTap) {
    const sel = `.tree-node[data-node-id="${treePortTap.nodeId}"] .tree-port-${treePortTap.side}`;
    const port = document.querySelector(sel);
    if (port) port.classList.add('is-active');
  }
  if (treeEdgeRebind && treeSelectedEdgeId) {
    const edge = treeState.edges.find((e) => e.id === treeSelectedEdgeId);
    if (edge) {
      const nodeId = treeEdgeRebind.end === 'from' ? edge.from : edge.to;
      const side = treeEdgeRebind.end === 'from' ? edge.fromSide : edge.toSide;
      const sel = `.tree-node[data-node-id="${nodeId}"] .tree-port-${side}`;
      const port = document.querySelector(sel);
      if (port) port.classList.add('is-active');
    }
  } else if (treeEdgeRebindPending) {
    const edge = treeState.edges.find((e) => e.id === treeEdgeRebindPending.edgeId);
    if (edge) {
      const nodeId = treeEdgeRebindPending.end === 'from' ? edge.from : edge.to;
      const side = treeEdgeRebindPending.end === 'from' ? edge.fromSide : edge.toSide;
      const sel = `.tree-node[data-node-id="${nodeId}"] .tree-port-${side}`;
      const port = document.querySelector(sel);
      if (port) port.classList.add('is-active');
    }
  }
}

function treeNodesForRender() {
  const nodes = treeState && treeState.nodes ? treeState.nodes : [];
  if (nodes.length <= TREE_NODE_VIRTUALIZE_AT) return nodes;
  const vr = treeViewportCellRange();
  const pad = 2;
  return nodes.filter((n) => {
    if (!n) return false;
    if (n.id === treeSelectedNodeId) return true;
    const lc = treeWorldToLayoutCol(n.col);
    const lr = treeWorldToLayoutRow(n.row);
    return lc >= vr.c0 - pad && lc <= vr.c1 + pad && lr >= vr.r0 - pad && lr <= vr.r1 + pad;
  });
}

function renderTree() {
  if (!treeState) return;
  const d = treeDom();
  const stage = d.stage || document.getElementById('tree-stage');
  const railsSvg = d.rails || document.getElementById('tree-rails-svg');
  const edgesG = document.getElementById('tree-edges-g');
  const layer = d.layer || document.getElementById('tree-nodes-layer');
  if (!stage || !railsSvg || !edgesG || !layer) return;

  treeEnsureCanvasBounds({ apply: false });
  treeLastRailsKey = '';

  const size = treeStageSize();
  stage.style.width = size.w + 'px';
  stage.style.height = size.h + 'px';
  layer.style.width = size.w + 'px';
  layer.style.height = size.h + 'px';

  [railsSvg, d.edges || document.getElementById('tree-edges-svg')].forEach((svg) => {
    if (!svg) return;
    svg.setAttribute('width', String(size.w));
    svg.setAttribute('height', String(size.h));
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
    svg.style.width = size.w + 'px';
    svg.style.height = size.h + 'px';
  });

  treeRenderRailsOnly();

  const routes = treeBuildAllEdgeRoutes();
  edgesG.innerHTML = routes.map((r) =>
    treeEdgeSvgHtml(r.edge, r.from, r.to, r.pts)
  ).join('');

  const frag = document.createDocumentFragment();
  treeNodesForRender().forEach((n) => {
    const center = treeNodeCenter(n);
    const el = document.createElement('div');
    el.className = 'tree-node'
      + (n.id === treeSelectedNodeId ? ' is-selected' : '')
      + (n.accent ? ' is-accent' : '');
    el.dataset.nodeId = n.id;
    el.style.left = (center.x - TREE_NODE_W / 2) + 'px';
    el.style.top = (center.y - TREE_NODE_H / 2) + 'px';
    el.style.width = TREE_NODE_W + 'px';
    el.style.height = TREE_NODE_H + 'px';
    el.style.minHeight = TREE_NODE_H + 'px';
    el.style.maxHeight = TREE_NODE_H + 'px';

    const label = document.createElement('span');
    label.className = 'tree-node-label';
    label.textContent = n.label;
    el.appendChild(label);

    TREE_PORT_SIDES.forEach((side) => {
      const port = document.createElement('button');
      port.type = 'button';
      port.className = 'tree-port tree-port-' + side
        + (treePortTap && treePortTap.nodeId === n.id && treePortTap.side === side ? ' is-active' : '');
      port.dataset.side = side;
      port.title = TREE_SIDE_LABEL[side] + 'から矢印';
      port.setAttribute('aria-label', TREE_SIDE_LABEL[side] + 'の接続点');
      el.appendChild(port);
    });

    frag.appendChild(el);
    treeFitNodeLabel(label);
  });
  layer.innerHTML = '';
  layer.appendChild(frag);
  if (treeUiLite) treeApplyZoomTransform({ sizeOnly: true });
  else treeApplyZoomTransform();
  treeUpdateLinkStyleButton();
  treeUpdateHistoryButtons();
}

function treeFitNodeLabel(labelEl) {
  if (!labelEl) return 14;
  const text = String(labelEl.textContent || '');
  const availW = Math.max(24, TREE_NODE_W - 20);
  const availH = Math.max(24, TREE_NODE_H - 20);
  labelEl.style.width = availW + 'px';
  labelEl.style.maxWidth = availW + 'px';
  labelEl.style.lineHeight = '1.15';
  labelEl.style.whiteSpace = 'normal';
  labelEl.style.wordBreak = 'break-word';
  labelEl.style.overflowWrap = 'anywhere';
  // 文字数から即決（scrollWidth 二分探索は全ノード描画で致命的に重い）
  const len = text.trim().length;
  let best = 16;
  if (!len) best = 16;
  else if (len <= 6) best = 18;
  else if (len <= 10) best = 15;
  else if (len <= 16) best = 13;
  else if (len <= 24) best = 11;
  else if (len <= 36) best = 10;
  else best = 8;
  labelEl.style.fontSize = best + 'px';
  return best;
}

/** 操作中用の簡易 L字経路（ダイクストラなし） */
function treeSimpleEdgePoints(fromNode, toNode, fromSide, toSide) {
  const STUB = 14;
  const a0 = treePortPoint(fromNode, fromSide);
  const b0 = treePortPoint(toNode, toSide);
  const a1 = treePortOut(a0, fromSide, STUB);
  const b1 = treePortOut(b0, toSide, STUB);
  const fromH = fromSide === 'l' || fromSide === 'r';
  if (fromH) return treeDedupePathPts([a0, a1, { x: b1.x, y: a1.y }, b1, b0]);
  return treeDedupePathPts([a0, a1, { x: a1.x, y: b1.y }, b1, b0]);
}

/** 既存 SVG path を更新。集合が変わったときだけ innerHTML を作り直す */
function treeApplyRoutesToDom(routes) {
  const edgesG = document.getElementById('tree-edges-g');
  if (!edgesG) return;
  const groups = edgesG.querySelectorAll(':scope > .tree-edge-group');
  const byId = new Map();
  groups.forEach((g) => byId.set(g.getAttribute('data-edge-id'), g));
  let canPatch = groups.length === routes.length;
  if (canPatch) {
    for (let i = 0; i < routes.length; i++) {
      if (!byId.has(routes[i].edge.id)) { canPatch = false; break; }
    }
  }
  if (canPatch) {
    routes.forEach((r) => {
      const g = byId.get(r.edge.id);
      if (!g) return;
      const isLine = treeNormalizeEdgeStyle(r.edge.style) === 'line';
      const sel = r.edge.id === treeSelectedEdgeId;
      g.classList.toggle('is-selected', sel);
      g.classList.toggle('is-line', isLine);
      if (isLine) {
        const d = treeEdgePath(r.from, r.to, r.fromSide, r.toSide, { arrow: false, pts: r.pts });
        const path = g.querySelector('.tree-edge');
        if (path) {
          path.setAttribute('d', d);
          path.classList.toggle('is-selected', sel);
          path.classList.add('is-line');
        }
        const head = g.querySelector('.tree-edge-head');
        if (head) head.remove();
      } else {
        const geo = treeEdgePath(r.from, r.to, r.fromSide, r.toSide, { arrow: true, pts: r.pts });
        const path = g.querySelector('.tree-edge');
        if (path) {
          path.setAttribute('d', geo.line);
          path.classList.toggle('is-selected', sel);
          path.classList.remove('is-line');
        }
        let head = g.querySelector('.tree-edge-head');
        if (!head) {
          head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          head.setAttribute('class', 'tree-edge-head');
          g.appendChild(head);
        }
        head.setAttribute('d', geo.head);
      }
    });
    return;
  }
  edgesG.innerHTML = routes.map((r) =>
    treeEdgeSvgHtml(r.edge, r.from, r.to, r.pts)
  ).join('');
}

function treeRefreshEdgesOnly(opts) {
  opts = opts || {};
  if (!treeState) return;
  const live = opts.live || treeLiveRouting;
  if (live) {
    const nodeById = new Map(treeState.nodes.map((n) => [n.id, n]));
    const routes = [];
    (treeState.edges || []).forEach((e) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      if (!from || !to) return;
      const fromSide = treeNormalizeSide(e.fromSide) || 'r';
      const toSide = treeNormalizeSide(e.toSide) || 'l';
      routes.push({
        edge: e,
        from,
        to,
        fromSide,
        toSide,
        pts: treeSimpleEdgePoints(from, to, fromSide, toSide)
      });
    });
    treeLastRoutes = routes;
    treeApplyRoutesToDom(routes);
    treeEdgesDirty = true;
    return;
  }
  const routes = treeBuildAllEdgeRoutes();
  treeApplyRoutesToDom(routes);
  treeEdgesDirty = false;
}

/** ドラッグ中は毎フレーム1回。live=true なら簡易配線 */
function treeScheduleEdgeRefresh(live) {
  if (live == null) live = treeLiveRouting;
  if (treeEdgeRefreshRaf) return;
  treeEdgeRefreshRaf = requestAnimationFrame(() => {
    treeEdgeRefreshRaf = 0;
    treeRefreshEdgesOnly({ live: !!live });
  });
}

function treeFinalizeEdgesIfDirty() {
  if (!treeEdgesDirty && !treeLiveRouting) return;
  treeLiveRouting = false;
  treeRefreshEdgesOnly({ live: false });
}

/** 選択状態だけ DOM に反映（全再描画しない） */
function treeUpdateSelectionDom() {
  document.querySelectorAll('#tree-nodes-layer .tree-node').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.nodeId === treeSelectedNodeId);
  });
  document.querySelectorAll('#tree-edges-g .tree-edge-group').forEach((g) => {
    const id = g.getAttribute('data-edge-id');
    const sel = id === treeSelectedEdgeId;
    g.classList.toggle('is-selected', sel);
    const path = g.querySelector('.tree-edge');
    if (path) path.classList.toggle('is-selected', sel);
  });
  treeUpdatePortActiveClass();
  treeUpdateLinkStyleButton();
  treeRenderRulers();
}

function treeAddNodeAt(col, row, label, opts) {
  opts = opts || {};
  let historyPushed = false;
  const ensureHistory = () => {
    if (historyPushed) return;
    treePushUndoSnapshot();
    historyPushed = true;
  };
  // col/row は固有ワールド座標
  const occupied = treeNodeAtWorld(col, row);
  if (occupied) {
    if (opts.strict) {
      setTreeHint('この交点にはすでにノードがあります');
      return null;
    }
    let placed = false;
    for (let r = 0; r < treeState.rows && !placed; r++) {
      for (let c = 0; c < treeState.cols && !placed; c++) {
        const wc = treeLayoutToWorldCol(c);
        const wr = treeLayoutToWorldRow(r);
        if (!treeNodeAtWorld(wc, wr)) {
          col = wc; row = wr; placed = true;
        }
      }
    }
    if (!placed) {
      ensureHistory();
      treeEnsureCanvasBounds({
        includeCol: treeState.cols + TREE_EDGE_BUFFER,
        includeRow: 0,
        apply: true,
        rerender: true
      });
      let layoutCol = treeState.cols - TREE_EDGE_BUFFER - 1;
      let layoutRow = 0;
      col = treeLayoutToWorldCol(layoutCol);
      row = treeLayoutToWorldRow(layoutRow);
      while (treeNodeAtWorld(col, row)) {
        layoutRow += 1;
        row = treeLayoutToWorldRow(layoutRow);
        if (layoutRow >= treeState.rows) {
          treeEnsureCanvasBounds({ includeRow: treeState.rows + TREE_EDGE_BUFFER, apply: true, rerender: true });
        }
      }
    }
  } else {
    treeEnsureCanvasBounds({
      includeCol: treeWorldToLayoutCol(col),
      includeRow: treeWorldToLayoutRow(row),
      apply: true,
      rerender: false
    });
  }
  ensureHistory();
  const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  treeState.nodes.push({
    id,
    label: label || '新しいノード',
    col,
    row,
    accent: false
  });
  treeSelectedNodeId = id;
  treeSelectedEdgeId = null;
  treePortTap = null;
  scheduleTreeSave();
  renderTree();
  setTreeHint('ノード追加。名前を入力（外側クリックまたはEnterで確定）');
  if (opts.edit !== false && (label == null || opts.edit === true)) {
    requestAnimationFrame(() => {
      if (treeFindNode(id)) treeEditNodeLabel(id);
    });
  }
  return id;
}

function isTreeMemoDrawerOpen() {
  const mode = document.getElementById('tree-mode');
  return !!(mode && mode.classList.contains('is-memo-open'));
}

function openTreeMemoDrawer() {
  if (!isTreeMemoDrawerOpen() && typeof pushAppNavLocation === 'function' && typeof getAppLocationKey === 'function') {
    pushAppNavLocation(getAppLocationKey());
  }
  const mode = document.getElementById('tree-mode');
  const drawer = document.getElementById('tree-memo-drawer');
  const backdrop = document.getElementById('tree-memo-backdrop');
  if (!mode) return;
  mode.classList.add('is-memo-open');
  if (drawer) drawer.setAttribute('aria-hidden', 'false');
  if (backdrop) backdrop.setAttribute('aria-hidden', 'false');
  paintTreeMemoBlocks();
  setTreeHint('ブロックをタップしてノード挿入');
}

function closeTreeMemoDrawer() {
  const mode = document.getElementById('tree-mode');
  const drawer = document.getElementById('tree-memo-drawer');
  const backdrop = document.getElementById('tree-memo-backdrop');
  if (mode) mode.classList.remove('is-memo-open');
  if (drawer) drawer.setAttribute('aria-hidden', 'true');
  if (backdrop) backdrop.setAttribute('aria-hidden', 'true');
  treeMemoPaintToken += 1;
  if (document.getElementById('tree-mode') && document.getElementById('tree-mode').classList.contains('active')) {
    treeResetInteractionHint();
  }
}

function toggleTreeMemoDrawer() {
  if (isTreeMemoDrawerOpen()) closeTreeMemoDrawer();
  else openTreeMemoDrawer();
}

function getTreeMemoEntries() {
  if (typeof getCheckBlocksEntries === 'function') {
    try { return getCheckBlocksEntries() || []; } catch (_) {}
  }
  const raw = typeof getLocalInputHistory === 'function' ? (getLocalInputHistory() || []) : [];
  return raw
    .filter((e) => e && String(e.content || '').trim())
    .slice()
    .sort((a, b) => {
      const ta = typeof getSearchTimestampMs === 'function' ? getSearchTimestampMs(a) : new Date(a.timestamp || 0).getTime();
      const tb = typeof getSearchTimestampMs === 'function' ? getSearchTimestampMs(b) : new Date(b.timestamp || 0).getTime();
      return (tb || 0) - (ta || 0);
    });
}

function createTreeMemoCard(entry) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tree-memo-card';
  const time = document.createElement('div');
  time.className = 'tree-memo-card-time';
  time.textContent = typeof formatInputHistoryTime === 'function'
    ? formatInputHistoryTime(entry.timestamp)
    : (entry.timestamp || '');
  const body = document.createElement('div');
  body.className = 'tree-memo-card-body';
  body.textContent = String(entry.content || '');
  btn.appendChild(time);
  btn.appendChild(body);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    treeInsertMemoAsNode(entry);
  });
  return btn;
}

function paintTreeMemoBlocks() {
  const list = document.getElementById('tree-memo-list');
  const countEl = document.getElementById('tree-memo-count');
  if (!list) return;
  const token = ++treeMemoPaintToken;
  const entries = getTreeMemoEntries();
  if (countEl) countEl.textContent = `${entries.length}件`;
  list.innerHTML = '';
  if (!entries.length) {
    list.innerHTML = '<div class="tree-memo-empty">まだ登録チェックはありません<br><span style="font-size:0.7rem;opacity:0.8">DUMPするとここに表示されます</span></div>';
    return;
  }
  let idx = 0;
  const appendChunk = () => {
    if (token !== treeMemoPaintToken) return;
    const frag = document.createDocumentFragment();
    const end = Math.min(idx + TREE_MEMO_PAINT_CHUNK, entries.length);
    for (; idx < end; idx++) {
      frag.appendChild(createTreeMemoCard(entries[idx]));
    }
    list.appendChild(frag);
    if (idx < entries.length) {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(appendChunk, { timeout: 48 });
      } else {
        setTimeout(appendChunk, 0);
      }
    }
  };
  appendChunk();
}

function treeViewportCenterCell() {
  const wrap = document.getElementById('tree-canvas-wrap');
  if (!wrap || !treeState) return { col: 0, row: 0 };
  const zoom = treeGetZoom() || 1;
  const x = (wrap.scrollLeft + Math.max(wrap.clientWidth, 1) / 2) / zoom;
  const y = (wrap.scrollTop + Math.max(wrap.clientHeight, 1) / 2) / zoom;
  let col = Math.round((x - TREE_PAD - TREE_COL_W / 2) / TREE_COL_W);
  let row = Math.round((y - TREE_PAD - TREE_ROW_H / 2) / TREE_ROW_H);
  col = Math.max(0, Math.min(Math.max((treeState.cols || 1) - 1, 0), col));
  row = Math.max(0, Math.min(Math.max((treeState.rows || 1) - 1, 0), row));
  return { col, row };
}

function treeMemoLabelFromEntry(entry) {
  const raw = String((entry && entry.content) || '').replace(/\r\n/g, '\n').trim();
  const firstLine = (raw.split('\n')[0] || '').trim();
  const label = (firstLine || 'メモ').slice(0, 40);
  return label || 'メモ';
}

function treeInsertMemoAsNode(entry) {
  if (!treeState) {
    setTreeHint('ツリーを開いてから挿入してください');
    return null;
  }
  if (!entry || !String(entry.content || '').trim()) {
    setTreeHint('空のメモは挿入できません');
    return null;
  }
  const cell = treeViewportCenterCell();
  const label = treeMemoLabelFromEntry(entry);
  const id = treeAddNodeAt(cell.col, cell.row, label);
  if (id) setTreeHint('メモを挿入しました');
  return id;
}

function treeOnCrossPointerDown(e) {
  // 互換: 交差SVGはもう描かない。空き交点は座標ヒットで処理する
  if (!treeState) return;
  const hit = treeHitEmptyCellAt(e.clientX, e.clientY);
  if (!hit) return;
  e.preventDefault();
  e.stopPropagation();
  treePortTap = null;
  treeClearLinkPreview();
  treeAddNodeAt(hit.col, hit.row, null, { strict: true });
}

function treeDeleteSelection() {
  if (!treeState) return;
  if (treeSelectedEdgeId) {
    treePushUndoSnapshot();
    treeState.edges = treeState.edges.filter((e) => e.id !== treeSelectedEdgeId);
    treeSelectedEdgeId = null;
    scheduleTreeSave();
    renderTree();
    setTreeHint('矢印を削除しました');
    return;
  }
  if (treeSelectedNodeId) {
    treePushUndoSnapshot();
    const id = treeSelectedNodeId;
    treeState.nodes = treeState.nodes.filter((n) => n.id !== id);
    treeState.edges = treeState.edges.filter((e) => e.from !== id && e.to !== id);
    treeSelectedNodeId = null;
    if (treePortTap && treePortTap.nodeId === id) treePortTap = null;
    scheduleTreeSave();
    renderTree();
    setTreeHint('ノードを削除しました');
    return;
  }
  setTreeHint('削除するノードまたは矢印を選んでください');
}

function treeToggleAccent() {
  if (!treeSelectedNodeId) {
    setTreeHint('色を変えるノードを選んでください');
    return;
  }
  const n = treeFindNode(treeSelectedNodeId);
  if (!n) return;
  treePushUndoSnapshot();
  n.accent = !n.accent;
  scheduleTreeSave();
  const el = document.querySelector('#tree-nodes-layer .tree-node[data-node-id="' + n.id + '"]');
  if (el) el.classList.toggle('is-accent', !!n.accent);
  else renderTree();
}

function treeEditSelectedLabel() {
  if (!treeSelectedNodeId) {
    setTreeHint('先にノードを選んでから「名前編集」を押してください');
    return;
  }
  treeEditNodeLabel(treeSelectedNodeId);
}

function closeTreeInlineEdit(save) {
  if (!treeInlineEdit) return true;
  const edit = treeInlineEdit;
  const id = edit.nodeId;
  const n = id ? treeFindNode(id) : null;
  const nodeEl = edit.input && edit.input.parentNode;
  document.removeEventListener('pointerdown', treeOnDocumentPointerDownWhileEdit, true);
  if (save) {
    let label = String((edit.input && edit.input.value) || '').trim().slice(0, 40);
    if (!label) label = (n && n.label) || '新しいノード';
    if (n && n.label !== label) treePushUndoSnapshot();
    if (n) n.label = label;
    treeSelectedNodeId = id;
    scheduleTreeSave();
    treeInlineEdit = null;
    treeEditTargetId = null;
    renderTree();
    setTreeHint('名前を更新しました');
    treeMaybeSyncAfterIdle();
    return true;
  }
  if (nodeEl && nodeEl.classList) nodeEl.classList.remove('is-editing');
  if (edit.labelEl) {
    edit.labelEl.style.visibility = '';
    edit.labelEl.style.display = '';
  }
  if (edit.input && edit.input.parentNode) edit.input.parentNode.removeChild(edit.input);
  treeInlineEdit = null;
  treeEditTargetId = null;
  treeMaybeSyncAfterIdle();
  return true;
}

function treeOnDocumentPointerDownWhileEdit(e) {
  if (!treeInlineEdit) return;
  const input = treeInlineEdit.input;
  if (input && e.target && (e.target === input || (e.target.closest && e.target.closest('.tree-node-edit-input')))) {
    return;
  }
  closeTreeInlineEdit(true);
}

function treeEditNodeLabel(nodeId) {
  const n = treeFindNode(nodeId);
  if (!n) return;
  if (!closeTreeInlineEdit(true)) return;
  treeEditTargetId = nodeId;
  treeScrollNodeIntoView(nodeId);
  const nodeEl = document.querySelector(`.tree-node[data-node-id="${nodeId}"]`);
  const labelEl = nodeEl ? nodeEl.querySelector('.tree-node-label') : null;
  if (!nodeEl || !labelEl) return;
  nodeEl.classList.add('is-editing');
  const prevSize = labelEl.style.fontSize || window.getComputedStyle(labelEl).fontSize;
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 40;
  input.className = 'tree-node-edit-input';
  input.value = n.label || '';
  input.style.fontSize = prevSize;
  input.setAttribute('aria-label', 'ノード名を編集');
  const syncEditFit = () => {
    const probe = document.createElement('span');
    probe.className = 'tree-node-label';
    probe.textContent = input.value || ' ';
    probe.style.visibility = 'hidden';
    probe.style.position = 'absolute';
    probe.style.left = '-9999px';
    probe.style.top = '0';
    nodeEl.appendChild(probe);
    const px = treeFitNodeLabel(probe);
    if (probe.parentNode) probe.parentNode.removeChild(probe);
    input.style.setProperty('font-size', px + 'px', 'important');
  };
  input.addEventListener('input', syncEditFit);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      closeTreeInlineEdit(true);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      closeTreeInlineEdit(false);
    } else {
      ev.stopPropagation();
    }
  });
  input.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
  });
  input.addEventListener('blur', () => {
    // 外側クリックは document capture 側でも確定。blur は保険
    if (treeInlineEdit && treeInlineEdit.input === input) {
      closeTreeInlineEdit(true);
    }
  });
  nodeEl.appendChild(input);
  treeInlineEdit = { nodeId, input, labelEl };
  document.addEventListener('pointerdown', treeOnDocumentPointerDownWhileEdit, true);
  syncEditFit();
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
  setTreeHint('名前を編集中（外側クリックまたはEnterで確定 / Escでキャンセル）');
}

function closeTreeEditModal() {
  closeTreeInlineEdit(false);
  const modal = document.getElementById('tree-edit-modal');
  if (modal) modal.classList.add('hidden');
  treeEditTargetId = null;
}

function confirmTreeEditLabel() {
  if (treeInlineEdit) {
    closeTreeInlineEdit(true);
    return;
  }
  const input = document.getElementById('tree-edit-input');
  const id = treeEditTargetId;
  const n = id ? treeFindNode(id) : null;
  if (!n || !input) {
    closeTreeEditModal();
    return;
  }
  const label = String(input.value || '').trim().slice(0, 40);
  if (!label) {
    setTreeHint('名前を入力してください');
    input.focus();
    return;
  }
  n.label = label;
  treeSelectedNodeId = id;
  closeTreeEditModal();
  scheduleTreeSave();
  renderTree();
  setTreeHint('名前を更新しました');
}

function treePortFromPoint(clientX, clientY) {
  const els = (typeof document.elementsFromPoint === 'function')
    ? document.elementsFromPoint(clientX, clientY)
    : [document.elementFromPoint(clientX, clientY)].filter(Boolean);
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!el || !el.closest) continue;
    const port = el.classList && el.classList.contains('tree-port') ? el : el.closest('.tree-port');
    if (!port) continue;
    const nodeEl = port.closest('.tree-node');
    if (!nodeEl) continue;
    return { nodeId: nodeEl.dataset.nodeId, side: port.dataset.side, port, nodeEl };
  }
  // ズーム・タッチずれ対策: ステージ座標で最寄りポート
  if (!treeState || !treeState.nodes.length) return null;
  const pt = treeClientToStage(clientX, clientY);
  const zoom = treeGetZoom() || 1;
  const threshold = 16 / zoom;
  let best = null;
  let bestDist = threshold;
  for (let i = 0; i < treeState.nodes.length; i++) {
    const n = treeState.nodes[i];
    for (let s = 0; s < TREE_PORT_SIDES.length; s++) {
      const side = TREE_PORT_SIDES[s];
      const p = treePortPoint(n, side);
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        const nodeEl = document.querySelector(`.tree-node[data-node-id="${n.id}"]`);
        const port = nodeEl ? nodeEl.querySelector('.tree-port-' + side) : null;
        best = { nodeId: n.id, side, port, nodeEl };
      }
    }
  }
  return best;
}

function treeOnPortPointerDown(e) {
  const port = e.target.closest && e.target.closest('.tree-port');
  if (!port || !treeState) return false;
  e.preventDefault();
  e.stopPropagation();
  const nodeEl = port.closest('.tree-node');
  if (!nodeEl) return false;
  const id = nodeEl.dataset.nodeId;
  const side = treeNormalizeSide(port.dataset.side);
  treeDrag = null;
  treeEdgeRebind = null;

  // 端を選んだあとの2点目タップ → 付け替え確定
  if (treeEdgeRebindPending) {
    const ok = treeApplyEdgeRebind(
      treeEdgeRebindPending.edgeId,
      treeEdgeRebindPending.end,
      id,
      side
    );
    treeEdgeRebindPending = null;
    treePortTap = null;
    treeClearLinkPreview();
    if (!ok) treeUpdatePortActiveClass();
    return true;
  }

  // 選択中の線の端ノードの点 → その端のつなぎ直し開始（別の点へドラッグ／タップ）
  if (treeSelectedEdgeId) {
    const selected = treeState.edges.find((ed) => ed.id === treeSelectedEdgeId);
    if (selected) {
      if (selected.from === id || selected.to === id) {
        const end = selected.from === id ? 'from' : 'to';
        // 同じ端の別ポートをタップしたら即付け替え
        if (end === 'from' && selected.fromSide !== side) {
          treeApplyEdgeRebind(selected.id, 'from', id, side);
          treePortTap = null;
          treeClearLinkPreview();
          return true;
        }
        if (end === 'to' && selected.toSide !== side) {
          treeApplyEdgeRebind(selected.id, 'to', id, side);
          treePortTap = null;
          treeClearLinkPreview();
          return true;
        }
        // 今ついている点（または同じ端）からドラッグつなぎ直し
        treePortTap = null;
        treePortLink = null;
        treeEdgeRebindPending = { edgeId: selected.id, end };
        treeEdgeRebind = {
          edgeId: selected.id,
          end,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          moved: false
        };
        treeSelectedNodeId = null;
        try { port.setPointerCapture(e.pointerId); } catch (_) {}
        treeUpdatePortActiveClass();
        setTreeHint('つなぎ直し: 別の点へドラッグ／タップ');
        return true;
      }
      // 選択中の線がある状態で別ノードの点をタップした場合:
      // 通常は新規接続操作を優先し、Shift時のみ付け替えを実行
      if (e.shiftKey) {
        treeApplyEdgeRebind(selected.id, 'from', id, side);
        treePortTap = null;
        treeClearLinkPreview();
        return true;
      }
      treeSelectedEdgeId = null;
      treeEdgeRebindPending = null;
      treeClearLinkPreview();
    }
  }

  // 点タップは常に「新規追加」扱い（同じ点から複数接続を許可）
  // 付け替え編集は「線を選択してから」行う
  treeSelectedEdgeId = null;
  treeEdgeRebindPending = null;
  treeSelectedNodeId = id;

  if (treePortTap && (treePortTap.nodeId !== id || treePortTap.side !== side)) {
    treeCreateEdge(treePortTap.nodeId, treePortTap.side, id, side);
    treePortTap = null;
    treeClearLinkPreview();
    return true;
  }

  treePortTap = { nodeId: id, side };
  treePortLink = {
    fromId: id,
    fromSide: side,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    moved: false
  };
  try { port.setPointerCapture(e.pointerId); } catch (_) {}
  treeUpdatePortActiveClass();
  setTreeHint('別ノードの点へドラッグ／タップで接続');
  return true;
}

function treeDistPointToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function treeDistToPolyline(pt, pts) {
  if (!pts || pts.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = treeDistPointToSeg(pt.x, pt.y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    if (d < best) best = d;
  }
  return best;
}

function treeHitEdgeAt(clientX, clientY) {
  if (!treeState || !treeState.edges.length) return null;
  const pt = treeClientToStage(clientX, clientY);
  const zoom = treeGetZoom() || 1;
  const threshold = 12 / zoom;
  let best = null;
  let bestDist = threshold;
  // 描画済みの経路を使う（再ルーティングは重いので行わない）
  const routes = (treeLastRoutes && treeLastRoutes.length)
    ? treeLastRoutes
    : treeBuildAllEdgeRoutes();
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (!r || !r.edge) continue;
    const d = treeDistToPolyline(pt, r.pts);
    if (d < bestDist) {
      bestDist = d;
      best = r.edge;
    }
  }
  return best;
}

function treeSelectEdgeById(edgeId) {
  if (!edgeId) return;
  treeSelectedEdgeId = edgeId;
  treeSelectedNodeId = null;
  treePortTap = null;
  treeEdgeRebindPending = null;
  treeClearLinkPreview();
  setTreeHint('接続を選択中。端の点を別の点へドラッグ／タップで付け替え（Shiftで始点固定）');
  treeUpdateSelectionDom();
}

/** キャンバスのパンを開始する（空き地の左ドラッグ／どこでも右ドラッグ） */
function treeStartPan(e, button) {
  const wrap = document.getElementById('tree-canvas-wrap');
  if (!wrap) return false;
  treeEnterUiLite();
  treePan = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    scrollLeft: wrap.scrollLeft,
    scrollTop: wrap.scrollTop,
    moved: false,
    button: button == null ? 0 : button
  };
  try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
  wrap.classList.add('is-panning');
  return true;
}

/** ピンチ開始時など、進行中の操作を打ち切る */
function treeCancelActiveGestures() {
  const wrap = document.getElementById('tree-canvas-wrap');
  if (treePan) {
    treePan = null;
    if (wrap) wrap.classList.remove('is-panning');
  }
  if (treeDrag) {
    const el = treeDrag.el || document.querySelector(`.tree-node[data-node-id="${treeDrag.id}"]`);
    const n = treeFindNode(treeDrag.id);
    if (n && treeDrag.originCol != null && treeDrag.originRow != null) {
      n.col = treeDrag.originCol;
      n.row = treeDrag.originRow;
    }
    if (el) {
      el.classList.remove('is-dragging');
      if (n) treePlaceNodeEl(el, n);
    }
    treeDrag = null;
    treeLiveRouting = false;
    treeFinalizeEdgesIfDirty();
  }
  if (treePortLink) {
    treePortLink = null;
    treeClearLinkPreview();
  }
  if (treeEdgeRebind) {
    treeEdgeRebind = null;
    treeClearLinkPreview();
  }
  treeExitUiLite();
}

/**
 * キャプチャ段階で拾う入力:
 * - 右ボタンドラッグ（ノードの上でもキャンバス移動）
 * - 2本指ピンチ（全体の拡大縮小）
 */
function treeOnCanvasPointerDownCapture(e) {
  if (!treeState) return;
  if (e.pointerType === 'touch') {
    treeTouchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (treeTouchPoints.size === 2) {
      const pts = Array.from(treeTouchPoints.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      treeCancelActiveGestures();
      treePinch = { startDist: dist, startZoom: treeGetZoom() };
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  if (e.button === 2 || (e.buttons & 2) === 2) {
    if (treeStartPan(e, 2)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}

function treeOnCanvasPointerMoveCapture(e) {
  if (e.pointerType !== 'touch') return;
  if (!treeTouchPoints.has(e.pointerId)) return;
  treeTouchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!treePinch || treeTouchPoints.size < 2) return;
  e.preventDefault();
  e.stopPropagation();
  const pts = Array.from(treeTouchPoints.values());
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
  const midX = (pts[0].x + pts[1].x) / 2;
  const midY = (pts[0].y + pts[1].y) / 2;
  treeZoomTo(treePinch.startZoom * (dist / treePinch.startDist), midX, midY);
}

function treeOnCanvasPointerUpCapture(e) {
  if (e.pointerType !== 'touch') return;
  treeTouchPoints.delete(e.pointerId);
  if (treeTouchPoints.size < 2) {
    if (treePinch) {
      treePinch = null;
      treeScheduleGrowNearEdges();
      treeFlushDeferredSave();
    }
  }
}

function treeOnCanvasContextMenu(e) {
  // 右ドラッグ移動を邪魔しないようメニューは出さない
  e.preventDefault();
}

function treeOnCanvasPointerDown(e) {
  if (!treeState) return;
  if (treePinch) return;
  if (treePan && treePan.pointerId === e.pointerId) {
    // 右ドラッグは capture 段階で開始済み
    e.preventDefault();
    return;
  }
  const target = e.target;

  // 矢印は pointer-events:none なので、座標ヒットで選択
  if (!(target.closest && (target.closest('.tree-port') || target.closest('.tree-node')))) {
    const hitEdge = treeHitEdgeAt(e.clientX, e.clientY);
    if (hitEdge) {
      e.preventDefault();
      e.stopPropagation();
      treeSelectEdgeById(hitEdge.id);
      return;
    }
  }

  if (target.closest && target.closest('.tree-port')) return;
  if (target.closest && target.closest('.tree-node')) return;
  if (target.closest && target.closest('.tree-edge, .tree-edge-group')) return;

  // 空き交点（座標ヒット）— パン開始より優先
  const empty = treeHitEmptyCellAt(e.clientX, e.clientY);
  if (empty) {
    e.preventDefault();
    e.stopPropagation();
    treePortTap = null;
    treeClearLinkPreview();
    treeAddNodeAt(empty.col, empty.row, null, { strict: true });
    return;
  }

  // 空き地ドラッグでパレットをパン（コマンドバーは固定）
  if (treeStartPan(e, e.button)) e.preventDefault();
}

function treeOnCanvasPointerMove(e) {
  if (!treePan || treePan.pointerId !== e.pointerId) return;
  const wrap = treeDom().wrap;
  if (!wrap) return;
  const dx = e.clientX - treePan.startX;
  const dy = e.clientY - treePan.startY;
  if (Math.abs(dx) + Math.abs(dy) > 4) treePan.moved = true;
  if (!treePan.moved) return;
  wrap.scrollLeft = treePan.scrollLeft - dx;
  wrap.scrollTop = treePan.scrollTop - dy;
  treeScheduleRulerScrollSync();
  treeScheduleGrowNearEdges();
  e.preventDefault();
}

function treeOnCanvasPointerUp(e) {
  if (!treePan || treePan.pointerId !== e.pointerId) return;
  const wrap = document.getElementById('tree-canvas-wrap');
  const moved = !!treePan.moved;
  const button = treePan.button;
  treePan = null;
  if (wrap) {
    wrap.classList.remove('is-panning');
    try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  treeExitUiLite();
  treeFinalizeEdgesIfDirty();
  treeFlushDeferredSave();
  // 右ボタンは移動専用。選択状態には触れない
  if (button === 2) return;
  // ほぼ動かしていないタップは選択解除
  if (!moved) {
    treeSelectedNodeId = null;
    treeSelectedEdgeId = null;
    treePortTap = null;
    treeEdgeRebindPending = null;
    treeClearLinkPreview();
    treeUpdateSelectionDom();
  }
}

function treeOnKeyDown(e) {
  const mode = document.getElementById('tree-mode');
  if (!mode || !mode.classList.contains('active')) return;
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
  if (e.key === 'Escape' && isTreeMemoDrawerOpen()) {
    e.preventDefault();
    closeTreeMemoDrawer();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (e.shiftKey) treeRedo();
    else treeUndo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    treeRedo();
    return;
  }
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const modal = document.getElementById('tree-edit-modal');
  if (modal && !modal.classList.contains('hidden')) return;
  if (!treeSelectedNodeId && !treeSelectedEdgeId) return;
  e.preventDefault();
  treeDeleteSelection();
}

function treeOnNodePointerDown(e) {
  if (!treeState) return;
  if (e.target && e.target.closest && e.target.closest('.tree-node-edit-input')) return;
  const directPort = e.target.closest && e.target.closest('.tree-port');
  if (directPort) {
    treeOnPortPointerDown(e);
    return;
  }
  const nodeEl = e.target.closest('.tree-node');
  if (!nodeEl) {
    // タッチずれ対策: ノード外タップ時だけ最寄り接続点を補完
    const portHit = treePortFromPoint(e.clientX, e.clientY);
    if (portHit && portHit.port) {
      const fake = {
        preventDefault() { e.preventDefault(); },
        stopPropagation() { e.stopPropagation(); },
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        target: portHit.port
      };
      treeOnPortPointerDown(fake);
      try { portHit.port.setPointerCapture(e.pointerId); } catch (_) {}
    }
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const id = nodeEl.dataset.nodeId;
  treeSelectedEdgeId = null;
  treePortTap = null;
  treeEdgeRebindPending = null;
  treeClearLinkPreview();
  treeSelectedNodeId = id;
  const n = treeFindNode(id);
  if (!n) return;

  const now = Date.now();
  if (treeLastTap.id === id && (now - treeLastTap.at) < 560) {
    treeLastTap = { id: '', at: 0 };
    treeEditNodeLabel(id);
    return;
  }
  treeLastTap = { id, at: now };

  treeEnterUiLite();
  treeDrag = {
    id,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    originCol: n.col,
    originRow: n.row,
    moved: false,
    beforeState: treeCloneState(treeState),
    el: nodeEl
  };
  treeLiveRouting = true;
  try { nodeEl.setPointerCapture(e.pointerId); } catch (_) {}
  nodeEl.classList.add('is-dragging');
  treeSelectedNodeId = id;
  treeSelectedEdgeId = null;
  treeUpdateSelectionDom();
}

function treeOnNodePointerMove(e) {
  if (treeEdgeRebind && treeEdgeRebind.pointerId === e.pointerId) {
    if (Math.abs(e.clientX - treeEdgeRebind.startX) + Math.abs(e.clientY - treeEdgeRebind.startY) > 6) {
      treeEdgeRebind.moved = true;
    }
    const edge = treeState.edges.find((ed) => ed.id === treeEdgeRebind.edgeId);
    if (!edge) return;
    const fixedId = treeEdgeRebind.end === 'from' ? edge.to : edge.from;
    const fixedSide = treeEdgeRebind.end === 'from' ? edge.toSide : edge.fromSide;
    const fixed = treeFindNode(fixedId);
    if (!fixed) return;
    const pt = treeClientToStage(e.clientX, e.clientY);
    // 固定端からカーソルへプレビュー（向きは見た目用）
    if (treeEdgeRebind.end === 'from') {
      treeShowLinkPreview(fixed, fixedSide, pt.x, pt.y);
    } else {
      treeShowLinkPreview(fixed, fixedSide, pt.x, pt.y);
    }
    return;
  }
  if (treePortLink && treePortLink.pointerId === e.pointerId) {
    if (Math.abs(e.clientX - treePortLink.startX) + Math.abs(e.clientY - treePortLink.startY) > 6) {
      treePortLink.moved = true;
    }
    const from = treeFindNode(treePortLink.fromId);
    if (!from) return;
    const pt = treeClientToStage(e.clientX, e.clientY);
    treeShowLinkPreview(from, treePortLink.fromSide, pt.x, pt.y);
    return;
  }
  if (!treeDrag || treeDrag.pointerId !== e.pointerId) return;
  const n = treeFindNode(treeDrag.id);
  if (!n) return;
  if (Math.abs(e.clientX - treeDrag.startX) + Math.abs(e.clientY - treeDrag.startY) > 6) {
    treeDrag.moved = true;
  }
  if (!treeDrag.moved) return;
  const el = treeDrag.el || document.querySelector(`.tree-node[data-node-id="${n.id}"]`);
  const pt = treeClientToStage(e.clientX, e.clientY);
  // 半透明ゴーストとしてポインタに追従（他ノード・配線はドロップ時まで動かさない）
  // レイヤーに lite transform がある場合は打ち消してカーソル位置に合わせる
  if (el) {
    el.style.left = (pt.x - TREE_NODE_W / 2 - treeLiteOriginTx) + 'px';
    el.style.top = (pt.y - TREE_NODE_H / 2 - treeLiteOriginTy) + 'px';
  }
  const pos = treeSnapColRow(e.clientX, e.clientY);
  treeDrag.hoverCol = pos.col;
  treeDrag.hoverRow = pos.row;
}

function treeOnNodePointerUp(e) {
  if (treeEdgeRebind && treeEdgeRebind.pointerId === e.pointerId) {
    const reb = treeEdgeRebind;
    treeEdgeRebind = null;
    treeClearLinkPreview();
    try {
      const portEl = e.target.closest && e.target.closest('.tree-port');
      if (portEl) portEl.releasePointerCapture(e.pointerId);
    } catch (_) {}
    const hit = treePortFromPoint(e.clientX, e.clientY);
    if (hit) {
      const sameStart = (() => {
        const edge = treeState.edges.find((ed) => ed.id === reb.edgeId);
        if (!edge) return false;
        const startId = reb.end === 'from' ? edge.from : edge.to;
        const startSide = reb.end === 'from' ? edge.fromSide : edge.toSide;
        return hit.nodeId === startId && treeNormalizeSide(hit.side) === startSide;
      })();
      if (!sameStart) {
        treeApplyEdgeRebind(reb.edgeId, reb.end, hit.nodeId, hit.side);
        return;
      }
    }
    if (reb.moved) {
      treeEdgeRebindPending = null;
      setTreeHint('つなぎ直しをキャンセルしました');
    } else {
      treeEdgeRebindPending = { edgeId: reb.edgeId, end: reb.end };
      setTreeHint('付け替え先の点をタップ（またはドラッグ）');
    }
    treeUpdatePortActiveClass();
    renderTree();
    return;
  }

  if (treePortLink && treePortLink.pointerId === e.pointerId) {
    const link = treePortLink;
    treePortLink = null;
    treeClearLinkPreview();
    try {
      const portEl = e.target.closest && e.target.closest('.tree-port');
      if (portEl) portEl.releasePointerCapture(e.pointerId);
    } catch (_) {}

    const hit = treePortFromPoint(e.clientX, e.clientY);
    if (hit && (hit.nodeId !== link.fromId || hit.side !== link.fromSide)) {
      treeCreateEdge(link.fromId, link.fromSide, hit.nodeId, hit.side);
      treePortTap = null;
      return;
    }
    if (link.moved) {
      // ドラッグしたが着地できず → 始点キャンセル
      treePortTap = null;
      treeUpdatePortActiveClass();
      setTreeHint('接続をキャンセルしました');
      return;
    }
    // タップ: 始点を保持（次の点タップで接続）
    treePortTap = { nodeId: link.fromId, side: link.fromSide };
    treeUpdatePortActiveClass();
    setTreeHint('終点の点をタップしてください');
    return;
  }

  if (!treeDrag || treeDrag.pointerId !== e.pointerId) return;
  const nodeEl = treeDrag.el || (e.target.closest && e.target.closest('.tree-node'));
  if (nodeEl) {
    try { nodeEl.releasePointerCapture(e.pointerId); } catch (_) {}
    nodeEl.classList.remove('is-dragging');
  }
  const moved = !!treeDrag.moved;
  const beforeState = treeDrag.beforeState ? treeCloneState(treeDrag.beforeState) : null;
  const originCol = treeDrag.originCol;
  const originRow = treeDrag.originRow;
  const hoverCol = treeDrag.hoverCol;
  const hoverRow = treeDrag.hoverRow;
  const dragId = treeDrag.id;
  treeDrag = null;
  treeLiveRouting = false;

  const n = treeFindNode(dragId);
  if (moved && n) {
    const pos = (hoverCol != null && hoverRow != null)
      ? { col: hoverCol, row: hoverRow }
      : treeSnapColRow(e.clientX, e.clientY);
    if (pos.col === originCol && pos.row === originRow) {
      n.col = originCol;
      n.row = originRow;
      treePlaceNodeEl(nodeEl || document.querySelector(`.tree-node[data-node-id="${n.id}"]`), n);
      treeExitUiLite();
      treeFinalizeEdgesIfDirty();
      return;
    }
    const other = treeState.nodes.find((x) => x.id !== n.id && x.col === pos.col && x.row === pos.row);
    if (other) {
      // ドロップ時だけ入れ替え（ドラッグ中は他ノードを動かさない）
      other.col = originCol;
      other.row = originRow;
      const otherEl = document.querySelector(`.tree-node[data-node-id="${other.id}"]`);
      treePlaceNodeEl(otherEl, other);
    }
    n.col = pos.col;
    n.row = pos.row;
    treePlaceNodeEl(nodeEl || document.querySelector(`.tree-node[data-node-id="${n.id}"]`), n);
    if (beforeState) treePushUndoSnapshot(beforeState);
    treeExitUiLite();
    treeFinalizeEdgesIfDirty();
    treeFlushDeferredSave();
    setTreeHint(other ? 'ノードを入れ替えました' : 'ノードを移動しました');
    return;
  }
  if (n) {
    treePlaceNodeEl(nodeEl || document.querySelector(`.tree-node[data-node-id="${n.id}"]`), n);
  }
  treeExitUiLite();
  treeFinalizeEdgesIfDirty();
}

function treeOnEdgeClick(e) {
  // 互換: 直接クリックが来た場合
  const path = e.target.closest && e.target.closest('.tree-edge, .tree-edge-group');
  if (!path || path.id === 'tree-link-preview') return;
  e.stopPropagation();
  const id = path.getAttribute('data-edge-id');
  if (id) treeSelectEdgeById(id);
}

function bindTreeEvents() {
  if (treeBound) return;
  const wrap = document.getElementById('tree-canvas-wrap');
  const layer = document.getElementById('tree-nodes-layer');
  const edgesG = document.getElementById('tree-edges-g');
  const railsSvg = document.getElementById('tree-rails-svg');
  const editInput = document.getElementById('tree-edit-input');
  if (!wrap || !layer || !edgesG) return;
  const board = document.getElementById('tree-board');
  if (board) {
    board.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.tree-ruler-label');
      if (!btn || !board.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      treeRenameLane(btn.dataset.axis, Number(btn.dataset.index));
    });
  }
  wrap.addEventListener('pointerdown', treeOnCanvasPointerDownCapture, true);
  wrap.addEventListener('pointermove', treeOnCanvasPointerMoveCapture, true);
  wrap.addEventListener('pointerup', treeOnCanvasPointerUpCapture, true);
  wrap.addEventListener('pointercancel', treeOnCanvasPointerUpCapture, true);
  wrap.addEventListener('pointerdown', treeOnCanvasPointerDown);
  wrap.addEventListener('pointermove', treeOnCanvasPointerMove);
  wrap.addEventListener('pointerup', treeOnCanvasPointerUp);
  wrap.addEventListener('pointercancel', treeOnCanvasPointerUp);
  wrap.addEventListener('wheel', treeOnCanvasWheel, { passive: false });
  wrap.addEventListener('contextmenu', treeOnCanvasContextMenu);
  wrap.addEventListener('scroll', () => {
    treeScheduleGrowNearEdges();
    if (treeUiLite || treeIsInteractBusy()) {
      treeScheduleRulerScrollSync();
    } else {
      treeScheduleRailsRefresh();
    }
  }, { passive: true });
  layer.addEventListener('pointerdown', treeOnNodePointerDown);
  layer.addEventListener('pointermove', treeOnNodePointerMove);
  layer.addEventListener('pointerup', treeOnNodePointerUp);
  layer.addEventListener('pointercancel', treeOnNodePointerUp);
  edgesG.addEventListener('click', treeOnEdgeClick);
  document.addEventListener('keydown', treeOnKeyDown);
  if (editInput) {
    editInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        confirmTreeEditLabel();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        closeTreeEditModal();
      }
    });
  }
  treeBound = true;
}

function initTreeMode() {
  treeState = loadTreeState();
  treeResetHistory();
  if (!treeState.linkStyle) treeState.linkStyle = 'arrow';
  if (treeState.zoom == null) treeState.zoom = 1;
  treeRenderPaletteSelect();
  bindTreeEvents();
  // 端末内データを先に描画し、クラウド同期完了後に差し替える
  renderTree();
  treeUpdateLinkStyleButton();
  if (typeof startTreeLibraryPoll === 'function') startTreeLibraryPoll();
  const gen = ++treeInitSyncGen;
  setTreeHint('クラウドと同期中…');
  const sync = (typeof syncTreeLibrary === 'function')
    ? syncTreeLibrary({ render: true })
    : Promise.resolve();
  sync.then(() => {
    if (gen !== treeInitSyncGen) return;
    treeResetInteractionHint();
  }).catch(() => {
    if (gen !== treeInitSyncGen) return;
    setTreeHint('同期に失敗したため端末内データを表示中');
  });
}

// ----- GANTT -----

// ========== ガント ==========
const GANTT_FOLDER = '__SYSTEM__';
const GANTT_FILE = 'gantt';
const GANTT_CACHE_KEY = 'gantt_tasks_v1';
const GANTT_UPDATED_AT_KEY = 'gantt_updated_at';
const GANTT_DIRTY_KEY = 'gantt_dirty';
const GANTT_VIEW_DAYS = 21;
const GANTT_DAY_W = 36;
const GANTT_LABEL_W = 108;
const GANTT_COLORS = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#60a5fa'];

let ganttTasks = [];
let ganttViewStart = '';
let ganttDirty = false;
try { ganttDirty = localStorage.getItem(GANTT_DIRTY_KEY) === '1'; } catch (e) {}
let ganttSyncing = false;
let ganttSyncPromise = null;
let ganttCloudTimer = null;
let ganttLocalEditGen = 0;
let ganttLastLocalEditAt = 0;
const GANTT_EDIT_GRACE_MS = 6000;

function ganttPad2(n) {
  return String(n).padStart(2, '0');
}
function formatJaDateLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const week = ['日', '月', '火', '水', '木', '金', '土'];
  const dt = new Date(y, m - 1, d);
  return `${y}年${m}月${d}日（${week[dt.getDay()]}）`;
}
function ganttTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + ganttPad2(d.getMonth() + 1) + '-' + ganttPad2(d.getDate());
}
function ganttParseDate(str) {
  const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
function ganttDateToStr(dt) {
  return dt.getFullYear() + '-' + ganttPad2(dt.getMonth() + 1) + '-' + ganttPad2(dt.getDate());
}
function ganttAddDays(dateStr, days) {
  const dt = ganttParseDate(dateStr);
  if (!dt) return ganttTodayStr();
  dt.setDate(dt.getDate() + days);
  return ganttDateToStr(dt);
}
function ganttDiffDays(aStr, bStr) {
  const a = ganttParseDate(aStr);
  const b = ganttParseDate(bStr);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function ganttMondayOf(dateStr) {
  const dt = ganttParseDate(dateStr) || new Date();
  const day = dt.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + offset);
  return ganttDateToStr(dt);
}
function ganttNewId() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function normalizeGanttTask(raw, i) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim().slice(0, 60);
  let start = String(raw.start || '').slice(0, 10);
  let end = String(raw.end || '').slice(0, 10);
  if (!ganttParseDate(start)) start = ganttTodayStr();
  if (!ganttParseDate(end)) end = start;
  if (end < start) { const t = start; start = end; end = t; }
  const color = String(raw.color || GANTT_COLORS[(i || 0) % GANTT_COLORS.length]);
  return {
    id: String(raw.id || ganttNewId()),
    title: title || '無題',
    start,
    end,
    color,
    done: !!raw.done
  };
}
function normalizeGanttTasks(list) {
  return (Array.isArray(list) ? list : []).map(normalizeGanttTask).filter(Boolean)
    .sort((a, b) => (a.start + a.title).localeCompare(b.start + b.title));
}
function ganttNoteLocalEdit() {
  ganttLocalEditGen += 1;
  ganttLastLocalEditAt = Date.now();
  ganttDirty = true;
  try { localStorage.setItem(GANTT_DIRTY_KEY, '1'); } catch (e) {}
}
function ganttShouldProtectLocal() {
  if (ganttDirty) return true;
  if (ganttLocalEditGen > 0 && (Date.now() - ganttLastLocalEditAt) < GANTT_EDIT_GRACE_MS) return true;
  return false;
}
function ganttClearDirty() {
  ganttDirty = false;
  try { localStorage.removeItem(GANTT_DIRTY_KEY); } catch (e) {}
}
function loadGanttCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(GANTT_CACHE_KEY) || '[]');
    return normalizeGanttTasks(raw);
  } catch (e) {
    return [];
  }
}
function saveGanttCache(tasks, opts) {
  opts = opts || {};
  const next = normalizeGanttTasks(tasks);
  ganttTasks = next;
  try {
    localStorage.setItem(GANTT_CACHE_KEY, JSON.stringify(next));
    if (opts.touch !== false) {
      localStorage.setItem(GANTT_UPDATED_AT_KEY, new Date().toISOString());
      ganttNoteLocalEdit();
      if (opts.queueCloud !== false) queueGanttCloudSync();
    }
  } catch (e) {}
  return next;
}
function ganttLocalUpdatedAtMs() {
  const t = new Date(localStorage.getItem(GANTT_UPDATED_AT_KEY) || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}
async function ensureGanttStore() {
  await callAPI('addConfigRecord', { folder: GANTT_FOLDER, file: GANTT_FILE }, { silent: true });
}
function parseGanttSnapshot(row) {
  if (!row || row.content == null) return null;
  try {
    const payload = JSON.parse(row.content);
    const tasks = normalizeGanttTasks(payload && payload.tasks);
    const updatedAt = new Date(payload && payload.updatedAt).getTime();
    if (!Number.isFinite(updatedAt)) return null;
    return {
      cloudId: row.id != null ? String(row.id) : '',
      tasks,
      updatedAt,
      updatedAtIso: new Date(updatedAt).toISOString()
    };
  } catch (e) {
    return null;
  }
}
async function fetchCloudGanttSnapshot() {
  const items = await callAPI('getFolderFileItems', {
    folder: GANTT_FOLDER,
    file: GANTT_FILE
  }, { silent: true });
  if (!Array.isArray(items) || !items.length) return null;
  return items.map(parseGanttSnapshot).filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
}
function applyGanttFromCloud(tasks, updatedAtIso) {
  if (ganttShouldProtectLocal()) return false;
  ganttTasks = normalizeGanttTasks(tasks);
  try {
    localStorage.setItem(GANTT_CACHE_KEY, JSON.stringify(ganttTasks));
    if (updatedAtIso) localStorage.setItem(GANTT_UPDATED_AT_KEY, updatedAtIso);
  } catch (e) {}
  ganttClearDirty();
  return true;
}
async function publishGanttLibrary(prefetched) {
  await ensureGanttStore();
  if (!ganttTasks.length) ganttTasks = loadGanttCache();
  let localUpdatedAt = ganttLocalUpdatedAtMs();
  if (!localUpdatedAt) {
    const nowIso = new Date().toISOString();
    localStorage.setItem(GANTT_UPDATED_AT_KEY, nowIso);
    localUpdatedAt = new Date(nowIso).getTime();
  }
  const existing = prefetched === undefined ? await fetchCloudGanttSnapshot() : prefetched;
  if (existing && existing.updatedAt > localUpdatedAt && !ganttShouldProtectLocal()) {
    if (applyGanttFromCloud(existing.tasks, existing.updatedAtIso)) renderGanttAll();
    return;
  }
  const updatedAt = new Date(Math.max(localUpdatedAt, Date.now())).toISOString();
  localStorage.setItem(GANTT_UPDATED_AT_KEY, updatedAt);
  const payload = JSON.stringify({ v: 1, updatedAt, tasks: ganttTasks });
  const ops = [];
  if (existing && existing.cloudId) ops.push({ action: 'deleteDataRecord', id: existing.cloudId });
  ops.push({ action: 'addDataRecord', folder: GANTT_FOLDER, file: GANTT_FILE, content: payload });
  const res = await callBatch(ops, { silent: true });
  if (res && (res.error || res.success === false)) throw new Error('gantt_sync');
  ganttClearDirty();
}
function queueGanttCloudSync() {
  if (ganttCloudTimer) clearTimeout(ganttCloudTimer);
  ganttCloudTimer = setTimeout(() => {
    publishGanttLibrary().catch(() => {});
  }, 280);
}
async function syncGanttLibrary(options) {
  options = options || {};
  const wantRender = options.render !== false;
  if (ganttSyncPromise) {
    try { await ganttSyncPromise; } catch (_) {}
    if (wantRender) renderGanttAll();
    return ganttTasks;
  }
  ganttSyncing = true;
  ganttSyncPromise = (async () => {
    if (!ganttTasks.length) ganttTasks = loadGanttCache();
    const startGen = ganttLocalEditGen;
    let cloud = null;
    try { cloud = await fetchCloudGanttSnapshot(); } catch (_) { cloud = null; }
    const editedDuringFetch = ganttLocalEditGen !== startGen;
    if (ganttShouldProtectLocal() || editedDuringFetch) {
      if (ganttDirty || editedDuringFetch) {
        try { await publishGanttLibrary(cloud); } catch (_) {}
      }
      return ganttTasks;
    }
    const localUpdatedAt = ganttLocalUpdatedAtMs();
    if (cloud && cloud.updatedAt > localUpdatedAt) {
      if (applyGanttFromCloud(cloud.tasks, cloud.updatedAtIso) && wantRender) renderGanttAll();
    } else if (ganttDirty || (!cloud && ganttTasks.length)) {
      await publishGanttLibrary(cloud);
    } else if (!cloud) {
      ensureGanttStore().catch(() => {});
    }
    return ganttTasks;
  })();
  try {
    await ganttSyncPromise;
    if (wantRender) renderGanttAll();
    return ganttTasks;
  } catch (e) {
    return ganttTasks;
  } finally {
    ganttSyncPromise = null;
    ganttSyncing = false;
  }
}
function setGanttSyncStatus(text, cls) {
  const el = document.getElementById('gantt-sync-status');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'text-[10px] font-bold min-h-[14px] ' + (cls || 'text-cyan-600/80');
}
function initGanttMode() {
  ganttTasks = loadGanttCache();
  if (!ganttViewStart) ganttViewStart = ganttMondayOf(ganttTodayStr());
  const startEl = document.getElementById('gantt-new-start');
  const endEl = document.getElementById('gantt-new-end');
  const today = ganttTodayStr();
  if (startEl && !startEl.value) startEl.value = today;
  if (endEl && !endEl.value) endEl.value = ganttAddDays(today, 2);
  renderGanttAll();
  setGanttSyncStatus('同期中…');
  runInBackground(async () => {
    try {
      await syncGanttLibrary({ render: true });
      setGanttSyncStatus('同期済み', 'text-emerald-500/80');
      setTimeout(() => setGanttSyncStatus(''), 1600);
    } catch (_) {
      setGanttSyncStatus('オフライン（端末のみ）', 'text-amber-400/90');
    }
  });
}
function jumpGanttToToday() {
  ganttViewStart = ganttMondayOf(ganttTodayStr());
  renderGanttChart();
}
function shiftGanttView(days) {
  if (!ganttViewStart) ganttViewStart = ganttMondayOf(ganttTodayStr());
  ganttViewStart = ganttAddDays(ganttViewStart, days);
  renderGanttChart();
}
function renderGanttAll() {
  renderGanttChart();
  renderGanttTaskList();
}
function renderGanttChart() {
  const chart = document.getElementById('gantt-chart');
  const labelEl = document.getElementById('gantt-range-label');
  if (!chart) return;
  if (!ganttViewStart) ganttViewStart = ganttMondayOf(ganttTodayStr());
  const days = [];
  for (let i = 0; i < GANTT_VIEW_DAYS; i++) days.push(ganttAddDays(ganttViewStart, i));
  const viewEnd = days[days.length - 1];
  if (labelEl) {
    labelEl.textContent = formatJaDateLabel(ganttViewStart) + ' 〜 ' + formatJaDateLabel(viewEnd);
  }
  const today = ganttTodayStr();
  const width = GANTT_LABEL_W + days.length * GANTT_DAY_W;
  const headCells = days.map((d) => {
    const dt = ganttParseDate(d);
    const isToday = d === today;
    const isSun = dt && dt.getDay() === 0;
    const isSat = dt && dt.getDay() === 6;
    let cls = 'gantt-day-head';
    if (isToday) cls += ' is-today';
    if (isSun) cls += ' is-sun';
    if (isSat) cls += ' is-sat';
    return '<div class="' + cls + '" style="width:' + GANTT_DAY_W + 'px">'
      + (dt ? (dt.getMonth() + 1) + '/' + dt.getDate() : '') + '</div>';
  }).join('');

  const sorted = normalizeGanttTasks(ganttTasks);
  let body = '';
  if (!sorted.length) {
    body = '<div class="gantt-empty">タスクがありません。下のフォームから追加できます。</div>';
  } else {
    body = sorted.map((task) => {
      const startOff = ganttDiffDays(ganttViewStart, task.start);
      const endOff = ganttDiffDays(ganttViewStart, task.end);
      const barStart = Math.max(0, startOff);
      const barEnd = Math.min(GANTT_VIEW_DAYS - 1, endOff);
      const visible = barEnd >= 0 && barStart < GANTT_VIEW_DAYS;
      let barHtml = '';
      if (visible) {
        const left = GANTT_LABEL_W + barStart * GANTT_DAY_W + 3;
        const w = Math.max(GANTT_DAY_W - 6, (barEnd - barStart + 1) * GANTT_DAY_W - 6);
        barHtml = '<button type="button" class="gantt-bar' + (task.done ? ' is-done' : '')
          + '" style="left:' + left + 'px;width:' + w + 'px;background:' + task.color
          + '" data-id="' + escapeHtmlText(task.id) + '" title="'
          + escapeHtmlText(task.title + '（' + task.start + '〜' + task.end + '）') + '">'
          + escapeHtmlText(task.title) + '</button>';
      }
      const grid = days.map((d) => {
        let cls = 'gantt-day-cell';
        if (d === today) cls += ' is-today';
        return '<div class="' + cls + '" style="width:' + GANTT_DAY_W + 'px"></div>';
      }).join('');
      return '<div class="gantt-row' + (task.done ? ' is-done' : '') + '" data-id="'
        + escapeHtmlText(task.id) + '">'
        + '<button type="button" class="gantt-row-label" data-id="' + escapeHtmlText(task.id) + '">'
        + escapeHtmlText(task.title) + '</button>'
        + '<div class="gantt-row-track" style="width:' + (days.length * GANTT_DAY_W) + 'px">' + grid + '</div>'
        + barHtml + '</div>';
    }).join('');
  }

  chart.style.minWidth = width + 'px';
  chart.innerHTML = '<div class="gantt-head" style="width:' + width + 'px">'
    + '<div class="gantt-corner" style="width:' + GANTT_LABEL_W + 'px">タスク</div>'
    + headCells + '</div><div class="gantt-body">' + body + '</div>';

  chart.querySelectorAll('.gantt-bar, .gantt-row-label').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = el.getAttribute('data-id');
      if (id) editGanttTask(id);
    });
  });
}
function renderGanttTaskList() {
  const list = document.getElementById('gantt-task-list');
  if (!list) return;
  const sorted = normalizeGanttTasks(ganttTasks);
  if (!sorted.length) {
    list.innerHTML = '<div class="text-center py-4 text-cyan-700/80 text-xs font-bold border border-dashed border-cyan-900/40 rounded-xl">まだタスクがありません</div>';
    return;
  }
  list.innerHTML = '';
  sorted.forEach((task) => {
    const row = document.createElement('div');
    row.className = 'gantt-list-item' + (task.done ? ' is-done' : '');
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'gantt-list-main';
    main.innerHTML = '<span class="gantt-list-swatch" style="background:' + task.color + '"></span>'
      + '<span class="gantt-list-text"><span class="gantt-list-title">' + escapeHtmlText(task.title) + '</span>'
      + '<span class="gantt-list-dates">' + escapeHtmlText(task.start) + ' 〜 ' + escapeHtmlText(task.end) + '</span></span>';
    main.onclick = () => editGanttTask(task.id);
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'gantt-list-action';
    doneBtn.textContent = task.done ? '未完' : '完了';
    doneBtn.onclick = () => toggleGanttTaskDone(task.id);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'gantt-list-action is-danger';
    delBtn.textContent = '削除';
    delBtn.onclick = () => deleteGanttTask(task.id);
    row.appendChild(main);
    row.appendChild(doneBtn);
    row.appendChild(delBtn);
    list.appendChild(row);
  });
}
function addGanttTaskFromForm() {
  const titleEl = document.getElementById('gantt-new-title');
  const startEl = document.getElementById('gantt-new-start');
  const endEl = document.getElementById('gantt-new-end');
  const title = String(titleEl && titleEl.value || '').trim().slice(0, 60);
  const start = String(startEl && startEl.value || '').slice(0, 10);
  const end = String(endEl && endEl.value || '').slice(0, 10);
  if (!title) {
    alert('タスク名を入力してください');
    return;
  }
  if (!ganttParseDate(start) || !ganttParseDate(end)) {
    alert('開始日と終了日を指定してください');
    return;
  }
  const task = normalizeGanttTask({
    id: ganttNewId(),
    title,
    start,
    end,
    color: GANTT_COLORS[ganttTasks.length % GANTT_COLORS.length],
    done: false
  });
  saveGanttCache(ganttTasks.concat([task]));
  if (titleEl) titleEl.value = '';
  renderGanttAll();
  setGanttSyncStatus('保存しました', 'text-emerald-500/80');
}
function toggleGanttTaskDone(id) {
  const next = ganttTasks.map((t) => t.id === id ? { ...t, done: !t.done } : t);
  saveGanttCache(next);
  renderGanttAll();
}
function deleteGanttTask(id) {
  const task = ganttTasks.find((t) => t.id === id);
  if (!task) return;
  if (!confirm('「' + task.title + '」を削除しますか？')) return;
  saveGanttCache(ganttTasks.filter((t) => t.id !== id));
  renderGanttAll();
}
function editGanttTask(id) {
  const task = ganttTasks.find((t) => t.id === id);
  if (!task) return;
  const title = prompt('タスク名', task.title);
  if (title == null) return;
  const nextTitle = String(title).trim().slice(0, 60);
  if (!nextTitle) {
    alert('名前を空にはできません');
    return;
  }
  const start = prompt('開始日（YYYY-MM-DD）', task.start);
  if (start == null) return;
  const end = prompt('終了日（YYYY-MM-DD）', task.end);
  if (end == null) return;
  const updated = normalizeGanttTask({
    ...task,
    title: nextTitle,
    start: String(start).slice(0, 10),
    end: String(end).slice(0, 10)
  });
  if (!updated) {
    alert('日付の形式が不正です');
    return;
  }
  saveGanttCache(ganttTasks.map((t) => t.id === id ? updated : t));
  renderGanttAll();
}



// Ensure globals for onclick / schedule host
window.initTreeMode = initTreeMode;
window.initGanttMode = initGanttMode;
window.renderTree = renderTree;
window.renderGanttAll = renderGanttAll;
window.renderGanttChart = renderGanttChart;
window.jumpGanttToToday = jumpGanttToToday;
window.shiftGanttView = shiftGanttView;
window.addGanttTaskFromForm = addGanttTaskFromForm;
window.editGanttTask = editGanttTask;
window.toggleGanttTaskDone = toggleGanttTaskDone;
window.deleteGanttTask = deleteGanttTask;
window.treeSwitchPalette = treeSwitchPalette;
window.treeAddPalette = treeAddPalette;
window.treeRenamePalette = treeRenamePalette;
window.treeUndo = treeUndo;
window.treeRedo = treeRedo;
window.treeToggleLinkStyle = treeToggleLinkStyle;
window.treeToggleAccent = treeToggleAccent;
window.treeDeleteSelection = treeDeleteSelection;
window.toggleTreeMemoDrawer = toggleTreeMemoDrawer;
window.closeTreeMemoDrawer = closeTreeMemoDrawer;
window.isTreeMemoDrawerOpen = isTreeMemoDrawerOpen;
window.closeTreeEditModal = closeTreeEditModal;
window.confirmTreeEditLabel = confirmTreeEditLabel;

