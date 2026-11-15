/**
 * 地図ページ共通: 圃場データ読み込み中の全画面オーバーレイ
 * - 操作をブロック（pointer-events + 地図ジェスチャ無効化）
 * - begin/end の入れ子対応
 * - 終了時は必ず拡大縮小・ドラッグを復元する
 */
(function (global) {
  'use strict';

  var depth = 0;
  var gestureBackup = null;
  var styleInjected = false;
  var loadSeq = 0;
  var activeLoads = {};

  var INTERACTIVE_GESTURES = {
    gestureHandling: 'greedy',
    draggable: true,
    scrollwheel: true,
    disableDoubleClickZoom: false
  };

  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var style = document.createElement('style');
    style.textContent =
      '@keyframes mapDataSpin{to{transform:rotate(360deg)}}' +
      '#mapDataLoadingOverlay{display:none;position:fixed;inset:0;z-index:30000;' +
      'background:rgba(15,23,32,0.72);align-items:center;justify-content:center;' +
      'flex-direction:column;color:#fff;pointer-events:none;touch-action:none;' +
      '-webkit-user-select:none;user-select:none;}' +
      '#mapDataLoadingOverlay.is-visible{display:flex !important;pointer-events:auto !important;}' +
      '#mapDataLoadingOverlay .map-data-loading-spinner{width:42px;height:42px;' +
      'border:4px solid rgba(255,255,255,0.25);border-top-color:#4CAF50;border-radius:50%;' +
      'animation:mapDataSpin .8s linear infinite;margin-bottom:16px;}' +
      '#mapDataLoadingText{font-weight:bold;font-size:16px;text-align:center;padding:0 20px;}' +
      '#mapDataLoadingSub{font-size:12px;color:#bbb;margin-top:8px;text-align:center;}' +
      '#mapDataLoadingProgress{width:min(78vw,420px);height:9px;background:rgba(255,255,255,.22);' +
      'border-radius:999px;overflow:hidden;margin-top:14px;display:none;}' +
      '#mapDataLoadingBar{height:100%;width:0;background:#4CAF50;border-radius:999px;transition:width .25s ease;}' +
      '#mapDataLoadingProgress.is-visible{display:block;}' +
      '#mapDataLoadingProgress.is-indeterminate #mapDataLoadingBar{width:35%;animation:appLoadSlide 1.2s ease-in-out infinite;}' +
      '#mapDataLoadingPercent{font-size:11px;color:#c8e6c9;margin-top:5px;display:none;}' +
      '#mapDataLoadingOverlay.is-nonblocking{top:0;bottom:auto;height:5px;background:transparent;display:flex !important;' +
      'pointer-events:none !important;align-items:flex-start;}' +
      '#mapDataLoadingOverlay.is-nonblocking .map-data-loading-spinner,#mapDataLoadingOverlay.is-nonblocking #mapDataLoadingText,' +
      '#mapDataLoadingOverlay.is-nonblocking #mapDataLoadingSub,#mapDataLoadingOverlay.is-nonblocking #mapDataLoadingPercent{display:none;}' +
      '#mapDataLoadingOverlay.is-nonblocking #mapDataLoadingProgress{display:block;width:100%;height:4px;margin:0;border-radius:0;background:#e0e0e0;}' +
      '@keyframes appLoadSlide{0%{transform:translateX(-110%)}50%{transform:translateX(95%)}100%{transform:translateX(285%)}}' +
      '.app-inline-loading{padding:14px;text-align:center;color:#666;font-size:12px;}' +
      '.app-inline-loading-track{height:7px;background:#e0e0e0;border-radius:999px;overflow:hidden;margin:8px auto 0;max-width:360px;}' +
      '.app-inline-loading-bar{height:100%;background:#4CAF50;border-radius:999px;transition:width .25s ease;}' +
      '.app-inline-loading.is-indeterminate .app-inline-loading-bar{width:35%;animation:appLoadSlide 1.2s ease-in-out infinite;}' +
      '.app-inline-loading.is-error{color:#c62828}.app-inline-loading.is-error .app-inline-loading-bar{background:#d32f2f;}' +
      '.app-inline-loading-detail{font-size:10px;color:#999;margin-top:5px;}';
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    injectStyle();
    var el = document.getElementById('mapDataLoadingOverlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'mapDataLoadingOverlay';
    el.setAttribute('aria-busy', 'false');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="map-data-loading-spinner" aria-hidden="true"></div>' +
      '<div id="mapDataLoadingText">圃場データを読み込み中...</div>' +
      '<div id="mapDataLoadingSub"></div>' +
      '<div id="mapDataLoadingProgress"><div id="mapDataLoadingBar"></div></div>' +
      '<div id="mapDataLoadingPercent"></div>';
    // クリックを下に通さない（表示中のみ届く）
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
    }, true);
    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true, passive: false });
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true, passive: false });
    document.body.appendChild(el);
    return el;
  }

  function readMapOption(key, fallback) {
    try {
      if (typeof map === 'undefined' || !map || typeof map.get !== 'function') return fallback;
      var val = map.get(key);
      return (val === undefined || val === null || val === '') ? fallback : val;
    } catch (e) {
      return fallback;
    }
  }

  function lockMapGestures() {
    try {
      if (typeof map === 'undefined' || !map || typeof map.setOptions !== 'function') return;
      if (!gestureBackup) {
        var gh = readMapOption('gestureHandling', 'greedy');
        // 既に none のときは復元先を greedy に固定（解除不能ループ防止）
        if (gh === 'none') gh = 'greedy';
        gestureBackup = {
          gestureHandling: gh,
          draggable: readMapOption('draggable', true),
          scrollwheel: readMapOption('scrollwheel', true),
          disableDoubleClickZoom: readMapOption('disableDoubleClickZoom', false)
        };
      }
      map.setOptions({
        gestureHandling: 'none',
        draggable: false,
        scrollwheel: false,
        disableDoubleClickZoom: true
      });
    } catch (e) {}
  }

  function unlockMapGestures() {
    try {
      if (typeof map === 'undefined' || !map || typeof map.setOptions !== 'function') {
        gestureBackup = null;
        return;
      }
      // バックアップが欠けていても、必ず操作可能な状態へ戻す
      var opts = {
        gestureHandling: INTERACTIVE_GESTURES.gestureHandling,
        draggable: INTERACTIVE_GESTURES.draggable,
        scrollwheel: INTERACTIVE_GESTURES.scrollwheel,
        disableDoubleClickZoom: INTERACTIVE_GESTURES.disableDoubleClickZoom
      };
      if (gestureBackup) {
        if (gestureBackup.gestureHandling && gestureBackup.gestureHandling !== 'none') {
          opts.gestureHandling = gestureBackup.gestureHandling;
        }
        if (typeof gestureBackup.draggable === 'boolean') opts.draggable = gestureBackup.draggable;
        if (typeof gestureBackup.scrollwheel === 'boolean') opts.scrollwheel = gestureBackup.scrollwheel;
        if (typeof gestureBackup.disableDoubleClickZoom === 'boolean') {
          opts.disableDoubleClickZoom = gestureBackup.disableDoubleClickZoom;
        }
      }
      // none / false のまま残ると拡大縮小できないため最終ガード
      if (!opts.gestureHandling || opts.gestureHandling === 'none') opts.gestureHandling = 'greedy';
      if (opts.draggable === false) opts.draggable = true;
      if (opts.scrollwheel === false) opts.scrollwheel = true;
      map.setOptions(opts);
      gestureBackup = null;
    } catch (e) {
      gestureBackup = null;
      try {
        if (typeof map !== 'undefined' && map && typeof map.setOptions === 'function') {
          map.setOptions(INTERACTIVE_GESTURES);
        }
      } catch (e2) {}
    }
  }

  var safetyTimer = null;

  function resetSafetyTimer() {
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  }

  function newestActiveLoad(includeInline) {
    var keys = Object.keys(activeLoads);
    for (var b = keys.length - 1; b >= 0; b--) {
      var blockingItem = activeLoads[keys[b]];
      if ((!blockingItem.target || includeInline) && blockingItem.blocking !== false) return blockingItem;
    }
    for (var i = keys.length - 1; i >= 0; i--) {
      var item = activeLoads[keys[i]];
      if (includeInline || !item.target) return item;
    }
    return null;
  }

  function renderInlineLoad(load) {
    var target = load.target;
    if (!target || !target.isConnected) return;
    var current = Number(load.current);
    var total = Number(load.total);
    var determinate = Number.isFinite(current) && Number.isFinite(total) && total > 0;
    var pct = determinate ? Math.max(0, Math.min(100, Math.round(current / total * 100))) : 0;
    target.innerHTML =
      '<div class="app-inline-loading' + (determinate ? '' : ' is-indeterminate') + (load.status === 'error' ? ' is-error' : '') + '" aria-live="polite">' +
      '<div class="app-inline-loading-label">' + escapeHtml(load.label || '読み込み中...') + '</div>' +
      '<div class="app-inline-loading-track"><div class="app-inline-loading-bar" style="width:' + (determinate ? pct : 35) + '%"></div></div>' +
      '<div class="app-inline-loading-detail">' + escapeHtml(load.detail || (determinate ? current + ' / ' + total : '')) + '</div>' +
      '</div>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderActiveLoads() {
    Object.keys(activeLoads).forEach(function (id) {
      var item = activeLoads[id];
      if (item.target) renderInlineLoad(item);
    });

    var load = newestActiveLoad(false);
    if (!load) {
      if (depth <= 0) {
        var none = document.getElementById('mapDataLoadingOverlay');
        if (none) {
          none.classList.remove('is-visible', 'is-nonblocking', 'worker-boot-loading');
          none.style.display = 'none';
          none.style.pointerEvents = 'none';
          none.setAttribute('aria-busy', 'false');
        }
        unlockMapGestures();
      }
      return;
    }

    var el = ensureOverlay();
    el.classList.remove('worker-boot-loading');
    var text = document.getElementById('mapDataLoadingText');
    var sub = document.getElementById('mapDataLoadingSub');
    var progress = document.getElementById('mapDataLoadingProgress');
    var bar = document.getElementById('mapDataLoadingBar');
    var percent = document.getElementById('mapDataLoadingPercent');
    var current = Number(load.current);
    var total = Number(load.total);
    var determinate = Number.isFinite(current) && Number.isFinite(total) && total > 0;
    var pct = determinate ? Math.max(0, Math.min(100, Math.round(current / total * 100))) : 0;

    if (text) text.textContent = load.label || '読み込み中...';
    if (sub) sub.textContent = load.detail || '';
    if (progress) {
      progress.classList.add('is-visible');
      progress.classList.toggle('is-indeterminate', !determinate);
    }
    if (bar) bar.style.width = (determinate ? pct : 35) + '%';
    if (bar) bar.style.background = load.status === 'error' ? '#d32f2f' : '#4CAF50';
    if (percent) {
      percent.style.display = determinate && load.blocking !== false ? 'block' : 'none';
      percent.textContent = determinate ? pct + '%' : '';
    }
    el.classList.add('is-visible');
    el.classList.toggle('is-nonblocking', load.blocking === false);
    el.style.display = 'flex';
    el.style.pointerEvents = load.blocking === false ? 'none' : 'auto';
    el.setAttribute('aria-busy', 'true');
    if (load.blocking !== false && load.lockMap !== false) lockMapGestures();
    else unlockMapGestures();
  }

  function startAppLoading(options) {
    var opts = options || {};
    var id = 'app-load-' + (++loadSeq);
    var target = opts.target;
    if (typeof target === 'string') target = document.querySelector(target);
    var load = {
      id: id,
      label: opts.label || '読み込み中...',
      detail: opts.detail || '',
      current: opts.current,
      total: opts.total,
      blocking: opts.blocking !== false,
      lockMap: opts.lockMap !== false,
      target: target || null,
      shown: false,
      timer: null,
      timeoutTimer: null,
      completionSeq: 0
    };
    activeLoads[id] = load;
    var delay = Math.max(0, Number(opts.delay == null ? 180 : opts.delay) || 0);
    load.timer = setTimeout(function () {
      load.shown = true;
      renderActiveLoads();
    }, delay);

    function update(next) {
      if (!activeLoads[id]) return handle;
      next = next || {};
      Object.keys(next).forEach(function (key) {
        if (key !== 'target') load[key] = next[key];
      });
      if (load.shown) renderActiveLoads();
      return handle;
    }
    function close() {
      if (!activeLoads[id]) return;
      load.completionSeq += 1;
      if (load.timer) clearTimeout(load.timer);
      if (load.timeoutTimer) clearTimeout(load.timeoutTimer);
      if (load.target && load.target.isConnected && load.restoreHtml !== undefined) {
        load.target.innerHTML = load.restoreHtml;
      }
      delete activeLoads[id];
      renderActiveLoads();
    }
    function done() {
      if (!activeLoads[id]) return;
      if (load.timeoutTimer) {
        clearTimeout(load.timeoutTimer);
        load.timeoutTimer = null;
      }
      var total = Number(load.total);
      var determinate = Number.isFinite(total) && total > 0;
      if (!load.shown || !determinate) {
        close();
        return;
      }

      load.current = total;
      load.status = 'success';
      renderActiveLoads();
      var completionToken = ++load.completionSeq;
      var finishAfterPaint = function () {
        if (!activeLoads[id] || load.completionSeq !== completionToken) return;
        close();
      };
      // 100%のDOM更新が実際に1回描画されてから閉じる
      setTimeout(finishAfterPaint, 80);
    }
    var handle = {
      id: id,
      update: update,
      done: done,
      fail: function (message) {
        load.completionSeq += 1;
        if (load.timer) clearTimeout(load.timer);
        if (load.timeoutTimer) {
          clearTimeout(load.timeoutTimer);
          load.timeoutTimer = null;
        }
        load.shown = true;
        update({ label: message || '読み込みに失敗しました', detail: '', current: 1, total: 1, status: 'error' });
        setTimeout(close, 1400);
      }
    };
    var timeout = Math.max(0, Number(opts.timeout) || 0);
    if (timeout > 0) {
      load.timeoutTimer = setTimeout(function () {
        handle.fail(opts.timeoutMessage || '読み込みがタイムアウトしました');
      }, timeout);
    }
    return handle;
  }

  function setMessage(msg) {
    var text = document.getElementById('mapDataLoadingText');
    if (text && msg) text.textContent = msg;
  }

  /** 既に表示中なら文言だけ更新（depthは増やさない） */
  function setMapDataLoadingMessage(msg) {
    if (!msg) return;
    if (depth <= 0) {
      beginMapDataLoad(msg);
      return;
    }
    setMessage(msg);
  }

  function beginMapDataLoad(msg) {
    var el = ensureOverlay();
    el.classList.remove('worker-boot-loading');
    depth += 1;
    setMessage(msg || '圃場データを読み込み中...');
    el.classList.add('is-visible');
    el.style.display = 'flex';
    el.style.pointerEvents = 'auto';
    el.setAttribute('aria-busy', 'true');
    var progress = document.getElementById('mapDataLoadingProgress');
    var percent = document.getElementById('mapDataLoadingPercent');
    if (progress) {
      progress.classList.add('is-visible', 'is-indeterminate');
    }
    if (percent) percent.style.display = 'none';
    // 直後に重い同期処理があっても、先に1フレーム描画させる
    try { void el.offsetWidth; } catch (e) {}
    lockMapGestures();

    // ★ セーフティタイマー：12秒経っても解除されない場合は強制解除
    resetSafetyTimer();
    safetyTimer = setTimeout(function () {
      console.warn('[map-loading] 読み込み安全タイムアウト（12秒）が作動しました。');
      endMapDataLoad(true);
    }, 12000);
  }

  function endMapDataLoad(force) {
    if (force) depth = 0;
    else depth = Math.max(0, depth - 1);
    if (depth > 0) return;

    resetSafetyTimer();
    if (newestActiveLoad(false)) renderActiveLoads();
    else {
      var el = document.getElementById('mapDataLoadingOverlay');
      if (el) {
        el.classList.remove('is-visible', 'is-nonblocking', 'worker-boot-loading');
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
        el.setAttribute('aria-busy', 'false');
      }
      unlockMapGestures();
    }
  }

  function isMapDataLoading() {
    return depth > 0;
  }

  /** 読み込み中でなくてもジェスチャを強制復旧（不具合時の保険） */
  function ensureMapGesturesEnabled() {
    depth = 0;
    resetSafetyTimer();
    var el = document.getElementById('mapDataLoadingOverlay');
    if (el) {
      el.classList.remove('is-visible', 'is-nonblocking', 'worker-boot-loading');
      el.style.display = 'none';
      el.style.pointerEvents = 'none';
      el.setAttribute('aria-busy', 'false');
    }
    unlockMapGestures();
  }

  // 公開API
  global.beginMapDataLoad = beginMapDataLoad;
  global.endMapDataLoad = endMapDataLoad;
  global.showMapDataLoading = beginMapDataLoad;
  global.hideMapDataLoading = function () { endMapDataLoad(true); };
  global.isMapDataLoading = isMapDataLoading;
  global.ensureMapGesturesEnabled = ensureMapGesturesEnabled;
  global.setMapDataLoadingMessage = setMapDataLoadingMessage;
  global.AppLoading = {
    start: startAppLoading,
    inline: function (target, options) {
      var opts = options || {};
      opts.target = target;
      opts.blocking = false;
      return startAppLoading(opts);
    },
    isActive: function () { return Object.keys(activeLoads).length > 0; }
  };

  // 既存コード互換
  global.showLoader = function (msg) { beginMapDataLoad(msg || '処理中...'); };
  global.hideLoader = function () { endMapDataLoad(true); };

  /**
   * 衛星タイルのCSS引き延ばし（ネイティブズーム超え・最大45）を地図に組み込む
   * - ズーム21以下では標準 hybrid / satellite を維持し Google 店舗表示等と両立する
   * - ズーム21超では自動で引き延ばしタイル（hybrid_stretched / satellite_stretched）へ切り替える
   */
  function createStretchedMapType(targetMap, opts) {
    var maxZoom = (opts && opts.maxZoom) || 45;
    var maxNativeZoom = (opts && opts.maxNativeZoom) || 21;
    var lyrs = (opts && opts.lyrs) || 'y';
    var label = (opts && opts.label) || (lyrs === 's' ? '航空写真' : 'ハイブリッド');

    var baseType = null;
    try {
      if (targetMap && targetMap.mapTypes) {
        baseType = targetMap.mapTypes.get('roadmap') ||
          targetMap.mapTypes.get('hybrid') ||
          targetMap.mapTypes.get('satellite');
      }
    } catch (e) { baseType = null; }

    var projection = (baseType && baseType.projection) ? baseType.projection : {
      fromLatLngToPoint: function (latLng, opt_point) {
        var point = opt_point || new google.maps.Point(0, 0);
        var origin = new google.maps.Point(128, 128);
        point.x = origin.x + latLng.lng() * (256 / 360);
        var siny = Math.min(Math.max(Math.sin((latLng.lat() * Math.PI) / 180), -0.9999), 0.9999);
        point.y = origin.y + 0.5 * Math.log((1 + siny) / (1 - siny)) * -(256 / (2 * Math.PI));
        return point;
      },
      fromPointToLatLng: function (point) {
        var origin = new google.maps.Point(128, 128);
        var lng = (point.x - origin.x) / (256 / 360);
        var latRadians = (point.y - origin.y) / -(256 / (2 * Math.PI));
        var lat = (2 * Math.atan(Math.exp(latRadians)) - Math.PI / 2) * 180 / Math.PI;
        return new google.maps.LatLng(lat, lng);
      }
    };

    return {
      tileSize: new google.maps.Size(256, 256),
      maxZoom: maxZoom,
      name: label,
      alt: label,
      maxNativeZoom: maxNativeZoom,
      projection: projection,
      getTile: function (coord, zoom, ownerDocument) {
        var div = ownerDocument.createElement('div');
        div.style.width = '256px';
        div.style.height = '256px';
        div.style.overflow = 'hidden';
        div.style.position = 'relative';
        div.style.pointerEvents = 'none';

        var z = zoom;
        var x = coord.x;
        var y = coord.y;
        var scale = 1;

        if (z > maxNativeZoom) {
          var zDiff = z - maxNativeZoom;
          scale = Math.pow(2, zDiff);
          z = maxNativeZoom;
          x = Math.floor(x / scale);
          y = Math.floor(y / scale);
        }

        var img = ownerDocument.createElement('img');
        img.src = 'https://mt1.google.com/vt/lyrs=' + lyrs + '&x=' + x + '&y=' + y + '&z=' + z;
        img.style.position = 'absolute';
        img.style.width = '256px';
        img.style.height = '256px';
        img.style.left = '0px';
        img.style.top = '0px';
        img.style.pointerEvents = 'none';

        if (scale > 1) {
          var modX = ((coord.x % scale) + scale) % scale;
          var modY = ((coord.y % scale) + scale) % scale;
          img.style.transformOrigin = '0 0';
          img.style.transform = 'translate(' + (-modX * 256) + 'px, ' + (-modY * 256) + 'px) scale(' + scale + ')';
          img.style.imageRendering = 'pixelated';
        }

        div.appendChild(img);
        return div;
      },
      releaseTile: function () { }
    };
  }

  function applyNativeTypeMaxZoom(targetMap, maxZoom) {
    if (!targetMap || !targetMap.mapTypes) return;
    try {
      var hyb = targetMap.mapTypes.get('hybrid');
      if (hyb) hyb.maxZoom = maxZoom;
      var sat = targetMap.mapTypes.get('satellite');
      if (sat) sat.maxZoom = maxZoom;
    } catch (e) { /* ignore */ }
  }

  function setupStretchedZoom(targetMap, options) {
    if (!targetMap || typeof google === 'undefined' || !google.maps) return false;
    var opts = options || {};
    var maxZoom = opts.maxZoom || 45;
    var maxNativeZoom = opts.maxNativeZoom || 21;

    try {
      targetMap.setOptions({ maxZoom: maxZoom });
      if (targetMap.mapTypes) {
        targetMap.mapTypes.set('hybrid_stretched', createStretchedMapType(targetMap, {
          maxZoom: maxZoom,
          maxNativeZoom: maxNativeZoom,
          lyrs: 'y',
          label: 'ハイブリッド'
        }));
        targetMap.mapTypes.set('satellite_stretched', createStretchedMapType(targetMap, {
          maxZoom: maxZoom,
          maxNativeZoom: maxNativeZoom,
          lyrs: 's',
          label: '航空写真'
        }));
      }
      applyNativeTypeMaxZoom(targetMap, maxZoom);
      google.maps.event.addListenerOnce(targetMap, 'idle', function () {
        applyNativeTypeMaxZoom(targetMap, maxZoom);
      });

      var cur = String((typeof targetMap.getMapTypeId === 'function' && targetMap.getMapTypeId()) || '');
      if (cur === 'satellite') {
        targetMap.setMapTypeId('satellite_stretched');
      } else if (cur !== 'satellite_stretched') {
        targetMap.setMapTypeId('hybrid_stretched');
      }
      return true;
    } catch (e) {
      console.warn('setupStretchedZoom スキップ:', e);
      return false;
    }
  }

  global.setupStretchedZoom = setupStretchedZoom;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { ensureOverlay(); });
  } else {
    ensureOverlay();
  }
})(window);
