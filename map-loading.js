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
      '#mapDataLoadingOverlay{display:none;position:fixed;inset:0;z-index:2900;' +
      'background:rgba(15,23,32,0.72);align-items:center;justify-content:center;' +
      'flex-direction:column;color:#fff;pointer-events:none;touch-action:none;' +
      '-webkit-user-select:none;user-select:none;}' +
      '#mapDataLoadingOverlay.is-visible{display:flex !important;pointer-events:auto !important;}' +
      '#mapDataLoadingOverlay .map-data-loading-spinner{width:42px;height:42px;' +
      'border:4px solid rgba(255,255,255,0.25);border-top-color:#4CAF50;border-radius:50%;' +
      'animation:mapDataSpin .8s linear infinite;margin-bottom:16px;}' +
      '#mapDataLoadingText{font-weight:bold;font-size:16px;text-align:center;padding:0 20px;}' +
      '#mapDataLoadingSub{font-size:12px;color:#bbb;margin-top:8px;text-align:center;}';
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
      '<div id="mapDataLoadingSub">読み込み完了まで操作できません</div>';
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

  function setMessage(msg) {
    var text = document.getElementById('mapDataLoadingText');
    if (text && msg) text.textContent = msg;
  }

  function beginMapDataLoad(msg) {
    var el = ensureOverlay();
    depth += 1;
    setMessage(msg || '圃場データを読み込み中...');
    el.classList.add('is-visible');
    el.style.display = 'flex';
    el.style.pointerEvents = 'auto';
    el.setAttribute('aria-busy', 'true');
    lockMapGestures();
  }

  function endMapDataLoad(force) {
    if (force) depth = 0;
    else depth = Math.max(0, depth - 1);
    if (depth > 0) return;
    var el = document.getElementById('mapDataLoadingOverlay');
    if (el) {
      el.classList.remove('is-visible');
      el.style.display = 'none';
      el.style.pointerEvents = 'none';
      el.setAttribute('aria-busy', 'false');
    }
    unlockMapGestures();
  }

  function isMapDataLoading() {
    return depth > 0;
  }

  /** 読み込み中でなくてもジェスチャを強制復旧（不具合時の保険） */
  function ensureMapGesturesEnabled() {
    depth = 0;
    var el = document.getElementById('mapDataLoadingOverlay');
    if (el) {
      el.classList.remove('is-visible');
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

  // 既存コード互換
  global.showLoader = function (msg) { beginMapDataLoad(msg || '処理中...'); };
  global.hideLoader = function () { endMapDataLoad(true); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { ensureOverlay(); });
  } else {
    ensureOverlay();
  }
})(window);
