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

  // ==========================================
  // 🪧 SignGroup: 大看板・小看板グループ機能
  // ==========================================
  var SignGroup = {
    expandedParentId: null,
    connectorLines: [],

    getPolys: function (optPolys) {
      if (optPolys && typeof optPolys === 'object') return optPolys;
      if (typeof global.loadedPolygons === 'object' && global.loadedPolygons) return global.loadedPolygons;
      return {};
    },

    isSignMarker: function (p) {
      if (!p || !p.isMarker) return false;
      if (typeof global.isLocationPinSign_ === 'function' && global.isLocationPinSign_(p.signFunction)) return false;
      return true;
    },

    getParentId: function (p, optPolys) {
      if (!p || !p.parentSignId) return '';
      var pid = String(p.parentSignId).trim();
      if (!pid || pid === String(p.id)) return '';
      return pid;
    },

    isChildSign: function (p, optPolys) {
      return !!SignGroup.getParentId(p, optPolys);
    },

    getChildren: function (parentId, optPolys) {
      if (!parentId) return [];
      var pid = String(parentId).trim();
      var polys = SignGroup.getPolys(optPolys);
      var children = [];
      for (var id in polys) {
        var p = polys[id];
        if (p && p.isMarker && String(p.parentSignId || '').trim() === pid && String(p.id) !== pid) {
          children.push(p);
        }
      }
      return children;
    },

    isParentSign: function (p, optPolys) {
      if (!p || !p.id) return false;
      var polys = SignGroup.getPolys(optPolys);
      var children = SignGroup.getChildren(p.id, polys);
      return children.length > 0;
    },

    getCandidateParents: function (excludeId, optPolys) {
      var polys = SignGroup.getPolys(optPolys);
      var eid = excludeId ? String(excludeId).trim() : '';
      var list = [];
      for (var id in polys) {
        var p = polys[id];
        if (!p || !p.isMarker) continue;
        if (eid && String(p.id) === eid) continue;
        if (typeof global.isLocationPinSign_ === 'function' && global.isLocationPinSign_(p.signFunction)) continue;
        if (SignGroup.isChildSign(p, polys)) continue;
        list.push({ id: String(p.id), name: String(p.name || '看板 ' + p.id) });
      }
      return list;
    },

    getExpandedParentId: function () {
      return SignGroup.expandedParentId;
    },

    isExpandedParent: function (id) {
      return !!id && String(id) === String(SignGroup.expandedParentId);
    },

    isChildOfExpanded: function (p, optPolys) {
      if (!SignGroup.expandedParentId) return false;
      var pid = SignGroup.getParentId(p, optPolys);
      return !!pid && pid === String(SignGroup.expandedParentId);
    },

    clearConnectorLines: function () {
      if (Array.isArray(SignGroup.connectorLines)) {
        SignGroup.connectorLines.forEach(function (line) {
          try { line.setMap(null); } catch (e) {}
        });
      }
      SignGroup.connectorLines = [];
    },

    drawConnectorLines: function (map, parentPoly, children) {
      SignGroup.clearConnectorLines();
      if (!map || !parentPoly || !children || !children.length || typeof google === 'undefined' || !google.maps) return;
      var parentPos = null;
      if (parentPoly.marker && typeof parentPoly.marker.getPosition === 'function') {
        parentPos = parentPoly.marker.getPosition();
      } else if (Array.isArray(parentPoly.coords) && parentPoly.coords[0]) {
        var c = parentPoly.coords[0];
        parentPos = new google.maps.LatLng(
          typeof c.lat === 'function' ? c.lat() : parseFloat(c.lat),
          typeof c.lng === 'function' ? c.lng() : parseFloat(c.lng)
        );
      }
      if (!parentPos) return;

      var lineSymbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        scale: 3
      };

      children.forEach(function (ch) {
        var childPos = null;
        if (ch.marker && typeof ch.marker.getPosition === 'function') {
          childPos = ch.marker.getPosition();
        } else if (Array.isArray(ch.coords) && ch.coords[0]) {
          var chC = ch.coords[0];
          childPos = new google.maps.LatLng(
            typeof chC.lat === 'function' ? chC.lat() : parseFloat(chC.lat),
            typeof chC.lng === 'function' ? chC.lng() : parseFloat(chC.lng)
          );
        }
        if (!childPos) return;

        var line = new google.maps.Polyline({
          path: [parentPos, childPos],
          strokeColor: '#7B1FA2',
          strokeOpacity: 0,
          icons: [{
            icon: lineSymbol,
            offset: '0',
            repeat: '10px'
          }],
          zIndex: 800,
          map: map,
          clickable: false
        });
        SignGroup.connectorLines.push(line);
      });
    },

    expand: function (parentId, map, optPolys, onRefresh) {
      if (!parentId) return;
      var polys = SignGroup.getPolys(optPolys);
      var parentPoly = polys[parentId];
      if (!parentPoly) return;

      SignGroup.expandedParentId = String(parentId);
      var children = SignGroup.getChildren(parentId, polys);

      var activeMap = map || (parentPoly.marker && parentPoly.marker.getMap()) || (typeof global.map !== 'undefined' ? global.map : null);
      if (activeMap) {
        SignGroup.drawConnectorLines(activeMap, parentPoly, children);
      }

      if (typeof onRefresh === 'function') {
        onRefresh();
      } else {
        SignGroup.refreshMarkers(optPolys);
      }
    },

    collapse: function (map, optPolys, onRefresh) {
      if (!SignGroup.expandedParentId) return;
      SignGroup.expandedParentId = null;
      SignGroup.clearConnectorLines();

      if (typeof onRefresh === 'function') {
        onRefresh();
      } else {
        SignGroup.refreshMarkers(optPolys);
      }
    },

    refreshMarkers: function (optPolys) {
      if (typeof global.updateMarkersVisibility === 'function') {
        global.updateMarkersVisibility();
      }
      if (typeof global.updateAdminMapVisuals === 'function') {
        global.updateAdminMapVisuals();
      }
      if (typeof global.updateMapVisuals === 'function') {
        global.updateMapVisuals();
      }
      if (typeof global.updateMapSelectVisuals === 'function') {
        global.updateMapSelectVisuals();
      }
    },

    // 互換エイリアス（古い呼び出し側が SignGroup.refresh を使う場合）
    refresh: function (optPolys) {
      return SignGroup.refreshMarkers(optPolys);
    },

    buildSignMarkerIcon: function (p, opts) {
      opts = opts || {};
      var isParent = opts.isParent !== undefined ? opts.isParent : SignGroup.isParentSign(p, opts.polys);
      var isExpandedParent = opts.isExpandedParent !== undefined ? opts.isExpandedParent : SignGroup.isExpandedParent(p.id);
      var isExpandedChild = opts.isExpandedChild !== undefined ? opts.isExpandedChild : SignGroup.isChildOfExpanded(p, opts.polys);
      var isSelected = !!opts.isSelected;
      var icon = p.color || '🪧';
      var name = String(p.name || '');
      if ((name.indexOf('排水口') >= 0 || name.indexOf('水落口') >= 0) && (!icon || icon === '🕳️')) {
        icon = '🚩';
      }

      if (isSelected) {
        if (isParent) {
          var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46">' +
            '<circle cx="23" cy="23" r="21" fill="#FF9800" fill-opacity="0.45" stroke="#E65100" stroke-width="2.5"/>' +
            '<circle cx="23" cy="23" r="16.5" fill="#FFF3E0" stroke="#E65100" stroke-width="2.5"/>' +
            '<rect x="25" y="1" width="18" height="15" rx="7.5" fill="#6A1B9A" stroke="#FFFFFF" stroke-width="1.5"/>' +
            '<text x="34" y="11.5" text-anchor="middle" font-size="9" fill="#FFF" font-weight="bold">大</text>' +
            '<text x="23" y="29.5" text-anchor="middle" font-size="20">' + icon + '</text>' +
            '</svg>';
          return {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
            scaledSize: new google.maps.Size(46, 46),
            anchor: new google.maps.Point(23, 23),
            labelOrigin: new google.maps.Point(23, 50)
          };
        } else if (isExpandedChild) {
          var childSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
            '<circle cx="20" cy="20" r="18.5" fill="#FF9800" fill-opacity="0.45" stroke="#E65100" stroke-width="2"/>' +
            '<circle cx="20" cy="20" r="14.5" fill="#FFF8E1" stroke="#F57C00" stroke-width="2"/>' +
            '<rect x="22" y="1" width="16" height="13" rx="6.5" fill="#FB8C00" stroke="#FFFFFF" stroke-width="1"/>' +
            '<text x="30" y="10" text-anchor="middle" font-size="8" fill="#FFF" font-weight="bold">小</text>' +
            '<text x="20" y="26.5" text-anchor="middle" font-size="18">' + icon + '</text>' +
            '</svg>';
          return {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(childSvg),
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20),
            labelOrigin: new google.maps.Point(20, 44)
          };
        } else {
          var highlightSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
            '<circle cx="20" cy="20" r="18.5" fill="#FF9800" fill-opacity="0.38" stroke="#F57C00" stroke-width="1.5"/>' +
            '<circle cx="20" cy="20" r="14.5" fill="#FFF3E0" stroke="#E65100" stroke-width="2.5"/>' +
            '<text x="20" y="27" text-anchor="middle" font-size="20">' + icon + '</text>' +
            '</svg>';
          return {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(highlightSvg),
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20),
            labelOrigin: new google.maps.Point(20, 44)
          };
        }
      }

      if (isParent) {
        var childCount = SignGroup.getChildren(p.id, opts.polys).length;
        var badgeText = childCount > 9 ? '9+' : String(childCount);
        var ringStroke = isExpandedParent ? '#7B1FA2' : '#8E24AA';
        var ringFill = isExpandedParent ? '#EDE7F6' : '#F3E5F5';
        var glow = isExpandedParent ? '<circle cx="20" cy="20" r="19" fill="#9C27B0" fill-opacity="0.28" stroke="#AB47BC" stroke-width="1.5"/>' : '';

        var parentSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
          glow +
          '<circle cx="20" cy="20" r="16.5" fill="' + ringFill + '" stroke="' + ringStroke + '" stroke-width="2.5"/>' +
          '<text x="18" y="27" text-anchor="middle" font-size="20">' + icon + '</text>' +
          '<circle cx="31" cy="9" r="8" fill="#6A1B9A" stroke="#FFFFFF" stroke-width="1.5"/>' +
          '<text x="31" y="12" text-anchor="middle" font-size="9" fill="#FFFFFF" font-weight="bold">' + badgeText + '</text>' +
          '</svg>';

        return {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(parentSvg),
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 20),
          labelOrigin: new google.maps.Point(20, 44)
        };
      }

      if (isExpandedChild) {
        var childSvgNormal = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">' +
          '<circle cx="17" cy="17" r="15.5" fill="#FFF3E0" stroke="#FF9800" stroke-width="2.5"/>' +
          '<circle cx="17" cy="17" r="12" fill="#FFFFFF" stroke="#FB8C00" stroke-width="1"/>' +
          '<text x="17" y="23" text-anchor="middle" font-size="16">' + icon + '</text>' +
          '<circle cx="26" cy="7" r="6" fill="#EF6C00" stroke="#FFFFFF" stroke-width="1"/>' +
          '<text x="26" y="9.5" text-anchor="middle" font-size="7" fill="#FFFFFF" font-weight="bold">小</text>' +
          '</svg>';

        return {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(childSvgNormal),
          scaledSize: new google.maps.Size(34, 34),
          anchor: new google.maps.Point(17, 17),
          labelOrigin: new google.maps.Point(17, 36)
        };
      }

      var normalSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><text x="13" y="20" text-anchor="middle" font-size="20">' + icon + '</text></svg>';
      return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(normalSvg),
        scaledSize: new google.maps.Size(26, 26),
        anchor: new google.maps.Point(13, 13),
        labelOrigin: new google.maps.Point(13, 30)
      };
    },

    buildSignLabelConfig: function (p, opts) {
      opts = opts || {};
      var isParent = opts.isParent !== undefined ? opts.isParent : SignGroup.isParentSign(p, opts.polys);
      var isExpandedParent = opts.isExpandedParent !== undefined ? opts.isExpandedParent : SignGroup.isExpandedParent(p.id);
      var isExpandedChild = opts.isExpandedChild !== undefined ? opts.isExpandedChild : SignGroup.isChildOfExpanded(p, opts.polys);
      var name = String(p.name || '');

      if (isParent) {
        var cls = isExpandedParent ? 'signboard-label sign-parent-label sign-parent-expanded' : 'signboard-label sign-parent-label';
        return {
          text: '🪧 ' + name,
          color: '#4A148C',
          fontSize: '13px',
          fontWeight: 'bold',
          className: cls
        };
      }
      if (isExpandedChild) {
        return {
          text: '↳ ' + name,
          color: '#E65100',
          fontSize: '12px',
          fontWeight: 'bold',
          className: 'signboard-label sign-child-expanded'
        };
      }
      return {
        text: name,
        color: '#333',
        fontSize: '13px',
        fontWeight: 'bold',
        className: 'signboard-label'
      };
    },

    formatRecordPlaceLabel: function (selectedIds, polys) {
      polys = SignGroup.getPolys(polys);
      var ids = (selectedIds || []).map(String);
      if (!ids.length) return '';

      var fieldNames = [];
      var signIds = [];
      ids.forEach(function (id) {
        var p = polys[id];
        if (!p) return;
        if (!p.isMarker) {
          fieldNames.push(p.name || id);
        } else {
          signIds.push(id);
        }
      });

      if (!signIds.length) {
        return fieldNames.join(', ');
      }

      var signGroups = {};
      var standalone = [];

      signIds.forEach(function (sid) {
        var sp = polys[sid];
        if (!sp) return;
        var pid = SignGroup.getParentId(sp, polys);
        if (pid) {
          if (!signGroups[pid]) {
            signGroups[pid] = { parent: polys[pid] || null, children: [] };
          }
          signGroups[pid].children.push(sp);
        } else if (SignGroup.isParentSign(sp, polys)) {
          if (!signGroups[sid]) {
            signGroups[sid] = { parent: sp, children: [] };
          } else {
            signGroups[sid].parent = sp;
          }
        } else {
          standalone.push(sp);
        }
      });

      var signLabels = [];

      for (var gid in signGroups) {
        var grp = signGroups[gid];
        var parentName = grp.parent ? (grp.parent.name || gid) : ('親看板 ' + gid);
        if (grp.children && grp.children.length > 0) {
          var childNames = grp.children.map(function (c) { return c.name || c.id; }).join('・');
          signLabels.push(parentName + '（' + childNames + '）');
        } else if (grp.parent) {
          signLabels.push(parentName);
        }
      }

      standalone.forEach(function (s) {
        signLabels.push(s.name || s.id);
      });

      var allParts = fieldNames.concat(signLabels);
      return allParts.join(', ');
    }
  };

  global.SignGroup = SignGroup;
})(window);
