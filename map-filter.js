/**
 * 地図レイヤーフィルター（schedule / worker / admin 共通）
 * 圃場・看板・拠点・Googleマップ店舗ピンの表示切替
 */
(function (global) {
  var STORAGE_KEY = 'passionMapLayerFilter';
  var DEFAULT_STATE = {
    fields: true,
    signs: true,
    bases: true,
    googlePoi: true
  };

  var state = Object.assign({}, DEFAULT_STATE);
  var mapRef = null;
  var baselineStyles = null;
  var lastPoiApplied = null;
  var uiRoot = null;
  var panelEl = null;
  var btnEl = null;
  var inited = false;
  var applying = false;

  function readStored_() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        fields: parsed.fields !== false,
        signs: parsed.signs !== false,
        bases: parsed.bases !== false,
        googlePoi: parsed.googlePoi !== false
      };
    } catch (e) {
      return null;
    }
  }

  function saveState_() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function classifyItem_(p) {
    if (!p) return null;
    if (p.isMarker) {
      if (typeof global.isLocationPinSign_ === 'function' && global.isLocationPinSign_(p.signFunction)) {
        return 'bases';
      }
      if (typeof global.isAdminLocationPin_ === 'function' && global.isAdminLocationPin_(p)) {
        return 'bases';
      }
      if (String(p.signFunction || '').trim() === '拠点') return 'bases';
      return 'signs';
    }
    return 'fields';
  }

  function isLayerOn_(key) {
    return state[key] !== false;
  }

  function captureBaselineStyles_(map) {
    if (!map || baselineStyles !== null) return;
    try {
      var opts = map.get('styles');
      baselineStyles = Array.isArray(opts) ? opts.slice() : (opts || []);
    } catch (e) {
      baselineStyles = [];
    }
  }

  function googlePoiOffStyles_() {
    return [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }
    ];
  }

  function applyGooglePoiStyles_() {
    if (!mapRef || typeof mapRef.setOptions !== 'function') return;
    captureBaselineStyles_(mapRef);
    var on = isLayerOn_('googlePoi');
    if (lastPoiApplied === on) return;
    lastPoiApplied = on;
    try {
      mapRef.setOptions({
        styles: on ? (baselineStyles || []) : googlePoiOffStyles_(),
        clickableIcons: on
      });
    } catch (e) { /* ignore */ }
  }

  function setOverlayVisible_(overlay, visible) {
    if (!overlay) return;
    try {
      if (typeof overlay.setVisible === 'function') overlay.setVisible(!!visible);
    } catch (e) { /* ignore */ }
  }

  function applyOneItem_(p) {
    if (!p) return;
    var kind = classifyItem_(p);
    if (!kind) return;
    var on = isLayerOn_(kind);
    if (p.polygon) setOverlayVisible_(p.polygon, on);
    if (!on) {
      setOverlayVisible_(p.marker, false);
      return;
    }
    // ON のときマーカー可視は各画面のズーム制御に任せる（直後に reapplyZoom_ する）
  }

  function reapplyZoomVisibility_() {
    try {
      if (typeof global.updateMarkersVisibility === 'function') {
        global.updateMarkersVisibility();
        return;
      }
    } catch (e) { /* ignore */ }
    if (!mapRef || !global.google || !google.maps || !google.maps.event) return;
    try {
      google.maps.event.trigger(mapRef, 'zoom_changed');
    } catch (e2) { /* ignore */ }
  }

  function applyMapLayerFilter_() {
    if (applying) return;
    applying = true;
    try {
      var polys = global.loadedPolygons || {};
      var id;
      for (id in polys) {
        if (!Object.prototype.hasOwnProperty.call(polys, id)) continue;
        if (id === '__global__') continue;
        applyOneItem_(polys[id]);
      }
      applyGooglePoiStyles_();
      updateFilteredBadge_();
    } finally {
      applying = false;
    }
  }

  function refreshMapLayerFilter_() {
    reapplyZoomVisibility_();
    applyMapLayerFilter_();
  }

  function anyFilterOff_() {
    return !state.fields || !state.signs || !state.bases || !state.googlePoi;
  }

  function updateFilteredBadge_() {
    if (!btnEl) return;
    if (anyFilterOff_()) btnEl.classList.add('is-filtered');
    else btnEl.classList.remove('is-filtered');
  }

  function syncUiFromState_() {
    if (!panelEl) return;
    ['fields', 'signs', 'bases', 'googlePoi'].forEach(function (key) {
      var input = panelEl.querySelector('input[data-layer="' + key + '"]');
      if (input) input.checked = !!state[key];
    });
    updateFilteredBadge_();
  }

  function setLayer_(key, on) {
    if (!(key in state)) return;
    state[key] = !!on;
    lastPoiApplied = null;
    saveState_();
    syncUiFromState_();
    refreshMapLayerFilter_();
  }

  function setAllLayers_(on) {
    state.fields = !!on;
    state.signs = !!on;
    state.bases = !!on;
    state.googlePoi = !!on;
    lastPoiApplied = null;
    saveState_();
    syncUiFromState_();
    refreshMapLayerFilter_();
  }

  function closePanel_() {
    if (panelEl) panelEl.classList.remove('is-open');
    if (btnEl) {
      btnEl.classList.remove('is-active');
      btnEl.setAttribute('aria-expanded', 'false');
    }
  }

  function togglePanel_() {
    if (!panelEl || !btnEl) return;
    var open = !panelEl.classList.contains('is-open');
    if (open) {
      panelEl.classList.add('is-open');
      btnEl.classList.add('is-active');
      btnEl.setAttribute('aria-expanded', 'true');
    } else {
      closePanel_();
    }
  }

  function buildUi_() {
    if (uiRoot && uiRoot.parentNode) return;

    uiRoot = document.createElement('div');
    uiRoot.className = 'map-layer-filter-root';
    uiRoot.id = 'mapLayerFilterRoot';

    btnEl = document.createElement('button');
    btnEl.type = 'button';
    btnEl.className = 'map-layer-filter-btn';
    btnEl.id = 'btnMapLayerFilter';
    btnEl.title = '地図表示フィルター';
    btnEl.setAttribute('aria-label', '地図表示フィルター');
    btnEl.setAttribute('aria-expanded', 'false');
    btnEl.setAttribute('aria-controls', 'mapLayerFilterPanel');
    btnEl.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/>' +
      '</svg>';

    panelEl = document.createElement('div');
    panelEl.className = 'map-layer-filter-panel';
    panelEl.id = 'mapLayerFilterPanel';
    panelEl.setAttribute('role', 'dialog');
    panelEl.setAttribute('aria-label', '地図表示フィルター');
    panelEl.innerHTML =
      '<div class="map-layer-filter-title">' +
      '<span>地図表示フィルター</span>' +
      '<button type="button" class="map-layer-filter-close" aria-label="閉じる">×</button>' +
      '</div>' +
      '<p class="map-layer-filter-hint">オフにした項目は地図上に出ません。初期はすべて表示です。</p>' +
      rowHtml_('fields', '🌿', '圃場') +
      rowHtml_('signs', '🪧', '看板') +
      rowHtml_('bases', '📍', '拠点') +
      rowHtml_('googlePoi', '🏪', 'Googleマップの店舗') +
      '<div class="map-layer-filter-actions">' +
      '<button type="button" data-action="all-on">すべてON</button>' +
      '<button type="button" data-action="all-off">すべてOFF</button>' +
      '</div>';

    uiRoot.appendChild(btnEl);
    uiRoot.appendChild(panelEl);
    document.body.appendChild(uiRoot);

    btnEl.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel_();
    });
    panelEl.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    var closeBtn = panelEl.querySelector('.map-layer-filter-close');
    if (closeBtn) closeBtn.addEventListener('click', closePanel_);

    panelEl.querySelectorAll('input[data-layer]').forEach(function (input) {
      input.addEventListener('change', function () {
        setLayer_(input.getAttribute('data-layer'), input.checked);
      });
    });
    panelEl.querySelectorAll('button[data-action]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-action');
        if (act === 'all-on') setAllLayers_(true);
        else if (act === 'all-off') setAllLayers_(false);
      });
    });

    document.addEventListener('click', function () {
      closePanel_();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel_();
    });

    syncUiFromState_();
  }

  function rowHtml_(key, emoji, label) {
    return (
      '<label class="map-layer-filter-row">' +
      '<span class="map-layer-filter-label"><span class="emoji">' + emoji + '</span>' + label + '</span>' +
      '<span class="map-layer-filter-switch">' +
      '<input type="checkbox" data-layer="' + key + '" checked>' +
      '<span class="map-layer-filter-slider"></span>' +
      '</span>' +
      '</label>'
    );
  }

  function bindMapListeners_(map) {
    if (!map || map.__mapLayerFilterBound) return;
    map.__mapLayerFilterBound = true;
    try {
      map.addListener('zoom_changed', function () {
        // 各画面のズーム制御の後に、OFF項目を再非表示
        setTimeout(applyMapLayerFilter_, 0);
      });
      map.addListener('idle', function () {
        applyMapLayerFilter_();
      });
    } catch (e) { /* ignore */ }
  }

  function initMapLayerFilter_(map) {
    if (!map) return;
    mapRef = map;
    global.map = global.map || map;

    var stored = readStored_();
    state = Object.assign({}, DEFAULT_STATE, stored || {});

    captureBaselineStyles_(map);
    buildUi_();
    bindMapListeners_(map);
    applyGooglePoiStyles_();
    // データ読込前でもUIは出す。ポリゴン反映は idle / 明示呼び出しで
    applyMapLayerFilter_();
    inited = true;
  }

  function ensureMapLayerFilter_() {
    if (inited && mapRef) return;
    var m = mapRef || global.map;
    if (m) initMapLayerFilter_(m);
  }

  global.MAP_LAYER_FILTER_DEFAULTS = Object.assign({}, DEFAULT_STATE);
  global.initMapLayerFilter_ = initMapLayerFilter_;
  global.ensureMapLayerFilter_ = ensureMapLayerFilter_;
  global.applyMapLayerFilter_ = applyMapLayerFilter_;
  global.refreshMapLayerFilter_ = refreshMapLayerFilter_;
  global.isMapLayerOn_ = isLayerOn_;
  global.classifyMapLayerItem_ = classifyItem_;
  global.getMapLayerFilterState_ = function () { return Object.assign({}, state); };
  global.setMapLayerFilter_ = setLayer_;
})(window);
