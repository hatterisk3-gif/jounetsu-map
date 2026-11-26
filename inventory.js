/**
 * 在庫管理（📦 在庫ボタン）
 *   農薬・肥料・資材の登録（バーコード・カテゴリ・容量・個数・仕入れ先・最低在庫・発注個数・発注間隔・写真）、
 *   補充・使う・数えるの記録、最低在庫割れのアラートと発注メール。
 *   データは supabase-bridge.js の inventory_* アクション、メール送信は Edge Function order-mailer。
 */
(function (global) {
  'use strict';

  const BARCODE_PONYFILL_URL = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.5/dist/iife/ponyfill.min.js';
  const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
  const MAX_PHOTOS = 3;
  const PHOTO_MAX_SIDE = 1280;
  const ALL = '__all__';
  const LOW = '__low__';
  const OP_LABEL = { add: '補充', use: '使う', count: '数える' };
  const OP_ICON = { add: '＋', use: '−', count: '🔢' };
  const LOG_KIND = { '入庫': 'add', '初期入庫': 'add', '出庫': 'use', '棚卸': 'count', '発注': 'order' };
  const CATEGORY_ICON = { '農薬': '🧪', '肥料': '🌱', '資材': '🧰' };
  const VOL_UNITS = ['ml', 'L', 'cc', 'g', 'kg', 'm', '袋', '本', '個', '枚', '巻'];
  const STOCK_UNITS = ['本', '袋', '個', '箱', '缶', '枚', '巻', 'ケース', 'セット', 'kg', 'L'];
  const DEFAULT_MESSAGE = 'いつもお世話になっております。\n下記の資材の発注をお願いいたします。';
  // order-mailer が「送らなかった」だけで失敗ではない理由
  const ORDER_SKIP_REASONS = new Set(['not_low', 'auto_off', 'pending', 'interval', 'duplicate']);

  const state = {
    items: [],
    settings: null,
    loaded: false,
    loading: null,
    open: false,
    filter: ALL,
    query: '',
    lastLowIds: null,
    sheets: [],
    detailSheet: null
  };

  // ---------------------------------------------------------------- 小物
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const toHalfWidth = (s) => String(s == null ? '' : s)
    .replace(/[０-９Ａ-Ｚａ-ｚ．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  function num(v) {
    if (v === '' || v == null) return null;
    const s = toHalfWidth(v).replace(/[,，\s]/g, '');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const fmtNum = (n) => String(Math.round((Number(n) || 0) * 1000) / 1000);
  const isEmail = (s) => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(String(s || '').trim());
  const normBarcode = (s) => toHalfWidth(s).replace(/\s+/g, '');
  const unitOf = (it) => (it && it.stockUnit) || '個';
  const iconOfCategory = (c) => CATEGORY_ICON[c || ''] || '📦';
  const sameId = (a, b) => String(a) === String(b);
  const findItem = (id) => state.items.find((it) => sameId(it.id, id)) || null;
  const isHttpUrl = (u) => /^https?:\/\//i.test(String(u || ''));

  function normalizeQuery(s) {
    return toHalfWidth(s).toLowerCase()
      .replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
      .trim();
  }

  function parseTs(s) {
    const str = String(s || '').trim();
    if (!str) return 0;
    let t = Date.parse(str);
    if (!Number.isNaN(t)) return t;
    t = Date.parse(str.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1'));
    return Number.isNaN(t) ? 0 : t;
  }

  function jstParts(ms) {
    const d = new Date(ms + 9 * 3600000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
  }

  function fmtDate(v, withTime) {
    const ms = typeof v === 'number' ? v : parseTs(v);
    if (!ms) return '';
    const p = jstParts(ms);
    let s = (p.y !== jstParts(Date.now()).y ? `${p.y}/` : '') + `${p.mo}/${p.d}`;
    if (withTime) s += ` ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
    return s;
  }

  function todayKey() {
    const p = jstParts(Date.now());
    return `${p.y}-${p.mo}-${p.d}`;
  }

  function displayPhotoUrl(u) {
    const s = String(u || '');
    const m = s.match(/drive\.google\.com\/(?:.*[?&]id=|file\/d\/)([\w-]{20,})/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w600` : s;
  }

  function call(action, params) {
    if (typeof global.callGAS !== 'function') {
      return Promise.reject(new Error('通信の準備ができていません。ページを再読み込みしてください'));
    }
    return global.callGAS(action, params || {});
  }

  function userName() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser) return String(currentUser);
    } catch (e) { /* 未初期化 */ }
    try {
      return localStorage.getItem('passionMapUserName') || localStorage.getItem('pMapAdminName') || '';
    } catch (e) {
      return '';
    }
  }

  function isAdmin() {
    if (document.getElementById('btnAdminAllLogs')) return true;
    if (typeof global.isWorkerAdmin === 'function') {
      try { return !!global.isWorkerAdmin(); } catch (e) { /* 下の判定へ */ }
    }
    try {
      return (localStorage.getItem('passionMapUserRole') || '') === '管理者';
    } catch (e) {
      return false;
    }
  }

  function defaultSettings() {
    return {
      categories: ['農薬', '肥料', '資材'],
      suppliers: [],
      order: { autoSend: true, ccSelf: true, senderName: '', senderEmail: '', companyName: '', message: DEFAULT_MESSAGE }
    };
  }

  const settings = () => state.settings || defaultSettings();

  function senderReady() {
    const o = settings().order || {};
    return !!(String(o.senderName || '').trim() && isEmail(o.senderEmail));
  }

  function isLow(it) {
    const min = Number(it && it.minStock);
    return Number.isFinite(min) && min > 0 && (Number(it.stock) || 0) < min;
  }

  // supabase-bridge.js の invOrderTiming_ と同じ判定
  function orderTiming(it) {
    const lastOrderMs = parseTs(it && it.lastOrderAt);
    const lastRestockMs = parseTs(it && it.lastRestockAt);
    const days = Number(it && it.orderIntervalDays) || 0;
    const nextMs = lastOrderMs && days > 0 ? lastOrderMs + days * 86400000 : 0;
    return {
      lastOrderMs,
      nextMs,
      pending: lastOrderMs > 0 && lastOrderMs > lastRestockMs,
      waitInterval: !!(nextMs && Date.now() < nextMs)
    };
  }

  function allCategories() {
    const cats = (settings().categories || []).slice();
    state.items.forEach((it) => {
      if (it.category && cats.indexOf(it.category) < 0) cats.push(it.category);
    });
    return cats;
  }

  function upsertItem(item) {
    if (!item || !item.id) return;
    const i = state.items.findIndex((it) => sameId(it.id, item.id));
    if (i >= 0) state.items[i] = item;
    else state.items.push(item);
  }

  function removeItem(id) {
    state.items = state.items.filter((it) => !sameId(it.id, id));
  }

  // worker.js / admin.js の pdlMaterials（看板ごとの旧在庫画面）にも反映する
  function legacyMaterials() {
    try {
      if (typeof pdlMaterials !== 'undefined' && Array.isArray(pdlMaterials)) return pdlMaterials;
    } catch (e) { /* 未初期化 */ }
    return null;
  }

  function syncLegacy(changed, removedId) {
    const arr = legacyMaterials();
    if (!arr) return;
    if (removedId != null) {
      for (let i = arr.length - 1; i >= 0; i--) if (sameId(arr[i].id, removedId)) arr.splice(i, 1);
      return;
    }
    (changed ? [changed] : state.items).forEach((it) => {
      const cur = arr.find((m) => sameId(m.id, it.id));
      if (cur) Object.assign(cur, it);
      else arr.push(Object.assign({}, it));
    });
    if (!changed) {
      for (let i = arr.length - 1; i >= 0; i--) if (!findItem(arr[i].id)) arr.splice(i, 1);
    }
  }

  function nameSuggestions() {
    const names = [];
    const push = (n) => {
      const s = String(n || '').trim();
      if (s && names.indexOf(s) < 0) names.push(s);
    };
    state.items.forEach((it) => push(it.name));
    try {
      if (typeof pdlPesticides !== 'undefined' && Array.isArray(pdlPesticides)) pdlPesticides.forEach((p) => push(p && p.name));
    } catch (e) { /* 未初期化 */ }
    try {
      if (typeof pdlFertilizers !== 'undefined' && Array.isArray(pdlFertilizers)) pdlFertilizers.forEach((p) => push(p && p.name));
    } catch (e) { /* 未初期化 */ }
    return names.slice(0, 800);
  }

  function signList() {
    let polys = {};
    try {
      if (typeof loadedPolygons !== 'undefined' && loadedPolygons) polys = loadedPolygons;
    } catch (e) { /* 未初期化 */ }
    return Object.keys(polys)
      .map((k) => ({ key: k, p: polys[k] }))
      .filter(({ key, p }) => p && p.isMarker && key !== '__global__' && p.name)
      .map(({ key, p }) => ({ id: String(p.id || key), name: String(p.name), stock: /在庫|倉庫/.test(String(p.signFunction || '')) }))
      .sort((a, b) => (a.stock === b.stock ? a.name.localeCompare(b.name, 'ja') : (a.stock ? -1 : 1)));
  }

  function signOptionsHtml(currentId, currentName) {
    const signs = signList();
    let found = false;
    let html = '<option value="">（未設定）</option>';
    [['在庫・倉庫の看板', signs.filter((s) => s.stock)], ['その他の看板', signs.filter((s) => !s.stock)]].forEach(([label, list]) => {
      if (!list.length) return;
      html += `<optgroup label="${esc(label)}">`;
      list.forEach((s) => {
        const sel = (currentId && s.id === String(currentId)) || (!currentId && currentName && s.name === currentName);
        if (sel) found = true;
        html += `<option value="${esc(s.id)}" data-name="${esc(s.name)}"${sel ? ' selected' : ''}>${esc(s.name)}</option>`;
      });
      html += '</optgroup>';
    });
    if (!found && (currentId || currentName)) {
      html += `<option value="__keep__" selected>${esc(currentName || currentId)}（現在の場所）</option>`;
    }
    return html;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(r.error || new Error('画像を読み込めませんでした'));
      r.readAsDataURL(blob);
    });
  }

  function downscale(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h, 1));
        if (scale >= 1 && dataUrl.length < 1500000) { resolve(dataUrl); return; }
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        try { resolve(c.toDataURL('image/jpeg', 0.86)); } catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function composeOrderMail(it, qty, note, forMailApp) {
    const o = settings().order || {};
    const unit = unitOf(it);
    const lines = [it.supplierName ? `${it.supplierName} 御中` : 'ご担当者様', ''];
    lines.push(String(o.message || '').trim() || DEFAULT_MESSAGE, '');
    lines.push('━━━━━━━━━━━━━━━━━━━━', '■ 発注内容', `品名：${it.name}`);
    const cap = `${it.size || ''}${it.volUnit || ''}`;
    if (cap) lines.push(`容量：${cap}`);
    lines.push(`数量：${fmtNum(qty)} ${unit}`);
    if (it.barcode) lines.push(`JANコード：${it.barcode}`);
    if (note) lines.push(`備考：${note}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━', '');
    if (o.companyName) lines.push(o.companyName);
    if (o.senderName) lines.push(o.senderName);
    if (o.senderEmail) lines.push(`メール：${o.senderEmail}`);
    if (!forMailApp && o.senderEmail) {
      lines.push('', `※このメールは在庫管理システム（情熱MAP）から送信しています。ご返信は ${o.senderEmail} 宛にお願いいたします。`);
    }
    return {
      subject: `【発注依頼】${it.name} ${fmtNum(qty)}${unit}${o.companyName ? `（${o.companyName}）` : ''}`,
      body: lines.join('\n')
    };
  }

  // ---------------------------------------------------------------- トースト・シート・確認
  function toast(html, opts = {}) {
    let box = document.getElementById('invmToasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'invmToasts';
      box.className = 'invm-toasts';
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'invm-toast' + (opts.kind ? ` is-${opts.kind}` : '') + (opts.onClick ? ' is-clickable' : '');
    el.innerHTML = html;
    box.appendChild(el);
    let timer = 0;
    const remove = () => {
      clearTimeout(timer);
      if (!el.parentNode) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 260);
    };
    el.addEventListener('click', () => {
      if (opts.onClick) opts.onClick();
      remove();
    });
    timer = setTimeout(remove, opts.duration || 4500);
    return remove;
  }

  const showError = (err, prefix) => toast(
    `❌ ${esc(prefix || '')}${esc((err && err.message) || err || 'エラーが発生しました')}`,
    { kind: 'error', duration: 8000 }
  );

  // guard: true のシートは exit-guard.js の離脱確認の対象（入力途中のフォーム用）
  function openSheet({ title = '', html = '', footer = '', className = '', modal = false, guard = false, confirmClose = null, onClose = null } = {}) {
    const backdrop = document.createElement('div');
    backdrop.className = 'invm-sheet-backdrop';
    backdrop.innerHTML = `
      <div class="invm-sheet ${className}" role="${guard ? 'dialog' : 'group'}" aria-label="${esc(title)}">
        <div class="invm-sheet-head">
          <div class="invm-sheet-title">${esc(title)}</div>
          <button type="button" class="invm-icon-btn" data-sheet-close aria-label="閉じる">✕</button>
        </div>
        <div class="invm-sheet-body">${html}</div>
        ${footer ? `<div class="invm-sheet-foot">${footer}</div>` : ''}
      </div>`;
    document.body.appendChild(backdrop);
    const el = backdrop.firstElementChild;
    let busyEl = null;
    const api = {
      el,
      closed: false,
      q: (sel) => el.querySelector(sel),
      qa: (sel) => Array.from(el.querySelectorAll(sel)),
      setTitle: (t) => { el.querySelector('.invm-sheet-title').textContent = t; },
      close() {
        if (api.closed) return;
        api.closed = true;
        backdrop.remove();
        state.sheets = state.sheets.filter((s) => s !== api);
        if (onClose) onClose();
      },
      async requestClose() {
        if (busyEl) return;
        if (confirmClose && !(await confirmClose())) return;
        api.close();
      },
      busy(on, label) {
        if (!on) {
          if (busyEl) busyEl.remove();
          busyEl = null;
          return;
        }
        if (!busyEl) {
          busyEl = document.createElement('div');
          busyEl.className = 'invm-busy';
          el.appendChild(busyEl);
        }
        busyEl.innerHTML = `<div class="invm-spinner"></div><div>${esc(label || '処理中…')}</div>`;
      }
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && !modal) api.requestClose();
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-sheet-close]')) api.requestClose();
    });
    state.sheets.push(api);
    return api;
  }

  function askConfirm(message, okLabel, opts = {}) {
    return new Promise((resolve) => {
      let done = false;
      const sheet = openSheet({
        title: opts.title || '確認',
        className: 'is-dialog',
        modal: true,
        html: `<div class="invm-confirm-msg">${esc(message).replace(/\n/g, '<br>')}</div>`,
        footer: `<button type="button" class="invm-btn" data-sheet-close>キャンセル</button>
          <button type="button" class="invm-btn ${opts.danger ? 'is-danger' : 'is-primary'}" data-yes>${esc(okLabel || 'OK')}</button>`,
        onClose: () => { if (!done) resolve(false); }
      });
      sheet.q('[data-yes]').addEventListener('click', () => {
        done = true;
        sheet.close();
        resolve(true);
      });
    });
  }

  function askText(title, label, value, opts = {}) {
    return new Promise((resolve) => {
      let done = false;
      const sheet = openSheet({
        title,
        className: 'is-dialog',
        modal: true,
        html: `<label class="invm-label">${esc(label)}</label>
          <input class="invm-input" data-ask maxlength="${opts.maxLength || 30}" placeholder="${esc(opts.placeholder || '')}" value="${esc(value || '')}">`,
        footer: `<button type="button" class="invm-btn" data-sheet-close>キャンセル</button>
          <button type="button" class="invm-btn is-primary" data-ok>OK</button>`,
        onClose: () => { if (!done) resolve(null); }
      });
      const input = sheet.q('[data-ask]');
      const ok = () => {
        done = true;
        const v = input.value;
        sheet.close();
        resolve(v);
      };
      sheet.q('[data-ok]').addEventListener('click', ok);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          ok();
        }
      });
      setTimeout(() => input.focus(), 60);
    });
  }

  // ---------------------------------------------------------------- データ
  function load() {
    if (state.loading) return state.loading;
    const p = call('inventory_getAll', {}).then((res) => {
      state.items = (res && Array.isArray(res.items)) ? res.items : [];
      state.settings = (res && res.settings) || defaultSettings();
      state.loaded = true;
      syncLegacy();
      updateBadge();
      if (state.open) renderAll();
      return res;
    }, (err) => {
      if (state.open) {
        if (state.loaded) showError(err, '在庫データを更新できませんでした: ');
        else renderError(err);
      }
      throw err;
    });
    state.loading = p;
    const clear = () => { if (state.loading === p) state.loading = null; };
    p.then(clear, clear);
    return p;
  }

  function badgeSource(list) {
    if (Array.isArray(list)) return list;
    if (state.loaded) return state.items;
    return legacyMaterials() || [];
  }

  function updateBadge(list) {
    const source = badgeSource(list);
    const low = source.filter(isLow);
    document.querySelectorAll('[data-inventory-badge]').forEach((b) => {
      b.textContent = low.length > 99 ? '99+' : String(low.length);
      b.style.display = low.length ? '' : 'none';
    });
    const btn = document.getElementById('btnInventory');
    if (btn) btn.title = low.length ? `在庫管理（最低在庫を下回る資材 ${low.length}件）` : '在庫管理（農薬・肥料・資材）';
    if (source.length) announceLow(low);
    return low.length;
  }

  // ページを開いて最初にデータが揃ったとき、最低在庫割れがあれば一度だけ知らせる
  function announceLow(low) {
    const first = state.lastLowIds === null;
    state.lastLowIds = low.map((it) => String(it.id));
    if (!first || !low.length || state.open) return;
    const sig = `${todayKey()}:${state.lastLowIds.slice().sort().join(',')}`;
    try {
      if (sessionStorage.getItem('invmLowAnnounced') === sig) return;
      sessionStorage.setItem('invmLowAnnounced', sig);
    } catch (e) { /* プライベートモード */ }
    const names = low.slice(0, 3).map((it) => it.name).join('、') + (low.length > 3 ? ' ほか' : '');
    toast(`⚠️ 最低在庫を下回っている資材が <b>${low.length}件</b> あります<br><small>${esc(names)}（タップで確認）</small>`, {
      kind: 'warn',
      duration: 9000,
      onClick: () => open({ filter: LOW, query: '' })
    });
  }

  function notifyStockResult(item, alert, order) {
    if (!item) return;
    const unit = unitOf(item);
    const lines = [];
    let kind = 'warn';
    if (alert) {
      lines.push(`⚠️ <b>${esc(item.name)}</b> が最低在庫（${esc(fmtNum(item.minStock))}${esc(unit)}）を下回っています（在庫 ${esc(fmtNum(item.stock))}${esc(unit)}）`);
    }
    if (order) {
      if (order.sent) {
        lines.push(`📧 ${esc(item.supplierName || order.to || '仕入れ先')} へ ${esc(fmtNum(order.qty))}${esc(unit)} の発注メールを自動送信しました`);
        kind = 'order';
      } else if (order.attempted && !ORDER_SKIP_REASONS.has(order.reason)) {
        lines.push(`❌ 自動発注メールを送れませんでした：${esc(order.message || '')}`);
        kind = 'error';
      } else if (order.message && order.reason !== 'not_low' && order.reason !== 'auto_off') {
        lines.push(`ℹ️ ${esc(order.message)}`);
      }
    }
    if (!lines.length) return;
    toast(lines.join('<br>'), { kind, duration: 9000, onClick: () => open({ focusId: item.id }) });
  }

  // ---------------------------------------------------------------- 一覧画面
  function ensureRoot() {
    let root = document.getElementById('invmRoot');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'invmRoot';
    root.className = 'invm-root';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', '在庫管理');
    root.innerHTML = `
      <header class="invm-header">
        <div class="invm-title">📦 在庫管理</div>
        <button type="button" class="invm-icon-btn" data-act="reload" aria-label="再読み込み" title="再読み込み">🔄</button>
        <button type="button" class="invm-icon-btn" data-act="settings" aria-label="設定" title="カテゴリ・仕入れ先・発注メールの設定">⚙️</button>
        <button type="button" class="invm-icon-btn" data-act="close" aria-label="閉じる" title="閉じる">✕</button>
      </header>
      <div class="invm-toolbar">
        <div class="invm-alert-banner" data-act="filter-low" hidden></div>
        <div class="invm-search-row">
          <input type="search" class="invm-search" placeholder="🔍 資材名・バーコード・仕入れ先で検索" enterkeyhint="search" autocomplete="off">
          <button type="button" class="invm-scan-btn" data-act="scan-search" title="バーコードを読み取って探す">📷 読取</button>
        </div>
        <div class="invm-chips" data-chips></div>
      </div>
      <main class="invm-list" aria-live="polite"></main>
      <button type="button" class="invm-fab" data-act="new">＋ 資材を登録</button>`;
    document.body.appendChild(root);
    root.addEventListener('click', onRootClick);
    root.querySelector('.invm-search').addEventListener('input', (e) => {
      state.query = e.target.value;
      renderList();
    });
    return root;
  }

  function onRootClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const holder = el.closest('[data-id]');
    const id = holder ? holder.getAttribute('data-id') : '';
    switch (el.getAttribute('data-act')) {
      case 'close': close(); break;
      case 'reload': load().catch(() => {}); break;
      case 'settings': openSettings(); break;
      case 'new': openItemForm(null, currentCategoryFilter() ? { category: currentCategoryFilter() } : null); break;
      case 'scan-search': scanForSearch(); break;
      case 'filter':
        state.filter = el.getAttribute('data-filter');
        renderAll();
        break;
      case 'filter-low':
        state.filter = LOW;
        renderAll();
        break;
      case 'add-category': addCategoryFromList(); break;
      case 'detail': openDetail(id); break;
      case 'add':
      case 'use':
      case 'count':
        openMoveSheet(id, el.getAttribute('data-act'));
        break;
      default:
        break;
    }
  }

  function currentCategoryFilter() {
    return state.filter !== ALL && state.filter !== LOW && state.filter ? state.filter : '';
  }

  function renderAll() {
    renderChips();
    renderBanner();
    renderList();
  }

  function renderChips() {
    const box = ensureRoot().querySelector('[data-chips]');
    const lowCount = state.items.filter(isLow).length;
    const counts = {};
    state.items.forEach((it) => { counts[it.category || ''] = (counts[it.category || ''] || 0) + 1; });
    const chip = (key, label, n, cls) => `<button type="button" class="invm-chip${cls ? ` ${cls}` : ''}${state.filter === key ? ' is-active' : ''}" data-act="filter" data-filter="${esc(key)}">${esc(label)} <span class="invm-chip-count">${n}</span></button>`;
    let html = chip(ALL, 'すべて', state.items.length);
    if (lowCount) html += chip(LOW, '⚠️ 要補充', lowCount, 'is-alert');
    allCategories().forEach((c) => { html += chip(c, `${iconOfCategory(c)} ${c}`, counts[c] || 0); });
    if (counts['']) html += chip('', '未分類', counts['']);
    html += '<button type="button" class="invm-chip is-add" data-act="add-category">＋ カテゴリ</button>';
    box.innerHTML = html;
  }

  function renderBanner() {
    const el = ensureRoot().querySelector('.invm-alert-banner');
    const low = state.items.filter(isLow);
    if (!low.length) {
      el.hidden = true;
      return;
    }
    const names = low.slice(0, 3).map((it) => it.name).join('、') + (low.length > 3 ? ' ほか' : '');
    el.hidden = false;
    el.innerHTML = `⚠️ 最低在庫を下回っている資材が <b>${low.length}件</b>：${esc(names)} <span class="invm-banner-link">表示 ›</span>`;
  }

  function filteredItems() {
    const terms = normalizeQuery(state.query).split(/\s+/).filter(Boolean);
    let f = state.filter;
    if (f === LOW && !state.items.some(isLow)) f = ALL;
    return state.items.filter((it) => {
      if (f === LOW && !isLow(it)) return false;
      if (f !== ALL && f !== LOW && (it.category || '') !== f) return false;
      if (!terms.length) return true;
      const hay = normalizeQuery([it.name, it.barcode, it.category, it.supplierName, it.signName, it.note].join(' '));
      return terms.every((t) => hay.indexOf(t) >= 0);
    }).sort((a, b) => {
      const la = isLow(a) ? 0 : 1;
      const lb = isLow(b) ? 0 : 1;
      if (la !== lb) return la - lb;
      return String(a.name).localeCompare(String(b.name), 'ja');
    });
  }

  const thumbHtml = (it) => (it.photo
    ? `<img src="${esc(displayPhotoUrl(it.photo))}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span>${iconOfCategory(it.category)}</span>`);

  function cardHtml(it) {
    const low = isLow(it);
    const t = orderTiming(it);
    const unit = unitOf(it);
    const meta = [];
    if (it.category) meta.push(esc(it.category));
    if (it.size || it.volUnit) meta.push(esc(`${it.size || ''}${it.volUnit || ''}`));
    if (it.signName) meta.push(`📍${esc(it.signName)}`);
    const status = [];
    if (low) status.push(`<span class="invm-badge is-low">⚠️ 最低${esc(fmtNum(it.minStock))}${esc(unit)}未満</span>`);
    if (t.pending) status.push(`<span class="invm-badge is-order">📧 ${esc(fmtDate(t.lastOrderMs))} 発注済み・入荷待ち</span>`);
    else if (low && !isEmail(it.supplierEmail)) status.push('<span class="invm-badge">仕入れ先メール未登録</span>');
    return `
      <article class="invm-card${low ? ' is-low' : ''}" data-id="${esc(it.id)}">
        <div class="invm-card-main" data-act="detail">
          <div class="invm-thumb">${thumbHtml(it)}</div>
          <div class="invm-card-body">
            <div class="invm-card-name">${esc(it.name)}</div>
            ${meta.length ? `<div class="invm-card-meta">${meta.join(' · ')}</div>` : ''}
            ${status.length ? `<div class="invm-card-status">${status.join('')}</div>` : ''}
          </div>
          <div class="invm-card-stock${low ? ' is-low' : ''}">
            <b>${esc(fmtNum(it.stock))}</b><small>${esc(unit)}</small>
            ${Number(it.minStock) > 0 ? `<em>最低 ${esc(fmtNum(it.minStock))}</em>` : ''}
          </div>
        </div>
        <div class="invm-card-actions">
          <button type="button" class="invm-op is-add" data-act="add">${OP_ICON.add} 補充</button>
          <button type="button" class="invm-op is-use" data-act="use">${OP_ICON.use} 使う</button>
          <button type="button" class="invm-op is-count" data-act="count">${OP_ICON.count} 数える</button>
        </div>
      </article>`;
  }

  function renderList() {
    const list = ensureRoot().querySelector('.invm-list');
    if (!state.loaded) {
      list.innerHTML = '<div class="invm-empty"><div class="invm-spinner"></div><p>在庫データを読み込んでいます…</p></div>';
      return;
    }
    if (!state.items.length) {
      list.innerHTML = `
        <div class="invm-empty">
          <div class="invm-empty-icon">📦</div>
          <p>まだ資材が登録されていません。</p>
          <p class="invm-help">下の「＋ 資材を登録」から農薬・肥料・資材を登録してください。バーコードを読み取ると、商品名や写真をウェブで調べられます。</p>
        </div>`;
      return;
    }
    const items = filteredItems();
    list.innerHTML = items.length
      ? items.map(cardHtml).join('')
      : '<div class="invm-empty"><p>条件に合う資材がありません。</p></div>';
  }

  function renderError(err) {
    ensureRoot().querySelector('.invm-list').innerHTML = `
      <div class="invm-empty">
        <p>❌ 在庫データを読み込めませんでした</p>
        <p class="invm-help">${esc((err && err.message) || err)}</p>
        <button type="button" class="invm-btn is-primary" data-act="reload">もう一度読み込む</button>
      </div>`;
  }

  function focusCard(id) {
    const root = ensureRoot();
    let card = root.querySelector(`.invm-card[data-id="${CSS.escape(String(id))}"]`);
    if (!card && findItem(id)) {
      state.filter = ALL;
      state.query = '';
      root.querySelector('.invm-search').value = '';
      renderAll();
      card = root.querySelector(`.invm-card[data-id="${CSS.escape(String(id))}"]`);
    }
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.remove('is-focus');
    void card.offsetWidth;
    card.classList.add('is-focus');
  }

  async function addCategoryFromList() {
    const c = String((await askText('カテゴリを追加', 'カテゴリ名', '', { placeholder: '例: 培土' })) || '').trim().slice(0, 30);
    if (!c) return;
    const base = (settings().categories || []).slice();
    if (base.indexOf(c) < 0) {
      base.push(c);
      try {
        const res = await call('inventory_saveSettings', { settings: { categories: base }, userName: userName() });
        state.settings = res.settings;
        toast(`🏷️ カテゴリ「${esc(c)}」を追加しました`, { kind: 'ok' });
      } catch (err) {
        showError(err);
        return;
      }
    }
    state.filter = c;
    renderAll();
  }

  async function scanForSearch() {
    const code = await scanBarcode();
    if (!code) return;
    if (!state.loaded) {
      try { await load(); } catch (e) { return; }
    }
    const matches = state.items.filter((it) => it.barcode && normBarcode(it.barcode) === normBarcode(code));
    if (matches.length === 1) {
      openMoveSheet(matches[0].id, '');
      return;
    }
    if (matches.length > 1) {
      state.filter = ALL;
      state.query = code;
      ensureRoot().querySelector('.invm-search').value = code;
      renderAll();
      toast(`📷 ${esc(code)} の資材が ${matches.length}件 あります`, { duration: 3500 });
      return;
    }
    if (await askConfirm(`バーコード ${code} の資材はまだ登録されていません。\n新しく登録しますか？`, '登録する')) {
      openItemForm(null, { barcode: code }, { autoLookup: true });
    }
  }

  // ---------------------------------------------------------------- 補充・使う・数える
  function openMoveSheet(id, opKey) {
    const it = findItem(id);
    if (!it) return;
    const unit = unitOf(it);
    let op = '';
    const html = `
      <div class="invm-move-head">
        <div class="invm-thumb">${thumbHtml(it)}</div>
        <div>
          <div class="invm-move-name">${esc(it.name)}</div>
          <div class="invm-move-now">現在 <b>${esc(fmtNum(it.stock))}</b> ${esc(unit)}${Number(it.minStock) > 0 ? `（最低 ${esc(fmtNum(it.minStock))}）` : ''}</div>
        </div>
      </div>
      <div class="invm-seg">
        ${['add', 'use', 'count'].map((k) => `<button type="button" data-op="${k}">${OP_ICON[k]} ${OP_LABEL[k]}</button>`).join('')}
      </div>
      <div class="invm-help invm-center" data-pick-hint>補充・使う・数える から選んでください。</div>
      <div data-move-body hidden>
        <div class="invm-move-label" data-qty-label></div>
        <div class="invm-stepper">
          <button type="button" data-step="-1" aria-label="1減らす">−</button>
          <input class="invm-qty" inputmode="decimal" autocomplete="off" aria-label="個数">
          <button type="button" data-step="1" aria-label="1増やす">＋</button>
        </div>
        <div class="invm-quick" data-quick></div>
        <div class="invm-preview" data-preview></div>
        <input class="invm-input" data-note maxlength="200" placeholder="メモ（任意） 例: 3番ハウスで使用">
      </div>`;
    const footer = `<button type="button" class="invm-btn" data-sheet-close>キャンセル</button>
      <button type="button" class="invm-btn is-primary" data-submit disabled>記録する</button>`;
    const sheet = openSheet({ title: '在庫を記録', html, footer, className: 'is-move', guard: true });
    const qtyEl = sheet.q('.invm-qty');

    const updatePreview = () => {
      const box = sheet.q('[data-preview]');
      const q = num(qtyEl.value);
      if (q == null || q < 0) {
        box.textContent = '';
        box.className = 'invm-preview';
        return;
      }
      const cur = Number(it.stock) || 0;
      const after = op === 'add' ? cur + q : op === 'use' ? cur - q : q;
      const low = Number(it.minStock) > 0 && after < Number(it.minStock);
      const diff = after - cur;
      box.className = `invm-preview${low ? ' is-low' : ''}`;
      box.textContent = (op === 'count' ? `差 ${diff >= 0 ? '+' : ''}${fmtNum(diff)} ${unit} → ` : '記録後 ') +
        `${fmtNum(after)} ${unit}${low ? '（最低在庫を下回ります）' : ''}`;
    };

    const setOp = (k) => {
      op = k;
      sheet.qa('[data-op]').forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-op') === k));
      sheet.q('[data-move-body]').hidden = !k;
      sheet.q('[data-pick-hint]').hidden = !!k;
      sheet.q('[data-submit]').disabled = !k;
      if (!k) return;
      sheet.setTitle(`${OP_LABEL[k]}を記録`);
      sheet.q('[data-qty-label]').textContent = k === 'add' ? `補充した数（${unit}）` : k === 'use' ? `使った数（${unit}）` : `数えた結果、今ある数（${unit}）`;
      qtyEl.value = k === 'count' ? fmtNum(it.stock) : '1';
      qtyEl.classList.remove('is-invalid');
      sheet.q('[data-quick]').innerHTML = (k === 'count' ? [0, 1, 2, 3, 5, 10] : [1, 2, 3, 5, 10, 20])
        .map((n) => `<button type="button" data-quick-n="${n}">${n}</button>`).join('');
      updatePreview();
    };

    const submit = async () => {
      if (!op) return;
      const q = num(qtyEl.value);
      if (q == null || q < 0 || (op !== 'count' && q === 0)) {
        qtyEl.classList.add('is-invalid');
        qtyEl.focus();
        toast('個数を正しく入力してください', { kind: 'warn' });
        return;
      }
      if (op === 'use' && q > (Number(it.stock) || 0) &&
        !(await askConfirm(`在庫（${fmtNum(it.stock)}${unit}）より多い数です。このまま記録しますか？\n実際の数が違う場合は「数える」で直せます。`, '記録する'))) return;
      sheet.busy(true, '記録しています…');
      try {
        const res = await call('inventory_move', { id: it.id, op, qty: q, note: sheet.q('[data-note]').value.trim(), userName: userName() });
        upsertItem(res.item);
        syncLegacy(res.item);
        sheet.close();
        renderAll();
        updateBadge();
        refreshDetail(res.item.id);
        const diff = (Number(res.after) || 0) - (Number(res.before) || 0);
        toast(`✅ ${esc(it.name)}：${OP_LABEL[op]} ${esc(fmtNum(q))}${esc(unit)}` +
          (op === 'count' ? `（差 ${diff >= 0 ? '+' : ''}${esc(fmtNum(diff))}）` : '') +
          ` → 在庫 <b>${esc(fmtNum(res.after))}</b>${esc(unit)}`, { kind: 'ok' });
        if (res.alert || res.order) notifyStockResult(res.item, res.alert, res.order);
      } catch (err) {
        sheet.busy(false);
        showError(err);
      }
    };

    sheet.el.addEventListener('click', (e) => {
      const opBtn = e.target.closest('[data-op]');
      if (opBtn) { setOp(opBtn.getAttribute('data-op')); return; }
      const step = e.target.closest('[data-step]');
      if (step) {
        const next = Math.max(0, (num(qtyEl.value) || 0) + Number(step.getAttribute('data-step')));
        qtyEl.value = fmtNum(next);
        updatePreview();
        return;
      }
      const quick = e.target.closest('[data-quick-n]');
      if (quick) {
        qtyEl.value = quick.getAttribute('data-quick-n');
        updatePreview();
        return;
      }
      if (e.target.closest('[data-submit]')) submit();
    });
    qtyEl.addEventListener('input', () => {
      qtyEl.classList.remove('is-invalid');
      updatePreview();
    });
    qtyEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
    if (OP_LABEL[opKey]) setOp(opKey);
  }

  // ---------------------------------------------------------------- 登録・編集フォーム
  function openItemForm(item, prefill, opts = {}) {
    const isEdit = !!(item && item.id);
    const src = Object.assign({
      name: '', barcode: '', category: '', size: '', volUnit: '', stock: '', stockUnit: '',
      signId: '', signName: '', supplierName: '', supplierEmail: '', minStock: '', orderQty: '',
      orderIntervalDays: '', note: '', photos: []
    }, item || {}, prefill || {});
    const v = (x) => (x == null ? '' : String(x));
    const photos = (src.photos || []).filter(isHttpUrl).slice(0, MAX_PHOTOS).map((u) => ({ url: u }));
    const cats = allCategories();
    let selectedCat = src.category || '';
    if (selectedCat && cats.indexOf(selectedCat) < 0) cats.push(selectedCat);
    const origStock = isEdit ? fmtNum(src.stock) : '';
    let lookupResult = null;
    let dirty = false;

    const html = `
      <div class="invm-form">
        <section class="invm-sec">
          <label class="invm-label" for="invmF_barcode">バーコード</label>
          <div class="invm-row">
            <input class="invm-input" id="invmF_barcode" name="barcode" inputmode="numeric" autocomplete="off" maxlength="64" placeholder="例: 4901234567890" value="${esc(v(src.barcode))}">
            <button type="button" class="invm-btn is-sub" data-f="scan">📷 読取</button>
          </div>
          <div class="invm-row"><button type="button" class="invm-btn is-ghost is-block" data-f="lookup">🔎 バーコードで商品名・写真を調べる</button></div>
          <div data-local-match></div>
          <div class="invm-lookup" data-lookup hidden></div>
        </section>
        <section class="invm-sec">
          <span class="invm-label">カテゴリ</span>
          <div class="invm-chips is-form" data-cats></div>
        </section>
        <section class="invm-sec">
          <label class="invm-label" for="invmF_name">資材名 <span class="invm-req">必須</span></label>
          <input class="invm-input" id="invmF_name" name="name" list="invmNameList" maxlength="120" autocomplete="off" placeholder="例: ダコニール1000" value="${esc(v(src.name))}">
          <datalist id="invmNameList">${nameSuggestions().map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
          <div class="invm-grid2">
            <div>
              <label class="invm-label">容量（1個あたり）</label>
              <div class="invm-row">
                <input class="invm-input" name="size" inputmode="decimal" maxlength="30" placeholder="500" value="${esc(v(src.size))}">
                <input class="invm-input is-unit" name="volUnit" list="invmVolUnits" maxlength="20" placeholder="ml" value="${esc(v(src.volUnit))}">
              </div>
            </div>
            <div>
              <label class="invm-label">個数${isEdit ? '（直すと「数える」で記録）' : '（今ある数）'}</label>
              <div class="invm-row">
                <input class="invm-input" name="stock" inputmode="decimal" placeholder="0" value="${esc(isEdit ? origStock : v(src.stock))}">
                <input class="invm-input is-unit" name="stockUnit" list="invmStockUnits" maxlength="20" placeholder="本" value="${esc(v(src.stockUnit))}">
              </div>
            </div>
          </div>
          <datalist id="invmVolUnits">${VOL_UNITS.map((u) => `<option value="${esc(u)}"></option>`).join('')}</datalist>
          <datalist id="invmStockUnits">${STOCK_UNITS.map((u) => `<option value="${esc(u)}"></option>`).join('')}</datalist>
          <label class="invm-label">保管場所</label>
          <select class="invm-input" name="sign">${signOptionsHtml(src.signId, src.signName)}</select>
        </section>
        <section class="invm-sec">
          <div class="invm-sec-title">🚚 仕入れ・発注</div>
          <label class="invm-label">仕入れ先</label>
          <input class="invm-input" name="supplierName" list="invmSupplierList" maxlength="60" autocomplete="off" placeholder="例: JA○○ 資材センター" value="${esc(v(src.supplierName))}">
          <datalist id="invmSupplierList">${(settings().suppliers || []).map((s) => `<option value="${esc(s.name || s.email)}"></option>`).join('')}</datalist>
          <label class="invm-label">仕入れ先のメールアドレス</label>
          <input class="invm-input" name="supplierEmail" type="email" inputmode="email" autocomplete="off" maxlength="120" placeholder="order@example.com" value="${esc(v(src.supplierEmail))}">
          <div class="invm-grid3">
            <div><label class="invm-label">最低在庫個数</label><input class="invm-input" name="minStock" inputmode="decimal" placeholder="例: 3" value="${esc(v(src.minStock))}"></div>
            <div><label class="invm-label">発注個数</label><input class="invm-input" name="orderQty" inputmode="decimal" placeholder="例: 10" value="${esc(v(src.orderQty))}"></div>
            <div><label class="invm-label">発注間隔（日）</label><input class="invm-input" name="orderIntervalDays" inputmode="numeric" placeholder="例: 7" value="${esc(v(src.orderIntervalDays))}"></div>
          </div>
          <p class="invm-help">個数が「最低在庫個数」を下回るとアラートを表示し、仕入れ先のメールアドレスがあれば「発注個数」を自動でメール発注します。発注後は「補充」を記録するまで再発注しません。「発注間隔」を入れると、前回の発注からその日数が経つまで次の自動発注をしません。</p>
        </section>
        <section class="invm-sec">
          <div class="invm-sec-title">📷 写真（${MAX_PHOTOS}枚まで）</div>
          <div class="invm-photos" data-photos></div>
          <div class="invm-row is-wrap">
            <label class="invm-btn is-sub">📸 撮影・選ぶ<input type="file" class="invm-file-input" accept="image/*" multiple data-file></label>
            <button type="button" class="invm-btn is-sub" data-f="paste">📋 貼り付け</button>
            <button type="button" class="invm-btn is-ghost" data-f="gimg">🔍 Google画像検索</button>
          </div>
          <div class="invm-paste-zone" contenteditable="true" data-paste-zone role="textbox" aria-label="画像の貼り付け欄"
            data-placeholder="ここを長押し（PC は Ctrl+V）して画像を貼り付け"></div>
        </section>
        <section class="invm-sec">
          <label class="invm-label">メモ</label>
          <textarea class="invm-input" name="note" rows="2" maxlength="500" placeholder="農薬登録番号・使い方の注意など">${esc(v(src.note))}</textarea>
        </section>
      </div>`;
    const footer = `${isEdit && isAdmin() ? '<button type="button" class="invm-btn is-danger" data-f="delete">🗑 削除</button>' : ''}
      <button type="button" class="invm-btn" data-f="cancel">キャンセル</button>
      <button type="button" class="invm-btn is-primary" data-f="save">${isEdit ? '保存する' : '登録する'}</button>`;
    const sheet = openSheet({
      title: isEdit ? '資材を編集' : '資材を登録',
      html,
      footer,
      className: 'is-form',
      modal: true,
      guard: true,
      confirmClose: () => (dirty ? askConfirm('入力した内容を破棄して閉じますか？', '破棄する', { danger: true }) : Promise.resolve(true))
    });
    const f = (name) => sheet.q(`[name="${name}"]`);

    const renderCats = () => {
      sheet.q('[data-cats]').innerHTML = cats.map((c) => `<button type="button" class="invm-chip${c === selectedCat ? ' is-active' : ''}" data-cat="${esc(c)}">${esc(iconOfCategory(c))} ${esc(c)}</button>`).join('') +
        '<button type="button" class="invm-chip is-add" data-f="add-cat">＋ 追加</button>';
    };

    const renderPhotos = () => {
      sheet.q('[data-photos]').innerHTML = photos.length
        ? photos.map((p, i) => `
          <div class="invm-photo">
            <img src="${esc(p.dataUrl || displayPhotoUrl(p.url))}" alt="" data-photo-main="${i}" referrerpolicy="no-referrer" title="タップでメイン写真にする">
            ${i === 0 ? '<span class="invm-photo-main">メイン</span>' : ''}
            <button type="button" data-photo-del="${i}" aria-label="写真を削除">✕</button>
          </div>`).join('')
        : '<div class="invm-help invm-m0">写真はまだありません</div>';
    };

    const addPhotoBlob = async (blob) => {
      if (photos.length >= MAX_PHOTOS) {
        toast(`写真は${MAX_PHOTOS}枚までです`, { kind: 'warn' });
        return false;
      }
      if (!blob || !/^image\//.test(blob.type || '')) {
        toast('画像ファイルではありません', { kind: 'warn' });
        return false;
      }
      try {
        photos.push({ dataUrl: await downscale(await blobToDataUrl(blob)) });
      } catch (err) {
        showError(err);
        return false;
      }
      dirty = true;
      renderPhotos();
      return true;
    };

    const renderLocalMatch = () => {
      const code = normBarcode(f('barcode').value);
      const box = sheet.q('[data-local-match]');
      const matches = code ? state.items.filter((it) => it.barcode && normBarcode(it.barcode) === code && !(isEdit && sameId(it.id, item.id))) : [];
      if (!matches.length) {
        box.innerHTML = '';
        return;
      }
      const m = matches[0];
      box.innerHTML = `
        <div class="invm-note-box">📦 このバーコードは「${esc(m.name)}」${m.signName ? `（${esc(m.signName)}）` : ''}で登録済みです。別の場所の在庫として登録するときは内容をコピーできます。
          <div class="invm-row invm-mt6"><button type="button" class="invm-btn is-sub" data-f="copy-local" data-src-id="${esc(m.id)}">内容をコピー</button></div>
        </div>`;
    };

    const copyLocal = (srcId) => {
      const m = findItem(srcId);
      if (!m) return;
      ['name', 'size', 'volUnit', 'stockUnit', 'supplierName', 'supplierEmail', 'minStock', 'orderQty', 'orderIntervalDays', 'note'].forEach((k) => {
        if (m[k] != null && m[k] !== '' && f(k)) f(k).value = String(m[k]);
      });
      if (m.category) {
        if (cats.indexOf(m.category) < 0) cats.push(m.category);
        selectedCat = m.category;
        renderCats();
      }
      if (!photos.length) {
        (m.photos || []).filter(isHttpUrl).slice(0, MAX_PHOTOS).forEach((u) => photos.push({ url: u }));
        renderPhotos();
      }
      dirty = true;
      toast('✅ 登録済みの内容をコピーしました（個数と保管場所は入力してください）', { kind: 'ok' });
    };

    const googleLinksHtml = (code, queries) => {
      const qs = ((queries && queries.length) ? queries : [code]).filter(Boolean).slice(0, 3);
      if (!qs.length) return '';
      return '<div class="invm-lookup-queries">Googleで検索: ' +
        qs.map((q) => `<a href="https://www.google.com/search?q=${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer">${esc(q)}</a>`).join(' / ') +
        '</div>';
    };

    const renderLookup = () => {
      const r = lookupResult || {};
      let h = '<div class="invm-lookup-title">🔎 調べた結果 <small>AI がウェブ検索から推定した内容です。正しいか確認してください。</small></div>';
      if (r.found) {
        const meta = [r.maker, `${r.size || ''}${r.volUnit || ''}`, r.category].filter(Boolean).map(esc).join(' · ');
        h += `<div class="invm-lookup-name">${esc(r.name)}${Number(r.confidence) < 0.6 ? ' <span class="invm-badge">確度低め</span>' : ''}</div>`;
        if (meta) h += `<div class="invm-help invm-m0">${meta}</div>`;
        if (r.note) h += `<div class="invm-help invm-m0">${esc(r.note)}</div>`;
        h += '<button type="button" class="invm-btn is-primary is-block invm-mt6" data-f="apply-lookup">この内容を入力する</button>';
      } else {
        h += '<div class="invm-help invm-m0">このバーコードの商品は見つかりませんでした。資材名を入力して「🔍 Google画像検索」で写真を探せます。</div>';
      }
      const images = (r.images || []).filter((im) => isHttpUrl(im.url));
      if (images.length) {
        h += '<div class="invm-label">候補の写真（タップで追加）</div><div class="invm-lookup-images">' +
          images.map((im) => `<button type="button" data-f="pick-image" data-i="${(r.images || []).indexOf(im)}" title="${esc(im.title || im.domain || '')}"><img src="${esc(im.url)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc(im.domain || '')}</span></button>`).join('') +
          '</div>';
      }
      const sources = (r.sources || []).filter((s) => isHttpUrl(s.uri));
      if (sources.length) {
        h += '<details class="invm-lookup-src"><summary>参照したページ</summary><ul>' +
          sources.map((s) => `<li><a href="${esc(s.uri)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.uri)}</a></li>`).join('') +
          '</ul></details>';
      }
      h += googleLinksHtml(r.barcode || normBarcode(f('barcode').value), r.searchQueries);
      sheet.q('[data-lookup]').innerHTML = h;
    };

    const runLookup = async () => {
      const code = normBarcode(f('barcode').value);
      if (!code) {
        toast('先にバーコードを入力するか「📷 読取」で読み取ってください', { kind: 'warn' });
        f('barcode').focus();
        return;
      }
      const box = sheet.q('[data-lookup]');
      box.hidden = false;
      box.innerHTML = '<span class="invm-inline-spinner"></span>ウェブで商品を調べています…（10〜20秒ほどかかります）';
      try {
        lookupResult = await call('inventory_lookupBarcode', { barcode: code, hint: f('name').value.trim(), categories: cats });
        if (!sheet.closed) renderLookup();
      } catch (err) {
        if (sheet.closed) return;
        box.innerHTML = `<div class="invm-note-box is-error">調べられませんでした: ${esc((err && err.message) || err)}</div>${googleLinksHtml(code)}`;
      }
    };

    const applyLookup = () => {
      const r = lookupResult;
      if (!r || !r.found) return;
      f('name').value = r.name;
      if (!f('size').value.trim() && r.size) f('size').value = r.size;
      if (!f('volUnit').value.trim() && r.volUnit) f('volUnit').value = r.volUnit;
      if (!selectedCat && r.category) {
        if (cats.indexOf(r.category) < 0) cats.push(r.category);
        selectedCat = r.category;
        renderCats();
      }
      if (!f('note').value.trim() && r.note) f('note').value = r.note;
      dirty = true;
      toast('✅ 調べた内容を入力しました。内容を確認してください', { kind: 'ok' });
    };

    const pickImage = async (i, btn) => {
      const im = lookupResult && lookupResult.images && lookupResult.images[i];
      if (!im) return;
      if (photos.length >= MAX_PHOTOS) {
        toast(`写真は${MAX_PHOTOS}枚までです`, { kind: 'warn' });
        return;
      }
      btn.disabled = true;
      btn.classList.add('is-loading');
      try {
        const res = await call('inventory_fetchImage', { url: im.url, exp: im.exp, sig: im.sig });
        photos.push({ dataUrl: await downscale(res.dataUrl) });
        dirty = true;
        renderPhotos();
        toast('📷 写真を追加しました', { kind: 'ok', duration: 2500 });
      } catch (err) {
        showError(err, 'この写真は取り込めませんでした: ');
      } finally {
        btn.disabled = false;
        btn.classList.remove('is-loading');
      }
    };

    const scanIntoForm = async () => {
      const code = await scanBarcode();
      if (!code || sheet.closed) return;
      f('barcode').value = code;
      dirty = true;
      renderLocalMatch();
      if (!f('name').value.trim()) runLookup();
    };

    const openGoogleImages = () => {
      const name = f('name').value.trim();
      const q = name ? [name, `${f('size').value.trim()}${f('volUnit').value.trim()}`].filter(Boolean).join(' ') : normBarcode(f('barcode').value);
      if (!q) {
        toast('資材名かバーコードを入力してください', { kind: 'warn' });
        return;
      }
      global.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`, '_blank', 'noopener');
      toast('画像を長押し →「コピー」して戻り、「📋 貼り付け」を押してください', { duration: 9000 });
    };

    const pasteFromClipboard = async () => {
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
          throw new Error('この端末では貼り付けボタンが使えません。下の枠を長押しして「ペースト」してください');
        }
        const clipItems = await navigator.clipboard.read();
        for (const ci of clipItems) {
          const type = (ci.types || []).find((t) => /^image\//.test(t));
          if (type) {
            await addPhotoBlob(await ci.getType(type));
            return;
          }
        }
        throw new Error('クリップボードに画像がありません。画像を長押し →「コピー」してから押してください');
      } catch (err) {
        if (err && err.name === 'NotAllowedError') {
          showError(new Error('クリップボードの読み取りが許可されませんでした。下の枠を長押しして「ペースト」してください'));
        } else {
          showError(err);
        }
      }
    };

    const onPaste = async (e) => {
      const cd = e.clipboardData;
      let files = cd ? Array.from(cd.files || []).filter((x) => /^image\//.test(x.type)) : [];
      if (!files.length && cd && cd.items) {
        files = Array.from(cd.items)
          .filter((x) => x.kind === 'file' && /^image\//.test(x.type))
          .map((x) => x.getAsFile())
          .filter(Boolean);
      }
      const inZone = !!(e.target.closest && e.target.closest('[data-paste-zone]'));
      if (!files.length) {
        if (inZone) {
          e.preventDefault();
          toast('画像が見つかりませんでした。画像をコピーしてから貼り付けてください', { kind: 'warn' });
        }
        return;
      }
      e.preventDefault();
      for (const fl of files) {
        if (!(await addPhotoBlob(fl))) break;
      }
    };

    const markInvalid = (el, msg) => {
      el.classList.add('is-invalid');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus();
      toast(esc(msg), { kind: 'warn' });
    };

    const save = async () => {
      const name = f('name').value.trim();
      if (!name) { markInvalid(f('name'), '資材名を入力してください'); return; }
      const supplierEmail = f('supplierEmail').value.trim();
      if (supplierEmail && !isEmail(supplierEmail)) { markInvalid(f('supplierEmail'), 'メールアドレスの形式が正しくありません'); return; }
      for (const key of ['stock', 'minStock', 'orderQty', 'orderIntervalDays']) {
        const raw = f(key).value.trim();
        if (raw && (num(raw) == null || num(raw) < 0)) { markInvalid(f(key), '0以上の数字で入力してください'); return; }
      }
      const signSel = f('sign');
      const opt = signSel.options[signSel.selectedIndex];
      let signId = signSel.value;
      let signName = opt ? (opt.getAttribute('data-name') || '') : '';
      if (signId === '__keep__') {
        signId = src.signId || '';
        signName = src.signName || '';
      }
      const stockRaw = f('stock').value.trim();
      const payload = {
        id: isEdit ? item.id : undefined,
        name,
        barcode: normBarcode(f('barcode').value),
        category: selectedCat,
        size: f('size').value.trim(),
        volUnit: f('volUnit').value.trim(),
        stockUnit: f('stockUnit').value.trim(),
        signId,
        signName,
        supplierName: f('supplierName').value.trim(),
        supplierEmail,
        minStock: f('minStock').value.trim(),
        orderQty: f('orderQty').value.trim(),
        orderIntervalDays: f('orderIntervalDays').value.trim(),
        note: f('note').value
      };
      if (!isEdit) payload.stock = stockRaw;
      else if (stockRaw !== '' && num(stockRaw) !== num(origStock)) payload.stock = stockRaw;

      sheet.busy(true, photos.some((p) => p.dataUrl) ? '保存しています…（写真をアップロード中）' : '保存しています…');
      try {
        const res = await call('inventory_saveItem', {
          item: payload,
          photos: photos.map((p) => p.url || p.dataUrl),
          userName: userName()
        });
        if (res.settings) state.settings = res.settings;
        upsertItem(res.item);
        syncLegacy(res.item);
        dirty = false;
        sheet.close();
        renderAll();
        updateBadge();
        refreshDetail(res.item.id);
        toast(`✅ 「${esc(res.item.name)}」を${isEdit ? '保存' : '登録'}しました`, { kind: 'ok' });
        if (res.alert || res.order) notifyStockResult(res.item, res.alert, res.order);
        if (!isEdit && state.open) setTimeout(() => focusCard(res.item.id), 50);
      } catch (err) {
        sheet.busy(false);
        showError(err);
      }
    };

    const del = async () => {
      if (!(await askConfirm(`「${item.name}」を削除しますか？\n（これまでの入出庫の履歴は残ります）`, '削除する', { danger: true }))) return;
      sheet.busy(true, '削除しています…');
      try {
        await call('inventory_deleteItem', { id: item.id, userName: userName() });
        removeItem(item.id);
        syncLegacy(null, item.id);
        dirty = false;
        sheet.close();
        if (state.detailSheet && sameId(state.detailSheet.itemId, item.id)) state.detailSheet.close();
        renderAll();
        updateBadge();
        toast('🗑 削除しました', { kind: 'ok' });
      } catch (err) {
        sheet.busy(false);
        showError(err);
      }
    };

    const addCategoryFromForm = async () => {
      const c = String((await askText('カテゴリを追加', 'カテゴリ名', '', { placeholder: '例: 培土' })) || '').trim().slice(0, 30);
      if (!c) return;
      if (cats.indexOf(c) < 0) cats.push(c);
      selectedCat = c;
      dirty = true;
      renderCats();
    };

    sheet.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-f],[data-cat],[data-photo-del],[data-photo-main]');
      if (!t) return;
      if (t.hasAttribute('data-cat')) {
        const c = t.getAttribute('data-cat');
        selectedCat = selectedCat === c ? '' : c;
        dirty = true;
        renderCats();
        return;
      }
      if (t.hasAttribute('data-photo-del')) {
        photos.splice(Number(t.getAttribute('data-photo-del')), 1);
        dirty = true;
        renderPhotos();
        return;
      }
      if (t.hasAttribute('data-photo-main')) {
        const i = Number(t.getAttribute('data-photo-main'));
        if (i > 0) {
          photos.unshift(photos.splice(i, 1)[0]);
          dirty = true;
          renderPhotos();
        }
        return;
      }
      switch (t.getAttribute('data-f')) {
        case 'scan': scanIntoForm(); break;
        case 'lookup': runLookup(); break;
        case 'apply-lookup': applyLookup(); break;
        case 'pick-image': pickImage(Number(t.getAttribute('data-i')), t); break;
        case 'copy-local': copyLocal(t.getAttribute('data-src-id')); break;
        case 'add-cat': addCategoryFromForm(); break;
        case 'paste': pasteFromClipboard(); break;
        case 'gimg': openGoogleImages(); break;
        case 'cancel': sheet.requestClose(); break;
        case 'save': save(); break;
        case 'delete': del(); break;
        default: break;
      }
    });
    sheet.el.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('[data-paste-zone]')) {
        t.textContent = '';
        return;
      }
      if (t.name) {
        dirty = true;
        t.classList.remove('is-invalid');
      }
    });
    sheet.el.addEventListener('paste', onPaste);
    sheet.q('[data-file]').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      for (const fl of files) {
        if (!(await addPhotoBlob(fl))) break;
      }
    });
    f('barcode').addEventListener('change', renderLocalMatch);
    f('supplierName').addEventListener('change', () => {
      const name = f('supplierName').value.trim();
      const sup = (settings().suppliers || []).find((s) => (s.name || s.email) === name);
      if (sup && sup.email && !f('supplierEmail').value.trim()) f('supplierEmail').value = sup.email;
    });

    renderCats();
    renderPhotos();
    renderLocalMatch();
    if (opts.autoLookup && normBarcode(src.barcode) && !String(src.name || '').trim()) runLookup();
    return sheet;
  }

  // ---------------------------------------------------------------- 詳細・履歴
  function detailHtml(it) {
    const unit = unitOf(it);
    const low = isLow(it);
    const t = orderTiming(it);
    const o = settings().order || {};
    const photos = (it.photos || []).filter(isHttpUrl);
    const lastQty = it.lastOrderQty != null ? ` ${fmtNum(it.lastOrderQty)}${unit}` : '';
    let status = '';
    if (low) {
      const lines = [`⚠️ 在庫が最低在庫個数（${fmtNum(it.minStock)}${unit}）を下回っています。`];
      if (t.pending) lines.push(`📧 ${fmtDate(t.lastOrderMs, true)} に${lastQty} 発注済みです（入荷待ち）。届いたら「補充」を記録してください。`);
      else if (!isEmail(it.supplierEmail)) lines.push('仕入れ先のメールアドレスが未登録のため、自動発注できません。');
      else if (!(Number(it.orderQty) > 0)) lines.push('発注個数が未設定のため、自動発注できません。');
      else if (!senderReady()) lines.push('発注メールの差出人（⚙️ 設定）が未設定のため、自動発注できません。');
      else if (o.autoSend === false) lines.push('自動発注はオフです（⚙️ 設定）。');
      else if (t.waitInterval) lines.push(`⏳ 発注間隔のため、次の自動発注は ${fmtDate(t.nextMs)} 以降です。`);
      status = `<div class="invm-note-box is-error">${lines.map(esc).join('<br>')}</div>`;
    } else if (t.pending) {
      status = `<div class="invm-note-box">📧 ${esc(fmtDate(t.lastOrderMs, true))} に${esc(lastQty)} 発注済み（入荷待ち）</div>`;
    }
    const rows = [];
    const row = (k, val) => { if (val) rows.push(`<dt>${esc(k)}</dt><dd>${val}</dd>`); };
    row('カテゴリ', esc(it.category));
    row('バーコード', esc(it.barcode));
    row('容量', esc(`${it.size || ''}${it.volUnit || ''}`));
    row('保管場所', esc(it.signName));
    row('仕入れ先', it.supplierName || it.supplierEmail
      ? `${esc(it.supplierName)}${it.supplierEmail ? `<br><small>${esc(it.supplierEmail)}</small>` : ''}`
      : '<span class="invm-muted">未登録</span>');
    row('発注設定', esc([
      Number(it.minStock) > 0 ? `最低 ${fmtNum(it.minStock)}${unit}` : '最低在庫 未設定',
      Number(it.orderQty) > 0 ? `発注 ${fmtNum(it.orderQty)}${unit}` : '',
      Number(it.orderIntervalDays) > 0 ? `間隔 ${fmtNum(it.orderIntervalDays)}日` : ''
    ].filter(Boolean).join(' / ')));
    row('メモ', esc(it.note).replace(/\n/g, '<br>'));
    return `
      ${photos.length ? `<div class="invm-detail-photos">${photos.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(displayPhotoUrl(u))}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`).join('')}</div>` : ''}
      <div class="invm-detail-stock${low ? ' is-low' : ''}"><span>在庫</span><b>${esc(fmtNum(it.stock))}</b><small>${esc(unit)}</small></div>
      ${status}
      <div class="invm-actions-grid">
        <button type="button" class="invm-btn invm-op is-add" data-d="add">${OP_ICON.add} 補充</button>
        <button type="button" class="invm-btn invm-op is-use" data-d="use">${OP_ICON.use} 使う</button>
        <button type="button" class="invm-btn invm-op is-count" data-d="count">${OP_ICON.count} 数える</button>
      </div>
      <div class="invm-row">
        <button type="button" class="invm-btn is-order is-grow" data-d="order">📧 発注する</button>
        <button type="button" class="invm-btn is-grow" data-d="edit">✏️ 編集</button>
      </div>
      <dl class="invm-kv">${rows.join('')}</dl>`;
  }

  function logHtml(l, unit) {
    const kind = LOG_KIND[l.op] || 'other';
    let main;
    if (kind === 'order') {
      const st = l.status === 'failed' ? '（送信失敗）' : l.status === 'sending' ? '（送信処理中）' : '';
      main = `<span class="invm-log-op">📧 発注${st}</span> ${esc(fmtNum(l.qty))}${esc(unit)}${l.trigger === 'auto' ? ' <span class="invm-badge">自動</span>' : ''}`;
    } else if (kind === 'count') {
      const diff = (Number(l.after) || 0) - (Number(l.before) || 0);
      main = `<span class="invm-log-op">🔢 数える</span> ${esc(fmtNum(l.qty))}${esc(unit)} <small>（差 ${diff >= 0 ? '+' : ''}${esc(fmtNum(diff))}）</small>`;
    } else if (kind === 'add' || kind === 'use') {
      main = `<span class="invm-log-op">${kind === 'add' ? OP_ICON.add : OP_ICON.use} ${esc(l.label)}</span> ${esc(fmtNum(l.qty))}${esc(unit)} <small>${esc(fmtNum(l.before))} → ${esc(fmtNum(l.after))}</small>`;
    } else {
      main = `<span class="invm-log-op">${esc(l.label || l.op)}</span> ${esc(fmtNum(l.qty))}${esc(unit)}`;
    }
    const sub = [fmtDate(l.at, true) || l.atStr, l.user, l.to ? `宛先 ${l.to}` : '', l.note, l.error ? `エラー: ${l.error}` : '']
      .filter(Boolean).map(esc).join(' · ');
    return `
      <div class="invm-log is-${kind}">
        <div class="invm-log-body"><div class="invm-log-main">${main}</div><div class="invm-log-sub">${sub}</div></div>
        <button type="button" class="invm-log-del" data-log-del="${esc(l.id)}" aria-label="この履歴を削除" title="この履歴を削除">🗑</button>
      </div>`;
  }

  async function loadHistory(sheet) {
    const box = sheet.q('[data-history]');
    const it = findItem(sheet.itemId);
    try {
      const res = await call('inventory_getHistory', { id: sheet.itemId, limit: 100 });
      if (sheet.closed) return;
      const logs = (res && res.logs) || [];
      box.innerHTML = logs.length
        ? logs.map((l) => logHtml(l, unitOf(it))).join('')
        : '<div class="invm-help invm-m0">まだ履歴がありません。</div>';
    } catch (err) {
      if (!sheet.closed) box.innerHTML = `<div class="invm-note-box is-error">履歴を読み込めませんでした: ${esc((err && err.message) || err)}</div>`;
    }
  }

  function renderDetail(sheet) {
    const it = findItem(sheet.itemId);
    if (!it) {
      sheet.close();
      return;
    }
    sheet.setTitle(it.name);
    sheet.q('[data-detail]').innerHTML = detailHtml(it);
  }

  function refreshDetail(id) {
    const s = state.detailSheet;
    if (!s || s.closed || !sameId(s.itemId, id)) return;
    renderDetail(s);
    loadHistory(s);
  }

  function openDetail(id) {
    const it = findItem(id);
    if (!it) return;
    if (state.detailSheet) state.detailSheet.close();
    const sheet = openSheet({
      title: it.name,
      className: 'is-detail',
      html: '<div data-detail></div><div class="invm-history-title">📋 履歴</div><div data-history><div class="invm-help invm-m0"><span class="invm-inline-spinner"></span>読み込み中…</div></div>',
      onClose: () => { if (state.detailSheet === sheet) state.detailSheet = null; }
    });
    sheet.itemId = it.id;
    state.detailSheet = sheet;
    renderDetail(sheet);
    loadHistory(sheet);
    sheet.el.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-d]');
      if (d) {
        const act = d.getAttribute('data-d');
        const cur = findItem(sheet.itemId);
        if (!cur) return;
        if (act === 'edit') openItemForm(cur);
        else if (act === 'order') openOrderSheet(cur.id);
        else openMoveSheet(cur.id, act);
        return;
      }
      const delBtn = e.target.closest('[data-log-del]');
      if (!delBtn) return;
      if (!(await askConfirm('この履歴を削除して、在庫数を計算し直しますか？', '削除する', { danger: true }))) return;
      sheet.busy(true, '削除しています…');
      try {
        const res = await call('inventory_deleteLog', { id: sheet.itemId, logId: delBtn.getAttribute('data-log-del'), userName: userName() });
        upsertItem(res.item);
        syncLegacy(res.item);
        sheet.busy(false);
        renderAll();
        updateBadge();
        refreshDetail(res.item.id);
        toast('🗑 履歴を削除し、在庫を計算し直しました', { kind: 'ok' });
      } catch (err) {
        sheet.busy(false);
        showError(err);
      }
    });
  }

  // ---------------------------------------------------------------- 発注
  function openOrderSheet(id) {
    const it = findItem(id);
    if (!it) return;
    const o = settings().order || {};
    const unit = unitOf(it);
    const t = orderTiming(it);
    const hasEmail = isEmail(it.supplierEmail);
    const ready = senderReady();
    const warn = [];
    if (t.pending) warn.push(`${fmtDate(t.lastOrderMs, true)} に発注済み（入荷待ち）です。重複にご注意ください。`);
    if (!hasEmail) warn.push('仕入れ先のメールアドレスが未登録です（✏️ 編集で登録できます）。');
    if (!ready) warn.push('差出人（あなたの名前・メールアドレス）が未設定です（⚙️ 設定で登録できます）。');
    const html = `
      <dl class="invm-kv">
        <dt>宛先</dt><dd>${esc(it.supplierName || '（仕入れ先未登録）')}${hasEmail ? `<br><small>${esc(it.supplierEmail)}</small>` : ''}</dd>
        ${o.ccSelf !== false && isEmail(o.senderEmail) ? `<dt>CC</dt><dd>${esc(o.senderEmail)}</dd>` : ''}
        <dt>品名</dt><dd>${esc(it.name)}${it.size || it.volUnit ? ` ${esc(`${it.size || ''}${it.volUnit || ''}`)}` : ''}</dd>
        <dt>在庫</dt><dd>${esc(fmtNum(it.stock))} ${esc(unit)}${Number(it.minStock) > 0 ? `（最低 ${esc(fmtNum(it.minStock))}）` : ''}</dd>
      </dl>
      <label class="invm-label">発注する数（${esc(unit)}）</label>
      <input class="invm-input" data-order-qty inputmode="decimal" placeholder="例: 10" value="${esc(Number(it.orderQty) > 0 ? fmtNum(it.orderQty) : '')}">
      <label class="invm-label">備考（任意・メールに記載）</label>
      <input class="invm-input" data-order-note maxlength="300" placeholder="例: 12/5 までに納品希望">
      ${warn.length ? `<div class="invm-note-box">${warn.map(esc).join('<br>')}</div>` : ''}
      <details class="invm-mail-preview"><summary>メールの内容を確認</summary><pre data-order-preview></pre></details>
      <div class="invm-row is-wrap invm-mt10">
        <button type="button" class="invm-btn is-sub" data-o="mailto">✉️ メールアプリで作成</button>
        <button type="button" class="invm-btn is-sub" data-o="mark">✅ 発注済みにする（電話など）</button>
      </div>`;
    const footer = `<button type="button" class="invm-btn" data-sheet-close>キャンセル</button>
      <button type="button" class="invm-btn is-order" data-o="send"${hasEmail && ready ? '' : ' disabled'}>📧 発注メールを送る</button>`;
    const sheet = openSheet({ title: `発注する：${it.name}`, html, footer, className: 'is-order' });
    const qtyEl = sheet.q('[data-order-qty]');
    const noteEl = sheet.q('[data-order-note]');
    const updatePreview = () => {
      const c = composeOrderMail(it, num(qtyEl.value) || 0, noteEl.value.trim(), false);
      sheet.q('[data-order-preview]').textContent = `件名: ${c.subject}\n\n${c.body}`;
    };
    qtyEl.addEventListener('input', updatePreview);
    noteEl.addEventListener('input', updatePreview);
    updatePreview();

    sheet.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-o]');
      if (!b || b.disabled) return;
      const qty = num(qtyEl.value);
      if (!(qty > 0)) {
        toast('発注する数を入力してください', { kind: 'warn' });
        qtyEl.focus();
        return;
      }
      const note = noteEl.value.trim();
      const act = b.getAttribute('data-o');
      const applyResult = (res) => {
        upsertItem(res.item);
        syncLegacy(res.item);
        renderAll();
        updateBadge();
        refreshDetail(res.item.id);
      };
      if (act === 'send') {
        sheet.busy(true, '発注メールを送信しています…');
        try {
          const res = await call('inventory_sendOrder', { id: it.id, qty, note, userName: userName() });
          applyResult(res);
          const r = res.order || {};
          if (r.sent) {
            sheet.close();
            toast(`📧 ${esc(it.supplierName || r.to || '仕入れ先')} へ発注メールを送信しました（${esc(fmtNum(r.qty))}${esc(unit)}）`, { kind: 'order', duration: 7000 });
          } else {
            sheet.busy(false);
            showError(new Error(r.message || '送信できませんでした'));
          }
        } catch (err) {
          sheet.busy(false);
          showError(err);
        }
      } else if (act === 'mailto') {
        const c = composeOrderMail(it, qty, note, true);
        const qs = [`subject=${encodeURIComponent(c.subject)}`, `body=${encodeURIComponent(c.body)}`];
        if (o.ccSelf !== false && isEmail(o.senderEmail)) qs.unshift(`cc=${encodeURIComponent(o.senderEmail)}`);
        const a = document.createElement('a');
        a.href = `mailto:${hasEmail ? encodeURIComponent(it.supplierEmail) : ''}?${qs.join('&')}`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast('メールを送ったら「✅ 発注済みにする」を押して記録してください', { duration: 9000 });
      } else if (act === 'mark') {
        if (!(await askConfirm(`${it.name} を ${fmtNum(qty)}${unit} 発注済みとして記録しますか？\n（メールは送りません）`, '記録する'))) return;
        sheet.busy(true, '記録しています…');
        try {
          applyResult(await call('inventory_markOrdered', { id: it.id, qty, note: note || 'メール以外で発注', userName: userName() }));
          sheet.close();
          toast('✅ 発注済みとして記録しました', { kind: 'ok' });
        } catch (err) {
          sheet.busy(false);
          showError(err);
        }
      }
    });
  }

  // ---------------------------------------------------------------- 設定
  function openSettings() {
    const s = settings();
    const o = Object.assign({}, defaultSettings().order, s.order || {});
    const admin = isAdmin();
    const dis = admin ? '' : ' disabled';
    let sups = (s.suppliers || []).map((x) => ({ name: x.name || '', email: x.email || '' }));
    const html = `
      <section class="invm-sec">
        <div class="invm-sec-title">📧 発注メール</div>
        ${admin ? '' : '<div class="invm-note-box">発注メールの設定は管理者のみ変更できます。</div>'}
        <label class="invm-label">あなたの名前</label>
        <input class="invm-input" data-k="senderName" maxlength="60" placeholder="例: 山田 太郎" value="${esc(o.senderName)}"${dis}>
        <label class="invm-label">あなたのメールアドレス（仕入れ先からの返信先・CC）</label>
        <input class="invm-input" data-k="senderEmail" type="email" inputmode="email" maxlength="120" placeholder="例: yamada@example.com" value="${esc(o.senderEmail)}"${dis}>
        <label class="invm-label">会社名・農園名</label>
        <input class="invm-input" data-k="companyName" maxlength="80" placeholder="例: 山田農園" value="${esc(o.companyName)}"${dis}>
        <label class="invm-label">メッセージ（メールの書き出し）</label>
        <textarea class="invm-input" data-k="message" rows="3" maxlength="2000"${dis}>${esc(o.message == null ? DEFAULT_MESSAGE : o.message)}</textarea>
        <label class="invm-check"><input type="checkbox" data-k="autoSend"${o.autoSend !== false ? ' checked' : ''}${dis}> 最低在庫個数を下回ったら自動で発注メールを送る</label>
        <label class="invm-check"><input type="checkbox" data-k="ccSelf"${o.ccSelf !== false ? ' checked' : ''}${dis}> 自分のメールアドレスを CC に入れる</label>
        <div data-mail-status class="invm-help"><span class="invm-inline-spinner"></span>送信サーバーの状態を確認しています…</div>
        ${admin ? `<div class="invm-row invm-mt10">
          <button type="button" class="invm-btn is-sub is-grow" data-s="test">✉️ テスト送信</button>
          <button type="button" class="invm-btn is-primary is-grow" data-s="save-order">保存する</button>
        </div>` : ''}
      </section>
      <section class="invm-sec">
        <div class="invm-sec-title">🏷️ カテゴリ</div>
        <div class="invm-tag-list" data-cat-list></div>
        <div class="invm-row invm-mt6"><button type="button" class="invm-btn is-sub" data-s="add-cat">＋ カテゴリを追加</button></div>
      </section>
      <section class="invm-sec">
        <div class="invm-sec-title">🚚 仕入れ先</div>
        <div data-sup-list></div>
        <div class="invm-row invm-mt6">
          <button type="button" class="invm-btn is-sub is-grow" data-s="add-sup">＋ 仕入れ先を追加</button>
          <button type="button" class="invm-btn is-primary is-grow" data-s="save-sup">仕入れ先を保存</button>
        </div>
        <p class="invm-help">メールアドレスを変えると、その仕入れ先を登録している資材にも反映されます。資材の登録時に入力した仕入れ先も自動で追加されます。</p>
      </section>`;
    const sheet = openSheet({ title: '⚙️ 在庫管理の設定', html, className: 'is-settings' });
    const k = (key) => sheet.q(`[data-k="${key}"]`);

    const renderCatList = () => {
      const counts = {};
      state.items.forEach((it) => { if (it.category) counts[it.category] = (counts[it.category] || 0) + 1; });
      const cats = allCategories();
      sheet.q('[data-cat-list]').innerHTML = cats.length
        ? cats.map((c) => `
          <span class="invm-tag">${esc(iconOfCategory(c))} ${esc(c)} <small>${counts[c] || 0}件</small>
            <button type="button" data-cat-rename="${esc(c)}" aria-label="名前を変更" title="名前を変更">✏️</button>
            <button type="button" data-cat-del="${esc(c)}" aria-label="削除" title="削除">✕</button>
          </span>`).join('')
        : '<div class="invm-help invm-m0">カテゴリはありません。</div>';
    };

    const renderSups = () => {
      sheet.q('[data-sup-list]').innerHTML = sups.length
        ? sups.map((x, i) => `
          <div class="invm-sup-row">
            <input class="invm-input" data-sup-name="${i}" maxlength="60" placeholder="仕入れ先名" value="${esc(x.name)}">
            <input class="invm-input" data-sup-email="${i}" type="email" inputmode="email" maxlength="120" placeholder="メールアドレス" value="${esc(x.email)}">
            <button type="button" class="invm-icon-btn" data-sup-del="${i}" aria-label="削除">✕</button>
          </div>`).join('')
        : '<div class="invm-help invm-m0">登録された仕入れ先はありません。</div>';
    };

    const renderMailStatus = (st) => {
      const box = sheet.q('[data-mail-status]');
      if (!box) return;
      if (!st || st.deployed === false) {
        box.innerHTML = `<div class="invm-note-box is-error">⚠️ 発注メールの送信機能がまだ準備されていません。${admin ? 'サーバーに order-mailer を配置してください。' : '管理者に連絡してください。'}（「✉️ メールアプリで作成」なら今すぐ発注できます）</div>`;
      } else if (!st.configured) {
        box.innerHTML = `<div class="invm-note-box is-error">⚠️ 送信用のメールアカウントが未設定です。${admin ? 'Supabase の Secrets に SMTP_USER / SMTP_PASS（Gmail はアプリパスワード）を設定してください。' : '管理者に連絡してください。'}</div>`;
      } else {
        box.innerHTML = `<div class="invm-note-box is-ok">✅ 発注メールを送信できます（送信元 ${esc(st.fromAddress || '')}）。仕入れ先からの返信は「あなたのメールアドレス」に届きます。</div>`;
      }
    };

    const readOrder = () => ({
      senderName: k('senderName').value.trim(),
      senderEmail: k('senderEmail').value.trim(),
      companyName: k('companyName').value.trim(),
      message: k('message').value,
      autoSend: k('autoSend').checked,
      ccSelf: k('ccSelf').checked
    });

    const saveSettings = async (payload, label) => {
      sheet.busy(true, label || '保存しています…');
      try {
        const res = await call('inventory_saveSettings', Object.assign({ userName: userName() }, payload));
        state.settings = res.settings;
        sheet.busy(false);
        return res;
      } catch (err) {
        sheet.busy(false);
        showError(err);
        return null;
      }
    };

    const saveOrder = async () => {
      const ord = readOrder();
      if (ord.senderEmail && !isEmail(ord.senderEmail)) {
        k('senderEmail').classList.add('is-invalid');
        toast('メールアドレスの形式が正しくありません', { kind: 'warn' });
        return false;
      }
      const res = await saveSettings({ settings: { order: ord } });
      if (!res) return false;
      if (ord.autoSend && !senderReady()) toast('自動発注には「あなたの名前」と「メールアドレス」が必要です', { kind: 'warn', duration: 7000 });
      else toast('✅ 発注メールの設定を保存しました', { kind: 'ok' });
      renderAll();
      return true;
    };

    const testMail = async () => {
      if (!(await saveOrder())) return;
      sheet.busy(true, 'テストメールを送信しています…');
      try {
        const r = await call('inventory_testMail', { userName: userName() });
        sheet.busy(false);
        if (r && r.sent) toast(`✉️ ${esc(r.to)} にテストメールを送信しました。受信を確認してください`, { kind: 'ok', duration: 8000 });
        else showError(new Error((r && r.message) || '送信できませんでした'));
      } catch (err) {
        sheet.busy(false);
        showError(err);
      }
    };

    const saveCategories = async (list, rename) => {
      const res = await saveSettings({ settings: { categories: list }, renameCategory: rename || undefined });
      if (!res) return;
      if (rename && res.renamed) {
        state.items.forEach((it) => { if (it.category === rename.from) it.category = rename.to; });
        syncLegacy();
      }
      if (rename && state.filter === rename.from) state.filter = rename.to;
      if (!rename && state.filter !== ALL && state.filter !== LOW && list.indexOf(state.filter) < 0 && !state.items.some((it) => it.category === state.filter)) state.filter = ALL;
      renderCatList();
      renderAll();
    };

    const saveSuppliers = async () => {
      const list = sups.map((x) => ({ name: x.name.trim(), email: x.email.trim() })).filter((x) => x.name || x.email);
      const bad = list.find((x) => x.email && !isEmail(x.email));
      if (bad) {
        toast(`「${esc(bad.name || bad.email)}」のメールアドレスの形式が正しくありません`, { kind: 'warn' });
        return;
      }
      const res = await saveSettings({ settings: { suppliers: list } });
      if (!res) return;
      sups = (res.settings.suppliers || []).map((x) => ({ name: x.name || '', email: x.email || '' }));
      renderSups();
      toast(`✅ 仕入れ先を保存しました${res.propagated ? `（資材 ${res.propagated}件のメールアドレスも更新）` : ''}`, { kind: 'ok' });
      if (res.propagated) load().catch(() => {});
    };

    sheet.el.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-s],[data-cat-rename],[data-cat-del],[data-sup-del]');
      if (!t) return;
      if (t.hasAttribute('data-cat-rename')) {
        const from = t.getAttribute('data-cat-rename');
        const to = String((await askText('カテゴリ名を変更', '新しい名前', from)) || '').trim().slice(0, 30);
        if (!to || to === from) return;
        const list = allCategories().map((c) => (c === from ? to : c)).filter((c, i, arr) => arr.indexOf(c) === i);
        await saveCategories(list, { from, to });
        return;
      }
      if (t.hasAttribute('data-cat-del')) {
        const c = t.getAttribute('data-cat-del');
        const used = state.items.filter((it) => it.category === c).length;
        if (used) {
          toast(`「${esc(c)}」の資材が ${used}件 あります。名前を変更するか、資材のカテゴリを変えてから削除してください`, { kind: 'warn', duration: 7000 });
          return;
        }
        if (!(await askConfirm(`カテゴリ「${c}」を削除しますか？`, '削除する', { danger: true }))) return;
        await saveCategories(allCategories().filter((x) => x !== c));
        return;
      }
      if (t.hasAttribute('data-sup-del')) {
        sups.splice(Number(t.getAttribute('data-sup-del')), 1);
        renderSups();
        return;
      }
      switch (t.getAttribute('data-s')) {
        case 'save-order': saveOrder(); break;
        case 'test': testMail(); break;
        case 'add-cat': {
          const c = String((await askText('カテゴリを追加', 'カテゴリ名', '', { placeholder: '例: 培土' })) || '').trim().slice(0, 30);
          if (c && allCategories().indexOf(c) < 0) await saveCategories(allCategories().concat([c]));
          break;
        }
        case 'add-sup':
          sups.push({ name: '', email: '' });
          renderSups();
          sheet.q(`[data-sup-name="${sups.length - 1}"]`).focus();
          break;
        case 'save-sup': saveSuppliers(); break;
        default: break;
      }
    });
    sheet.el.addEventListener('input', (e) => {
      const t = e.target;
      t.classList.remove('is-invalid');
      if (t.hasAttribute('data-sup-name')) sups[Number(t.getAttribute('data-sup-name'))].name = t.value;
      if (t.hasAttribute('data-sup-email')) sups[Number(t.getAttribute('data-sup-email'))].email = t.value;
    });

    renderCatList();
    renderSups();
    call('inventory_mailStatus', {}).then((st) => { if (!sheet.closed) renderMailStatus(st); }, () => { if (!sheet.closed) renderMailStatus(null); });
  }

  // ---------------------------------------------------------------- バーコード読み取り
  let detectorPromise = null;

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve();
      s.onerror = () => {
        s.remove();
        reject(new Error('バーコード読み取り機能を読み込めませんでした（通信状況を確認してください）'));
      };
      document.head.appendChild(s);
    });
  }

  function getDetector() {
    if (detectorPromise) return detectorPromise;
    detectorPromise = (async () => {
      const Native = global.BarcodeDetector;
      if (typeof Native === 'function') {
        try {
          const supported = typeof Native.getSupportedFormats === 'function' ? await Native.getSupportedFormats() : BARCODE_FORMATS;
          const formats = BARCODE_FORMATS.filter((x) => supported.indexOf(x) >= 0);
          if (formats.indexOf('ean_13') >= 0) return new Native({ formats });
        } catch (e) { /* ponyfill へ */ }
      }
      await loadScript(BARCODE_PONYFILL_URL);
      const Pony = (global.BarcodeDetectionAPI && global.BarcodeDetectionAPI.BarcodeDetector) || null;
      if (typeof Pony !== 'function') throw new Error('バーコード読み取り機能を読み込めませんでした');
      return new Pony({ formats: BARCODE_FORMATS });
    })();
    detectorPromise.catch(() => { detectorPromise = null; });
    return detectorPromise;
  }

  function cameraErrorMessage(err) {
    const n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'カメラの使用が許可されていません。ブラウザの設定でカメラを許可するか、数字を入力してください';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'カメラが見つかりません。数字を入力してください';
    if (n === 'NotReadableError') return 'カメラを起動できません（ほかのアプリが使用中の可能性があります）';
    return 'カメラを起動できませんでした。数字を入力してください';
  }

  function scanBarcode() {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'invm-scanner';
      ov.innerHTML = `
        <video playsinline muted autoplay></video>
        <div class="invm-scan-frame"></div>
        <div class="invm-scan-top"><span data-status>カメラを起動しています…</span><button type="button" data-close aria-label="閉じる">✕</button></div>
        <div class="invm-scan-bottom">
          <button type="button" class="invm-btn is-sub" data-torch hidden>🔦 ライト</button>
          <div class="invm-row">
            <input class="invm-input" data-manual inputmode="numeric" autocomplete="off" maxlength="64" placeholder="読めないときは数字を入力">
            <button type="button" class="invm-btn is-primary" data-manual-ok>決定</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const video = ov.querySelector('video');
      const statusEl = ov.querySelector('[data-status]');
      const manual = ov.querySelector('[data-manual]');
      let stream = null;
      let stopped = false;
      let timer = 0;

      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      };
      const finish = (code) => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        if (stream) stream.getTracks().forEach((t) => t.stop());
        document.removeEventListener('keydown', onKey, true);
        ov.remove();
        resolve(code ? normBarcode(code) : null);
      };
      const submitManual = () => {
        const val = normBarcode(manual.value);
        if (val) finish(val);
        else manual.focus();
      };
      document.addEventListener('keydown', onKey, true);
      ov.querySelector('[data-close]').addEventListener('click', () => finish(null));
      ov.querySelector('[data-manual-ok]').addEventListener('click', submitManual);
      manual.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          submitManual();
        }
      });

      (async () => {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          statusEl.textContent = 'この画面ではカメラを使えません。数字を入力してください';
          return;
        }
        const detectorP = getDetector();
        detectorP.catch(() => {});
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          });
        } catch (err) {
          if (!stopped) statusEl.textContent = cameraErrorMessage(err);
          return;
        }
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.muted = true;
        video.srcObject = stream;
        try { await video.play(); } catch (e) { /* muted のため通常は自動再生される */ }

        const track = stream.getVideoTracks()[0];
        const caps = track && typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
        if (caps && caps.torch) {
          let torchOn = false;
          const torchBtn = ov.querySelector('[data-torch]');
          torchBtn.hidden = false;
          torchBtn.addEventListener('click', () => {
            torchOn = !torchOn;
            track.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(() => {});
          });
        }

        let detector;
        try {
          detector = await detectorP;
        } catch (err) {
          if (!stopped) statusEl.textContent = `${(err && err.message) || 'バーコードを読み取れません'}。数字を入力してください`;
          return;
        }
        if (stopped) return;
        statusEl.textContent = 'バーコードを枠に合わせてください';
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2 && video.videoWidth) {
              const codes = await detector.detect(video);
              const hit = (codes || []).find((c) => c && c.rawValue);
              if (hit && !stopped) {
                if (navigator.vibrate) navigator.vibrate(60);
                finish(hit.rawValue);
                return;
              }
            }
          } catch (e) { /* 次のフレームで再試行 */ }
          if (!stopped) timer = setTimeout(tick, 150);
        };
        tick();
      })();
    });
  }

  // ---------------------------------------------------------------- 開閉・外部連携
  function open(opts = {}) {
    const root = ensureRoot();
    if (typeof opts.query === 'string') {
      state.query = opts.query;
      root.querySelector('.invm-search').value = opts.query;
      if (opts.query) state.filter = ALL;
    }
    if (opts.filter) state.filter = opts.filter;
    root.classList.add('is-open');
    document.documentElement.classList.add('invm-lock');
    state.open = true;
    renderAll();
    load().then(() => {
      if (opts.focusId) focusCard(opts.focusId);
    }).catch(() => {});
  }

  function close() {
    state.sheets.slice().forEach((s) => s.close());
    const root = document.getElementById('invmRoot');
    if (root) root.classList.remove('is-open');
    document.documentElement.classList.remove('invm-lock');
    state.open = false;
  }

  function onInitData(materials) {
    updateBadge(Array.isArray(materials) ? materials : undefined);
    if (state.open) load().catch(() => {});
  }

  function onInventoryChanged(e) {
    const d = (e && e.detail) || {};
    if (d.reload) {
      if (state.open || state.loaded) load().catch(() => {});
      return;
    }
    if (d.removedId != null) {
      removeItem(d.removedId);
      syncLegacy(null, d.removedId);
    } else if (d.item && d.item.id) {
      if (state.loaded) upsertItem(d.item);
      syncLegacy(d.item);
    }
    if (d.source === 'legacy' && (d.alert || d.order)) notifyStockResult(d.item, d.alert, d.order);
    updateBadge();
    if (state.open) renderAll();
    if (d.item && d.item.id) refreshDetail(d.item.id);
  }

  function onKeydown(e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const top = state.sheets[state.sheets.length - 1];
    if (top) {
      e.preventDefault();
      top.requestClose();
      return;
    }
    if (state.open) {
      e.preventDefault();
      close();
    }
  }

  function onImageError(e) {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    const thumb = img.closest('.invm-thumb');
    if (thumb) {
      thumb.innerHTML = '<span>📦</span>';
      return;
    }
    const candidate = img.closest('.invm-lookup-images button');
    if (candidate) candidate.remove();
  }

  function init() {
    global.addEventListener('passionmap:inventory-changed', onInventoryChanged);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('error', onImageError, true);
    const mats = legacyMaterials();
    if (mats && mats.length) updateBadge(mats);
  }

  global.InventoryUI = {
    open,
    close,
    reload: () => load(),
    refreshBadge: updateBadge,
    onInitData
  };
  global.openInventoryManager = (opts) => open(opts);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
