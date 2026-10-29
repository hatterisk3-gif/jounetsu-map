(function (global) {
  var SIGN_FUNCTION = '拠点';

  function isLocationPinSign_(signFunction) {
    return String(signFunction || '').trim() === SIGN_FUNCTION;
  }

  function zoomNum_(zoom) {
    var z = Number(zoom);
    return isFinite(z) ? z : 15;
  }

  function glowScaleForZoom_(zoom) {
    var z = zoomNum_(zoom);
    if (z >= 16) return 1;
    if (z >= 13) return 1.35;
    if (z >= 10) return 1.8;
    return 2.35;
  }

  function iconPxForZoom_(zoom) {
    var z = zoomNum_(zoom);
    if (z >= 16) return 32;
    if (z >= 13) return 44;
    if (z >= 10) return 58;
    return 74;
  }

  function locationPinLabelConfig_(name, zoom) {
    var z = zoomNum_(zoom);
    var font = z >= 16 ? '13px' : (z >= 12 ? '15px' : '18px');
    return {
      text: String(name || '拠点'),
      color: '#3E2723',
      fontSize: font,
      fontWeight: 'bold',
      className: 'location-pin-label'
    };
  }

  function locationPinMarkerIcon_(zoom) {
    var px = iconPxForZoom_(zoom);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
      '<defs><radialGradient id="lg" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="#FFEB3B" stop-opacity="0.95"/>' +
      '<stop offset="42%" stop-color="#FFEB3B" stop-opacity="0.55"/>' +
      '<stop offset="100%" stop-color="#FFEB3B" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      '<circle cx="32" cy="32" r="30" fill="url(#lg)"/>' +
      '<circle cx="32" cy="32" r="13" fill="#FFEB3B" stroke="#F57F17" stroke-width="4"/>' +
      '<circle cx="32" cy="32" r="5" fill="#FFFDE7"/>' +
      '</svg>';
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(px, px),
      anchor: new google.maps.Point(px / 2, px / 2),
      labelOrigin: new google.maps.Point(px / 2, px + 8)
    };
  }

  function ensureGlowClass_() {
    if (global.LocationPinGlowOverlay_) return global.LocationPinGlowOverlay_;
    global.LocationPinGlowOverlay_ = class LocationPinGlowOverlay extends google.maps.OverlayView {
      constructor(position) {
        super();
        this.position = position;
        this.div = null;
      }
      onAdd() {
        var div = document.createElement('div');
        div.className = 'location-pin-glow';
        div.innerHTML = '<span class="location-pin-ring"></span><span class="location-pin-ring delay"></span>';
        this.div = div;
        var panes = this.getPanes();
        var pane = panes && (panes.overlayLayer || panes.overlayMouseTarget);
        if (pane) pane.appendChild(div);
      }
      draw() {
        if (!this.div) return;
        var proj = this.getProjection();
        if (!proj || !this.position) return;
        var pt = proj.fromLatLngToDivPixel(this.position);
        if (!pt) return;
        this.div.style.left = pt.x + 'px';
        this.div.style.top = pt.y + 'px';
      }
      onRemove() {
        if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
        this.div = null;
      }
      setPosition(pos) {
        this.position = pos;
        this.draw();
      }
    };
    return global.LocationPinGlowOverlay_;
  }

  function attachLocationPinGlow_(marker) {
    if (!marker || marker._locationGlow) return marker;
    if (typeof google === 'undefined' || !google.maps || typeof google.maps.OverlayView !== 'function') return marker;
    var Glow = ensureGlowClass_();
    var glow = new Glow(marker.getPosition());
    glow.setMap(marker.getMap());
    var origSetMap = marker.setMap.bind(marker);
    marker.setMap = function (nextMap) {
      origSetMap(nextMap);
      try { glow.setMap(nextMap); } catch (e) {}
    };
    google.maps.event.addListener(marker, 'position_changed', function () {
      try { glow.setPosition(marker.getPosition()); } catch (e) {}
    });
    marker._locationGlow = glow;
    return marker;
  }

  function syncLocationPinGlowScale_(map) {
    var z = map && typeof map.getZoom === 'function' ? map.getZoom() : 15;
    document.documentElement.style.setProperty('--location-pin-scale', String(glowScaleForZoom_(z)));
  }

  function refreshLocationPinMarker_(marker, name, zoom) {
    if (!marker) return;
    try { marker.setVisible(true); } catch (e) {}
    try { marker.setZIndex(1200); } catch (e) {}
    try { marker.setLabel(locationPinLabelConfig_(name, zoom)); } catch (e) {}
    try { marker.setIcon(locationPinMarkerIcon_(zoom)); } catch (e) {}
  }

  global.LOCATION_PIN_SIGN_FUNCTION = SIGN_FUNCTION;
  global.isLocationPinSign_ = isLocationPinSign_;
  global.locationPinLabelConfig_ = locationPinLabelConfig_;
  global.locationPinMarkerIcon_ = locationPinMarkerIcon_;
  global.attachLocationPinGlow_ = attachLocationPinGlow_;
  global.syncLocationPinGlowScale_ = syncLocationPinGlowScale_;
  global.refreshLocationPinMarker_ = refreshLocationPinMarker_;
})(window);
