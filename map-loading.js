/**
 * 地図ページ共通: 圃場データ読み込み中の全画面オーバーレイ
 * - 操作をブロック（pointer-events + 地図ジェスチャ無効化）
 * - begin/end の入れ子対応
 */
(function (global) {
  'use strict';

  var depth = 0;
  var gestureBackup = null;
  var styleInjected = false;

  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var style = document.createElement('style');
    style.textContent =
      '@keyframes mapDataSpin{to{transform:rotate(360deg)}}' +
      '#mapDataLoadingOverlay{display:none;position:fixed;inset:0;z-index:2900;' +
      'background:rgba(15,23,32,0.72);align-items:center;justify-content:center;' +
      'flex-direction:column;color:#fff;pointer-events:auto;touch-action:none;' +
      '-webkit-user-select:none;user-select:none;}' +
      '#mapDataLoadingOverlay.is-visible{display:flex !important;}' +
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
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="map-data-loading-spinner" aria-hidden="true"></div>' +
      '<div id="mapDataLoadingText">圃場データを読み込み中...</div>' +
      '<div id="mapDataLoadingSub">読み込み完了まで操作できません</div>';
    // クリックを下に通さない
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
    }, true);
    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true, passive: false });
    document.body.appendChild(el);
    return el;
  }

  function lockMapGestures() {
    try {
      if (typeof map !== 'undefined' && map && typeof map.setOptions === 'function') {
        if (!gestureBackup) {
          gestureBackup = {
            gestureHandling: map.get && map.get('gestureHandling'),
            draggable: map.get && map.get('draggable'),
            scrollwheel: map.get && map.get('scrollwheel'),
            disableDoubleClickZoom: map.get && map.get('disableDoubleClickZoom')
          };
        }
        map.setOptions({
          gestureHandling: 'none',
          draggable: false,
          scrollwheel: false,
          disableDoubleClickZoom: true
        });
      }
    } catch (e) {}
  }

  function unlockMapGestures() {
    try {
      if (typeof map !== 'undefined' && map && typeof map.setOptions === 'function' && gestureBackup) {
        var opts = {};
        if (gestureBackup.gestureHandling != null) opts.gestureHandling = gestureBackup.gestureHandling;
        else opts.gestureHandling = 'greedy';
        if (gestureBackup.draggable != null) opts.draggable = gestureBackup.draggable;
        else opts.draggable = true;
        if (gestureBackup.scrollwheel != null) opts.scrollwheel = gestureBackup.scrollwheel;
        if (gestureBackup.disableDoubleClickZoom != null) {
          opts.disableDoubleClickZoom = gestureBackup.disableDoubleClickZoom;
        }
        map.setOptions(opts);
        gestureBackup = null;
      }
    } catch (e) {}
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
      el.setAttribute('aria-busy', 'false');
    }
    unlockMapGestures();
  }

  function isMapDataLoading() {
    return depth > 0;
  }

  // 公開API
  global.beginMapDataLoad = beginMapDataLoad;
  global.endMapDataLoad = endMapDataLoad;
  global.showMapDataLoading = beginMapDataLoad;
  global.hideMapDataLoading = function () { endMapDataLoad(true); };
  global.isMapDataLoading = isMapDataLoading;

  // 既存コード互換
  global.showLoader = function (msg) { beginMapDataLoad(msg || '処理中...'); };
  global.hideLoader = function () { endMapDataLoad(true); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { ensureOverlay(); });
  } else {
    ensureOverlay();
  }
})(window);
