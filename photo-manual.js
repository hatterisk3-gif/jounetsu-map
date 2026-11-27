/**
 * 情熱MAP 写真共有インボックス ＆ マニュアル作成・閲覧・印刷 (photo-manual.js)
 * - Android Web Share Target (worker.html / schedule.html) からの写真＋一言メモ送信
 * - schedule.html: 写真仕分けボックス / 既存・新規マニュアル作成 / Canvas注釈 / A4印刷
 * - worker.html: 現場マニュアル閲覧 / A4印刷 / クイック写真送信
 */
(function (global) {
  'use strict';

  var DB_NAME = 'passionMapShareInboxDB';
  var DB_VERSION = 1;
  var STORE_NAME = 'pendingShares';

  var QUICK_MEMO_CHIPS = [
    '⚠️ 傷み・NG',
    '🐛 病害虫',
    '💔 割れ・キズ',
    '📏 サイズ基準',
    '📋 作業注意'
  ];

  var MANUAL_TYPES = [
    { key: 'damage_alert', label: '⚠️ 傷み・品質注意' },
    { key: 'work', label: '📋 作業手順' },
    { key: 'other', label: '📌 その他' }
  ];

  var PHOTO_BADGES = [
    { key: 'ng', label: '❌ NG（出荷不可）', shortLabel: '❌ NG' },
    { key: 'warn', label: '⚠️ 要注意', shortLabel: '⚠️ 要注意' },
    { key: 'ok', label: '⭕ OK（出荷可）', shortLabel: '⭕ OK' },
    { key: 'point', label: '📌 ポイント', shortLabel: '📌 ポイント' },
    { key: '', label: 'なし', shortLabel: '' }
  ];

  var DEFAULT_WORKS = ['収穫', '選別', '袋詰め', '出荷', '定植', '播種', '防除', '施肥', '芽かき', '水管理', '草刈り'];

  var state = {
    mode: detectMode_(),
    initialized: false,
    inboxItems: [],
    pendingCount: 0,
    sortedCount: 0,
    inboxFilter: 'pending',
    inboxSearch: '',
    selectedInboxIds: new Set(),
    manuals: [],
    manualFilterType: 'all',
    manualFilterCrop: '',
    manualSearch: '',
    activeHubTab: 'inbox',
    draftManual: null,
    detailManualId: '',
    printLayout: '2',
    shareModal: {
      open: false,
      batchId: '',
      source: 'manual_pick',
      files: [], // { name, type, blob, previewUrl }
      memo: '',
      cropHint: '',
      sending: false
    },
    annotator: {
      open: false,
      photoIndex: -1,
      color: '#FF1744',
      lineWidthScale: 1,
      undoStack: [],
      isDrawing: false
    }
  };

  function detectMode_() {
    try {
      var p = (global.location && global.location.pathname) ? String(global.location.pathname).toLowerCase() : '';
      if (p.indexOf('worker') >= 0) return 'worker';
      if (p.indexOf('schedule') >= 0) return 'schedule';
    } catch (e) {}
    return 'schedule';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg, isError) {
    var container = document.getElementById('pmToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pmToastContainer';
      container.className = 'pm-toast-container';
      document.body.appendChild(container);
    }
    var el = document.createElement('div');
    el.className = 'pm-toast' + (isError ? ' is-error' : '');
    el.textContent = String(msg || '');
    container.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, isError ? 4200 : 2800);
  }

  function lockScroll_(lock) {
    try {
      document.documentElement.classList.toggle('pm-lock', !!lock);
    } catch (e) {}
  }

  function refreshScrollLock_() {
    var anyOpen = !!document.querySelector('.pm-modal-backdrop.is-open');
    lockScroll_(anyOpen);
  }

  function currentUserName_() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser) return String(currentUser);
    } catch (e) {}
    try {
      return localStorage.getItem('passionMapUserName') || localStorage.getItem('pMapAdminName') || '';
    } catch (e) {
      return '';
    }
  }

  function callApi_(action, params) {
    if (typeof global.callGAS === 'function') {
      return global.callGAS(action, params || {});
    }
    return Promise.reject(new Error('API通信が初期化されていません'));
  }

  function readInitMasters_() {
    var crops = [];
    var works = [];
    try {
      var raw = localStorage.getItem('passionMapInitData');
      if (raw) {
        var parsed = JSON.parse(raw);
        var pdl = (parsed && parsed.pdl) ? parsed.pdl : (parsed || {});
        if (Array.isArray(pdl.crops)) {
          pdl.crops.forEach(function (c) {
            var name = typeof c === 'string' ? c : (c && c.name);
            if (name) crops.push(String(name).trim());
          });
        }
        if (Array.isArray(pdl.workMaster)) {
          pdl.workMaster.forEach(function (w) {
            if (w && w.name) works.push(String(w.name).trim());
            if (w && Array.isArray(w.crops)) {
              w.crops.forEach(function (c) { if (c) crops.push(String(c).trim()); });
            }
          });
        }
      }
    } catch (e) {}
    try {
      if (typeof cropMaster !== 'undefined' && Array.isArray(cropMaster)) {
        cropMaster.forEach(function (c) {
          var n = typeof c === 'string' ? c : (c && c.name);
          if (n) crops.push(String(n).trim());
        });
      }
    } catch (e) {}
    try {
      if (typeof pdlWorkMaster !== 'undefined' && Array.isArray(pdlWorkMaster)) {
        pdlWorkMaster.forEach(function (w) {
          if (w && w.name) works.push(String(w.name).trim());
        });
      }
    } catch (e) {}

    state.manuals.forEach(function (m) {
      (m.crops || []).forEach(function (c) { if (c) crops.push(String(c).trim()); });
      (m.workNames || []).forEach(function (w) { if (w) works.push(String(w).trim()); });
    });

    var uniqCrops = Array.from(new Set(crops.filter(function (c) { return c && c !== 'すべて'; })))
      .sort(function (a, b) { return a.localeCompare(b, 'ja'); });
    var uniqWorks = Array.from(new Set(works.concat(DEFAULT_WORKS).filter(Boolean)))
      .sort(function (a, b) { return a.localeCompare(b, 'ja'); });

    return { crops: uniqCrops, works: uniqWorks };
  }

  function fmtDateShort_(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso).slice(0, 10);
      var jst = new Date(d.getTime() + 9 * 3600000);
      var m = String(jst.getUTCMonth() + 1).padStart(2, '0');
      var day = String(jst.getUTCDate()).padStart(2, '0');
      var hh = String(jst.getUTCHours()).padStart(2, '0');
      var mm = String(jst.getUTCMinutes()).padStart(2, '0');
      return jst.getUTCFullYear() + '/' + m + '/' + day + ' ' + hh + ':' + mm;
    } catch (e) {
      return String(iso).slice(0, 10);
    }
  }

  function getBadgeInfo_(badgeKey) {
    return PHOTO_BADGES.find(function (b) { return b.key === (badgeKey || ''); }) || PHOTO_BADGES[PHOTO_BADGES.length - 1];
  }

  function getTypeInfo_(typeKey) {
    return MANUAL_TYPES.find(function (t) { return t.key === typeKey; }) || MANUAL_TYPES[1];
  }

  function resizeBlobToDataUrl_(blob, maxSide, quality) {
    maxSide = maxSide || 1400;
    quality = quality || 0.85;
    return new Promise(function (resolve, reject) {
      var objUrl = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width || 1;
          var h = img.naturalHeight || img.height || 1;
          var scale = Math.min(1, maxSide / Math.max(w, h, 1));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          URL.revokeObjectURL(objUrl);
          resolve(dataUrl);
        } catch (err) {
          URL.revokeObjectURL(objUrl);
          reject(err);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(objUrl);
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(new Error('画像の読み込みに失敗しました')); };
        fr.readAsDataURL(blob);
      };
      img.src = objUrl;
    });
  }

  function ensureAuthSessionReady_(waitMs) {
    waitMs = waitMs || 5000;
    return new Promise(function (resolve) {
      var start = Date.now();
      function check() {
        var bridge = global.PassionMapSupabaseBridge;
        if (bridge && typeof bridge.getAccessToken === 'function' && bridge.getAccessToken()) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= waitMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 250);
      }
      check();
    });
  }

  // ========================================================================
  // IndexedDB (Service Worker Share Target 受信バッチ)
  // ========================================================================
  function openIdb_() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open error')); };
    });
  }

  function getShareBatch_(batchId) {
    return openIdb_().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var req = store.get(batchId);
        req.onsuccess = function () {
          var val = req.result || null;
          try { db.close(); } catch (e) {}
          resolve(val);
        };
        req.onerror = function () {
          try { db.close(); } catch (e) {}
          reject(req.error);
        };
      });
    });
  }

  function listRecentShareBatches_(maxAgeMs) {
    return openIdb_().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var req = store.getAll();
        req.onsuccess = function () {
          var list = Array.isArray(req.result) ? req.result : [];
          var cutoff = Date.now() - (maxAgeMs || 15 * 60 * 1000);
          var fresh = list.filter(function (b) {
            return b && Array.isArray(b.files) && b.files.length > 0 && Number(b.receivedAt || 0) >= cutoff;
          }).sort(function (a, b) {
            return Number(b.receivedAt || 0) - Number(a.receivedAt || 0);
          });
          try { db.close(); } catch (e) {}
          resolve(fresh);
        };
        req.onerror = function () {
          try { db.close(); } catch (e) {}
          resolve([]);
        };
      });
    }).catch(function () { return []; });
  }

  function deleteShareBatch_(batchId) {
    if (!batchId) return Promise.resolve();
    return openIdb_().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(batchId);
        tx.oncomplete = function () {
          try { db.close(); } catch (e) {}
          resolve();
        };
        tx.onerror = function () {
          try { db.close(); } catch (e) {}
          resolve();
        };
      });
    }).catch(function () {});
  }

  // ========================================================================
  // 共有受信 ＆ クイック写真送信モーダル (#pmShareReceiveModal)
  // ========================================================================
  function clearSharePreviewUrls_() {
    (state.shareModal.files || []).forEach(function (f) {
      if (f && f.previewUrl) {
        try { URL.revokeObjectURL(f.previewUrl); } catch (e) {}
      }
    });
  }

  function ensureShareReceiveModal_() {
    var modal = document.getElementById('pmShareReceiveModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pmShareReceiveModal';
    modal.className = 'pm-modal-backdrop is-sub';
    modal.innerHTML =
      '<div class="pm-dialog-card" onclick="event.stopPropagation()">' +
        '<div class="pm-header is-amber">' +
          '<div class="pm-header-title">📸 情熱MAPへ写真を送る</div>' +
          '<button type="button" class="pm-close-btn" id="pmShareCloseBtn" aria-label="閉じる">×</button>' +
        '</div>' +
        '<div class="pm-body" id="pmShareModalBody"></div>' +
        '<div class="pm-footer">' +
          '<button type="button" class="pm-btn pm-btn-ghost" id="pmShareCancelBtn">キャンセル</button>' +
          '<button type="button" class="pm-btn pm-btn-amber" id="pmShareSubmitBtn">📤 送信する（写真ボックスへ）</button>' +
        '</div>' +
      '</div>';
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal && !state.shareModal.sending) closeShareReceiveModal_();
    });
    document.body.appendChild(modal);
    modal.querySelector('#pmShareCloseBtn').addEventListener('click', function () {
      if (!state.shareModal.sending) closeShareReceiveModal_();
    });
    modal.querySelector('#pmShareCancelBtn').addEventListener('click', function () {
      if (!state.shareModal.sending) closeShareReceiveModal_();
    });
    modal.querySelector('#pmShareSubmitBtn').addEventListener('click', submitShareModal_);
    return modal;
  }

  function closeShareReceiveModal_() {
    var modal = document.getElementById('pmShareReceiveModal');
    if (modal) modal.classList.remove('is-open');
    state.shareModal.open = false;
    clearSharePreviewUrls_();
    state.shareModal.files = [];
    state.shareModal.batchId = '';
    refreshScrollLock_();
  }

  function renderShareReceiveModal_() {
    var modal = ensureShareReceiveModal_();
    var body = modal.querySelector('#pmShareModalBody');
    var submitBtn = modal.querySelector('#pmShareSubmitBtn');
    var masters = readInitMasters_();
    var files = state.shareModal.files || [];

    var thumbsHtml = files.map(function (f, idx) {
      return (
        '<div class="pm-share-thumb">' +
          '<img src="' + esc(f.previewUrl) + '" alt="選択写真">' +
          '<button type="button" class="pm-share-thumb-del" data-share-remove="' + idx + '" title="外す">×</button>' +
        '</div>'
      );
    }).join('');

    var chipsHtml = QUICK_MEMO_CHIPS.map(function (c) {
      return '<button type="button" class="pm-quick-chip" data-share-chip="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');

    var cropOptions = '<option value="">（指定なし）</option>' + masters.crops.map(function (c) {
      var sel = state.shareModal.cropHint === c ? ' selected' : '';
      return '<option value="' + esc(c) + '"' + sel + '>' + esc(c) + '</option>';
    }).join('');

    body.innerHTML =
      '<div style="font-size:12px; color:#475569; margin-bottom:8px;">' +
        '送った写真は <b>予定MAP（schedule.html）の写真仕分けボックス</b> にたまります。あとからまとめてマニュアル化できます。' +
      '</div>' +
      '<div class="pm-share-preview-grid">' +
        thumbsHtml +
        '<label class="pm-share-thumb" style="display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; border-style:dashed; color:#475569; font-weight:bold; font-size:12px; gap:3px;">' +
          '<span style="font-size:22px;">＋</span><span>写真追加</span>' +
          '<input type="file" accept="image/*" multiple id="pmShareAddFileInput" style="display:none;">' +
        '</label>' +
      '</div>' +
      '<label class="pm-field-label">📝 一言メモ <span class="pm-field-sub">（そのままマニュアルの解説にも使えます）</span></label>' +
      '<div class="pm-quick-chips">' + chipsHtml + '</div>' +
      '<textarea id="pmShareMemoInput" class="pm-textarea" rows="3" placeholder="例：トマト尻腐れ、先端が黒いものは出荷NG">' + esc(state.shareModal.memo) + '</textarea>' +
      '<label class="pm-field-label">🌱 作物 <span class="pm-field-sub">（任意）</span></label>' +
      '<select id="pmShareCropSelect" class="pm-select">' + cropOptions + '</select>' +
      '<div id="pmShareStatusBox" style="margin-top:10px; font-size:12px; font-weight:bold; color:#0f766e;"></div>';

    body.querySelectorAll('[data-share-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-share-remove'));
        var removed = state.shareModal.files.splice(idx, 1)[0];
        if (removed && removed.previewUrl) {
          try { URL.revokeObjectURL(removed.previewUrl); } catch (e) {}
        }
        renderShareReceiveModal_();
      });
    });

    body.querySelectorAll('[data-share-chip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var chip = btn.getAttribute('data-share-chip') || '';
        var ta = document.getElementById('pmShareMemoInput');
        var cur = ta ? ta.value.trim() : '';
        var next = cur ? (cur.indexOf(chip) >= 0 ? cur : (chip + ' ' + cur)) : chip;
        state.shareModal.memo = next;
        if (ta) ta.value = next;
      });
    });

    var memoInput = document.getElementById('pmShareMemoInput');
    if (memoInput) {
      memoInput.addEventListener('input', function () {
        state.shareModal.memo = memoInput.value;
      });
    }
    var cropSel = document.getElementById('pmShareCropSelect');
    if (cropSel) {
      cropSel.addEventListener('change', function () {
        state.shareModal.cropHint = cropSel.value;
      });
    }
    var addInput = document.getElementById('pmShareAddFileInput');
    if (addInput) {
      addInput.addEventListener('change', function () {
        if (!addInput.files || !addInput.files.length) return;
        Array.from(addInput.files).forEach(function (file) {
          state.shareModal.files.push({
            name: file.name || 'photo.jpg',
            type: file.type || 'image/jpeg',
            blob: file,
            previewUrl: URL.createObjectURL(file)
          });
        });
        addInput.value = '';
        renderShareReceiveModal_();
      });
    }

    if (submitBtn) {
      submitBtn.disabled = state.shareModal.sending || files.length === 0;
      submitBtn.textContent = state.shareModal.sending
        ? '送信中...'
        : ('📤 送信する（' + files.length + '枚）');
    }

    modal.classList.add('is-open');
    state.shareModal.open = true;
    refreshScrollLock_();
  }

  async function submitShareModal_() {
    if (state.shareModal.sending) return;
    var files = state.shareModal.files || [];
    if (!files.length) {
      toast('送信する写真を選択してください', true);
      return;
    }

    var memoEl = document.getElementById('pmShareMemoInput');
    var cropEl = document.getElementById('pmShareCropSelect');
    var statusEl = document.getElementById('pmShareStatusBox');
    var memo = memoEl ? memoEl.value.trim() : (state.shareModal.memo || '').trim();
    var cropHint = cropEl ? cropEl.value.trim() : (state.shareModal.cropHint || '').trim();

    state.shareModal.memo = memo;
    state.shareModal.cropHint = cropHint;
    state.shareModal.sending = true;
    var submitBtn = document.getElementById('pmShareSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '送信準備中...';
    }

    try {
      if (statusEl) statusEl.textContent = 'ログイン状態を確認中...';
      var authed = await ensureAuthSessionReady_(5000);
      if (!authed) {
        throw new Error('ログイン後に、もう一度「送信する」を押してください');
      }

      var items = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (statusEl) statusEl.textContent = '画像を圧縮してアップロード準備中... (' + (i + 1) + '/' + files.length + ')';
        var dataUrl = await resizeBlobToDataUrl_(f.blob, 1400, 0.85);
        items.push({
          dataUrl: dataUrl,
          memo: memo,
          cropHint: cropHint,
          authorName: currentUserName_(),
          source: state.shareModal.source || 'manual_pick',
          takenAt: f.lastModified ? new Date(f.lastModified).toISOString() : ''
        });
      }

      if (statusEl) statusEl.textContent = 'サーバーへ送信中...';
      var res = await callApi_('photoInbox_add', {
        items: items,
        authorName: currentUserName_(),
        source: state.shareModal.source || 'manual_pick'
      });
      if (!res || res.success === false) {
        throw new Error((res && res.message) || '送信に失敗しました');
      }

      var batchId = state.shareModal.batchId;
      state.shareModal.sending = false;
      closeShareReceiveModal_();
      if (batchId) await deleteShareBatch_(batchId);

      toast('✅ 写真' + items.length + '枚を送信しました（予定MAPで仕分けできます）');
      refreshPhotoInboxBadge();
      if (state.mode === 'schedule' && document.getElementById('pmHubModal') && document.getElementById('pmHubModal').classList.contains('is-open')) {
        loadInbox_(true);
      }
    } catch (err) {
      state.shareModal.sending = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '📤 送信する（' + files.length + '枚）';
      }
      if (statusEl) {
        statusEl.style.color = '#c62828';
        statusEl.textContent = '⚠️ ' + (err && err.message ? err.message : '送信に失敗しました');
      }
      toast(err && err.message ? err.message : '写真の送信に失敗しました', true);
    }
  }

  function openQuickPhotoSendModal(initialFiles, meta) {
    clearSharePreviewUrls_();
    meta = meta || {};
    var normalized = (Array.isArray(initialFiles) ? initialFiles : []).map(function (entry) {
      var blob = (entry && entry.blob) ? entry.blob : entry;
      return {
        name: (entry && entry.name) || 'photo.jpg',
        type: (entry && entry.type) || 'image/jpeg',
        lastModified: (entry && entry.lastModified) || Date.now(),
        blob: blob,
        previewUrl: URL.createObjectURL(blob)
      };
    }).filter(function (f) { return !!f.blob; });

    state.shareModal = {
      open: true,
      batchId: meta.batchId || '',
      source: meta.source || (state.mode === 'worker' ? 'quick_worker' : 'quick_schedule'),
      files: normalized,
      memo: meta.memo || '',
      cropHint: meta.cropHint || '',
      sending: false
    };
    renderShareReceiveModal_();
  }

  async function checkIncomingSharedPhotos_() {
    try {
      var sp = new URLSearchParams(global.location.search || '');
      var batchId = sp.get('shared_photo_batch');
      if (batchId) {
        try {
          var cleanUrl = new URL(global.location.href);
          cleanUrl.searchParams.delete('shared_photo_batch');
          global.history.replaceState(null, '', cleanUrl.toString());
        } catch (e) {}

        var batch = await getShareBatch_(batchId);
        if (batch && Array.isArray(batch.files) && batch.files.length > 0) {
          var defaultMemo = [batch.title, batch.text].filter(Boolean).join(' ').trim();
          openQuickPhotoSendModal(batch.files, {
            batchId: batch.id,
            source: batch.source || 'share_target',
            memo: defaultMemo
          });
          return;
        }
      }

      // 送信途中でリロードした場合などのフォールバック（直近15分以内の未送信バッチ）
      var recent = await listRecentShareBatches_(15 * 60 * 1000);
      if (recent.length > 0 && !state.shareModal.open) {
        var latest = recent[0];
        var memoText = [latest.title, latest.text].filter(Boolean).join(' ').trim();
        openQuickPhotoSendModal(latest.files, {
          batchId: latest.id,
          source: latest.source || 'share_target',
          memo: memoText
        });
      }
    } catch (e) {
      console.warn('checkIncomingSharedPhotos_ error:', e);
    }
  }

  // ========================================================================
  // データ読込・バッジ更新
  // ========================================================================
  function updateBadges_(pendingCount) {
    var n = Number(pendingCount) || 0;
    document.querySelectorAll('[data-photo-inbox-badge]').forEach(function (el) {
      if (n > 0) {
        el.textContent = n > 99 ? '99+' : String(n);
        el.style.display = 'inline-block';
      } else {
        el.style.display = 'none';
      }
    });
    var tabBadge = document.getElementById('pmHubInboxTabCount');
    if (tabBadge) {
      if (n > 0) {
        tabBadge.textContent = String(n);
        tabBadge.style.display = 'inline-block';
      } else {
        tabBadge.style.display = 'none';
      }
    }
  }

  async function refreshPhotoInboxBadge() {
    if (state.mode !== 'schedule') return 0;
    try {
      var bridge = global.PassionMapSupabaseBridge;
      if (!bridge || typeof bridge.getAccessToken !== 'function' || !bridge.getAccessToken()) return 0;
      var res = await callApi_('photoInbox_list', { status: 'all' });
      if (res && res.success) {
        state.inboxItems = Array.isArray(res.items) ? res.items : [];
        state.pendingCount = Number(res.pendingCount) || 0;
        state.sortedCount = Number(res.sortedCount) || 0;
        updateBadges_(state.pendingCount);
        return state.pendingCount;
      }
    } catch (e) {}
    return 0;
  }

  async function loadInbox_(renderAfter) {
    try {
      var res = await callApi_('photoInbox_list', { status: 'all' });
      if (!res || res.success === false) {
        throw new Error((res && res.message) || '写真ボックスの読込に失敗しました');
      }
      state.inboxItems = Array.isArray(res.items) ? res.items : [];
      state.pendingCount = Number(res.pendingCount) || 0;
      state.sortedCount = Number(res.sortedCount) || 0;
      updateBadges_(state.pendingCount);
      if (renderAfter) renderHubContent_();
    } catch (e) {
      toast(e && e.message ? e.message : '写真ボックスの取得に失敗しました', true);
    }
  }

  async function loadManuals_(renderAfter) {
    try {
      var res = await callApi_('getManualList', {});
      if (!res || res.success === false) {
        throw new Error((res && res.message) || 'マニュアルの読込に失敗しました');
      }
      state.manuals = Array.isArray(res.manuals) ? res.manuals : [];
      try {
        localStorage.setItem('passionMapManuals', JSON.stringify(state.manuals));
      } catch (e) {}
      if (renderAfter) {
        if (state.mode === 'worker') renderWorkerViewerBody_();
        else renderHubContent_();
      }
    } catch (e) {
      toast(e && e.message ? e.message : 'マニュアルの取得に失敗しました', true);
    }
  }

  // ========================================================================
  // ライトボックス
  // ========================================================================
  function openLightbox_(src, caption) {
    var modal = document.getElementById('pmLightboxModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pmLightboxModal';
      modal.className = 'pm-modal-backdrop is-top';
      modal.innerHTML =
        '<div style="display:flex; flex-direction:column; align-items:center; gap:8px; max-width:96vw;" onclick="event.stopPropagation()">' +
          '<img id="pmLightboxImg" class="pm-lightbox-img" src="" alt="拡大画像">' +
          '<div id="pmLightboxCap" style="color:#fff; font-size:13px; font-weight:bold; text-align:center; max-width:90vw;"></div>' +
          '<button type="button" class="pm-btn pm-btn-ghost" id="pmLightboxCloseBtn">閉じる</button>' +
        '</div>';
      modal.addEventListener('click', function () {
        modal.classList.remove('is-open');
        refreshScrollLock_();
      });
      document.body.appendChild(modal);
      modal.querySelector('#pmLightboxCloseBtn').addEventListener('click', function () {
        modal.classList.remove('is-open');
        refreshScrollLock_();
      });
    }
    document.getElementById('pmLightboxImg').src = src || '';
    var capEl = document.getElementById('pmLightboxCap');
    if (capEl) {
      capEl.textContent = caption || '';
      capEl.style.display = caption ? 'block' : 'none';
    }
    modal.classList.add('is-open');
    refreshScrollLock_();
  }

  // ========================================================================
  // Canvas 注釈・回転エディター (#pmPhotoAnnotatorModal)
  // ========================================================================
  function ensureAnnotatorModal_() {
    var modal = document.getElementById('pmPhotoAnnotatorModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pmPhotoAnnotatorModal';
    modal.className = 'pm-modal-backdrop is-top';
    modal.innerHTML =
      '<div class="pm-dialog-card is-wide" onclick="event.stopPropagation()">' +
        '<div class="pm-header">' +
          '<div class="pm-header-title">🎨 写真注釈・回転</div>' +
          '<button type="button" class="pm-close-btn" id="pmAnnCloseBtn">×</button>' +
        '</div>' +
        '<div class="pm-body">' +
          '<div style="font-size:12px; color:#64748b; margin-bottom:6px;">指やマウスで丸囲みや矢印を描けます</div>' +
          '<div class="pm-annotator-canvas-wrap">' +
            '<canvas id="pmAnnCanvas" class="pm-annotator-canvas"></canvas>' +
          '</div>' +
          '<div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center;">' +
            '<button type="button" class="pm-color-dot is-active" data-ann-color="#FF1744" style="background:#FF1744;" title="赤"></button>' +
            '<button type="button" class="pm-color-dot" data-ann-color="#FFEA00" style="background:#FFEA00;" title="黄"></button>' +
            '<button type="button" class="pm-color-dot" data-ann-color="#00E676" style="background:#00E676;" title="緑"></button>' +
            '<button type="button" class="pm-color-dot" data-ann-color="#FFFFFF" style="background:#FFFFFF;" title="白"></button>' +
            '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" id="pmAnnWidthBtn">線: 中</button>' +
            '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" id="pmAnnUndoBtn">↩️ 1つ戻す</button>' +
            '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" id="pmAnnRotateBtn">🔄 90°回転</button>' +
          '</div>' +
        '</div>' +
        '<div class="pm-footer">' +
          '<button type="button" class="pm-btn pm-btn-ghost" id="pmAnnCancelBtn">キャンセル</button>' +
          '<button type="button" class="pm-btn pm-btn-primary" id="pmAnnSaveBtn">✓ 編集を確定</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('#pmAnnCloseBtn').addEventListener('click', closeAnnotatorModal_);
    modal.querySelector('#pmAnnCancelBtn').addEventListener('click', closeAnnotatorModal_);
    modal.querySelector('#pmAnnSaveBtn').addEventListener('click', saveAnnotatorResult_);
    modal.querySelector('#pmAnnUndoBtn').addEventListener('click', undoAnnotatorStroke_);
    modal.querySelector('#pmAnnRotateBtn').addEventListener('click', rotateAnnotatorCanvas_);

    var widthBtn = modal.querySelector('#pmAnnWidthBtn');
    widthBtn.addEventListener('click', function () {
      if (state.annotator.lineWidthScale === 1) {
        state.annotator.lineWidthScale = 1.8;
        widthBtn.textContent = '線: 太';
      } else if (state.annotator.lineWidthScale > 1.5) {
        state.annotator.lineWidthScale = 0.6;
        widthBtn.textContent = '線: 細';
      } else {
        state.annotator.lineWidthScale = 1;
        widthBtn.textContent = '線: 中';
      }
    });

    modal.querySelectorAll('[data-ann-color]').forEach(function (dot) {
      dot.addEventListener('click', function () {
        state.annotator.color = dot.getAttribute('data-ann-color') || '#FF1744';
        modal.querySelectorAll('[data-ann-color]').forEach(function (d) {
          d.classList.toggle('is-active', d === dot);
        });
      });
    });

    setupAnnotatorPointerEvents_(modal.querySelector('#pmAnnCanvas'));
    return modal;
  }

  function setupAnnotatorPointerEvents_(canvas) {
    if (!canvas || canvas._pmBound) return;
    canvas._pmBound = true;

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var sx = canvas.width / Math.max(1, rect.width);
      var sy = canvas.height / Math.max(1, rect.height);
      var pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
      return { x: (pt.clientX - rect.left) * sx, y: (pt.clientY - rect.top) * sy };
    }

    function pushUndo() {
      try {
        var ctx = canvas.getContext('2d');
        state.annotator.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (state.annotator.undoStack.length > 15) state.annotator.undoStack.shift();
      } catch (e) {}
    }

    function onStart(e) {
      if (e.cancelable) e.preventDefault();
      pushUndo();
      state.annotator.isDrawing = true;
      var pos = getPos(e);
      var ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = state.annotator.color;
      ctx.lineWidth = Math.max(4, (Math.max(canvas.width, canvas.height) / 110) * state.annotator.lineWidthScale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    function onMove(e) {
      if (!state.annotator.isDrawing) return;
      if (e.cancelable) e.preventDefault();
      var pos = getPos(e);
      var ctx = canvas.getContext('2d');
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }

    function onEnd() {
      state.annotator.isDrawing = false;
    }

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    global.addEventListener('mouseup', onEnd);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
  }

  function undoAnnotatorStroke_() {
    var canvas = document.getElementById('pmAnnCanvas');
    if (!canvas || !state.annotator.undoStack.length) return;
    var snap = state.annotator.undoStack.pop();
    var ctx = canvas.getContext('2d');
    canvas.width = snap.width;
    canvas.height = snap.height;
    ctx.putImageData(snap, 0, 0);
  }

  function rotateAnnotatorCanvas_() {
    var canvas = document.getElementById('pmAnnCanvas');
    if (!canvas) return;
    try {
      var ctx = canvas.getContext('2d');
      state.annotator.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (state.annotator.undoStack.length > 15) state.annotator.undoStack.shift();
    } catch (e) {}
    var tmp = document.createElement('canvas');
    tmp.width = canvas.height;
    tmp.height = canvas.width;
    var tCtx = tmp.getContext('2d');
    tCtx.translate(tmp.width / 2, tmp.height / 2);
    tCtx.rotate(Math.PI / 2);
    tCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    canvas.width = tmp.width;
    canvas.height = tmp.height;
    canvas.getContext('2d').drawImage(tmp, 0, 0);
  }

  function closeAnnotatorModal_() {
    var modal = document.getElementById('pmPhotoAnnotatorModal');
    if (modal) modal.classList.remove('is-open');
    state.annotator.open = false;
    state.annotator.photoIndex = -1;
    state.annotator.undoStack = [];
    refreshScrollLock_();
  }

  async function openAnnotatorModal_(photoIndex) {
    if (!state.draftManual || !state.draftManual.photos[photoIndex]) return;
    var photo = state.draftManual.photos[photoIndex];
    var src = photo.dataUrl || photo.url;
    if (!src) return;

    var modal = ensureAnnotatorModal_();
    var canvas = modal.querySelector('#pmAnnCanvas');
    var ctx = canvas.getContext('2d');
    state.annotator.open = true;
    state.annotator.photoIndex = photoIndex;
    state.annotator.undoStack = [];
    modal.classList.add('is-open');
    refreshScrollLock_();

    var loadSrc = src;
    var revokeLater = '';
    if (/^https?:\/\//i.test(src)) {
      try {
        var res = await fetch(src, { mode: 'cors' });
        if (res.ok) {
          var blob = await res.blob();
          loadSrc = URL.createObjectURL(blob);
          revokeLater = loadSrc;
        }
      } catch (e) {}
    }

    var img = new Image();
    if (/^https?:\/\//i.test(loadSrc)) img.crossOrigin = 'anonymous';
    img.onload = function () {
      var maxSide = 1400;
      var w = img.naturalWidth || img.width || 800;
      var h = img.naturalHeight || img.height || 600;
      var scale = Math.min(1, maxSide / Math.max(w, h, 1));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (revokeLater) {
        try { URL.revokeObjectURL(revokeLater); } catch (e) {}
      }
    };
    img.onerror = function () {
      if (revokeLater) {
        try { URL.revokeObjectURL(revokeLater); } catch (e) {}
      }
      toast('画像を編集用に読み込めませんでした（CORS制限の可能性があります）', true);
      closeAnnotatorModal_();
    };
    img.src = loadSrc;
  }

  function saveAnnotatorResult_() {
    var canvas = document.getElementById('pmAnnCanvas');
    if (!canvas || !state.draftManual || state.annotator.photoIndex < 0) return;
    try {
      var dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      var target = state.draftManual.photos[state.annotator.photoIndex];
      if (target) {
        target.dataUrl = dataUrl;
        target.url = dataUrl;
      }
      closeAnnotatorModal_();
      renderHubContent_();
      toast('写真の編集を反映しました');
    } catch (e) {
      toast('画像の書き出しに失敗しました（CORS制限のため保存できません）', true);
    }
  }

  // ========================================================================
  // 既存マニュアルへ追加ピッカー / 写真ボックスから追加ピッカー
  // ========================================================================
  function openAppendToManualPicker_(inboxIds) {
    var manuals = state.manuals || [];
    if (!manuals.length) {
      toast('まだマニュアルがありません。「選択写真でマニュアル作成」をお使いください', true);
      return;
    }
    var modal = document.getElementById('pmAppendManualModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pmAppendManualModal';
      modal.className = 'pm-modal-backdrop is-sub';
      modal.addEventListener('click', function (ev) {
        if (ev.target === modal) {
          modal.classList.remove('is-open');
          refreshScrollLock_();
        }
      });
      document.body.appendChild(modal);
    }

    var listHtml = manuals.map(function (m) {
      var ti = getTypeInfo_(m.manualType);
      var cropsStr = (m.crops || []).join('・');
      return (
        '<button type="button" class="pm-btn pm-btn-ghost" data-pick-manual="' + esc(m.id) + '" style="width:100%; justify-content:space-between; text-align:left; padding:10px 12px; background:#fff;">' +
          '<span style="min-width:0; overflow:hidden; text-overflow:ellipsis;">' +
            '<span style="font-size:11px; color:#64748b;">' + esc(ti.label) + (cropsStr ? ' / ' + esc(cropsStr) : '') + '</span><br>' +
            '<span>' + esc(m.title) + '</span>' +
          '</span>' +
          '<span style="font-size:12px; color:#2e7d32;">＋ 追加</span>' +
        '</button>'
      );
    }).join('');

    modal.innerHTML =
      '<div class="pm-dialog-card" onclick="event.stopPropagation()">' +
        '<div class="pm-header">' +
          '<div class="pm-header-title">➕ 既存マニュアルへ写真を追加（' + inboxIds.length + '枚）</div>' +
          '<button type="button" class="pm-close-btn" id="pmAppendCloseBtn">×</button>' +
        '</div>' +
        '<div class="pm-body" style="display:flex; flex-direction:column; gap:8px;">' + listHtml + '</div>' +
      '</div>';

    modal.querySelector('#pmAppendCloseBtn').addEventListener('click', function () {
      modal.classList.remove('is-open');
      refreshScrollLock_();
    });

    modal.querySelectorAll('[data-pick-manual]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var manualId = btn.getAttribute('data-pick-manual');
        var target = (state.manuals || []).find(function (m) { return m.id === manualId; });
        if (!target) return;

        var selectedItems = (state.inboxItems || []).filter(function (it) {
          return inboxIds.indexOf(it.id) >= 0;
        });
        if (!selectedItems.length) return;

        btn.disabled = true;
        btn.textContent = '追加中...';

        try {
          var nextPhotos = (target.photos || []).slice();
          selectedItems.forEach(function (it) {
            nextPhotos.push({
              id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
              url: it.url,
              dataUrl: it.url,
              caption: it.memo || '',
              badge: target.manualType === 'damage_alert' ? 'ng' : '',
              inboxItemId: it.id,
              rotation: 0
            });
          });
          var updatedManual = Object.assign({}, target, { photos: nextPhotos });
          var saveRes = await callApi_('saveManualData', { manual: updatedManual });
          if (!saveRes || saveRes.success === false) {
            throw new Error((saveRes && saveRes.message) || 'マニュアル更新に失敗しました');
          }
          var nowIso = new Date().toISOString();
          for (var i = 0; i < selectedItems.length; i++) {
            await callApi_('photoInbox_update', {
              id: selectedItems[i].id,
              addLink: { type: 'manual', id: target.id, title: target.title, sortedAt: nowIso },
              userName: currentUserName_()
            });
          }
          state.selectedInboxIds.clear();
          modal.classList.remove('is-open');
          refreshScrollLock_();
          await Promise.all([loadManuals_(false), loadInbox_(false)]);
          renderHubContent_();
          toast('✅ 「' + target.title + '」に' + selectedItems.length + '枚を追加しました');
        } catch (err) {
          btn.disabled = false;
          toast(err && err.message ? err.message : '追加に失敗しました', true);
        }
      });
    });

    modal.classList.add('is-open');
    refreshScrollLock_();
  }

  function openPickInboxIntoDraftModal_() {
    var items = state.inboxItems || [];
    if (!items.length) {
      toast('写真ボックスに写真がありません', true);
      return;
    }
    var modal = document.getElementById('pmPickInboxModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pmPickInboxModal';
      modal.className = 'pm-modal-backdrop is-sub';
      modal.addEventListener('click', function (ev) {
        if (ev.target === modal) {
          modal.classList.remove('is-open');
          refreshScrollLock_();
        }
      });
      document.body.appendChild(modal);
    }

    var picked = new Set();
    var cardsHtml = items.map(function (it) {
      return (
        '<label class="pm-inbox-card" style="cursor:pointer;">' +
          '<div class="pm-inbox-img-wrap" style="height:120px;">' +
            '<img src="' + esc(it.url) + '" alt="写真">' +
            '<span class="pm-inbox-check"><input type="checkbox" value="' + esc(it.id) + '"></span>' +
            '<span class="pm-status-tag ' + (it.status === 'sorted' ? 'is-sorted' : 'is-pending') + '">' + (it.status === 'sorted' ? '仕分け済' : '未仕分け') + '</span>' +
          '</div>' +
          '<div class="pm-inbox-card-body">' +
            '<div style="font-size:12px; font-weight:bold;">' + esc(it.memo || '（メモなし）') + '</div>' +
          '</div>' +
        '</label>'
      );
    }).join('');

    modal.innerHTML =
      '<div class="pm-dialog-card is-wide" onclick="event.stopPropagation()">' +
        '<div class="pm-header">' +
          '<div class="pm-header-title">📥 写真ボックスから追加</div>' +
          '<button type="button" class="pm-close-btn" id="pmPickInboxCloseBtn">×</button>' +
        '</div>' +
        '<div class="pm-body"><div class="pm-inbox-grid">' + cardsHtml + '</div></div>' +
        '<div class="pm-footer">' +
          '<button type="button" class="pm-btn pm-btn-ghost" id="pmPickInboxCancelBtn">キャンセル</button>' +
          '<button type="button" class="pm-btn pm-btn-primary" id="pmPickInboxApplyBtn">選択した写真を追加</button>' +
        '</div>' +
      '</div>';

    modal.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) picked.add(cb.value);
        else picked.delete(cb.value);
      });
    });

    function closePicker() {
      modal.classList.remove('is-open');
      refreshScrollLock_();
    }
    modal.querySelector('#pmPickInboxCloseBtn').addEventListener('click', closePicker);
    modal.querySelector('#pmPickInboxCancelBtn').addEventListener('click', closePicker);
    modal.querySelector('#pmPickInboxApplyBtn').addEventListener('click', function () {
      if (!picked.size) {
        toast('追加する写真を選んでください', true);
        return;
      }
      var isAlert = state.draftManual && state.draftManual.manualType === 'damage_alert';
      items.forEach(function (it) {
        if (picked.has(it.id)) {
          state.draftManual.photos.push({
            id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            url: it.url,
            dataUrl: it.url,
            caption: it.memo || '',
            badge: isAlert ? 'ng' : '',
            inboxItemId: it.id,
            rotation: 0
          });
        }
      });
      closePicker();
      renderHubContent_();
      toast('写真' + picked.size + '枚を追加しました');
    });

    modal.classList.add('is-open');
    refreshScrollLock_();
  }

  // ========================================================================
  // マニュアル詳細ビューワー (#pmManualDetailModal) ＆ A4 印刷エンジン
  // ========================================================================
  function ensureDetailModal_() {
    var modal = document.getElementById('pmManualDetailModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pmManualDetailModal';
    modal.className = 'pm-modal-backdrop is-sub';
    modal.innerHTML =
      '<div class="pm-dialog-card is-wide" onclick="event.stopPropagation()">' +
        '<div class="pm-header" id="pmDetailHeader">' +
          '<div class="pm-header-title" id="pmDetailHdrTitle">📖 マニュアル詳細</div>' +
          '<div class="pm-header-actions">' +
            '<button type="button" class="pm-hdr-btn" id="pmDetailEditBtn" style="display:none;">✏️ 編集</button>' +
            '<button type="button" class="pm-close-btn" id="pmDetailCloseBtn">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="pm-body" id="pmDetailBody"></div>' +
        '<div class="pm-footer">' +
          '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
            '<label style="font-size:12px; font-weight:bold; color:#475569;">印刷配置:</label>' +
            '<select id="pmPrintLayoutSelect" class="pm-select" style="width:auto; padding:5px 8px; font-size:12px;">' +
              '<option value="2">2列（A4掲示用）</option>' +
              '<option value="1">1列（写真大きめ）</option>' +
            '</select>' +
            '<button type="button" class="pm-btn pm-btn-blue" id="pmDetailPrintBtn">🖨️ 印刷 / PDF保存</button>' +
          '</div>' +
          '<button type="button" class="pm-btn pm-btn-primary" id="pmDetailOkBtn">閉じる</button>' +
        '</div>' +
      '</div>';
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) closeDetailModal_();
    });
    document.body.appendChild(modal);
    modal.querySelector('#pmDetailCloseBtn').addEventListener('click', closeDetailModal_);
    modal.querySelector('#pmDetailOkBtn').addEventListener('click', closeDetailModal_);
    modal.querySelector('#pmPrintLayoutSelect').addEventListener('change', function (e) {
      state.printLayout = e.target.value || '2';
    });
    modal.querySelector('#pmDetailPrintBtn').addEventListener('click', function () {
      if (state.detailManualId) {
        printPassionManual(state.detailManualId, state.printLayout);
      }
    });
    modal.querySelector('#pmDetailEditBtn').addEventListener('click', function () {
      var id = state.detailManualId;
      closeDetailModal_();
      if (id) openDraftForEdit_(id);
    });
    return modal;
  }

  function closeDetailModal_() {
    var modal = document.getElementById('pmManualDetailModal');
    if (modal) modal.classList.remove('is-open');
    state.detailManualId = '';
    refreshScrollLock_();
  }

  function openManualDetailModal_(manualId) {
    var manual = (state.manuals || []).find(function (m) { return m.id === manualId; });
    if (!manual) {
      toast('対象のマニュアルが見つかりません', true);
      return;
    }
    state.detailManualId = manual.id;
    var modal = ensureDetailModal_();
    var header = modal.querySelector('#pmDetailHeader');
    var editBtn = modal.querySelector('#pmDetailEditBtn');
    var body = modal.querySelector('#pmDetailBody');

    header.className = 'pm-header' + (manual.manualType === 'damage_alert' ? ' is-amber' : '');
    editBtn.style.display = state.mode === 'schedule' ? 'inline-flex' : 'none';

    var ti = getTypeInfo_(manual.manualType);
    var cropTags = (manual.crops || []).map(function (c) {
      return '<span class="pm-tag is-crop">🌱 ' + esc(c) + '</span>';
    }).join('');
    var workTags = (manual.workNames || []).map(function (w) {
      return '<span class="pm-tag is-work">📝 ' + esc(w) + '</span>';
    }).join('');

    var cautionHtml = manual.notice
      ? '<div class="pm-detail-caution">⚠️ 注意点・重要ポイント\n' + esc(manual.notice) + '</div>'
      : '';

    var photos = Array.isArray(manual.photos) ? manual.photos : [];
    var photosHtml = photos.length
      ? '<div class="pm-detail-photos">' + photos.map(function (p, idx) {
          var src = (p && (p.url || p.dataUrl)) || '';
          var bi = getBadgeInfo_(p && p.badge);
          var badgeHtml = bi.key
            ? '<span class="pm-judgment-ribbon is-' + esc(bi.key) + '">' + esc(bi.label) + '</span>'
            : '';
          var capHtml = (p && p.caption)
            ? '<div class="pm-detail-photo-cap">' + esc(p.caption) + '</div>'
            : '';
          return (
            '<div class="pm-detail-photo-card">' +
              '<div class="pm-detail-photo-imgwrap" data-detail-zoom="' + idx + '">' +
                '<img src="' + esc(src) + '" alt="マニュアル写真">' +
                badgeHtml +
              '</div>' +
              capHtml +
            '</div>'
          );
        }).join('') + '</div>'
      : '';

    var steps = Array.isArray(manual.steps) ? manual.steps.filter(function (s) {
      return typeof s === 'string' ? s.trim() !== '' : !!(s && (s.text || s.body));
    }) : [];
    var stepsHtml = steps.length
      ? '<div style="font-size:14px; font-weight:bold; margin:8px 0; border-bottom:2px solid #2e7d32; padding-bottom:4px;">📋 手順・確認ポイント</div>' +
        steps.map(function (s, idx) {
          var txt = typeof s === 'string' ? s : (s.text || s.body || '');
          return (
            '<div class="pm-detail-step">' +
              '<div class="pm-step-num" style="margin-top:0;">' + (idx + 1) + '</div>' +
              '<div style="flex:1; white-space:pre-wrap;">' + esc(txt) + '</div>' +
            '</div>'
          );
        }).join('')
      : '';

    body.innerHTML =
      '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:8px;">' +
        '<span class="pm-tag" style="background:' + (manual.manualType === 'damage_alert' ? '#ffebee; color:#b71c1c' : '#e8f5e9; color:#1b5e20') + ';">' + esc(ti.label) + '</span>' +
        cropTags + workTags +
      '</div>' +
      '<h2 style="margin:0 0 8px; font-size:20px; color:#0f172a;">' + esc(manual.title || '無題のマニュアル') + '</h2>' +
      '<div style="font-size:11px; color:#64748b; margin-bottom:12px;">' +
        (manual.updatedAt ? ('更新: ' + esc(fmtDateShort_(manual.updatedAt))) : '') +
        (manual.authorName ? (' / 作成: ' + esc(manual.authorName)) : '') +
      '</div>' +
      cautionHtml +
      photosHtml +
      stepsHtml;

    body.querySelectorAll('[data-detail-zoom]').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = Number(el.getAttribute('data-detail-zoom'));
        var p = photos[idx];
        if (p) openLightbox_(p.url || p.dataUrl, p.caption || '');
      });
    });

    modal.querySelector('#pmPrintLayoutSelect').value = state.printLayout;
    modal.classList.add('is-open');
    refreshScrollLock_();
  }

  function waitImagesLoaded_(root, timeoutMs) {
    var imgs = Array.from(root.querySelectorAll('img'));
    if (!imgs.length) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(); }
      }, timeoutMs || 5000);
      var remaining = imgs.length;
      function tick() {
        remaining -= 1;
        if (remaining <= 0 && !done) {
          done = true;
          clearTimeout(timer);
          resolve();
        }
      }
      imgs.forEach(function (img) {
        if (img.complete) tick();
        else {
          img.addEventListener('load', tick, { once: true });
          img.addEventListener('error', tick, { once: true });
        }
      });
    });
  }

  async function printPassionManual(manualId, layoutMode) {
    var manual = (state.manuals || []).find(function (m) { return m.id === manualId; });
    if (!manual) {
      toast('印刷対象のマニュアルが見つかりません', true);
      return;
    }

    var printRoot = document.getElementById('pmPrintRoot');
    if (!printRoot) {
      printRoot = document.createElement('div');
      printRoot.id = 'pmPrintRoot';
      document.body.appendChild(printRoot);
    }

    var ti = getTypeInfo_(manual.manualType);
    var gridCls = (String(layoutMode || state.printLayout || '2') === '1') ? 'pm-print-grid-1' : 'pm-print-grid-2';
    var metaPills = []
      .concat((manual.crops || []).map(function (c) { return '<span class="pm-print-pill">🌱 ' + esc(c) + '</span>'; }))
      .concat((manual.workNames || []).map(function (w) { return '<span class="pm-print-pill">📝 ' + esc(w) + '</span>'; }))
      .join('');

    var cautionHtml = manual.notice
      ? '<div class="pm-print-caution">⚠️ 注意点・重要ポイント\n' + esc(manual.notice) + '</div>'
      : '';

    var photos = Array.isArray(manual.photos) ? manual.photos : [];
    var photosHtml = photos.length
      ? '<div class="' + gridCls + '">' + photos.map(function (p) {
          var src = (p && (p.url || p.dataUrl)) || '';
          var bi = getBadgeInfo_(p && p.badge);
          var headHtml = bi.key
            ? '<div class="pm-print-photo-head is-' + esc(bi.key) + '">' + esc(bi.label) + '</div>'
            : '';
          var capHtml = (p && p.caption)
            ? '<div class="pm-print-photo-cap">' + esc(p.caption) + '</div>'
            : '';
          return (
            '<div class="pm-print-photo-card">' +
              headHtml +
              '<img src="' + esc(src) + '" alt="マニュアル写真">' +
              capHtml +
            '</div>'
          );
        }).join('') + '</div>'
      : '';

    var steps = Array.isArray(manual.steps) ? manual.steps.filter(function (s) {
      return typeof s === 'string' ? s.trim() !== '' : !!(s && (s.text || s.body));
    }) : [];
    var stepsHtml = steps.length
      ? '<div class="pm-print-steps-title">📋 手順・確認ポイント</div>' +
        steps.map(function (s, idx) {
          var txt = typeof s === 'string' ? s : (s.text || s.body || '');
          return (
            '<div class="pm-print-step">' +
              '<div class="pm-print-step-no">' + (idx + 1) + '</div>' +
              '<div style="flex:1; white-space:pre-wrap;">' + esc(txt) + '</div>' +
            '</div>'
          );
        }).join('')
      : '';

    var todayJst = fmtDateShort_(new Date().toISOString()).slice(0, 10);

    printRoot.innerHTML =
      '<div class="pm-print-banner is-' + esc(manual.manualType || 'work') + '">' +
        '<span>' + esc(ti.label) + '</span>' +
        '<span>情熱MAP 現場掲示マニュアル</span>' +
      '</div>' +
      '<h1 class="pm-print-title">' + esc(manual.title || '無題のマニュアル') + '</h1>' +
      '<div class="pm-print-meta">' +
        metaPills +
        (manual.updatedAt ? ('<span class="pm-print-pill">更新: ' + esc(fmtDateShort_(manual.updatedAt).slice(0, 10)) + '</span>') : '') +
      '</div>' +
      cautionHtml +
      photosHtml +
      stepsHtml +
      '<div class="pm-print-footer">' +
        '<span>情熱MAP マニュアル</span>' +
        '<span>印刷日: ' + esc(todayJst) + '</span>' +
      '</div>';

    toast('印刷プレビューを準備しています...');
    await waitImagesLoaded_(printRoot, 5500);

    function cleanup() {
      document.body.classList.remove('pm-printing');
    }
    global.addEventListener('afterprint', cleanup, { once: true });
    document.body.classList.add('pm-printing');
    setTimeout(function () {
      try { global.print(); } catch (e) {}
    }, 80);
    setTimeout(cleanup, 60000);
  }

  // ========================================================================
  // schedule.html 用ハブモーダル (#pmHubModal)
  // ========================================================================
  function newDraftManual_(overrides) {
    overrides = overrides || {};
    return {
      id: overrides.id || null,
      manualType: overrides.manualType || 'damage_alert',
      title: overrides.title || '',
      category: overrides.category || '',
      crops: Array.isArray(overrides.crops) ? overrides.crops.slice() : [],
      workNames: Array.isArray(overrides.workNames) ? overrides.workNames.slice() : [],
      notice: overrides.notice || '',
      steps: Array.isArray(overrides.steps) && overrides.steps.length ? overrides.steps.slice() : [''],
      photos: Array.isArray(overrides.photos) ? overrides.photos.slice() : [],
      authorName: overrides.authorName || currentUserName_(),
      createdAt: overrides.createdAt || ''
    };
  }

  function openDraftFromInboxItems_(items) {
    var list = Array.isArray(items) ? items : [];
    var cropSet = [];
    var memos = [];
    list.forEach(function (it) {
      if (it.cropHint && cropSet.indexOf(it.cropHint) < 0) cropSet.push(it.cropHint);
      if (it.memo && memos.indexOf(it.memo) < 0) memos.push(it.memo);
    });
    state.draftManual = newDraftManual_({
      manualType: 'damage_alert',
      crops: cropSet,
      notice: memos.join('\n'),
      photos: list.map(function (it) {
        return {
          id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
          url: it.url,
          dataUrl: it.url,
          caption: it.memo || '',
          badge: 'ng',
          inboxItemId: it.id,
          rotation: 0
        };
      })
    });
    state.activeHubTab = 'editor';
    renderHubTabs_();
    renderHubContent_();
  }

  function openDraftForEdit_(manualId) {
    var m = (state.manuals || []).find(function (x) { return x.id === manualId; });
    if (!m) return;
    state.draftManual = newDraftManual_({
      id: m.id,
      manualType: m.manualType || 'work',
      title: m.title || '',
      category: m.category || '',
      crops: m.crops || [],
      workNames: m.workNames || [],
      notice: m.notice || '',
      steps: (m.steps && m.steps.length) ? m.steps.map(function (s) { return typeof s === 'string' ? s : (s.text || s.body || ''); }) : [''],
      photos: (m.photos || []).map(function (p) {
        return {
          id: p.id || ('p_' + Date.now()),
          url: p.url || p.dataUrl || '',
          dataUrl: p.url || p.dataUrl || '',
          caption: p.caption || '',
          badge: p.badge || '',
          inboxItemId: p.inboxItemId || '',
          rotation: Number(p.rotation) || 0
        };
      }),
      authorName: m.authorName || currentUserName_(),
      createdAt: m.createdAt || ''
    });
    state.activeHubTab = 'editor';
    renderHubTabs_();
    renderHubContent_();
  }

  function ensureHubModal_() {
    var modal = document.getElementById('pmHubModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pmHubModal';
    modal.className = 'pm-modal-backdrop';
    modal.innerHTML =
      '<div class="pm-full-sheet" onclick="event.stopPropagation()">' +
        '<div class="pm-header">' +
          '<div class="pm-header-title">📸 写真仕分け・マニュアル</div>' +
          '<div class="pm-header-actions">' +
            '<button type="button" class="pm-hdr-btn" id="pmHubQuickSendBtn">＋ 写真追加</button>' +
            '<button type="button" class="pm-close-btn" id="pmHubCloseBtn" aria-label="閉じる">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="pm-tabs">' +
          '<button type="button" class="pm-tab-btn" data-pm-tab="inbox">📥 写真仕分け <span class="pm-tab-count" id="pmHubInboxTabCount" style="display:none;">0</span></button>' +
          '<button type="button" class="pm-tab-btn" data-pm-tab="manuals">📖 マニュアル一覧</button>' +
          '<button type="button" class="pm-tab-btn" data-pm-tab="editor">✏️ 作成・編集</button>' +
        '</div>' +
        '<div class="pm-body" id="pmHubBody"></div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('#pmHubCloseBtn').addEventListener('click', closeHubModal_);
    modal.querySelector('#pmHubQuickSendBtn').addEventListener('click', function () {
      openQuickPhotoSendModal([], { source: 'schedule_hub' });
    });
    modal.querySelectorAll('[data-pm-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-pm-tab');
        if (tab === 'editor' && !state.draftManual) {
          state.draftManual = newDraftManual_();
        }
        state.activeHubTab = tab;
        renderHubTabs_();
        renderHubContent_();
      });
    });
    return modal;
  }

  function closeHubModal_() {
    var modal = document.getElementById('pmHubModal');
    if (modal) modal.classList.remove('is-open');
    refreshScrollLock_();
  }

  function renderHubTabs_() {
    var modal = document.getElementById('pmHubModal');
    if (!modal) return;
    modal.querySelectorAll('[data-pm-tab]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-pm-tab') === state.activeHubTab);
    });
    updateBadges_(state.pendingCount);
  }

  function renderHubContent_() {
    var body = document.getElementById('pmHubBody');
    if (!body) return;
    if (state.activeHubTab === 'inbox') renderInboxTab_(body);
    else if (state.activeHubTab === 'manuals') renderManualsListTab_(body, true);
    else renderEditorTab_(body);
  }

  function renderInboxTab_(container) {
    var q = (state.inboxSearch || '').trim().toLowerCase();
    var filtered = (state.inboxItems || []).filter(function (it) {
      if (state.inboxFilter === 'pending' && it.status !== 'pending') return false;
      if (state.inboxFilter === 'sorted' && it.status !== 'sorted') return false;
      if (!q) return true;
      return (it.memo || '').toLowerCase().indexOf(q) >= 0 ||
        (it.cropHint || '').toLowerCase().indexOf(q) >= 0 ||
        (it.authorName || '').toLowerCase().indexOf(q) >= 0;
    });

    var toolbarHtml =
      '<div class="pm-toolbar">' +
        '<div class="pm-pill-group">' +
          '<button type="button" class="pm-pill ' + (state.inboxFilter === 'pending' ? 'is-active is-alert' : '') + '" data-inbox-filter="pending">未仕分け (' + state.pendingCount + ')</button>' +
          '<button type="button" class="pm-pill ' + (state.inboxFilter === 'sorted' ? 'is-active' : '') + '" data-inbox-filter="sorted">仕分け済 (' + state.sortedCount + ')</button>' +
          '<button type="button" class="pm-pill ' + (state.inboxFilter === 'all' ? 'is-active' : '') + '" data-inbox-filter="all">すべて</button>' +
        '</div>' +
        '<input type="search" id="pmInboxSearchInput" class="pm-input" placeholder="🔍 メモ・作物・投稿者で検索..." value="' + esc(state.inboxSearch) + '">' +
        '<button type="button" class="pm-btn pm-btn-amber" id="pmInboxAddBtn">📸 写真を追加</button>' +
      '</div>';

    var gridHtml = '';
    if (!filtered.length) {
      gridHtml =
        '<div class="pm-empty-box">' +
          '<div style="font-size:32px; margin-bottom:6px;">📥</div>' +
          '<div style="font-weight:bold; font-size:15px; margin-bottom:4px;">' + (state.inboxFilter === 'pending' ? '未仕分けの写真はありません' : '該当する写真がありません') + '</div>' +
          '<div style="font-size:12px;">Androidの「共有」から情熱MAP・予定MAPへ送った写真がここにたまります。</div>' +
        '</div>';
    } else {
      gridHtml = '<div class="pm-inbox-grid">' + filtered.map(function (it) {
        var checked = state.selectedInboxIds.has(it.id);
        var linksHtml = (it.sortedLinks || []).map(function (lnk) {
          return '<button type="button" class="pm-link-chip" data-open-manual="' + esc(lnk.id) + '">📖 ' + esc(lnk.title || 'マニュアル') + '</button>';
        }).join('');
        return (
          '<div class="pm-inbox-card ' + (checked ? 'is-selected' : '') + '">' +
            '<div class="pm-inbox-img-wrap" data-inbox-zoom="' + esc(it.id) + '">' +
              '<img src="' + esc(it.url) + '" alt="共有写真">' +
              '<label class="pm-inbox-check" onclick="event.stopPropagation()">' +
                '<input type="checkbox" data-inbox-check="' + esc(it.id) + '"' + (checked ? ' checked' : '') + '>' +
              '</label>' +
              '<span class="pm-status-tag ' + (it.status === 'sorted' ? 'is-sorted' : 'is-pending') + '">' + (it.status === 'sorted' ? '仕分け済' : '未仕分け') + '</span>' +
            '</div>' +
            '<div class="pm-inbox-card-body">' +
              '<div class="pm-inbox-memo ' + (it.memo ? '' : 'is-empty') + '">' + esc(it.memo || '（メモなし）') + '</div>' +
              '<div class="pm-inbox-meta">' +
                (it.cropHint ? ('<span>🌱 ' + esc(it.cropHint) + '</span>') : '') +
                (it.authorName ? ('<span>👤 ' + esc(it.authorName) + '</span>') : '') +
                (it.createdAt ? ('<span>🕒 ' + esc(fmtDateShort_(it.createdAt)) + '</span>') : '') +
              '</div>' +
              (linksHtml ? ('<div class="pm-inbox-links">' + linksHtml + '</div>') : '') +
              '<div class="pm-inbox-card-actions">' +
                '<button type="button" class="pm-btn pm-btn-primary pm-btn-sm" style="flex:1;" data-inbox-to-manual="' + esc(it.id) + '">📖 マニュアル化</button>' +
                '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" data-inbox-edit-memo="' + esc(it.id) + '" title="メモ編集">✏️</button>' +
                '<button type="button" class="pm-btn pm-btn-danger pm-btn-sm" data-inbox-del="' + esc(it.id) + '" title="削除">🗑️</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('') + '</div>';
    }

    var selCount = state.selectedInboxIds.size;
    var bulkHtml = selCount > 0
      ? '<div class="pm-bulk-bar">' +
          '<div style="font-weight:bold; font-size:13px;">選択中: ' + selCount + '枚 <button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" id="pmInboxClearSelBtn" style="margin-left:6px;">解除</button></div>' +
          '<div class="pm-bulk-actions">' +
            '<button type="button" class="pm-btn pm-btn-primary pm-btn-sm" id="pmBulkNewManualBtn">📖 新規マニュアル作成</button>' +
            '<button type="button" class="pm-btn pm-btn-blue pm-btn-sm" id="pmBulkAppendManualBtn">➕ 既存マニュアルに追加</button>' +
            '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" id="pmBulkMarkSortedBtn">' + (state.inboxFilter === 'sorted' ? '↩️ 未仕分けに戻す' : '✅ 仕分け済にする') + '</button>' +
            '<button type="button" class="pm-btn pm-btn-danger pm-btn-sm" id="pmBulkDeleteBtn">🗑️ 削除</button>' +
          '</div>' +
        '</div>'
      : '';

    container.innerHTML = toolbarHtml + gridHtml + bulkHtml;

    container.querySelectorAll('[data-inbox-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.inboxFilter = btn.getAttribute('data-inbox-filter');
        state.selectedInboxIds.clear();
        renderInboxTab_(container);
      });
    });

    var searchEl = container.querySelector('#pmInboxSearchInput');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        state.inboxSearch = searchEl.value;
        renderInboxTab_(container);
        var nextInput = document.getElementById('pmInboxSearchInput');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
    }

    var addBtn = container.querySelector('#pmInboxAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openQuickPhotoSendModal([], { source: 'schedule_inbox' });
      });
    }

    container.querySelectorAll('[data-inbox-zoom]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-inbox-zoom');
        var it = state.inboxItems.find(function (x) { return x.id === id; });
        if (it) openLightbox_(it.url, it.memo || '');
      });
    });

    container.querySelectorAll('[data-inbox-check]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.getAttribute('data-inbox-check');
        if (cb.checked) state.selectedInboxIds.add(id);
        else state.selectedInboxIds.delete(id);
        renderInboxTab_(container);
      });
    });

    container.querySelectorAll('[data-open-manual]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openManualDetailModal_(btn.getAttribute('data-open-manual'));
      });
    });

    container.querySelectorAll('[data-inbox-to-manual]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-inbox-to-manual');
        var it = state.inboxItems.find(function (x) { return x.id === id; });
        if (it) openDraftFromInboxItems_([it]);
      });
    });

    container.querySelectorAll('[data-inbox-edit-memo]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = btn.getAttribute('data-inbox-edit-memo');
        var it = state.inboxItems.find(function (x) { return x.id === id; });
        if (!it) return;
        var nextMemo = prompt('写真の一言メモを編集', it.memo || '');
        if (nextMemo === null) return;
        try {
          var res = await callApi_('photoInbox_update', { id: id, memo: nextMemo, userName: currentUserName_() });
          if (res && res.success) {
            await loadInbox_(true);
            toast('メモを更新しました');
          }
        } catch (err) {
          toast(err && err.message ? err.message : '更新に失敗しました', true);
        }
      });
    });

    container.querySelectorAll('[data-inbox-del]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = btn.getAttribute('data-inbox-del');
        if (!confirm('この写真をボックスから削除しますか？')) return;
        try {
          await callApi_('photoInbox_delete', { id: id });
          state.selectedInboxIds.delete(id);
          await loadInbox_(true);
          toast('写真を削除しました');
        } catch (err) {
          toast(err && err.message ? err.message : '削除に失敗しました', true);
        }
      });
    });

    if (selCount > 0) {
      container.querySelector('#pmInboxClearSelBtn').addEventListener('click', function () {
        state.selectedInboxIds.clear();
        renderInboxTab_(container);
      });
      container.querySelector('#pmBulkNewManualBtn').addEventListener('click', function () {
        var ids = Array.from(state.selectedInboxIds);
        var items = state.inboxItems.filter(function (it) { return ids.indexOf(it.id) >= 0; });
        if (items.length) openDraftFromInboxItems_(items);
      });
      container.querySelector('#pmBulkAppendManualBtn').addEventListener('click', function () {
        openAppendToManualPicker_(Array.from(state.selectedInboxIds));
      });
      container.querySelector('#pmBulkMarkSortedBtn').addEventListener('click', async function () {
        var nextStatus = state.inboxFilter === 'sorted' ? 'pending' : 'sorted';
        var ids = Array.from(state.selectedInboxIds);
        try {
          for (var i = 0; i < ids.length; i++) {
            await callApi_('photoInbox_update', { id: ids[i], status: nextStatus, userName: currentUserName_() });
          }
          state.selectedInboxIds.clear();
          await loadInbox_(true);
          toast(nextStatus === 'sorted' ? '仕分け済にしました' : '未仕分けに戻しました');
        } catch (err) {
          toast(err && err.message ? err.message : 'ステータス更新に失敗しました', true);
        }
      });
      container.querySelector('#pmBulkDeleteBtn').addEventListener('click', async function () {
        var ids = Array.from(state.selectedInboxIds);
        if (!confirm('選択した ' + ids.length + ' 枚の写真を削除しますか？')) return;
        try {
          for (var i = 0; i < ids.length; i++) {
            await callApi_('photoInbox_delete', { id: ids[i] });
          }
          state.selectedInboxIds.clear();
          await loadInbox_(true);
          toast('選択した写真を削除しました');
        } catch (err) {
          toast(err && err.message ? err.message : '削除に失敗しました', true);
        }
      });
    }
  }

  function renderManualsListTab_(container, editable) {
    var masters = readInitMasters_();
    var q = (state.manualSearch || '').trim().toLowerCase();
    var filtered = (state.manuals || []).filter(function (m) {
      if (state.manualFilterType !== 'all' && m.manualType !== state.manualFilterType) return false;
      if (state.manualFilterCrop && (m.crops || []).indexOf(state.manualFilterCrop) < 0) return false;
      if (!q) return true;
      var hay = [
        m.title,
        m.notice,
        (m.crops || []).join(' '),
        (m.workNames || []).join(' '),
        (m.photos || []).map(function (p) { return p && p.caption || ''; }).join(' '),
        (m.steps || []).map(function (s) { return typeof s === 'string' ? s : (s && s.text || ''); }).join(' ')
      ].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });

    var cropOptions = '<option value="">すべての作物</option>' + masters.crops.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.manualFilterCrop === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');

    var toolbarHtml =
      '<div class="pm-toolbar">' +
        '<div class="pm-pill-group">' +
          '<button type="button" class="pm-pill ' + (state.manualFilterType === 'all' ? 'is-active' : '') + '" data-man-type="all">すべて</button>' +
          '<button type="button" class="pm-pill ' + (state.manualFilterType === 'damage_alert' ? 'is-active is-alert' : '') + '" data-man-type="damage_alert">⚠️ 傷み・品質注意</button>' +
          '<button type="button" class="pm-pill ' + (state.manualFilterType === 'work' ? 'is-active' : '') + '" data-man-type="work">📋 作業手順</button>' +
          '<button type="button" class="pm-pill ' + (state.manualFilterType === 'other' ? 'is-active' : '') + '" data-man-type="other">📌 その他</button>' +
        '</div>' +
        '<select id="pmManualCropFilter" class="pm-select">' + cropOptions + '</select>' +
        '<input type="search" id="pmManualSearchInput" class="pm-input" placeholder="🔍 キーワード検索..." value="' + esc(state.manualSearch) + '">' +
        (editable ? '<button type="button" class="pm-btn pm-btn-primary" id="pmManualCreateNewBtn">＋ 新規作成</button>' : '') +
      '</div>';

    var gridHtml = '';
    if (!filtered.length) {
      gridHtml =
        '<div class="pm-empty-box">' +
          '<div style="font-size:32px; margin-bottom:6px;">📖</div>' +
          '<div style="font-weight:bold; font-size:15px;">該当するマニュアルがありません</div>' +
        '</div>';
    } else {
      gridHtml = '<div class="pm-manual-grid">' + filtered.map(function (m) {
        var ti = getTypeInfo_(m.manualType);
        var photos = Array.isArray(m.photos) ? m.photos : [];
        var cover = photos.length ? (photos[0].url || photos[0].dataUrl || '') : '';
        var cropTags = (m.crops || []).map(function (c) { return '<span class="pm-tag is-crop">🌱 ' + esc(c) + '</span>'; }).join('');
        var workTags = (m.workNames || []).map(function (w) { return '<span class="pm-tag is-work">📝 ' + esc(w) + '</span>'; }).join('');

        return (
          '<div class="pm-manual-card">' +
            '<div class="pm-manual-cover" data-man-open="' + esc(m.id) + '">' +
              (cover ? ('<img src="' + esc(cover) + '" alt="カバー画像">') : '<div class="pm-manual-cover-empty">📖</div>') +
              '<span class="pm-type-badge is-' + esc(m.manualType || 'work') + '">' + esc(ti.label) + '</span>' +
              (photos.length > 0 ? ('<span class="pm-photo-count-badge">📸 ' + photos.length + '枚</span>') : '') +
            '</div>' +
            '<div class="pm-manual-body">' +
              '<div class="pm-manual-title" data-man-open="' + esc(m.id) + '">' + esc(m.title || '無題のマニュアル') + '</div>' +
              (m.notice ? ('<div class="pm-manual-caution">⚠️ ' + esc(m.notice) + '</div>') : '') +
              '<div class="pm-tags-row">' + cropTags + workTags + '</div>' +
              '<div class="pm-manual-actions">' +
                '<button type="button" class="pm-btn pm-btn-primary pm-btn-sm" data-man-open="' + esc(m.id) + '">👁️ 開く</button>' +
                '<button type="button" class="pm-btn pm-btn-blue pm-btn-sm" data-man-print="' + esc(m.id) + '">🖨️ 印刷</button>' +
                (editable ? '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" data-man-edit="' + esc(m.id) + '">✏️ 編集</button>' : '') +
                (editable ? '<button type="button" class="pm-btn pm-btn-danger pm-btn-sm" data-man-del="' + esc(m.id) + '">🗑️</button>' : '') +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('') + '</div>';
    }

    container.innerHTML = toolbarHtml + gridHtml;

    container.querySelectorAll('[data-man-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.manualFilterType = btn.getAttribute('data-man-type');
        renderManualsListTab_(container, editable);
      });
    });

    var cropSel = container.querySelector('#pmManualCropFilter');
    if (cropSel) {
      cropSel.addEventListener('change', function () {
        state.manualFilterCrop = cropSel.value;
        renderManualsListTab_(container, editable);
      });
    }

    var searchEl = container.querySelector('#pmManualSearchInput');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        state.manualSearch = searchEl.value;
        renderManualsListTab_(container, editable);
        var nextInput = document.getElementById('pmManualSearchInput');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
    }

    var createBtn = container.querySelector('#pmManualCreateNewBtn');
    if (createBtn) {
      createBtn.addEventListener('click', function () {
        state.draftManual = newDraftManual_();
        state.activeHubTab = 'editor';
        renderHubTabs_();
        renderHubContent_();
      });
    }

    container.querySelectorAll('[data-man-open]').forEach(function (el) {
      el.addEventListener('click', function () {
        openManualDetailModal_(el.getAttribute('data-man-open'));
      });
    });
    container.querySelectorAll('[data-man-print]').forEach(function (el) {
      el.addEventListener('click', function () {
        printPassionManual(el.getAttribute('data-man-print'), state.printLayout);
      });
    });
    container.querySelectorAll('[data-man-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        openDraftForEdit_(el.getAttribute('data-man-edit'));
      });
    });
    container.querySelectorAll('[data-man-del]').forEach(function (el) {
      el.addEventListener('click', async function () {
        var id = el.getAttribute('data-man-del');
        if (!confirm('このマニュアルを削除してもよろしいですか？')) return;
        try {
          await callApi_('deleteManualData', { manualId: id });
          await loadManuals_(true);
          toast('マニュアルを削除しました');
        } catch (err) {
          toast(err && err.message ? err.message : '削除に失敗しました', true);
        }
      });
    });
  }

  function renderEditorTab_(container) {
    if (!state.draftManual) state.draftManual = newDraftManual_();
    var d = state.draftManual;
    var masters = readInitMasters_();

    var allCrops = Array.from(new Set(masters.crops.concat(d.crops || [])));
    var allWorks = Array.from(new Set(masters.works.concat(d.workNames || [])));

    var typePillsHtml = MANUAL_TYPES.map(function (t) {
      var act = d.manualType === t.key ? (' is-active' + (t.key === 'damage_alert' ? ' is-alert' : '')) : '';
      return '<button type="button" class="pm-pill' + act + '" data-ed-type="' + esc(t.key) + '">' + esc(t.label) + '</button>';
    }).join('');

    var cropChipsHtml = allCrops.map(function (c) {
      var sel = (d.crops || []).indexOf(c) >= 0;
      return '<button type="button" class="pm-chip-btn' + (sel ? ' is-selected' : '') + '" data-ed-crop="' + esc(c) + '">' + (sel ? '✓ ' : '＋ ') + esc(c) + '</button>';
    }).join('');

    var workChipsHtml = allWorks.map(function (w) {
      var sel = (d.workNames || []).indexOf(w) >= 0;
      return '<button type="button" class="pm-chip-btn' + (sel ? ' is-selected' : '') + '" data-ed-work="' + esc(w) + '">' + (sel ? '✓ ' : '＋ ') + esc(w) + '</button>';
    }).join('');

    var photosHtml = (d.photos || []).map(function (p, idx) {
      var src = p.dataUrl || p.url || '';
      var badgeOpts = PHOTO_BADGES.map(function (b) {
        var active = (p.badge || '') === b.key;
        return '<button type="button" class="pm-badge-opt' + (active ? ' is-active' : '') + '" data-badge="' + esc(b.key) + '" data-ed-ph-badge="' + idx + '">' + esc(b.label) + '</button>';
      }).join('');
      return (
        '<div class="pm-photo-editor-row">' +
          '<img src="' + esc(src) + '" class="pm-photo-editor-thumb" data-ed-ph-zoom="' + idx + '" alt="写真">' +
          '<div class="pm-photo-editor-fields">' +
            '<div class="pm-badge-pills">' + badgeOpts + '</div>' +
            '<textarea class="pm-textarea" rows="2" placeholder="この写真の説明・注意点（例：先端が黒いものはNG）" data-ed-ph-cap="' + idx + '">' + esc(p.caption || '') + '</textarea>' +
            '<div style="display:flex; flex-wrap:wrap; gap:6px;">' +
              '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" data-ed-ph-ann="' + idx + '">✏️ 注釈・回転</button>' +
              '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" data-ed-ph-up="' + idx + '"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
              '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" data-ed-ph-dn="' + idx + '"' + (idx === d.photos.length - 1 ? ' disabled' : '') + '>▼</button>' +
              '<button type="button" class="pm-btn pm-btn-danger pm-btn-sm" data-ed-ph-del="' + idx + '">🗑️ 外す</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var stepsHtml = (d.steps || ['']).map(function (st, idx) {
      return (
        '<div class="pm-step-row">' +
          '<div class="pm-step-num">' + (idx + 1) + '</div>' +
          '<textarea class="pm-textarea" rows="2" style="flex:1;" placeholder="手順・確認ポイント ' + (idx + 1) + '" data-ed-step="' + idx + '">' + esc(st) + '</textarea>' +
          '<button type="button" class="pm-btn pm-btn-danger pm-btn-sm" data-ed-step-del="' + idx + '">🗑️</button>' +
        '</div>'
      );
    }).join('');

    container.innerHTML =
      '<div class="pm-editor-card">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
          '<div style="font-size:15px; font-weight:bold; color:#1b5e20;">' + (d.id ? '✏️ マニュアルを編集' : '✏️ 新規マニュアル作成') + '</div>' +
          '<button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" id="pmEdResetBtn">リセット</button>' +
        '</div>' +
        '<label class="pm-field-label">種別</label>' +
        '<div class="pm-pill-group">' + typePillsHtml + '</div>' +

        '<label class="pm-field-label">🌱 対象作物 <span class="pm-field-sub">（複数選択可）</span></label>' +
        '<div class="pm-chip-row">' + cropChipsHtml + '</div>' +
        '<div style="display:flex; gap:6px; margin-bottom:8px;">' +
          '<input type="text" id="pmEdCustomCrop" class="pm-input" placeholder="作物を直接追加...">' +
          '<button type="button" class="pm-btn pm-btn-ghost" id="pmEdAddCropBtn">＋ 追加</button>' +
        '</div>' +

        '<label class="pm-field-label">📝 対象作業名 <span class="pm-field-sub">（任意・複数選択可）</span></label>' +
        '<div class="pm-chip-row">' + workChipsHtml + '</div>' +
        '<div style="display:flex; gap:6px; margin-bottom:8px;">' +
          '<input type="text" id="pmEdCustomWork" class="pm-input" placeholder="作業名を直接追加...">' +
          '<button type="button" class="pm-btn pm-btn-ghost" id="pmEdAddWorkBtn">＋ 追加</button>' +
        '</div>' +

        '<label class="pm-field-label">マニュアルタイトル <span class="pm-field-sub">（空欄なら種別・作物から自動作成）</span></label>' +
        '<input type="text" id="pmEdTitleInput" class="pm-input" placeholder="例：トマト 傷み・出荷NG基準" value="' + esc(d.title) + '">' +

        '<label class="pm-field-label">⚠️ 注意点・重要ポイント</label>' +
        '<textarea id="pmEdNoticeInput" class="pm-textarea" rows="3" placeholder="例：先端が黒いもの、ヘタ周りが割れているものは出荷コンテナに入れない">' + esc(d.notice) + '</textarea>' +
      '</div>' +

      '<div class="pm-editor-card">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">' +
          '<label class="pm-field-label" style="margin:0;">📸 写真と解説（' + (d.photos ? d.photos.length : 0) + '枚）</label>' +
          '<div style="display:flex; flex-wrap:wrap; gap:6px;">' +
            '<button type="button" class="pm-btn pm-btn-amber pm-btn-sm" id="pmEdPickInboxBtn">📥 ボックスから追加</button>' +
            '<label class="pm-btn pm-btn-primary pm-btn-sm" style="cursor:pointer;">📸 撮影<input type="file" accept="image/*" capture="environment" id="pmEdCamInput" style="display:none;"></label>' +
            '<label class="pm-btn pm-btn-blue pm-btn-sm" style="cursor:pointer;">🖼️ 画像選択<input type="file" accept="image/*" multiple id="pmEdFileInput" style="display:none;"></label>' +
          '</div>' +
        '</div>' +
        '<div class="pm-photo-editor-list">' + (photosHtml || '<div style="font-size:12px; color:#64748b; padding:10px; background:#f8fafc; border-radius:8px;">写真を追加すると、NG/OKバッジや解説・矢印を付けられます。</div>') + '</div>' +
      '</div>' +

      '<div class="pm-editor-card">' +
        '<label class="pm-field-label" style="margin-top:0;">📋 作業手順・確認ポイント <span class="pm-field-sub">（任意）</span></label>' +
        stepsHtml +
        '<button type="button" class="pm-btn pm-btn-ghost" id="pmEdAddStepBtn" style="width:100%;">＋ ステップを追加</button>' +
      '</div>' +

      '<div style="display:flex; gap:10px; margin-bottom:16px;">' +
        '<button type="button" class="pm-btn pm-btn-ghost" id="pmEdCancelBtn" style="flex:1;">キャンセル</button>' +
        '<button type="button" class="pm-btn pm-btn-primary" id="pmEdSaveBtn" style="flex:2; padding:12px;">💾 マニュアルを保存する</button>' +
      '</div>';

    container.querySelector('#pmEdResetBtn').addEventListener('click', function () {
      state.draftManual = newDraftManual_();
      renderEditorTab_(container);
    });
    container.querySelector('#pmEdCancelBtn').addEventListener('click', function () {
      state.draftManual = null;
      state.activeHubTab = 'manuals';
      renderHubTabs_();
      renderHubContent_();
    });

    container.querySelectorAll('[data-ed-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        d.manualType = btn.getAttribute('data-ed-type');
        renderEditorTab_(container);
      });
    });

    container.querySelectorAll('[data-ed-crop]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var c = btn.getAttribute('data-ed-crop');
        var i = d.crops.indexOf(c);
        if (i >= 0) d.crops.splice(i, 1);
        else d.crops.push(c);
        renderEditorTab_(container);
      });
    });
    container.querySelector('#pmEdAddCropBtn').addEventListener('click', function () {
      var inp = container.querySelector('#pmEdCustomCrop');
      var val = inp ? inp.value.trim() : '';
      if (!val) return;
      if (d.crops.indexOf(val) < 0) d.crops.push(val);
      renderEditorTab_(container);
    });

    container.querySelectorAll('[data-ed-work]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var w = btn.getAttribute('data-ed-work');
        var i = d.workNames.indexOf(w);
        if (i >= 0) d.workNames.splice(i, 1);
        else d.workNames.push(w);
        renderEditorTab_(container);
      });
    });
    container.querySelector('#pmEdAddWorkBtn').addEventListener('click', function () {
      var inp = container.querySelector('#pmEdCustomWork');
      var val = inp ? inp.value.trim() : '';
      if (!val) return;
      if (d.workNames.indexOf(val) < 0) d.workNames.push(val);
      renderEditorTab_(container);
    });

    container.querySelector('#pmEdTitleInput').addEventListener('input', function (e) {
      d.title = e.target.value;
    });
    container.querySelector('#pmEdNoticeInput').addEventListener('input', function (e) {
      d.notice = e.target.value;
    });

    container.querySelector('#pmEdPickInboxBtn').addEventListener('click', openPickInboxIntoDraftModal_);

    function handleAddLocalFiles(inputEl) {
      if (!inputEl.files || !inputEl.files.length) return;
      var fileList = Array.from(inputEl.files);
      Promise.all(fileList.map(function (file) {
        return resizeBlobToDataUrl_(file, 1400, 0.85);
      })).then(function (urls) {
        urls.forEach(function (u) {
          d.photos.push({
            id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            url: u,
            dataUrl: u,
            caption: '',
            badge: d.manualType === 'damage_alert' ? 'ng' : '',
            inboxItemId: '',
            rotation: 0
          });
        });
        inputEl.value = '';
        renderEditorTab_(container);
      }).catch(function (err) {
        toast(err && err.message ? err.message : '画像の読み込みに失敗しました', true);
      });
    }
    container.querySelector('#pmEdCamInput').addEventListener('change', function (e) { handleAddLocalFiles(e.target); });
    container.querySelector('#pmEdFileInput').addEventListener('change', function (e) { handleAddLocalFiles(e.target); });

    container.querySelectorAll('[data-ed-ph-zoom]').forEach(function (el) {
      el.addEventListener('click', function () {
        var p = d.photos[Number(el.getAttribute('data-ed-ph-zoom'))];
        if (p) openLightbox_(p.dataUrl || p.url, p.caption || '');
      });
    });
    container.querySelectorAll('[data-ed-ph-badge]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-ed-ph-badge'));
        if (d.photos[idx]) {
          d.photos[idx].badge = btn.getAttribute('data-badge') || '';
          renderEditorTab_(container);
        }
      });
    });
    container.querySelectorAll('[data-ed-ph-cap]').forEach(function (ta) {
      ta.addEventListener('input', function () {
        var idx = Number(ta.getAttribute('data-ed-ph-cap'));
        if (d.photos[idx]) d.photos[idx].caption = ta.value;
      });
    });
    container.querySelectorAll('[data-ed-ph-ann]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openAnnotatorModal_(Number(btn.getAttribute('data-ed-ph-ann')));
      });
    });
    container.querySelectorAll('[data-ed-ph-up]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-ed-ph-up'));
        if (idx > 0) {
          var tmp = d.photos[idx - 1];
          d.photos[idx - 1] = d.photos[idx];
          d.photos[idx] = tmp;
          renderEditorTab_(container);
        }
      });
    });
    container.querySelectorAll('[data-ed-ph-dn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-ed-ph-dn'));
        if (idx < d.photos.length - 1) {
          var tmp = d.photos[idx + 1];
          d.photos[idx + 1] = d.photos[idx];
          d.photos[idx] = tmp;
          renderEditorTab_(container);
        }
      });
    });
    container.querySelectorAll('[data-ed-ph-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        d.photos.splice(Number(btn.getAttribute('data-ed-ph-del')), 1);
        renderEditorTab_(container);
      });
    });

    container.querySelectorAll('[data-ed-step]').forEach(function (ta) {
      ta.addEventListener('input', function () {
        d.steps[Number(ta.getAttribute('data-ed-step'))] = ta.value;
      });
    });
    container.querySelectorAll('[data-ed-step-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        d.steps.splice(Number(btn.getAttribute('data-ed-step-del')), 1);
        if (!d.steps.length) d.steps.push('');
        renderEditorTab_(container);
      });
    });
    container.querySelector('#pmEdAddStepBtn').addEventListener('click', function () {
      d.steps.push('');
      renderEditorTab_(container);
    });

    container.querySelector('#pmEdSaveBtn').addEventListener('click', saveDraftManual_);
  }

  async function saveDraftManual_() {
    var d = state.draftManual;
    if (!d) return;
    var saveBtn = document.getElementById('pmEdSaveBtn');
    var cleanSteps = (d.steps || []).map(function (s) { return String(s || '').trim(); }).filter(Boolean);
    var autoTitle = (d.title || '').trim();
    if (!autoTitle) {
      var prefix = d.manualType === 'damage_alert' ? '【傷み・品質注意】' : (d.manualType === 'other' ? '【メモ】' : '');
      var parts = [].concat(d.crops || []).concat(d.workNames || []);
      if (parts.length) autoTitle = prefix + parts.join('・');
      else if (d.notice) autoTitle = prefix + d.notice.split('\n')[0].slice(0, 28);
      else if (d.photos.length && d.photos[0].caption) autoTitle = prefix + d.photos[0].caption.slice(0, 28);
    }

    if (!autoTitle && !d.notice && !cleanSteps.length && !d.photos.length) {
      toast('タイトル、注意点、写真、手順のいずれかを入力してください', true);
      return;
    }

    var manualPayload = {
      id: d.id || ('man_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
      manualType: d.manualType || 'work',
      title: autoTitle || '無題のマニュアル',
      category: d.category || '',
      crops: (d.crops || []).slice(),
      workNames: (d.workNames || []).slice(),
      notice: String(d.notice || '').trim(),
      steps: cleanSteps,
      photos: (d.photos || []).map(function (p) {
        return {
          id: p.id || ('p_' + Date.now()),
          url: p.url || p.dataUrl || '',
          dataUrl: p.dataUrl || p.url || '',
          caption: String(p.caption || '').trim(),
          badge: String(p.badge || ''),
          inboxItemId: String(p.inboxItemId || ''),
          rotation: Number(p.rotation) || 0
        };
      }),
      authorName: d.authorName || currentUserName_(),
      createdAt: d.createdAt || new Date().toISOString()
    };

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
    }

    try {
      var res = await callApi_('saveManualData', { manual: manualPayload });
      if (!res || res.success === false) {
        throw new Error((res && res.message) || 'マニュアルの保存に失敗しました');
      }

      // インボックス由来の写真を自動で仕分け済に更新
      var linkedInboxIds = Array.from(new Set(manualPayload.photos.map(function (p) {
        return p.inboxItemId;
      }).filter(Boolean)));
      var nowIso = new Date().toISOString();
      for (var i = 0; i < linkedInboxIds.length; i++) {
        try {
          await callApi_('photoInbox_update', {
            id: linkedInboxIds[i],
            addLink: {
              type: 'manual',
              id: manualPayload.id,
              title: manualPayload.title,
              sortedAt: nowIso
            },
            userName: currentUserName_()
          });
          state.selectedInboxIds.delete(linkedInboxIds[i]);
        } catch (e) {}
      }

      state.draftManual = null;
      state.activeHubTab = 'manuals';
      await Promise.all([loadManuals_(false), loadInbox_(false)]);
      renderHubTabs_();
      renderHubContent_();
      toast('✅ マニュアルを保存しました');
    } catch (err) {
      toast(err && err.message ? err.message : '保存に失敗しました', true);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 マニュアルを保存する';
      }
    }
  }

  async function openPhotoManualHub(initialTab) {
    state.mode = 'schedule';
    state.activeHubTab = initialTab || 'inbox';
    if (state.activeHubTab === 'editor' && !state.draftManual) {
      state.draftManual = newDraftManual_();
    }
    var modal = ensureHubModal_();
    renderHubTabs_();
    modal.classList.add('is-open');
    refreshScrollLock_();
    renderHubContent_();

    await Promise.all([loadInbox_(false), loadManuals_(false)]);
    renderHubTabs_();
    renderHubContent_();
  }

  // ========================================================================
  // worker.html 用閲覧モーダル (#pmWorkerManualModal)
  // ========================================================================
  function ensureWorkerViewerModal_() {
    var modal = document.getElementById('pmWorkerManualModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pmWorkerManualModal';
    modal.className = 'pm-modal-backdrop';
    modal.innerHTML =
      '<div class="pm-full-sheet" onclick="event.stopPropagation()">' +
        '<div class="pm-header">' +
          '<div class="pm-header-title">📖 現場マニュアル</div>' +
          '<div class="pm-header-actions">' +
            '<button type="button" class="pm-hdr-btn" id="pmWorkerSendPhotoBtn">📸 注意写真を送る</button>' +
            '<button type="button" class="pm-close-btn" id="pmWorkerCloseBtn" aria-label="閉じる">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="pm-body" id="pmWorkerBody"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#pmWorkerCloseBtn').addEventListener('click', closeWorkerManualViewer_);
    modal.querySelector('#pmWorkerSendPhotoBtn').addEventListener('click', function () {
      openQuickPhotoSendModal([], { source: 'worker_viewer' });
    });
    return modal;
  }

  function closeWorkerManualViewer_() {
    var modal = document.getElementById('pmWorkerManualModal');
    if (modal) modal.classList.remove('is-open');
    refreshScrollLock_();
  }

  function renderWorkerViewerBody_() {
    var body = document.getElementById('pmWorkerBody');
    if (!body) return;
    renderManualsListTab_(body, false);
  }

  async function openWorkerManualViewer() {
    var modal = ensureWorkerViewerModal_();
    modal.classList.add('is-open');
    refreshScrollLock_();
    try {
      var cached = localStorage.getItem('passionMapManuals');
      if (cached && !state.manuals.length) {
        var parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) state.manuals = parsed;
      }
    } catch (e) {}
    renderWorkerViewerBody_();
    await loadManuals_(true);
  }

  // ========================================================================
  // 初期化・公開 API
  // ========================================================================
  function init(opts) {
    opts = opts || {};
    if (opts.mode) state.mode = opts.mode;
    if (!state.initialized) {
      state.initialized = true;
      checkIncomingSharedPhotos_();
      if (state.mode === 'schedule') {
        ensureAuthSessionReady_(8000).then(function (ok) {
          if (ok) refreshPhotoInboxBadge();
        });
      }
    } else if (state.mode === 'schedule') {
      refreshPhotoInboxBadge();
    }
  }

  global.PhotoManualUI = {
    init: init,
    openHub: openPhotoManualHub,
    openWorkerViewer: openWorkerManualViewer,
    openQuickPhotoSend: openQuickPhotoSendModal,
    refreshBadge: refreshPhotoInboxBadge,
    printManual: printPassionManual
  };
  global.openPhotoManualHub = openPhotoManualHub;
  global.openWorkerManualViewer = openWorkerManualViewer;
  global.openQuickPhotoSendModal = openQuickPhotoSendModal;
  global.refreshPhotoInboxBadge = refreshPhotoInboxBadge;
  global.printPassionManual = printPassionManual;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    setTimeout(function () { init(); }, 0);
  }
})(typeof window !== 'undefined' ? window : this);
