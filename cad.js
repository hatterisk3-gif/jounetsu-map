// 🚜 農業CAD専用JavaScript（admin.htmlから切り出し）
// 🚜 新・農業CADシステム（地形設計特化版）
window.cadMap = null;
window.cadTargetId = null;
window.cadTargetPolygon = null;
window.cadUnePolygons = [];
window.cadPins = [];
window.cadPinMode = null;
window.cadMakuraSelectedEdges = [];
window.cadPinNumFontSize = 24; // 給水・排水アイコン上の番号サイズ(px)
window.cadUneLabels = [];
window.cadNakamichiLines = [];
window.cadNakamichiMapPolygons = [];
/** 中道で畝を割る半幅(m)。以前は 0.5（切れ目の幅 約1m） */
window.CAD_NAKAMICHI_HALF_WIDTH_M = 0.2;
/** 枕畝を圃場の辺から内側へ離す幅(m) */
window.CAD_MAKURA_EDGE_INSET_M = 0.5;
/** 枕畝と既存畝のあいだに空ける幅(m) */
window.CAD_MAKURA_RIDGE_GAP_M = 0.35;
window.cadDrainageLines = [];
window.cadDrainageMapPolygons = [];
window.cadCustomShapes = [];
window.cadGridLines = [];
window.cadSnapGridOn = false; // 自由畝セル配置グリッド
window.cadSnapGridSizeM = null; // nullなら基準畝幅
window.cadCellEraseMode = false; // true=消しゴム（塗ったセルを消す）
window.cadPaintedCellSet = new Set(); // 塗ったセル "iu,iv"（隣接点は結合して1畝）
window.cadPaintedCells = {}; // 互換: 塗り済み判定用（Setと同期）
window.cadCellPainting = false; // ドラッグ塗り中
window.cadSnapGridAlignPoint = null; // {lat,lng} 選んだ辺上の点（位相合わせ）
window.cadSnapGridAlignBearing = null;
window.nakamichiTempMarker = null;

window.cadCurrentRotation = 0;
const BASE_SCALE = 1.0;
window.cadCurrentScale = BASE_SCALE;

// 🌟 新機能：履歴保存用のスタック
window.cadHistory = [];
window.cadHistoryIndex = -1;
window.isHistoryNavigating = false;

// 🌟 最適化用のタイマーと状態変数
let realScaleTimeout = null;
let labelPositionsTimeout = null;
let lastLabelPositionsTime = 0;
window.cadSuppressPathEvents = false; // 一括変形中は path の set_at 連鎖を抑制

/** 畝が多いときの描画負荷対策 */
window.CAD_PERF = {
    detachRidgesFromMap: true,
    hideLengthAt: 45,
    disableHoverAt: 60,
    forceHideLabelsAt: 90,
    svgMinIntervalMs: 32
};

window.cadGetRidgeCount = () =>
    ((window.cadUnePolygons && window.cadUnePolygons.length) || 0) +
    ((window.cadCustomShapes && window.cadCustomShapes.length) || 0);

window.cadDetachRidgeFromMap = (poly) => {
    if (!poly || !window.CAD_PERF.detachRidgesFromMap) return;
    const editEl = document.getElementById('cadEditIndex');
    const editingId = editEl ? editEl.value : '';
    if (editingId && poly.uneIndex === editingId) return;
    try { poly.setEditable(false); } catch (e) {}
    try {
        poly.setOptions({ fillOpacity: 0, strokeOpacity: 0, clickable: false });
        poly.setMap(null);
    } catch (e) {}
};

window.cadDetachAllRidgesFromMap = () => {
    (window.cadUnePolygons || []).forEach(window.cadDetachRidgeFromMap);
    (window.cadCustomShapes || []).forEach(window.cadDetachRidgeFromMap);
};

window.cadAttachRidgeForEdit = (poly) => {
    if (!poly || !window.cadMap) return;
    try {
        poly.setMap(window.cadMap);
        poly.setOptions({
            fillOpacity: 0.25,
            strokeOpacity: 0.95,
            strokeWeight: 2,
            clickable: true
        });
    } catch (e) {}
};

window.cadCreateRidgePolygon = (paths, opt) => {
    const o = opt || {};
    return new google.maps.Polygon({
        paths: paths,
        fillColor: o.fillColor || '#8BC34A',
        fillOpacity: 0,
        strokeColor: o.strokeColor || '#558B2F',
        strokeOpacity: 0,
        strokeWeight: Math.max(0.5, 2),
        map: null,
        editable: false,
        draggable: false,
        clickable: false,
        zIndex: 10
    });
};

/** 保存座標が1輪か、穴あきの複数輪かを Google Polygon の paths にする */
window.cadNormalizeSavedPaths = (coords) => {
    if (!Array.isArray(coords) || !coords.length) return [];
    if (Array.isArray(coords[0])) return coords.filter(ring => Array.isArray(ring) && ring.length >= 3);
    return coords;
};

/** 穴あきポリゴンは輪の配列、通常は1輪の点配列で保存する */
window.cadPolyToSavedCoords = (poly) => {
    const readRing = (path) => {
        const ring = [];
        if (!path || typeof path.getLength !== 'function') return ring;
        for (let i = 0; i < path.getLength(); i++) {
            const pt = path.getAt(i);
            if (!pt || typeof pt.lat !== 'function') continue;
            const lat = pt.lat();
            const lng = pt.lng();
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            ring.push({ lat: lat, lng: lng });
        }
        return ring;
    };
    try {
        const paths = poly && poly.getPaths && poly.getPaths();
        const n = paths && typeof paths.getLength === 'function' ? paths.getLength() : 0;
        if (n > 1) {
            const rings = [];
            for (let r = 0; r < n; r++) {
                const ring = readRing(paths.getAt(r));
                if (ring.length >= 3) rings.push(ring);
            }
            if (rings.length > 1) return rings;
            if (rings.length === 1) return rings[0];
        }
    } catch (e) {}
    return readRing(poly && poly.getPath && poly.getPath());
};

window.cadCreateLabelSlot = () => ({
    associatedPoly: null,
    _pos: null,
    getPosition: function () { return this._pos; },
    setPosition: function (p) { this._pos = p; },
    setLabel: function () {},
    setMap: function () {}
});

// 🌟 ラベル位置更新（Turf交差は重いので無効化。SVGが中心計算する）
window.updateCadLabelPositionsThrottled = () => {};

window.getCadZoom = () => {
    if (window.cadVirtualZoom === undefined || window.cadVirtualZoom === null) {
        window.cadVirtualZoom = window.cadMap ? window.cadMap.getZoom() : 20;
    }
    return window.cadVirtualZoom;
};

window.cadZoomIn = () => {
    if (!window.cadMap) return;
    let currentZoom = window.getCadZoom();
    window.setCadZoom(currentZoom + 1);
};

window.cadZoomOut = () => {
    if (!window.cadMap) return;
    let currentZoom = window.getCadZoom();
    window.setCadZoom(currentZoom - 1);
};

window.setCadZoom = (zoom) => {
    if (zoom < 10) zoom = 10;
    if (zoom > 45) zoom = 45;
    window.cadVirtualZoom = zoom;

    if (window.cadMap) {
        window.cadIsSettingZoom = true;
        window.cadLastSetZoomTime = Date.now();
        try {
            // 🌟 修正：ズーム上限20のキャップを外し、Google Mapsネイティブの滑らかな拡大に任せる！
            window.cadMap.setZoom(zoom);
        } finally {
            setTimeout(() => { window.cadIsSettingZoom = false; }, 100);
        }
    }
    window.updateCadMapTransform();
};

window.updateCadStrokeWeights = (scale) => {
    if (!scale || scale <= 0) scale = 1.0;
    // 畝は SVG 描画のため Maps Polygon の setOptions 連打をしない（100本超で重い主因）
    if (window.cadTargetPolygon) window.cadTargetPolygon.setOptions({ strokeWeight: Math.max(0.5, 3 / scale) });
    if (window.cadNakamichiMapPolygons) window.cadNakamichiMapPolygons.forEach(l => l.setOptions({ strokeWeight: Math.max(0.5, 6 / scale) }));
    if (window.cadGridLines) window.cadGridLines.forEach(l => l.setOptions({ strokeWeight: Math.max(0.5, 2 / scale) }));
};

let cadMapTransformRAF = null;
let cadSvgLastUpdateMs = 0;
let cadSvgOverlayRAF = null;
let cadSvgWantFull = false;

window.scheduleCadSvgOverlay = (light) => {
    if (!light) cadSvgWantFull = true;
    if (cadSvgOverlayRAF) return;
    cadSvgOverlayRAF = requestAnimationFrame(() => {
        cadSvgOverlayRAF = null;
        const now = performance.now();
        const ridgeCount = window.cadGetRidgeCount();
        const minInterval = ridgeCount >= 80
            ? Math.max(48, window.CAD_PERF.svgMinIntervalMs)
            : window.CAD_PERF.svgMinIntervalMs;
        const doFull = cadSvgWantFull;
        cadSvgWantFull = false;
        if (light && !doFull && (now - cadSvgLastUpdateMs) < minInterval) {
            // パン中は間引き。最終フレームは遅延でフル更新
            if (!window._cadSvgTailTimer) {
                window._cadSvgTailTimer = setTimeout(() => {
                    window._cadSvgTailTimer = null;
                    window.updateCadSvgOverlay({ light: false });
                }, minInterval);
            }
            return;
        }
        cadSvgLastUpdateMs = now;
        window.updateCadSvgOverlay({ light: light && !doFull });
    });
};

window.updateCadMapTransform = () => {
    if (cadMapTransformRAF) return;
    cadMapTransformRAF = requestAnimationFrame(() => {
        cadMapTransformRAF = null;
        const mapDiv = document.getElementById('cadMap');
        if (mapDiv) {
            let offsetX = (window.cadMapOffsetX || 0) + (window.cadDragDx || 0);
            let offsetY = (window.cadMapOffsetY || 0) + (window.cadDragDy || 0);

            let currentZoom = window.getCadZoom();
            let realZoom = window.cadMap ? window.cadMap.getZoom() : 20;
            let apparentScale = Math.pow(2, currentZoom - realZoom);
            if (apparentScale < 0.25) apparentScale = 0.25;

            mapDiv.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) rotate(${window.cadCurrentRotation}deg) scale(${apparentScale})`;
            mapDiv.style.setProperty('--label-rot', (-window.cadCurrentRotation) + 'deg');
            mapDiv.style.setProperty('--cad-scale', apparentScale);
            window.cadCurrentScale = apparentScale;

            if (typeof window.updateCadStrokeWeights === 'function') {
                window.updateCadStrokeWeights(apparentScale);
            }
        }
        if (typeof window.scheduleCadSvgOverlay === 'function') {
            window.scheduleCadSvgOverlay(true);
        } else if (typeof window.updateCadSvgOverlay === 'function') {
            window.updateCadSvgOverlay();
        }
    });
};

window.latLngToScreenPixel = (lat, lng) => {
    if (!window.cadMap) return {x: 0, y: 0};
    const proj = window.cadMap.getProjection();
    if (!proj) return {x: 0, y: 0};
    
    const worldPoint = proj.fromLatLngToPoint(new google.maps.LatLng(lat, lng));
    const centerWorldPoint = proj.fromLatLngToPoint(window.cadMap.getCenter());
    
    const dxWorld = worldPoint.x - centerWorldPoint.x;
    let dyWorld = worldPoint.y - centerWorldPoint.y;
    
    const realZoom = window.cadMap.getZoom();
    const scaleToRealZoom = Math.pow(2, realZoom);
    
    let dxMap = dxWorld * scaleToRealZoom;
    let dyMap = dyWorld * scaleToRealZoom;
    
    let apparentScale = window.cadCurrentScale || 1.0;
    let dxScaled = dxMap * apparentScale;
    let dyScaled = dyMap * apparentScale;
    
    const theta = (window.cadCurrentRotation || 0) * Math.PI / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    
    let dxRotated = dxScaled * cosT - dyScaled * sinT;
    let dyRotated = dxScaled * sinT + dyScaled * cosT;
    
    const wrapper = document.getElementById('cadMapWrapper');
    const offsetX = (window.cadMapOffsetX || 0) + (window.cadDragDx || 0);
    const offsetY = (window.cadMapOffsetY || 0) + (window.cadDragDy || 0);
    
    const cx = wrapper.offsetWidth / 2 + offsetX;
    const cy = wrapper.offsetHeight / 2 + offsetY;
    
    return { x: cx + dxRotated, y: cy + dyRotated };
};

window.screenPixelToLatLng = (x, y) => {
    if (!window.cadMap) return null;
    const proj = window.cadMap.getProjection();
    if (!proj) return null;

    const wrapper = document.getElementById('cadMapWrapper');
    const rect = wrapper.getBoundingClientRect();
    let localX = x - rect.left;
    let localY = y - rect.top;

    const offsetX = (window.cadMapOffsetX || 0) + (window.cadDragDx || 0);
    const offsetY = (window.cadMapOffsetY || 0) + (window.cadDragDy || 0);
    const cx = wrapper.offsetWidth / 2 + offsetX;
    const cy = wrapper.offsetHeight / 2 + offsetY;

    let dxRotated = localX - cx;
    let dyRotated = localY - cy;

    let rad = -(window.cadCurrentRotation || 0) * Math.PI / 180;
    let cosT = Math.cos(rad);
    let sinT = Math.sin(rad);

    let dxScaled = dxRotated * cosT - dyRotated * sinT;
    let dyScaled = dxRotated * sinT + dyRotated * cosT;

    let apparentScale = window.cadCurrentScale || 1.0;
    let dxMap = dxScaled / apparentScale;
    let dyMap = dyScaled / apparentScale;

    const realZoom = window.cadMap.getZoom();
    const scaleToRealZoom = Math.pow(2, realZoom);
    let dxWorld = dxMap / scaleToRealZoom;
    let dyWorld = dyMap / scaleToRealZoom;

    const centerWorldPoint = proj.fromLatLngToPoint(window.cadMap.getCenter());
    let worldX = centerWorldPoint.x + dxWorld;
    let worldY = centerWorldPoint.y + dyWorld;

    return proj.fromPointToLatLng(new google.maps.Point(worldX, worldY));
};

window.cadSvgNeedsRebuild = true;

window.updateCadSvgOverlay = (opts) => {
    let svg = document.getElementById('cadSvgOverlay');
    if (!svg) return;
    const light = !!(opts && opts.light);
    const ridgeCount = window.cadGetRidgeCount();
    const disableHover = ridgeCount >= (window.CAD_PERF.disableHoverAt || 60);
    const hideLength = ridgeCount >= (window.CAD_PERF.hideLengthAt || 45);
    
    let currentPolysLength = (window.cadUnePolygons ? window.cadUnePolygons.length : 0) + 
                             (window.cadCustomShapes ? window.cadCustomShapes.length : 0) + 
                             (window.cadNakamichiMapPolygons ? window.cadNakamichiMapPolygons.length : 0) +
                             (window.cadDrainageMapPolygons ? window.cadDrainageMapPolygons.length : 0);
                             
    if (window.cadSvgNeedsRebuild || !svg.querySelector('#cadSvgPaths') || svg._lastPolysLength !== currentPolysLength) {
        svg._lastPolysLength = currentPolysLength;
        let html = '<defs><filter id="hover-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/></filter></defs>' +
                   '<g id="cadSvgGrid"></g><g id="cadSvgCellFills" style="pointer-events:none;"></g><g id="cadSvgCellHover" style="pointer-events:none;"></g><g id="cadSvgPaths"></g><g id="cadSvgMakuraEdges" style="pointer-events:none;"></g><g id="cadSvgTexts"></g><g id="cadSvgHandles"></g><g id="cadSvgDrawOverlay" style="pointer-events:none;"></g><g id="cadSvgPins"></g><g id="front-bar" style="filter: url(#hover-shadow);"></g>';
        svg.innerHTML = html;
        let gridGroup = svg.querySelector('#cadSvgGrid');
        let pathsGroup = svg.querySelector('#cadSvgPaths');
        let textsGroup = svg.querySelector('#cadSvgTexts');
        
        const createPathNode = (fillColor, strokeColor, isLine = false) => {
            let pathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathNode.setAttribute('fill', isLine ? 'none' : fillColor);
            pathNode.setAttribute('fill-opacity', '0.7');
            pathNode.setAttribute('stroke', strokeColor);
            pathNode.setAttribute('stroke-opacity', '0.9');
            pathNode.setAttribute('stroke-width', isLine ? '6' : '2');
            pathNode.setAttribute('stroke-linejoin', 'round');
            if (!isLine) pathNode.setAttribute('fill-rule', 'evenodd');
            pathNode.setAttribute('style', 'pointer-events: none;');
            return pathNode;
        };

        const wireRidgePath = (p, baseLabel) => {
            p._svgPathNode = createPathNode(window.cadGetGroupColor ? window.cadGetGroupColor(p.uneGroup) : '#8BC34A', '#558B2F');
            p._svgPathNode.setAttribute('style', 'pointer-events: auto; cursor: pointer;');
            if (!disableHover) {
                p._svgPathNode.addEventListener('mouseover', () => p._svgPathNode.setAttribute('filter', 'url(#hover-shadow)'));
                p._svgPathNode.addEventListener('mouseout', () => p._svgPathNode.removeAttribute('filter'));
            }
            p._svgPathNode.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (window.cadPinMode) return;
                if (p.uneIndex && typeof window.cadSelectRidgeByTap === 'function') window.cadSelectRidgeByTap(p.uneIndex);
            });
            if (typeof window.cadApplyRidgeSelectionStyle_ === 'function') window.cadApplyRidgeSelectionStyle_(p);
            pathsGroup.appendChild(p._svgPathNode);

            let textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textNode.setAttribute('fill', '#ffffff');
            textNode.setAttribute('font-size', '24');
            textNode.setAttribute('font-weight', 'bold');
            textNode.setAttribute('font-family', 'sans-serif');
            textNode.setAttribute('text-anchor', 'middle');
            textNode.setAttribute('dominant-baseline', 'central');
            textNode.setAttribute('style', 'pointer-events: none; paint-order: stroke; stroke: #000000; stroke-width: 4px;');
            try {
                if (typeof window.applyCadUneSvgLabelText === 'function' && !hideLength) {
                    window.applyCadUneSvgLabelText(textNode, p, baseLabel);
                } else {
                    const title = typeof window.getCadUneLabelTitle === 'function'
                        ? window.getCadUneLabelTitle(p, baseLabel)
                        : String(baseLabel);
                    textNode.textContent = title;
                }
            } catch (e) {
                textNode.textContent = String(baseLabel == null ? '' : baseLabel);
            }
            p._svgTextNode = textNode;
            textsGroup.appendChild(textNode);
        };
        
        if (window.cadTargetPolygon) {
            window.cadTargetPolygon._svgPathNode = createPathNode('#D7CCC8', '#8BC34A');
            window.cadTargetPolygon._svgPathNode.setAttribute('fill-opacity', '0.4');
            window.cadTargetPolygon._svgPathNode.setAttribute('stroke-opacity', '1.0');
            window.cadTargetPolygon._svgPathNode.setAttribute('stroke-width', '3');
            pathsGroup.appendChild(window.cadTargetPolygon._svgPathNode);
        }
        
        if (window.cadUnePolygons) {
            window.cadUnePolygons.forEach((p, idx) => {
                try {
                    let baseIdx = p._displayLabel ? p._displayLabel : (p.customLabel ? p.customLabel : String(idx + 1));
                    wireRidgePath(p, baseIdx);
                } catch (e) {}
            });
        }
        if (window.cadCustomShapes) {
            let baseIdx = window.cadUnePolygons ? window.cadUnePolygons.length : 0;
            window.cadCustomShapes.forEach((p, idx) => {
                try {
                    let baseIdxStr = p._displayLabel ? p._displayLabel : (p.customLabel ? p.customLabel : String(baseIdx + idx + 1));
                    wireRidgePath(p, baseIdxStr);
                } catch (e) {}
            });
        }
        if (window.cadNakamichiMapPolygons) {
            window.cadNakamichiMapPolygons.forEach((p, lineIdx) => {
                p._svgPathNode = createPathNode('none', '#E91E63', true);
                p._svgPathNode.setAttribute('stroke-width', '8');
                p._svgPathNode.setAttribute('stroke-opacity', '0');
                p._svgPathNode.setAttribute('style', 'pointer-events: none;');

                let isDraggingLine = false;
                let startClientX = 0, startClientY = 0;
                let startCoords = [];

                const onLineMove = (ev) => {
                    if (ev.cancelable) ev.preventDefault();
                    if (!isDraggingLine) return;
                    let clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
                    let clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
                    let startLatLng = window.screenPixelToLatLng(startClientX, startClientY);
                    let curLatLng = window.screenPixelToLatLng(clientX, clientY);
                    if (startLatLng && curLatLng && startCoords.length >= 2) {
                        let dLat = curLatLng.lat() - startLatLng.lat();
                        let dLng = curLatLng.lng() - startLatLng.lng();
                        let path = p.getPath ? p.getPath() : null;
                        for (let i = 0; i < startCoords.length; i++) {
                            let newLat = startCoords[i].lat + dLat;
                            let newLng = startCoords[i].lng + dLng;
                            let newPt = new google.maps.LatLng(newLat, newLng);
                            if (path) path.setAt(i, newPt);
                            if (window.cadNakamichiLines && window.cadNakamichiLines[lineIdx]) {
                                window.cadNakamichiLines[lineIdx][i] = { lat: newLat, lng: newLng };
                            }
                        }
                        if (typeof window.cadReapplyAllNakamichiSplits === 'function') {
                            window.cadReapplyAllNakamichiSplits();
                        }
                        window.updateCadSvgOverlay({ light: true });
                    }
                };

                const onLineEnd = () => {
                    if (!isDraggingLine) return;
                    isDraggingLine = false;
                    window.removeEventListener('mousemove', onLineMove);
                    window.removeEventListener('mouseup', onLineEnd);
                    window.removeEventListener('touchmove', onLineMove);
                    window.removeEventListener('touchend', onLineEnd);
                    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
                    window.updateCadSvgOverlay();
                };

                p._svgPathNode.addEventListener('mousedown', (e) => {
                    isDraggingLine = true; e.stopPropagation();
                    startClientX = e.clientX; startClientY = e.clientY;
                    const path = p.getPath ? p.getPath() : null;
                    startCoords = [];
                    if (path) {
                        for (let i = 0; i < path.getLength(); i++) {
                            let pt = path.getAt(i);
                            startCoords.push({ lat: pt.lat(), lng: pt.lng() });
                        }
                    }
                    window.addEventListener('mousemove', onLineMove);
                    window.addEventListener('mouseup', onLineEnd);
                });

                p._svgPathNode.addEventListener('touchstart', (e) => {
                    isDraggingLine = true; e.stopPropagation();
                    startClientX = e.touches[0].clientX; startClientY = e.touches[0].clientY;
                    const path = p.getPath ? p.getPath() : null;
                    startCoords = [];
                    if (path) {
                        for (let i = 0; i < path.getLength(); i++) {
                            let pt = path.getAt(i);
                            startCoords.push({ lat: pt.lat(), lng: pt.lng() });
                        }
                    }
                    window.addEventListener('touchmove', onLineMove, {passive: false});
                    window.addEventListener('touchend', onLineEnd);
                }, {passive: false});

                pathsGroup.appendChild(p._svgPathNode);
            });
        }
        
        if (window.cadDrainageMapPolygons) {
            window.cadDrainageMapPolygons.forEach(p => {
                p._svgPathNode = createPathNode('none', '#00BCD4', true);
                p._svgPathNode.setAttribute('stroke-dasharray', '8,8');
                pathsGroup.appendChild(p._svgPathNode);
            });
        }

        if (!svg.querySelector('#cadSvgTempLine')) {
            let tempLineNode = createPathNode('none', '#E91E63', true);
            tempLineNode.setAttribute('id', 'cadSvgTempLine');
            tempLineNode.style.display = 'none';
            pathsGroup.appendChild(tempLineNode);
        }

        if (window.cadGridLines && gridGroup) {
            window.cadGridLines.forEach(l => {
                const isMajor = !!(l && l._cadGridMajor);
                l._svgPathNode = createPathNode('none', isMajor ? '#00E5FF' : '#80DEEA', true);
                l._svgPathNode.setAttribute('stroke-opacity', isMajor ? '0.85' : '0.6');
                l._svgPathNode.setAttribute('stroke-width', isMajor ? '2' : '1.2');
                l._svgPathNode.setAttribute('style', 'pointer-events: none;');
                gridGroup.appendChild(l._svgPathNode);
            });
        }

        window.cadSvgNeedsRebuild = false;
        svg._lastHandleStateId = null;
        svg._lastPinsStateId = null;
    }
    
    let handleStateId = '';
    const editEl = document.getElementById('cadEditIndex');
    const editingId = editEl ? editEl.value : '';
    const selectedRidgeId = window.cadSelectedRidgeId || '';
    handleStateId = 'edit:' + (editingId || '') + '|sel:' + selectedRidgeId + '|';
    if (editingId) {
        const allForHandle = [...(window.cadUnePolygons || []), ...(window.cadCustomShapes || [])];
        const ep = allForHandle.find(p => p && p.uneIndex === editingId);
        if (ep && ep.getPath) handleStateId += ep.getPath().getLength();
    }

    let handlesGroup = svg.querySelector('#cadSvgHandles');
    if (!light && handlesGroup && !window.cadRidgeEndDragging && svg._lastHandleStateId !== handleStateId) {
        svg._lastHandleStateId = handleStateId;
        handlesGroup.innerHTML = '';
        
        const createHandlesForPoly = (poly) => {
            let path = poly.getPath();
            if (!path) return;
            poly._svgHandlesNodes = [];
            for (let i = 0; i < path.getLength(); i++) {
                let circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('r', '8');
                circle.setAttribute('fill', '#ffffff');
                circle.setAttribute('stroke', '#558B2F');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('style', 'cursor: pointer; pointer-events: auto;');
                
                let isDraggingHandle = false;
                
                const onMove = (ev) => {
                    if (ev.cancelable) ev.preventDefault();
                    if (!isDraggingHandle) return;
                    let clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
                    let clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
                    let newLatLng = window.screenPixelToLatLng(clientX, clientY);
                    if (newLatLng) {
                        path.setAt(i, newLatLng);
                        window.updateCadSvgOverlay({ light: true });
                    }
                };
                
                const onEnd = () => {
                    if (!isDraggingHandle) return;
                    isDraggingHandle = false;
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onEnd);
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('touchend', onEnd);
                    if (typeof window.updateSingleLabelPosition === 'function') window.updateSingleLabelPosition(poly);
                    if (typeof window.reassignLabels === 'function') window.reassignLabels();
                    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
                };
                
                circle.addEventListener('mousedown', (e) => {
                    isDraggingHandle = true; e.stopPropagation();
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onEnd);
                });
                
                circle.addEventListener('touchstart', (e) => {
                    isDraggingHandle = true; e.stopPropagation();
                    window.addEventListener('touchmove', onMove, {passive: false});
                    window.addEventListener('touchend', onEnd);
                }, {passive: false});
                
                handlesGroup.appendChild(circle);
                poly._svgHandlesNodes.push(circle);
            }
        };

        const createHandlesForNakamichiLines = () => {
            return;
            if (!window.cadNakamichiMapPolygons || !window.cadNakamichiMapPolygons.length) return;
            window.cadNakamichiMapPolygons.forEach((polyLine, lineIdx) => {
                let path = polyLine.getPath ? polyLine.getPath() : null;
                if (!path || path.getLength() < 2) return;
                polyLine._svgHandlesNodes = [];

                for (let i = 0; i < path.getLength(); i++) {
                    let circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('r', '9');
                    circle.setAttribute('fill', '#E91E63');
                    circle.setAttribute('stroke', '#FFFFFF');
                    circle.setAttribute('stroke-width', '2.5');
                    circle.setAttribute('style', 'cursor: pointer; pointer-events: auto;');

                    let isDraggingHandle = false;

                    const onMove = (ev) => {
                        if (ev.cancelable) ev.preventDefault();
                        if (!isDraggingHandle) return;
                        let clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
                        let clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
                        let newLatLng = window.screenPixelToLatLng(clientX, clientY);
                        if (newLatLng) {
                            path.setAt(i, newLatLng);
                            if (window.cadNakamichiLines && window.cadNakamichiLines[lineIdx]) {
                                window.cadNakamichiLines[lineIdx][i] = { lat: newLatLng.lat(), lng: newLatLng.lng() };
                            }
                            if (typeof window.cadReapplyAllNakamichiSplits === 'function') {
                                window.cadReapplyAllNakamichiSplits();
                            }
                            window.updateCadSvgOverlay({ light: true });
                        }
                    };

                    const onEnd = () => {
                        if (!isDraggingHandle) return;
                        isDraggingHandle = false;
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onEnd);
                        window.removeEventListener('touchmove', onMove);
                        window.removeEventListener('touchend', onEnd);
                        if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
                        window.updateCadSvgOverlay();
                    };

                    circle.addEventListener('mousedown', (e) => {
                        isDraggingHandle = true; e.stopPropagation();
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onEnd);
                    });

                    circle.addEventListener('touchstart', (e) => {
                        isDraggingHandle = true; e.stopPropagation();
                        window.addEventListener('touchmove', onMove, {passive: false});
                        window.addEventListener('touchend', onEnd);
                    }, {passive: false});

                    handlesGroup.appendChild(circle);
                    polyLine._svgHandlesNodes.push(circle);
                }
            });
        };

        if (editingId) {
            const allForHandle = [...(window.cadUnePolygons || []), ...(window.cadCustomShapes || [])];
            const ep = allForHandle.find(p => p && p.uneIndex === editingId);
            if (ep) createHandlesForPoly(ep);
        }
        if (selectedRidgeId && typeof window.cadAttachRidgeEndHandles_ === 'function') {
            const allForEnd = [...(window.cadUnePolygons || []), ...(window.cadCustomShapes || [])];
            const sp = allForEnd.find(p => p && p.uneIndex === selectedRidgeId);
            if (sp) window.cadAttachRidgeEndHandles_(sp, handlesGroup);
        }
        createHandlesForNakamichiLines();
    }
    
    const updatePathD = (poly, isLine = false) => {
        const svgNum = (n) => (Number.isFinite(n) ? String(Math.round(n * 10) / 10) : null);
        const appendRing = (path, close) => {
            if (!path || !path.getLength || path.getLength() === 0) return '';
            let d = '';
            let started = false;
            for (let i = 0; i < path.getLength(); i++) {
                const pt = path.getAt(i);
                if (!pt || typeof pt.lat !== 'function') continue;
                let screenPt;
                try { screenPt = window.latLngToScreenPixel(pt.lat(), pt.lng()); } catch (e) { continue; }
                if (!screenPt) continue;
                const x = svgNum(screenPt.x);
                const y = svgNum(screenPt.y);
                if (x == null || y == null) continue;
                d += (started ? 'L' : 'M') + x + ',' + y + ' ';
                started = true;
            }
            if (started && close) d += 'Z ';
            return d;
        };
        if (!poly) return '';
        if (isLine) {
            try { return appendRing(poly.getPath && poly.getPath(), false); } catch (e) { return ''; }
        }
        try {
            const paths = poly.getPaths && poly.getPaths();
            const n = paths && typeof paths.getLength === 'function' ? paths.getLength() : 0;
            if (n > 1) {
                let d = '';
                for (let r = 0; r < n; r++) d += appendRing(paths.getAt(r), true);
                if (d) return d;
            }
        } catch (e) {}
        try { return appendRing(poly.getPath && poly.getPath(), true); } catch (e) { return ''; }
    };

    const paintPolyPath = (poly, isLine) => {
        if (!poly || !poly._svgPathNode) return;
        try { poly._svgPathNode.setAttribute('d', updatePathD(poly, !!isLine)); } catch (e) {}
    };

    const quickCenterLatLng = (poly) => {
        const path = poly.getPath();
        if (!path || path.getLength() === 0) return null;
        let lat = 0;
        let lng = 0;
        const n = path.getLength();
        for (let i = 0; i < n; i++) {
            const pt = path.getAt(i);
            lat += pt.lat();
            lng += pt.lng();
        }
        return new google.maps.LatLng(lat / n, lng / n);
    };

    if (window.cadTargetPolygon && window.cadTargetPolygon._svgPathNode) {
        paintPolyPath(window.cadTargetPolygon, false);
    }
    if (window.cadGridLines) {
        window.cadGridLines.forEach(l => paintPolyPath(l, true));
    }
    if (window.cadUnePolygons) {
        window.cadUnePolygons.forEach((p) => {
            paintPolyPath(p, false);
            if (p._svgTextNode) {
                const latLng = quickCenterLatLng(p);
                if (latLng) {
                    const screenPt = window.latLngToScreenPixel(latLng.lat(), latLng.lng());
                    p._svgTextNode.setAttribute('x', screenPt.x);
                    p._svgTextNode.setAttribute('y', screenPt.y);
                    p._svgTextNode.querySelectorAll('tspan').forEach(ts => ts.setAttribute('x', screenPt.x));
                }
            }
        });
    }
    if (window.cadCustomShapes) {
        window.cadCustomShapes.forEach((p) => {
            paintPolyPath(p, false);
            if (p._svgTextNode) {
                const latLng = quickCenterLatLng(p);
                if (latLng) {
                    const screenPt = window.latLngToScreenPixel(latLng.lat(), latLng.lng());
                    p._svgTextNode.setAttribute('x', screenPt.x);
                    p._svgTextNode.setAttribute('y', screenPt.y);
                    p._svgTextNode.querySelectorAll('tspan').forEach(ts => ts.setAttribute('x', screenPt.x));
                }
            }
        });
    }
    if (!light && typeof window.applyCadRidgeLabelVisibility === 'function') {
        window.applyCadRidgeLabelVisibility();
    }
    if (window.cadNakamichiMapPolygons) {
        window.cadNakamichiMapPolygons.forEach(p => paintPolyPath(p, true));
    }
    if (window.cadDrainageMapPolygons) {
        window.cadDrainageMapPolygons.forEach(p => paintPolyPath(p, true));
    }
    
    if (typeof window.cadPaintNakamichiTempLine === 'function') window.cadPaintNakamichiTempLine();
    
    const updateHandlesPosition = (poly) => {
        if (poly && poly._svgHandlesNodes) {
            let path = poly.getPath();
            for (let i = 0; i < path.getLength(); i++) {
                let pt = path.getAt(i);
                let screenPt = window.latLngToScreenPixel(pt.lat(), pt.lng());
                let circle = poly._svgHandlesNodes[i];
                if (circle) {
                    circle.setAttribute('cx', screenPt.x);
                    circle.setAttribute('cy', screenPt.y);
                }
            }
        }
    };
    if (editingId) {
        const allForHandlePos = [...(window.cadUnePolygons || []), ...(window.cadCustomShapes || [])];
        const ep = allForHandlePos.find(p => p && p.uneIndex === editingId);
        if (ep) updateHandlesPosition(ep);
    }
    if (window.cadSelectedRidgeId && typeof window.cadPositionRidgeEndHandles_ === 'function') {
        const allForEndPos = [...(window.cadUnePolygons || []), ...(window.cadCustomShapes || [])];
        const sp = allForEndPos.find(p => p && p.uneIndex === window.cadSelectedRidgeId);
        if (sp) window.cadPositionRidgeEndHandles_(sp);
    }
    if (window.cadNakamichiMapPolygons) {
        window.cadNakamichiMapPolygons.forEach(p => updateHandlesPosition(p));
    }

    let pinsStateId = '';
    if (window.cadPins && window.cadPins.length) {
        pinsStateId = window.cadPins.map(mk => {
            const pos = mk.getPosition ? mk.getPosition() : null;
            const t = mk.cadPinType || '';
            if (!pos) return t;
            return t + ':' + pos.lat().toFixed(6) + ',' + pos.lng().toFixed(6);
        }).join('|') + '_n' + (window.cadPinNumFontSize || 24);
    } else {
        pinsStateId = 'none_n' + (window.cadPinNumFontSize || 24);
    }
    let pinsGroup = svg ? svg.querySelector('#cadSvgPins') : null;
    // ドラッグ中はDOM再生成しない（毎回0,0に一瞬飛ぶ不具合を防ぐ）
    if (pinsGroup && svg._lastPinsStateId !== pinsStateId && !window.cadPinDragging) {
        svg._lastPinsStateId = pinsStateId;
        pinsGroup.innerHTML = '';
        
        if (window.cadPins) {
            const typeTotals = {};
            window.cadPins.forEach((mk) => {
                const t = mk.cadPinType || 'machine_entry';
                typeTotals[t] = (typeTotals[t] || 0) + 1;
            });
            const typeSeq = {};
            const numFontPx = Math.max(8, Math.min(48, parseFloat(window.cadPinNumFontSize) || 24));
            window.cadPins.forEach((mk, idx) => {
                // foreignObject 外の要素はクリックが届かないため、削除ボタンを必ず枠内に置く
                const foW = 120;
                const foH = 120;
                let fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                fo.setAttribute('width', String(foW));
                fo.setAttribute('height', String(foH));
                fo.setAttribute('style', 'overflow:visible; pointer-events:auto;');
                
                let wrap = document.createElement('div');
                wrap.className = 'cad-equip-pin-wrap';
                wrap.style.cssText = `position:relative; width:100%; height:100%; pointer-events:auto;`;

                let div = document.createElement('div');
                let iconStr = '';
                let numStr = '';
                let nameStr = '';
                const pinType = mk.cadPinType || 'machine_entry';
                typeSeq[pinType] = (typeSeq[pinType] || 0) + 1;
                const showNum = (typeTotals[pinType] || 0) > 1;
                if (pinType === 'water_in') {
                    iconStr = '🚰';
                    nameStr = '給水';
                } else if (pinType === 'water_out') {
                    iconStr = '🚩';
                    nameStr = '排水';
                } else if (pinType === 'parking_truck') {
                    iconStr = '🅿️';
                    nameStr = '駐車場';
                } else {
                    iconStr = '🚜';
                    nameStr = '侵入口';
                }
                if (showNum) numStr = String(typeSeq[pinType]);
                
                let iconSpan = document.createElement('span');
                iconSpan.className = 'cad-pin-icon';
                iconSpan.textContent = iconStr;
                iconSpan.style.cssText = 'display:block; line-height:1; font-size:22px;';
                div.appendChild(iconSpan);

                if (nameStr) {
                    let nameSpan = document.createElement('span');
                    nameSpan.className = 'cad-pin-name';
                    nameSpan.textContent = nameStr;
                    nameSpan.style.cssText = 'position:absolute; left:50%; top:100%; transform:translate(-50%, 2px); font-size:20px; font-weight:bold; color:#111; white-space:nowrap; line-height:1.1; pointer-events:none; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;';
                    div.appendChild(nameSpan);
                }

                if (numStr) {
                    let numSpan = document.createElement('span');
                    numSpan.className = 'cad-pin-num';
                    numSpan.textContent = numStr;
                    numSpan.style.cssText = `position:absolute; left:50%; top:0; transform:translate(-50%, -110%); font-size:${numFontPx}px; font-weight:bold; color:#111; line-height:1; pointer-events:none; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;`;
                    div.appendChild(numSpan);
                }
                
                div.className = 'cad-equip-pin';
                div.style.cssText = 'font-size:22px; text-align:center; transform:translate(-50%, -50%) rotate(var(--label-rot)); position:absolute; left:50%; top:50%; pointer-events:auto; cursor:move; user-select:none; touch-action:none; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;';
                wrap.appendChild(div);

                let delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.innerHTML = '✕';
                delBtn.className = 'cad-pin-del-btn';
                delBtn.title = 'このピンを削除';
                delBtn.setAttribute('aria-label', 'このピンを削除');
                // FO枠内（右上）に配置。枠外だと SVG でクリック不能になる
                delBtn.style.cssText = 'position:absolute; top:4px; right:4px; width:36px; height:36px; background:#f44336; color:white; font-size:18px; line-height:1; text-align:center; border-radius:50%; cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.5); display:none; border: 2px solid white; padding:0; z-index:5; pointer-events:auto;';
                wrap.appendChild(delBtn);
                fo.appendChild(wrap);
                
                let isDraggingPin = false;
                let dragDistance = 0;
                let dragStartX = 0;
                let dragStartY = 0;

                const syncPinFoPosition = (latLng) => {
                    if (!mk._svgFoNode || !latLng) return;
                    const w = parseFloat(mk._svgFoNode.getAttribute('width')) || foW;
                    const h = parseFloat(mk._svgFoNode.getAttribute('height')) || foH;
                    const screenPt = window.latLngToScreenPixel(latLng.lat(), latLng.lng());
                    mk._svgFoNode.setAttribute('x', screenPt.x - (w / 2));
                    mk._svgFoNode.setAttribute('y', screenPt.y - (h / 2));
                };

                const isDeleteTarget = (target) => {
                    if (!target) return false;
                    if (target === delBtn) return true;
                    if (typeof target.closest === 'function' && target.closest('.cad-pin-del-btn')) return true;
                    return false;
                };

                const onMove = (ev) => {
                    if (ev.cancelable) ev.preventDefault();
                    if (!isDraggingPin) return;
                    let clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
                    let clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
                    dragDistance += Math.abs(clientX - dragStartX) + Math.abs(clientY - dragStartY);
                    dragStartX = clientX;
                    dragStartY = clientY;

                    let newLatLng = window.screenPixelToLatLng(clientX, clientY);
                    if (newLatLng) {
                        mk.setPosition(newLatLng);
                        // フル再描画せず、このピンの表示位置だけ更新
                        syncPinFoPosition(newLatLng);
                    }
                };
                
                const onEnd = () => {
                    if (!isDraggingPin) return;
                    isDraggingPin = false;
                    window.cadPinDragging = false;
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onEnd);
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('touchend', onEnd);
                    
                    if (dragDistance < 10) {
                        let allDelBtns = document.querySelectorAll('.cad-pin-del-btn');
                        allDelBtns.forEach(btn => { if(btn !== delBtn) btn.style.display = 'none'; });
                        delBtn.style.display = delBtn.style.display === 'none' ? 'block' : 'none';
                    } else {
                        // 位置確定後に状態IDを更新（次回の通常再描画で同期）
                        if (svg) svg._lastPinsStateId = null;
                        if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
                    }
                };
                
                div.addEventListener('mousedown', (e) => {
                    if (e.button != null && e.button !== 0) return;
                    if (isDeleteTarget(e.target)) return;
                    isDraggingPin = true;
                    window.cadPinDragging = true;
                    dragDistance = 0; 
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;
                    e.preventDefault();
                    e.stopPropagation();
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onEnd);
                });
                
                div.addEventListener('touchstart', (e) => {
                    if (isDeleteTarget(e.target)) return;
                    isDraggingPin = true;
                    window.cadPinDragging = true;
                    dragDistance = 0;
                    dragStartX = e.touches[0].clientX;
                    dragStartY = e.touches[0].clientY;
                    e.preventDefault();
                    e.stopPropagation();
                    window.addEventListener('touchmove', onMove, {passive: false});
                    window.addEventListener('touchend', onEnd);
                }, {passive: false});

                const removePinNow = () => {
                    try { if (mk.setMap) mk.setMap(null); } catch (err) {}
                    window.cadPins = (window.cadPins || []).filter(p => p !== mk);
                    mk._svgFoNode = null;
                    if (svg) svg._lastPinsStateId = null;
                    window.cadSvgNeedsRebuild = true;
                    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
                    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
                    const msgEl = document.getElementById('cadPinModeMsg');
                    if (msgEl) {
                        msgEl.innerText = '設備ピンを削除しました。保存を忘れずに。';
                        msgEl.style.color = '#f44336';
                    }
                };

                let deleteGuardUntil = 0;
                const onDelete = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // ドラッグ開始を打ち消す
                    isDraggingPin = false;
                    window.cadPinDragging = false;
                    // touchend + click の二重発火防止
                    const now = Date.now();
                    if (now < deleteGuardUntil) return;
                    deleteGuardUntil = now + 600;
                    if (!confirm('この設備ピンを削除しますか？')) return;
                    removePinNow();
                };

                delBtn.addEventListener('click', onDelete);
                delBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
                delBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); }, {passive: false});
                delBtn.addEventListener('touchend', onDelete, {passive: false});
                
                pinsGroup.appendChild(fo);
                mk._svgFoNode = fo;
            });
        }
    }
    
    if (window.cadPins) {
        let currentZoom = window.getCadZoom();
        let pinScale = Math.max(0.5, Math.pow(2, currentZoom - 20));
        let scaledFontSize = Math.round(24 * pinScale);
        // 削除ボタン分を含めて FO を十分大きく保つ
        let foSize = Math.max(120, scaledFontSize + 80);

        window.cadPins.forEach(mk => {
            if (mk._svgFoNode) {
                let latLng = mk.getPosition();
                if (latLng) {
                    let screenPt = window.latLngToScreenPixel(latLng.lat(), latLng.lng());
                    mk._svgFoNode.setAttribute('width', foSize);
                    mk._svgFoNode.setAttribute('height', foSize);
                    mk._svgFoNode.setAttribute('x', screenPt.x - (foSize / 2));
                    mk._svgFoNode.setAttribute('y', screenPt.y - (foSize / 2));
                    
                    let div = mk._svgFoNode.querySelector('.cad-equip-pin');
                    if (div) {
                        div.style.fontSize = scaledFontSize + 'px';
                    }
                }
            }
        });
    }

    // svg is already defined at the top of the function
    let frontBarGroup = svg ? svg.querySelector('#front-bar') : null;
    if (frontBarGroup) {
        if (window.cadFrontBaseline) {
            let pLat, pLng;
            if (Array.isArray(window.cadFrontBaseline) && window.cadFrontBaseline.length === 2) {
                pLat = (window.cadFrontBaseline[0].lat + window.cadFrontBaseline[1].lat) / 2;
                pLng = (window.cadFrontBaseline[0].lng + window.cadFrontBaseline[1].lng) / 2;
            } else {
                pLat = window.cadFrontBaseline.lat;
                pLng = window.cadFrontBaseline.lng;
            }

            let fo = frontBarGroup.querySelector('foreignObject');
            if (!fo) {
                frontBarGroup.innerHTML = ''; // 古い線とハンドルをクリア
                fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                fo.setAttribute('width', '120');
                fo.setAttribute('height', '48');
                fo.setAttribute('style', 'overflow:visible; pointer-events:none;');
                let div = document.createElement('div');
                div.className = 'front-bar-label';
                div.style.cssText = 'color:#ffffff; background:#FF5722; padding:6px 12px; border-radius:4px; font-size:17px; font-weight:bold; text-align:center; white-space:nowrap; transform:translate(-50%, -50%); position:absolute; left:50%; top:50%; pointer-events:auto; cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.5);';
                div.innerText = '畝の正面';
                fo.appendChild(div);
                frontBarGroup.appendChild(fo);

                let isDragging = false;
                const onMove = (ev) => {
                    if (ev.cancelable) ev.preventDefault();
                    if (!isDragging) return;
                    let cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
                    let cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
                    let newLatLng = window.screenPixelToLatLng(cx, cy);
                    if (newLatLng) {
                        window.cadFrontBaseline = {lat: newLatLng.lat(), lng: newLatLng.lng()};
                        window.updateCadSvgOverlay();
                    }
                };
                const onEnd = () => {
                    if (!isDragging) return;
                    isDragging = false;
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onEnd);
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('touchend', onEnd);
                    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
                };
                div.addEventListener('mousedown', (e) => {
                    isDragging = true; e.stopPropagation();
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onEnd);
                });
                div.addEventListener('touchstart', (e) => {
                    isDragging = true; e.stopPropagation();
                    window.addEventListener('touchmove', onMove, {passive: false});
                    window.addEventListener('touchend', onEnd);
                }, {passive: false});
            }
            let pt = window.latLngToScreenPixel(pLat, pLng);
            fo.setAttribute('x', pt.x - 60);
            fo.setAttribute('y', pt.y - 24);
        } else {
            frontBarGroup.innerHTML = '';
        }
    }

    // SVG再構築で消えるため、GPS測位中ならプレビューを描き直す
    if (typeof window.cadDrawMakuraEdgeOverlay === 'function') window.cadDrawMakuraEdgeOverlay();

    if (typeof window.cadRefreshRidgeSelectionUi_ === 'function') window.cadRefreshRidgeSelectionUi_();

    if (window.cadGpsWatchId != null && window.cadGpsLastPos && typeof window.cadDrawGpsPreviewOnSvg === 'function') {
        window.cadDrawGpsPreviewOnSvg(
            window.cadGpsLastPos.lat,
            window.cadGpsLastPos.lng,
            window.cadGpsLastPos.accuracy || 20
        );
    }
};

window.updateCadLabelScale = (detectedScale) => {
    // CSSのカスタムプロパティ（--cad-label-scale）によるスケールで一括制御するため、JSでの個別のフォントサイズ変更は行いません（パフォーマンスとCSS競合回避のため）
};

/** 畝番号ラベルの画面サイズ概算（SVG font-size=24 基準。長さ行ありは2行分） */
window.estimateCadRidgeLabelScreenSize = (textOrNode) => {
    const fontSize = 24;
    if (textOrNode && textOrNode.querySelectorAll) {
        const tspans = textOrNode.querySelectorAll('tspan');
        if (tspans.length > 0) {
            const lines = Array.from(tspans).map(t => t.textContent || '');
            const maxLen = Math.max(...lines.map(s => s.length), 1);
            const w = Math.max(fontSize * 0.7, maxLen * fontSize * 0.62) + 10;
            const h = (tspans.length > 1 ? fontSize * 2.2 : fontSize) + 10;
            return { w, h };
        }
    }
    const str = String((textOrNode && textOrNode.textContent != null) ? textOrNode.textContent : (textOrNode || ''));
    const w = Math.max(fontSize * 0.7, str.length * fontSize * 0.62) + 10;
    const h = fontSize + 10;
    return { w, h };
};

/**
 * 引きで畝番号が密集するときは全非表示。
 * 近づいたら表示するが、隣とAABBが重なる番号は間引く。
 */
window.applyCadRidgeLabelVisibility = () => {
    const items = [];
    const ridgeCount = window.cadGetRidgeCount();
    const collect = (polyList) => {
        if (!polyList) return;
        polyList.forEach(p => {
            const node = p && p._svgTextNode;
            if (!node) return;
            const x = parseFloat(node.getAttribute('x'));
            const y = parseFloat(node.getAttribute('y'));
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                node.setAttribute('visibility', 'hidden');
                return;
            }
            const size = window.estimateCadRidgeLabelScreenSize(node);
            items.push({ node, x, y, w: size.w, h: size.h });
        });
    };
    collect(window.cadUnePolygons);
    collect(window.cadCustomShapes);

    if (items.length === 0) return;

    const hideAll = () => {
        items.forEach(it => it.node.setAttribute('visibility', 'hidden'));
    };

    // 本数が多い／引きすぎは全非表示（衝突計算自体を避ける）
    if (ridgeCount >= (window.CAD_PERF.forceHideLabelsAt || 90)) {
        hideAll();
        return;
    }

    if (items.length >= 2) {
        const xs = items.map(it => it.x);
        const ys = items.map(it => it.y);
        const spanX = Math.max(...xs) - Math.min(...xs);
        const spanY = Math.max(...ys) - Math.min(...ys);
        const sorted = items.slice().sort((a, b) => (spanX >= spanY ? (a.x - b.x || a.y - b.y) : (a.y - b.y || a.x - b.x)));
        const gaps = [];
        for (let i = 1; i < sorted.length; i++) {
            gaps.push(Math.hypot(sorted[i].x - sorted[i - 1].x, sorted[i].y - sorted[i - 1].y));
        }
        gaps.sort((a, b) => a - b);
        const medianGap = gaps[Math.floor(gaps.length / 2)];
        const refW = window.estimateCadRidgeLabelScreenSize('88').w;
        if (!(medianGap > refW * 0.9)) {
            hideAll();
            return;
        }
    }

    const spanX = Math.max(...items.map(it => it.x)) - Math.min(...items.map(it => it.x));
    const spanY = Math.max(...items.map(it => it.y)) - Math.min(...items.map(it => it.y));
    const ordered = items.slice().sort((a, b) => (spanX >= spanY ? (a.x - b.x || a.y - b.y) : (a.y - b.y || a.x - b.x)));
    const shown = [];
    const pad = 4;
    const overlaps = (a, b) =>
        Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad
        && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;

    ordered.forEach(it => {
        if (shown.some(s => overlaps(s, it))) {
            it.node.setAttribute('visibility', 'hidden');
        } else {
            it.node.setAttribute('visibility', 'visible');
            shown.push(it);
        }
    });
};

window.getCadVisibleBoundsPolygon = () => {
    if (!window.cadMap) return null;
    const wrapper = document.getElementById('cadMapWrapper');
    if (!wrapper) return null;
    const rect = wrapper.getBoundingClientRect();

    const corners = [
        { x: rect.left, y: rect.top },
        { x: rect.right, y: rect.top },
        { x: rect.right, y: rect.bottom },
        { x: rect.left, y: rect.bottom }
    ];

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const theta = -window.cadCurrentRotation * Math.PI / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const proj = window.cadMap.getProjection();
    if (!proj) return null;
    const scale = Math.pow(2, window.getCadZoom());
    const centerPt = proj.fromLatLngToPoint(window.cadMap.getCenter());

    // 🌟 追加：ドラッグ中の見かけ上のズレを計算の中心に反映させる
    if (window.cadDragRawDx || window.cadDragRawDy) {
        const dragDx = window.cadDragRawDx || 0;
        const dragDy = window.cadDragRawDy || 0;
        const finalDx = dragDx * cosT - dragDy * sinT;
        const finalDy = dragDx * sinT + dragDy * cosT;
        centerPt.x -= finalDx / scale;
        centerPt.y -= finalDy / scale;
    }

    const pts = corners.map(corner => {
        const dx = corner.x - cx;
        const dy = corner.y - cy;
        const mapDx = dx * cosT - dy * sinT;
        const mapDy = dx * sinT + dy * cosT;
        const latLng = proj.fromPointToLatLng(new google.maps.Point(centerPt.x + mapDx / scale, centerPt.y + mapDy / scale));
        return [latLng.lng(), latLng.lat()];
    });

    pts.push(pts[0]);
    return turf.polygon([pts]);
};

window.updateCadLabelPositions = () => {
    if (!window.cadUneLabels || window.cadUneLabels.length === 0) return;
    const viewPoly = window.getCadVisibleBoundsPolygon();
    if (!viewPoly) return;

    const viewBbox = turf.bbox(viewPoly);

    window.cadUneLabels.forEach(marker => {
        const poly = marker.associatedPoly;
        if (!poly) return;

        const path = poly.getPath();
        const len = path.getLength();
        if (len === 0) return;

        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        for (let i = 0; i < len; i++) {
            const pt = path.getAt(i);
            const lat = pt.lat();
            const lng = pt.lng();
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        }

        let targetPos = null;
        if (minLng >= viewBbox[0] && maxLng <= viewBbox[2] && minLat >= viewBbox[1] && maxLat <= viewBbox[3]) {
            // Fully inside view bounding box: use quick center
            targetPos = new google.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
        } else {
            // Intersects or outside: calculate using Turf
            try {
                let polyCoords = [];
                for (let i = 0; i < len; i++) {
                    const pt = path.getAt(i);
                    polyCoords.push([pt.lng(), pt.lat()]);
                }
                polyCoords.push(polyCoords[0]);
                const tPoly = turf.polygon([polyCoords]);

                const intersected = turf.intersect(tPoly, viewPoly);
                if (intersected) {
                    const center = turf.center(intersected);
                    targetPos = new google.maps.LatLng(center.geometry.coordinates[1], center.geometry.coordinates[0]);
                }
            } catch (e) {
                // Fallback
            }
        }

        if (targetPos) {
            marker.setPosition(targetPos);
            marker.setVisible(true);
        } else {
            marker.setPosition(new google.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2));
        }
    });
};

// 🌟 新機能：状態を保存していつでも「戻す/進む」できるようにする
window.saveCadStateToHistory = () => {
    if (window.isHistoryNavigating || !window.cadTargetId) return;

    let pins = window.cadPins.map(mk => ({ type: mk.cadPinType, lat: mk.getPosition().lat(), lng: mk.getPosition().lng() }));
    let customShapesData = window.cadCustomShapes.map(poly => ({ coords: window.cadPolyToSavedCoords(poly), group: poly.uneGroup || '', customLabel: poly.customLabel || '' }));
    let unePolygonsData = window.cadUnePolygons.map(poly => ({ coords: window.cadPolyToSavedCoords(poly), group: poly.uneGroup || '', customLabel: poly.customLabel || '' }));

    const state = {
        angle: document.getElementById('cadAngle').value,
        width: document.getElementById('cadWidth').value,
        uneCount: document.getElementById('cadUneCount').value,
        marginSide: document.getElementById('cadMarginSide') ? document.getElementById('cadMarginSide').value : 0,
        marginEnd: document.getElementById('cadMarginEnd') ? document.getElementById('cadMarginEnd').value : 0,
        pins: pins,
        nakamichiLines: JSON.parse(JSON.stringify(window.cadNakamichiLines)),
        drainageLines: JSON.parse(JSON.stringify(window.cadDrainageLines)),
        customShapes: customShapesData,
        unePolygons: unePolygonsData,
        frontBaseline: window.cadFrontBaseline ? JSON.parse(JSON.stringify(window.cadFrontBaseline)) : null,
        ridgeGapRatio: window.cadRidgeGapRatio,
        pinNumFontSize: window.cadPinNumFontSize || 24
    };

    const stateStr = JSON.stringify(state);
    if (window.cadHistoryIndex >= 0 && window.cadHistory[window.cadHistoryIndex] === stateStr) return;

    if (window.cadHistoryIndex < window.cadHistory.length - 1) {
        window.cadHistory = window.cadHistory.slice(0, window.cadHistoryIndex + 1);
    }

    window.cadHistory.push(stateStr);
    window.cadHistoryIndex++;
    window.updateUndoRedoUI();
};

window.updateUndoRedoUI = () => {
    const canUndo = window.cadHistoryIndex > 0;
    const canRedo = window.cadHistoryIndex < (window.cadHistory ? window.cadHistory.length : 0) - 1;
    document.querySelectorAll('.cad-undo-btn').forEach((btn) => { btn.disabled = !canUndo; });
    document.querySelectorAll('.cad-redo-btn').forEach((btn) => { btn.disabled = !canRedo; });
};

window.loadCadStateFromHistory = (index) => {
    if (index < 0 || index >= window.cadHistory.length) return;
    window.isHistoryNavigating = true;

    const state = JSON.parse(window.cadHistory[index]);
    window.cadClearLines(true); // 内部クリア（履歴には残さない）

    document.getElementById('cadAngle').value = state.angle || 0;
    if (typeof window.setCadWidthCm === 'function') {
        window.cadWidthLinkedFromPlan = false;
        window.setCadWidthCm(state.width ? parseFloat(state.width) : null, { updatePreview: false });
    } else {
        document.getElementById('cadWidth').value = state.width || '';
    }
    document.getElementById('cadUneCount').value = state.uneCount || 0;
    if (typeof window.setCadMarginCm === 'function') {
        window.setCadMarginCm('Side', state.marginSide, 150);
        window.setCadMarginCm('End', state.marginEnd, 200);
    } else {
        if (document.getElementById('cadMarginSide')) document.getElementById('cadMarginSide').value = state.marginSide || 0;
        if (document.getElementById('cadMarginEnd')) document.getElementById('cadMarginEnd').value = state.marginEnd || 0;
    }
    if (typeof window.setCadPinNumFontSize === 'function') {
        const pinNum = state.pinNumFontSize || 24;
        window.setCadPinNumFontSize(pinNum === 20 ? 24 : pinNum, { refresh: false });
    } else {
        const pinNum = state.pinNumFontSize || 24;
        window.cadPinNumFontSize = pinNum === 20 ? 24 : pinNum;
    }

    if (state.pins) {
        state.pins.forEach(pin => {
            const mk = new google.maps.Marker({
                position: { lat: pin.lat, lng: pin.lng }, map: window.cadMap, visible: false
            });
            mk.cadPinType = pin.type;
            window.cadPins.push(mk);
        });
    }

    if (state.nakamichiLines) {
        window.cadNakamichiLines = state.nakamichiLines || [];
        window.cadNakamichiLines.forEach(line => window.drawNakamichiVisual(line));
    }
    
    if (state.drainageLines) {
        window.cadDrainageLines = state.drainageLines || [];
        window.cadDrainageLines.forEach(line => window.drawDrainageVisual(line));
    }

    if (window.cadFrontBaselineMarker) { window.cadFrontBaselineMarker.setMap(null); window.cadFrontBaselineMarker = null; }
    if (window.cadFrontBaselineVisual) { window.cadFrontBaselineVisual.setMap(null); window.cadFrontBaselineVisual = null; }
    window.cadFrontBaseline = state.frontBaseline || null;

    if (state.customShapes) {
        state.customShapes.forEach((shape, idx) => {
            let cPath = window.cadNormalizeSavedPaths(shape.coords ? shape.coords : shape);
            let uGroup = shape.group || 'default';
            let gPoly = window.cadCreateRidgePolygon(cPath, { fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A' });
            gPoly.uneIndex = 'custom_' + idx;
            gPoly.uneGroup = uGroup;
            if (shape.customLabel) gPoly.customLabel = shape.customLabel;
            window.bindShapeHistoryEvents(gPoly);
            window.cadCustomShapes.push(gPoly);
        });
    }

    if (state.unePolygons) {
        state.unePolygons.forEach((shape, idx) => {
            let uPath = window.cadNormalizeSavedPaths(shape.coords ? shape.coords : shape);
            let uGroup = shape.group || 'default';
            let gPoly = window.cadCreateRidgePolygon(uPath, { fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A' });
            gPoly.uneIndex = 'une_' + idx;
            gPoly.uneGroup = uGroup;
            if (shape.customLabel) gPoly.customLabel = shape.customLabel;
            window.bindShapeHistoryEvents(gPoly);
            window.cadUnePolygons.push(gPoly);
        });
    }

    window.reassignLabels();
    window.cadAlignMapHeading();
    // 畝・ピン復元後に必ずSVGを再構築（途中更新だと設備ピンが欠ける）
    window.cadSvgNeedsRebuild = true;
    const svgEl = document.getElementById('cadSvgOverlay');
    if (svgEl) {
        svgEl._lastPinsStateId = null;
        svgEl._lastPolysLength = null;
    }
    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay({ light: false });
    window.isHistoryNavigating = false;
};

window.cadUndoAction = () => { if (window.cadHistoryIndex > 0) window.loadCadStateFromHistory(--window.cadHistoryIndex); window.updateUndoRedoUI(); };
window.cadRedoAction = () => { if (window.cadHistoryIndex < window.cadHistory.length - 1) window.loadCadStateFromHistory(++window.cadHistoryIndex); window.updateUndoRedoUI(); };

// 🌟 新機能：ドラッグ時にも数字ラベルが「リアルタイム」でついてくる！
window.updateSingleLabelPosition = (poly) => {
    if (!window.cadUneLabels) return;
    const marker = window.cadUneLabels.find(lbl => lbl.associatedPoly === poly);
    if (marker) {
        const path = poly.getPath();
        const len = path.getLength();
        if (len === 0) return;
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        for (let i = 0; i < len; i++) {
            const pt = path.getAt(i);
            const lat = pt.lat();
            const lng = pt.lng();
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        }
        marker.setPosition(new google.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2));
    }
};

window.bindShapeHistoryEvents = (poly) => {
    google.maps.event.addListener(poly, 'drag', () => { window.updateSingleLabelPosition(poly); if(window.updateCadSvgOverlay) window.updateCadSvgOverlay(); });
    google.maps.event.addListener(poly, 'dragend', () => { window.reassignLabels(); window.saveCadStateToHistory(); if(window.updateCadSvgOverlay) window.updateCadSvgOverlay(); });

    let editTimeout = null;
    ['set_at', 'insert_at', 'remove_at'].forEach(eventName => {
        google.maps.event.addListener(poly.getPath(), eventName, () => {
            // 一括変形中は頂点イベントを無視（100畝調整時のフリーズ防止）
            if (window.cadSuppressPathEvents) return;
            window.updateSingleLabelPosition(poly); // 変形時にもリアルタイム追従
            if(window.updateCadSvgOverlay) window.updateCadSvgOverlay();
            clearTimeout(editTimeout);
            editTimeout = setTimeout(() => {
                window.reassignLabels();
                window.saveCadStateToHistory();
            }, 500); // 履歴保存は少し待つ
        });
    });
};

window.getPageLatLng = (pageX, pageY) => {
    if (typeof window.screenPixelToLatLng !== 'function') return null;
    const clientX = pageX - (window.scrollX || window.pageXOffset || 0);
    const clientY = pageY - (window.scrollY || window.pageYOffset || 0);
    return window.screenPixelToLatLng(clientX, clientY);
};

window.handleMapClick = (pageX, pageY) => {
    if (document.getElementById('cadOverlay').style.display !== 'flex') return;

    const latLng = window.getPageLatLng(pageX, pageY);
    if (!latLng) return;

    if (!window.cadPinMode) return;

    const msgEl = document.getElementById('cadPinModeMsg');

    if (window.cadPinMode === 'makura_edge' || window.cadPinMode === 'makuraune') {
        if (typeof window.cadToggleMakuraEdgeNearLatLng === 'function') window.cadToggleMakuraEdgeNearLatLng(latLng);
        return;
    }

    if (window.cadPinMode === 'front_edge') {
        if (typeof window.cadSetFrontFromLatLng === 'function') window.cadSetFrontFromLatLng(latLng);
        return;
    }

    if (window.cadPinMode === 'partial_start' || window.cadPinMode === 'partial_end') {
        const which = window.cadPinMode === 'partial_end' ? 'end' : 'start';
        window.cadSetPartialPoint(which, latLng);
        window.cadPinMode = null;
        if (msgEl) {
            msgEl.innerText = which === 'end'
                ? '終点を設定しました。畝数と左右を選んで「途中から生成」を押してください。'
                : '起点を設定しました。必要なら終点も置き、左右と畝数を選んで生成してください。';
            msgEl.style.color = '#FFB74D';
        }
        return;
    }

    if (window.cadPinMode === 'quad_corner') {
        window.cadSetQuadCorner(window.cadQuadActiveIndex, latLng);
        return;
    }

    if (window.cadPinMode === 'custom_rect' || window.cadPinMode === 'custom_circle') {
        const shapeType = window.cadPinMode === 'custom_circle' ? 'circle' : 'rect';
        // グリッドON: セル枠を塗る（色塗り操作）
        if (window.cadSnapGridOn) {
            const result = window.cadPaintGridCellAtLatLng(latLng, { type: shapeType });
            if (window.cadGpsWatchId != null && (window.cadGpsPurpose === 'custom_rect' || window.cadGpsPurpose === 'custom_circle')) {
                window.cadStopGpsPinPlace({ silent: true });
            }
            if (result === 'painted' || result === 'erased') {
                // 単発クリック時は即結合（ドラッグ中は mouseup で結合）
                if (!window.cadCellPainting) {
                    window.cadSyncMergedCellRidges_({ type: shapeType });
                }
                if (typeof window.reassignLabels === 'function') window.reassignLabels();
                if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
            } else if (result === 'outside' && !window.cadCellEraseMode) {
                alert('圃場の内側のセルを塗ってください。');
            }
            if (msgEl) {
                if (window.cadCellEraseMode) {
                    msgEl.innerText = '【セル消しゴム】続けてタップ／ドラッグで消去できます';
                    msgEl.style.color = '#EF5350';
                } else {
                    msgEl.innerText = `【セル塗り・${shapeType === 'circle' ? '丸' : '四角'}】隣り合うセルは1畝になります。ドラッグで連続塗り`;
                    msgEl.style.color = '#8BC34A';
                }
            }
            return;
        }
        window.cadExecuteAddCustomShape(latLng, shapeType);
        if (window.cadGpsWatchId != null && (window.cadGpsPurpose === 'custom_rect' || window.cadGpsPurpose === 'custom_circle')) {
            window.cadStopGpsPinPlace({ silent: true });
        }
        window.cadPinMode = null;
        if (msgEl) { msgEl.innerText = '💡 操作を選ぶと、ここに案内が出ます。'; msgEl.style.color = "#FF9800"; }
        return;
    }

    if (window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') return;

    if (window.cadPinMode === 'snap_line') {
        let targetPathCoords = null;
        const p = loadedPolygons[window.cadTargetId];
        if (p && p.coords && p.coords.length > 2) {
            targetPathCoords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
        } else if (window.selectedFudePaths && window.selectedFudePaths.length === 1) {
            targetPathCoords = window.selectedFudePaths[0].map(pt => [pt.lng(), (typeof pt.lat === 'function') ? pt.lat() : pt.lat]);
        } else if (typeof customDrawingPath !== 'undefined' && customDrawingPath && customDrawingPath.length > 2) {
            targetPathCoords = customDrawingPath.map(pt => [pt.lng(), (typeof pt.lat === 'function') ? pt.lat() : pt.lat]);
        }

        if (targetPathCoords) {
            let coords = targetPathCoords.slice();
            if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([...coords[0]]);
            const wrapper = document.getElementById('cadMapWrapper');
            const rect = wrapper ? wrapper.getBoundingClientRect() : null;
            const clickX = rect ? (pageX - (window.scrollX || window.pageXOffset || 0) - rect.left) : null;
            const clickY = rect ? (pageY - (window.scrollY || window.pageYOffset || 0) - rect.top) : null;
            const distToSeg = (px, py, ax, ay, bx, by) => {
                const dx = bx - ax;
                const dy = by - ay;
                const len2 = dx * dx + dy * dy;
                let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
                if (t < 0) t = 0;
                else if (t > 1) t = 1;
                return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
            };

            let minD = Infinity;
            let bestBearing = 0;
            let bestLine = null;
            let bestA = null;
            let bestB = null;
            const pt = turf.point([latLng.lng(), latLng.lat()]);
            for (let i = 0; i < coords.length - 1; i++) {
                const a = coords[i];
                const b = coords[i + 1];
                let d = Infinity;
                if (clickX != null && typeof window.latLngToScreenPixel === 'function') {
                    const s1 = window.latLngToScreenPixel(a[1], a[0]);
                    const s2 = window.latLngToScreenPixel(b[1], b[0]);
                    if (s1 && s2) d = distToSeg(clickX, clickY, s1.x, s1.y, s2.x, s2.y);
                }
                if (!isFinite(d)) {
                    const line = turf.lineString([a, b]);
                    d = turf.pointToLineDistance(pt, line, { units: 'meters' });
                }
                if (d < minD) {
                    minD = d;
                    bestA = a;
                    bestB = b;
                    bestBearing = turf.bearing(turf.point(a), turf.point(b));
                    bestLine = turf.lineString([a, b]);
                }
            }
            if (!(minD < Infinity) || (clickX != null && minD > 48)) {
                if (msgEl) {
                    msgEl.innerText = '外周の線の上をタップしてください。離れていると別の辺（南北の辺など）を拾います。';
                    msgEl.style.color = '#FF9800';
                }
                return;
            }
            
            let angle = bestBearing;
            while (angle < 0) angle += 360;
            while (angle >= 180) angle -= 180; // keep it 0-180 for standard ridge direction
            angle = Math.round(angle * 10) / 10;

            // グリッド位相をこの辺に合わせる（線とセル枠を一致）
            try {
                if (bestLine && typeof turf.nearestPointOnLine === 'function') {
                    const np = turf.nearestPointOnLine(bestLine, pt, { units: 'meters' });
                    window.cadSnapGridAlignPoint = {
                        lng: np.geometry.coordinates[0],
                        lat: np.geometry.coordinates[1]
                    };
                    window.cadSnapGridAlignBearing = bestBearing;
                }
            } catch (e) {}
            
            const angleEl = document.getElementById('cadAngle');
            if (angleEl) angleEl.value = angle;
            if (typeof window.cadAlignMapHeading === 'function') window.cadAlignMapHeading(); // 地図＋グリッド再生成
            if (typeof window.updateCadPreviewCount === 'function') window.updateCadPreviewCount(); // 畝数を自動計算
            if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();

            if (msgEl) {
                msgEl.innerText = window.cadSnapGridOn
                    ? `🎯 この辺に平行（${angle}°）でグリッドも揃えました。このまま畝を生成できます。`
                    : `🎯 この辺に平行（${angle}°）で畝を生成します。`;
                msgEl.style.color = "#4CAF50";
            }

            if (window.cadSplittingEdgeMode) {
                window.cadSplittingEdgeMode = false;
                window.cadPinMode = null;
                const axisEl = document.getElementById('splitTargetAxis');
                if (axisEl) axisEl.value = 'edge_selected';
                const titleEl = document.getElementById('splitModalTitle');
                if (titleEl) titleEl.innerHTML = `✂️ 選んだ辺（角度: ${angle}°）に平行な分割数を指定`;
                const modalEl = document.getElementById('splitCountModal');
                if (modalEl) modalEl.style.display = 'block';
                if (msgEl) { msgEl.innerText = `✂️ 基準辺（角度: ${angle}°）を選択しました。分割数を指定してください。`; msgEl.style.color = "#4CAF50"; }
                return;
            }
            window.cadPinMode = null;
            return;
        }
        window.cadPinMode = null;
        if (msgEl) { msgEl.innerText = `💡 操作を選ぶと、ここに案内が出ます。`; msgEl.style.color = "#FF9800"; }
        return;
    }

    window.cadPlaceEquipmentPin(latLng, window.cadPinMode);
};

/** 設備ピン（吸水・排水・侵入口・駐車場）を座標に設置 */
window.cadPlaceEquipmentPin = (latLng, pinType) => {
    if (!window.cadMap || !latLng || !pinType) return false;
    const msgEl = document.getElementById('cadPinModeMsg');
    const mk = new google.maps.Marker({ position: latLng, map: window.cadMap, visible: false });
    mk.cadPinType = pinType;
    if (!window.cadPins) window.cadPins = [];
    window.cadPins.push(mk);

    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
    window.cadPinMode = null;
    if (typeof window.cadSetGpsBarVisible === 'function') window.cadSetGpsBarVisible(false);
    if (msgEl) {
            msgEl.innerText = `💡 操作を選ぶと、ここに案内が出ます。`;
            msgEl.style.color = '#FF9800';
    }
    window.saveCadStateToHistory();
    return true;
};

window.initCadTouchEvents = () => {
    if (window.cadTouchAdded) return;
    const wrapper = document.getElementById('cadMapWrapper');
    if (!wrapper) return;

    // 🌟 つまみやピンをドラッグしたときに地図全体のドラッグ（独自スクロール）が競合するのを防ぐ
    const checkIgnoreDrag = (target) => {
        if (!target) return false;

        // 1. Google Mapsの地図タイル画像（衛星写真等）、キャンバス、ポリゴン本体(path/svg)は絶対にドラッグ無視しない
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'circle') return true;
        if (tagName === 'canvas' || tagName === 'path' || tagName === 'svg') {
            return false;
        }
        if (tagName === 'img') {
            let src = target.getAttribute('src') || '';
            if (src.includes('googleapis.com') || src.includes('google.com') || src.includes('gstatic.com') || src.includes('khms') || src.includes('kh?')) {
                return false;
            }
        }

        // 2. つまみやピンの親要素や、ドラッグ防止対象の要素かを再帰的にチェック
        let currEl = target;
        let depth = 0;
        // 探索の深さは最大8（foreignObject内のピン階層まで）
        while (currEl && currEl !== wrapper && depth < 8) {
            const currTagName = currEl.tagName.toLowerCase();
            if (['button', 'input', 'select', 'textarea'].includes(currTagName)) {
                return true;
            }
            // 👇👇👇 ここから下のブロックを新しく追加してください 👇👇👇
            // 🌟 修正：ポリゴン変形のつまみ（DIV要素）を触った時は、地図の移動をストップする！
            if (currTagName === 'div' && currEl.style && currEl.style.cursor) {
                const cursor = currEl.style.cursor;
                if (cursor.includes('pointer') || cursor.includes('move') || cursor.includes('crosshair')) {
                    // ラベル類は除外
                    if (!currEl.className || (typeof currEl.className === 'string' && !currEl.className.includes('polygon-label'))) {
                        return true; // 地図ドラッグを無視して、変形操作を優先！
                    }
                }
            }

            if (currTagName === 'img') {
                let src = currEl.getAttribute('src') || '';
                if (src.includes('undo_poly') || src.includes('cb_direction') || src.includes('water_in') || src.includes('water_out') || src.includes('parking_truck') || src.includes('nakamichi')) {
                    return true;
                }
            }
            if (currEl.className && typeof currEl.className === 'string') {
                // gm-style-cc (コピーライト) や gm-control-active (UI) はドラッグ無視で良いが、gmnoprint(文字ラベル)は削る！
                if (currEl.className.includes('gm-style-cc') || currEl.className.includes('gm-control-active')) {
                    return true;
                }
                // 設備ピン本体（SVG foreignObject 内）
                if (currEl.className.includes('cad-equip-pin') || currEl.className.includes('cad-equip-pin-wrap') || currEl.className.includes('cad-pin-del-btn') || currEl.className.includes('cad-pin-icon')) {
                    return true;
                }
            }

            // 設備ピン（💧, 🕳️, 🅿️, 🚜など）はドラッグできるようにする
            if (currEl.innerText && (currEl.innerText.includes('🚰') || currEl.innerText.includes('💧') || currEl.innerText.includes('🚩') || currEl.innerText.includes('🕳️') || currEl.innerText.includes('🅿️') || currEl.innerText.includes('🚜') || currEl.innerText.includes('🛻'))) {
                return true;
            }
            currEl = currEl.parentElement;
            depth++;
        }
        return false;
    };



    let initialPinchDist = null; let initialPinchAngle = null;
    let startScale = BASE_SCALE; let startRotation = 0;
    let lastTouchX = null; let lastTouchY = null;
    let startPageX = null; let startPageY = null;
    let isDragging = false; let pinchMode = null;
    let isMouseDown = false; let ignoreDrag = false;

    let pendingCenter = null;
    let pendingZoom = null;
    let pendingRotationChanged = false;
    let pendingDragChanged = false;
    let rAFActive = false;

    const applyMapUpdates = () => {
        if (!window.cadMap) {
            rAFActive = false;
            return;
        }
        let updated = false;
        let needsTransform = false;

        if (pendingZoom !== null) {
            window.setCadZoom(pendingZoom);
            pendingZoom = null;
            updated = true;
            needsTransform = true;
        }
        if (pendingCenter !== null) {
            window.cadMap.setCenter(pendingCenter);
            pendingCenter = null;
            updated = true;
        }
        if (pendingRotationChanged) {
            pendingRotationChanged = false;
            updated = true;
            needsTransform = true;
        }
        if (pendingDragChanged) {
            pendingDragChanged = false;
            updated = true;
            needsTransform = true;
        }

        if (updated && needsTransform) {
            window.updateCadMapTransform();
        }
        rAFActive = false;
    };

    const scheduleMapUpdate = (center, zoom, rotationChanged = false, dragChanged = false) => {
        if (center !== null) pendingCenter = center;
        if (zoom !== null) pendingZoom = zoom;
        if (rotationChanged) pendingRotationChanged = true;
        if (dragChanged) pendingDragChanged = true;
        if (!rAFActive) {
            rAFActive = true;
            requestAnimationFrame(applyMapUpdates);
        }
    };

    let wheelAccumulator = 0;
    wrapper.addEventListener('wheel', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex') return;
        e.preventDefault();
        e.stopPropagation();
        if (window.cadMap) {
            wheelAccumulator += e.deltaY;
            if (Math.abs(wheelAccumulator) >= 50) {
                let currentZoom = pendingZoom !== null ? pendingZoom : Math.round(window.getCadZoom());
                let delta = wheelAccumulator > 0 ? -1 : 1;
                let nextZoom = currentZoom + delta;
                if (nextZoom < 10) nextZoom = 10;
                if (nextZoom > 45) nextZoom = 45;
                scheduleMapUpdate(null, nextZoom);
                wheelAccumulator = 0;
            }
        }
    }, { capture: true, passive: false });

    const finalizeDragCenter = (dragDx, dragDy) => {
        if (!window.cadMap || !window.cadDragStartCenter) return;
        const proj = window.cadMap.getProjection();
        if (proj) {
            const theta = (window.cadCurrentRotation || 0) * Math.PI / 180;
            const cosT = Math.cos(-theta); const sinT = Math.sin(-theta);
            const finalDx = dragDx * cosT - dragDy * sinT;
            const finalDy = dragDx * sinT + dragDy * cosT;

            const zoom = window.getCadZoom();
            const scale = Math.pow(2, zoom);
            const centerPt = proj.fromLatLngToPoint(window.cadDragStartCenter);
            centerPt.x -= finalDx / scale;
            centerPt.y -= finalDy / scale;

            const newCenter = proj.fromPointToLatLng(centerPt);
            window.cadMap.setCenter(newCenter);
        }
    };

    wrapper.addEventListener('mousedown', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex') return;
        ignoreDrag = checkIgnoreDrag(e.target);
        lastTouchX = e.pageX; lastTouchY = e.pageY; startPageX = e.pageX; startPageY = e.pageY;
        isMouseDown = true; isDragging = false;
        pendingCenter = null;
        pendingZoom = null;

        if (window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') {
            ignoreDrag = true;
            window.cadNakamichiIsDrawing = true;
            window.nakamichiTempPt = window.getPageLatLng(startPageX, startPageY);
            if (window.nakamichiTempLine) { window.nakamichiTempLine.setMap(null); }
            if (window.nakamichiTempPt) {
                window.nakamichiTempLine = new google.maps.Polyline({
                    path: [window.nakamichiTempPt, window.nakamichiTempPt],
                    strokeOpacity: 0, strokeWeight: 0,
                    map: window.cadMap, zIndex: 1, clickable: false
                });
            }
            const msgEl = document.getElementById('cadPinModeMsg');
            if (msgEl) { msgEl.innerText = 'ドラッグして線を引いてください。離すと確定します。'; msgEl.style.color = window.cadPinMode === 'drainage' ? '#00BCD4' : "#E91E63"; }
            return;
        }

        // セル塗りモード: 地図パンせずにドラッグで連続塗り
        if (typeof window.cadIsCellPaintMode === 'function' && window.cadIsCellPaintMode()) {
            ignoreDrag = true;
            window.cadCellPainting = true;
            window.cadCellPaintDirty = false;
            const ll = window.getPageLatLng(startPageX, startPageY);
            if (ll) {
                const shapeType = window.cadPinMode === 'custom_circle' ? 'circle' : 'rect';
                const r = window.cadPaintGridCellAtLatLng(ll, { type: shapeType, silent: true });
                if (r === 'painted' || r === 'erased') window.cadCellPaintDirty = true;
                window.cadUpdateCellHoverSvg(ll);
                if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
            }
            return;
        }

        if (!ignoreDrag) {
            e.stopPropagation();
            window.cadDragStartCenter = window.cadMap ? window.cadMap.getCenter() : null;
            window.cadDragDx = 0;
            window.cadDragDy = 0;
            window.cadDragRawDx = 0;
            window.cadDragRawDy = 0;
        }
    }, { capture: true });

    wrapper.addEventListener('mousemove', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex') return;
        const currentX = e.pageX; const currentY = e.pageY;

        // セルホバー（マウス移動だけで枠をハイライト）
        if (window.cadSnapGridOn && typeof window.cadUpdateCellHoverSvg === 'function') {
            const hoverLl = window.getPageLatLng(currentX, currentY);
            if (hoverLl) window.cadUpdateCellHoverSvg(hoverLl);
        }

        if (window.cadCellPainting && isMouseDown) {
            const ll = window.getPageLatLng(currentX, currentY);
            if (ll) {
                const shapeType = window.cadPinMode === 'custom_circle' ? 'circle' : 'rect';
                const r = window.cadPaintGridCellAtLatLng(ll, { type: shapeType, silent: true });
                if (r === 'painted' || r === 'erased') {
                    window.cadCellPaintDirty = true;
                    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: false });
                }
            }
            return;
        }

        if ((!ignoreDrag && !isMouseDown) || lastTouchX === null || lastTouchY === null) return;

        if ((window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') && window.cadNakamichiIsDrawing && window.nakamichiTempPt) {
            const currentLatLng = window.getPageLatLng(currentX, currentY);
            if (currentLatLng && window.nakamichiTempLine) {
                const preview = (typeof window.cadSplitLinePreviewPath === 'function')
                    ? window.cadSplitLinePreviewPath(window.nakamichiTempPt, currentLatLng)
                    : [window.nakamichiTempPt, currentLatLng];
                window.nakamichiTempLine.setPath(preview);
            }
            if (typeof window.cadPaintNakamichiTempLine === 'function') window.cadPaintNakamichiTempLine();
            return;
        }

        if (ignoreDrag || !isMouseDown) return;

        if (!ignoreDrag) {
            e.stopPropagation();
        }

        if (Math.abs(currentX - startPageX) > 6 || Math.abs(currentY - startPageY) > 6) isDragging = true;

        if (isDragging) {
            let currentZoom = window.getCadZoom();
            let realZoom = window.cadMap ? window.cadMap.getZoom() : 20;
            let apparentScale = Math.pow(2, currentZoom - realZoom);
            if (apparentScale < 0.25) apparentScale = 0.25;

            window.cadDragRawDx = currentX - startPageX;
            window.cadDragRawDy = currentY - startPageY;
            window.cadDragDx = window.cadDragRawDx;
            window.cadDragDy = window.cadDragRawDy;
            window.updateCadMapTransform();
        }
    }, { capture: true });

    wrapper.addEventListener('mouseup', (e) => {
        if (window.cadCellPainting) {
            // mousedown/mousemove で塗済み。クリック経路との二重実行を避ける
            window.cadFinishCellPaintStroke_();
            ignoreDrag = false;
            isMouseDown = false;
            isDragging = false;
            startPageX = null;
            startPageY = null;
            lastTouchX = null;
            lastTouchY = null;
            return;
        }
        if ((window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') && window.cadNakamichiIsDrawing) {
            window.cadNakamichiIsDrawing = false;
            let distPx = Math.hypot(e.pageX - startPageX, e.pageY - startPageY);
            if (window.nakamichiTempPt && distPx > 10) {
                const endLatLng = window.getPageLatLng(e.pageX, e.pageY);
                if (endLatLng && window.nakamichiTempLine) {
                    let path = (window.cadPinMode === 'nakamichi' && typeof window.cadSplitLinePreviewPath === 'function')
                        ? window.cadSplitLinePreviewPath(window.nakamichiTempPt, endLatLng)
                        : [{ lat: window.nakamichiTempPt.lat(), lng: window.nakamichiTempPt.lng() }, { lat: endLatLng.lat(), lng: endLatLng.lng() }];
                    if (window.cadPinMode === 'drainage') {
                        window.cadDrainageLines.push(path);
                        window.drawDrainageVisual(path);
                        window.cadPinMode = null;
                        if (typeof window.cadUpdateSplitLineBtn === 'function') window.cadUpdateSplitLineBtn();
                        if (window.cadUnePolygons.length > 0) window.cadGenerateLines();
                        else window.saveCadStateToHistory();
                    } else if (typeof window.cadCommitSplitLine === 'function') {
                        window.cadCommitSplitLine(path);
                    }
                }
            }
            if (window.nakamichiTempLine) { window.nakamichiTempLine.setMap(null); window.nakamichiTempLine = null; }
            window.nakamichiTempPt = null;
            ignoreDrag = false;
            isMouseDown = false;
            return;
        }

        if (document.getElementById('cadOverlay').style.display === 'flex' && !isDragging && isMouseDown && startPageX !== null && startPageY !== null && !ignoreDrag) {
            window.handleMapClick(e.pageX, e.pageY);
        }
        if (isDragging && !ignoreDrag) {
            e.stopPropagation();
            if (window.cadDragStartCenter) {
                const finalDx = (e.pageX - startPageX);
                const finalDy = (e.pageY - startPageY);
                finalizeDragCenter(finalDx, finalDy);

                // 🌟 バグ修正：指を離した瞬間に即座にCSSの移動をリセットし、二重移動（ワープ）を防ぐ
                window.cadDragDx = 0;
                window.cadDragDy = 0;
                window.cadDragRawDx = 0;
                window.cadDragRawDy = 0;
                window.updateCadMapTransform();
            }
        } else {
            window.cadDragDx = 0;
            window.cadDragDy = 0;
            window.cadDragRawDx = 0;
            window.cadDragRawDy = 0;
            window.updateCadMapTransform();
        }
        window.cadDragStartCenter = null;
        isMouseDown = false; lastTouchX = null; lastTouchY = null; setTimeout(() => { isDragging = false; ignoreDrag = false; }, 100);
    }, { capture: true });

    wrapper.addEventListener('mouseleave', () => {
        if (isDragging && !ignoreDrag && window.cadDragStartCenter) {
            finalizeDragCenter((window.cadDragRawDx || 0), (window.cadDragRawDy || 0));

            window.cadDragDx = 0;
            window.cadDragDy = 0;
            window.cadDragRawDx = 0;
            window.cadDragRawDy = 0;
            window.updateCadMapTransform();
        } else {
            window.cadDragDx = 0;
            window.cadDragDy = 0;
            window.cadDragRawDx = 0;
            window.cadDragRawDy = 0;
            window.updateCadMapTransform();
        }
        window.cadDragStartCenter = null;
        isMouseDown = false; lastTouchX = null; lastTouchY = null; setTimeout(() => { isDragging = false; ignoreDrag = false; }, 100);
    });

    wrapper.addEventListener('touchstart', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex') return;
        ignoreDrag = checkIgnoreDrag(e.target);

        if (e.touches.length === 2) {
            if (e.cancelable) {
                e.preventDefault();
            }
            e.stopPropagation();
            const dx = e.touches[0].pageX - e.touches[1].pageX; const dy = e.touches[0].pageY - e.touches[1].pageY;
            initialPinchDist = Math.hypot(dx, dy); initialPinchAngle = Math.atan2(dy, dx);
            startScale = window.getCadZoom(); startRotation = window.cadCurrentRotation || 0;
            pinchMode = null;
            isDragging = false;
            window.cadDragDx = 0;
            window.cadDragDy = 0;
            window.cadDragRawDx = 0;
            window.cadDragRawDy = 0;
            window.cadDragStartCenter = null;
        } else if (e.touches.length === 1) {
            lastTouchX = e.touches[0].pageX; lastTouchY = e.touches[0].pageY;
            startPageX = e.touches[0].pageX; startPageY = e.touches[0].pageY;
            isDragging = false;
            
            if (window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') {
                ignoreDrag = true;
                window.cadNakamichiIsDrawing = true;
                window.nakamichiTempPt = window.getPageLatLng(startPageX, startPageY);
                if (window.nakamichiTempLine) { window.nakamichiTempLine.setMap(null); }
                if (window.nakamichiTempPt) {
                    window.nakamichiTempLine = new google.maps.Polyline({
                        path: [window.nakamichiTempPt, window.nakamichiTempPt],
                        strokeOpacity: 0, strokeWeight: 0,
                        map: window.cadMap, zIndex: 1, clickable: false
                    });
                }
                const msgEl = document.getElementById('cadPinModeMsg');
                if (msgEl) { msgEl.innerText = 'ドラッグして線を引いてください。離すと確定します。'; msgEl.style.color = window.cadPinMode === 'drainage' ? '#00BCD4' : "#E91E63"; }
            } else if (typeof window.cadIsCellPaintMode === 'function' && window.cadIsCellPaintMode()) {
                ignoreDrag = true;
                window.cadCellPainting = true;
                window.cadCellPaintDirty = false;
                const ll = window.getPageLatLng(startPageX, startPageY);
                if (ll) {
                    const shapeType = window.cadPinMode === 'custom_circle' ? 'circle' : 'rect';
                    const r = window.cadPaintGridCellAtLatLng(ll, { type: shapeType, silent: true });
                    if (r === 'painted' || r === 'erased') window.cadCellPaintDirty = true;
                    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: false });
                }
            }

            if (!ignoreDrag) {
                if (e.cancelable) {
                    e.preventDefault();
                }
                e.stopPropagation();
                window.cadDragStartCenter = window.cadMap ? window.cadMap.getCenter() : null;
                window.cadDragDx = 0;
                window.cadDragDy = 0;
                window.cadDragRawDx = 0;
                window.cadDragRawDy = 0;
            } else if (window.cadCellPainting && e.cancelable) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
        pendingCenter = null;
        pendingZoom = null;
    }, { capture: true, passive: false });

    wrapper.addEventListener('touchmove', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex') return;

        if (window.cadCellPainting && e.touches.length === 1) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            const currentX = e.touches[0].pageX;
            const currentY = e.touches[0].pageY;
            const ll = window.getPageLatLng(currentX, currentY);
            if (ll) {
                const shapeType = window.cadPinMode === 'custom_circle' ? 'circle' : 'rect';
                const r = window.cadPaintGridCellAtLatLng(ll, { type: shapeType, silent: true });
                if (r === 'painted' || r === 'erased') {
                    window.cadCellPaintDirty = true;
                    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: false });
                }
                window.cadUpdateCellHoverSvg(ll);
            }
            lastTouchX = currentX;
            lastTouchY = currentY;
            return;
        }

        if (e.touches.length === 2 && initialPinchDist !== null) {
            if (e.cancelable) {
                e.preventDefault();
            }
            e.stopPropagation();
            const dx = e.touches[0].pageX - e.touches[1].pageX; const dy = e.touches[0].pageY - e.touches[1].pageY;
            const currentDist = Math.hypot(dx, dy); const currentAngle = Math.atan2(dy, dx);
            let angleDiff = (currentAngle - initialPinchAngle) * (180 / Math.PI);

            if (angleDiff > 180) angleDiff -= 360; if (angleDiff < -180) angleDiff += 360;

            if (!pinchMode) {
                const distRatio = currentDist / initialPinchDist; const angleAbs = Math.abs(angleDiff);
                if (Math.abs(distRatio - 1) > 0.05) pinchMode = 'zoom';
                else if (angleAbs > 4) pinchMode = 'rotate';
            }

            if (pinchMode === 'zoom') {
                let zoomDiff = Math.log2(currentDist / initialPinchDist);
                let nextZoom = startScale + zoomDiff;
                if (nextZoom < 10) nextZoom = 10;
                if (nextZoom > 45) nextZoom = 45;
                scheduleMapUpdate(null, nextZoom);
            } else if (pinchMode === 'rotate') {
                window.cadCurrentRotation = startRotation + angleDiff;
                scheduleMapUpdate(null, null, true);
            }

        } else if (e.touches.length === 1 && lastTouchX !== null && lastTouchY !== null) {
            const currentX = e.touches[0].pageX; const currentY = e.touches[0].pageY;

            if ((window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') && window.cadNakamichiIsDrawing && window.nakamichiTempPt) {
                if (e.cancelable) { e.preventDefault(); }
                e.stopPropagation();
                const currentLatLng = window.getPageLatLng(currentX, currentY);
                if (currentLatLng && window.nakamichiTempLine) {
                    const preview = (typeof window.cadSplitLinePreviewPath === 'function')
                        ? window.cadSplitLinePreviewPath(window.nakamichiTempPt, currentLatLng)
                        : [window.nakamichiTempPt, currentLatLng];
                    window.nakamichiTempLine.setPath(preview);
                }
                if (typeof window.cadPaintNakamichiTempLine === 'function') window.cadPaintNakamichiTempLine();
                lastTouchX = currentX; lastTouchY = currentY;
                return;
            }

            if (ignoreDrag) return;
            if (e.cancelable) {
                e.preventDefault();
            }
            e.stopPropagation();


            if (Math.abs(currentX - startPageX) > 6 || Math.abs(currentY - startPageY) > 6) isDragging = true;

            if (isDragging) {
                let currentZoom = window.getCadZoom();
                let realZoom = window.cadMap ? window.cadMap.getZoom() : 20;
                let apparentScale = Math.pow(2, currentZoom - realZoom);
                if (apparentScale < 0.25) apparentScale = 0.25;

                window.cadDragRawDx = currentX - startPageX;
                window.cadDragRawDy = currentY - startPageY;
                window.cadDragDx = window.cadDragRawDx;
                window.cadDragDy = window.cadDragRawDy;
                window.updateCadMapTransform();
            }
        }
    }, { capture: true, passive: false });

    const handleTouchEndOrCancel = (e) => {
        if (e.touches.length < 2) { initialPinchDist = null; initialPinchAngle = null; pinchMode = null; }
        if (e.touches.length === 0) {
            if (window.cadCellPainting) {
                window.cadFinishCellPaintStroke_();
                ignoreDrag = false;
                isDragging = false;
                startPageX = null; startPageY = null;
                lastTouchX = null; lastTouchY = null;
                return;
            }

            if ((window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') && window.cadNakamichiIsDrawing) {
                window.cadNakamichiIsDrawing = false;
                let endX = lastTouchX || startPageX;
                let endY = lastTouchY || startPageY;
                let distPx = Math.hypot(endX - startPageX, endY - startPageY);
                if (window.nakamichiTempPt && distPx > 10) {
                    const endLatLng = window.getPageLatLng(endX, endY);
                    if (endLatLng && window.nakamichiTempLine) {
                        let path = (window.cadPinMode === 'nakamichi' && typeof window.cadSplitLinePreviewPath === 'function')
                            ? window.cadSplitLinePreviewPath(window.nakamichiTempPt, endLatLng)
                            : [{ lat: window.nakamichiTempPt.lat(), lng: window.nakamichiTempPt.lng() }, { lat: endLatLng.lat(), lng: endLatLng.lng() }];
                        if (window.cadPinMode === 'drainage') {
                            window.cadDrainageLines.push(path);
                            window.drawDrainageVisual(path);
                            window.cadPinMode = null;
                            if (typeof window.cadUpdateSplitLineBtn === 'function') window.cadUpdateSplitLineBtn();
                            if (window.cadUnePolygons.length > 0) window.cadGenerateLines();
                            else window.saveCadStateToHistory();
                        } else if (typeof window.cadCommitSplitLine === 'function') {
                            window.cadCommitSplitLine(path);
                        }
                    }
                }
                if (window.nakamichiTempLine) { window.nakamichiTempLine.setMap(null); window.nakamichiTempLine = null; }
                window.nakamichiTempPt = null;
                ignoreDrag = false;
                isDragging = false;
                startPageX = null; startPageY = null;
                lastTouchX = null; lastTouchY = null;
                return;
            }

            if (!isDragging && startPageX !== null && startPageY !== null && !ignoreDrag) {
                window.handleMapClick(startPageX, startPageY);
            }
            if (isDragging && !ignoreDrag) {
                e.stopPropagation();
                if (window.cadDragStartCenter) {
                    const finalDx = (window.cadDragRawDx || 0);
                    const finalDy = (window.cadDragRawDy || 0);
                    finalizeDragCenter(finalDx, finalDy);

                    // 🌟 バグ修正：指を離した瞬間に即座にCSSの移動をリセットし、二重移動（ワープ）を防ぐ
                    window.cadDragDx = 0;
                    window.cadDragDy = 0;
                    window.cadDragRawDx = 0;
                    window.cadDragRawDy = 0;
                    window.updateCadMapTransform();
                }
            } else {
                window.cadDragDx = 0;
                window.cadDragDy = 0;
                window.cadDragRawDx = 0;
                window.cadDragRawDy = 0;
                window.updateCadMapTransform();
            }
            window.cadDragStartCenter = null;
            lastTouchX = null; lastTouchY = null; setTimeout(() => { isDragging = false; ignoreDrag = false; }, 100);
        }
    };
    wrapper.addEventListener('touchend', handleTouchEndOrCancel, { capture: true });
    wrapper.addEventListener('touchcancel', handleTouchEndOrCancel, { capture: true });
    window.cadTouchAdded = true;
};

window.openCADMode = async (id, opts) => {
    opts = opts || {};
    const blank = !!opts.blank;
    window._cadOpenSeq = (window._cadOpenSeq || 0) + 1;
    const openSeq = window._cadOpenSeq;
    infoWindow.close();
    window.cadTargetId = id;
    const p = loadedPolygons[id];
    const cadLoad = (window.AppLoading && AppLoading.start)
        ? AppLoading.start({ label: 'CADを準備中...', detail: '1/4 地図を初期化しています', current: 0, total: 4, delay: 0 })
        : null;

    document.getElementById('cadTargetName').innerText = blank ? (p.name + " (新規)") : (p.name + " (最新の図面を読込中...)");
    document.getElementById('cadOverlay').style.display = 'flex';
    try {

    window.cadCurrentRotation = 0;
    window.cadCurrentScale = BASE_SCALE;
    window.cadTransformDiv = null;
    window.cadVirtualZoom = null;
    window.updateCadMapTransform();

    window.initCadTouchEvents();

    if (!window.cadMap) {
        window.cadMap = new google.maps.Map(document.getElementById('cadMap'), {
            center: { lat: 33.91, lng: 134.66 }, zoom: 20, maxZoom: 45,
            mapTypeId: 'satellite', tilt: 0, heading: 0,
            mapId: 'DEMO_MAP_ID', gestureHandling: 'none', disableDefaultUI: true, zoomControl: true, isFractionalZoomEnabled: true
        });
        
        // 🌟 修正：衛星写真マップタイプのmaxZoomを上書きし、ネイティブで45までズームできるようにする
        // これにより、CSSのscaleによる引き伸ばし（ギザギザ・ぼやけ化）を防ぎ、ポリゴンの解像度を保つ
        google.maps.event.addListenerOnce(window.cadMap, 'idle', () => {
            const satType = window.cadMap.mapTypes.get('satellite');
            if (satType) satType.maxZoom = 45;
            const hybType = window.cadMap.mapTypes.get('hybrid');
            if (hybType) hybType.maxZoom = 45;
        });

        window.cadMap.addListener('center_changed', () => {
            if (typeof window.updateCadLabelPositionsThrottled === 'function') window.updateCadLabelPositionsThrottled();
        });
        window.cadMap.addListener('zoom_changed', () => {
            let realZoom = window.cadMap.getZoom();
            let timeSinceLastSet = Date.now() - (window.cadLastSetZoomTime || 0);
            if (!window.cadIsSettingZoom && timeSinceLastSet > 300) {
                window.cadVirtualZoom = realZoom;
            }
            window.updateCadMapTransform();
        });
    }

    if (window.cadTargetPolygon) window.cadTargetPolygon.setMap(null);
    const path = p.coords.map(pt => new google.maps.LatLng(pt.lat, pt.lng));

    window.cadTargetPolygon = new google.maps.Polygon({
        paths: path, fillColor: '#D7CCC8', fillOpacity: 0.01, strokeColor: '#8BC34A', strokeOpacity: 0.01, strokeWeight: Math.max(0.5, 3), map: window.cadMap, clickable: false
    });
    window.cadSvgNeedsRebuild = true;

    const b = new google.maps.LatLngBounds();
    path.forEach(pt => b.extend(pt));
    window.cadMap.fitBounds(b);

    window.cadClearLines(true);
    switchCadTab(1);

    // 🌟 1. 畝幅チップをキャッシュから即座に初期化・表示（待機0ms）
    window.cadWidthLinkedFromPlan = false;
    if (typeof window.initCadWidthOptionsFromCache === 'function') {
        window.initCadWidthOptionsFromCache();
    }
    window.setCadWidthCm(null, { updatePreview: false });

    // 🌟 2. 既存の図面データ(uneSimData)があれば、即座に図面を展開して描画！（体感待機0ms）
    let initialRendered = false;
    const savedSource = blank ? null : (opts.data || (p && p.uneSimData) || null);
    if (savedSource) {
        initialRendered = window.renderCadSavedData(savedSource);
    }

    if (!initialRendered) {
        document.getElementById('cadAngle').value = 0;
        if (typeof window.setCadMarginCm === 'function') {
            window.setCadMarginCm('Side', 150, 150);
            window.setCadMarginCm('End', 200, 200);
        } else {
            const marginSideEl = document.getElementById('cadMarginSide');
            const marginEndEl = document.getElementById('cadMarginEnd');
            if (marginSideEl) marginSideEl.value = 150;
            if (marginEndEl) marginEndEl.value = 200;
        }
        const countEl = document.getElementById('cadUneCount');
        if (countEl) countEl.value = 0;
    }

    if (cadLoad) cadLoad.update({ label: '最新データを同期中...', detail: '2/2 履歴と栽培計画を確認しています', current: 1, total: 2 });

    // 🌟 3. 3大通信（履歴・畝幅マスタ最新化・栽培計画の畝間連動）を完全並列実行！
    try {
        const [historyRes, masterRes, planRes] = await Promise.allSettled([
            blank ? Promise.resolve(null) : callGAS('getPolygonDrawingHistory', { id }),
            window.loadCadWidthOptionsFromMaster(),
            callGAS('getCultivationRidgeParamsForField', { fieldId: id })
        ]);
        if (openSeq !== window._cadOpenSeq) return;

        // 新規追加は空のまま。編集時だけ、最新図面履歴があれば差分を反映
        if (!blank && historyRes.status === 'fulfilled' && historyRes.value && historyRes.value.length > 0 && historyRes.value[0].data) {
            const latestData = historyRes.value[0].data;
            if (latestData !== p.uneSimData) {
                p.uneSimData = latestData;
                window.renderCadSavedData(latestData);
            }
        }

        // 栽培計画の畝間があれば基準畝幅に自動連動
        if (planRes.status === 'fulfilled' && planRes.value && planRes.value.rSpace) {
            const planParams = planRes.value;
            window.cadWidthLinkedFromPlan = true;
            window.setCadWidthCm(planParams.rSpace);
            const msgEl = document.getElementById('cadPinModeMsg');
            if (msgEl) {
                const cropBit = planParams.crop
                    ? `（${planParams.crop}${planParams.variety ? ' / ' + planParams.variety : ''}）`
                    : '';
                msgEl.innerText = `📐 栽培計画の畝間 ${planParams.rSpace}cm を基準畝幅に連動しました${cropBit}`;
                msgEl.style.color = '#4CAF50';
            }
        }
    } catch (e) {
        console.error("CAD並列同期エラー:", e);
    }
    if (openSeq !== window._cadOpenSeq) return;
    document.getElementById('cadTargetName').innerText = p.name;

    // 起動直後の状態を履歴0番目として保存
    setTimeout(() => {
        if (openSeq !== window._cadOpenSeq) return;
        window.cadHistory = [];
        window.cadHistoryIndex = -1;
        window.saveCadStateToHistory();
    }, 200);
    } finally {
        if (cadLoad) cadLoad.done();
    }
};

/** 保存図面データをパースしてCAD画面に復元 */
window.renderCadSavedData = (savedDataStr) => {
    if (!savedDataStr) return false;
    try {
        const saved = (typeof savedDataStr === 'string') ? JSON.parse(savedDataStr) : savedDataStr;
        if (!saved || typeof saved !== 'object') return false;

        document.getElementById('cadAngle').value = saved.angle !== undefined ? saved.angle : 0;
        document.getElementById('cadUneCount').value = saved.uneCount !== undefined ? saved.uneCount : 0;

        if (typeof window.setCadMarginCm === 'function') {
            window.setCadMarginCm('Side', saved.marginSide !== undefined ? saved.marginSide : 150, 150);
            window.setCadMarginCm('End', saved.marginEnd !== undefined ? saved.marginEnd : 200, 200);
        } else {
            const marginSideEl = document.getElementById('cadMarginSide');
            const marginEndEl = document.getElementById('cadMarginEnd');
            if (marginSideEl) marginSideEl.value = saved.marginSide !== undefined ? saved.marginSide : 150;
            if (marginEndEl) marginEndEl.value = saved.marginEnd !== undefined ? saved.marginEnd : 200;
        }
        if (typeof window.setCadPinNumFontSize === 'function') {
            const pinNum = saved.pinNumFontSize || 24;
            window.setCadPinNumFontSize(pinNum === 20 ? 24 : pinNum, { refresh: false });
        } else {
            const pinNum = saved.pinNumFontSize || 24;
            window.cadPinNumFontSize = pinNum === 20 ? 24 : pinNum;
        }

        if (window.cadPins && window.cadPins.length) {
            window.cadPins.forEach(pin => { if (pin && pin.setMap) pin.setMap(null); });
        }
        window.cadPins = [];
        if (saved.pins) {
            saved.pins.forEach(pin => {
                const mk = new google.maps.Marker({
                    position: { lat: pin.lat, lng: pin.lng }, map: window.cadMap, visible: false
                });
                mk.cadPinType = pin.type;
                window.cadPins.push(mk);
            });
        }

        window.cadNakamichiLines = saved.nakamichiLines || [];
        window.cadNakamichiLines.forEach(line => window.drawNakamichiVisual(line));

        if (window.cadFrontBaselineMarker) { window.cadFrontBaselineMarker.setMap(null); window.cadFrontBaselineMarker = null; }
        if (saved.frontBaseline) {
            window.cadFrontBaseline = saved.frontBaseline;
            if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
        }

        if (window.cadCustomShapes && window.cadCustomShapes.length) {
            window.cadCustomShapes.forEach(pl => { if (pl && pl.setMap) pl.setMap(null); });
        }
        window.cadCustomShapes = [];
        if (saved.customShapes) {
            saved.customShapes.forEach((item, idx) => {
                let cPath = window.cadNormalizeSavedPaths(Array.isArray(item) ? item : item.coords);
                let uGroup = Array.isArray(item) ? '' : (item.group || '');
                let gPoly = window.cadCreateRidgePolygon(cPath, { fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A' });
                gPoly.uneIndex = 'custom_' + idx;
                gPoly.uneGroup = uGroup;
                window.bindShapeHistoryEvents(gPoly);
                window.cadCustomShapes.push(gPoly);
            });
        }

        if (window.cadUnePolygons && window.cadUnePolygons.length) {
            window.cadUnePolygons.forEach(pl => { if (pl && pl.setMap) pl.setMap(null); });
        }
        window.cadUnePolygons = [];
        if (saved.unePolygons) {
            saved.unePolygons.forEach((item, idx) => {
                let uPath = window.cadNormalizeSavedPaths(Array.isArray(item) ? item : item.coords);
                let uGroup = Array.isArray(item) ? '' : (item.group || '');
                let gPoly = window.cadCreateRidgePolygon(uPath, { fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A' });
                gPoly.uneIndex = 'une_' + idx;
                gPoly.uneGroup = uGroup;
                window.bindShapeHistoryEvents(gPoly);
                window.cadUnePolygons.push(gPoly);
            });
        } else {
            if (window.getCadWidthCm()) cadGenerateLines();
        }
        window.reassignLabels();
        switchCadTab(2);
        return true;
    } catch (e) {
        console.error("renderCadSavedData失敗:", e);
        return false;
    }
};

window.closeCADMode = () => {
    if (typeof window.cadClearMakuraEdgePick === 'function') window.cadClearMakuraEdgePick();
    if (typeof window.cadStopGpsPinPlace === 'function') window.cadStopGpsPinPlace({ silent: true });
    document.getElementById('cadOverlay').style.display = 'none';
    window.cadClearLines(true);
    if (window.cadTargetPolygon) window.cadTargetPolygon.setMap(null);
    window.cadTargetId = null;
};

/** 栽培計画の畝間をCAD基準畝幅へ連動 */
window.applyCultivationPlanWidthToCad = async (fieldId) => {
    try {
        const planParams = await callGAS('getCultivationRidgeParamsForField', { fieldId: fieldId });
        if (!planParams || !planParams.rSpace) {
            window.cadWidthLinkedFromPlan = false;
            window.setCadWidthCm(null);
            return false;
        }
        window.cadWidthLinkedFromPlan = true;
        window.setCadWidthCm(planParams.rSpace);
        const msgEl = document.getElementById('cadPinModeMsg');
        if (msgEl) {
            const cropBit = planParams.crop
                ? `（${planParams.crop}${planParams.variety ? ' / ' + planParams.variety : ''}）`
                : '';
            msgEl.innerText = `📐 栽培計画の畝間 ${planParams.rSpace}cm を基準畝幅に連動しました${cropBit}`;
            msgEl.style.color = '#4CAF50';
        }
        return true;
    } catch (e) {
        console.warn('栽培計画畝間の反映に失敗:', e);
        window.cadWidthLinkedFromPlan = false;
        window.setCadWidthCm(null);
        return false;
    }
};

window.CAD_DEFAULT_RIDGE_WIDTHS_CM = [100, 120, 150, 180, 200];
window.CAD_MARGIN_PRESETS_CM = [50, 100, 150, 200];
window.cadWidthOptions = window.CAD_DEFAULT_RIDGE_WIDTHS_CM.slice();
window.cadWidthLinkedFromPlan = false;

/** 側面/端面余白のプルダウン変更（suffix: 'Side' | 'End'） */
window.cadOnMarginSelectChange = (suffix) => {
    const sel = document.getElementById('cadMargin' + suffix + 'Select');
    const inp = document.getElementById('cadMargin' + suffix);
    if (!sel || !inp) return;
    if (sel.value === 'custom') {
        inp.style.display = 'block';
        try { inp.focus(); } catch (e) {}
    } else {
        inp.style.display = 'none';
        inp.value = sel.value;
    }
    if (typeof window.updateCadPreviewCount === 'function') window.updateCadPreviewCount();
};

/** 余白cmをセットし、プリセット内ならプルダウン／外なら手入力欄を表示 */
window.setCadMarginCm = (suffix, cm, fallback) => {
    const sel = document.getElementById('cadMargin' + suffix + 'Select');
    const inp = document.getElementById('cadMargin' + suffix);
    if (!inp) return;
    const fb = (fallback != null && Number.isFinite(Number(fallback))) ? Number(fallback) : 150;
    const n = parseFloat(cm);
    const val = Number.isFinite(n) ? n : fb;
    inp.value = String(val);
    const presets = window.CAD_MARGIN_PRESETS_CM || [50, 100, 150, 200];
    const matched = presets.find(p => Number(p) === Number(val));
    if (sel) {
        if (matched !== undefined) {
            sel.value = String(matched);
            inp.style.display = 'none';
        } else {
            sel.value = 'custom';
            inp.style.display = 'block';
        }
    }
};

window.getCadWidthCm = () => {
    const el = document.getElementById('cadWidth');
    if (!el || el.value === '' || el.value == null) return null;
    const v = parseFloat(el.value);
    return (!isNaN(v) && v > 0) ? v : null;
};

/** 基準畝幅をセットしボタン選択状態を更新。cm=null で未選択 */
window.setCadWidthCm = (cm, opts) => {
    opts = opts || {};
    const widthEl = document.getElementById('cadWidth');
    if (!widthEl) return;

    if (cm == null || cm === '' || !(parseFloat(cm) > 0)) {
        widthEl.value = '';
        window.refreshCadWidthButtons(null);
    } else {
        const n = Math.round(parseFloat(cm));
        if (!window.cadWidthOptions) window.cadWidthOptions = [];
        if (!window.cadWidthOptions.some(v => Number(v) === n)) {
            window.cadWidthOptions.push(n);
            window.cadWidthOptions.sort((a, b) => a - b);
        }
        widthEl.value = String(n);
        window.refreshCadWidthButtons(n);
    }
    if (opts.updatePreview !== false && typeof window.updateCadPreviewCount === 'function') {
        window.updateCadPreviewCount();
    }
};

window.cadOnWidthSelectChange = () => {
    const sel = document.getElementById('cadWidthSelect');
    const custom = document.getElementById('cadWidthCustom');
    const customWrap = document.getElementById('cadWidthCustomWrap');
    if (!sel) return;
    window.cadWidthLinkedFromPlan = false;
    if (sel.value === 'custom') {
        if (customWrap) customWrap.style.display = 'block';
        if (custom) {
            custom.focus();
        }
        return;
    }
    if (customWrap) customWrap.style.display = 'none';
    window.setCadWidthCm(sel.value || null);
};

window.cadOnWidthCustomInput = () => {
    const custom = document.getElementById('cadWidthCustom');
    if (!custom) return;
    window.cadWidthLinkedFromPlan = false;
    const n = parseFloat(custom.value);
    if (n > 0) {
        window.setCadWidthCm(n, { updatePreview: true });
    } else {
        window.setCadWidthCm(null, { updatePreview: true });
    }
};

window.refreshCadWidthButtons = (selectedCm) => {
    const selected = (selectedCm != null && selectedCm !== '' && parseFloat(selectedCm) > 0)
        ? Math.round(parseFloat(selectedCm))
        : null;
    const options = (window.cadWidthOptions && window.cadWidthOptions.length)
        ? window.cadWidthOptions
        : (window.CAD_DEFAULT_RIDGE_WIDTHS_CM || [100, 120, 150, 180, 200]);

    const container = document.getElementById('cadWidthChips');
    const customWrap = document.getElementById('cadWidthCustomWrap');
    const customInput = document.getElementById('cadWidthCustom');
    const sel = document.getElementById('cadWidthSelect');

    const isPreset = selected != null && options.some(v => v === selected);
    const isCustom = selected != null && !isPreset;

    if (container) {
        container.innerHTML = '';

        options.forEach(cm => {
            const isSelected = (selected === cm);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cad-width-chip' + (isSelected ? ' is-selected' : '');
            btn.textContent = cm + 'cm';
            btn.style.cssText = isSelected
                ? 'background:#4CAF50; color:#fff; border:1px solid #81C784; padding:6px 14px; border-radius:999px; font-size:13px; font-weight:bold; cursor:pointer; box-shadow:0 2px 6px rgba(76,175,80,0.4); min-height:34px;'
                : 'background:#2a2a2a; color:#ddd; border:1px solid #555; padding:6px 14px; border-radius:999px; font-size:13px; font-weight:bold; cursor:pointer; min-height:34px;';
            btn.onclick = () => {
                window.cadWidthLinkedFromPlan = false;
                if (isSelected) {
                    window.setCadWidthCm(null);
                } else {
                    window.setCadWidthCm(cm);
                }
            };
            container.appendChild(btn);
        });

        // 「その他」チップ
        const otherBtn = document.createElement('button');
        otherBtn.type = 'button';
        otherBtn.className = 'cad-width-chip' + (isCustom ? ' is-selected' : '');
        otherBtn.textContent = isCustom ? `その他 (${selected}cm)` : 'その他';
        otherBtn.style.cssText = isCustom
            ? 'background:#4CAF50; color:#fff; border:1px solid #81C784; padding:6px 14px; border-radius:999px; font-size:13px; font-weight:bold; cursor:pointer; box-shadow:0 2px 6px rgba(76,175,80,0.4); min-height:34px;'
            : 'background:#2a2a2a; color:#ddd; border:1px solid #555; padding:6px 14px; border-radius:999px; font-size:13px; font-weight:bold; cursor:pointer; min-height:34px;';
        otherBtn.onclick = () => {
            window.cadWidthLinkedFromPlan = false;
            if (isCustom) {
                window.setCadWidthCm(null);
            } else {
                if (customWrap) customWrap.style.display = 'block';
                if (customInput) {
                    customInput.focus();
                    const val = parseFloat(customInput.value);
                    if (val > 0) window.setCadWidthCm(val);
                }
            }
        };
        container.appendChild(otherBtn);
    }

    if (customWrap) {
        customWrap.style.display = isCustom ? 'block' : 'none';
    }
    if (customInput && isCustom && document.activeElement !== customInput) {
        customInput.value = selected;
    }

    if (sel) {
        if (selected == null) sel.value = '';
        else if (isPreset) sel.value = String(selected);
        else sel.value = 'custom';
    }

    const hint = document.getElementById('cadWidthHint');
    if (hint) {
        if (selected) {
            hint.textContent = window.cadWidthLinkedFromPlan
                ? `📐 栽培計画の畝間と連動中（${selected}cm）`
                : `選択中: ${selected}cm`;
            hint.style.color = window.cadWidthLinkedFromPlan ? '#4CAF50' : '#AED581';
        } else {
            hint.textContent = '未選択（チップをタップして選択）';
            hint.style.color = '#FF9800';
        }
    }
};

/** 栽培マスタのキャッシュから即時に候補を抽出して初期化（待機0ms） */
window.initCadWidthOptionsFromCache = () => {
    const set = new Set(window.CAD_DEFAULT_RIDGE_WIDTHS_CM || [100, 120, 150, 180, 200]);
    try {
        const cached = localStorage.getItem('cpMasterDataCache');
        if (cached) {
            const data = JSON.parse(cached);
            if (data) {
                (data.rSpace || []).forEach(v => {
                    const n = parseFloat(v);
                    if (n > 0) set.add(Math.round(n));
                });
                const presets = data.presets || {};
                Object.keys(presets).forEach(crop => {
                    (presets[crop] || []).forEach(p => {
                        const n = parseFloat(p && p.rSpace);
                        if (n > 0) set.add(Math.round(n));
                    });
                });
            }
        }
    } catch (e) {}
    window.cadWidthOptions = Array.from(set).sort((a, b) => a - b);
    window.refreshCadWidthButtons(window.getCadWidthCm());
};

/** 栽培マスタ／プリセットから畝間候補を読み込み（キャッシュがあれば即表示＋GASで最新更新） */
window.loadCadWidthOptionsFromMaster = async () => {
    // まずキャッシュから即座に初期化
    window.initCadWidthOptionsFromCache();

    if (typeof callGAS !== 'function') return;
    try {
        const data = await callGAS('getCultivationMaster');
        if (data) {
            try { localStorage.setItem('cpMasterDataCache', JSON.stringify(data)); } catch (e) {}
            const set = new Set(window.CAD_DEFAULT_RIDGE_WIDTHS_CM || [100, 120, 150, 180, 200]);
            (data.rSpace || []).forEach(v => {
                const n = parseFloat(v);
                if (n > 0) set.add(Math.round(n));
            });
            const presets = data.presets || {};
            Object.keys(presets).forEach(crop => {
                (presets[crop] || []).forEach(p => {
                    const n = parseFloat(p && p.rSpace);
                    if (n > 0) set.add(Math.round(n));
                });
            });
            const newOpts = Array.from(set).sort((a, b) => a - b);
            const isChanged = newOpts.length !== window.cadWidthOptions.length || newOpts.some((v, i) => v !== window.cadWidthOptions[i]);
            if (isChanged) {
                window.cadWidthOptions = newOpts;
                window.refreshCadWidthButtons(window.getCadWidthCm());
            }
        }
    } catch (e) {
        console.warn('getCultivationMasterの更新取得に失敗:', e);
    }
};

/** 地図上の畝ポリゴン1本の幅(m)を概算（畝の直交方向） */
window.estimateCadUneWidthMeters = (gPoly) => {
    if (!gPoly || !gPoly.getPath) return 0;
    const path = gPoly.getPath().getArray();
    if (!path || path.length < 3) return 0;
    let coords = path.map(pt => [pt.lng(), pt.lat()]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([coords[0][0], coords[0][1]]);
    }
    try {
        const poly = turf.polygon([coords]);
        const center = turf.centroid(poly);
        const angleEl = document.getElementById('cadAngle');
        const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;
        // 通常畝の幅方向 = angle + 90
        const widthBearing = angle + 90;
        let minP = Infinity;
        let maxP = -Infinity;
        coords.forEach(c => {
            const pt = turf.point(c);
            const dist = turf.distance(center, pt, { units: 'meters' });
            const bearing = turf.bearing(center, pt);
            const proj = dist * Math.cos((bearing - widthBearing) * Math.PI / 180);
            if (proj < minP) minP = proj;
            if (proj > maxP) maxP = proj;
        });
        const w = Math.abs(maxP - minP);
        return (w > 0.05 && w < 20) ? w : 0;
    } catch (e) {
        return 0;
    }
};

/** 畝ポリゴンの長さ(m)を概算（長辺方向。CAD角度に沿った投影の長い方） */
window.estimateCadUneLengthMeters = (gPoly) => {
    if (!gPoly || !gPoly.getPath) return 0;
    const path = gPoly.getPath().getArray();
    if (!path || path.length < 3) return 0;
    let coords = path.map(pt => [pt.lng(), pt.lat()]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([coords[0][0], coords[0][1]]);
    }
    try {
        const poly = turf.polygon([coords]);
        const center = turf.centroid(poly);
        const angleEl = document.getElementById('cadAngle');
        const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;
        const spanOnBearing = (bearingDeg) => {
            let minP = Infinity;
            let maxP = -Infinity;
            coords.forEach(c => {
                const pt = turf.point(c);
                const dist = turf.distance(center, pt, { units: 'meters' });
                const bearing = turf.bearing(center, pt);
                const proj = dist * Math.cos((bearing - bearingDeg) * Math.PI / 180);
                if (proj < minP) minP = proj;
                if (proj > maxP) maxP = proj;
            });
            return Math.abs(maxP - minP);
        };
        // 長辺を長さとする（通常畝は angle 方向、回転した自由形状にも対応）
        const along = spanOnBearing(angle);
        const across = spanOnBearing(angle + 90);
        const len = Math.max(along, across);
        return len > 0.1 ? len : 0;
    } catch (e) {
        return 0;
    }
};

window.formatCadUneLengthMeters = (meters) => {
    if (!meters || !(meters > 0)) return '';
    if (meters < 10) return (Math.round(meters * 10) / 10) + 'm';
    return Math.round(meters) + 'm';
};

/** グループ名の表示用（分割1 → 分割1番） */
window.formatCadUneGroupDisplayName = (group) => {
    if (!group) return '';
    const m = String(group).match(/^分割(\d+)$/);
    if (m) return '分割' + m[1] + '番';
    return String(group);
};

/** 畝ラベルの番号行（グループ付き） */
window.getCadUneLabelTitle = (poly, baseIdx) => {
    const g = poly && poly.uneGroup ? String(poly.uneGroup) : '';
    const custom = poly && poly.customLabel != null ? String(poly.customLabel) : '';
    // 空け・端は「1番/2番」「/1番」などを畝名としてそのまま表示
    if ((g === '空け' || g === '端') && custom.indexOf('/') >= 0) {
        return custom;
    }
    let title = String(baseIdx != null ? baseIdx : '');
    if (g && g !== 'default') {
        const displayGroup = typeof window.formatCadUneGroupDisplayName === 'function'
            ? window.formatCadUneGroupDisplayName(g)
            : g;
        title += ' (' + displayGroup + ')';
    }
    return title;
};

/** SVGテキストノードに畝番号＋長さ(m)を2行でセット */
window.applyCadUneSvgLabelText = (textNode, poly, baseIdx) => {
    if (!textNode) return;
    const title = window.getCadUneLabelTitle(poly, baseIdx);
    const lenStr = window.formatCadUneLengthMeters(window.estimateCadUneLengthMeters(poly));
    const x = textNode.getAttribute('x') || '0';
    while (textNode.firstChild) textNode.removeChild(textNode.firstChild);
    const t1 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    t1.setAttribute('x', x);
    t1.setAttribute('dy', lenStr ? '-0.55em' : '0');
    t1.textContent = title;
    textNode.appendChild(t1);
    if (lenStr) {
        const t2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        t2.setAttribute('x', x);
        t2.setAttribute('dy', '1.15em');
        t2.setAttribute('font-size', '18');
        t2.textContent = lenStr;
        textNode.appendChild(t2);
    }
    textNode.setAttribute('data-has-length', lenStr ? '1' : '0');
};

/**
 * 枕畝などに使う「地図上の畝と同じ幅(m)」を返す。
 * 優先: 描画済み畝の平均幅 → 基準畝幅(cadWidth)
 */
window.getCadReferenceRidgeWidthMeters = () => {
    const uneList = (window.cadUnePolygons || []).filter(p => p && p.getPath);
    const widths = uneList.map(p => window.estimateCadUneWidthMeters(p)).filter(w => w > 0);
    if (widths.length) {
        return widths.reduce((a, b) => a + b, 0) / widths.length;
    }
    const cm = typeof window.getCadWidthCm === 'function' ? window.getCadWidthCm() : null;
    if (cm) return cm / 100;
    return 1.5;
};

window.switchCadTab = (tab) => {
    const colors = { 1: '#FF9800', 2: '#2196F3', 3: '#0277BD', 4: '#7B1FA2', 5: '#4CAF50' };
    [1, 2, 3, 4, 5].forEach((n) => {
        const mode = document.getElementById('cadMode' + n);
        if (mode) mode.style.display = tab === n ? 'block' : 'none';
        const el = document.getElementById('cadTab' + n);
        if (!el) return;
        const on = tab === n;
        el.style.background = on ? colors[n] : '#222';
        el.style.color = on ? '#fff' : '#aaa';
    });
    if (tab === 4 && typeof window.cadPreviewRidgeNumberSplit === 'function') {
        window.cadPreviewRidgeNumberSplit();
    }
};

/** 生成畝の配列順をそのまま畝並びとして使う（枕畝は除外） */
window.cadGetMainRidgesForSplit = () => {
    return (window.cadUnePolygons || []).filter((p) => {
        if (!p || !p.getPath) return false;
        const g = String(p.uneGroup || '');
        return g !== '枕';
    });
};

/**
 * 〇畝おき分割のオプションをUIから読む
 * @returns {{ everyN: number, direction: 'normal'|'reverse', endStart: number, endFinish: number }}
 */
window.cadReadRidgeNumberSplitOptions = () => {
    const nEl = document.getElementById('cadSplitEveryN');
    const startEl = document.getElementById('cadSplitEndStart');
    const finishEl = document.getElementById('cadSplitEndFinish');
    const dirEl = document.querySelector('input[name="cadSplitDirection"]:checked');
    return {
        everyN: Math.max(1, parseInt(nEl && nEl.value, 10) || 1),
        direction: (dirEl && dirEl.value === 'reverse') ? 'reverse' : 'normal',
        endStart: Math.max(0, parseInt(startEl && startEl.value, 10) || 0),
        endFinish: Math.max(0, parseInt(finishEl && finishEl.value, 10) || 0)
    };
};

/**
 * 〇畝おき分割の計画を作る
 * - 開始側／終了側の空き畝（端）は植えず対象外
 * - 番号開始向きでどちら側から分割ブロックを付けるか決める
 * - 対象区間を「N畝取り → 1畝空け」で繰り返す
 */
window.cadBuildRidgeNumberSplitPlan = (everyNOrOpts) => {
    const opts = (everyNOrOpts && typeof everyNOrOpts === 'object')
        ? everyNOrOpts
        : Object.assign(window.cadReadRidgeNumberSplitOptions(), {
            everyN: Math.max(1, parseInt(everyNOrOpts, 10) || 1)
        });
    const n = Math.max(1, parseInt(opts.everyN, 10) || 1);
    const reverse = opts.direction === 'reverse';
    let endStart = Math.max(0, parseInt(opts.endStart, 10) || 0);
    let endFinish = Math.max(0, parseInt(opts.endFinish, 10) || 0);

    const ridgesOrig = window.cadGetMainRidgesForSplit();
    const total = ridgesOrig.length;
    const plan = [];
    const groups = [];

    const fail = (message) => ({
        ok: false,
        everyN: n,
        direction: reverse ? 'reverse' : 'normal',
        endStart,
        endFinish,
        total,
        groups: [],
        plan: [],
        message
    });

    if (total < 1) {
        return fail('畝がありません。先に「生成」タブで畝を作成してください。');
    }

    // 向き: reverse のときは配列を反転して「開始側」を決める
    const ordered = reverse ? ridgesOrig.slice().reverse() : ridgesOrig.slice();
    const origNumberOf = (poly) => {
        const idx = ridgesOrig.indexOf(poly);
        return idx >= 0 ? String(idx + 1) : '?';
    };

    if (endStart + endFinish >= total) {
        return fail(`空き畝（開始${endStart}＋終了${endFinish}）が全${total}畝以上です。少なくしてください。`);
    }

    const middleCount = total - endStart - endFinish;
    if (middleCount < 1) {
        return fail('分割できる畝がありません。空き畝の本数を減らしてください。');
    }

    // 開始側の端（空き）
    for (let i = 0; i < endStart; i++) {
        plan.push({
            poly: ordered[i],
            role: 'end',
            group: '端',
            label: '/1番',
            index: ridgesOrig.indexOf(ordered[i]),
            origLabel: origNumberOf(ordered[i])
        });
    }

    const middle = ordered.slice(endStart, total - endFinish);
    let i = 0;
    let groupNum = 1;
    while (i < middle.length) {
        const take = Math.min(n, middle.length - i);
        const groupName = '分割' + groupNum;
        const labels = [];
        for (let k = 0; k < take; k++) {
            const poly = middle[i + k];
            const label = origNumberOf(poly);
            labels.push(label);
            plan.push({
                poly,
                role: 'block',
                group: groupName,
                label,
                index: ridgesOrig.indexOf(poly),
                origLabel: label
            });
        }
        groups.push({ name: groupName, count: take, labels });
        groupNum++;
        i += take;
        if (i < middle.length) {
            const prevNum = groupNum - 1;
            const nextNum = groupNum;
            const gapPoly = middle[i];
            plan.push({
                poly: gapPoly,
                role: 'gap',
                group: '空け',
                label: prevNum + '番/' + nextNum + '番',
                index: ridgesOrig.indexOf(gapPoly),
                origLabel: origNumberOf(gapPoly)
            });
            i += 1;
        }
    }

    // 終了側の端（空き）
    const lastN = groups.length;
    for (let j = total - endFinish; j < total; j++) {
        plan.push({
            poly: ordered[j],
            role: 'end',
            group: '端',
            label: lastN > 0 ? (lastN + '番/') : '端',
            index: ridgesOrig.indexOf(ordered[j]),
            origLabel: origNumberOf(ordered[j])
        });
    }

    const dirLabel = reverse ? '逆向き（最終畝側から）' : '生成順（1番側から）';
    return {
        ok: groups.length > 0,
        everyN: n,
        direction: reverse ? 'reverse' : 'normal',
        endStart,
        endFinish,
        total,
        groups,
        plan,
        message: groups.length
            ? `全${total}畝 → 開始側空き${endStart}・終了側空き${endFinish}を除き、${n}畝おきで ${groups.length} ブロック（${dirLabel}）`
            : '分割ブロックを作れませんでした。空き畝の本数や「何畝おき」を見直してください。'
    };
};

window.cadStepSplitField = (id, delta) => {
    const el = document.getElementById(id);
    if (!el) return;
    const min = parseInt(el.min, 10);
    const cur = parseInt(el.value, 10) || 0;
    const next = Math.max(Number.isFinite(min) ? min : 0, cur + delta);
    el.value = String(next);
    if (typeof window.cadPreviewRidgeNumberSplit === 'function') window.cadPreviewRidgeNumberSplit();
};

window.cadPreviewRidgeNumberSplit = () => {
    const el = document.getElementById('cadSplitPreview');
    document.querySelectorAll('input[name="cadSplitDirection"]').forEach((inp) => {
        const label = inp.closest ? inp.closest('label') : null;
        if (!label) return;
        const on = !!inp.checked;
        label.style.background = on ? '#7B1FA2' : '#333';
        label.style.borderColor = on ? '#CE93D8' : '#666';
        label.style.color = '#fff';
    });
    if (!el) return;
    const built = window.cadBuildRidgeNumberSplitPlan(window.cadReadRidgeNumberSplitOptions());
    if (!built.ok) {
        el.innerHTML = '<div style="color:#ef9a9a;">' + (built.message || '分割できません') + '</div>';
        return;
    }
    const reverseView = built.direction === 'reverse';
    const dirLabel = reverseView ? '1番側が左、番号は右から' : '1番側が左';
    const groupColor = (name) => {
        const m = String(name || '').match(/(\d+)/);
        const n = m ? parseInt(m[1], 10) : 1;
        const palette = ['#6A1B9A', '#7B1FA2', '#8E24AA', '#5E35B1', '#4527A0'];
        return palette[(n - 1) % palette.length];
    };
    const viewPlan = reverseView ? (built.plan || []).slice().reverse() : (built.plan || []);
    const cells = viewPlan.map((item) => {
        let bg = '#6A1B9A';
        let fg = '#fff';
        let mark = '';
        let tip = '畝' + (item.origLabel || '');
        if (item.role === 'end') {
            bg = '#546E7A';
            mark = '空';
            tip += ' 植えない';
        } else if (item.role === 'gap') {
            bg = '#FFE082';
            fg = '#4E342E';
            mark = '間';
            tip += ' 番号のあいだ';
        } else {
            const m = String(item.group || '').match(/(\d+)/);
            mark = m ? m[1] : '';
            bg = groupColor(item.group);
            tip += ' ' + mark + '番のまとまり';
        }
        return '<span title="' + tip + '" style="width:26px; height:32px; border-radius:4px; background:' + bg + '; color:' + fg + '; font-size:11px; font-weight:bold; display:flex; align-items:center; justify-content:center;">' + mark + '</span>';
    }).join('');
    el.innerHTML =
        '<div style="color:#ce93d8; font-weight:bold; margin-bottom:4px;">' + dirLabel + 'です。1マスが畝1本です。</div>' +
        '<div style="display:flex; flex-wrap:wrap; gap:3px; margin-bottom:8px;">' + cells + '</div>' +
        '<div style="display:flex; flex-wrap:wrap; gap:8px; font-size:11px; color:#ddd;">' +
        '<span><b style="color:#546E7A;">空</b> 植えない端</span>' +
        '<span><b style="color:#CE93D8;">1</b> その番号のまとまり</span>' +
        '<span><b style="color:#FFE082;">間</b> 番号のあいだの1本</span>' +
        '</div>';
};

window.cadApplyRidgeNumberSplit = () => {
    const built = window.cadBuildRidgeNumberSplitPlan(window.cadReadRidgeNumberSplitOptions());
    if (!built.ok) {
        if (typeof customAlert === 'function') customAlert(built.message || '分割できません');
        else alert(built.message || '分割できません');
        window.cadPreviewRidgeNumberSplit();
        return;
    }

    built.plan.forEach((item) => {
        const poly = item.poly;
        if (!poly) return;
        poly.uneGroup = item.group || 'default';
        if (item.label) poly.customLabel = String(item.label);
        else delete poly.customLabel;
        try {
            if (typeof poly.setOptions === 'function') {
                poly.setOptions({
                    fillColor: window.cadGetGroupColor
                        ? window.cadGetGroupColor(poly.uneGroup)
                        : '#8BC34A'
                });
            }
        } catch (e) {}
    });

    if (typeof window.reassignLabels === 'function') window.reassignLabels();
    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
    window.cadPreviewRidgeNumberSplit();

    const fmt = window.formatCadUneGroupDisplayName || ((x) => x);
    const msg = `畝番号を分割しました。\n${built.message}\n` +
        built.groups.map((g) => `${fmt(g.name)}: 元畝番号 ${g.labels.join(',')}`).join('\n');
    if (typeof customAlert === 'function') customAlert(msg);
    else alert(msg);
};

window.cadClearRidgeNumberSplit = () => {
    const ridges = window.cadGetMainRidgesForSplit();
    if (!ridges.length) {
        if (typeof customAlert === 'function') customAlert('畝がありません。');
        else alert('畝がありません。');
        return;
    }
    ridges.forEach((poly) => {
        const g = String(poly.uneGroup || '');
        if (g === '端' || g === '空け' || /^分割\d+$/.test(g)) {
            poly.uneGroup = 'default';
            delete poly.customLabel;
            try {
                if (typeof poly.setOptions === 'function') {
                    poly.setOptions({
                        fillColor: window.cadGetGroupColor
                            ? window.cadGetGroupColor('default')
                            : '#8BC34A'
                    });
                }
            } catch (e) {}
        }
    });
    if (typeof window.reassignLabels === 'function') window.reassignLabels();
    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
    window.cadPreviewRidgeNumberSplit();
    if (typeof customAlert === 'function') customAlert('分割番号をクリアし、通常の連番に戻しました。');
    else alert('分割番号をクリアし、通常の連番に戻しました。');
};

/** 畝並びの投影軸（幅方向） */
window.cadGetRidgeOrderBearing = () => {
    const angleEl = document.getElementById('cadAngle');
    const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;
    return angle + 90;
};

window.cadGetRidgeCentroidTurf = (poly) => {
    try {
        const path = poly.getPath().getArray();
        let coords = path.map(pt => [pt.lng(), pt.lat()]);
        if (coords.length < 3) return null;
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push([coords[0][0], coords[0][1]]);
        }
        return turf.centroid(turf.polygon([coords]));
    } catch (e) {
        return null;
    }
};

/** 生成順の畝を投影値付きで返す（空間並び） */
window.cadGetOrderedRidgesWithProj = () => {
    const ridges = window.cadGetMainRidgesForSplit();
    if (!ridges.length) return [];
    const bearing = window.cadGetRidgeOrderBearing();
    const origin = window.cadGetRidgeCentroidTurf(ridges[0]) || turf.point([0, 0]);
    const items = ridges.map((poly, index) => {
        const c = window.cadGetRidgeCentroidTurf(poly);
        let proj = index;
        if (c) {
            const dist = turf.distance(origin, c, { units: 'meters' });
            const b = turf.bearing(origin, c);
            proj = dist * Math.cos((b - bearing) * Math.PI / 180);
        }
        const w = (typeof window.estimateCadUneWidthMeters === 'function')
            ? window.estimateCadUneWidthMeters(poly) : 0;
        return { poly, index, proj, width: w };
    });
    items.sort((a, b) => a.proj - b.proj);
    return items;
};

/**
 * 畝がある塊（空間的に連続）でクラスタ分割
 * 隣り合う畝中心の間隔が「平均幅×閾値」を超えたら空きとみなす
 */
window.cadClusterRidgesByPresence = (gapFactor) => {
    const factor = (gapFactor != null && gapFactor > 1) ? gapFactor : 1.75;
    const items = window.cadGetOrderedRidgesWithProj();
    if (!items.length) return [];
    const widths = items.map(i => i.width).filter(w => w > 0.2);
    const avgW = widths.length
        ? (widths.reduce((a, b) => a + b, 0) / widths.length)
        : ((typeof window.getCadReferenceRidgeWidthMeters === 'function')
            ? window.getCadReferenceRidgeWidthMeters() : 1.5);
    const gapThresh = Math.max(avgW * factor, avgW + 0.4);

    const clusters = [];
    let cur = [items[0]];
    for (let i = 1; i < items.length; i++) {
        const gap = items[i].proj - items[i - 1].proj;
        if (gap > gapThresh) {
            clusters.push(cur);
            cur = [items[i]];
        } else {
            cur.push(items[i]);
        }
    }
    clusters.push(cur);
    return { clusters, avgW, gapThresh, items };
};

window.cadApplyGroupPlanToRidges = (planItems, successMsg) => {
    planItems.forEach((item) => {
        const poly = item.poly;
        if (!poly) return;
        poly.uneGroup = item.group || 'default';
        if (item.label) poly.customLabel = String(item.label);
        else delete poly.customLabel;
        try {
            if (typeof poly.setOptions === 'function') {
                poly.setOptions({
                    fillColor: window.cadGetGroupColor
                        ? window.cadGetGroupColor(poly.uneGroup)
                        : '#8BC34A'
                });
            }
        } catch (e) {}
    });
    if (typeof window.reassignLabels === 'function') window.reassignLabels();
    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
    if (typeof window.cadPreviewRidgeNumberSplit === 'function') window.cadPreviewRidgeNumberSplit();
    if (successMsg) {
        if (typeof customAlert === 'function') customAlert(successMsg);
        else alert(successMsg);
    }
};

/** 畝のある場所（塊）とない場所（隙間）で番号分割 */
window.cadApplyPresenceBasedSplit = () => {
    const built = window.cadClusterRidgesByPresence(1.75);
    if (!built.clusters || !built.clusters.length) {
        if (typeof customAlert === 'function') customAlert('畝がありません。先に畝を生成してください。');
        else alert('畝がありません。先に畝を生成してください。');
        return;
    }
    if (built.clusters.length === 1) {
        // 1塊しかない → その塊を分割1、端はなし
        const plan = built.clusters[0].map((it) => ({
            poly: it.poly,
            group: '分割1',
            label: String(it.index + 1)
        }));
        window.cadApplyGroupPlanToRidges(
            plan,
            `畝は1つの塊です。分割1番（${plan.length}畝）にまとめました。\n（途中生成などで隙間がある場合に複数ブロックへ分かれます）`
        );
        return;
    }

    const plan = [];
    const groupSummaries = [];
    built.clusters.forEach((cluster, ci) => {
        const groupName = '分割' + (ci + 1);
        const labels = [];
        cluster.forEach((it) => {
            labels.push(String(it.index + 1));
            plan.push({
                poly: it.poly,
                group: groupName,
                label: String(it.index + 1)
            });
        });
        groupSummaries.push(`${groupName}: 元畝 ${labels.join(',')}（${cluster.length}畝）`);
    });

    window.cadApplyGroupPlanToRidges(
        plan,
        `畝のある塊で ${built.clusters.length} ブロックに分割しました。\n` +
        `（隙間の目安: 約${built.gapThresh.toFixed(1)}m）\n` +
        groupSummaries.join('\n')
    );
};

window.cadUpdateGpsSplitCutsStatus = () => {
    const el = document.getElementById('cadSplitGpsCutsStatus');
    if (!el) return;
    const cuts = (window.cadGpsSplitCuts || []).slice().sort((a, b) => a - b);
    if (!cuts.length) {
        el.innerText = '分割点: なし';
        return;
    }
    el.innerText = '分割点: 畝' + cuts.map((c) => c + '番の前').join(' / ');
};

/** GPS位置が畝並びのどこにあるか */
window.cadLocateGpsAmongRidges = (lat, lng) => {
    const items = window.cadGetOrderedRidgesWithProj();
    if (!items.length) {
        return { ok: false, message: '畝がありません' };
    }
    const bearing = window.cadGetRidgeOrderBearing();
    const origin = window.cadGetRidgeCentroidTurf(items[0].poly) || turf.point([lng, lat]);
    const gpsPt = turf.point([lng, lat]);
    const dist = turf.distance(origin, gpsPt, { units: 'meters' });
    const b = turf.bearing(origin, gpsPt);
    const gpsProj = dist * Math.cos((b - bearing) * Math.PI / 180);

    // 最も近い畝
    let nearest = items[0];
    let nearestDist = Math.abs(items[0].proj - gpsProj);
    items.forEach((it) => {
        const d = Math.abs(it.proj - gpsProj);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = it;
        }
    });

    // GPSより奥側の最初の畝インデックス（生成順 index）= この前で切る
    let cutBeforeIndex = items[items.length - 1].index + 1; // 末尾より後ろ
    for (let i = 0; i < items.length; i++) {
        if (items[i].proj >= gpsProj) {
            cutBeforeIndex = items[i].index;
            break;
        }
    }
    // 先頭より手前
    if (gpsProj < items[0].proj) cutBeforeIndex = items[0].index;

    const onRidge = nearestDist <= Math.max((nearest.width || 1) * 0.6, 0.6);
    const origNum = nearest.index + 1;
    let message;
    if (onRidge) {
        message = `畝${origNum}番付近（この畝の前で分割可）`;
    } else if (cutBeforeIndex <= items[0].index) {
        message = `先頭より手前（畝${items[0].index + 1}番の前）`;
    } else if (cutBeforeIndex > items[items.length - 1].index) {
        message = `最終畝より奥`;
    } else {
        message = `畝の隙間（畝${cutBeforeIndex}番の前で分割）`;
    }

    return {
        ok: true,
        gpsProj,
        nearestIndex: nearest.index,
        nearestDist,
        onRidge,
        cutBeforeIndex,
        message
    };
};

window.cadStartSplitGps = () => {
    if (!window.cadGetMainRidgesForSplit().length) {
        alert('先に畝を生成してください。');
        return;
    }
    if (typeof switchCadTab === 'function') {
        try { switchCadTab(4); } catch (e) {}
    }
    window.cadStartPurposeGpsWatch('split_cut', '分割位置のGPS測位中… 畝の境目に立って「ここに分割点」');
};

window.cadCancelSplitGps = () => {
    window.cadStopGpsPinPlace({ silent: true });
    window.cadUpdateGpsSplitCutsStatus();
};

window.cadConfirmSplitGpsCut = () => {
    if (!window.cadGpsLastPos) {
        alert('まだ現在地を取得できていません。少し待ってから再度お試しください。');
        return;
    }
    const acc = Math.round(window.cadGpsLastPos.accuracy || 999);
    if (acc > 15) {
        if (!confirm(`現在の精度は ±${acc}m です。\nこのまま分割点にしますか？`)) return;
    }
    const loc = window.cadLocateGpsAmongRidges(window.cadGpsLastPos.lat, window.cadGpsLastPos.lng);
    if (!loc || !loc.ok) {
        alert((loc && loc.message) || '分割位置を特定できませんでした。');
        return;
    }
    if (!Array.isArray(window.cadGpsSplitCuts)) window.cadGpsSplitCuts = [];
    const cut = loc.cutBeforeIndex;
    const ridges = window.cadGetMainRidgesForSplit();
    if (cut <= 0) {
        alert('先頭より手前です。畝と畝の間、または途中の畝付近で取ってください。');
        return;
    }
    if (cut >= ridges.length) {
        alert('最終畝より奥です。畝と畝の間、または途中の畝付近で取ってください。');
        return;
    }
    if (window.cadGpsSplitCuts.indexOf(cut) < 0) {
        window.cadGpsSplitCuts.push(cut);
    }
    window.cadGpsSplitCuts.sort((a, b) => a - b);
    window.cadUpdateGpsSplitCutsStatus();

    // 測位は続行（複数点を連続で取れる）。確定メッセージだけ出す
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = `分割点を追加: 畝${cut + 1}番の前（${loc.message}）`;
        msgEl.style.color = '#CE93D8';
    }
    const sStatus = document.getElementById('cadSplitGpsStatus');
    if (sStatus) {
        sStatus.textContent = `追加済み → ${loc.message}。続けて別の位置でも取れます。終わったら「GPS分割点で番号付け」`;
        sStatus.style.color = '#A5D6A7';
    }
};

window.cadClearGpsSplitCuts = () => {
    window.cadGpsSplitCuts = [];
    window.cadUpdateGpsSplitCutsStatus();
    if (typeof customAlert === 'function') customAlert('GPS分割点をクリアしました。');
    else alert('GPS分割点をクリアしました。');
};

/** GPS分割点で畝番号をブロック分け */
window.cadApplyGpsSplitCuts = () => {
    const ridges = window.cadGetMainRidgesForSplit();
    if (!ridges.length) {
        alert('畝がありません。');
        return;
    }
    const cuts = (window.cadGpsSplitCuts || []).slice().sort((a, b) => a - b)
        .filter((c, i, arr) => c > 0 && c < ridges.length && arr.indexOf(c) === i);
    if (!cuts.length) {
        alert('分割点がありません。先に「GPSで分割位置」→「ここに分割点」で追加してください。\n（または「畝のある塊で分割」を使えます）');
        return;
    }

    // 生成順インデックスでブロック化
    const bounds = [0].concat(cuts).concat([ridges.length]);
    const plan = [];
    const summaries = [];
    let groupNum = 1;
    for (let b = 0; b < bounds.length - 1; b++) {
        const from = bounds[b];
        const to = bounds[b + 1];
        if (to <= from) continue;
        const groupName = '分割' + groupNum;
        const labels = [];
        for (let i = from; i < to; i++) {
            labels.push(String(i + 1));
            plan.push({
                poly: ridges[i],
                group: groupName,
                label: String(i + 1)
            });
        }
        summaries.push(`${groupName}: 元畝 ${labels.join(',')}（${labels.length}畝）`);
        groupNum++;
    }

    window.cadApplyGroupPlanToRidges(
        plan,
        `GPS分割点で ${groupNum - 1} ブロックに番号付けしました。\n` + summaries.join('\n')
    );
};

window.cadAlignMapHeading = () => {
    const angle = parseFloat(document.getElementById('cadAngle').value) || 0;
    window.cadCurrentRotation = -angle;
    window.updateCadMapTransform();
    if (window.cadSnapGridOn && typeof window.cadRebuildSnapGrid === 'function') {
        window.cadRebuildSnapGrid();
    }
};

window.cadRotateMap = (deg) => {
    window.cadCurrentRotation += deg;
    window.updateCadMapTransform();
    if (window.cadSnapGridOn && typeof window.cadRebuildSnapGrid === 'function') {
        window.cadRebuildSnapGrid();
    }
};

window.cadFlipDirection = () => {
    const angleEl = document.getElementById('cadAngle');
    if (!angleEl) return;
    let curAngle = parseFloat(angleEl.value) || 0;
    let newAngle = (curAngle + 180) % 360;
    if (newAngle < 0) newAngle += 360;
    newAngle = Math.round(newAngle * 10) / 10;
    angleEl.value = newAngle;
    if (typeof window.cadAlignMapHeading === 'function') window.cadAlignMapHeading(); // グリッド再生成含む
    if (typeof window.updateCadPreviewCount === 'function') window.updateCadPreviewCount();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = `🔄 圃場の向きを180度反転しました (${newAngle}°)`;
        msgEl.style.color = "#FF9800";
    }
};

window.cadToggleGpsMenu = (groupId) => {
    const el = document.getElementById(groupId);
    if (!el) return;
    const isHidden = el.style.display === 'none' || !el.style.display;
    el.style.display = isHidden ? 'block' : 'none';
};

window.cadGetNearestEdgeAngle = (latLng) => {
    if (!window.cadTargetId || !latLng) return null;
    let targetPathCoords = null;
    const p = loadedPolygons[window.cadTargetId];
    if (p && p.coords && p.coords.length > 2) {
        targetPathCoords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
    } else if (window.selectedFudePaths && window.selectedFudePaths.length === 1) {
        targetPathCoords = window.selectedFudePaths[0].map(pt => [pt.lng(), (typeof pt.lat === 'function') ? pt.lat() : pt.lat]);
    } else if (typeof customDrawingPath !== 'undefined' && customDrawingPath && customDrawingPath.length > 2) {
        targetPathCoords = customDrawingPath.map(pt => [pt.lng(), (typeof pt.lat === 'function') ? pt.lat() : pt.lat]);
    }

    if (!targetPathCoords || targetPathCoords.length < 3) return null;

    let coords = targetPathCoords.slice();
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([...coords[0]]);
    }
    const pt = turf.point([latLng.lng(), latLng.lat()]);

    let minD = Infinity;
    let bestBearing = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        let line = turf.lineString([coords[i], coords[i+1]]);
        let d = turf.pointToLineDistance(pt, line, { units: 'meters' });
        if (d < minD) {
            minD = d;
            bestBearing = turf.bearing(turf.point(coords[i]), turf.point(coords[i+1]));
        }
    }

    let angle = bestBearing;
    while (angle < 0) angle += 360;
    while (angle >= 180) angle -= 180;
    return Math.round(angle * 10) / 10;
};

/** セル配置グリッドの間隔(m)。UIのcm入力 or 基準畝幅 */
window.cadGetSnapGridSizeM = () => {
    const el = document.getElementById('cadSnapGridCm');
    if (el && el.value !== '' && !isNaN(parseFloat(el.value))) {
        const cm = parseFloat(el.value);
        if (cm >= 20 && cm <= 2000) return cm / 100;
    }
    if (window.cadSnapGridSizeM && window.cadSnapGridSizeM > 0) return window.cadSnapGridSizeM;
    const ref = typeof window.getCadReferenceRidgeWidthMeters === 'function'
        ? window.getCadReferenceRidgeWidthMeters() : 1.5;
    return Math.max(0.3, ref || 1.5);
};

window.cadClearSnapGridLines_ = () => {
    if (window.cadGridLines) {
        window.cadGridLines.forEach(l => {
            try { l.setMap(null); } catch (e) {}
        });
    }
    window.cadGridLines = [];
};

/** 方位差 0〜90 */
window.cadBearingDiff90_ = (a, b) => {
    let d = Math.abs(Number(a) - Number(b)) % 180;
    if (d > 90) d = 180 - d;
    return d;
};

/**
 * 選んだ辺（または最長辺）にグリッド位相を合わせた原点を求める。
 * セル角とグリッド線が一致するよう、同一の平面UV系で計算する。
 */
window.cadResolveSnapGridOrigin_ = (centerPt, angle, cell, fieldCoords) => {
    const base = {
        origin: { lng: centerPt.geometry.coordinates[0], lat: centerPt.geometry.coordinates[1] },
        originPt: centerPt,
        angle: angle,
        cell: cell
    };

    let alignLat = null;
    let alignLng = null;
    let alignBearing = window.cadSnapGridAlignBearing;
    if (window.cadSnapGridAlignPoint) {
        alignLat = window.cadSnapGridAlignPoint.lat;
        alignLng = window.cadSnapGridAlignPoint.lng;
    } else if (fieldCoords && fieldCoords.length >= 2) {
        // 現在角度に最も平行な最長辺へ自動位相合わせ
        let bestLen = -1;
        let bestLine = null;
        let bestB = angle;
        for (let i = 0; i < fieldCoords.length - 1; i++) {
            const a = fieldCoords[i];
            const b = fieldCoords[i + 1];
            const len = turf.distance(turf.point(a), turf.point(b), { units: 'meters' });
            if (len < 0.5) continue;
            const br = turf.bearing(turf.point(a), turf.point(b));
            if (window.cadBearingDiff90_(br, angle) > 25) continue;
            if (len > bestLen) {
                bestLen = len;
                bestLine = turf.lineString([a, b]);
                bestB = br;
            }
        }
        if (bestLine) {
            try {
                const np = turf.nearestPointOnLine(bestLine, centerPt, { units: 'meters' });
                alignLng = np.geometry.coordinates[0];
                alignLat = np.geometry.coordinates[1];
                alignBearing = bestB;
            } catch (e) {}
        }
    }

    if (alignLat == null || alignLng == null) {
        return base.origin;
    }

    const uv = window.cadLatLngToUvMeters_(alignLat, alignLng, base);
    // 辺が畝方向(u)に平行 → v を格子に吸着／垂直なら u を吸着
    const parallelToU = window.cadBearingDiff90_(alignBearing != null ? alignBearing : angle, angle) <= 45;
    let phaseU = 0;
    let phaseV = 0;
    if (parallelToU) {
        phaseV = uv.v - Math.round(uv.v / cell) * cell;
    } else {
        phaseU = uv.u - Math.round(uv.u / cell) * cell;
    }
    const shifted = window.cadUvToLatLng_(phaseU, phaseV, base);
    return { lng: shifted.lng, lat: shifted.lat };
};

/** 圃場中心＋畝角度基準の直交グリッドを再生成（SVGに描画） */
window.cadRebuildSnapGrid = () => {
    window.cadClearSnapGridLines_();
    if (!window.cadSnapGridOn || !window.cadTargetId || !window.cadMap || typeof turf === 'undefined') {
        window.cadSvgNeedsRebuild = true;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
        return;
    }
    const p = loadedPolygons[window.cadTargetId];
    if (!p || !p.coords || p.coords.length < 3) return;

    let coords = p.coords.map(pt => [
        typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng),
        typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)
    ]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([coords[0][0], coords[0][1]]);
    }
    const tPoly = turf.polygon([coords]);
    const bbox = turf.bbox(tPoly);
    const angleEl = document.getElementById('cadAngle');
    const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;
    const centerPt = turf.center(tPoly);
    const cell = window.cadGetSnapGridSizeM();

    window.cadSnapGridAngle = angle;
    window.cadSnapGridOrigin = window.cadResolveSnapGridOrigin_(centerPt, angle, cell, coords);

    const frame = {
        origin: window.cadSnapGridOrigin,
        originPt: turf.point([window.cadSnapGridOrigin.lng, window.cadSnapGridOrigin.lat]),
        angle: angle,
        cell: cell
    };

    const diagDist = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], { units: 'meters' }) + cell * 2;
    // 必ずセル間隔で線を引く（stepを広げるとセルとズレる）
    const maxHalfCells = 45;
    let halfCells = Math.ceil(diagDist / 2 / cell) + 1;
    if (halfCells > maxHalfCells) halfCells = maxHalfCells;
    const half = halfCells * cell;

    const makeLine = (p1, p2, major) => {
        const line = new google.maps.Polyline({
            path: [{ lat: p1.lat, lng: p1.lng }, { lat: p2.lat, lng: p2.lng }],
            strokeColor: '#90A4AE',
            strokeOpacity: 0.01,
            strokeWeight: 1,
            map: window.cadMap,
            clickable: false,
            zIndex: 1
        });
        line._cadGridMajor = !!major;
        window.cadGridLines.push(line);
    };

    // ★セル角と同じ UV→緯度経度変換で線を引く（ズレ防止）
    for (let i = -halfCells; i <= halfCells; i++) {
        const v = i * cell;
        const a = window.cadUvToLatLng_(-half, v, frame);
        const b = window.cadUvToLatLng_(half, v, frame);
        makeLine(a, b, i % 5 === 0);
    }
    for (let i = -halfCells; i <= halfCells; i++) {
        const u = i * cell;
        const a = window.cadUvToLatLng_(u, -half, frame);
        const b = window.cadUvToLatLng_(u, half, frame);
        makeLine(a, b, i % 5 === 0);
    }

    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.cadRefreshCellFillsSvg_ === 'function') window.cadRefreshCellFillsSvg_();
};

window.cadUpdateSnapGridUi_ = () => {
    const btn = document.getElementById('cadSnapGridToggleBtn');
    if (btn) {
        if (window.cadSnapGridOn) {
            btn.textContent = 'グリッド ON';
            btn.style.background = '#0277BD';
            btn.style.color = '#fff';
        } else {
            btn.textContent = 'グリッド OFF';
            btn.style.background = '#333';
            btn.style.color = '#ccc';
        }
    }
    const paintBar = document.getElementById('cadCellPaintBar');
    if (paintBar) paintBar.style.display = window.cadSnapGridOn ? 'flex' : 'none';
    const paintBtn = document.getElementById('cadCellPaintBtn');
    const eraseBtn = document.getElementById('cadCellEraseBtn');
    if (paintBtn) {
        const on = window.cadSnapGridOn && !window.cadCellEraseMode;
        paintBtn.style.background = on ? '#558B2F' : '#333';
        paintBtn.style.color = on ? '#fff' : '#ccc';
        paintBtn.style.border = on ? 'none' : '1px solid #666';
    }
    if (eraseBtn) {
        const on = window.cadSnapGridOn && !!window.cadCellEraseMode;
        eraseBtn.style.background = on ? '#C62828' : '#333';
        eraseBtn.style.color = on ? '#fff' : '#ccc';
        eraseBtn.style.border = on ? 'none' : '1px solid #666';
    }
    const hint = document.getElementById('cadSnapGridHint');
    if (hint) {
        const cm = Math.round(window.cadGetSnapGridSizeM() * 100);
        if (!window.cadSnapGridOn) {
            hint.textContent = 'OFF時は自由配置。ONにするとセルを塗るように畝を置けます';
        } else if (window.cadCellEraseMode) {
            hint.textContent = `消しゴム・間隔 ${cm}cm — 塗ったセルを消す（隣り合う塊は再結合）`;
        } else {
            hint.textContent = `セル塗り・間隔 ${cm}cm — 隣り合うセルは1本の畝に結合。「選んだ線に合わせる」で辺に揃います`;
        }
    }
};

/** セル配置グリッドのON/OFF */
window.cadToggleSnapGrid = (forceOn) => {
    if (typeof forceOn === 'boolean') window.cadSnapGridOn = forceOn;
    else window.cadSnapGridOn = !window.cadSnapGridOn;

    if (window.cadSnapGridOn && !window.cadTargetId) {
        window.cadSnapGridOn = false;
        alert('先に圃場を選んでください。');
        window.cadUpdateSnapGridUi_();
        return;
    }

    // 間隔入力が空なら基準畝幅を埋める
    const el = document.getElementById('cadSnapGridCm');
    if (el && (!el.value || isNaN(parseFloat(el.value)))) {
        const refM = typeof window.getCadReferenceRidgeWidthMeters === 'function'
            ? window.getCadReferenceRidgeWidthMeters() : 1.5;
        el.value = String(Math.round((refM || 1.5) * 100));
    }

    if (window.cadSnapGridOn) {
        window.cadRebuildSnapGrid();
        // 塗りモードへ誘導（未選択なら四角塗り）
        if (!window.cadPinMode || (window.cadPinMode !== 'custom_rect' && window.cadPinMode !== 'custom_circle')) {
            window.cadPinMode = 'custom_rect';
            window.cadCellEraseMode = false;
        }
    } else {
        window.cadClearSnapGridLines_();
        window.cadCellEraseMode = false;
        window.cadUpdateCellHoverSvg(null);
        window.cadSvgNeedsRebuild = true;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    }
    window.cadUpdateSnapGridUi_();
};

/** 互換: 旧 cadToggleGrid */
window.cadToggleGrid = () => window.cadToggleSnapGrid();

window.cadOnSnapGridCmChange = () => {
    if (window._cadSnapGridRebuildTimer) clearTimeout(window._cadSnapGridRebuildTimer);
    window.cadUpdateSnapGridUi_();
    window._cadSnapGridRebuildTimer = setTimeout(() => {
        if (window.cadSnapGridOn) window.cadRebuildSnapGrid();
    }, 250);
};

/** 平面メートルUV（グリッド線・セルで共通）。bearing 0=北, 90=東 */
window.cadLatLngToUvMeters_ = (lat, lng, frame) => {
    const oLat = frame.origin.lat;
    const oLng = frame.origin.lng;
    const lat0 = oLat * Math.PI / 180;
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos(lat0);
    const east = (lng - oLng) * mPerDegLng;
    const north = (lat - oLat) * mPerDegLat;
    const rad = (Number(frame.angle) || 0) * Math.PI / 180;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);
    // u: 畝方向(angle), v: 横断(angle+90)
    const u = east * sinA + north * cosA;
    const v = east * cosA - north * sinA;
    return { u, v };
};

window.cadUvToLatLng_ = (u, v, frame) => {
    const oLat = frame.origin.lat;
    const oLng = frame.origin.lng;
    const lat0 = oLat * Math.PI / 180;
    const mPerDegLat = 111320;
    const mPerDegLng = Math.max(1e-9, 111320 * Math.cos(lat0));
    const rad = (Number(frame.angle) || 0) * Math.PI / 180;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);
    const east = u * sinA + v * cosA;
    const north = u * cosA - v * sinA;
    const lat = oLat + north / mPerDegLat;
    const lng = oLng + east / mPerDegLng;
    return {
        lat: lat,
        lng: lng,
        point: (typeof turf !== 'undefined') ? turf.point([lng, lat]) : null
    };
};

/** グリッド基準（原点・角度・セルサイズ・uv）を取得 */
window.cadGetSnapGridFrame_ = (latLng) => {
    if (typeof turf === 'undefined') return null;
    let origin = window.cadSnapGridOrigin;
    if (!origin && window.cadTargetId && loadedPolygons[window.cadTargetId]) {
        const p = loadedPolygons[window.cadTargetId];
        let coords = p.coords.map(pt => [
            typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng),
            typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)
        ]);
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push([coords[0][0], coords[0][1]]);
        }
        try {
            const c = turf.center(turf.polygon([coords]));
            origin = { lng: c.geometry.coordinates[0], lat: c.geometry.coordinates[1] };
        } catch (e) {
            return null;
        }
    }
    if (!origin) return null;
    const angleEl = document.getElementById('cadAngle');
    const angle = (window.cadSnapGridAngle != null)
        ? window.cadSnapGridAngle
        : (angleEl && angleEl.value ? parseFloat(angleEl.value) : 0);
    const cell = window.cadGetSnapGridSizeM();
    const originPt = turf.point([origin.lng, origin.lat]);
    let u = 0, v = 0;
    if (latLng) {
        const lat = typeof latLng.lat === 'function' ? latLng.lat() : parseFloat(latLng.lat);
        const lng = typeof latLng.lng === 'function' ? latLng.lng() : parseFloat(latLng.lng);
        if (isFinite(lat) && isFinite(lng)) {
            const uv = window.cadLatLngToUvMeters_(lat, lng, { origin, angle, cell });
            u = uv.u;
            v = uv.v;
        }
    }
    return { origin, originPt, angle, cell, u, v };
};

/**
 * タップ／GPS位置をグリッド交点へ吸着
 * @returns {google.maps.LatLng}
 */
window.cadSnapLatLngToGrid = (latLng) => {
    if (!window.cadSnapGridOn || !latLng) return latLng;
    const frame = window.cadGetSnapGridFrame_(latLng);
    if (!frame) return latLng;
    const u = Math.round(frame.u / frame.cell) * frame.cell;
    const v = Math.round(frame.v / frame.cell) * frame.cell;
    const p = window.cadUvToLatLng_(u, v, frame);
    return new google.maps.LatLng(p.lat, p.lng);
};

/** 点が属するセル番号（枠インデックス） */
window.cadLatLngToCellIndex = (latLng) => {
    const frame = window.cadGetSnapGridFrame_(latLng);
    if (!frame) return null;
    // 負の座標も正しくセル化
    const iu = Math.floor(frame.u / frame.cell + 1e-12);
    const iv = Math.floor(frame.v / frame.cell + 1e-12);
    return { iu, iv, frame };
};

window.cadCellKey_ = (iu, iv) => String(iu) + ',' + String(iv);

window.cadIsCellPaintMode = () => {
    return !!(window.cadSnapGridOn && (window.cadPinMode === 'custom_rect' || window.cadPinMode === 'custom_circle'));
};

/** セル枠の四隅 [lng,lat]（閉じたリング） */
window.cadGetGridCellRing_ = (iu, iv, frame) => {
    const c = frame.cell;
    const cornersUv = [
        [iu * c, iv * c],
        [(iu + 1) * c, iv * c],
        [(iu + 1) * c, (iv + 1) * c],
        [iu * c, (iv + 1) * c],
        [iu * c, iv * c]
    ];
    return cornersUv.map(([u, v]) => {
        const p = window.cadUvToLatLng_(u, v, frame);
        return [p.lng, p.lat];
    });
};

window.cadUpdateCellHoverSvg = (latLng) => {
    const svg = document.getElementById('cadSvgOverlay');
    if (!svg) return;
    let g = svg.querySelector('#cadSvgCellHover');
    if (!window.cadSnapGridOn || !latLng) {
        if (g) g.innerHTML = '';
        return;
    }
    const idx = window.cadLatLngToCellIndex(latLng);
    if (!idx) {
        if (g) g.innerHTML = '';
        return;
    }
    if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('id', 'cadSvgCellHover');
        g.setAttribute('style', 'pointer-events:none;');
        const gridGroup = svg.querySelector('#cadSvgGrid');
        if (gridGroup && gridGroup.parentNode) {
            gridGroup.parentNode.insertBefore(g, gridGroup.nextSibling);
        } else {
            svg.appendChild(g);
        }
    }
    const ring = window.cadGetGridCellRing_(idx.iu, idx.iv, idx.frame);
    const pts = ring.map(c => {
        const s = window.latLngToScreenPixel(c[1], c[0]);
        return s.x + ',' + s.y;
    }).join(' ');
    const key = window.cadCellKey_(idx.iu, idx.iv);
    const filled = !!(window.cadPaintedCellSet && window.cadPaintedCellSet.has(key));
    const erase = !!window.cadCellEraseMode;
    let fill = erase ? 'rgba(244,67,54,0.28)' : 'rgba(139,195,74,0.35)';
    let stroke = erase ? '#EF5350' : '#AED581';
    if (filled && !erase) {
        fill = 'rgba(255,235,59,0.25)';
        stroke = '#FFEE58';
    }
    g.innerHTML = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-opacity="0.95"></polygon>`;
};

window.cadSetCellEraseMode = (on) => {
    window.cadCellEraseMode = !!on;
    window.cadUpdateSnapGridUi_();
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl && window.cadSnapGridOn) {
        msgEl.innerText = window.cadCellEraseMode
            ? '【セル消しゴム】塗ったセルを消します（塊は自動で再結合）'
            : '【セル塗り】隣り合うセルは1本の畝になります';
        msgEl.style.color = window.cadCellEraseMode ? '#EF5350' : '#8BC34A';
    }
};

window.cadSyncPaintedCellsCompat_ = () => {
    window.cadPaintedCells = {};
    if (!window.cadPaintedCellSet) return;
    window.cadPaintedCellSet.forEach((key) => { window.cadPaintedCells[key] = true; });
};

/** 塗ったセルのプレビュー塗り（ドラッグ中） */
window.cadRefreshCellFillsSvg_ = () => {
    const svg = document.getElementById('cadSvgOverlay');
    if (!svg) return;
    let g = svg.querySelector('#cadSvgCellFills');
    if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('id', 'cadSvgCellFills');
        g.setAttribute('style', 'pointer-events:none;');
        const hover = svg.querySelector('#cadSvgCellHover');
        if (hover && hover.parentNode) hover.parentNode.insertBefore(g, hover);
        else svg.appendChild(g);
    }
    if (!window.cadSnapGridOn || !window.cadPaintedCellSet || !window.cadPaintedCellSet.size) {
        g.innerHTML = '';
        return;
    }
    const frame = window.cadGetSnapGridFrame_(null);
    if (!frame) { g.innerHTML = ''; return; }
    let html = '';
    window.cadPaintedCellSet.forEach((key) => {
        const parts = key.split(',');
        const iu = parseInt(parts[0], 10);
        const iv = parseInt(parts[1], 10);
        if (isNaN(iu) || isNaN(iv)) return;
        const ring = window.cadGetGridCellRing_(iu, iv, frame);
        const pts = ring.map(c => {
            const s = window.latLngToScreenPixel(c[1], c[0]);
            return s.x + ',' + s.y;
        }).join(' ');
        html += `<polygon points="${pts}" fill="rgba(139,195,74,0.45)" stroke="#7CB342" stroke-width="1.2" stroke-opacity="0.9"></polygon>`;
    });
    g.innerHTML = html;
};

/** 隣接セルを連結成分に分割 */
window.cadGetPaintedCellComponents_ = () => {
    const set = window.cadPaintedCellSet || new Set();
    const remaining = new Set(set);
    const comps = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (remaining.size) {
        const start = remaining.values().next().value;
        remaining.delete(start);
        const queue = [start];
        const comp = [start];
        while (queue.length) {
            const cur = queue.pop();
            const parts = cur.split(',');
            const iu = parseInt(parts[0], 10);
            const iv = parseInt(parts[1], 10);
            for (let d = 0; d < dirs.length; d++) {
                const nk = window.cadCellKey_(iu + dirs[d][0], iv + dirs[d][1]);
                if (remaining.has(nk)) {
                    remaining.delete(nk);
                    queue.push(nk);
                    comp.push(nk);
                }
            }
        }
        comps.push(comp);
    }
    return comps;
};

/**
 * 塗ったセル集合から、隣接塊ごとに1畝を生成し直す
 */
window.cadSyncMergedCellRidges_ = (opts) => {
    opts = opts || {};
    if (!window.cadTargetId || typeof turf === 'undefined') return;
    if (!window.cadPaintedCellSet) window.cadPaintedCellSet = new Set();
    window.cadSyncPaintedCellsCompat_();

    // セル塗り由来の畝だけ消す（通常の自由畝は残す）
    const kept = [];
    (window.cadCustomShapes || []).forEach((poly) => {
        if (poly && poly._cadFromCellPaint) {
            try { poly.setMap(null); } catch (e) {}
        } else if (poly) {
            kept.push(poly);
        }
    });
    window.cadCustomShapes = kept;

    const frame = window.cadGetSnapGridFrame_(null);
    if (!frame || !window.cadPaintedCellSet.size) {
        window.cadSvgNeedsRebuild = true;
        if (!opts.silent && typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
        window.cadRefreshCellFillsSvg_();
        return;
    }

    const p = loadedPolygons[window.cadTargetId];
    if (!p || !p.coords || p.coords.length < 3) return;
    let fieldCoords = p.coords.map(pt => [
        typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng),
        typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)
    ]);
    if (fieldCoords[0][0] !== fieldCoords[fieldCoords.length - 1][0]
        || fieldCoords[0][1] !== fieldCoords[fieldCoords.length - 1][1]) {
        fieldCoords.push([fieldCoords[0][0], fieldCoords[0][1]]);
    }
    const tPoly = turf.polygon([fieldCoords]);
    const type = opts.type || ((window.cadPinMode === 'custom_circle') ? 'circle' : 'rect');
    const groupName = type === 'circle' ? '丸' : '四角';
    const comps = window.cadGetPaintedCellComponents_();

    comps.forEach((comp, cIdx) => {
        const cellPolys = [];
        comp.forEach((key) => {
            const parts = key.split(',');
            const iu = parseInt(parts[0], 10);
            const iv = parseInt(parts[1], 10);
            try {
                if (type === 'circle') {
                    const mid = window.cadUvToLatLng_((iu + 0.5) * frame.cell, (iv + 0.5) * frame.cell, frame);
                    const radiusKm = Math.max(frame.cell / 2, 0.15) / 1000;
                    cellPolys.push(turf.circle(turf.point([mid.lng, mid.lat]), radiusKm, { steps: 16, units: 'kilometers' }));
                } else {
                    cellPolys.push(turf.polygon([window.cadGetGridCellRing_(iu, iv, frame)]));
                }
            } catch (e) {}
        });
        if (!cellPolys.length) return;

        let merged = cellPolys[0];
        for (let i = 1; i < cellPolys.length; i++) {
            try {
                const u = turf.union(merged, cellPolys[i]);
                if (u) merged = u;
            } catch (e) {}
        }

        let finalPoly = null;
        try {
            finalPoly = turf.intersect(tPoly, merged);
        } catch (e) {
            finalPoly = merged;
        }
        if (!finalPoly) return;

        let flattened;
        try {
            flattened = turf.flatten(finalPoly);
        } catch (e) {
            flattened = { features: [finalPoly] };
        }

        (flattened.features || []).forEach((feature, fIdx) => {
            if (!feature || !feature.geometry || feature.geometry.type !== 'Polygon') return;
            const coordinates = feature.geometry.coordinates;
            if (!coordinates || !coordinates.length) return;
            const paths = coordinates.map(r => r.map(c => ({ lat: c[1], lng: c[0] })));
            if (!paths[0] || paths[0].length < 3) return;
            const gPoly = window.cadCreateRidgePolygon(paths, {
                fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(groupName) : '#8BC34A'
            });
            gPoly.uneIndex = 'custom_cellmerge_' + cIdx + '_' + Date.now() + '_' + fIdx;
            gPoly.uneGroup = groupName;
            gPoly._cadFromCellPaint = true;
            gPoly._cadCellKeys = comp.slice();
            window.bindShapeHistoryEvents(gPoly);
            window.cadCustomShapes.push(gPoly);
        });
    });

    window.cadSvgNeedsRebuild = true;
    if (!opts.silent && typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    // 結合後は実畝が見えるのでプレビュー塗りは消す（ドラッグ中のみプレビュー）
    if (!window.cadCellPainting) {
        const svg = document.getElementById('cadSvgOverlay');
        const g = svg && svg.querySelector('#cadSvgCellFills');
        if (g) g.innerHTML = '';
    } else {
        window.cadRefreshCellFillsSvg_();
    }
};

/**
 * セルを塗る／消す（隣接セルはストローク終了時に1畝へ結合）
 * @returns {'painted'|'erased'|'exists'|'outside'|'fail'|null}
 */
window.cadPaintGridCell = (iu, iv, opts) => {
    opts = opts || {};
    if (!window.cadTargetId || typeof turf === 'undefined') return null;
    if (!window.cadPaintedCellSet) window.cadPaintedCellSet = new Set();

    const frame = opts.frame || window.cadGetSnapGridFrame_(null);
    if (!frame) return null;
    const key = window.cadCellKey_(iu, iv);
    const erase = opts.erase != null ? !!opts.erase : !!window.cadCellEraseMode;

    // 圃場外セルは塗らない
    try {
        const mid = window.cadUvToLatLng_((iu + 0.5) * frame.cell, (iv + 0.5) * frame.cell, frame);
        const p = loadedPolygons[window.cadTargetId];
        let fieldCoords = p.coords.map(pt => [
            typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng),
            typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)
        ]);
        if (fieldCoords[0][0] !== fieldCoords[fieldCoords.length - 1][0]
            || fieldCoords[0][1] !== fieldCoords[fieldCoords.length - 1][1]) {
            fieldCoords.push([fieldCoords[0][0], fieldCoords[0][1]]);
        }
        if (!turf.booleanPointInPolygon(turf.point([mid.lng, mid.lat]), turf.polygon([fieldCoords]))) {
            return 'outside';
        }
    } catch (e) {}

    if (erase) {
        if (!window.cadPaintedCellSet.has(key)) return null;
        window.cadPaintedCellSet.delete(key);
        window.cadSyncPaintedCellsCompat_();
        window.cadRefreshCellFillsSvg_();
        if (!opts.deferSync && !window.cadCellPainting) {
            window.cadSyncMergedCellRidges_({ silent: !!opts.silent, type: opts.type });
        }
        return 'erased';
    }

    if (window.cadPaintedCellSet.has(key)) return 'exists';
    window.cadPaintedCellSet.add(key);
    window.cadSyncPaintedCellsCompat_();
    window.cadRefreshCellFillsSvg_();
    if (!opts.deferSync && !window.cadCellPainting) {
        window.cadSyncMergedCellRidges_({ silent: !!opts.silent, type: opts.type });
    }
    return 'painted';
};

window.cadPaintGridCellAtLatLng = (latLng, opts) => {
    opts = opts || {};
    const idx = window.cadLatLngToCellIndex(latLng);
    if (!idx) return null;
    // ドラッグ中は結合を遅延（離したときにまとめて1畝化）
    const defer = !!window.cadCellPainting || !!opts.deferSync;
    return window.cadPaintGridCell(idx.iu, idx.iv, Object.assign({}, opts, {
        frame: idx.frame,
        deferSync: defer
    }));
};

window.cadFinishCellPaintStroke_ = () => {
    window.cadCellPainting = false;
    if (!window.cadCellPaintDirty) return;
    window.cadCellPaintDirty = false;
    const type = (window.cadPinMode === 'custom_circle') ? 'circle' : 'rect';
    window.cadSyncMergedCellRidges_({ type: type });
    if (typeof window.reassignLabels === 'function') window.reassignLabels();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
};

window.updateCadPreviewCount = () => {
    if (!window.cadTargetId) return;
    const widthCm = typeof window.getCadWidthCm === 'function'
        ? window.getCadWidthCm()
        : parseFloat(document.getElementById('cadWidth').value);
    const angle = parseFloat(document.getElementById('cadAngle').value) || 0;
    const marginSideEl = document.getElementById('cadMarginSide');
    const sideMarginMeters = marginSideEl && marginSideEl.value ? parseFloat(marginSideEl.value) / 100 : 0;
    
    const p = loadedPolygons[window.cadTargetId];
    if (!widthCm || widthCm <= 0 || !p || !p.coords) return;

    let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
    coords.push(coords[0]);
    const tPoly = turf.polygon([coords]); const centerPt = turf.center(tPoly);

    let maxPosDist = 0, maxNegDist = 0;
    tPoly.geometry.coordinates[0].forEach(coord => {
        const pt = turf.point(coord); const dist = turf.distance(centerPt, pt, { units: 'meters' });
        const bearing = turf.bearing(centerPt, pt); const angleDiff = (bearing - (angle + 90)) * Math.PI / 180;
        const projDist = dist * Math.cos(angleDiff);
        if (projDist > maxPosDist) maxPosDist = projDist;
        if (-projDist > maxNegDist) maxNegDist = -projDist;
    });

    const totalWidth = Math.max(0, maxPosDist + maxNegDist - sideMarginMeters * 2);
    const numLines = Math.floor(totalWidth / (widthCm / 100));

    const countEl = document.getElementById('cadUneCount');
    if (countEl && document.getElementById('cadMode1').style.display !== 'none') { countEl.value = numLines > 0 ? numLines : 1; }
};

// 🌟 新機能：クリアボタンに履歴保存を絡める
window.cadClearLines = (skipHistory = false) => {
    window.cadUnePolygons.forEach(pl => pl.setMap(null)); window.cadUnePolygons = [];
    window.cadPins.forEach(mk => mk.setMap(null)); window.cadPins = [];
    window.cadNakamichiMapPolygons.forEach(pl => pl.setMap(null)); window.cadNakamichiMapPolygons = [];
    window.cadNakamichiLines = [];
    window.cadDrainageMapPolygons.forEach(pl => pl.setMap(null)); window.cadDrainageMapPolygons = [];
    window.cadDrainageLines = [];
    window.cadCustomShapes.forEach(pl => pl.setMap(null)); window.cadCustomShapes = [];
    window.cadPaintedCellSet = new Set();
    window.cadPaintedCells = {};
    if (typeof window.cadClearSnapGridLines_ === 'function') window.cadClearSnapGridLines_();
    else if (window.cadGridLines) { window.cadGridLines.forEach(l => l.setMap(null)); window.cadGridLines = []; }
    if (window.cadSnapGridOn && typeof window.cadRebuildSnapGrid === 'function') {
        window.cadRebuildSnapGrid();
    }
    if (window.cadUneLabels) { window.cadUneLabels.forEach(lbl => lbl.setMap(null)); window.cadUneLabels = []; }
    if (window.nakamichiTempMarker) { window.nakamichiTempMarker.setMap(null); window.nakamichiTempMarker = null; }
    if (window.cadFrontBaselineMarker) { window.cadFrontBaselineMarker.setMap(null); window.cadFrontBaselineMarker = null; }
    if (window.cadFrontBaselineVisual) { window.cadFrontBaselineVisual.setMap(null); window.cadFrontBaselineVisual = null; }
    window.cadFrontBaseline = null;
    if (typeof window.cadClearPartialPoints === 'function') window.cadClearPartialPoints(true);
    if (typeof window.cadClearQuadCorners === 'function') window.cadClearQuadCorners(true);
    const msgEl = document.getElementById('cadPinModeMsg'); if (msgEl) msgEl.innerText = "💡 操作を選ぶと、ここに案内が出ます。";
};

/** 畝だけ消す（ピン・中道・排水・正面バーは残す） */
window.cadClearRidgesOnly = (skipHistory = false) => {
    if (window.cadUnePolygons) {
        window.cadUnePolygons.forEach(pl => pl.setMap(null));
        window.cadUnePolygons = [];
    }
    if (window.cadCustomShapes) {
        window.cadCustomShapes.forEach(pl => pl.setMap(null));
        window.cadCustomShapes = [];
    }
    window.cadPaintedCellSet = new Set();
    window.cadPaintedCells = {};
    // セル配置グリッドは消さない（塗り直し用に残す）
    if (window.cadSnapGridOn) {
        if (typeof window.cadRebuildSnapGrid === 'function') window.cadRebuildSnapGrid();
        if (typeof window.cadRefreshCellFillsSvg_ === 'function') window.cadRefreshCellFillsSvg_();
    } else if (window.cadGridLines) {
        window.cadGridLines.forEach(l => l.setMap(null));
        window.cadGridLines = [];
    }
    if (window.cadUneLabels) {
        window.cadUneLabels.forEach(lbl => lbl.setMap(null));
        window.cadUneLabels = [];
    }
    const countEl = document.getElementById('cadUneCount');
    if (countEl) countEl.value = 0;
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = '畝だけクリアしました（ピン・中道・排水は残っています）';
        msgEl.style.color = '#FF9800';
    }
    if (!skipHistory && typeof window.saveCadStateToHistory === 'function') {
        window.saveCadStateToHistory();
    }
    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
};

window.cadUserClearRidgesOnly = () => {
    const hasUne = (window.cadUnePolygons && window.cadUnePolygons.length > 0)
        || (window.cadCustomShapes && window.cadCustomShapes.length > 0);
    if (!hasUne) {
        alert('消す畝がありません。');
        return;
    }
    if (confirm('畝だけクリアしますか？\n（吸水・排水などのピン、中道・排水ラインは残ります）')) {
        window.cadClearRidgesOnly();
    }
};

window.cadUserClearLines = () => {
    if (confirm("図面をすべてクリアしますか？\n（畝・ピン・中道など全部消えます）")) {
        window.cadClearLines();
        window.saveCadStateToHistory();
        if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
    }
};

window.CAD_GPS_PIN_TYPES = ['water_in', 'water_out', 'machine_entry', 'parking_truck'];
window.cadGpsWatchId = null;
window.cadGpsLastPos = null;
window.cadGpsPreviewMarker = null;
window.cadGpsPreviewCircle = null;
window.cadGpsPinType = null;
/** 'equip' | 'partial_start' | 'partial_end' | 'split_cut' | 'custom_rect' | 'custom_circle' | 'quad_corner' | null */
window.cadGpsPurpose = null;
/** GPS自由畝用: 'rect' | 'circle' */
window.cadCustomShapeGpsType = null;
/** 4点分割畝: 角座標 [{lat,lng}|null x4] */
window.cadQuadCorners = [null, null, null, null];
window.cadQuadMarkers = [null, null, null, null];
window.cadQuadPreviewPoly = null;
window.cadQuadActiveIndex = 0;
/** 'ab' = 畝が辺1→2に平行 / 'ad' = 畝が辺1→4に平行 */
window.cadQuadDir = 'ab';
/** GPS分割点: 生成順の畝配列で「このインデックスの前で切る」 */
window.cadGpsSplitCuts = [];

window.cadSetGpsBarVisible = (visible) => {
    const bar = document.getElementById('cadGpsBar');
    if (bar) bar.style.display = visible ? '' : 'none';
};

window.cadUpdateSplitLineBtn = () => {
    const btn = document.getElementById('cadSplitLineBtn');
    if (!btn) return;
    const on = window.cadPinMode === 'nakamichi';
    btn.textContent = on ? 'キャンセル' : '分割ラインを引く';
    btn.style.background = on ? '#4A148C' : '#9C27B0';
};

window.cadCancelSplitLineMode = () => {
    window.cadPinMode = null;
    window.cadNakamichiIsDrawing = false;
    if (window.nakamichiTempLine) {
        window.nakamichiTempLine.setMap(null);
        window.nakamichiTempLine = null;
    }
    window.nakamichiTempPt = null;
    if (typeof window.cadPaintNakamichiTempLine === 'function') window.cadPaintNakamichiTempLine();
    window.cadUpdateSplitLineBtn();
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = '分割ラインをキャンセルしました。';
        msgEl.style.color = '#FF9800';
    }
};

window.cadSetPinMode = (type) => {
    if (type === 'nakamichi' && window.cadPinMode === 'nakamichi') {
        window.cadCancelSplitLineMode();
        return;
    }
    const isEquipPin = window.CAD_GPS_PIN_TYPES.indexOf(type) >= 0;
    // ライン系モードに切り替えたらGPS測位は止める
    if (type && !isEquipPin && window.cadGpsWatchId != null) {
        window.cadStopGpsPinPlace({ keepStatus: true });
    }
    window.cadPinMode = type;
    window.cadSetGpsBarVisible(isEquipPin);
    const msgEl = document.getElementById('cadPinModeMsg');
    if (type === 'nakamichi') {
        window.nakamichiTempPt = null;
        if (msgEl) { msgEl.innerText = 'ドラッグすると畝に直角か平行へ吸着します。離すと確定します。'; msgEl.style.color = "#E91E63"; }
    } else if (type === 'drainage') {
        window.nakamichiTempPt = null;
        if (msgEl) { msgEl.innerText = `【排水ライン】始点となる場所をタップしてください`; msgEl.style.color = "#00BCD4"; }
    } else if (type === 'snap_line') {
        if (msgEl) { msgEl.innerText = `【角度合わせ】基準にしたい外周の直線をタップしてください`; msgEl.style.color = "#4CAF50"; }
    } else if (isEquipPin) {
        const name = type === 'water_in' ? '🚰 給水ピン' : type === 'water_out' ? '🚩 排水ピン' : type === 'parking_truck' ? '🅿️ 駐車場' : '🚜 機械侵入口';
        if (msgEl) { msgEl.innerText = `【${name}】配置場所をタップ！（または下のGPSで置く）`; msgEl.style.color = "#03A9F4"; }
        window.cadGpsPinType = type;
        window.cadUpdateGpsUi({ status: `選択中: ${name} → 「GPSで置く」か地図タップ` });
    }
    window.cadUpdateSplitLineBtn();
};

window.cadGpsPinTypeLabel = (type) => {
    if (type === 'water_in') return '🚰 給水';
    if (type === 'water_out') return '🚩 排水';
    if (type === 'parking_truck') return '🅿️ 駐車場';
    if (type === 'machine_entry') return '🚜 侵入口';
    return type || '';
};

window.cadUpdateGpsUi = (opts) => {
    opts = opts || {};
    const statusEl = document.getElementById('cadGpsStatus');
    const startBtn = document.getElementById('cadGpsStartBtn');
    const confirmBtn = document.getElementById('cadGpsConfirmBtn');
    const cancelBtn = document.getElementById('cadGpsCancelBtn');
    const active = window.cadGpsWatchId != null;
    const hasFix = !!(window.cadGpsLastPos && window.cadGpsLastPos.lat != null);
    const acc = window.cadGpsLastPos && window.cadGpsLastPos.accuracy != null
        ? Math.round(window.cadGpsLastPos.accuracy)
        : null;
    const good = acc != null && acc <= 15;
    const purpose = window.cadGpsPurpose;

    if (statusEl && opts.status != null && (!purpose || purpose === 'equip')) {
        statusEl.textContent = opts.status;
        statusEl.style.color = opts.statusColor || '#90CAF9';
    }
    if (startBtn) {
        startBtn.disabled = !!active;
        startBtn.style.opacity = active ? '0.6' : '1';
        startBtn.style.cursor = active ? 'not-allowed' : 'pointer';
        startBtn.textContent = active ? '測位中…' : 'GPSで置く';
    }
    if (confirmBtn) {
        confirmBtn.disabled = !(active && hasFix && purpose === 'equip');
        confirmBtn.style.opacity = (active && hasFix && purpose === 'equip') ? '1' : '0.6';
        confirmBtn.style.cursor = (active && hasFix && purpose === 'equip') ? 'pointer' : 'not-allowed';
        confirmBtn.style.background = (active && hasFix && good) ? '#2E7D32' : ((active && hasFix) ? '#F9A825' : '#455A64');
        confirmBtn.style.color = (active && hasFix && !good) ? '#212121' : '#fff';
    }
    if (cancelBtn) {
        cancelBtn.disabled = !(active && purpose === 'equip');
        cancelBtn.style.opacity = (active && purpose === 'equip') ? '1' : '0.6';
        cancelBtn.style.cursor = (active && purpose === 'equip') ? 'pointer' : 'not-allowed';
    }

    // 途中生成用GPSバー
    const pBar = document.getElementById('cadPartialGpsBar');
    const pStatus = document.getElementById('cadPartialGpsStatus');
    const pConfirm = document.getElementById('cadPartialGpsConfirmBtn');
    const partialActive = purpose === 'partial_start' || purpose === 'partial_end';
    if (pBar) pBar.style.display = partialActive && active ? 'block' : 'none';
    if (pStatus && partialActive && opts.status != null) {
        pStatus.textContent = opts.status;
        pStatus.style.color = opts.statusColor || '#90CAF9';
    }
    if (pConfirm) {
        const ok = partialActive && active && hasFix;
        pConfirm.disabled = !ok;
        pConfirm.style.opacity = ok ? '1' : '0.6';
        pConfirm.style.cursor = ok ? 'pointer' : 'not-allowed';
        pConfirm.style.background = (ok && good) ? '#2E7D32' : (ok ? '#F9A825' : '#455A64');
        pConfirm.style.color = (ok && !good) ? '#212121' : '#fff';
    }

    // 畝番号分割用GPSバー
    const sBar = document.getElementById('cadSplitGpsBar');
    const sStatus = document.getElementById('cadSplitGpsStatus');
    const sConfirm = document.getElementById('cadSplitGpsConfirmBtn');
    const splitActive = purpose === 'split_cut';
    if (sBar) sBar.style.display = splitActive && active ? 'block' : 'none';
    if (sStatus && splitActive && opts.status != null) {
        sStatus.textContent = opts.status;
        sStatus.style.color = opts.statusColor || '#E1BEE7';
    }
    if (sConfirm) {
        const ok = splitActive && active && hasFix;
        sConfirm.disabled = !ok;
        sConfirm.style.opacity = ok ? '1' : '0.6';
        sConfirm.style.cursor = ok ? 'pointer' : 'not-allowed';
        sConfirm.style.background = (ok && good) ? '#2E7D32' : (ok ? '#F9A825' : '#455A64');
        sConfirm.style.color = (ok && !good) ? '#212121' : '#fff';
    }

    // 自由畝GPSバー
    const cBar = document.getElementById('cadCustomGpsBar');
    const cStatus = document.getElementById('cadCustomGpsStatus');
    const cConfirm = document.getElementById('cadCustomGpsConfirmBtn');
    const customActive = purpose === 'custom_rect' || purpose === 'custom_circle';
    if (cBar) cBar.style.display = customActive && active ? 'block' : 'none';
    if (cStatus && customActive && opts.status != null) {
        cStatus.textContent = opts.status;
        cStatus.style.color = opts.statusColor || '#90CAF9';
    }
    if (cConfirm) {
        const ok = customActive && active && hasFix;
        cConfirm.disabled = !ok;
        cConfirm.style.opacity = ok ? '1' : '0.6';
        cConfirm.style.cursor = ok ? 'pointer' : 'not-allowed';
        cConfirm.style.background = (ok && good) ? '#2E7D32' : (ok ? '#F9A825' : '#455A64');
        cConfirm.style.color = (ok && !good) ? '#212121' : '#fff';
    }

    // 4点分割GPSバー
    const qBar = document.getElementById('cadQuadGpsBar');
    const qStatus = document.getElementById('cadQuadGpsStatus');
    const qConfirm = document.getElementById('cadQuadGpsConfirmBtn');
    const quadActive = purpose === 'quad_corner';
    if (qBar) qBar.style.display = quadActive && active ? 'block' : 'none';
    if (qStatus && quadActive && opts.status != null) {
        qStatus.textContent = opts.status;
        qStatus.style.color = opts.statusColor || '#90CAF9';
    }
    if (qConfirm) {
        const ok = quadActive && active && hasFix;
        qConfirm.disabled = !ok;
        qConfirm.style.opacity = ok ? '1' : '0.6';
        qConfirm.style.cursor = ok ? 'pointer' : 'not-allowed';
        qConfirm.style.background = (ok && good) ? '#2E7D32' : (ok ? '#F9A825' : '#455A64');
        qConfirm.style.color = (ok && !good) ? '#212121' : '#fff';
    }
};

window.cadUpdateGpsPreview = (lat, lng, accuracy) => {
    if (!window.cadMap) return;
    const pos = { lat: Number(lat), lng: Number(lng) };
    const acc = Math.max(1, Number(accuracy) || 20);
    window.cadGpsLastPos = { lat: pos.lat, lng: pos.lng, accuracy: acc };

    // 地図の setCenter はしない（設備ピンSVGとのずれ防止）。
    // プレビューは設備ピンと同じ SVG 座標系だけを使う。
    window.cadClearGpsMapOverlays();
    window.cadDrawGpsPreviewOnSvg(pos.lat, pos.lng, acc);

    const good = acc <= 15;
    const purpose = window.cadGpsPurpose;
    let label = '現在地';
    if (purpose === 'partial_start') label = '起点';
    else if (purpose === 'partial_end') label = '終点';
    else if (purpose === 'split_cut') label = '分割位置';
    else if (purpose === 'custom_rect') label = '四角畝';
    else if (purpose === 'custom_circle') label = '丸畝';
    else if (purpose === 'quad_corner') label = '角' + ((window.cadQuadActiveIndex || 0) + 1);
    else label = window.cadGpsPinTypeLabel(window.cadGpsPinType || window.cadPinMode);

    let hint = '「ここに置く」で確定';
    if (purpose === 'split_cut') {
        const loc = window.cadLocateGpsAmongRidges(pos.lat, pos.lng);
        if (loc && loc.message) hint = loc.message + ' →「ここに分割点」';
        else hint = '「ここに分割点」で確定';
    }

    window.cadUpdateGpsUi({
        status: `${label}  精度 ±${acc}m${good ? '（良好）' : '（もう少し待つと安定）'} → ${hint}`,
        statusColor: good ? '#A5D6A7' : '#FFE082'
    });
};

/** SVGオーバーレイ上にGPS現在地＋精度円を描画（latLngToScreenPixel と同一系） */
window.cadDrawGpsPreviewOnSvg = (lat, lng, accuracyM) => {
    const svg = document.getElementById('cadSvgOverlay');
    if (!svg || typeof window.latLngToScreenPixel !== 'function') return;

    let g = svg.querySelector('#cadSvgGpsPreview');
    if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('id', 'cadSvgGpsPreview');
        g.setAttribute('style', 'pointer-events:none;');
        svg.appendChild(g);
    }

    const center = window.latLngToScreenPixel(lat, lng);
    let rPx = 24;
    try {
        if (typeof turf !== 'undefined') {
            const south = turf.destination(turf.point([lng, lat]), accuracyM, 180, { units: 'meters' });
            const edge = window.latLngToScreenPixel(south.geometry.coordinates[1], south.geometry.coordinates[0]);
            rPx = Math.max(8, Math.hypot(edge.x - center.x, edge.y - center.y));
        }
    } catch (e) { /* ignore */ }

    g.innerHTML = '';
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(center.x));
    circle.setAttribute('cy', String(center.y));
    circle.setAttribute('r', String(rPx));
    circle.setAttribute('fill', '#2196F3');
    circle.setAttribute('fill-opacity', '0.18');
    circle.setAttribute('stroke', '#1976D2');
    circle.setAttribute('stroke-width', '2');
    g.appendChild(circle);

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(center.x));
    dot.setAttribute('cy', String(center.y));
    dot.setAttribute('r', '7');
    dot.setAttribute('fill', '#2196F3');
    dot.setAttribute('stroke', '#fff');
    dot.setAttribute('stroke-width', '2');
    g.appendChild(dot);
};

window.cadClearGpsMapOverlays = () => {
    if (window.cadGpsPreviewMarker) {
        window.cadGpsPreviewMarker.setMap(null);
        window.cadGpsPreviewMarker = null;
    }
    if (window.cadGpsPreviewCircle) {
        window.cadGpsPreviewCircle.setMap(null);
        window.cadGpsPreviewCircle = null;
    }
};

window.cadClearGpsPreview = () => {
    window.cadClearGpsMapOverlays();
    const svg = document.getElementById('cadSvgOverlay');
    if (svg) {
        const g = svg.querySelector('#cadSvgGpsPreview');
        if (g) g.remove();
    }
};

window.cadStartGpsPinPlace = () => {
    const type = (window.CAD_GPS_PIN_TYPES.indexOf(window.cadPinMode) >= 0)
        ? window.cadPinMode
        : (window.CAD_GPS_PIN_TYPES.indexOf(window.cadGpsPinType) >= 0 ? window.cadGpsPinType : null);

    if (!type) {
        alert('先に「吸水」「排水」「侵入口」「駐車場」のいずれかを選んでください。');
        window.cadUpdateGpsUi({ status: 'ピン種別を選んでから「GPSで置く」を押してください', statusColor: '#EF9A9A' });
        return;
    }
    if (!navigator.geolocation) {
        alert('この端末・ブラウザではGPS（位置情報）を使えません。');
        return;
    }
    if (!window.cadMap) {
        alert('CAD地図がまだ準備できていません。');
        return;
    }

    window.cadGpsPinType = type;
    window.cadPinMode = type;
    window.cadGpsPurpose = 'equip';
    window.cadStopGpsPinPlace({ silent: true });
    window.cadGpsPurpose = 'equip';

    window.cadUpdateGpsUi({ status: '測位中… 屋外で少し待ってください（位置情報の許可が必要な場合があります）', statusColor: '#90CAF9' });

    window.cadGpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            window.cadUpdateGpsPreview(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        (err) => {
            let msg = '位置情報を取得できませんでした。';
            if (err && err.code === 1) msg = '位置情報の利用が拒否されています。端末の設定で許可してください。';
            else if (err && err.code === 2) msg = '位置情報を取得できません（電波・GPSを確認）。';
            else if (err && err.code === 3) msg = '測位がタイムアウトしました。屋外で再度お試しください。';
            window.cadUpdateGpsUi({ status: msg, statusColor: '#EF9A9A' });
            alert(msg);
            window.cadStopGpsPinPlace({ keepStatus: true });
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    window.cadUpdateGpsUi({});
};

window.cadConfirmGpsPinPlace = () => {
    if (!window.cadGpsLastPos) {
        alert('まだ現在地を取得できていません。少し待ってから再度お試しください。');
        return;
    }
    if (window.cadGpsPurpose === 'partial_start' || window.cadGpsPurpose === 'partial_end') {
        window.cadConfirmPartialGps();
        return;
    }
    if (window.cadGpsPurpose === 'split_cut') {
        window.cadConfirmSplitGpsCut();
        return;
    }
    if (window.cadGpsPurpose === 'custom_rect' || window.cadGpsPurpose === 'custom_circle') {
        window.cadConfirmCustomShapeGps();
        return;
    }
    if (window.cadGpsPurpose === 'quad_corner') {
        window.cadConfirmQuadGps();
        return;
    }
    const type = window.cadGpsPinType || window.cadPinMode;
    if (window.CAD_GPS_PIN_TYPES.indexOf(type) < 0) {
        alert('ピン種別が不明です。吸水・排水などを選んでからやり直してください。');
        return;
    }
    const acc = Math.round(window.cadGpsLastPos.accuracy || 999);
    if (acc > 15) {
        if (!confirm(`現在の精度は ±${acc}m です。\nこのまま置きますか？（あとから地図で微調整できます）`)) return;
    }
    const latLng = new google.maps.LatLng(window.cadGpsLastPos.lat, window.cadGpsLastPos.lng);
    const ok = window.cadPlaceEquipmentPin(latLng, type);
    window.cadStopGpsPinPlace({ silent: true });
    if (ok) {
        window.cadUpdateGpsUi({
            status: `${window.cadGpsPinTypeLabel(type)} をGPS位置に設置しました（必要ならドラッグで微調整）`,
            statusColor: '#A5D6A7'
        });
    }
};

window.cadStopGpsPinPlace = (opts) => {
    opts = opts || {};
    if (window.cadGpsWatchId != null && navigator.geolocation) {
        try { navigator.geolocation.clearWatch(window.cadGpsWatchId); } catch (e) { /* ignore */ }
    }
    window.cadGpsWatchId = null;
    window.cadGpsLastPos = null;
    window.cadGpsPurpose = null;
    window.cadCustomShapeGpsType = null;
    window.cadClearGpsPreview();
    const pBar = document.getElementById('cadPartialGpsBar');
    if (pBar) pBar.style.display = 'none';
    const sBar = document.getElementById('cadSplitGpsBar');
    if (sBar) sBar.style.display = 'none';
    const cBar = document.getElementById('cadCustomGpsBar');
    if (cBar) cBar.style.display = 'none';
    const qBar = document.getElementById('cadQuadGpsBar');
    if (qBar) qBar.style.display = 'none';
    if (!opts.silent && !opts.keepStatus) {
        window.cadUpdateGpsUi({ status: 'ピン種別を選んで「GPSで置く」を押してください', statusColor: '#90CAF9' });
    } else {
        window.cadUpdateGpsUi({});
    }
};

/** 汎用GPS測位開始（途中生成・分割用） */
window.cadStartPurposeGpsWatch = (purpose, waitingMsg) => {
    if (!navigator.geolocation) {
        alert('この端末・ブラウザではGPS（位置情報）を使えません。');
        return false;
    }
    if (!window.cadMap) {
        alert('CAD地図がまだ準備できていません。');
        return false;
    }
    window.cadStopGpsPinPlace({ silent: true });
    window.cadGpsPurpose = purpose;
    window.cadUpdateGpsUi({
        status: waitingMsg || '測位中… 屋外で少し待ってください',
        statusColor: '#90CAF9'
    });
    window.cadGpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            window.cadUpdateGpsPreview(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        (err) => {
            let msg = '位置情報を取得できませんでした。';
            if (err && err.code === 1) msg = '位置情報の利用が拒否されています。端末の設定で許可してください。';
            else if (err && err.code === 2) msg = '位置情報を取得できません（電波・GPSを確認）。';
            else if (err && err.code === 3) msg = '測位がタイムアウトしました。屋外で再度お試しください。';
            window.cadUpdateGpsUi({ status: msg, statusColor: '#EF9A9A' });
            alert(msg);
            window.cadStopGpsPinPlace({ keepStatus: true });
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    window.cadUpdateGpsUi({});
    return true;
};

/** 給水・排水アイコン上の番号サイズを変更 */
window.setCadPinNumFontSize = (px, opts) => {
    opts = opts || {};
    const n = Math.max(8, Math.min(48, Math.round(parseFloat(px) || 24)));
    window.cadPinNumFontSize = n;
    const label = document.getElementById('cadPinNumSizeLabel');
    if (label) label.textContent = n + 'px';
    if (opts.refresh !== false) {
        const svg = document.getElementById('cadSvgOverlay');
        if (svg) svg._lastPinsStateId = null;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    }
};

window.cadAdjustPinNumSize = (delta) => {
    const cur = parseFloat(window.cadPinNumFontSize) || 24;
    window.setCadPinNumFontSize(cur + (parseFloat(delta) || 0));
};

window.cadPaintNakamichiTempLine = () => {
    const svg = document.getElementById('cadSvgOverlay');
    if (!svg || typeof window.latLngToScreenPixel !== 'function') return;
    let host = svg.querySelector('#cadSvgDrawOverlay');
    if (!host) {
        host = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        host.id = 'cadSvgDrawOverlay';
        host.setAttribute('style', 'pointer-events:none;');
        const pins = svg.querySelector('#cadSvgPins');
        if (pins && pins.parentNode) pins.parentNode.insertBefore(host, pins);
        else svg.appendChild(host);
    }
    let node = document.getElementById('cadSvgTempLine');
    if (!node) {
        node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        node.id = 'cadSvgTempLine';
        node.setAttribute('fill', 'none');
        node.setAttribute('stroke-linecap', 'round');
        node.setAttribute('stroke-linejoin', 'round');
        node.style.display = 'none';
        host.appendChild(node);
    } else if (node.parentNode !== host) {
        host.appendChild(node);
    }
    const drawing = (window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage')
        && window.cadNakamichiIsDrawing && window.nakamichiTempLine && window.nakamichiTempLine.getPath;
    if (!drawing) {
        node.style.display = 'none';
        return;
    }
    const path = window.nakamichiTempLine.getPath();
    if (!path || !path.getLength || path.getLength() < 1) {
        node.style.display = 'none';
        return;
    }
    let d = '';
    for (let i = 0; i < path.getLength(); i++) {
        const pt = path.getAt(i);
        const s = window.latLngToScreenPixel(pt.lat(), pt.lng());
        d += (i === 0 ? 'M' : 'L') + s.x + ',' + s.y + ' ';
    }
    const drainage = window.cadPinMode === 'drainage';
    node.setAttribute('stroke', drainage ? '#00BCD4' : '#E91E63');
    node.setAttribute('stroke-width', '6');
    node.setAttribute('stroke-opacity', '1');
    node.setAttribute('fill', 'none');
    if (drainage) node.setAttribute('stroke-dasharray', '8,8');
    else node.removeAttribute('stroke-dasharray');
    node.setAttribute('d', d);
    node.style.display = 'block';
};

window.cadSnapSplitLineEnds = (startLL, endLL) => {
    if (!startLL || !endLL || typeof turf === 'undefined' || typeof window.cadBearingDiff !== 'function') return null;
    const sLng = typeof startLL.lng === 'function' ? startLL.lng() : Number(startLL.lng);
    const sLat = typeof startLL.lat === 'function' ? startLL.lat() : Number(startLL.lat);
    const eLng = typeof endLL.lng === 'function' ? endLL.lng() : Number(endLL.lng);
    const eLat = typeof endLL.lat === 'function' ? endLL.lat() : Number(endLL.lat);
    if (![sLng, sLat, eLng, eLat].every(isFinite)) return null;
    const a = turf.point([sLng, sLat]);
    const b = turf.point([eLng, eLat]);
    const len = turf.distance(a, b, { units: 'meters' });
    if (!(len > 0.2)) return null;
    const freeBear = turf.bearing(a, b);
    const angleEl = document.getElementById('cadAngle');
    let axis = angleEl && angleEl.value !== '' ? parseFloat(angleEl.value) : 0;
    if (!isFinite(axis)) axis = 0;
    const align = (bearing) => {
        const diff = window.cadBearingDiff(freeBear, bearing);
        return Math.min(diff, Math.abs(180 - diff));
    };
    const snap = align(axis + 90) <= align(axis) ? axis + 90 : axis;
    const mid = turf.midpoint(a, b);
    const half = len / 2;
    const p1 = turf.destination(mid, half, snap, { units: 'meters' });
    const p2 = turf.destination(mid, half, snap + 180, { units: 'meters' });
    return [
        { lat: p1.geometry.coordinates[1], lng: p1.geometry.coordinates[0] },
        { lat: p2.geometry.coordinates[1], lng: p2.geometry.coordinates[0] }
    ];
};

window.cadSplitLinePreviewPath = (startLL, endLL) => {
    if (window.cadPinMode === 'nakamichi') {
        const snapped = window.cadSnapSplitLineEnds(startLL, endLL);
        if (snapped) return snapped;
    }
    const read = (ll) => ({
        lat: typeof ll.lat === 'function' ? ll.lat() : Number(ll.lat),
        lng: typeof ll.lng === 'function' ? ll.lng() : Number(ll.lng)
    });
    return [read(startLL), read(endLL)];
};

window.cadCommitSplitLine = (path) => {
    if (!path || path.length < 2) return;
    const now = Date.now();
    if (now - (window._cadLastSplitAt || 0) < 700) return;
    window._cadLastSplitAt = now;

    window.cadNakamichiIsDrawing = false;
    window.cadPinMode = null;
    if (!window.cadNakamichiLines) window.cadNakamichiLines = [];
    window.cadNakamichiLines.push(path);
    if (typeof window.drawNakamichiVisual === 'function') window.drawNakamichiVisual(path);
    try { window.cadSplitExistingRidgesByLine_(path); } catch (e) { console.warn('畝の分割に失敗:', e); }
    try { if (typeof window.cadSplitMakuraByNakamichi === 'function') window.cadSplitMakuraByNakamichi(path); } catch (e) {}
    if (typeof window.cadUpdateSplitLineBtn === 'function') window.cadUpdateSplitLineBtn();
    if (typeof window.reassignLabels === 'function') window.reassignLabels();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = '分割ラインで畝を分けました。';
        msgEl.style.color = '#E91E63';
    }
};

window.cadSplitExistingRidgesByLine_ = (path) => {
    if (!path || path.length < 2 || typeof turf === 'undefined') return;
    const p1 = path[0];
    const p2 = path[path.length - 1];
    const lat1 = typeof p1.lat === 'function' ? p1.lat() : Number(p1.lat);
    const lng1 = typeof p1.lng === 'function' ? p1.lng() : Number(p1.lng);
    const lat2 = typeof p2.lat === 'function' ? p2.lat() : Number(p2.lat);
    const lng2 = typeof p2.lng === 'function' ? p2.lng() : Number(p2.lng);
    if (![lat1, lng1, lat2, lng2].every(isFinite)) return;
    const line = turf.lineString([[lng1, lat1], [lng2, lat2]]);
    const half = (window.CAD_NAKAMICHI_HALF_WIDTH_M > 0) ? window.CAD_NAKAMICHI_HALF_WIDTH_M : 0.2;
    let cut = null;
    try { cut = turf.buffer(line, half, { units: 'meters' }); } catch (e) { cut = null; }
    if (!cut) return;

    const splitList = (list) => {
        const next = [];
        (list || []).forEach((gPoly) => {
            if (!gPoly) return;
            const src = window.cadGooglePolyToTurf(gPoly);
            if (!src) { next.push(gPoly); return; }
            let diff = null;
            try { diff = turf.difference(src, cut); } catch (e) { diff = null; }
            if (!diff) {
                try { gPoly.setMap(null); } catch (e) {}
                return;
            }
            const before = window.cadFeatureArea(src);
            const after = window.cadFeatureArea(diff);
            if (!(before > 0) || after > before - 0.08) {
                next.push(gPoly);
                return;
            }
            let flat;
            try { flat = turf.flatten(diff); } catch (e) { flat = { features: [diff] }; }
            const feats = (flat.features || []).filter((f) => f && window.cadFeatureArea(f) > 0.25);
            if (!feats.length) {
                try { gPoly.setMap(null); } catch (e) {}
                return;
            }
            if (feats.length === 1) {
                const one = window.cadCoalesceToPolygon(feats[0]);
                if (!(one && window.cadApplyFeatureToGooglePoly(gPoly, one))) {
                    next.push(gPoly);
                    return;
                }
                next.push(gPoly);
                return;
            }
            try { gPoly.setMap(null); } catch (e) {}
            feats.forEach((feature, i) => {
                const one = window.cadCoalesceToPolygon(feature);
                if (!one || !one.geometry || one.geometry.type !== 'Polygon') return;
                const paths = one.geometry.coordinates.map((ring) => ring.map((c) => ({ lat: c[1], lng: c[0] })));
                const np = window.cadCreateRidgePolygon(paths, {
                    fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(gPoly.uneGroup) : '#8BC34A'
                });
                np.uneIndex = (gPoly.uneIndex || 'une') + '_cut' + nowStamp() + '_' + i;
                np.uneGroup = gPoly.uneGroup;
                np.customLabel = gPoly.customLabel;
                if (typeof window.bindShapeHistoryEvents === 'function') window.bindShapeHistoryEvents(np);
                next.push(np);
            });
        });
        return next;
    };
    const nowStamp = () => Date.now();

    window.cadUnePolygons = splitList(window.cadUnePolygons);
    const shapes = window.cadCustomShapes || [];
    const makura = shapes.filter((p) => p && p.uneGroup === '枕');
    const others = shapes.filter((p) => !p || p.uneGroup !== '枕');
    window.cadCustomShapes = splitList(others).concat(makura);
};

window.drawNakamichiVisual = (path) => {
    if (!window.cadNakamichiMapPolygons) window.cadNakamichiMapPolygons = [];
    if (!path || path.length < 2) return;

    let line = new google.maps.Polyline({
        path: path,
        strokeColor: 'transparent',
        strokeOpacity: 0,
        strokeWeight: 0,
        map: window.cadMap,
        zIndex: 1,
        draggable: false,
        editable: false,
        clickable: false
    });

    const updateLineCoordsAndSplit = () => {
        const polyPath = line.getPath();
        if (!polyPath || polyPath.getLength() < 2) return;
        const newPath = [];
        for (let i = 0; i < polyPath.getLength(); i++) {
            const pt = polyPath.getAt(i);
            newPath.push({ lat: pt.lat(), lng: pt.lng() });
        }

        const idx = window.cadNakamichiMapPolygons.indexOf(line);
        if (idx !== -1 && window.cadNakamichiLines) {
            window.cadNakamichiLines[idx] = newPath;
        }

        if (typeof window.cadReapplyAllNakamichiSplits === 'function') {
            window.cadReapplyAllNakamichiSplits();
        } else {
            try {
                window.cadSplitMakuraByNakamichi(newPath);
            } catch (e) {
                console.warn('枕畝の分割に失敗:', e);
            }
        }

        if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    };

    google.maps.event.addListener(line, 'dragend', updateLineCoordsAndSplit);
    if (line.getPath()) {
        google.maps.event.addListener(line.getPath(), 'set_at', updateLineCoordsAndSplit);
        google.maps.event.addListener(line.getPath(), 'insert_at', updateLineCoordsAndSplit);
    }

    window.cadNakamichiMapPolygons.push(line);
};

window.drawDrainageVisual = (path) => {
    // 破線を表現するため、SVGレイヤーでのみ表示（Google Map上では透明）
    let line = new google.maps.Polyline({ path: path, strokeColor: 'transparent', strokeOpacity: 0, strokeWeight: Math.max(0.5, 6), map: window.cadMap, zIndex: 9 });
    window.cadDrainageMapPolygons.push(line);
};

/**
 * 排水口ピン設置時: ピンのすぐ内側（上）に枕を横切る中道ラインを自動生成し、枕畝を分割する。
 * （旧仕様の「枕に平行な排水ライン」はやめて、枕を分割する中道にする）
 */
window.cadAutoAddDrainageLineForPin = (latLng) => {
    // 排水ピン設置時の赤い切断線・畝分割はいったん停止
    return false;
    if (!window.cadTargetId || !latLng) return false;
    const p = (typeof loadedPolygons !== 'undefined') ? loadedPolygons[window.cadTargetId] : null;
    if (!p || !p.coords || p.coords.length < 3) return false;

    let rawLng = typeof latLng.lng === 'function' ? latLng.lng() : parseFloat(latLng.lng);
    let rawLat = typeof latLng.lat === 'function' ? latLng.lat() : parseFloat(latLng.lat);
    if (isNaN(rawLng) || isNaN(rawLat)) return false;

    const pinPt = turf.point([rawLng, rawLat]);
    let coords = p.coords.map(pt => [
        typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng),
        typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)
    ]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([coords[0][0], coords[0][1]]);
    }
    const tPoly = turf.polygon([coords]);

    let minD = Infinity;
    let minI = -1;
    for (let i = 0; i < coords.length - 1; i++) {
        let seg = turf.lineString([coords[i], coords[i + 1]]);
        let d = turf.pointToLineDistance(pinPt, seg, { units: 'meters' });
        if (d < minD) {
            minD = d;
            minI = i;
        }
    }
    if (minI === -1) return false;

    const pA = coords[minI];
    const pB = coords[minI + 1];
    const ptA = turf.point(pA);
    const ptB = turf.point(pB);
    const edgeBearing = turf.bearing(ptA, ptB);

    const mid = turf.midpoint(ptA, ptB);
    const pPlus = turf.destination(mid, 0.5, edgeBearing + 90, { units: 'meters' });
    let inwardAngle = edgeBearing + 90;
    try {
        if (!turf.booleanPointInPolygon(pPlus, tPoly)) {
            inwardAngle = edgeBearing - 90;
        }
    } catch (e) {
        inwardAngle = edgeBearing - 90;
    }

    const refWidthM = window.getCadReferenceRidgeWidthMeters ? window.getCadReferenceRidgeWidthMeters() : 1.5;
    const makuraW = (refWidthM && refWidthM > 0) ? refWidthM : 1.5;

    // ピンのすぐ内側（枕の中央付近）に中道の中心
    const aboveMeters = Math.min(Math.max(makuraW * 0.55, 0.5), 2.0);
    const center = turf.destination(pinPt, aboveMeters, inwardAngle, { units: 'meters' });

    // 枕の長手に垂直＝枕を左右に分割
    const splitBearing = edgeBearing + 90;
    const halfLen = Math.min(Math.max(makuraW * 1.1, 1.2), 3.5);
    const end1 = turf.destination(center, halfLen, splitBearing, { units: 'meters' });
    const end2 = turf.destination(center, halfLen, splitBearing + 180, { units: 'meters' });

    const path = [
        { lat: end1.geometry.coordinates[1], lng: end1.geometry.coordinates[0] },
        { lat: end2.geometry.coordinates[1], lng: end2.geometry.coordinates[0] }
    ];

    if (!window.cadNakamichiLines) window.cadNakamichiLines = [];
    const isDup = window.cadNakamichiLines.some(existing => {
        if (!existing || existing.length < 2) return false;
        const midExist = turf.midpoint(
            turf.point([existing[0].lng, existing[0].lat]),
            turf.point([existing[1].lng, existing[1].lat])
        );
        return turf.distance(midExist, center, { units: 'meters' }) < 1.0;
    });
    if (isDup) return false;

    window.cadNakamichiLines.push(path);
    window.drawNakamichiVisual(path);
    try {
        window.cadSplitMakuraByNakamichi(path);
    } catch (e) {
        console.warn('枕畝の分割に失敗:', e);
    }
    return true;
};

/** 中道ライン付近の枕畝(customShapes)をバッファ差分で分割 */
window.cadSplitMakuraByNakamichi = (path) => {
    if (!path || path.length < 2 || !window.cadCustomShapes || !window.cadCustomShapes.length) return;
    const p1lng = typeof path[0].lng === 'function' ? path[0].lng() : parseFloat(path[0].lng);
    const p1lat = typeof path[0].lat === 'function' ? path[0].lat() : parseFloat(path[0].lat);
    const p2lng = typeof path[1].lng === 'function' ? path[1].lng() : parseFloat(path[1].lng);
    const p2lat = typeof path[1].lat === 'function' ? path[1].lat() : parseFloat(path[1].lat);
    const centerLine = turf.lineString([[p1lng, p1lat], [p2lng, p2lat]]);
    const cutBuf = turf.buffer(centerLine, window.CAD_NAKAMICHI_HALF_WIDTH_M, { units: 'meters' });
    if (!cutBuf) return;

    const kept = [];
    const toRemove = [];

    window.cadCustomShapes.forEach((poly) => {
        if (!poly || poly.uneGroup !== '枕') {
            kept.push(poly);
            return;
        }
        const arr = poly.getPath().getArray();
        if (!arr || arr.length < 3) {
            kept.push(poly);
            return;
        }
        let ring = arr.map(pt => [pt.lng(), pt.lat()]);
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
            ring.push([ring[0][0], ring[0][1]]);
        }
        let tPoly;
        try {
            tPoly = turf.polygon([ring]);
        } catch (e) {
            kept.push(poly);
            return;
        }

        let intersects = false;
        try {
            intersects = typeof turf.booleanIntersects === 'function'
                ? turf.booleanIntersects(tPoly, cutBuf)
                : !!turf.intersect(tPoly, cutBuf);
        } catch (e) {
            intersects = false;
        }
        if (!intersects) {
            kept.push(poly);
            return;
        }

        let differenced = null;
        try {
            differenced = turf.difference(tPoly, cutBuf);
        } catch (e) {
            kept.push(poly);
            return;
        }
        if (!differenced) {
            toRemove.push(poly);
            return;
        }

        let flattened;
        try {
            flattened = turf.flatten(differenced);
        } catch (e) {
            flattened = { features: [differenced] };
        }

        toRemove.push(poly);
        (flattened.features || []).forEach((feature, idx) => {
            if (!feature || !feature.geometry || !feature.geometry.coordinates) return;
            const coordinates = feature.geometry.coordinates;
            if (!coordinates || !coordinates.length) return;
            const paths = coordinates.map(ringCoords => ringCoords.map(c => ({ lat: c[1], lng: c[0] })));
            if (!paths[0] || paths[0].length < 3) return;
            const gPoly = window.cadCreateRidgePolygon(paths, {
                fillColor: window.cadGetGroupColor ? window.cadGetGroupColor('枕') : '#8BC34A'
            });
            gPoly.uneIndex = 'custom_makura_split_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000);
            gPoly.uneGroup = '枕';
            if (typeof window.bindShapeHistoryEvents === 'function') window.bindShapeHistoryEvents(gPoly);
            kept.push(gPoly);
        });
    });

    toRemove.forEach(poly => {
        try { poly.setMap(null); } catch (e) {}
    });
    window.cadCustomShapes = kept;

    if (typeof window.reassignLabels === 'function') window.reassignLabels();
    window.cadSvgNeedsRebuild = true;
};

/** 全ての中道・排水切断ラインを最新位置で基底枕形状に順次適用し再分割 */
window.cadReapplyAllNakamichiSplits = () => {
    if (!window.cadNakamichiLines || !window.cadNakamichiLines.length) return;

    // 初回・または未切断の基底枕データが未登録の場合は現在の枕グループを保存
    if (!window.cadBaseMakuraShapesData || !window.cadBaseMakuraShapesData.length) {
        window.cadBaseMakuraShapesData = [];
        if (window.cadCustomShapes) {
            window.cadCustomShapes.forEach(poly => {
                if (poly && poly.uneGroup === '枕') {
                    const arr = poly.getPath().getArray();
                    const ring = arr.map(pt => ({ lat: pt.lat(), lng: pt.lng() }));
                    window.cadBaseMakuraShapesData.push(ring);
                }
            });
        }
    }

    if (!window.cadBaseMakuraShapesData || !window.cadBaseMakuraShapesData.length) return;

    // 既存の枕ポリゴンを地図・配列から削除
    const nonMakura = (window.cadCustomShapes || []).filter(p => p && p.uneGroup !== '枕');
    const oldMakura = (window.cadCustomShapes || []).filter(p => p && p.uneGroup === '枕');
    oldMakura.forEach(p => { try { p.setMap(null); } catch (e) {} });

    // 基底枕ポリゴンを復元して再配置
    const restoredMakura = [];
    window.cadBaseMakuraShapesData.forEach((ring, idx) => {
        const gPoly = window.cadCreateRidgePolygon([ring], {
            fillColor: window.cadGetGroupColor ? window.cadGetGroupColor('枕') : '#8BC34A'
        });
        gPoly.uneIndex = 'custom_makura_base_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000);
        gPoly.uneGroup = '枕';
        if (typeof window.bindShapeHistoryEvents === 'function') window.bindShapeHistoryEvents(gPoly);
        restoredMakura.push(gPoly);
    });

    window.cadCustomShapes = [...nonMakura, ...restoredMakura];

    // 保存されているすべての中道/排水ラインで順次分割処理を実行
    window.cadNakamichiLines.forEach(linePath => {
        if (linePath && linePath.length >= 2) {
            try {
                window.cadSplitMakuraByNakamichi(linePath);
            } catch (e) {
                console.warn('枕分割の再適用失敗:', e);
            }
        }
    });
};

/** 全ての排水口ピンから枕分割用の中道を一括自動生成 */
window.cadGenerateDrainageLinesFromPins = () => {
    if (!window.cadPins || !window.cadPins.length) {
        if (typeof customAlert === 'function') customAlert('排水口ピン（🚩）が配置されていません。');
        else alert('排水口ピン（🚩）が配置されていません。');
        return;
    }
    const waterOutPins = window.cadPins.filter(mk => mk.cadPinType === 'water_out');
    if (!waterOutPins.length) {
        if (typeof customAlert === 'function') customAlert('排水口ピン（🚩）が見つかりません。まず「排水ピン」を配置してください。');
        else alert('排水口ピン（🚩）が見つかりません。まず「排水ピン」を配置してください。');
        return;
    }
    let count = 0;
    waterOutPins.forEach(mk => {
        const pos = typeof mk.getPosition === 'function' ? mk.getPosition() : mk.position;
        if (pos) {
            const added = window.cadAutoAddDrainageLineForPin(pos);
            if (added) count++;
        }
    });
    if (count > 0) {
        if (window.cadUnePolygons && window.cadUnePolygons.length > 0) {
            window.cadGenerateLines();
        } else {
            if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
            window.saveCadStateToHistory();
        }
        if (typeof customAlert === 'function') customAlert(`排水口のすぐ上に中道を ${count} 箇所入れ、枕を分割しました！`);
        else alert(`排水口のすぐ上に中道を ${count} 箇所入れ、枕を分割しました！`);
    } else {
        if (typeof customAlert === 'function') customAlert('対象の排水口ピンには既に中道が設置されています。');
        else alert('対象の排水口ピンには既に中道が設置されています。');
    }
};

window.cadFrontEdgeIndex = null;

window.cadUpdateFrontPickUi = () => {
    const picking = window.cadPinMode === 'front_edge';
    const chosen = (window.cadFrontEdgeIndexes && window.cadFrontEdgeIndexes.length) || 0;
    const hint = document.getElementById('cadFrontHint');
    const btn = document.getElementById('cadFrontPickBtn');
    const confirmBtn = document.getElementById('cadFrontConfirmBtn');
    if (hint) {
        hint.textContent = picking
            ? '辺をタップして正面を選び、よければ確定を押してください。確定するまで、別の辺をタップすると選び直します。'
            : (chosen ? '正面を確定しました。変えるときは「辺を選ぶ」からやり直します。' : '辺をタップすると、同じ方角の辺をまとめて正面にします。');
    }
    if (btn) {
        btn.textContent = picking ? '選択中' : '辺を選ぶ';
        btn.style.background = picking ? '#ea580c' : '#333';
        btn.style.color = picking ? '#fff' : '#FFCC80';
        btn.style.border = picking ? 'none' : '1px solid #ea580c';
    }
    if (confirmBtn) {
        confirmBtn.disabled = !chosen;
        confirmBtn.style.opacity = chosen ? '1' : '0.45';
    }
    const msg = document.getElementById('cadPinModeMsg');
    if (msg && picking) {
        msg.innerText = chosen ? '畝の正面：この辺でよければ確定を押してください' : '畝の正面：辺をタップしてください';
        msg.style.color = '#FF5722';
    }
};

window.cadConfirmFrontEdge = () => {
    if (!window.cadFrontEdgeIndexes || !window.cadFrontEdgeIndexes.length) {
        alert('先に辺をタップしてください。');
        return;
    }
    if (window.cadPinMode === 'front_edge') window.cadPinMode = null;
    window.cadUpdateFrontPickUi();
    const msg = document.getElementById('cadPinModeMsg');
    if (msg) {
        msg.innerText = '畝の正面を確定しました。別の辺を触っても変わりません。';
        msg.style.color = '#FF5722';
    }
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
};

window.cadBeginFrontEdgePick = () => {
    if (window.cadPinMode === 'front_edge') {
        window.cadPinMode = null;
        window.cadUpdateFrontPickUi();
        const msg = document.getElementById('cadPinModeMsg');
        if (msg) {
            msg.innerText = '💡 操作を選ぶと、ここに案内が出ます。';
            msg.style.color = '#FF9800';
        }
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
        return;
    }
    if (window.cadPinMode === 'makura_edge' || window.cadPinMode === 'makuraune') {
        window.cadPinMode = null;
        if (typeof window.cadUpdateMakuraPickUi === 'function') window.cadUpdateMakuraPickUi();
    }
    window.cadPinMode = 'front_edge';
    if (typeof window.cadUpdateSplitLineBtn === 'function') window.cadUpdateSplitLineBtn();
    if (typeof window.cadUpdateMakuraPickUi === 'function') window.cadUpdateMakuraPickUi();
    window.cadUpdateFrontPickUi();
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
};

window.cadClearFrontEdgePick = () => {
    window.cadFrontEdgeIndex = null;
    window.cadFrontEdgeIndexes = [];
    window.cadFrontBaseline = null;
    if (window.cadFrontBaselineVisual) window.cadFrontBaselineVisual.setMap(null);
    if (window.cadFrontBaselineMarker) window.cadFrontBaselineMarker.setMap(null);
    if (window.cadPinMode === 'front_edge') window.cadPinMode = null;
    window.cadUpdateFrontPickUi();
    const msg = document.getElementById('cadPinModeMsg');
    if (msg) {
        msg.innerText = '💡 操作を選ぶと、ここに案内が出ます。';
        msg.style.color = '#FF9800';
    }
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
};

window.cadCollectSameFacingEdges = (ring, edgeIndex) => {
    const base = window.cadRingEdgeInfo(ring, edgeIndex);
    if (!base) return [edgeIndex];
    const n = window.cadRingVertexCount(ring);
    let center = null;
    try { center = turf.center(turf.polygon([ring])).geometry.coordinates; } catch (e) { center = null; }
    const baseMid = turf.midpoint(turf.point(base.a), turf.point(base.b));
    const frontBear = center ? turf.bearing(turf.point(center), baseMid) : base.bearing;
    const indexes = [];
    for (let i = 0; i < n; i++) {
        const info = window.cadRingEdgeInfo(ring, i);
        if (!info || info.len < 0.2) continue;
        const diff = window.cadBearingDiff(info.bearing, base.bearing);
        const parallel = Math.min(diff, Math.abs(180 - diff)) <= 22;
        if (!parallel) continue;
        if (center) {
            const mid = turf.midpoint(turf.point(info.a), turf.point(info.b));
            const side = turf.bearing(turf.point(center), mid);
            if (window.cadBearingDiff(side, frontBear) > 75) continue;
        }
        indexes.push(i);
    }
    if (!indexes.length) indexes.push(edgeIndex);
    return indexes;
};

window.cadApplyFrontEdge = (edgeIndex) => {
    const ring = window.cadGetFieldRingCoords();
    const info = ring ? window.cadRingEdgeInfo(ring, edgeIndex) : null;
    if (!info) return false;
    const indexes = window.cadCollectSameFacingEdges(ring, edgeIndex);
    window.cadFrontEdgeIndex = edgeIndex;
    window.cadFrontEdgeIndexes = indexes;

    const origin = turf.point(info.a);
    let minD = Infinity;
    let maxD = -Infinity;
    let minC = info.a;
    let maxC = info.b;
    indexes.forEach((i) => {
        const edge = window.cadRingEdgeInfo(ring, i);
        if (!edge) return;
        [edge.a, edge.b].forEach((c) => {
            const d = turf.distance(origin, turf.point(c), { units: 'meters' });
            const b = turf.bearing(origin, turf.point(c));
            const signed = d * Math.cos((b - info.bearing) * Math.PI / 180);
            if (signed < minD) { minD = signed; minC = c; }
            if (signed > maxD) { maxD = signed; maxC = c; }
        });
    });
    window.cadFrontBaseline = [
        { lng: minC[0], lat: minC[1] },
        { lng: maxC[0], lat: maxC[1] }
    ];
    if (window.cadFrontBaselineVisual) window.cadFrontBaselineVisual.setMap(null);
    if (window.cadFrontBaselineMarker) window.cadFrontBaselineMarker.setMap(null);

    let angle = info.bearing;
    while (angle < 0) angle += 360;
    while (angle >= 180) angle -= 180;
    angle = Math.round(angle * 10) / 10;
    const angleEl = document.getElementById('cadAngle');
    if (angleEl) angleEl.value = String(angle);
    if (typeof window.updateCadPreviewCount === 'function') window.updateCadPreviewCount();
    if (typeof window.cadUpdateFrontPickUi === 'function') window.cadUpdateFrontPickUi();
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();

    const msg = document.getElementById('cadPinModeMsg');
    if (msg) {
        msg.innerText = `この方角の辺 ${indexes.length} 本を選びました。よければ確定を押してください。`;
        msg.style.color = '#FF5722';
    }
    return true;
};

window.cadSetFrontFromLatLng = (latLng) => {
    const ring = window.cadGetFieldRingCoords();
    if (!ring || !latLng || typeof turf === 'undefined') return;
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : Number(latLng.lng);
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : Number(latLng.lat);
    if (!isFinite(lng) || !isFinite(lat)) return;
    const pt = [lng, lat];
    const n = window.cadRingVertexCount(ring);
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
        const info = window.cadRingEdgeInfo(ring, i);
        if (!info || info.len < 0.15) continue;
        const m = window.cadPointSegmentMetrics(pt, info.a, info.b);
        const along = m.t < 0 ? -m.t : (m.t > 1 ? m.t - 1 : 0);
        const dist = Math.hypot(m.perp, along * (info.len || 1));
        if (dist < bestD) { bestD = dist; best = i; }
    }
    const snap = window.cadMakuraEdgeSnapMeters(lat);
    if (best < 0 || bestD > snap) {
        const msg = document.getElementById('cadPinModeMsg');
        if (msg) { msg.innerText = '辺の近くをタップしてください'; msg.style.color = '#FF5722'; }
        return;
    }
    window.cadApplyFrontEdge(best);
};

window.cadSetFrontBar = (position) => {
    if (!window.cadTargetId) return;
    const p = loadedPolygons[window.cadTargetId];
    if (!p || !p.coords || p.coords.length < 3) return;

    let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([coords[0][0], coords[0][1]]);
    const tPoly = turf.polygon([coords]);
    const bbox = turf.bbox(tPoly);
    const minLng = bbox[0], minLat = bbox[1], maxLng = bbox[2], maxLat = bbox[3];

    let pt;
    switch(position) {
        case 'top':    pt = {lat: maxLat, lng: (minLng + maxLng) / 2}; break;
        case 'bottom': pt = {lat: minLat, lng: (minLng + maxLng) / 2}; break;
        case 'left':   pt = {lat: (minLat + maxLat) / 2, lng: minLng}; break;
        case 'right':  pt = {lat: (minLat + maxLat) / 2, lng: maxLng}; break;
    }

    let path = pt;
    window.cadFrontBaseline = path;

    if (window.cadFrontBaselineVisual) window.cadFrontBaselineVisual.setMap(null);
    if (window.cadFrontBaselineMarker) window.cadFrontBaselineMarker.setMap(null);
    window.cadFrontBaseline = path;
    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();

    window.saveCadStateToHistory();
};

window.cadSetSnapGridCm = (cm) => {
    const el = document.getElementById('cadSnapGridCm');
    if (el) {
        el.value = String(cm);
        if (typeof window.cadOnSnapGridCmChange === 'function') {
            window.cadOnSnapGridCmChange();
        }
    }
};

window.cadAddCustomShape = (type) => {
    const mode = (type === 'circle') ? 'custom_circle' : 'custom_rect';
    // GPS測位中なら止めてタップ配置へ
    if (window.cadGpsWatchId != null) {
        window.cadStopGpsPinPlace({ silent: true });
    }
    window.cadPinMode = mode;
    window.cadCustomShapeGpsType = (type === 'circle') ? 'circle' : 'rect';
    
    // 🌟 自由畝追加時はグリッドを自動的にONにしてセル格子を表示！
    if (!window.cadSnapGridOn) {
        window.cadToggleSnapGrid(true);
    } else {
        window.cadCellEraseMode = false;
        window.cadRebuildSnapGrid();
        window.cadUpdateSnapGridUi_();
    }
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        if (window.cadSnapGridOn) {
            msgEl.innerText = mode === 'custom_rect'
                ? '【セル塗り・四角】枠をタップ／ドラッグで塗ります（消しゴム切替可）'
                : '【セル塗り・丸】枠をタップ／ドラッグで丸畝を塗ります';
        } else {
            msgEl.innerText = mode === 'custom_rect'
                ? '【四角畝】配置したい場所をタップ（または「GPSで四角畝」）'
                : '【丸畝】配置したい場所をタップ（または「GPSで丸畝」）';
        }
        msgEl.style.color = '#8BC34A';
    }
};

/** GPS現在地に自由畝を置く（測位開始） */
window.cadStartCustomShapeGps = (type) => {
    const shape = (type === 'circle') ? 'circle' : 'rect';
    const purpose = shape === 'circle' ? 'custom_circle' : 'custom_rect';
    window.cadCustomShapeGpsType = shape;
    window.cadPinMode = purpose; // 測位中も地図タップで代替配置可
    const label = shape === 'circle' ? '丸畝' : '四角畝';
    const ok = window.cadStartPurposeGpsWatch(
        purpose,
        `【${label}】GPS測位中… 置きたい場所に立って「ここに置く」`
    );
    if (!ok) return;
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = `【${label}・GPS】現在地プレビューを確認し「ここに置く」で確定（地図タップでも可）`;
        msgEl.style.color = '#1565C0';
    }
    if (typeof switchCadTab === 'function') {
        try { switchCadTab(1); } catch (e) {}
    }
};

/** GPS現在地で自由畝を確定 */
window.cadConfirmCustomShapeGps = () => {
    if (!window.cadGpsLastPos) {
        alert('まだ現在地を取得できていません。少し待ってから再度お試しください。');
        return;
    }
    const shape = window.cadCustomShapeGpsType
        || (window.cadGpsPurpose === 'custom_circle' ? 'circle' : 'rect');
    const acc = Math.round(window.cadGpsLastPos.accuracy || 999);
    if (acc > 15) {
        if (!confirm(`現在の精度は ±${acc}m です。\nこのまま置きますか？（あとから移動・変形できます）`)) return;
    }
    const latLng = new google.maps.LatLng(window.cadGpsLastPos.lat, window.cadGpsLastPos.lng);
    if (window.cadSnapGridOn) {
        const result = window.cadPaintGridCellAtLatLng(latLng, { type: shape, fromGps: true });
        window.cadStopGpsPinPlace({ silent: true });
        if (result === 'painted' || result === 'erased') {
            if (typeof window.reassignLabels === 'function') window.reassignLabels();
            if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
        } else if (result === 'outside') {
            alert('現在地のセルが圃場の外側です。');
        }
        const msgEl = document.getElementById('cadPinModeMsg');
        if (msgEl) {
            msgEl.innerText = '【セル塗り・GPS】現在地のセルを塗りました。続けてタップ／ドラッグもできます';
            msgEl.style.color = '#8BC34A';
        }
        return;
    }
    window.cadExecuteAddCustomShape(latLng, shape, { fromGps: true });
    window.cadPinMode = null;
    window.cadStopGpsPinPlace({ silent: true });
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = `【${shape === 'circle' ? '丸畝' : '四角畝'}】GPS位置に設置しました（ドラッグで微調整可）`;
        msgEl.style.color = '#8BC34A';
    }
};

/** 四角畝・丸畝をタップ／GPS位置に生成（畝幅基準・圃場内にクリップ） */
window.cadExecuteAddCustomShape = (latLng, type, opts) => {
    opts = opts || {};
    if (!window.cadTargetId || !latLng) return;

    // セル配置グリッドON時は交点へ吸着
    if (window.cadSnapGridOn && typeof window.cadSnapLatLngToGrid === 'function') {
        latLng = window.cadSnapLatLngToGrid(latLng);
    }

    const p = loadedPolygons[window.cadTargetId];
    if (!p || !p.coords || p.coords.length < 3) return;

    let fieldCoords = p.coords.map(pt => [
        typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng),
        typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)
    ]);
    if (fieldCoords[0][0] !== fieldCoords[fieldCoords.length - 1][0]
        || fieldCoords[0][1] !== fieldCoords[fieldCoords.length - 1][1]) {
        fieldCoords.push([fieldCoords[0][0], fieldCoords[0][1]]);
    }
    const tPoly = turf.polygon([fieldCoords]);
    const centerPt = turf.point([
        typeof latLng.lng === 'function' ? latLng.lng() : parseFloat(latLng.lng),
        typeof latLng.lat === 'function' ? latLng.lat() : parseFloat(latLng.lat)
    ]);

    // 圃場外は拒否
    try {
        if (!turf.booleanPointInPolygon(centerPt, tPoly)) {
            alert(opts.fromGps
                ? '現在地が圃場の外側です。圃場内に立ってから再度「ここに置く」を押してください。'
                : '圃場の内側をタップしてください。');
            return;
        }
    } catch (e) {}

    const widthM = window.getCadReferenceRidgeWidthMeters() || 1.5;
    const angleEl = document.getElementById('cadAngle');

    // 🌟 最寄りの外周線の角度を自動検出してセット・反映
    let autoAngle = null;
    try {
        if (typeof window.cadGetNearestEdgeAngle === 'function') {
            autoAngle = window.cadGetNearestEdgeAngle(latLng);
        }
    } catch (e) {}

    let angle = 0;
    if (autoAngle !== null && !isNaN(autoAngle)) {
        angle = autoAngle;
        if (angleEl) angleEl.value = String(angle);
        if (typeof window.cadAlignMapHeading === 'function') window.cadAlignMapHeading();
    } else if (angleEl && angleEl.value) {
        angle = parseFloat(angleEl.value);
    }

    let shapePoly = null;
    if (type === 'circle') {
        // 直径＝畝幅
        const radiusKm = Math.max(widthM / 2, 0.3) / 1000;
        shapePoly = turf.circle(centerPt, radiusKm, { steps: 24, units: 'kilometers' });
    } else {
        // 畝方向に長い四角（幅＝畝幅、長さ＝畝幅×4、最低4m）
        const lengthM = Math.max(widthM * 4, 4);
        const halfL = lengthM / 2;
        const halfW = Math.max(widthM / 2, 0.25);
        const along = angle;
        const across = angle + 90;
        const mid1 = turf.destination(centerPt, halfL, along, { units: 'meters' });
        const mid2 = turf.destination(centerPt, halfL, along + 180, { units: 'meters' });
        const c1 = turf.destination(mid1, halfW, across, { units: 'meters' }).geometry.coordinates;
        const c2 = turf.destination(mid1, halfW, across + 180, { units: 'meters' }).geometry.coordinates;
        const c3 = turf.destination(mid2, halfW, across + 180, { units: 'meters' }).geometry.coordinates;
        const c4 = turf.destination(mid2, halfW, across, { units: 'meters' }).geometry.coordinates;
        shapePoly = turf.polygon([[c1, c2, c3, c4, c1]]);
    }

    let finalPoly = null;
    try {
        finalPoly = turf.intersect(tPoly, shapePoly);
    } catch (e) {
        console.error(e);
    }
    if (!finalPoly) {
        alert('圃場内に図形を置けませんでした。');
        return;
    }

    // 既存畝との重なりを少し避ける（枕畝と同様）
    const avoidPolys = (window.cadUnePolygons || []).map(poly => {
        const path = poly.getPath().getArray();
        let coords = path.map(pt => [pt.lng(), pt.lat()]);
        if (coords.length < 3) return null;
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push([coords[0][0], coords[0][1]]);
        }
        try {
            return turf.buffer(turf.polygon([coords]), 0.05 / 1000, { units: 'kilometers' });
        } catch (e) {
            return null;
        }
    }).filter(Boolean);

    for (const av of avoidPolys) {
        if (!finalPoly) break;
        try {
            finalPoly = turf.difference(finalPoly, av);
        } catch (e) {}
    }
    if (!finalPoly) {
        alert('既存の畝と重なっているため置けません。別の位置をタップしてください。');
        return;
    }

    let flattened;
    try {
        flattened = turf.flatten(finalPoly);
    } catch (e) {
        flattened = { features: [finalPoly] };
    }

    const groupName = type === 'circle' ? '丸' : '四角';
    let addedCount = 0;
    (flattened.features || []).forEach((feature, idx) => {
        if (!feature || !feature.geometry || !feature.geometry.coordinates) return;
        const coordinates = feature.geometry.coordinates;
        if (!coordinates || !coordinates.length) return;
        // flatten 後は Polygon: coordinates = [outer, hole...]
        const paths = coordinates.map(ring => ring.map(c => ({ lat: c[1], lng: c[0] })));
        if (!paths[0] || paths[0].length < 3) return;
        const gPoly = window.cadCreateRidgePolygon(paths, {
            fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(groupName) : '#8BC34A'
        });
        gPoly.uneIndex = 'custom_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000);
        gPoly.uneGroup = groupName;
        window.bindShapeHistoryEvents(gPoly);
        window.cadCustomShapes.push(gPoly);
        addedCount++;
    });

    if (addedCount > 0) {
        window.reassignLabels();
        window.cadSvgNeedsRebuild = true;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
        window.saveCadStateToHistory();
    } else {
        alert('図形を生成できませんでした。');
    }
};

window.cadAddMakura = () => {
    window.cadBeginMakuraEdgePick();
};

window.cadNormBearing = (deg) => {
    let d = Number(deg) % 360;
    if (d < 0) d += 360;
    return d;
};

window.cadGetFieldRingCoords = () => {
    if (!window.cadTargetId || typeof loadedPolygons === 'undefined') return null;
    const p = loadedPolygons[window.cadTargetId];
    if (!p || !p.coords || p.coords.length < 3) return null;
    const coords = p.coords.map(pt => [
        typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng),
        typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)
    ]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([coords[0][0], coords[0][1]]);
    }
    return coords;
};

window.cadGooglePolyToTurf = (gPoly) => {
    if (!gPoly || !gPoly.getPath || typeof turf === 'undefined') return null;
    const path = gPoly.getPath().getArray();
    if (!path || path.length < 3) return null;
    const ring = path.map(pt => [pt.lng(), pt.lat()]);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0].slice());
    try { return turf.polygon([ring]); } catch (e) { return null; }
};

window.cadPointSegmentMetrics = (lngLat, a, b) => {
    const midLat = ((a[1] + b[1]) * 0.5) * Math.PI / 180;
    const mLng = 111320 * Math.cos(midLat);
    const mLat = 111320;
    const bx = (b[0] - a[0]) * mLng;
    const by = (b[1] - a[1]) * mLat;
    const px = (lngLat[0] - a[0]) * mLng;
    const py = (lngLat[1] - a[1]) * mLat;
    const len2 = bx * bx + by * by;
    const len = Math.sqrt(len2) || 1;
    const t = len2 > 0 ? (px * bx + py * by) / len2 : 0;
    const perp = Math.abs(bx * py - by * px) / len;
    return { t, perp };
};

window.cadMakuraEdgeSnapMeters = (lat) => {
    const zoom = (window.cadMap && window.cadMap.getZoom()) || 19;
    const latRad = (Number(lat) || 35) * Math.PI / 180;
    const mPerPx = 156543.03392 * Math.cos(latRad) / Math.pow(2, zoom);
    const scale = window.cadCurrentScale || 1;
    const fromPx = (40 * mPerPx) / Math.max(scale, 0.2);
    return Math.min(6, Math.max(1.2, fromPx));
};

window.cadGetRidgeAxisBearing = () => {
    const ridges = window.cadUnePolygons || [];
    for (let i = 0; i < ridges.length; i++) {
        const p = ridges[i];
        if (!p || String(p.uneGroup || '') === '枕' || !p.getPath) continue;
        const path = p.getPath().getArray();
        if (!path || path.length < 2) continue;
        let bestLen = 0;
        let bestBearing = null;
        for (let k = 0; k < path.length; k++) {
            const a = path[k];
            const b = path[(k + 1) % path.length];
            try {
                const pa = turf.point([a.lng(), a.lat()]);
                const pb = turf.point([b.lng(), b.lat()]);
                const len = turf.distance(pa, pb, { units: 'meters' });
                if (len > bestLen) {
                    bestLen = len;
                    bestBearing = turf.bearing(pa, pb);
                }
            } catch (e) {}
        }
        if (bestBearing != null && bestLen > 0.5) return bestBearing;
    }
    const angleEl = document.getElementById('cadAngle');
    const angle = angleEl && angleEl.value !== '' ? parseFloat(angleEl.value) : 0;
    return isFinite(angle) ? angle : 0;
};

window.cadEdgeIsParallelToRidges = (bearing) => {
    if (!isFinite(bearing)) return false;
    const axis = window.cadGetRidgeAxisBearing();
    const diff = window.cadBearingDiff(bearing, axis);
    const aligned = Math.min(diff, Math.abs(180 - diff));
    return aligned <= 32;
};

window.cadInwardBearingForEdge = (info, fieldCenterCoord) => {
    const mid = turf.midpoint(turf.point(info.a), turf.point(info.b));
    const toCenter = turf.bearing(mid, turf.point(fieldCenterCoord));
    const left = window.cadNormBearing(info.bearing + 90);
    const right = window.cadNormBearing(info.bearing - 90);
    return (window.cadBearingDiff(left, toCenter) <= window.cadBearingDiff(right, toCenter)) ? left : right;
};

window.cadListMainRidgeEntries = () => {
    return (window.cadUnePolygons || []).map((gPoly, index) => {
        if (!gPoly || String(gPoly.uneGroup || '') === '枕') return null;
        const poly = window.cadGooglePolyToTurf(gPoly);
        if (!poly) return null;
        return { gPoly, index, poly };
    }).filter(Boolean);
};

window.cadFeatureArea = (feature) => {
    try { return turf.area(feature) || 0; } catch (e) { return 0; }
};

window.cadCoalesceToPolygon = (feature) => {
    if (!feature || !feature.geometry) return null;
    if (feature.geometry.type === 'Polygon') return feature;
    let flat;
    try { flat = turf.flatten(feature); } catch (e) { return null; }
    const feats = (flat.features || []).filter(f => f && f.geometry && f.geometry.type === 'Polygon');
    if (!feats.length) return null;
    if (feats.length === 1) return feats[0];
    try {
        const grown = feats.map(f => {
            try { return turf.buffer(f, 0.12, { units: 'meters' }) || f; } catch (e) { return f; }
        });
        let united = grown[0];
        for (let i = 1; i < grown.length; i++) {
            try {
                const n = turf.union(united, grown[i]);
                if (n) united = n;
            } catch (e) {}
        }
        if (united && united.geometry && united.geometry.type === 'Polygon') {
            try {
                const back = turf.buffer(united, -0.12, { units: 'meters' });
                if (back && back.geometry && back.geometry.type === 'Polygon') return back;
            } catch (e) {}
            return united;
        }
    } catch (e) {}
    let best = feats[0];
    let bestA = -1;
    feats.forEach(f => {
        const a = window.cadFeatureArea(f);
        if (a > bestA) { bestA = a; best = f; }
    });
    return best;
};

window.cadRebindPolyPathHistory = (poly) => {
    if (!poly || !poly.getPath || typeof google === 'undefined' || !google.maps || !google.maps.event) return;
    let editTimeout = null;
    ['set_at', 'insert_at', 'remove_at'].forEach(eventName => {
        google.maps.event.addListener(poly.getPath(), eventName, () => {
            if (window.cadSuppressPathEvents) return;
            if (typeof window.updateSingleLabelPosition === 'function') window.updateSingleLabelPosition(poly);
            if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
            clearTimeout(editTimeout);
            editTimeout = setTimeout(() => {
                if (typeof window.reassignLabels === 'function') window.reassignLabels();
                if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
            }, 500);
        });
    });
};

window.cadApplyFeatureToGooglePoly = (gPoly, feature) => {
    const one = window.cadCoalesceToPolygon(feature);
    if (!gPoly || !one || !one.geometry || one.geometry.type !== 'Polygon') return false;
    const ring = one.geometry.coordinates && one.geometry.coordinates[0];
    if (!ring || ring.length < 4) return false;
    const path = ring.map(c => ({ lat: c[1], lng: c[0] }));
    if (path.length > 1) {
        const a = path[0];
        const b = path[path.length - 1];
        if (Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(a.lng - b.lng) < 1e-12) path.pop();
    }
    if (path.length < 3) return false;
    window.cadSuppressPathEvents = true;
    try {
        try {
            const old = gPoly.getPath();
            if (old && google.maps.event && google.maps.event.clearInstanceListeners) {
                google.maps.event.clearInstanceListeners(old);
            }
        } catch (e) {}
        gPoly.setPath(path);
    } catch (e) {
        console.warn('枕畝の形状反映に失敗:', e);
        return false;
    } finally {
        window.cadSuppressPathEvents = false;
    }
    try { window.cadRebindPolyPathHistory(gPoly); } catch (e) {}
    return true;
};

window.cadDifferenceOthers = (piece, keepPoly, gapM) => {
    if (!piece) return null;
    const gap = (gapM > 0) ? gapM : 0.03;
    const lists = [window.cadUnePolygons, window.cadCustomShapes];
    for (let li = 0; li < lists.length && piece; li++) {
        const list = lists[li] || [];
        for (let i = 0; i < list.length && piece; i++) {
            const g = list[i];
            if (!g || g === keepPoly) continue;
            const other = window.cadGooglePolyToTurf(g);
            if (!other) continue;
            try {
                let avoid = other;
                try { avoid = turf.buffer(other, gap, { units: 'meters' }) || other; } catch (e) {}
                const d = turf.difference(piece, avoid);
                piece = d || null;
            } catch (e) {}
        }
    }
    return piece;
};

window.cadBuildInwardEdgeStrip = (ringCoords, tPoly, edgeIndex, widthM) => {
    const info = window.cadRingEdgeInfo(ringCoords, edgeIndex);
    if (!info || info.len < 0.15) return null;
    const center = turf.center(tPoly).geometry.coordinates;
    const inward = window.cadInwardBearingForEdge(info, center);
    let seg = turf.lineString([info.a, info.b]);
    seg = window.cadExtendLineStringEnds(seg, Math.max(widthM * 0.35, 0.3));
    const mid = turf.midpoint(turf.point(info.a), turf.point(info.b));
    const insetM = (window.CAD_MAKURA_EDGE_INSET_M > 0) ? window.CAD_MAKURA_EDGE_INSET_M : 0;
    const shift = turf.destination(mid, insetM + widthM / 2, inward, { units: 'meters' });
    const dx = shift.geometry.coordinates[0] - mid.geometry.coordinates[0];
    const dy = shift.geometry.coordinates[1] - mid.geometry.coordinates[1];
    const shifted = turf.lineString(seg.geometry.coordinates.map(c => [c[0] + dx, c[1] + dy]));
    let strip = null;
    try { strip = turf.buffer(shifted, widthM / 2, { units: 'meters' }); } catch (e) { strip = null; }
    if (!strip) return null;
    try { return turf.intersect(tPoly, strip); } catch (e) { return null; }
};

window.cadBuildInwardCorridor = (info, tPoly, depthM) => {
    const center = turf.center(tPoly).geometry.coordinates;
    const inward = window.cadInwardBearingForEdge(info, center);
    let a = info.a;
    let b = info.b;
    try {
        const ext = window.cadExtendLineStringEnds(turf.lineString([a, b]), 0.2);
        const cs = ext.geometry.coordinates;
        a = cs[0];
        b = cs[cs.length - 1];
    } catch (e) {}
    const insetM = (window.CAD_MAKURA_EDGE_INSET_M > 0) ? window.CAD_MAKURA_EDGE_INSET_M : 0;
    const depth = Math.min(40, Math.max(0.4, depthM));
    const a0 = turf.destination(turf.point(a), insetM, inward, { units: 'meters' }).geometry.coordinates;
    const b0 = turf.destination(turf.point(b), insetM, inward, { units: 'meters' }).geometry.coordinates;
    const inner = Math.max(0.3, depth - insetM);
    const aIn = turf.destination(turf.point(a0), inner, inward, { units: 'meters' }).geometry.coordinates;
    const bIn = turf.destination(turf.point(b0), inner, inward, { units: 'meters' }).geometry.coordinates;
    const rect = turf.polygon([[a0, b0, bIn, aIn, a0]]);
    try { return turf.intersect(tPoly, rect); } catch (e) { return null; }
};

window.cadUpdateMakuraPickUi = () => {
    const n = (window.cadMakuraSelectedEdges || []).length;
    const picking = window.cadPinMode === 'makura_edge';
    const hint = document.getElementById('cadMakuraHint');
    if (hint) {
        if (picking) {
            hint.textContent = n
                ? `選択中 ${n} 辺。生成を押すと、その方角の辺に枕畝を作ります。`
                : '辺をタップすると、同じ方角の辺をまとめて選びます。';
        } else if (n) {
            hint.textContent = `選択中 ${n} 辺。生成を押すか、辺を選ぶで追加できます。`;
        } else {
            hint.textContent = '辺をタップすると、同じ方角の辺をまとめて選び、その約50cm内側に作ります。畝と平行な辺は端の畝に統合します。';
        }
    }
    const pickBtn = document.getElementById('cadMakuraPickBtn');
    if (pickBtn) {
        pickBtn.textContent = picking ? '選択中' : '辺を選ぶ';
        pickBtn.style.background = picking ? '#ea580c' : '#333';
        pickBtn.style.color = '#fff';
        pickBtn.style.border = picking ? 'none' : '1px solid #ea580c';
        if (!picking) pickBtn.style.color = '#fdba74';
    }
    const genBtn = document.getElementById('cadMakuraGenBtn');
    if (genBtn) {
        genBtn.disabled = n === 0;
        genBtn.style.opacity = n === 0 ? '0.45' : '1';
        genBtn.textContent = n ? `生成（${n}）` : '生成';
    }
    const msg = document.getElementById('cadPinModeMsg');
    if (msg && picking) {
        msg.innerText = n ? `枕畝：${n} 辺を選択中。生成を押してください。` : '枕畝：作りたい辺をタップ（複数可）';
        msg.style.color = '#ea580c';
    }
};

window.cadDrawMakuraEdgeOverlay = () => {
    const svg = document.getElementById('cadSvgOverlay');
    if (!svg) return;
    let g = svg.querySelector('#cadSvgMakuraEdges');
    if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.id = 'cadSvgMakuraEdges';
        g.setAttribute('style', 'pointer-events:none;');
        const paths = svg.querySelector('#cadSvgPaths');
        if (paths && paths.parentNode) paths.parentNode.insertBefore(g, paths.nextSibling);
        else svg.appendChild(g);
    }
    while (g.firstChild) g.removeChild(g.firstChild);
    const picking = window.cadPinMode === 'makura_edge';
    const frontPicking = window.cadPinMode === 'front_edge';
    const selected = new Set(window.cadMakuraSelectedEdges || []);
    const frontSet = new Set(window.cadFrontEdgeIndexes || []);
    if (!picking && !frontPicking && selected.size === 0 && frontSet.size === 0) return;
    const ring = window.cadGetFieldRingCoords();
    if (!ring || typeof window.latLngToScreenPixel !== 'function' || typeof window.cadRingVertexCount !== 'function') return;
    const n = window.cadRingVertexCount(ring);
    const addLine = (x1, y1, x2, y2, color, width) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', String(width));
        line.setAttribute('stroke-linecap', 'round');
        g.appendChild(line);
    };
    for (let i = 0; i < n; i++) {
        const info = window.cadRingEdgeInfo(ring, i);
        if (!info || info.len < 0.15) continue;
        const a = window.latLngToScreenPixel(info.a[1], info.a[0]);
        const b = window.latLngToScreenPixel(info.b[1], info.b[0]);
        const makuraOn = selected.has(i);
        const frontOn = frontSet.has(i);
        if (picking) {
            if (makuraOn) {
                addLine(a.x, a.y, b.x, b.y, '#ffffff', 12);
                addLine(a.x, a.y, b.x, b.y, '#FF6F00', 7);
            } else {
                addLine(a.x, a.y, b.x, b.y, '#FFCC80', 5);
            }
        } else if (frontPicking) {
            if (frontOn) {
                addLine(a.x, a.y, b.x, b.y, '#ffffff', 12);
                addLine(a.x, a.y, b.x, b.y, '#FF5722', 7);
            } else {
                addLine(a.x, a.y, b.x, b.y, '#FFAB91', 5);
            }
        } else {
            if (makuraOn) addLine(a.x, a.y, b.x, b.y, '#FF6F00', 6);
            if (frontOn) addLine(a.x, a.y, b.x, b.y, '#FF5722', 4);
        }
    }
};

window.cadToggleMakuraEdge = (index) => {
    const ring = window.cadGetFieldRingCoords();
    const group = (ring && typeof window.cadCollectSameFacingEdges === 'function')
        ? window.cadCollectSameFacingEdges(ring, index)
        : [index];
    const arr = window.cadMakuraSelectedEdges || (window.cadMakuraSelectedEdges = []);
    const allOn = group.every((i) => arr.indexOf(i) >= 0);
    if (allOn) {
        window.cadMakuraSelectedEdges = arr.filter((i) => group.indexOf(i) < 0);
    } else {
        group.forEach((i) => {
            if (arr.indexOf(i) < 0) arr.push(i);
        });
    }
    window.cadUpdateMakuraPickUi();
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
};

window.cadToggleMakuraEdgeNearLatLng = (latLng) => {
    const ring = window.cadGetFieldRingCoords();
    if (!ring || !latLng || typeof turf === 'undefined') return;
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : Number(latLng.lng);
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : Number(latLng.lat);
    if (!isFinite(lng) || !isFinite(lat)) return;
    const pt = [lng, lat];
    const n = window.cadRingVertexCount(ring);
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
        const info = window.cadRingEdgeInfo(ring, i);
        if (!info || info.len < 0.15) continue;
        const m = window.cadPointSegmentMetrics(pt, info.a, info.b);
        const along = m.t < 0 ? -m.t : (m.t > 1 ? m.t - 1 : 0);
        const edgeLen = info.len || 1;
        const dist = Math.hypot(m.perp, along * edgeLen);
        if (dist < bestD) { bestD = dist; best = i; }
    }
    const snap = window.cadMakuraEdgeSnapMeters(lat);
    const msg = document.getElementById('cadPinModeMsg');
    if (best < 0 || bestD > snap) {
        if (msg) { msg.innerText = '辺の近くをタップしてください'; msg.style.color = '#ea580c'; }
        return;
    }
    window.cadToggleMakuraEdge(best);
};

window.cadBeginMakuraEdgePick = () => {
    if (window.cadPinMode === 'makura_edge') {
        window.cadPinMode = null;
        window.cadUpdateMakuraPickUi();
        const msg = document.getElementById('cadPinModeMsg');
        if (msg) {
            msg.innerText = '💡 操作を選ぶと、ここに案内が出ます。';
            msg.style.color = '#FF9800';
        }
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
        return;
    }
    if (window.cadPinMode === 'front_edge') {
        window.cadPinMode = null;
        if (typeof window.cadUpdateFrontPickUi === 'function') window.cadUpdateFrontPickUi();
    }
    window.cadPinMode = 'makura_edge';
    if (typeof window.cadUpdateSplitLineBtn === 'function') window.cadUpdateSplitLineBtn();
    window.cadUpdateMakuraPickUi();
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
};

window.cadClearMakuraEdgePick = () => {
    window.cadMakuraSelectedEdges = [];
    const wasPicking = window.cadPinMode === 'makura_edge' || window.cadPinMode === 'makuraune';
    if (wasPicking) window.cadPinMode = null;
    window.cadUpdateMakuraPickUi();
    if (wasPicking) {
        const msg = document.getElementById('cadPinModeMsg');
        if (msg) {
            msg.innerText = '💡 操作を選ぶと、ここに案内が出ます。';
            msg.style.color = '#FF9800';
        }
    }
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
};

window.cadMetersAlongBearing_ = (originLngLat, coord, bearingDeg) => {
    const lat0 = originLngLat[1] * Math.PI / 180;
    const kx = 111320 * Math.cos(lat0);
    const ky = 110540;
    const dx = (coord[0] - originLngLat[0]) * kx;
    const dy = (coord[1] - originLngLat[1]) * ky;
    const rad = bearingDeg * Math.PI / 180;
    return dx * Math.sin(rad) + dy * Math.cos(rad);
};

window.cadDestinationMeters_ = (originLngLat, meters, bearingDeg) => {
    const m = Number(meters) || 0;
    if (Math.abs(m) < 1e-4) return [originLngLat[0], originLngLat[1]];
    const b = m >= 0 ? bearingDeg : (bearingDeg + 180);
    return turf.destination(turf.point(originLngLat), Math.abs(m), b, { units: 'meters' }).geometry.coordinates;
};

/** 同じ側・ほぼ同じ方角の辺を1本にまとめ、枕の下辺が直線になる帯を作る */
window.cadBuildStraightMakuraStrip_ = (ring, tPoly, edgeIndexes, widthM) => {
    const infos = edgeIndexes.map((ei) => window.cadRingEdgeInfo(ring, ei)).filter((info) => info && info.len >= 0.15);
    if (!infos.length || typeof turf === 'undefined') return null;
    const center = turf.center(tPoly).geometry.coordinates;
    const inward = window.cadInwardBearingForEdge(infos[0], center);
    const along = infos[0].bearing;
    const origin = infos[0].a;
    let minS = Infinity;
    let maxS = -Infinity;
    infos.forEach((info) => {
        [info.a, info.b].forEach((c) => {
            const s = window.cadMetersAlongBearing_(origin, c, along);
            if (s < minS) minS = s;
            if (s > maxS) maxS = s;
        });
    });
    if (!(maxS - minS > 0.3)) return null;
    const endExtend = Math.max(0.5, widthM * 0.65);
    minS -= endExtend;
    maxS += endExtend;
    const inset = (window.CAD_MAKURA_EDGE_INSET_M > 0) ? window.CAD_MAKURA_EDGE_INSET_M : 0.5;
    const gap = (window.CAD_MAKURA_RIDGE_GAP_M > 0) ? window.CAD_MAKURA_RIDGE_GAP_M : 0.35;
    let innerDist = inset + widthM;
    const ridges = window.cadListMainRidgeEntries();
    let nearest = Infinity;
    ridges.forEach((r) => {
        const pts = r.poly && r.poly.geometry && r.poly.geometry.coordinates && r.poly.geometry.coordinates[0];
        if (!pts) return;
        pts.forEach((c) => {
            const s = window.cadMetersAlongBearing_(origin, c, along);
            if (s < minS - 0.4 || s > maxS + 0.4) return;
            const d = window.cadMetersAlongBearing_(origin, c, inward);
            if (d > inset - 0.2 && d < nearest) nearest = d;
        });
    });
    if (nearest < Infinity) {
        const limit = nearest - gap;
        if (limit < innerDist) innerDist = limit;
    }
    if (innerDist < inset + 0.2) return null;
    const a = window.cadDestinationMeters_(origin, minS, along);
    const b = window.cadDestinationMeters_(origin, maxS, along);
    const aOut = window.cadDestinationMeters_(a, inset, inward);
    const bOut = window.cadDestinationMeters_(b, inset, inward);
    const aIn = window.cadDestinationMeters_(a, innerDist, inward);
    const bIn = window.cadDestinationMeters_(b, innerDist, inward);
    let rect = null;
    try { rect = turf.polygon([[aOut, bOut, bIn, aIn, aOut]]); } catch (e) { return null; }
    try {
        const clipped = turf.intersect(tPoly, rect);
        return clipped || null;
    } catch (e) {
        return rect;
    }
};

window.cadCreateMakuraFromEdges = (ring, tPoly, edgeIndexes, widthM) => {
    if (!edgeIndexes.length) return [];
    const center = turf.center(tPoly).geometry.coordinates;
    const items = edgeIndexes.map((ei) => {
        const info = window.cadRingEdgeInfo(ring, ei);
        if (!info) return null;
        return { ei: ei, info: info, inward: window.cadInwardBearingForEdge(info, center) };
    }).filter(Boolean);
    const used = {};
    const align = (a, b) => {
        const diff = window.cadBearingDiff(a, b);
        return Math.min(diff, Math.abs(180 - diff));
    };
    const features = [];
    items.forEach((start) => {
        if (used[start.ei]) return;
        const group = [start.ei];
        used[start.ei] = true;
        items.forEach((other) => {
            if (used[other.ei]) return;
            if (align(start.info.bearing, other.info.bearing) > 12) return;
            if (window.cadBearingDiff(start.inward, other.inward) > 35) return;
            const mid = turf.midpoint(turf.point(other.info.a), turf.point(other.info.b)).geometry.coordinates;
            const off = window.cadMetersAlongBearing_(start.info.a, mid, start.info.bearing + 90);
            if (Math.abs(off) > 0.75) return;
            used[other.ei] = true;
            group.push(other.ei);
        });
        const strip = window.cadBuildStraightMakuraStrip_(ring, tPoly, group, widthM);
        if (!strip) return;
        let flat;
        try { flat = turf.flatten(strip); } catch (e) { flat = { features: [strip] }; }
        (flat.features || []).forEach((feature) => {
            const one = window.cadCoalesceToPolygon(feature);
            if (!one || window.cadFeatureArea(one) < 0.4) return;
            features.push(one);
        });
    });
    if (features.length <= 1) return features;
    return window.cadJoinNearbyMakura_(features, tPoly);
};

window.cadMakuraAxisBox_ = (feature) => {
    const ring = feature && feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0];
    if (!ring || ring.length < 4 || typeof turf === 'undefined') return null;
    let best = 0;
    let bi = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        const len = turf.distance(turf.point(ring[i]), turf.point(ring[i + 1]), { units: 'meters' });
        if (len > best) { best = len; bi = i; }
    }
    const origin = ring[bi];
    const bearing = turf.bearing(turf.point(ring[bi]), turf.point(ring[bi + 1]));
    const perp = bearing + 90;
    let minS = Infinity;
    let maxS = -Infinity;
    let minP = Infinity;
    let maxP = -Infinity;
    ring.forEach((c) => {
        const s = window.cadMetersAlongBearing_(origin, c, bearing);
        const p = window.cadMetersAlongBearing_(origin, c, perp);
        if (s < minS) minS = s;
        if (s > maxS) maxS = s;
        if (p < minP) minP = p;
        if (p > maxP) maxP = p;
    });
    return { origin: origin, bearing: bearing, perp: perp, minS: minS, maxS: maxS, minP: minP, maxP: maxP, len: maxS - minS };
};

window.cadMakuraRectFromBox_ = (box) => {
    const corner = (s, p) => {
        const along = window.cadDestinationMeters_(box.origin, s, box.bearing);
        return window.cadDestinationMeters_(along, p, box.perp);
    };
    const a = corner(box.minS, box.minP);
    const b = corner(box.maxS, box.minP);
    const c = corner(box.maxS, box.maxP);
    const d = corner(box.minS, box.maxP);
    try { return turf.polygon([[a, b, c, d, a]]); } catch (e) { return null; }
};

window.cadJoinNearbyMakura_ = (features, tPoly) => {
    let items = (features || []).map((f) => window.cadCoalesceToPolygon(f)).filter((f) => f && window.cadFeatureArea(f) >= 0.4);
    if (items.length <= 1) return items;
    const nearEnough = (a, b) => {
        const ra = a.geometry.coordinates[0];
        const rb = b.geometry.coordinates[0];
        let best = Infinity;
        for (let i = 0; i < ra.length; i++) {
            for (let j = 0; j < rb.length; j++) {
                const d = turf.distance(turf.point(ra[i]), turf.point(rb[j]), { units: 'meters' });
                if (d < best) best = d;
                if (best < 1.2) return true;
            }
        }
        return best < 2.5;
    };
    let guard = 0;
    let changed = true;
    while (changed && guard++ < 12) {
        changed = false;
        for (let i = 0; i < items.length && !changed; i++) {
            for (let j = i + 1; j < items.length; j++) {
                if (!nearEnough(items[i], items[j])) continue;
                const boxI = window.cadMakuraAxisBox_(items[i]);
                const boxJ = window.cadMakuraAxisBox_(items[j]);
                if (!boxI || !boxJ) continue;
                const longBox = boxI.len >= boxJ.len ? boxI : boxJ;
                const shortFeat = boxI.len >= boxJ.len ? items[j] : items[i];
                const ring = shortFeat.geometry.coordinates[0];
                let minS = longBox.minS;
                let maxS = longBox.maxS;
                ring.forEach((c) => {
                    const s = window.cadMetersAlongBearing_(longBox.origin, c, longBox.bearing);
                    if (s < minS) minS = s;
                    if (s > maxS) maxS = s;
                });
                const rect = window.cadMakuraRectFromBox_({
                    origin: longBox.origin,
                    bearing: longBox.bearing,
                    perp: longBox.perp,
                    minS: minS,
                    maxS: maxS,
                    minP: longBox.minP,
                    maxP: longBox.maxP
                });
                if (!rect) continue;
                let clipped = rect;
                if (tPoly) {
                    try { clipped = turf.intersect(tPoly, rect) || rect; } catch (e) { clipped = rect; }
                }
                const one = window.cadCoalesceToPolygon(clipped);
                if (!one || window.cadFeatureArea(one) < 0.4) continue;
                const keep = boxI.len >= boxJ.len ? i : j;
                const drop = keep === i ? j : i;
                items.splice(drop, 1);
                items[keep > drop ? keep - 1 : keep] = one;
                changed = true;
                break;
            }
        }
    }
    return items;
};

window.cadMergeParallelEdgesIntoEndRidges = (ring, tPoly, edgeIndexes, widthM) => {
    const ridges = window.cadListMainRidgeEntries();
    const leftover = [];
    if (!ridges.length) return { merged: 0, leftover: edgeIndexes.slice() };
    const groups = {};
    const maxBridge = Math.max(widthM * 6, 12);
    edgeIndexes.forEach((ei) => {
        const info = window.cadRingEdgeInfo(ring, ei);
        if (!info) { leftover.push(ei); return; }
        let best = null;
        let bestPerp = Infinity;
        ridges.forEach((r) => {
            const ringPts = r.poly.geometry && r.poly.geometry.coordinates && r.poly.geometry.coordinates[0];
            if (!ringPts || !ringPts.length) return;
            let minT = Infinity;
            let maxT = -Infinity;
            let minPerp = Infinity;
            ringPts.forEach((c) => {
                const m = window.cadPointSegmentMetrics(c, info.a, info.b);
                if (m.t < minT) minT = m.t;
                if (m.t > maxT) maxT = m.t;
                if (m.perp < minPerp) minPerp = m.perp;
            });
            const overlaps = maxT >= -0.02 && minT <= 1.02;
            if (!overlaps) return;
            if (minPerp < bestPerp) { bestPerp = minPerp; best = r; }
        });
        if (!best || bestPerp > maxBridge) { leftover.push(ei); return; }
        const depth = bestPerp + widthM + 0.35;
        const piece = window.cadBuildInwardCorridor(info, tPoly, depth);
        if (!piece) { leftover.push(ei); return; }
        if (!groups[best.index]) groups[best.index] = { entry: best, pieces: [], edges: [] };
        groups[best.index].pieces.push(piece);
        groups[best.index].edges.push(ei);
    });
    let merged = 0;
    Object.keys(groups).forEach((key) => {
        const group = groups[key];
        let piece = null;
        group.pieces.forEach((p) => {
            if (!piece) piece = p;
            else {
                try {
                    const u = turf.union(piece, p);
                    if (u) piece = u;
                } catch (e) {}
            }
        });
        piece = window.cadDifferenceOthers(piece, group.entry.gPoly);
        if (!piece) {
            leftover.push.apply(leftover, group.edges);
            return;
        }
        let acc = group.entry.poly;
        try {
            const u = turf.union(acc, piece);
            if (u) acc = u;
        } catch (e) {}
        try {
            const clipped = turf.intersect(tPoly, acc);
            if (clipped) acc = clipped;
        } catch (e) {}
        const before = window.cadFeatureArea(group.entry.poly);
        const one = window.cadCoalesceToPolygon(acc);
        const after = window.cadFeatureArea(one);
        if (one && after > before + 0.2 && window.cadApplyFeatureToGooglePoly(group.entry.gPoly, one)) {
            merged++;
        } else {
            leftover.push.apply(leftover, group.edges);
        }
    });
    return { merged, leftover };
};

window.cadPlaceMakuraFeatures = (features) => {
    let added = 0;
    (features || []).forEach((feature, idx) => {
        if (!feature || !feature.geometry || feature.geometry.type !== 'Polygon') return;
        const paths = feature.geometry.coordinates.map(ring => ring.map(c => ({ lat: c[1], lng: c[0] })));
        if (!paths[0] || paths[0].length < 3) return;
        const gPoly = window.cadCreateRidgePolygon(paths, {
            fillColor: window.cadGetGroupColor ? window.cadGetGroupColor('枕') : '#FF6F00'
        });
        gPoly.uneIndex = 'custom_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000);
        gPoly.uneGroup = '枕';
        gPoly.cadMakuraFollowEdge = true;
        if (typeof window.bindShapeHistoryEvents === 'function') window.bindShapeHistoryEvents(gPoly);
        window.cadCustomShapes.push(gPoly);
        added++;
    });
    return added;
};

window.cadCollectObliqueMakuraEdges_ = (ring, selected) => {
    const angle = (typeof window.cadGetRidgeAxisBearing === 'function') ? window.cadGetRidgeAxisBearing() : 0;
    const n = window.cadRingVertexCount(ring);
    const chosen = new Set(selected || []);
    const ridges = window.cadListMainRidgeEntries();
    const align = (a, b) => {
        const diff = window.cadBearingDiff(a, b);
        return Math.min(diff, Math.abs(180 - diff));
    };
    const extra = [];
    for (let i = 0; i < n; i++) {
        if (chosen.has(i)) continue;
        const info = window.cadRingEdgeInfo(ring, i);
        if (!info || info.len < 0.4) continue;
        const toAxis = align(info.bearing, angle);
        const toEnd = align(info.bearing, angle + 90);
        if (toAxis <= 18 || toEnd <= 15) continue;
        let near = false;
        for (let r = 0; r < ridges.length && !near; r++) {
            const pts = ridges[r].poly && ridges[r].poly.geometry && ridges[r].poly.geometry.coordinates && ridges[r].poly.geometry.coordinates[0];
            if (!pts) continue;
            for (let p = 0; p < pts.length; p++) {
                const m = window.cadPointSegmentMetrics(pts[p], info.a, info.b);
                const over = m.t < 0 ? -m.t : (m.t > 1 ? m.t - 1 : 0);
                const dist = Math.hypot(m.perp, over * info.len);
                if (dist < 2.8) { near = true; break; }
            }
        }
        if (near) extra.push(i);
    }
    return extra;
};

window.cadGenerateMakuraFromSelectedEdges = () => {
    const picked = Array.from(new Set(window.cadMakuraSelectedEdges || []));
    if (!picked.length) {
        alert('先に辺を選んでください。');
        return;
    }
    if (typeof turf === 'undefined') {
        alert('図形計算の準備ができていません。画面を再読み込みしてください。');
        return;
    }
    const ring = window.cadGetFieldRingCoords();
    if (!ring) {
        alert('圃場が開かれていません。');
        return;
    }
    let tPoly = null;
    try { tPoly = turf.polygon([ring]); } catch (e) { tPoly = null; }
    if (!tPoly) {
        alert('圃場の形を読み取れませんでした。');
        return;
    }
    const center = turf.center(tPoly).geometry.coordinates;
    const pickedInfo = window.cadRingEdgeInfo(ring, picked[0]);
    const pickedInward = pickedInfo ? window.cadInwardBearingForEdge(pickedInfo, center) : null;
    const sameSide = (ei) => {
        if (!pickedInward) return false;
        const info = window.cadRingEdgeInfo(ring, ei);
        if (!info) return false;
        return window.cadBearingDiff(window.cadInwardBearingForEdge(info, center), pickedInward) <= 50;
    };
    const frontIds = (Array.isArray(window.cadFrontEdgeIndexes) ? window.cadFrontEdgeIndexes : []).filter(sameSide);
    const selected = Array.from(new Set(picked.concat(frontIds)));
    let widthM = null;
    const measured = (window.cadListMainRidgeEntries() || []).map((r) => {
        return (typeof window.estimateCadUneWidthMeters === 'function') ? window.estimateCadUneWidthMeters(r.gPoly) : 0;
    }).filter((w) => w > 0.05);
    if (measured.length) {
        widthM = measured.reduce((a, b) => a + b, 0) / measured.length;
    }
    if (!widthM) {
        const widthCm = typeof window.getCadWidthCm === 'function' ? window.getCadWidthCm() : null;
        if (widthCm > 0) widthM = widthCm / 100;
    }
    if (!widthM) {
        widthM = (typeof window.getCadReferenceRidgeWidthMeters === 'function')
            ? window.getCadReferenceRidgeWidthMeters() : 1.5;
    }
    if (!widthM || widthM <= 0) widthM = 1.5;

    const parallel = [];
    const across = [];
    selected.forEach((ei) => {
        const info = window.cadRingEdgeInfo(ring, ei);
        if (!info) return;
        if (window.cadEdgeIsParallelToRidges(info.bearing)) parallel.push(ei);
        else across.push(ei);
    });

    let merged = 0;
    let makuraEdges = across.slice();
    try {
        const mergeResult = window.cadMergeParallelEdgesIntoEndRidges(ring, tPoly, parallel, widthM);
        merged = mergeResult.merged || 0;
        makuraEdges = makuraEdges.concat(mergeResult.leftover || []);
    } catch (e) {
        console.warn('端の畝への統合に失敗:', e);
        makuraEdges = makuraEdges.concat(parallel);
    }

    let features = [];
    try {
        features = window.cadCreateMakuraFromEdges(ring, tPoly, makuraEdges, widthM);
    } catch (e) {
        console.warn('枕畝の生成に失敗:', e);
        features = [];
    }
    const added = window.cadPlaceMakuraFeatures(features);

    if (!merged && !added) {
        alert('選んだ辺には枕畝を置く空きがありません。');
        return;
    }

    if (typeof window.reassignLabels === 'function') window.reassignLabels();
    window.cadMakuraSelectedEdges = [];
    window.cadPinMode = null;
    window.cadUpdateMakuraPickUi();
    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();

    const msg = document.getElementById('cadPinModeMsg');
    if (msg) {
        const parts = [];
        if (added) parts.push(`枕畝を ${added} 本`);
        if (merged) parts.push(`端の畝 ${merged} 本に統合`);
        msg.innerText = parts.join('、') + 'しました';
        msg.style.color = '#ea580c';
    }
};

/** 方位角の最小差（0〜180） */
window.cadBearingDiff = (a, b) => {
    let d = Math.abs(Number(a) - Number(b)) % 360;
    if (d > 180) d = 360 - d;
    return d;
};

/** 符号付き方位差（-180〜180）。左折+ / 右折- */
window.cadSignedBearingDelta = (fromDeg, toDeg) => {
    let d = (Number(toDeg) - Number(fromDeg)) % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
};

/**
 * 閉じたリング座標からユニーク頂点数を返す（末尾の閉じ点を除く）
 */
window.cadRingVertexCount = (ringCoords) => {
    if (!ringCoords || ringCoords.length < 2) return 0;
    const first = ringCoords[0];
    const last = ringCoords[ringCoords.length - 1];
    const closed = first && last && first[0] === last[0] && first[1] === last[1];
    return closed ? ringCoords.length - 1 : ringCoords.length;
};

/**
 * 辺 i の方位・長さ（リングは閉じている想定）
 */
window.cadRingEdgeInfo = (ringCoords, edgeIndex) => {
    const n = window.cadRingVertexCount(ringCoords);
    if (n < 2) return null;
    const i = ((edgeIndex % n) + n) % n;
    const a = ringCoords[i];
    const b = ringCoords[(i + 1) % n];
    if (!a || !b) return null;
    const len = turf.distance(turf.point(a), turf.point(b), { units: 'meters' });
    const bearing = turf.bearing(turf.point(a), turf.point(b));
    return { i, a, b, len, bearing };
};

/**
 * 90°段差などの「ジョグ」なら角を回り込む。
 * 短い折れ辺の先に、元の方位へ戻る辺があればジョグとみなす。
 */
window.cadIsBoundaryJogAhead = (ringCoords, fromEdgeIndex, direction, startBearing, widthM) => {
    const n = window.cadRingVertexCount(ringCoords);
    if (n < 3) return false;
    const w = Math.max(Number(widthM) || 1.5, 0.5);
    const maxLookM = Math.max(w * 8, 12);
    const dir = direction >= 0 ? 1 : -1;
    let traveled = 0;
    let idx = fromEdgeIndex;

    for (let step = 0; step < n - 1; step++) {
        idx = (idx + dir + n) % n;
        const info = window.cadRingEdgeInfo(ringCoords, idx);
        if (!info || info.len < 0.15) continue;
        traveled += info.len;
        if (traveled > maxLookM) break;
        // 元の長手方位に戻ってきた → 段差ジョグ
        if (window.cadBearingDiff(info.bearing, startBearing) <= 40) return true;
        // 短い折れ辺（畝幅の数倍以内）ならさらに先を見る
        if (info.len > w * 4.5) break;
    }
    return false;
};

/**
 * タップ点に近い圃場外周の辺を起点に、連続辺をたどる。
 * ほぼ一直線は常に接続。90°前後の角は「短い段差（ジョグ）」なら回り込む。
 * @returns {{ chain:number[][], nearestDist:number, startBearing:number, edgeIndexes:number[] }|null}
 */
window.cadFindBoundaryEdgeChainNearPoint = (ringCoords, centerPt, maxAngleDiffDeg, ridgeWidthM) => {
    const coords = ringCoords;
    const n = window.cadRingVertexCount(coords);
    if (n < 2) return null;
    // 後方互換: 第3引数は「隣接辺の最大折れ角」として扱う（既定100°で直角を許可）
    const maxAdjacentTurn = (maxAngleDiffDeg != null) ? maxAngleDiffDeg : 100;

    let best = { dist: Infinity, i: 0 };
    for (let i = 0; i < n; i++) {
        const info = window.cadRingEdgeInfo(coords, i);
        if (!info || info.len < 0.15) continue;
        const line = turf.lineString([info.a, info.b]);
        const d = turf.pointToLineDistance(centerPt, line, { units: 'meters' });
        if (d < best.dist) best = { dist: d, i };
    }
    if (!isFinite(best.dist)) return null;

    const startInfo = window.cadRingEdgeInfo(coords, best.i);
    if (!startInfo) return null;
    const startBearing = startInfo.bearing;
    const widthGuess = (ridgeWidthM && ridgeWidthM > 0) ? ridgeWidthM : 1.5;

    let perimeter = 0;
    for (let i = 0; i < n; i++) {
        const info = window.cadRingEdgeInfo(coords, i);
        if (info) perimeter += info.len;
    }
    const maxChainLen = Math.max(perimeter * 0.55, startInfo.len);

    const canTakeEdge = (prevBearing, nextEdgeIndex, direction, netTurn) => {
        const next = window.cadRingEdgeInfo(coords, nextEdgeIndex);
        if (!next || next.len < 0.15) return null;
        const turn = window.cadSignedBearingDelta(prevBearing, next.bearing);
        const absTurn = Math.abs(turn);
        if (absTurn > maxAdjacentTurn) return null; // 鋭い折り返しは打ち切り
        const nextNet = netTurn + turn;
        if (absTurn <= 45) {
            return { turn, nextNet, next };
        }
        // 直角前後: 短い辺、または先に元方位へ戻るジョグなら回り込み
        const shortCorner = next.len <= Math.max(widthGuess * 4.5, 8);
        const jog = window.cadIsBoundaryJogAhead(coords, nextEdgeIndex, direction, startBearing, widthGuess);
        if (shortCorner || jog) {
            // 一周して反対側まで行かないよう、累積旋回の上限
            if (Math.abs(nextNet) > 200) return null;
            return { turn, nextNet, next };
        }
        return null;
    };

    // 辺インデックスを両方向に収集（順序は後でチェーン化）
    const selected = new Set([best.i]);
    let chainLen = startInfo.len;

    // 前方（リング順）
    let prevBearing = startBearing;
    let netTurn = 0;
    let idx = best.i;
    for (let step = 0; step < n - 1; step++) {
        const nextIdx = (idx + 1) % n;
        if (selected.has(nextIdx)) break;
        const take = canTakeEdge(prevBearing, nextIdx, 1, netTurn);
        if (!take) break;
        if (chainLen + take.next.len > maxChainLen) break;
        selected.add(nextIdx);
        chainLen += take.next.len;
        prevBearing = take.next.bearing;
        netTurn = take.nextNet;
        idx = nextIdx;
    }

    // 後方（リング逆順）: 辿る進行方位は辺の逆向き
    prevBearing = (startBearing + 180) % 360;
    if (prevBearing >= 360) prevBearing -= 360;
    netTurn = 0;
    idx = best.i;
    for (let step = 0; step < n - 1; step++) {
        const prevIdx = (idx - 1 + n) % n;
        if (selected.has(prevIdx)) break;
        const prevInfo = window.cadRingEdgeInfo(coords, prevIdx);
        if (!prevInfo || prevInfo.len < 0.15) break;
        // 逆向きに進むとき、prev辺を逆走した方位
        let travelBearing = (prevInfo.bearing + 180) % 360;
        if (travelBearing >= 360) travelBearing -= 360;
        const turn = window.cadSignedBearingDelta(prevBearing, travelBearing);
        const absTurn = Math.abs(turn);
        if (absTurn > maxAdjacentTurn) break;
        const nextNet = netTurn + turn;
        if (absTurn > 45) {
            const shortCorner = prevInfo.len <= Math.max(widthGuess * 4.5, 8);
            const jog = window.cadIsBoundaryJogAhead(coords, prevIdx, -1, startBearing, widthGuess);
            if (!(shortCorner || jog)) break;
            if (Math.abs(nextNet) > 200) break;
        }
        if (chainLen + prevInfo.len > maxChainLen) break;
        selected.add(prevIdx);
        chainLen += prevInfo.len;
        prevBearing = travelBearing;
        netTurn = nextNet;
        idx = prevIdx;
    }

    // 選択辺をリング順の連続チェーンに並べる
    const edgeIndexes = [];
    let startEdge = best.i;
    for (let step = 0; step < n; step++) {
        const prevIdx = (startEdge - 1 + n) % n;
        if (!selected.has(prevIdx)) break;
        startEdge = prevIdx;
    }
    for (let step = 0; step < n; step++) {
        const ei = (startEdge + step) % n;
        if (!selected.has(ei)) break;
        edgeIndexes.push(ei);
    }
    if (!edgeIndexes.length) edgeIndexes.push(best.i);

    const chain = [];
    edgeIndexes.forEach((ei, k) => {
        const info = window.cadRingEdgeInfo(coords, ei);
        if (!info) return;
        if (k === 0) chain.push(info.a);
        chain.push(info.b);
    });
    if (chain.length < 2) return null;
    return {
        chain: chain,
        nearestDist: best.dist,
        startBearing: startBearing,
        edgeIndexes: edgeIndexes
    };
};

/**
 * 折れ線の両端を指定メートルだけ延長する（バッファの丸端で角が欠ける対策）
 */
window.cadExtendLineStringEnds = (line, extendMeters) => {
    try {
        if (!line || !line.geometry || !line.geometry.coordinates) return line;
        const coords = line.geometry.coordinates.slice();
        if (coords.length < 2) return line;
        const dist = Math.max(0, Number(extendMeters) || 0);
        if (dist <= 0) return line;

        const first = coords[0];
        const second = coords[1];
        const last = coords[coords.length - 1];
        const prev = coords[coords.length - 2];

        // 始点側・終点側それぞれ「外側」へ延長
        const bStart = turf.bearing(turf.point(second), turf.point(first));
        const bEnd = turf.bearing(turf.point(prev), turf.point(last));
        const newFirst = turf.destination(turf.point(first), dist, bStart, { units: 'meters' }).geometry.coordinates;
        const newLast = turf.destination(turf.point(last), dist, bEnd, { units: 'meters' }).geometry.coordinates;
        return turf.lineString([newFirst].concat(coords).concat([newLast]));
    } catch (e) {
        console.warn('cadExtendLineStringEnds failed:', e);
        return line;
    }
};

/**
 * 枕畝候補から「外殻に沿った1本」を選ぶ。
 * difference で複数に割れた場合は、辺に近い最大面積の1つを返す。
 */
window.cadPickBestMakuraFeature = (flattened, centerPt, edgeChain, maxEdgeDistM) => {
    try {
        if (!flattened || !flattened.features || !flattened.features.length) return null;
        const maxDist = (maxEdgeDistM != null && maxEdgeDistM > 0) ? maxEdgeDistM : 3;
        let edgeLine = null;
        if (edgeChain && edgeChain.length >= 2) {
            try { edgeLine = turf.lineString(edgeChain); } catch (e) { edgeLine = null; }
        }
        let best = null;
        let bestScore = -Infinity;
        flattened.features.forEach((feature) => {
            if (!feature || !feature.geometry) return;
            const gType = feature.geometry.type;
            if (gType !== 'Polygon' && gType !== 'MultiPolygon') return;
            let area = 0;
            try { area = turf.area(feature); } catch (eA) { area = 0; }
            if (!(area > 0.05)) return; // 極小片は無視
            let center;
            try { center = turf.center(feature); } catch (eC) { return; }
            let edgeDist = 0;
            if (edgeLine) {
                try { edgeDist = turf.pointToLineDistance(center, edgeLine, { units: 'meters' }); } catch (eD) { edgeDist = 999; }
            } else if (centerPt) {
                try { edgeDist = turf.distance(center, centerPt, { units: 'meters' }); } catch (eD2) { edgeDist = 999; }
            }
            if (edgeDist > maxDist) return;
            // 面積を優先しつつ、辺に近いものを選ぶ
            const score = area - edgeDist * 2;
            if (score > bestScore) {
                bestScore = score;
                best = feature;
            }
        });
        return best;
    } catch (e) {
        console.warn('cadPickBestMakuraFeature failed:', e);
        return flattened && flattened.features && flattened.features[0] ? flattened.features[0] : null;
    }
};

/**
 * 圃場を内側に畝幅ぶんオフセットし、外周の一定幅リング（枕帯）を作る。
 * 折れ線バッファだと凹みを塗り潰すため、内向きオフセット差を使う。
 */
window.cadBuildInwardMakuraRing = (fieldPoly, widthM) => {
    try {
        const w = Math.max(Number(widthM) || 1.5, 0.3);
        let inset = null;
        try {
            inset = turf.buffer(fieldPoly, -w, { units: 'meters' });
        } catch (eBuf) {
            inset = null;
        }
        if (!inset) {
            // 狭すぎて内側が消える場合は圃場全体を枕候補にする
            return fieldPoly;
        }
        // MultiPolygon になり得る内側をまとめて差を取る
        let ring = null;
        try {
            ring = turf.difference(fieldPoly, inset);
        } catch (eDiff) {
            ring = null;
        }
        return ring || null;
    } catch (e) {
        console.warn('cadBuildInwardMakuraRing failed:', e);
        return null;
    }
};

/**
 * 外殻チェーン近傍の枕片を1つに結合する（段差で2・3に分かれないようにする）
 */
window.cadUnionMakuraFeaturesNearChain = (flattened, centerPt, edgeChain, maxEdgeDistM) => {
    try {
        if (!flattened || !flattened.features || !flattened.features.length) return null;
        const maxDist = (maxEdgeDistM != null && maxEdgeDistM > 0) ? maxEdgeDistM : 3;
        let edgeLine = null;
        if (edgeChain && edgeChain.length >= 2) {
            try { edgeLine = turf.lineString(edgeChain); } catch (e) { edgeLine = null; }
        }
        const near = [];
        flattened.features.forEach((feature) => {
            if (!feature || !feature.geometry) return;
            const gType = feature.geometry.type;
            if (gType !== 'Polygon' && gType !== 'MultiPolygon') return;
            let area = 0;
            try { area = turf.area(feature); } catch (eA) { area = 0; }
            if (!(area > 0.05)) return;
            let center;
            try { center = turf.center(feature); } catch (eC) { return; }
            let edgeDist = 999;
            if (edgeLine) {
                try { edgeDist = turf.pointToLineDistance(center, edgeLine, { units: 'meters' }); } catch (eD) { edgeDist = 999; }
            } else if (centerPt) {
                try { edgeDist = turf.distance(center, centerPt, { units: 'meters' }); } catch (eD2) { edgeDist = 999; }
            }
            if (edgeDist <= maxDist) near.push(feature);
        });
        if (!near.length) return null;
        if (near.length === 1) return near[0];

        // 角でわずかに隙間が空いてもつながるよう、ごく薄く膨らませてから結合
        const grown = near.map((f) => {
            try {
                return turf.buffer(f, 0.12, { units: 'meters' }) || f;
            } catch (eB) {
                return f;
            }
        });

        let united = grown[0];
        for (let i = 1; i < grown.length; i++) {
            try {
                const u = turf.union(united, grown[i]);
                if (u) united = u;
            } catch (eU) {}
        }
        if (united && united.geometry && united.geometry.type === 'MultiPolygon') {
            try {
                const flatU = turf.flatten(united);
                // まだ分かれる場合は面積最大（呼び出し側で連続帯へフォールバック可）
                return window.cadPickBestMakuraFeature(flatU, centerPt, edgeChain, maxDist) || united;
            } catch (eF) {
                return united;
            }
        }
        return united;
    } catch (e) {
        console.warn('cadUnionMakuraFeaturesNearChain failed:', e);
        return null;
    }
};

/**
 * 旧: 左右延伸補正。L字・段差を直線帯で潰してしまうため、外殻追随では使わない。
 * 互換のため残し、渡されたポリゴンをそのまま返す。
 */
window.cadStretchMakuraToFieldSides = (makuraPoly) => {
    return makuraPoly;
};

window.cadExecuteAddMakura = (latLng) => {
    let centerPt = turf.point([latLng.lng(), latLng.lat()]);

    const angleEl = document.getElementById('cadAngle');
    const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;

    // 枕畝の太さ = 地図上の畝幅（なければ基準畝幅）
    let actualWidthM = window.getCadReferenceRidgeWidthMeters();
    if (!actualWidthM || actualWidthM <= 0) actualWidthM = 1.5;

    const p = loadedPolygons[window.cadTargetId];
    if (!p || !p.coords || p.coords.length < 3) return;
    let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([coords[0][0], coords[0][1]]);
    }
    const tPoly = turf.polygon([coords]);

    // --- 外殻追随: 内向き一定幅リング × タップ辺チェーン（直角段差も回り込み、1本に連結） ---
    let continuousStrip = null;
    let finalPoly = null;
    let usedEdgeChain = null;
    const edgeInfo = window.cadFindBoundaryEdgeChainNearPoint(coords, centerPt, 100, actualWidthM);
    if (edgeInfo && edgeInfo.chain && edgeInfo.chain.length >= 2) {
        try {
            usedEdgeChain = edgeInfo.chain;
            const ring = window.cadBuildInwardMakuraRing(tPoly, actualWidthM);
            let edgeLine = turf.lineString(edgeInfo.chain);
            // 角まわりの取りこぼし防止で両端を少し延長し、畝幅より広めにマスク
            edgeLine = window.cadExtendLineStringEnds(edgeLine, Math.max(actualWidthM * 2, 4));
            const mask = turf.buffer(edgeLine, Math.max(actualWidthM * 1.65, 2), { units: 'meters' });
            if (ring && mask) {
                const masked = turf.intersect(ring, mask);
                if (masked) {
                    continuousStrip = turf.intersect(tPoly, masked) || masked;
                    finalPoly = continuousStrip;
                }
            }
            // 内向きリングが取れない場合のフォールバック: 辺ごと内向き矩形を結合
            if (!finalPoly) {
                const edgeIndexes = edgeInfo.edgeIndexes || [];
                let unionStrip = null;
                const indexes = edgeIndexes.length ? edgeIndexes : [];
                if (!indexes.length) {
                    // chain だけある場合は連続点から辺を復元せずバッファ交差へ
                    let line = turf.lineString(edgeInfo.chain);
                    line = window.cadExtendLineStringEnds(line, Math.max(actualWidthM * 2, 4));
                    const strip = turf.buffer(line, actualWidthM, { units: 'meters' });
                    if (strip) unionStrip = turf.intersect(tPoly, strip);
                } else {
                    indexes.forEach((ei) => {
                        const info = window.cadRingEdgeInfo(coords, ei);
                        if (!info || info.len < 0.15) return;
                        // 辺を内向き（圃場重心側）に幅ぶんオフセットした帯
                        const mid = turf.midpoint(turf.point(info.a), turf.point(info.b));
                        const fieldCenter = turf.center(tPoly);
                        const toCenter = turf.bearing(mid, fieldCenter);
                        // 辺の左右どちらが内側か: 法線2方向のうち重心に近い方
                        const left = (info.bearing + 90) % 360;
                        const right = (info.bearing + 270) % 360;
                        const inward = (window.cadBearingDiff(left, toCenter) <= window.cadBearingDiff(right, toCenter)) ? left : right;
                        let seg = turf.lineString([info.a, info.b]);
                        seg = window.cadExtendLineStringEnds(seg, Math.max(actualWidthM * 0.6, 0.8));
                        // 中心線を内側に半幅ずらしてから半幅バッファ → ほぼ内向きの帯
                        const shift = turf.destination(mid, actualWidthM / 2, inward, { units: 'meters' });
                        const dx = shift.geometry.coordinates[0] - mid.geometry.coordinates[0];
                        const dy = shift.geometry.coordinates[1] - mid.geometry.coordinates[1];
                        const shifted = turf.lineString(seg.geometry.coordinates.map(c => [c[0] + dx, c[1] + dy]));
                        const strip = turf.buffer(shifted, actualWidthM / 2 + 0.08, { units: 'meters' });
                        if (!strip) return;
                        const clipped = turf.intersect(tPoly, strip);
                        if (!clipped) return;
                        if (!unionStrip) unionStrip = clipped;
                        else {
                            try {
                                const u = turf.union(unionStrip, clipped);
                                if (u) unionStrip = u;
                            } catch (eU) {}
                        }
                    });
                }
                if (unionStrip) {
                    continuousStrip = unionStrip;
                    finalPoly = unionStrip;
                }
            }
        } catch (e) {
            console.warn('外殻追随枕畝の生成に失敗、直線帯にフォールバック:', e);
            finalPoly = null;
            continuousStrip = null;
        }
    }

    // フォールバック: 従来の主畝直角の直線帯
    if (!finalPoly) {
        let makuraAngle = angle + 90;
        let pt1 = turf.destination(centerPt, 1000, makuraAngle + 180, { units: 'meters' });
        let pt2 = turf.destination(centerPt, 1000, makuraAngle, { units: 'meters' });
        let c1 = turf.destination(pt1, actualWidthM / 2, makuraAngle + 90, { units: 'meters' }).geometry.coordinates;
        let c2 = turf.destination(pt1, actualWidthM / 2, makuraAngle - 90, { units: 'meters' }).geometry.coordinates;
        let c3 = turf.destination(pt2, actualWidthM / 2, makuraAngle - 90, { units: 'meters' }).geometry.coordinates;
        let c4 = turf.destination(pt2, actualWidthM / 2, makuraAngle + 90, { units: 'meters' }).geometry.coordinates;
        let makuraRect = turf.polygon([[c1, c2, c3, c4, c1]]);
        try {
            finalPoly = turf.intersect(tPoly, makuraRect);
            continuousStrip = finalPoly;
        } catch (e) { console.error(e); }
    }

    if (!finalPoly) {
        alert("圃場の外にタップされたか、枕畝を生成できません。\n外殻の辺の近くをタップしてください。");
        return;
    }

    let avoidPolys = window.cadUnePolygons.map(poly => {
        let path = poly.getPath().getArray();
        let ring = path.map(pt => [pt.lng(), pt.lat()]);
        if (ring.length > 2) {
            if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
                ring.push([ring[0][0], ring[0][1]]);
            }
            let t = turf.polygon([ring]);
            // 枕の左右端まで残すため、重なり回避バッファは小さめに
            return turf.buffer(t, 0.05 / 1000, { units: 'kilometers' });
        }
        return null;
    }).filter(Boolean);

    // 主畝との差を取る（先端が食い込むと複数片に割れることがある）
    let differenced = finalPoly;
    for (let av of avoidPolys) {
        if (!differenced) break;
        try {
            differenced = turf.difference(differenced, av);
        } catch (e) { console.error(e); }
    }

    // 外殻に沿った近傍片をすべて結合して1本にする（段差で2・3に分けない）
    const pickMaxDist = Math.max(actualWidthM * 2.2, 3.5);
    let chosenFeature = null;
    if (differenced) {
        const flatDiff = turf.flatten(differenced);
        chosenFeature = window.cadUnionMakuraFeaturesNearChain(flatDiff, centerPt, usedEdgeChain, pickMaxDist)
            || window.cadPickBestMakuraFeature(flatDiff, centerPt, usedEdgeChain, pickMaxDist);
    }
    // 割れ・消失時は連続帯を結合して使う
    if (!chosenFeature && continuousStrip) {
        const flatCont = turf.flatten(continuousStrip);
        chosenFeature = window.cadUnionMakuraFeaturesNearChain(flatCont, centerPt, usedEdgeChain, pickMaxDist)
            || window.cadPickBestMakuraFeature(flatCont, centerPt, usedEdgeChain, pickMaxDist)
            || (flatCont.features && flatCont.features[0]) || null;
    }

    if (!chosenFeature) {
        alert("既存の畝と完全に重なっているため、枕畝を生成するスペースがありません。");
        return;
    }

    // 結合時の微小バッファ分を圃場内へ戻す
    try {
        const clippedChosen = turf.intersect(tPoly, chosenFeature);
        if (clippedChosen) chosenFeature = clippedChosen;
    } catch (eClip) {}

    let coordinates = chosenFeature.geometry.coordinates;
    if (!coordinates || coordinates.length === 0) {
        alert("枕畝を生成できるスペースがありませんでした。");
        return;
    }
    // Polygon / 穴あきに対応。MultiPolygon なら薄く膨らませて再結合を試し、だめなら最大面
    if (chosenFeature.geometry.type === 'MultiPolygon') {
        try {
            const flatM = turf.flatten(chosenFeature);
            const remerged = window.cadUnionMakuraFeaturesNearChain(flatM, centerPt, usedEdgeChain, pickMaxDist);
            if (remerged && remerged.geometry && remerged.geometry.type === 'Polygon') {
                chosenFeature = remerged;
                coordinates = chosenFeature.geometry.coordinates;
            }
        } catch (eRemerge) {}
    }
    if (chosenFeature.geometry.type === 'MultiPolygon') {
        let bestRingSet = null;
        let bestArea = -1;
        coordinates.forEach((polyCoords) => {
            try {
                const a = turf.area(turf.polygon(polyCoords));
                if (a > bestArea) { bestArea = a; bestRingSet = polyCoords; }
            } catch (e) {}
        });
        coordinates = bestRingSet || coordinates[0];
    }
    let paths = coordinates.map(ring => ring.map(c => ({ lat: c[1], lng: c[0] })));

    let gPoly = window.cadCreateRidgePolygon(paths, { fillColor: '#8BC34A' });
    gPoly.uneIndex = 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    gPoly.uneGroup = '枕';
    gPoly.cadMakuraFollowEdge = true;
    window.bindShapeHistoryEvents(gPoly);
    window.cadCustomShapes.push(gPoly);

    window.reassignLabels();
    window.saveCadStateToHistory();
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = '枕畝を外殻に沿って1本生成しました（段差も回り込んで接続）';
        msgEl.style.color = '#ea580c';
    }
};

window.cadAdjustRidgeGap = (delta) => {
    const scaleFactor = 1 + delta;
    if (scaleFactor <= 0) return;

    let targetPolygons = [...window.cadUnePolygons, ...window.cadCustomShapes];
    if (targetPolygons.length === 0) {
        alert("先に畝を生成するか、追加してください。");
        return;
    }

    const angleEl = document.getElementById('cadAngle');
    const L = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;
    const Lrad = L * Math.PI / 180;
    const cosL = Math.cos(Lrad);
    const sinL = Math.sin(Lrad);
    const METERS_PER_DEG_LAT = 111320;

    // 頂点ごとの set_at → 全畝SVG更新の連鎖を止め、平面近似で一括変形する
    window.cadSuppressPathEvents = true;
    try {
        for (let p = 0; p < targetPolygons.length; p++) {
            const path = targetPolygons[p].getPath();
            const len = path.getLength();
            if (len === 0) continue;

            let sumLat = 0, sumLng = 0;
            const lats = new Array(len);
            const lngs = new Array(len);
            for (let i = 0; i < len; i++) {
                const pt = path.getAt(i);
                lats[i] = pt.lat();
                lngs[i] = pt.lng();
                sumLat += lats[i];
                sumLng += lngs[i];
            }
            const cLat = sumLat / len;
            const cLng = sumLng / len;
            const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(cLat * Math.PI / 180) || METERS_PER_DEG_LAT;

            for (let i = 0; i < len; i++) {
                const dx = (lngs[i] - cLng) * metersPerDegLng; // east (m)
                const dy = (lats[i] - cLat) * METERS_PER_DEG_LAT; // north (m)
                const dL = dx * sinL + dy * cosL;
                const dW = dx * cosL - dy * sinL;
                const new_dW = dW * scaleFactor;
                const new_dx = dL * sinL + new_dW * cosL;
                const new_dy = dL * cosL - new_dW * sinL;
                path.setAt(i, new google.maps.LatLng(
                    cLat + new_dy / METERS_PER_DEG_LAT,
                    cLng + new_dx / metersPerDegLng
                ));
            }
        }
    } finally {
        window.cadSuppressPathEvents = false;
    }

    // 番号の付け直しは不要。位置だけ更新してからSVG/履歴を1回だけ反映
    for (let p = 0; p < targetPolygons.length; p++) {
        if (typeof window.updateSingleLabelPosition === 'function') {
            window.updateSingleLabelPosition(targetPolygons[p]);
        }
    }
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
};

/**
 * 圃場の途中から畝を立てる（既存畝に追加）
 * - 起点: タップ / GPS
 * - 左右: 畝の長手方向を見て左(angle-90) / 右(angle+90)
 * - 終点(任意): 長手方向の「途中〜途中」長さ制限
 */
window.cadPartialStart = null;
window.cadPartialEnd = null;
window.cadPartialDir = 'right';
window.cadPartialStartMarker = null;
window.cadPartialEndMarker = null;

window.cadBeginPartialPoint = (which) => {
    const mode = which === 'end' ? 'partial_end' : 'partial_start';
    window.cadPinMode = mode;
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = which === 'end'
            ? '【終点】畝の長さの終わり付近をタップ（途中〜途中）。不要なら置かなくてOKです。'
            : '【起点】畝を並べ始める位置をタップ（またはGPS起点を使用）';
        msgEl.style.color = '#FFB74D';
    }
};

window.cadSetPartialDir = (dir) => {
    if (dir !== 'left' && dir !== 'right' && dir !== 'both') return;
    window.cadPartialDir = dir;
    const styleBtn = (id, active) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (active) {
            el.style.background = '#4CAF50';
            el.style.border = '1px solid #4CAF50';
            el.style.color = '#fff';
        } else {
            el.style.background = '#333';
            el.style.border = '1px solid #666';
            el.style.color = '#fff';
        }
    };
    styleBtn('cadPartialDirLeft', dir === 'left');
    styleBtn('cadPartialDirRight', dir === 'right');
    styleBtn('cadPartialDirBoth', dir === 'both');
    window.cadUpdatePartialStatus();
};

window.cadUpdatePartialStatus = () => {
    const el = document.getElementById('cadPartialStatus');
    if (!el) return;
    const fmt = (p) => (p ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : '未設定');
    const dirLabel = window.cadPartialDir === 'left' ? '左へ'
        : (window.cadPartialDir === 'both' ? '両側' : '右へ');
    const startTxt = window.cadPartialStart ? '起点OK' : '起点未設定';
    const endTxt = window.cadPartialEnd ? '／終点あり（途中〜途中）' : '／終点なし（圃場端まで）';
    el.innerText = `${startTxt}${endTxt} ／ 方向:${dirLabel}`;
    el.title = `起点: ${fmt(window.cadPartialStart)} / 終点: ${fmt(window.cadPartialEnd)}`;
};

window.cadUpsertPartialMarker = (which, lat, lng) => {
    if (!window.cadMap || typeof google === 'undefined' || !google.maps) return;
    const isStart = which === 'start';
    const key = isStart ? 'cadPartialStartMarker' : 'cadPartialEndMarker';
    const color = isStart ? '#1565C0' : '#EF6C00';
    const label = isStart ? '起' : '終';
    const pos = new google.maps.LatLng(lat, lng);
    if (window[key]) {
        window[key].setPosition(pos);
        window[key].setMap(window.cadMap);
        return;
    }
    window[key] = new google.maps.Marker({
        position: pos,
        map: window.cadMap,
        title: isStart ? '途中生成の起点' : '途中生成の終点',
        label: { text: label, color: '#fff', fontWeight: 'bold', fontSize: '11px' },
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2
        },
        zIndex: 999
    });
};

window.cadSetPartialPoint = (which, latLng) => {
    if (!latLng) return;
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : parseFloat(latLng.lat);
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : parseFloat(latLng.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;
    const pt = { lat: lat, lng: lng };
    if (which === 'end') {
        window.cadPartialEnd = pt;
        window.cadUpsertPartialMarker('end', lat, lng);
    } else {
        window.cadPartialStart = pt;
        window.cadUpsertPartialMarker('start', lat, lng);
    }
    window.cadUpdatePartialStatus();
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
};

window.cadSetPartialPointFromGps = (which) => {
    // 互換: 旧ワンショット呼び出し → 連続測位へ
    window.cadStartPartialGps(which);
};

window.cadStartPartialGps = (which) => {
    const target = which === 'end' ? 'end' : 'start';
    const purpose = target === 'end' ? 'partial_end' : 'partial_start';
    const ok = window.cadStartPurposeGpsWatch(
        purpose,
        `${target === 'end' ? '終点' : '起点'}のGPS測位中… 屋外で少し待ってから「ここに置く」`
    );
    if (!ok) return;
    if (typeof switchCadTab === 'function') {
        try { switchCadTab(1); } catch (e) {}
    }
};

window.cadConfirmPartialGps = () => {
    if (!window.cadGpsLastPos) {
        alert('まだ現在地を取得できていません。少し待ってから再度お試しください。');
        return;
    }
    const purpose = window.cadGpsPurpose;
    if (purpose !== 'partial_start' && purpose !== 'partial_end') {
        alert('起点または終点のGPS測位を開始してください。');
        return;
    }
    const acc = Math.round(window.cadGpsLastPos.accuracy || 999);
    if (acc > 15) {
        if (!confirm(`現在の精度は ±${acc}m です。\nこのまま置きますか？`)) return;
    }
    const which = purpose === 'partial_end' ? 'end' : 'start';
    const latLng = new google.maps.LatLng(window.cadGpsLastPos.lat, window.cadGpsLastPos.lng);
    window.cadSetPartialPoint(which, latLng);
    window.cadStopGpsPinPlace({ silent: true });
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = `${which === 'end' ? '終点' : '起点'}をGPSで設定しました（精度 約${acc}m）`;
        msgEl.style.color = '#FFB74D';
    }
};

window.cadCancelPartialGps = () => {
    window.cadStopGpsPinPlace({ silent: true });
    window.cadUpdatePartialStatus();
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = 'GPS測位を取り消しました。';
        msgEl.style.color = '#FFB74D';
    }
};

window.cadClearPartialPoints = (silent) => {
    window.cadPartialStart = null;
    window.cadPartialEnd = null;
    if (window.cadPartialStartMarker) {
        window.cadPartialStartMarker.setMap(null);
        window.cadPartialStartMarker = null;
    }
    if (window.cadPartialEndMarker) {
        window.cadPartialEndMarker.setMap(null);
        window.cadPartialEndMarker = null;
    }
    if (window.cadPinMode === 'partial_start' || window.cadPinMode === 'partial_end') {
        window.cadPinMode = null;
    }
    window.cadUpdatePartialStatus();
    if (!silent) {
        const msgEl = document.getElementById('cadPinModeMsg');
        if (msgEl) {
            msgEl.innerText = '起点・終点をクリアしました。';
            msgEl.style.color = '#FFB74D';
        }
    }
};

// ===== 4点囲み → N分割畝 =====
window.cadQuadNextEmptyIndex_ = () => {
    const arr = window.cadQuadCorners || [null, null, null, null];
    for (let i = 0; i < 4; i++) {
        if (!arr[i]) return i;
    }
    return 0;
};

window.cadBeginQuadCorner = (idx) => {
    const i = Math.max(0, Math.min(3, parseInt(idx, 10) || 0));
    if (window.cadGpsWatchId != null) window.cadStopGpsPinPlace({ silent: true });
    window.cadQuadActiveIndex = i;
    window.cadPinMode = 'quad_corner';
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = `【4点分割】角${i + 1} を地図タップ（または「GPSで次の角」）`;
        msgEl.style.color = '#81D4FA';
    }
    window.cadUpdateQuadUi_();
};

window.cadSetQuadDir = (dir) => {
    window.cadQuadDir = (dir === 'ad') ? 'ad' : 'ab';
    window.cadUpdateQuadUi_();
};

window.cadUpdateQuadUi_ = () => {
    const corners = window.cadQuadCorners || [null, null, null, null];
    const filled = corners.filter(Boolean).length;
    const status = document.getElementById('cadQuadStatus');
    if (status) {
        status.textContent = `角 ${filled}/4` + (filled === 4 ? ' → 分割数を決めて生成できます' : '（時計回りに打つと分かりやすい）');
    }
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById('cadQuadCornerBtn' + i);
        if (!btn) continue;
        const has = !!corners[i];
        const active = window.cadQuadActiveIndex === i && window.cadPinMode === 'quad_corner';
        if (active) {
            btn.style.background = '#0277BD';
            btn.style.color = '#fff';
            btn.style.border = 'none';
        } else if (has) {
            btn.style.background = '#2E7D32';
            btn.style.color = '#fff';
            btn.style.border = 'none';
        } else {
            btn.style.background = '#333';
            btn.style.color = '#ccc';
            btn.style.border = '1px solid #666';
        }
        btn.textContent = has ? ('角' + (i + 1) + '✓') : ('角' + (i + 1));
    }
    const ab = document.getElementById('cadQuadDirAb');
    const ad = document.getElementById('cadQuadDirAd');
    const isAb = window.cadQuadDir !== 'ad';
    if (ab) {
        ab.style.background = isAb ? '#0277BD' : '#333';
        ab.style.border = isAb ? '1px solid #0277BD' : '1px solid #666';
        ab.style.color = isAb ? '#fff' : '#ccc';
    }
    if (ad) {
        ad.style.background = !isAb ? '#0277BD' : '#333';
        ad.style.border = !isAb ? '1px solid #0277BD' : '1px solid #666';
        ad.style.color = !isAb ? '#fff' : '#ccc';
    }
};

window.cadUpsertQuadMarker_ = (idx, lat, lng) => {
    if (!window.cadMap || typeof google === 'undefined' || !google.maps) return;
    if (!window.cadQuadMarkers) window.cadQuadMarkers = [null, null, null, null];
    const colors = ['#0277BD', '#00838F', '#00695C', '#558B2F'];
    const pos = new google.maps.LatLng(lat, lng);
    if (window.cadQuadMarkers[idx]) {
        window.cadQuadMarkers[idx].setPosition(pos);
        window.cadQuadMarkers[idx].setMap(window.cadMap);
        return;
    }
    window.cadQuadMarkers[idx] = new google.maps.Marker({
        position: pos,
        map: window.cadMap,
        title: '分割範囲の角' + (idx + 1),
        label: { text: String(idx + 1), color: '#fff', fontWeight: 'bold', fontSize: '11px' },
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: colors[idx] || '#0277BD',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2
        },
        zIndex: 998
    });
};

window.cadUpdateQuadPreview_ = () => {
    const corners = (window.cadQuadCorners || []).filter(Boolean);
    if (window.cadQuadPreviewPoly) {
        window.cadQuadPreviewPoly.setMap(null);
        window.cadQuadPreviewPoly = null;
    }
    if (corners.length < 2 || !window.cadMap || typeof google === 'undefined') return;
    const path = corners.map(c => ({ lat: c.lat, lng: c.lng }));
    if (corners.length >= 3) path.push({ lat: corners[0].lat, lng: corners[0].lng });
    window.cadQuadPreviewPoly = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: '#29B6F6',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        map: window.cadMap,
        zIndex: 50,
        clickable: false
    });
};

window.cadSetQuadCorner = (idx, latLng, opts) => {
    opts = opts || {};
    if (!latLng) return;
    const i = Math.max(0, Math.min(3, parseInt(idx, 10) || 0));
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : parseFloat(latLng.lat);
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : parseFloat(latLng.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;

    // 圃場内チェック
    if (window.cadTargetId && typeof turf !== 'undefined' && loadedPolygons[window.cadTargetId]) {
        const p = loadedPolygons[window.cadTargetId];
        if (p && p.coords && p.coords.length >= 3) {
            let coords = p.coords.map(pt => [
                typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng),
                typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)
            ]);
            if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
                coords.push([coords[0][0], coords[0][1]]);
            }
            try {
                if (!turf.booleanPointInPolygon(turf.point([lng, lat]), turf.polygon([coords]))) {
                    alert(opts.fromGps
                        ? '現在地が圃場の外側です。圃場内に立ってから打ってください。'
                        : '圃場の内側をタップしてください。');
                    return;
                }
            } catch (e) {}
        }
    }

    if (!window.cadQuadCorners) window.cadQuadCorners = [null, null, null, null];
    window.cadQuadCorners[i] = { lat: lat, lng: lng };
    window.cadUpsertQuadMarker_(i, lat, lng);
    window.cadUpdateQuadPreview_();

    // 次の空き角へ自動移動
    let next = -1;
    for (let j = 0; j < 4; j++) {
        if (!window.cadQuadCorners[j]) { next = j; break; }
    }
    if (window.cadGpsWatchId != null && window.cadGpsPurpose === 'quad_corner') {
        window.cadStopGpsPinPlace({ silent: true });
    }
    const msgEl = document.getElementById('cadPinModeMsg');
    if (next >= 0) {
        window.cadQuadActiveIndex = next;
        window.cadPinMode = 'quad_corner'; // 連続タップで次の角を打てる
        if (msgEl) {
            msgEl.innerText = `角${i + 1} を設定。次は角${next + 1}（タップまたはGPS）`;
            msgEl.style.color = '#81D4FA';
        }
    } else {
        window.cadQuadActiveIndex = 0;
        window.cadPinMode = null;
        if (msgEl) {
            msgEl.innerText = '4点が揃いました。分割数を決めて「分割して畝生成」を押してください。';
            msgEl.style.color = '#81D4FA';
        }
    }
    window.cadUpdateQuadUi_();
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
};

window.cadStartQuadGps = () => {
    const idx = window.cadQuadNextEmptyIndex_();
    window.cadQuadActiveIndex = idx;
    window.cadPinMode = 'quad_corner';
    const ok = window.cadStartPurposeGpsWatch(
        'quad_corner',
        `【角${idx + 1}】GPS測位中… 角の位置に立って「ここに角を打つ」`
    );
    if (!ok) return;
    window.cadUpdateQuadUi_();
    if (typeof switchCadTab === 'function') {
        try { switchCadTab(1); } catch (e) {}
    }
};

window.cadConfirmQuadGps = () => {
    if (!window.cadGpsLastPos) {
        alert('まだ現在地を取得できていません。少し待ってから再度お試しください。');
        return;
    }
    const acc = Math.round(window.cadGpsLastPos.accuracy || 999);
    if (acc > 15) {
        if (!confirm(`現在の精度は ±${acc}m です。\nこのまま角を打ちますか？`)) return;
    }
    const idx = window.cadQuadActiveIndex != null ? window.cadQuadActiveIndex : window.cadQuadNextEmptyIndex_();
    const latLng = new google.maps.LatLng(window.cadGpsLastPos.lat, window.cadGpsLastPos.lng);
    window.cadSetQuadCorner(idx, latLng, { fromGps: true });
};

window.cadClearQuadCorners = (silent) => {
    window.cadQuadCorners = [null, null, null, null];
    (window.cadQuadMarkers || []).forEach((m, i) => {
        if (m) { try { m.setMap(null); } catch (e) {} }
        if (window.cadQuadMarkers) window.cadQuadMarkers[i] = null;
    });
    if (window.cadQuadPreviewPoly) {
        window.cadQuadPreviewPoly.setMap(null);
        window.cadQuadPreviewPoly = null;
    }
    window.cadQuadActiveIndex = 0;
    if (window.cadPinMode === 'quad_corner') window.cadPinMode = null;
    if (window.cadGpsPurpose === 'quad_corner') window.cadStopGpsPinPlace({ silent: true });
    window.cadUpdateQuadUi_();
    if (!silent) {
        const msgEl = document.getElementById('cadPinModeMsg');
        if (msgEl) {
            msgEl.innerText = '4点をクリアしました。';
            msgEl.style.color = '#81D4FA';
        }
    }
};

window.cadLerpLngLat_ = (a, b, t) => {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t
    ];
};

/**
 * 4点四角形をN分割して畝を追加生成
 * 角は時計回り推奨。畝方向: ab=辺1→2に平行 / ad=辺1→4に平行
 */
window.cadGenerateQuadStripLines = () => {
    try {
        if (!window.cadTargetId) return;
        const corners = window.cadQuadCorners || [];
        if (corners.filter(Boolean).length < 4) {
            alert('先に4つの角をすべて打ってください（タップまたはGPS）。');
            return;
        }
        const countEl = document.getElementById('cadQuadSplitCount');
        let n = countEl && countEl.value ? parseInt(countEl.value, 10) : 0;
        if (isNaN(n) || n < 1) {
            alert('分割数を1以上にしてください。');
            return;
        }
        if (n > 200) {
            alert('分割数は200以下にしてください。');
            return;
        }

        const p = loadedPolygons[window.cadTargetId];
        if (!p || !p.coords || p.coords.length < 3) return;

        let fieldCoords = p.coords.map(pt => [
            typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng),
            typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)
        ]);
        if (fieldCoords[0][0] !== fieldCoords[fieldCoords.length - 1][0]
            || fieldCoords[0][1] !== fieldCoords[fieldCoords.length - 1][1]) {
            fieldCoords.push([fieldCoords[0][0], fieldCoords[0][1]]);
        }
        const fieldPoly = turf.polygon([fieldCoords]);

        // 角: 入力順 A B C D（時計回り想定）
        const A = [corners[0].lng, corners[0].lat];
        const B = [corners[1].lng, corners[1].lat];
        const C = [corners[2].lng, corners[2].lat];
        const D = [corners[3].lng, corners[3].lat];

        let quadPoly = null;
        try {
            quadPoly = turf.polygon([[A, B, C, D, A]]);
            const area = Math.abs(turf.area(quadPoly));
            if (!(area > 0.5)) {
                alert('4点の面積が小さすぎます。角を広げて打ち直してください。');
                return;
            }
        } catch (e) {
            alert('4点が四角形になりません。時計回りに打ち直してください。');
            return;
        }

        let clipPoly = null;
        try {
            clipPoly = turf.intersect(fieldPoly, quadPoly);
        } catch (e) {
            clipPoly = quadPoly;
        }
        if (!clipPoly) {
            alert('指定範囲が圃場と重なっていません。');
            return;
        }

        const dir = window.cadQuadDir === 'ad' ? 'ad' : 'ab';
        // ab: 畝が AB に平行 → 反対辺 AD と BC を補間
        // ad: 畝が AD に平行 → 反対辺 AB と DC を補間
        let e0a, e0b, e1a, e1b, ridgeBearingFrom, ridgeBearingTo;
        if (dir === 'ad') {
            e0a = A; e0b = B;
            e1a = D; e1b = C;
            ridgeBearingFrom = A;
            ridgeBearingTo = D;
        } else {
            e0a = A; e0b = D;
            e1a = B; e1b = C;
            ridgeBearingFrom = A;
            ridgeBearingTo = B;
        }

        // 畝角度を UI に反映
        try {
            const bearing = turf.bearing(turf.point(ridgeBearingFrom), turf.point(ridgeBearingTo));
            const angleEl = document.getElementById('cadAngle');
            if (angleEl) angleEl.value = String(Math.round(((bearing % 360) + 360) % 360));
        } catch (e) {}

        const gapRatio = typeof window.cadRidgeGapRatio !== 'undefined' ? window.cadRidgeGapRatio : 0.2;
        const fill = Math.max(0.5, Math.min(1, 1 - gapRatio));

        let startIdx = 0;
        (window.cadUnePolygons || []).forEach(poly => {
            if (poly && poly.uneIndex && String(poly.uneIndex).indexOf('une_') === 0) {
                const nIdx = parseInt(String(poly.uneIndex).replace('une_', ''), 10);
                if (!isNaN(nIdx) && nIdx >= startIdx) startIdx = nIdx + 1;
            }
        });

        let successCount = 0;
        for (let i = 0; i < n; i++) {
            const t0 = i / n;
            const t1 = (i + 1) / n;
            const mid = (t0 + t1) / 2;
            const half = ((t1 - t0) / 2) * fill;
            const u0 = Math.max(0, mid - half);
            const u1 = Math.min(1, mid + half);

            const p00 = window.cadLerpLngLat_(e0a, e0b, u0);
            const p01 = window.cadLerpLngLat_(e0a, e0b, u1);
            const p10 = window.cadLerpLngLat_(e1a, e1b, u0);
            const p11 = window.cadLerpLngLat_(e1a, e1b, u1);

            let strip = null;
            try {
                strip = turf.polygon([[p00, p01, p11, p10, p00]]);
            } catch (e) {
                continue;
            }

            let finalPoly = null;
            try {
                finalPoly = turf.intersect(clipPoly, strip);
            } catch (e) {
                finalPoly = strip;
            }
            if (!finalPoly) continue;

            let flattened;
            try {
                flattened = turf.flatten(finalPoly);
            } catch (e) {
                flattened = { features: [finalPoly] };
            }

            (flattened.features || []).forEach(feature => {
                if (!feature || !feature.geometry || feature.geometry.type !== 'Polygon') return;
                const ring = feature.geometry.coordinates[0];
                if (!ring || ring.length < 4) return;
                // turf coords are [lng, lat]
                addUnePolygon(ring, startIdx + successCount);
                successCount++;
            });
        }

        window.reassignLabels();
        window.saveCadStateToHistory();
        window.cadSvgNeedsRebuild = true;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();

        if (successCount === 0) {
            alert('畝が生成できませんでした。角の順序や分割数を確認してください。');
        } else {
            const msgEl = document.getElementById('cadPinModeMsg');
            if (msgEl) {
                msgEl.innerText = `4点範囲から ${successCount} 本の畝を生成しました。`;
                msgEl.style.color = '#81D4FA';
            }
            const mode1El = document.getElementById('cadMode1');
            if (mode1El && mode1El.style.display === 'block') {
                try { switchCadTab(2); } catch (e) {}
            }
        }
    } catch (err) {
        alert('分割畝の生成中にエラー: ' + (err && err.message ? err.message : err));
    }
};

/** スキャン線上の距離パラメータ d に投影 */
window.cadProjectOntoScanLine = (ptTurf, pt1Turf, angle) => {
    const dist = turf.distance(pt1Turf, ptTurf, { units: 'meters' });
    const bearing = turf.bearing(pt1Turf, ptTurf);
    const angleDiff = (bearing - (angle + 180)) * Math.PI / 180;
    return dist * Math.cos(angleDiff);
};

/**
 * 起点から指定方向へ、基準畝幅で畝を追加生成する
 */
window.cadGeneratePartialLines = () => {
    try {
        if (!window.cadTargetId) return;

        if (typeof window.getCadWidthCm === 'function' && !window.getCadWidthCm()) {
            alert('⚠️ 基準の畝幅を選択してください（栽培プリセットの畝間から選べます）');
            return;
        }
        if (!window.cadPartialStart) {
            alert('先に起点をタップするか「GPS起点」で位置を設定してください。');
            return;
        }

        const angleEl = document.getElementById('cadAngle');
        const countEl = document.getElementById('cadPartialCount');
        const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;
        let uneCount = countEl && countEl.value ? parseInt(countEl.value, 10) : 0;
        if (isNaN(uneCount) || uneCount <= 0) {
            alert('⚠️ 追加畝数を1以上にしてください。');
            return;
        }

        const widthCm = window.getCadWidthCm();
        const actualWidthM = widthCm / 100;
        if (!(actualWidthM > 0)) {
            alert('⚠️ 基準の畝幅が不正です。');
            return;
        }

        const p = loadedPolygons[window.cadTargetId];
        if (!p || !p.coords || p.coords.length < 3) return;

        let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push([coords[0][0], coords[0][1]]);
        }
        const tPoly = turf.polygon([coords]);
        const baseOrigin = turf.point([window.cadPartialStart.lng, window.cadPartialStart.lat]);

        // 畝の長手方向を見て右=angle+90、左=angle-90
        const dir = window.cadPartialDir || 'right';
        const growDirs = [];
        if (dir === 'left' || dir === 'both') growDirs.push(angle - 90);
        if (dir === 'right' || dir === 'both') growDirs.push(angle + 90);
        if (!growDirs.length) growDirs.push(angle + 90);

        const marginEndEl = document.getElementById('cadMarginEnd');
        const endMarginMeters = marginEndEl && marginEndEl.value ? parseFloat(marginEndEl.value) / 100 : 0;

        const bbox = turf.bbox(tPoly);
        const diagDist = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], { units: 'meters' });

        let nakamichiPolys = (window.cadNakamichiLines || []).map(line => {
            let p1lng = typeof line[0].lng === 'function' ? line[0].lng() : parseFloat(line[0].lng);
            let p1lat = typeof line[0].lat === 'function' ? line[0].lat() : parseFloat(line[0].lat);
            let p2lng = typeof line[1].lng === 'function' ? line[1].lng() : parseFloat(line[1].lng);
            let p2lat = typeof line[1].lat === 'function' ? line[1].lat() : parseFloat(line[1].lat);
            const centerLine = turf.lineString([[p1lng, p1lat], [p2lng, p2lat]]);
            return turf.buffer(centerLine, window.CAD_NAKAMICHI_HALF_WIDTH_M, { units: 'meters' });
        });
        let drainagePolys = (window.cadDrainageLines || []).map(line => {
            let p1lng = typeof line[0].lng === 'function' ? line[0].lng() : parseFloat(line[0].lng);
            let p1lat = typeof line[0].lat === 'function' ? line[0].lat() : parseFloat(line[0].lat);
            let p2lng = typeof line[1].lng === 'function' ? line[1].lng() : parseFloat(line[1].lng);
            let p2lat = typeof line[1].lat === 'function' ? line[1].lat() : parseFloat(line[1].lat);
            const centerLine = turf.lineString([[p1lng, p1lat], [p2lng, p2lat]]);
            return turf.buffer(centerLine, 0.5 / 1000, { units: 'kilometers' });
        });
        let avoidPolys = [...nakamichiPolys, ...drainagePolys];
        const obliqueSegs = window.cadCollectObliqueClearanceSegs(coords, angle, endMarginMeters);

        const lineLen = diagDist + 40;
        const ratio = typeof window.cadRidgeGapRatio !== 'undefined' ? (1 - window.cadRidgeGapRatio) : 0.8;
        const w = actualWidthM * ratio;
        let rects = [];

        // 終点がある場合の長手クリップ範囲（各畝のスキャン線ごとに計算）
        const endPtTurf = window.cadPartialEnd
            ? turf.point([window.cadPartialEnd.lng, window.cadPartialEnd.lat])
            : null;

        growDirs.forEach((growDirection) => {
            for (let i = 0; i < uneCount; i++) {
                // 起点を畝の端とし、中心は半畝幅ずつ外側へ
                const offset = actualWidthM * (i + 0.5);
                const oPt = turf.destination(baseOrigin, offset, growDirection, { units: 'meters' });
                const pt1 = turf.destination(oPt, lineLen / 2, angle, { units: 'meters' });

                let clipMin = null;
                let clipMax = null;
                if (endPtTurf) {
                    const dStart = window.cadProjectOntoScanLine(baseOrigin, pt1, angle);
                    const dEnd = window.cadProjectOntoScanLine(endPtTurf, pt1, angle);
                    clipMin = Math.min(dStart, dEnd);
                    clipMax = Math.max(dStart, dEnd);
                    // 極端に短い場合は無視
                    if (clipMax - clipMin < 1.0) {
                        clipMin = null;
                        clipMax = null;
                    }
                }

                const checkValid = (dist) => {
                    if (clipMin != null && (dist < clipMin || dist > clipMax)) return false;
                    let c = turf.destination(pt1, dist, angle + 180, { units: 'meters' });
                    // 終点指定時は端面余白を弱め、指定区間を優先
                    const useEndMargin = (clipMin != null) ? Math.min(endMarginMeters, 0.3) : endMarginMeters;
                    let c_fwd = turf.destination(c, useEndMargin, angle + 180, { units: 'meters' });
                    let c_bwd = turf.destination(c, useEndMargin, angle, { units: 'meters' });
                    let p_fwd_L = turf.destination(c_fwd, w / 2, angle + 90, { units: 'meters' });
                    let p_fwd_R = turf.destination(c_fwd, w / 2, angle - 90, { units: 'meters' });
                    let p_bwd_L = turf.destination(c_bwd, w / 2, angle + 90, { units: 'meters' });
                    let p_bwd_R = turf.destination(c_bwd, w / 2, angle - 90, { units: 'meters' });
                    let c_L = turf.destination(c, w / 2, angle + 90, { units: 'meters' });
                    let c_R = turf.destination(c, w / 2, angle - 90, { units: 'meters' });
                    let ptsToCheck = [p_fwd_L, p_fwd_R, p_bwd_L, p_bwd_R, c_L, c_R];
                    if (window.cadPointHitsObliqueSeg_(c, obliqueSegs, endMarginMeters)) return false;
                    if (window.cadPointHitsObliqueSeg_(c_L, obliqueSegs, endMarginMeters)) return false;
                    if (window.cadPointHitsObliqueSeg_(c_R, obliqueSegs, endMarginMeters)) return false;
                    for (let pt of ptsToCheck) {
                        if (!turf.booleanPointInPolygon(pt, tPoly)) return false;
                    }
                    if (avoidPolys.length > 0) {
                        for (let av of avoidPolys) {
                            for (let pt of ptsToCheck) {
                                if (turf.booleanPointInPolygon(pt, av)) return false;
                            }
                        }
                    }
                    return true;
                };

                const stepMeters = 0.5;
                let validSegments = [];
                let currentSegment = null;
                const d0 = clipMin != null ? Math.max(0, clipMin - 1) : 0;
                const d1 = clipMax != null ? Math.min(lineLen, clipMax + 1) : lineLen;

                for (let d = d0; d <= d1; d += stepMeters) {
                    let isValid = checkValid(d);
                    if (isValid) {
                        if (!currentSegment) {
                            let fine_d = d;
                            while (fine_d - 0.1 >= d - stepMeters && checkValid(fine_d - 0.1)) fine_d -= 0.1;
                            currentSegment = { start: fine_d, end: d };
                        } else {
                            currentSegment.end = d;
                        }
                    } else if (currentSegment) {
                        let fine_d = currentSegment.end;
                        while (fine_d + 0.1 <= d && checkValid(fine_d + 0.1)) fine_d += 0.1;
                        currentSegment.end = fine_d;
                        if (currentSegment.end - currentSegment.start >= 1.0) validSegments.push(currentSegment);
                        currentSegment = null;
                    }
                }
                if (currentSegment) {
                    let fine_d = currentSegment.end;
                    while (fine_d + 0.1 <= d1 && checkValid(fine_d + 0.1)) fine_d += 0.1;
                    currentSegment.end = fine_d;
                    if (currentSegment.end - currentSegment.start >= 1.0) validSegments.push(currentSegment);
                }

                // 終点あり: 区間内にクリップ
                if (clipMin != null) {
                    validSegments = validSegments.map(seg => ({
                        start: Math.max(seg.start, clipMin),
                        end: Math.min(seg.end, clipMax)
                    })).filter(seg => seg.end - seg.start >= 1.0);
                }

                validSegments.forEach(seg => {
                    let sPt = turf.destination(pt1, seg.start, angle + 180, { units: 'meters' });
                    let ePt = turf.destination(pt1, seg.end, angle + 180, { units: 'meters' });
                    let p1c = turf.destination(sPt, w / 2, angle + 90, { units: 'meters' }).geometry.coordinates;
                    let p2c = turf.destination(sPt, w / 2, angle - 90, { units: 'meters' }).geometry.coordinates;
                    let p3c = turf.destination(ePt, w / 2, angle - 90, { units: 'meters' }).geometry.coordinates;
                    let p4c = turf.destination(ePt, w / 2, angle + 90, { units: 'meters' }).geometry.coordinates;
                    rects.push(turf.polygon([[p1c, p2c, p3c, p4c, p1c]]));
                });
            }
        });

        let successCount = 0;
        let polyIndex = (window.cadUnePolygons ? window.cadUnePolygons.length : 0) + 1;
        rects.forEach(rect => {
            addUnePolygon(rect.geometry.coordinates[0], polyIndex++);
            successCount++;
        });

        if (typeof window.reassignLabels === 'function') window.reassignLabels();
        if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
        window.cadSvgNeedsRebuild = true;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();

        if (successCount === 0) {
            alert('⚠️ この位置・方向では畝を生成できませんでした。起点・左右・畝幅を確認してください。');
        } else {
            const msgEl = document.getElementById('cadPinModeMsg');
            if (msgEl) {
                msgEl.innerText = `途中から ${successCount} 本の畝を追加しました（既存畝は残しています）`;
                msgEl.style.color = '#FFB74D';
            }
            const mode1El = document.getElementById('cadMode1');
            if (mode1El && mode1El.style.display === 'block' && typeof switchCadTab === 'function') {
                switchCadTab(2);
            }
        }
    } catch (globalError) {
        alert('❌ 途中生成中にエラーが発生しました:\n' + globalError.message);
    }
};

/** 点から線分までの距離（メートル） */
window.cadPointSegDistM_ = (lng, lat, a, b) => {
    const midLat = ((lat + a[1] + b[1]) / 3) * Math.PI / 180;
    const kx = 111320 * Math.cos(midLat);
    const ky = 110540;
    const ax = a[0] * kx, ay = a[1] * ky;
    const bx = b[0] * kx, by = b[1] * ky;
    const px = lng * kx, py = lat * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 1e-6) t = ((px - ax) * dx + (py - ay) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

window.cadPointHitsObliqueSeg_ = (pt, segs, gapM) => {
    if (!segs || !segs.length || !(gapM > 0.05) || !pt) return false;
    const c = pt.geometry && pt.geometry.coordinates ? pt.geometry.coordinates : pt;
    if (!c || c.length < 2) return false;
    for (let i = 0; i < segs.length; i++) {
        if (window.cadPointSegDistM_(c[0], c[1], segs[i][0], segs[i][1]) < gapM) return true;
    }
    return false;
};

/** 畝とほぼ平行な境界。側面の余白は、この辺から畝の横までの距離 */
window.cadCollectSideClearanceSegs_ = (ringCoords, ridgeAngleDeg) => {
    if (!ringCoords || typeof turf === 'undefined') return [];
    const n = window.cadRingVertexCount(ringCoords);
    const align = (a, b) => {
        const diff = window.cadBearingDiff(a, b);
        return Math.min(diff, Math.abs(180 - diff));
    };
    const segs = [];
    for (let i = 0; i < n; i++) {
        const info = window.cadRingEdgeInfo(ringCoords, i);
        if (!info || info.len < 2.5) continue;
        if (align(info.bearing, ridgeAngleDeg) > 12) continue;
        segs.push([info.a, info.b]);
    }
    return segs;
};

/**
 * 端面の余白は、畝の上下（長手の端と、そこを斜めに切る境界）にかける。
 * 畝と平行な左右の辺は側面なので、ここでは扱わない。
 */
window.cadCollectObliqueClearanceSegs = (ringCoords, ridgeAngleDeg, gapM) => {
    const gap = Number(gapM) || 0;
    if (!(gap > 0.05) || !ringCoords || typeof turf === 'undefined') return [];
    const n = window.cadRingVertexCount(ringCoords);
    if (n < 3) return [];
    const align = (a, b) => {
        const diff = window.cadBearingDiff(a, b);
        return Math.min(diff, Math.abs(180 - diff));
    };
    const infos = [];
    for (let i = 0; i < n; i++) {
        const info = window.cadRingEdgeInfo(ringCoords, i);
        infos.push(info && info.len > 0.05 ? info : null);
    }
    const segs = [];
    const used = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
        if (used[i] || !infos[i]) continue;
        let end = i;
        used[i] = true;
        const baseBear = infos[i].bearing;
        let chainLen = infos[i].len;
        for (let step = 0; step < n; step++) {
            const nxt = (end + 1) % n;
            if (nxt === i || used[nxt] || !infos[nxt]) break;
            if (align(infos[nxt].bearing, baseBear) > 5) break;
            used[nxt] = true;
            end = nxt;
            chainLen += infos[nxt].len;
        }
        const a0 = infos[i].a;
        const b0 = infos[end].b;
        let groupBear = baseBear;
        try { groupBear = turf.bearing(turf.point(a0), turf.point(b0)); } catch (e) {}
        // 畝の長手と平行な辺は左右の側面。短い凹みは端面余白でよけない
        if (align(groupBear, ridgeAngleDeg) <= 12) continue;
        if (chainLen < 4) continue;
        let a = a0;
        let b = b0;
        try {
            // 角を少しだけ覆う。端面余白ぶん延ばすと、角の先の畝まで同じ線で止まってしまう
            const ext = window.cadExtendLineStringEnds(turf.lineString([a, b]), 0.25);
            const cs = ext.geometry.coordinates;
            if (cs && cs.length >= 2) {
                a = cs[0];
                b = cs[cs.length - 1];
            }
        } catch (e) {}
        segs.push([a, b]);
    }
    return segs;
};

window.cadGenerateLines = () => {
    try {
        if (!window.cadTargetId) return;

        const angleEl = document.getElementById('cadAngle');
        const countEl = document.getElementById('cadUneCount');

        const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;
        const uneCount = countEl && countEl.value ? parseInt(countEl.value, 10) : 0;

        if (isNaN(uneCount) || uneCount <= 0) { alert("⚠️ 畝数を1以上で確定してください！"); return; }

        window.cadUnePolygons.forEach(pl => pl.setMap(null)); window.cadUnePolygons = [];

        const p = loadedPolygons[window.cadTargetId];
        if (!p || !p.coords || p.coords.length < 3) return;

        let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([coords[0][0], coords[0][1]]);
        const tPoly = turf.polygon([coords]);

        const centerTurf = turf.center(tPoly);
        let maxPosDist = 0, maxNegDist = 0;

        let baseOrigin = centerTurf;
        let growDirection = angle + 90;
        let actualWidthM = 0;
        let startOffset = 0;

        if (window.cadFrontBaseline) {
            if (Array.isArray(window.cadFrontBaseline) && window.cadFrontBaseline.length === 2) {
                let p1lng = typeof window.cadFrontBaseline[0].lng === 'function' ? window.cadFrontBaseline[0].lng() : parseFloat(window.cadFrontBaseline[0].lng);
                let p1lat = typeof window.cadFrontBaseline[0].lat === 'function' ? window.cadFrontBaseline[0].lat() : parseFloat(window.cadFrontBaseline[0].lat);
                let p2lng = typeof window.cadFrontBaseline[1].lng === 'function' ? window.cadFrontBaseline[1].lng() : parseFloat(window.cadFrontBaseline[1].lng);
                let p2lat = typeof window.cadFrontBaseline[1].lat === 'function' ? window.cadFrontBaseline[1].lat() : parseFloat(window.cadFrontBaseline[1].lat);
                let p1 = turf.point([p1lng, p1lat]);
                let p2 = turf.point([p2lng, p2lat]);
                baseOrigin = turf.midpoint(p1, p2);
            } else {
                let pLng = typeof window.cadFrontBaseline.lng === 'function' ? window.cadFrontBaseline.lng() : parseFloat(window.cadFrontBaseline.lng);
                let pLat = typeof window.cadFrontBaseline.lat === 'function' ? window.cadFrontBaseline.lat() : parseFloat(window.cadFrontBaseline.lat);
                baseOrigin = turf.point([pLng, pLat]);
            }
            
            let centerBearing = turf.bearing(baseOrigin, centerTurf);
            let diffPlus = (centerBearing - (angle + 90)) * Math.PI / 180;
            let diffMinus = (centerBearing - (angle - 90)) * Math.PI / 180;
            growDirection = Math.cos(diffPlus) > Math.cos(diffMinus) ? angle + 90 : angle - 90;
        }

        tPoly.geometry.coordinates[0].forEach(coord => {
            const pt = turf.point(coord); 
            const dist = turf.distance(baseOrigin, pt, { units: 'meters' });
            const bearing = turf.bearing(baseOrigin, pt); 
            const angleDiff = (bearing - growDirection) * Math.PI / 180;
            const projDist = dist * Math.cos(angleDiff);
            if (projDist > maxPosDist) maxPosDist = projDist;
            if (-projDist > maxNegDist) maxNegDist = -projDist;
        });

        const marginSideEl = document.getElementById('cadMarginSide');
        const marginEndEl = document.getElementById('cadMarginEnd');
        const sideMarginMeters = marginSideEl && marginSideEl.value ? parseFloat(marginSideEl.value) / 100 : 0;
        const endMarginMeters = marginEndEl && marginEndEl.value ? parseFloat(marginEndEl.value) / 100 : 0;

        const totalWidth = maxPosDist + maxNegDist;
        const availableWidth = Math.max(0, totalWidth - sideMarginMeters * 2);
        actualWidthM = uneCount > 0 ? availableWidth / uneCount : 0;
        startOffset = -maxNegDist + sideMarginMeters + actualWidthM / 2;

        const bbox = turf.bbox(tPoly);
        const diagDist = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], { units: 'meters' });

        let nakamichiPolys = window.cadNakamichiLines.map(line => {
            let p1lng = typeof line[0].lng === 'function' ? line[0].lng() : parseFloat(line[0].lng);
            let p1lat = typeof line[0].lat === 'function' ? line[0].lat() : parseFloat(line[0].lat);
            let p2lng = typeof line[1].lng === 'function' ? line[1].lng() : parseFloat(line[1].lng);
            let p2lat = typeof line[1].lat === 'function' ? line[1].lat() : parseFloat(line[1].lat);
            const centerLine = turf.lineString([[p1lng, p1lat], [p2lng, p2lat]]);
            return turf.buffer(centerLine, window.CAD_NAKAMICHI_HALF_WIDTH_M, { units: 'meters' });
        });

        let drainagePolys = (window.cadDrainageLines || []).map(line => {
            let p1lng = typeof line[0].lng === 'function' ? line[0].lng() : parseFloat(line[0].lng);
            let p1lat = typeof line[0].lat === 'function' ? line[0].lat() : parseFloat(line[0].lat);
            let p2lng = typeof line[1].lng === 'function' ? line[1].lng() : parseFloat(line[1].lng);
            let p2lat = typeof line[1].lat === 'function' ? line[1].lat() : parseFloat(line[1].lat);
            const centerLine = turf.lineString([[p1lng, p1lat], [p2lng, p2lat]]);
            return turf.buffer(centerLine, 0.5 / 1000, { units: 'kilometers' });
        });
        
        let avoidPolys = [...nakamichiPolys, ...drainagePolys];
        const obliqueSegs = window.cadCollectObliqueClearanceSegs(coords, angle, endMarginMeters);
        const sideSegs = window.cadCollectSideClearanceSegs_(coords, angle);

        const lineLen = diagDist + 40;
        const ridgeRatio = typeof window.cadRidgeGapRatio !== 'undefined' ? (1 - window.cadRidgeGapRatio) : 0.8;
        const buildRidgeRects = (extraInset) => {
            const avail = Math.max(uneCount * 0.2, availableWidth - 2 * extraInset);
            const widthM = avail / uneCount;
            const start = -maxNegDist + sideMarginMeters + extraInset + widthM / 2;
            const pieces = [];
            for (let i = 0; i < uneCount; i++) {
                let offset = start + i * widthM;
                let direction = offset >= 0 ? growDirection : growDirection + 180;
                let absOffset = Math.abs(offset);
                let oPt = turf.destination(baseOrigin, absOffset, direction, { units: 'meters' });

                let pt1 = turf.destination(oPt, lineLen / 2, angle, { units: 'meters' });
                let w = widthM * ridgeRatio;

                let checkValid = (dist) => {
                    let c = turf.destination(pt1, dist, angle + 180, {units: 'meters'});
                    let wCheck = w;
                    let c_fwd = turf.destination(c, endMarginMeters, angle + 180, {units: 'meters'});
                    let c_bwd = turf.destination(c, endMarginMeters, angle, {units: 'meters'});

                    let p_fwd_L = turf.destination(c_fwd, wCheck / 2, angle + 90, {units: 'meters'});
                    let p_fwd_R = turf.destination(c_fwd, wCheck / 2, angle - 90, {units: 'meters'});
                    let p_bwd_L = turf.destination(c_bwd, wCheck / 2, angle + 90, {units: 'meters'});
                    let p_bwd_R = turf.destination(c_bwd, wCheck / 2, angle - 90, {units: 'meters'});
                    let c_L = turf.destination(c, wCheck / 2, angle + 90, {units: 'meters'});
                    let c_R = turf.destination(c, wCheck / 2, angle - 90, {units: 'meters'});

                    let ptsToCheck = [p_fwd_L, p_fwd_R, p_bwd_L, p_bwd_R, c_L, c_R];

                    if (window.cadPointHitsObliqueSeg_(c, obliqueSegs, endMarginMeters)) return false;
                    if (window.cadPointHitsObliqueSeg_(c_L, obliqueSegs, endMarginMeters)) return false;
                    if (window.cadPointHitsObliqueSeg_(c_R, obliqueSegs, endMarginMeters)) return false;
                    if (sideMarginMeters > 0.05) {
                        if (window.cadPointHitsObliqueSeg_(c_L, sideSegs, sideMarginMeters)) return false;
                        if (window.cadPointHitsObliqueSeg_(c_R, sideSegs, sideMarginMeters)) return false;
                    }

                    for (let pt of ptsToCheck) {
                        if (!turf.booleanPointInPolygon(pt, tPoly)) return false;
                    }

                    if (avoidPolys.length > 0) {
                        for (let av of avoidPolys) {
                            for (let pt of ptsToCheck) {
                                if (turf.booleanPointInPolygon(pt, av)) return false;
                            }
                        }
                    }
                    return true;
                };

                const minRidgeLen = 3;
                let stepMeters = 0.5;
                let validSegments = [];
                let currentSegment = null;

                for (let d = 0; d <= lineLen; d += stepMeters) {
                    let isValid = checkValid(d);
                    if (isValid) {
                        if (!currentSegment) {
                            let fine_d = d;
                            while (fine_d - 0.1 >= d - stepMeters && checkValid(fine_d - 0.1)) {
                                fine_d -= 0.1;
                            }
                            currentSegment = { start: fine_d, end: d };
                        } else {
                            currentSegment.end = d;
                        }
                    } else if (currentSegment) {
                        let fine_d = currentSegment.end;
                        while (fine_d + 0.1 <= d && checkValid(fine_d + 0.1)) {
                            fine_d += 0.1;
                        }
                        currentSegment.end = fine_d;
                        if (currentSegment.end - currentSegment.start >= minRidgeLen) validSegments.push(currentSegment);
                        currentSegment = null;
                    }
                }
                if (currentSegment) {
                    let fine_d = currentSegment.end;
                    while (fine_d + 0.1 <= lineLen && checkValid(fine_d + 0.1)) {
                        fine_d += 0.1;
                    }
                    currentSegment.end = fine_d;
                    if (currentSegment.end - currentSegment.start >= minRidgeLen) validSegments.push(currentSegment);
                }

                if (validSegments.length > 1) {
                    validSegments.sort((a, b) => a.start - b.start);
                    const spanStart = validSegments[0].start;
                    const spanEnd = validSegments[validSegments.length - 1].end;
                    let covered = 0;
                    validSegments.forEach((s) => { covered += s.end - s.start; });
                    const gap = (spanEnd - spanStart) - covered;
                    if (gap <= 15) {
                        validSegments = [{ start: spanStart, end: spanEnd }];
                    } else {
                        validSegments.sort((a, b) => (b.end - b.start) - (a.end - a.start));
                        validSegments = [validSegments[0]];
                    }
                }
                if (!validSegments.length) continue;
                const seg = validSegments[0];
                const segLen = seg.end - seg.start;
                let sPt = turf.destination(pt1, seg.start, angle + 180, {units: 'meters'});
                let ePt = turf.destination(pt1, seg.end, angle + 180, {units: 'meters'});
                let p1c = turf.destination(sPt, w / 2, angle + 90, {units: 'meters'}).geometry.coordinates;
                let p2c = turf.destination(sPt, w / 2, angle - 90, {units: 'meters'}).geometry.coordinates;
                let p3c = turf.destination(ePt, w / 2, angle - 90, {units: 'meters'}).geometry.coordinates;
                let p4c = turf.destination(ePt, w / 2, angle + 90, {units: 'meters'}).geometry.coordinates;
                pieces.push({ i: i, len: segLen, start: seg.start, end: seg.end, pt1: pt1, w: w, poly: turf.polygon([[p1c, p2c, p3c, p4c, p1c]]) });
            }
            const rebuild = (p) => {
                const sPt = turf.destination(p.pt1, p.start, angle + 180, { units: 'meters' });
                const ePt = turf.destination(p.pt1, p.end, angle + 180, { units: 'meters' });
                const p1c = turf.destination(sPt, p.w / 2, angle + 90, { units: 'meters' }).geometry.coordinates;
                const p2c = turf.destination(sPt, p.w / 2, angle - 90, { units: 'meters' }).geometry.coordinates;
                const p3c = turf.destination(ePt, p.w / 2, angle - 90, { units: 'meters' }).geometry.coordinates;
                const p4c = turf.destination(ePt, p.w / 2, angle + 90, { units: 'meters' }).geometry.coordinates;
                p.len = p.end - p.start;
                p.poly = turf.polygon([[p1c, p2c, p3c, p4c, p1c]]);
            };
            pieces.sort((a, b) => a.i - b.i);
            for (let pass = 0; pass < 2; pass++) {
                pieces.forEach((p, k) => {
                    const ns = [pieces[k - 1], pieces[k + 1]].filter(Boolean);
                    if (!ns.length) return;
                    if (ns.length === 2 && Math.abs(ns[0].start - ns[1].start) > 0.5) return;
                    const outward = Math.min.apply(null, ns.map((n) => n.start));
                    const delta = p.start - outward;
                    if (delta > 0.12 && delta <= 2) p.start = outward;
                    if (ns.length === 2 && Math.abs(ns[0].end - ns[1].end) > 0.5) return;
                    const outwardEnd = Math.max.apply(null, ns.map((n) => n.end));
                    const deltaEnd = outwardEnd - p.end;
                    if (deltaEnd > 0.12 && deltaEnd <= 2) p.end = outwardEnd;
                });
            }
            pieces.forEach(rebuild);
            let maxLen = 0;
            pieces.forEach((p) => { if (p.len > maxLen) maxLen = p.len; });
            const keepMin = maxLen >= 12 ? Math.max(5, maxLen * 0.25) : minRidgeLen;
            const longs = [];
            const shorts = [];
            pieces.forEach((p) => {
                if (maxLen >= 12 && p.len + 0.05 < keepMin) shorts.push(p);
                else longs.push(p);
            });
            const bridge = Math.max(0.2, widthM * (1 - ridgeRatio) * 0.5 + 0.08);
            shorts.forEach((short) => {
                let host = null;
                let hostDist = Infinity;
                longs.forEach((L) => {
                    const d = Math.abs(L.i - short.i);
                    if (d < hostDist) { hostDist = d; host = L; }
                });
                if (!host || hostDist > 2) {
                    longs.push(short);
                    return;
                }
                try {
                    const grown = turf.buffer(short.poly, bridge, { units: 'meters' }) || short.poly;
                    const u = turf.union(host.poly, grown);
                    const one = u ? window.cadCoalesceToPolygon(u) : null;
                    if (one) host.poly = one;
                    else longs.push(short);
                } catch (e) {
                    longs.push(short);
                }
            });
            return { rects: longs.map((p) => p.poly), produced: pieces.length };
        };

        let packed = buildRidgeRects(0);
        if (packed.produced < uneCount && availableWidth > 1) {
            let lo = 0;
            let hi = Math.max(0.05, availableWidth * 0.45);
            let best = packed;
            for (let iter = 0; iter < 8; iter++) {
                const mid = (lo + hi) / 2;
                const trial = buildRidgeRects(mid);
                if (trial.produced >= uneCount) {
                    best = trial;
                    hi = mid;
                } else {
                    if (trial.produced > best.produced) best = trial;
                    lo = mid;
                }
            }
            packed = best;
        }
        let rects = packed.rects;

        let successCount = 0;
        let polyIndex = 1;

        rects.forEach(rect => {
            addUnePolygon(rect.geometry.coordinates[0], polyIndex++);
            successCount++;
        });

        window.reassignLabels();
        window.saveCadStateToHistory();

        window.cadSvgNeedsRebuild = true;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();

        if (successCount === 0) alert("⚠️ 畝が生成できませんでした。畝数の設定などを確認してください。");
        else { const mode1El = document.getElementById('cadMode1'); if (mode1El && mode1El.style.display === 'block') switchCadTab(2); }

    } catch (globalError) { alert("❌ 処理中にエラーが発生しました:\n" + globalError.message); }
};

function addUnePolygon(coordsArray, idx) {
    const path = coordsArray.map(c => ({ lat: c[1], lng: c[0] }));
    const gPoly = window.cadCreateRidgePolygon
        ? window.cadCreateRidgePolygon(path, { fillColor: '#8BC34A', strokeColor: '#558B2F' })
        : new google.maps.Polygon({
            paths: path, fillColor: '#8BC34A', fillOpacity: 0, strokeColor: '#558B2F', strokeOpacity: 0,
            strokeWeight: Math.max(0.5, 2), map: null, zIndex: 10, editable: false, draggable: false, clickable: false
        });
    gPoly.uneIndex = 'une_' + idx;
    gPoly.uneGroup = 'default';
    window.bindShapeHistoryEvents(gPoly);
    window.cadUnePolygons.push(gPoly);
}

window.cadEditOriginalPath = null;
window.openCadEditModal = () => {
    return;
    const currentIdx = document.getElementById('cadEditIndex').value;
    if (currentIdx && currentIdx !== idx) {
        if (typeof window.cadCompleteEditPoly === 'function') window.cadCompleteEditPoly();
    }

    document.getElementById('cadEditIndex').value = idx;
    
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
    const poly = polyList.find(p => p.uneIndex === idx);
    if (poly) {
        if (typeof window.cadAttachRidgeForEdit === 'function') window.cadAttachRidgeForEdit(poly);
        poly.setEditable(true);
        let path = poly.getPath();
        window.cadEditOriginalPath = [];
        for (let i = 0; i < path.getLength(); i++) {
            let pt = path.getAt(i);
            window.cadEditOriginalPath.push(new google.maps.LatLng(pt.lat(), pt.lng()));
        }
        if (document.getElementById('cadEditUneGroup')) {
            let g = poly.uneGroup || '';
            if (g === 'default') g = '';
            document.getElementById('cadEditUneGroup').value = g;
        }
        if (document.getElementById('cadEditCustomLabel')) {
            document.getElementById('cadEditCustomLabel').value = poly.customLabel || '';
        }
        if (typeof window.refreshCadEditLengthDisplay === 'function') {
            window.refreshCadEditLengthDisplay(poly);
        }
        window.cadSvgNeedsRebuild = true;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: false });
    }
    
    // 🌟 自動的に下部の「② 編集」タブへ切り替え・展開
    if (typeof window.switchCadTab === 'function') {
        try { window.switchCadTab(2); } catch (e) {}
    }
    const editSec = document.getElementById('cadUneEditSection');
    if (editSec) editSec.style.display = 'block';
    const emptySec = document.getElementById('cadUneEditEmptyMsg');
    if (emptySec) emptySec.style.display = 'none';

    const modalEl = document.getElementById('cadEditPolyModal');
    if (modalEl) modalEl.style.display = 'none';
};

window.refreshCadEditLengthDisplay = (poly) => {
    const el = document.getElementById('cadEditLengthM');
    if (!el) return;
    if (!poly) {
        el.textContent = '—';
        return;
    }
    const lenStr = typeof window.formatCadUneLengthMeters === 'function'
        ? window.formatCadUneLengthMeters(window.estimateCadUneLengthMeters(poly))
        : '';
    el.textContent = lenStr || '—';
};

window.cadCompleteEditPoly = () => {
    const idx = document.getElementById('cadEditIndex').value;
    if (idx) {
        const isCustom = idx.startsWith('custom_');
        const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
        const poly = polyList.find(p => p.uneIndex === idx);
        if (poly) {
            poly.setEditable(false);
            if (typeof window.cadDetachRidgeFromMap === 'function') window.cadDetachRidgeFromMap(poly);
        }
    }
    const editSec = document.getElementById('cadUneEditSection');
    if (editSec) editSec.style.display = 'none';
    const emptySec = document.getElementById('cadUneEditEmptyMsg');
    if (emptySec) emptySec.style.display = 'block';

    document.getElementById('cadEditPolyModal').style.display = 'none';
    document.getElementById('cadEditIndex').value = '';
    window.cadEditOriginalPath = null;
    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: false });
    window.saveCadStateToHistory();
};

window.cadCancelEditPoly = () => {
    const idx = document.getElementById('cadEditIndex').value;
    if (idx && window.cadEditOriginalPath) {
        const isCustom = idx.startsWith('custom_');
        const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
        const poly = polyList.find(p => p.uneIndex === idx);
        if (poly) {
            poly.setEditable(false);
            poly.setPath(window.cadEditOriginalPath);
            if (typeof window.cadDetachRidgeFromMap === 'function') window.cadDetachRidgeFromMap(poly);
            if (typeof window.updateSinglePolyLabel === 'function') window.updateSinglePolyLabel(idx);
            if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: false });
            if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
        }
    }
    const editSec = document.getElementById('cadUneEditSection');
    if (editSec) editSec.style.display = 'none';
    const emptySec = document.getElementById('cadUneEditEmptyMsg');
    if (emptySec) emptySec.style.display = 'block';

    document.getElementById('cadEditPolyModal').style.display = 'none';
    document.getElementById('cadEditIndex').value = '';
    window.cadEditOriginalPath = null;
    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: false });
};

window.cadActionInterval = null;
window.cadActionTimeout = null;

window.startCadContinuousAction = (action, param) => {
    window.stopCadContinuousAction();
    const execute = () => {
        if (action === 'move') window.cadMovePoly(param, true);
        else if (action === 'rotate') window.cadRotatePoly(param, true);
        else if (action === 'resize') window.cadResizePoly(param, true);
    };
    execute(); // Execute once immediately
    window.cadActionTimeout = setTimeout(() => {
        window.cadActionInterval = setInterval(execute, 50); // Repeat every 50ms
    }, 300); // 300ms initial delay like key-repeat
};

window.stopCadContinuousAction = () => {
    if (window.cadActionTimeout) clearTimeout(window.cadActionTimeout);
    if (window.cadActionInterval) clearInterval(window.cadActionInterval);
    window.cadActionTimeout = null;
    window.cadActionInterval = null;
    window.saveCadStateToHistory();
};

window.updateSinglePolyLabel = (idx) => {
    const totalPolygons = [...window.cadUnePolygons, ...window.cadCustomShapes];
    const polyIndex = totalPolygons.findIndex(p => p.uneIndex === idx);
    if (polyIndex > -1 && window.cadUneLabels && window.cadUneLabels[polyIndex]) {
        const poly = totalPolygons[polyIndex];
        const marker = window.cadUneLabels[polyIndex];
        const bounds = new google.maps.LatLngBounds();
        poly.getPath().forEach(pt => bounds.extend(pt));
        marker.setPosition(bounds.getCenter());

        let baseIdx = poly._displayLabel ? poly._displayLabel : (poly.customLabel ? poly.customLabel : String(polyIndex + 1));
        let title = typeof window.getCadUneLabelTitle === 'function' ? window.getCadUneLabelTitle(poly, baseIdx) : baseIdx;
        let lenStr = typeof window.formatCadUneLengthMeters === 'function'
            ? window.formatCadUneLengthMeters(window.estimateCadUneLengthMeters(poly))
            : '';
        marker.setLabel({
            text: lenStr ? (title + ' ' + lenStr) : title,
            color: '#ffffff',
            fontSize: '24px',
            fontWeight: 'bold',
            className: 'polygon-label ridge-label'
        });
        if (poly._svgTextNode && typeof window.applyCadUneSvgLabelText === 'function') {
            window.applyCadUneSvgLabelText(poly._svgTextNode, poly, baseIdx);
            const x = poly._svgTextNode.getAttribute('x');
            if (x != null) poly._svgTextNode.querySelectorAll('tspan').forEach(ts => ts.setAttribute('x', x));
        }
        if (typeof window.refreshCadEditLengthDisplay === 'function') {
            window.refreshCadEditLengthDisplay(poly);
        }
    }
};

window.cadRotatePoly = (deg, isContinuous = false) => {
    const idx = document.getElementById('cadEditIndex').value;
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
    const poly = polyList.find(p => p.uneIndex === idx);
    if (!poly) return;

    let path = poly.getPath(); let coords = [];
    for (let i = 0; i < path.getLength(); i++) { let pt = path.getAt(i); coords.push([pt.lng(), pt.lat()]); }
    coords.push([path.getAt(0).lng(), path.getAt(0).lat()]);
    let tPoly = turf.polygon([coords]);

    let rotatedPoly = turf.transformRotate(tPoly, deg);
    let newCoords = rotatedPoly.geometry.coordinates[0].map(c => new google.maps.LatLng(c[1], c[0]));
    newCoords.pop(); 
    for (let i = 0; i < path.getLength(); i++) path.setAt(i, newCoords[i]);
    window.updateSinglePolyLabel(idx);
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (!isContinuous) window.saveCadStateToHistory();
};

window.cadMovePoly = (dir, isContinuous = false) => {
    const idx = document.getElementById('cadEditIndex').value;
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
    const poly = polyList.find(p => p.uneIndex === idx);
    if (!poly) return;

    const bearingMap = { 'up': -window.cadCurrentRotation, 'down': -window.cadCurrentRotation + 180, 'left': -window.cadCurrentRotation - 90, 'right': -window.cadCurrentRotation + 90 };

    let path = poly.getPath(); let newCoords = [];
    for (let i = 0; i < path.getLength(); i++) {
        let pt = path.getAt(i); let tPt = turf.point([pt.lng(), pt.lat()]);
        let moved = turf.destination(tPt, 0.1, bearingMap[dir], { units: 'meters' });
        newCoords.push(new google.maps.LatLng(moved.geometry.coordinates[1], moved.geometry.coordinates[0]));
    }
    for (let i = 0; i < path.getLength(); i++) path.setAt(i, newCoords[i]);
    window.updateSinglePolyLabel(idx);
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (!isContinuous) window.saveCadStateToHistory();
};

window.cadResizePoly = (scaleFactor, isContinuous = false) => {
    const idx = document.getElementById('cadEditIndex').value;
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
    const poly = polyList.find(p => p.uneIndex === idx);
    if (!poly) return;

    let path = poly.getPath();
    if (path.getLength() === 0) return;

    let centerLng = 0;
    let centerLat = 0;
    for (let i = 0; i < path.getLength(); i++) {
        centerLng += path.getAt(i).lng();
        centerLat += path.getAt(i).lat();
    }
    centerLng /= path.getLength();
    centerLat /= path.getLength();

    let newCoords = [];
    for (let i = 0; i < path.getLength(); i++) {
        let pt = path.getAt(i);
        let nLng = centerLng + (pt.lng() - centerLng) * scaleFactor;
        let nLat = centerLat + (pt.lat() - centerLat) * scaleFactor;
        newCoords.push(new google.maps.LatLng(nLat, nLng));
    }
    
    for (let i = 0; i < path.getLength(); i++) path.setAt(i, newCoords[i]);
    window.updateSinglePolyLabel(idx);
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (!isContinuous) window.saveCadStateToHistory();
};

window.cadSelectedRidgeId = null;

window.cadFindRidgeByIndex_ = (uneIndex) => {
    const lists = [window.cadUnePolygons, window.cadCustomShapes];
    for (let li = 0; li < lists.length; li++) {
        const arr = lists[li];
        if (!arr) continue;
        const at = arr.findIndex((p) => p && p.uneIndex === uneIndex);
        if (at >= 0) return { found: arr[at], list: arr, at: at };
    }
    return null;
};

window.cadRidgeEndCaps_ = (poly) => {
    if (!poly || !poly.getPath || typeof turf === 'undefined') return null;
    const path = poly.getPath();
    const n = path.getLength();
    if (n < 4) return null;
    const pts = [];
    for (let i = 0; i < n; i++) {
        const p = path.getAt(i);
        pts.push({ lat: p.lat(), lng: p.lng(), i: i });
    }
    let bestLen = -1;
    let bestI = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const len = turf.distance(turf.point([a.lng, a.lat]), turf.point([b.lng, b.lat]), { units: 'meters' });
        if (len > bestLen) { bestLen = len; bestI = i; }
    }
    const a = pts[bestI];
    const b = pts[(bestI + 1) % n];
    const origin = [a.lng, a.lat];
    const bearing = turf.bearing(turf.point(origin), turf.point([b.lng, b.lat]));
    let minS = Infinity;
    let maxS = -Infinity;
    const scored = pts.map((p) => {
        const s = window.cadMetersAlongBearing_(origin, [p.lng, p.lat], bearing);
        if (s < minS) minS = s;
        if (s > maxS) maxS = s;
        return { i: p.i, lat: p.lat, lng: p.lng, s: s };
    });
    if (!(maxS - minS > 0.2)) return null;
    const eps = Math.max(0.15, (maxS - minS) * 0.08);
    const pack = (list) => {
        let lat = 0;
        let lng = 0;
        list.forEach((p) => { lat += p.lat; lng += p.lng; });
        return {
            lat: lat / list.length,
            lng: lng / list.length,
            idxs: list.map((p) => p.i)
        };
    };
    const startPts = scored.filter((p) => p.s <= minS + eps);
    const endPts = scored.filter((p) => p.s >= maxS - eps);
    if (startPts.length < 1 || endPts.length < 1) return null;
    return { bearing: bearing, caps: [pack(startPts), pack(endPts)] };
};

window.cadAttachRidgeEndHandles_ = (poly, handlesGroup) => {
    const caps = window.cadRidgeEndCaps_(poly);
    if (!caps || !handlesGroup) return;
    poly._svgEndHandles = [];
    caps.caps.forEach((cap, capIndex) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', '11');
        circle.setAttribute('fill', '#FFEB3B');
        circle.setAttribute('stroke', '#F57F17');
        circle.setAttribute('stroke-width', '3');
        circle.setAttribute('style', 'cursor: grab; pointer-events: auto;');
        let dragging = false;
        const onMove = (ev) => {
            if (!dragging) return;
            if (ev.cancelable) ev.preventDefault();
            const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
            const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
            const ll = window.screenPixelToLatLng(clientX, clientY);
            if (!ll || !window.cadStretchRidgeEnd_) return;
            window.cadStretchRidgeEnd_(poly, capIndex, ll.lng(), ll.lat());
            if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
        };
        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            window.cadRidgeEndDragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            if (typeof window.reassignLabels === 'function') window.reassignLabels();
            if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
            if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay({ light: true });
        };
        const onStart = (e) => {
            dragging = true;
            window.cadRidgeEndDragging = true;
            e.stopPropagation();
            e.preventDefault();
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onEnd);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onEnd);
        };
        circle.addEventListener('mousedown', onStart);
        circle.addEventListener('touchstart', onStart, { passive: false });
        handlesGroup.appendChild(circle);
        poly._svgEndHandles.push(circle);
    });
    window.cadPositionRidgeEndHandles_(poly);
};

window.cadPositionRidgeEndHandles_ = (poly) => {
    if (!poly || !poly._svgEndHandles || poly._svgEndHandles.length < 2) return;
    const caps = window.cadRidgeEndCaps_(poly);
    if (!caps) return;
    caps.caps.forEach((cap, i) => {
        const circle = poly._svgEndHandles[i];
        if (!circle || typeof window.latLngToScreenPixel !== 'function') return;
        const screenPt = window.latLngToScreenPixel(cap.lat, cap.lng);
        circle.setAttribute('cx', screenPt.x);
        circle.setAttribute('cy', screenPt.y);
    });
};

window.cadStretchRidgeEnd_ = (poly, capIndex, lng, lat) => {
    const caps = window.cadRidgeEndCaps_(poly);
    if (!caps) return;
    const cap = caps.caps[capIndex];
    const anchor = caps.caps[1 - capIndex];
    if (!cap || !anchor) return;
    const anchorLL = [anchor.lng, anchor.lat];
    let next = window.cadMetersAlongBearing_(anchorLL, [lng, lat], caps.bearing);
    const cur = window.cadMetersAlongBearing_(anchorLL, [cap.lng, cap.lat], caps.bearing);
    const sign = cur >= 0 ? 1 : -1;
    if (Math.abs(next) < 0.4) next = sign * 0.4;
    if ((sign > 0 && next < 0.4) || (sign < 0 && next > -0.4)) next = sign * 0.4;
    const delta = next - cur;
    if (Math.abs(delta) < 0.01) return;
    const path = poly.getPath();
    window.cadSuppressPathEvents = true;
    try {
        cap.idxs.forEach((idx) => {
            const pt = path.getAt(idx);
            const moved = window.cadDestinationMeters_([pt.lng(), pt.lat()], delta, caps.bearing);
            path.setAt(idx, new google.maps.LatLng(moved[1], moved[0]));
        });
    } finally {
        window.cadSuppressPathEvents = false;
    }
};

window.cadRidgeSelectName_ = (poly) => {
    if (!poly) return '畝';
    const title = poly._displayLabel || poly.customLabel || '';
    const group = poly.uneGroup && poly.uneGroup !== 'default' ? poly.uneGroup : '';
    return [title, group].filter(Boolean).join(' ') || '畝';
};

window.cadApplyRidgeSelectionStyle_ = (poly) => {
    const node = poly && poly._svgPathNode;
    if (!node) return;
    const on = !!(window.cadSelectedRidgeId && poly.uneIndex === window.cadSelectedRidgeId);
    node.setAttribute('stroke', on ? '#FFEB3B' : '#558B2F');
    node.setAttribute('stroke-width', on ? '5' : '2');
};

window.cadRefreshRidgeSelectionUi_ = () => {
    const bar = document.getElementById('cadRidgeSelectBar');
    const label = document.getElementById('cadRidgeSelectLabel');
    const hit = window.cadSelectedRidgeId ? window.cadFindRidgeByIndex_(window.cadSelectedRidgeId) : null;
    if (!hit || !hit.found) {
        window.cadSelectedRidgeId = null;
        if (bar) bar.style.display = 'none';
        return;
    }
    if (bar) bar.style.display = 'block';
    if (label) label.textContent = '選択中: ' + window.cadRidgeSelectName_(hit.found);
};

window.cadPaintRidgeSelection_ = () => {
    const all = [...(window.cadUnePolygons || []), ...(window.cadCustomShapes || [])];
    all.forEach((p) => window.cadApplyRidgeSelectionStyle_(p));
};

window.cadSelectRidgeByTap = (uneIndex) => {
    if (window.cadPinMode || !uneIndex) return;
    if (window.cadSelectedRidgeId === uneIndex) {
        window.cadClearRidgeSelection();
        return;
    }
    const hit = window.cadFindRidgeByIndex_(uneIndex);
    if (!hit) return;
    window.cadSelectedRidgeId = uneIndex;
    window.cadRefreshRidgeSelectionUi_();
    window.cadPaintRidgeSelection_();
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    const msg = document.getElementById('cadPinModeMsg');
    if (msg) {
        msg.innerText = '選択中です。上下の丸を引っ張ると長さを変えられます。';
        msg.style.color = '#FFB74D';
    }
};

window.cadClearRidgeSelection = () => {
    window.cadSelectedRidgeId = null;
    window.cadRefreshRidgeSelectionUi_();
    window.cadPaintRidgeSelection_();
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
};

window.cadDeleteSelectedRidge = () => {
    const id = window.cadSelectedRidgeId;
    if (!id) return;
    const hit = window.cadFindRidgeByIndex_(id);
    if (!hit || !hit.found) {
        window.cadClearRidgeSelection();
        return;
    }
    try { hit.found.setMap(null); } catch (e) {}
    hit.list.splice(hit.at, 1);
    window.cadSelectedRidgeId = null;
    window.cadRefreshRidgeSelectionUi_();
    if (typeof window.reassignLabels === 'function') window.reassignLabels();
    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
    const msg = document.getElementById('cadPinModeMsg');
    if (msg) {
        msg.innerText = '畝を削除しました。戻すで元に戻せます。';
        msg.style.color = '#FFB74D';
    }
};

window.cadDeletePoly = () => {
    const idx = document.getElementById('cadEditIndex').value;
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;

    const polyIdx = polyList.findIndex(p => p.uneIndex === idx);
    if (polyIdx > -1) { polyList[polyIdx].setMap(null); polyList.splice(polyIdx, 1); }

    const editSec = document.getElementById('cadUneEditSection');
    if (editSec) editSec.style.display = 'none';
    const emptySec = document.getElementById('cadUneEditEmptyMsg');
    if (emptySec) emptySec.style.display = 'block';

    document.getElementById('cadEditPolyModal').style.display = 'none';
    window.reassignLabels(); window.saveCadStateToHistory();
};

window.reassignLabels = () => {
    const totalPolygons = [...window.cadUnePolygons, ...window.cadCustomShapes];
    const hideLength = window.cadGetRidgeCount() >= (window.CAD_PERF.hideLengthAt || 45);

    // 旧 Google Marker があれば解放（非表示でもコストになる）
    if (window.cadUneLabels && window.cadUneLabels.length) {
        window.cadUneLabels.forEach(lbl => {
            if (lbl && typeof lbl.setMap === 'function' && lbl.getMap) {
                try { lbl.setMap(null); } catch (e) {}
            }
        });
    }
    window.cadUneLabels = totalPolygons.map(() => window.cadCreateLabelSlot());

    const usedCustomNumbers = new Set();
    totalPolygons.forEach(p => {
        if (p.customLabel) usedCustomNumbers.add(p.customLabel.trim());
    });

    let autoNumber = 1;
    totalPolygons.forEach((poly, index) => {
        const marker = window.cadUneLabels[index];
        let idxStr = '';
        if (poly.customLabel) {
            idxStr = poly.customLabel;
        } else {
            while (usedCustomNumbers.has(String(autoNumber))) autoNumber++;
            idxStr = String(autoNumber);
            autoNumber++;
        }
        poly._displayLabel = idxStr;
        marker.associatedPoly = poly;

        const path = poly.getPath();
        if (path && path.getLength()) {
            let lat = 0;
            let lng = 0;
            const n = path.getLength();
            for (let i = 0; i < n; i++) {
                const pt = path.getAt(i);
                lat += pt.lat();
                lng += pt.lng();
            }
            marker.setPosition(new google.maps.LatLng(lat / n, lng / n));
        }

        if (poly._svgTextNode) {
            if (!hideLength && typeof window.applyCadUneSvgLabelText === 'function') {
                window.applyCadUneSvgLabelText(poly._svgTextNode, poly, idxStr);
            } else {
                const title = typeof window.getCadUneLabelTitle === 'function'
                    ? window.getCadUneLabelTitle(poly, idxStr)
                    : idxStr;
                while (poly._svgTextNode.firstChild) poly._svgTextNode.removeChild(poly._svgTextNode.firstChild);
                poly._svgTextNode.textContent = title;
            }
            const x = poly._svgTextNode.getAttribute('x');
            if (x != null) poly._svgTextNode.querySelectorAll('tspan').forEach(ts => ts.setAttribute('x', x));
        }
    });

    if (typeof window.cadDetachAllRidgesFromMap === 'function') window.cadDetachAllRidgesFromMap();
};

window.saveUneSim = async () => {
    if (!window.cadTargetId) return;
    const p = loadedPolygons[window.cadTargetId];
    let pins = window.cadPins.map(mk => ({ type: mk.cadPinType, lat: mk.getPosition().lat(), lng: mk.getPosition().lng() }));
    let customShapesData = window.cadCustomShapes.map(poly => ({ coords: window.cadPolyToSavedCoords(poly), group: poly.uneGroup || '', customLabel: poly.customLabel || '' }));
    let unePolygonsData = window.cadUnePolygons.map(poly => ({ coords: window.cadPolyToSavedCoords(poly), group: poly.uneGroup || '', customLabel: poly.customLabel || '' }));

    const angleEl = document.getElementById('cadAngle'); const widthEl = document.getElementById('cadWidth'); const countEl = document.getElementById('cadUneCount');
    const marginSideEl = document.getElementById('cadMarginSide'); const marginEndEl = document.getElementById('cadMarginEnd');

    const simDataStr = JSON.stringify({
        angle: angleEl && angleEl.value ? angleEl.value : 0,
        width: widthEl && widthEl.value ? widthEl.value : 150,
        uneCount: countEl && countEl.value ? countEl.value : 0,
        marginSide: marginSideEl && marginSideEl.value ? marginSideEl.value : 0,
        marginEnd: marginEndEl && marginEndEl.value ? marginEndEl.value : 0,
        pins: pins,
        nakamichiLines: window.cadNakamichiLines,
        drainageLines: window.cadDrainageLines,
        customShapes: customShapesData,
        unePolygons: unePolygonsData,
        frontBaseline: window.cadFrontBaseline || null,
        pinNumFontSize: window.cadPinNumFontSize || 24
    });

    p.uneSimData = simDataStr;
    const saveBtn = document.querySelector('button[onclick="saveUneSim()"]');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) saveBtn.innerHTML = '⏳ 保存中...';
    
    try {
        await callGAS('updatePolygon', { id: p.id, name: p.name, uneSimData: simDataStr, userName: currentUser });
        if (window._cadRegistryCache) delete window._cadRegistryCache[p.id];
        alert("💾 描画した地形とピンをすべて保存しました！");
        window.closeCADMode();
    } catch (e) {
        console.error(e);
        alert("保存中にエラーが発生しました。");
    } finally {
        if (saveBtn) saveBtn.innerHTML = originalText;
    }
};
window.cadJsonFingerprint_ = (raw) => {
    const s = raw ? String(raw) : '';
    let h = 0;
    const step = Math.max(1, Math.floor(s.length / 240));
    for (let i = 0; i < s.length; i += step) h = ((h * 33) + s.charCodeAt(i)) >>> 0;
    return s.length + ':' + h;
};

window.cadEnsureRegistryData_ = async (id, item) => {
    if (!item) return '';
    if (item.data) return String(item.data);
    if (!item.row) return '';
    const full = await callGAS('getPolygonDrawingHistoryItem', { id: id, row: item.row });
    const data = full && full.data ? String(full.data) : '';
    item.data = data;
    return data;
};

window.openCadRegistry = async (id, opts) => {
    const p = (typeof loadedPolygons !== 'undefined') ? loadedPolygons[id] : null;
    if (!p) {
        alert('圃場が見つかりません。');
        return;
    }
    opts = opts || {};
    try { if (typeof infoWindow !== 'undefined' && infoWindow) infoWindow.close(); } catch (e) {}
    window._cadRegistryFieldId = id;
    const modal = document.getElementById('cadRegistryModal');
    const listEl = document.getElementById('cadRegistryList');
    const nameEl = document.getElementById('cadRegistryFieldName');
    if (!modal || !listEl) {
        window.openCADMode(id);
        return;
    }
    if (nameEl) nameEl.textContent = p.name ? '（' + p.name + '）' : '';
    modal.style.display = 'flex';
    const newBtn = document.getElementById('cadRegistryNewBtn');
    if (newBtn) {
        newBtn.onclick = () => {
            modal.style.display = 'none';
            window.openCADMode(id, { blank: true });
        };
    }
    const cache = window._cadRegistryCache && window._cadRegistryCache[id];
    if (!opts.refresh && cache && (Date.now() - cache.at) < 60000) {
        window.cadRenderRegistryList_(id, cache.history);
        return;
    }
    window.cadRenderRegistryList_(id, [], { loading: true });
    let history = [];
    try {
        history = await callGAS('getPolygonDrawingHistory', { id: id, summary: true }) || [];
    } catch (e) {
        console.warn('CAD登録一覧の取得に失敗:', e);
        history = [];
    }
    if (String(window._cadRegistryFieldId) !== String(id)) return;
    window._cadRegistryCache = window._cadRegistryCache || {};
    window._cadRegistryCache[id] = { at: Date.now(), history: history };
    window.cadRenderRegistryList_(id, history);
};

window.cadRenderRegistryList_ = (id, history, opts) => {
    const listEl = document.getElementById('cadRegistryList');
    const p = loadedPolygons[id];
    if (!listEl || !p) return;
    const loading = !!(opts && opts.loading);
    const current = p.uneSimData ? String(p.uneSimData) : '';
    const currentFp = current ? window.cadJsonFingerprint_(current) : '';
    listEl.innerHTML = '';
    const summarize = (dataStr, item) => {
        if (item && item.ridges != null) return '畝 ' + item.ridges + '・ピン ' + (item.pins || 0);
        try {
            const o = JSON.parse(dataStr);
            const ridges = (o.unePolygons || []).length + (o.customShapes || []).length;
            const pins = (o.pins || []).length;
            return '畝 ' + ridges + '・ピン ' + pins;
        } catch (e) {
            return '';
        }
    };
    const sameAsCurrent = (item) => {
        if (!current || !item) return false;
        if (item.fp) return item.fp === currentFp;
        return String(item.data || '') === current;
    };
    const addCard = (title, dataStr, actions, item) => {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid #e0e0e0; border-radius:8px; padding:10px; margin-bottom:8px; background:#fafafa;';
        const head = document.createElement('div');
        head.style.cssText = 'font-size:13px; font-weight:bold; margin-bottom:4px; color:#333;';
        head.textContent = title;
        card.appendChild(head);
        const label = summarize(dataStr, item);
        if (label) {
            const sub = document.createElement('div');
            sub.style.cssText = 'font-size:11px; color:#666; margin-bottom:8px;';
            sub.textContent = label;
            card.appendChild(sub);
        }
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:4px;';
        actions.forEach((act) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = act.label;
            b.style.cssText = 'flex:1; border:none; border-radius:4px; padding:7px 4px; font-size:12px; font-weight:bold; cursor:pointer; color:#fff; background:' + act.color + ';';
            b.onclick = async () => {
                const prev = b.textContent;
                b.disabled = true;
                b.textContent = '読込中';
                try { await act.onClick(); }
                catch (e) { alert(e && e.message ? e.message : e); }
                finally { b.disabled = false; b.textContent = prev; }
            };
            row.appendChild(b);
        });
        card.appendChild(row);
        listEl.appendChild(card);
    };
    const openEditor = (dataStr, blank) => {
        document.getElementById('cadRegistryModal').style.display = 'none';
        window.openCADMode(id, blank ? { blank: true } : { data: dataStr });
    };
    if (!history.length && !current) {
        listEl.innerHTML = loading
            ? '<div style="text-align:center; padding:16px; color:#666;">読み込み中...</div>'
            : '<div style="text-align:center; padding:16px; color:#666;">登録された図面はまだありません。<br>新規追加から作成できます。</div>';
        return;
    }
    const matched = history.some(sameAsCurrent);
    if (current && !matched) {
        addCard('いまの図面', current, [
            { label: '編集', color: '#FF9800', onClick: () => openEditor(current, false) }
        ]);
    }
    if (loading) {
        const wait = document.createElement('div');
        wait.style.cssText = 'text-align:center; padding:10px; color:#888; font-size:12px;';
        wait.textContent = '登録を読み込み中...';
        listEl.appendChild(wait);
        return;
    }
    if (!history.length) return;
    history.forEach((item) => {
        const applied = sameAsCurrent(item);
        const title = (applied ? '適用中 ・ ' : '') + (item.date || '図面');
        const actions = [];
        if (!applied) {
            actions.push({ label: '適用', color: '#1565C0', onClick: () => window.cadApplyRegistryItem_(id, item) });
        }
        actions.push({
            label: '編集',
            color: '#FF9800',
            onClick: async () => {
                const data = await window.cadEnsureRegistryData_(id, item);
                if (!data) { alert('図面を読み込めませんでした。'); return; }
                openEditor(data, false);
            }
        });
        actions.push({ label: '削除', color: '#E53935', onClick: () => window.cadDeleteRegistryItem_(id, item) });
        addCard(title, item.data, actions, item);
    });
};

window.cadApplyRegistryItem_ = async (id, item) => {
    const p = loadedPolygons[id];
    if (!p || !item) return;
    if (!confirm((item.date || 'この図面') + ' をこの圃場に適用しますか？')) return;
    if (!item.data) {
        item.data = await window.cadEnsureRegistryData_(id, item);
    }
    if (!item.data) {
        alert('図面を読み込めませんでした。');
        return;
    }
    try {
        await callGAS('updatePolygon', {
            id: p.id,
            name: p.name,
            uneSimData: item.data,
            userName: (typeof currentUser !== 'undefined' ? currentUser : ''),
            skipCadHistory: true
        });
        p.uneSimData = item.data;
        alert('この図面を適用しました。');
        window.openCadRegistry(id, { refresh: true });
    } catch (e) {
        alert('適用に失敗しました。\n' + (e && e.message ? e.message : e));
    }
};

window.cadDeleteRegistryItem_ = async (id, item) => {
    if (!item || !item.row) {
        alert('この図面は削除できません。');
        return;
    }
    if (!confirm((item.date || 'この図面') + ' を削除しますか？')) return;
    try {
        await callGAS('deletePolygonDrawingHistory', {
            id: id,
            row: item.row,
            userName: (typeof currentUser !== 'undefined' ? currentUser : '')
        });
        window.openCadRegistry(id, { refresh: true });
    } catch (e) {
        alert('削除に失敗しました。\n' + (e && e.message ? e.message : e));
    }
};

window.showCadHistoryModal = async () => {
    if (!window.cadTargetId) return;
    const listEl = document.getElementById('cadHistoryList');
    if (!listEl) return;
    const historyLoad = (window.AppLoading && AppLoading.inline)
        ? AppLoading.inline(listEl, { label: 'CAD履歴を取得中...', detail: '保存済み図面を確認しています', delay: 0 })
        : null;
    if (!historyLoad) listEl.innerHTML = '<div style="text-align:center; padding:20px;">読み込み中...</div>';
    document.getElementById('cadHistoryModal').style.display = 'block';
    
    try {
        const history = await callGAS('getPolygonDrawingHistory', { id: window.cadTargetId, summary: true });
        if (!history || history.length === 0) {
            if (historyLoad) historyLoad.done();
            listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">保存された履歴がありません。</div>';
            return;
        }
        
        if (historyLoad) historyLoad.update({ label: 'CAD履歴を表示中...', detail: `0 / ${history.length} 件`, current: 0, total: history.length });
        const historyFragment = document.createDocumentFragment();
        history.forEach((item, idx) => {
            const btn = document.createElement('button');
            btn.style.cssText = 'width:100%; text-align:left; padding:12px; background:#f5f5f5; border:1px solid #ddd; border-radius:6px; cursor:pointer; font-size:14px; margin-bottom:5px;';
            btn.innerHTML = '🕒 ' + item.date;
            btn.onclick = async () => {
                if (!confirm(item.date + ' の状態を復元しますか？現在の未保存の編集は失われます。')) return;
                let data = item.data;
                if (!data && item.row) {
                    const full = await callGAS('getPolygonDrawingHistoryItem', { id: window.cadTargetId, row: item.row });
                    data = full && full.data;
                }
                if (!data) { alert('図面を読み込めませんでした。'); return; }
                window.loadCadHistoryData(data);
                document.getElementById('cadHistoryModal').style.display = 'none';
            };
            historyFragment.appendChild(btn);
            if (historyLoad) historyLoad.update({ detail: `${idx + 1} / ${history.length} 件`, current: idx + 1, total: history.length });
        });
        if (historyLoad) historyLoad.done();
        listEl.innerHTML = '';
        listEl.appendChild(historyFragment);
    } catch(e) {
        console.error("CAD History Error:", e);
        if (historyLoad) historyLoad.done();
        listEl.innerHTML = `<div style="text-align:center; padding:20px; color:red;">エラーが発生しました。<br>${e.message}</div>`;
    }
};

window.loadCadHistoryData = (simDataStr) => {
    if (!simDataStr) return;
    const p = loadedPolygons[window.cadTargetId];
    if (p) p.uneSimData = simDataStr;
    window.cadClearLines(true);
    let currentId = window.cadTargetId;
    window.closeCADMode();
    window.openCADMode(currentId);
};



window.cadGetGroupColor = (group) => {
    if (!group) return '#8BC34A';
    const g = String(group);
    // 枕畝は土色（茶色）と被らない鮮やかなアンバーオレンジ
    if (g === '枕') return '#FF6F00';
    // 空け・端は分割ブロックと色が被らない固定色
    if (g === '空け') return '#78909C';
    if (g === '端') return '#8D6E63';
    const splitMatch = g.match(/^分割(\d+)$/);
    if (splitMatch) {
        const splitColors = ['#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#00897B', '#FF7043', '#1565C0'];
        const n = parseInt(splitMatch[1], 10);
        return splitColors[(Math.max(1, n) - 1) % splitColors.length];
    }
    const colors = ['#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#AB47BC', '#009688', '#3F51B5'];
    let hash = 0;
    for (let i = 0; i < g.length; i++) hash = g.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
};

window.cadApplyUneDetails = () => {
    const idx = document.getElementById('cadEditIndex').value;
    const group = document.getElementById('cadEditUneGroup').value.trim();
    const customLabel = document.getElementById('cadEditCustomLabel') ? document.getElementById('cadEditCustomLabel').value.trim() : '';
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
    const poly = polyList.find(p => p.uneIndex === idx);
    if (poly) {
        poly.uneGroup = group;
        if (customLabel) poly.customLabel = customLabel;
        else delete poly.customLabel;
        
        poly.setOptions({ fillColor: window.cadGetGroupColor(group) });
        if (typeof window.reassignLabels === 'function') window.reassignLabels();
        window.cadSvgNeedsRebuild = true;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
        if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
    }
};

window.cadApplyGroupToAllSubsequent = () => {
    const idx = document.getElementById('cadEditIndex').value;
    const group = document.getElementById('cadEditUneGroup').value.trim();
    const isCustom = idx.startsWith('custom_');
    if (isCustom) {
        alert("この機能は通常畝のみ対応しています。");
        return;
    }
    const polyIndexMatch = idx.match(/une_(\d+)/);
    if (!polyIndexMatch) return;
    const startNum = parseInt(polyIndexMatch[1], 10);

    window.cadUnePolygons.forEach((p, i) => {
        if (i + 1 >= startNum) {
            p.uneGroup = group;
            p.setOptions({ fillColor: window.cadGetGroupColor(group) });
        }
    });
    if (typeof window.reassignLabels === 'function') window.reassignLabels();
    window.cadSvgNeedsRebuild = true;
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
};

