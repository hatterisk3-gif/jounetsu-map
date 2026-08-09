// 🚜 農業CAD専用JavaScript（admin.htmlから切り出し）
// 🚜 新・農業CADシステム（地形設計特化版）
window.cadMap = null;
window.cadTargetId = null;
window.cadTargetPolygon = null;
window.cadUnePolygons = [];
window.cadPins = [];
window.cadPinMode = null;
window.cadPinNumFontSize = 20; // 給水・排水アイコン上の番号サイズ(px)
window.cadUneLabels = [];
window.cadNakamichiLines = [];
window.cadNakamichiMapPolygons = [];
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
                   '<g id="cadSvgGrid"></g><g id="cadSvgCellFills" style="pointer-events:none;"></g><g id="cadSvgCellHover" style="pointer-events:none;"></g><g id="cadSvgPaths"></g><g id="cadSvgTexts"></g><g id="cadSvgHandles"></g><g id="cadSvgPins"></g><g id="front-bar" style="filter: url(#hover-shadow);"></g>';
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
                if (window.openCadEditModal && p.uneIndex) window.openCadEditModal(p.uneIndex);
            });
            pathsGroup.appendChild(p._svgPathNode);

            let textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textNode.setAttribute('fill', '#ffffff');
            textNode.setAttribute('font-size', '24');
            textNode.setAttribute('font-weight', 'bold');
            textNode.setAttribute('font-family', 'sans-serif');
            textNode.setAttribute('text-anchor', 'middle');
            textNode.setAttribute('dominant-baseline', 'central');
            textNode.setAttribute('style', 'pointer-events: none; paint-order: stroke; stroke: #000000; stroke-width: 4px;');
            if (typeof window.applyCadUneSvgLabelText === 'function' && !hideLength) {
                window.applyCadUneSvgLabelText(textNode, p, baseLabel);
            } else {
                const title = typeof window.getCadUneLabelTitle === 'function'
                    ? window.getCadUneLabelTitle(p, baseLabel)
                    : String(baseLabel);
                textNode.textContent = title;
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
                let baseIdx = p._displayLabel ? p._displayLabel : (p.customLabel ? p.customLabel : String(idx + 1));
                wireRidgePath(p, baseIdx);
            });
        }
        if (window.cadCustomShapes) {
            let baseIdx = window.cadUnePolygons ? window.cadUnePolygons.length : 0;
            window.cadCustomShapes.forEach((p, idx) => {
                let baseIdxStr = p._displayLabel ? p._displayLabel : (p.customLabel ? p.customLabel : String(baseIdx + idx + 1));
                wireRidgePath(p, baseIdxStr);
            });
        }
        if (window.cadNakamichiMapPolygons) {
            window.cadNakamichiMapPolygons.forEach((p, lineIdx) => {
                p._svgPathNode = createPathNode('none', '#E91E63', true);
                p._svgPathNode.setAttribute('stroke-width', '8');
                p._svgPathNode.setAttribute('style', 'pointer-events: auto; cursor: move;');

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
    // 編集中の畝だけハンドル（全畝ハンドルは100本超で激重）
    handleStateId = 'edit:' + (editingId || '') + '|';
    if (editingId) {
        const allForHandle = [...(window.cadUnePolygons || []), ...(window.cadCustomShapes || [])];
        const ep = allForHandle.find(p => p && p.uneIndex === editingId);
        if (ep && ep.getPath) handleStateId += ep.getPath().getLength();
    }

    let handlesGroup = svg.querySelector('#cadSvgHandles');
    if (!light && handlesGroup && svg._lastHandleStateId !== handleStateId) {
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
        createHandlesForNakamichiLines();
    }
    
    const updatePathD = (poly, isLine = false) => {
        let path = poly.getPath();
        if (!path || path.getLength() === 0) return '';
        let d = '';
        for (let i = 0; i < path.getLength(); i++) {
            let pt = path.getAt(i);
            let screenPt = window.latLngToScreenPixel(pt.lat(), pt.lng());
            d += (i === 0 ? 'M' : 'L') + screenPt.x + ',' + screenPt.y + ' ';
        }
        if (!isLine) d += 'Z';
        return d;
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
        window.cadTargetPolygon._svgPathNode.setAttribute('d', updatePathD(window.cadTargetPolygon));
    }
    if (window.cadGridLines) {
        window.cadGridLines.forEach(l => {
            if (l._svgPathNode) l._svgPathNode.setAttribute('d', updatePathD(l, true));
        });
    }
    if (window.cadUnePolygons) {
        window.cadUnePolygons.forEach((p) => {
            if (p._svgPathNode) p._svgPathNode.setAttribute('d', updatePathD(p));
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
            if (p._svgPathNode) p._svgPathNode.setAttribute('d', updatePathD(p));
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
        window.cadNakamichiMapPolygons.forEach(p => {
            if (p._svgPathNode) p._svgPathNode.setAttribute('d', updatePathD(p, true));
        });
    }
    if (window.cadDrainageMapPolygons) {
        window.cadDrainageMapPolygons.forEach(p => {
            if (p._svgPathNode) p._svgPathNode.setAttribute('d', updatePathD(p, true));
        });
    }
    
    let tempLineNode = document.getElementById('cadSvgTempLine');
    if (tempLineNode) {
        if ((window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') && window.cadNakamichiIsDrawing && window.nakamichiTempLine) {
            tempLineNode.setAttribute('stroke', window.cadPinMode === 'drainage' ? '#00BCD4' : '#E91E63');
            if (window.cadPinMode === 'drainage') tempLineNode.setAttribute('stroke-dasharray', '8,8');
            else tempLineNode.removeAttribute('stroke-dasharray');
            tempLineNode.setAttribute('d', updatePathD(window.nakamichiTempLine, true));
            tempLineNode.style.display = 'block';
        } else {
            tempLineNode.style.display = 'none';
        }
    }
    
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
        }).join('|') + '_n' + (window.cadPinNumFontSize || 20);
    } else {
        pinsStateId = 'none_n' + (window.cadPinNumFontSize || 20);
    }
    let pinsGroup = svg ? svg.querySelector('#cadSvgPins') : null;
    // ドラッグ中はDOM再生成しない（毎回0,0に一瞬飛ぶ不具合を防ぐ）
    if (pinsGroup && svg._lastPinsStateId !== pinsStateId && !window.cadPinDragging) {
        svg._lastPinsStateId = pinsStateId;
        pinsGroup.innerHTML = '';
        
        if (window.cadPins) {
            let waterInCount = 0;
            let waterOutCount = 0;
            const numFontPx = Math.max(8, Math.min(48, parseFloat(window.cadPinNumFontSize) || 20));
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
                if (mk.cadPinType === 'water_in') {
                    waterInCount++;
                    iconStr = '💧';
                    numStr = String(waterInCount);
                } else if (mk.cadPinType === 'water_out') {
                    waterOutCount++;
                    iconStr = '🕳️';
                    numStr = String(waterOutCount);
                } else if (mk.cadPinType === 'parking_truck') {
                    iconStr = '🅿️';
                } else {
                    iconStr = '🚜';
                }
                
                let iconSpan = document.createElement('span');
                iconSpan.className = 'cad-pin-icon';
                iconSpan.textContent = iconStr;
                iconSpan.style.cssText = 'display:block; line-height:1;';
                div.appendChild(iconSpan);

                if (numStr) {
                    let numSpan = document.createElement('span');
                    numSpan.className = 'cad-pin-num';
                    numSpan.textContent = numStr;
                    numSpan.style.cssText = `position:absolute; left:50%; top:0; transform:translate(-50%, -110%); font-size:${numFontPx}px; font-weight:bold; color:#111; line-height:1; pointer-events:none; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;`;
                    div.appendChild(numSpan);
                }
                
                div.className = 'cad-equip-pin';
                div.style.cssText = 'font-size:24px; text-align:center; transform:translate(-50%, -50%) rotate(var(--label-rot)); position:absolute; left:50%; top:50%; pointer-events:auto; cursor:move; user-select:none; touch-action:none; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;';
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
                fo.setAttribute('width', '100');
                fo.setAttribute('height', '40');
                fo.setAttribute('style', 'overflow:visible; pointer-events:none;');
                let div = document.createElement('div');
                div.className = 'front-bar-label';
                div.style.cssText = 'color:#ffffff; background:#FF5722; padding:4px 8px; border-radius:4px; font-size:14px; font-weight:bold; text-align:center; white-space:nowrap; transform:translate(-50%, -50%); position:absolute; left:50%; top:50%; pointer-events:auto; cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.5);';
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
            fo.setAttribute('x', pt.x - 50);
            fo.setAttribute('y', pt.y - 20);
        } else {
            frontBarGroup.innerHTML = '';
        }
    }

    // SVG再構築で消えるため、GPS測位中ならプレビューを描き直す
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
    let customShapesData = window.cadCustomShapes.map(poly => ({ coords: poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })), group: poly.uneGroup || '', customLabel: poly.customLabel || '' }));
    let unePolygonsData = window.cadUnePolygons.map(poly => ({ coords: poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })), group: poly.uneGroup || '', customLabel: poly.customLabel || '' }));

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
        pinNumFontSize: window.cadPinNumFontSize || 20
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
    const undoBtn = document.getElementById('cadUndoBtn');
    const redoBtn = document.getElementById('cadRedoBtn');
    if (undoBtn) undoBtn.disabled = window.cadHistoryIndex <= 0;
    if (redoBtn) redoBtn.disabled = window.cadHistoryIndex >= window.cadHistory.length - 1;
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
    if (document.getElementById('cadMarginSide')) document.getElementById('cadMarginSide').value = state.marginSide || 0;
    if (document.getElementById('cadMarginEnd')) document.getElementById('cadMarginEnd').value = state.marginEnd || 0;
    if (typeof window.setCadPinNumFontSize === 'function') {
        window.setCadPinNumFontSize(state.pinNumFontSize || 20, { refresh: false });
    } else {
        window.cadPinNumFontSize = state.pinNumFontSize || 20;
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
            let cPath = shape.coords ? shape.coords : shape;
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
            let uPath = shape.coords ? shape.coords : shape;
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
    const wrapper = document.getElementById('cadMapWrapper');
    if (!wrapper || !window.cadMap) return null;
    const rect = wrapper.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = pageX - cx; const dy = pageY - cy;

    const theta = -(window.cadCurrentRotation || 0) * Math.PI / 180;
    const cosT = Math.cos(theta); const sinT = Math.sin(theta);
    const mapDx = dx * cosT - dy * sinT; const mapDy = dx * sinT + dy * cosT;

    const proj = window.cadMap.getProjection();
    if (!proj) return null;
    const scale = Math.pow(2, window.getCadZoom());
    const centerPt = proj.fromLatLngToPoint(window.cadMap.getCenter());
    return proj.fromPointToLatLng(new google.maps.Point(centerPt.x + mapDx / scale, centerPt.y + mapDy / scale));
};

window.handleMapClick = (pageX, pageY) => {
    if (document.getElementById('cadOverlay').style.display !== 'flex') return;

    const latLng = window.getPageLatLng(pageX, pageY);
    if (!latLng) return;

    if (!window.cadPinMode) {
        if (google.maps.geometry && google.maps.geometry.poly) {
            if (window.cadCustomShapes) {
                for (let i = window.cadCustomShapes.length - 1; i >= 0; i--) {
                    let poly = window.cadCustomShapes[i];
                    if (google.maps.geometry.poly.containsLocation(latLng, poly)) {
                        window.openCadEditModal(poly.uneIndex);
                        return;
                    }
                }
            }
            if (window.cadUnePolygons) {
                for (let i = window.cadUnePolygons.length - 1; i >= 0; i--) {
                    let poly = window.cadUnePolygons[i];
                    if (google.maps.geometry.poly.containsLocation(latLng, poly)) {
                        window.openCadEditModal(poly.uneIndex);
                        return;
                    }
                }
            }
        }
        return;
    }

    const msgEl = document.getElementById('cadPinModeMsg');

    if (window.cadPinMode === 'makuraune') {
        window.cadExecuteAddMakura(latLng);
        window.cadPinMode = null;
        if (msgEl) { msgEl.innerText = '💡 畝を直接タップすると、十字キーで移動や変形ができます。'; msgEl.style.color = "#FF9800"; }
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
        if (msgEl) { msgEl.innerText = '💡 畝を直接タップすると、十字キーで移動や変形ができます。'; msgEl.style.color = "#FF9800"; }
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
            const pt = turf.point([latLng.lng(), latLng.lat()]);
            
            let minD = Infinity;
            let bestBearing = 0;
            let bestLine = null;
            for (let i = 0; i < coords.length - 1; i++) {
                let line = turf.lineString([coords[i], coords[i+1]]);
                let d = turf.pointToLineDistance(pt, line, {units: 'meters'});
                if (d < minD) {
                    minD = d;
                    bestBearing = turf.bearing(turf.point(coords[i]), turf.point(coords[i+1]));
                    bestLine = line;
                }
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
                    ? `🎯 角度 ${angle}° とグリッドをこの辺に揃えました。「🔄 180°反転」で向きを反対にできます。`
                    : `🎯 角度をセットしました（${angle}°）。「🔄 180°反転」で向きを反対にできます。`;
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
        }
        window.cadPinMode = null;
        if (msgEl) { msgEl.innerText = `💡 畝を直接タップすると、十字キーで移動や変形ができます。`; msgEl.style.color = "#FF9800"; }
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

    if (mk.cadPinType === 'water_out' && typeof window.cadAutoAddDrainageLineForPin === 'function') {
        window.cadAutoAddDrainageLineForPin(latLng);
        if (window.cadUnePolygons && window.cadUnePolygons.length > 0 && typeof window.cadGenerateLines === 'function') {
            window.cadGenerateLines();
        }
    }

    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
    window.cadPinMode = null;
    if (typeof window.cadSetGpsBarVisible === 'function') window.cadSetGpsBarVisible(false);
    if (msgEl) {
        if (mk.cadPinType === 'water_out') {
            msgEl.innerText = '🕳️ 排水ピンを設置し、枕を切断しました！（ピンクの切断ラインや端のハンドルをドラッグして動かせます）';
            msgEl.style.color = '#E91E63';
        } else {
            msgEl.innerText = `💡 畝を直接タップすると、十字キーで移動や変形ができます。`;
            msgEl.style.color = '#FF9800';
        }
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
            if (currEl.innerText && (currEl.innerText.includes('💧') || currEl.innerText.includes('🕳️') || currEl.innerText.includes('🅿️') || currEl.innerText.includes('🚜') || currEl.innerText.includes('🛻'))) {
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
                    strokeColor: window.cadPinMode === 'drainage' ? '#00BCD4' : '#E91E63', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 6),
                    map: window.cadMap, zIndex: 9999
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
                window.nakamichiTempLine.setPath([window.nakamichiTempPt, currentLatLng]);
            }
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
                    let path = [{ lat: window.nakamichiTempPt.lat(), lng: window.nakamichiTempPt.lng() }, { lat: endLatLng.lat(), lng: endLatLng.lng() }];
                    if (window.cadPinMode === 'drainage') {
                        window.cadDrainageLines.push(path);
                        window.drawDrainageVisual(path);
                    } else {
                        window.cadNakamichiLines.push(path);
                        window.drawNakamichiVisual(path);
                        try { window.cadSplitMakuraByNakamichi(path); } catch (e) {}
                    }
                    
                    window.cadPinMode = null;
                    const msgEl = document.getElementById('cadPinModeMsg');
                    if (msgEl) { msgEl.innerText = `💡 畝を直接タップすると、十字キーで移動や変形ができます。`; msgEl.style.color = "#FF9800"; }
                    
                    if (window.cadUnePolygons.length > 0) window.cadGenerateLines();
                    else window.saveCadStateToHistory();
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
                        strokeColor: window.cadPinMode === 'drainage' ? '#00BCD4' : '#E91E63', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 6),
                        map: window.cadMap, zIndex: 9999
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

            let displayAngle = Math.round(-window.cadCurrentRotation) % 360;
            if (displayAngle < 0) displayAngle += 360;
            document.getElementById('cadAngle').value = displayAngle;

        } else if (e.touches.length === 1 && lastTouchX !== null && lastTouchY !== null) {
            const currentX = e.touches[0].pageX; const currentY = e.touches[0].pageY;

            if ((window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') && window.cadNakamichiIsDrawing && window.nakamichiTempPt) {
                if (e.cancelable) { e.preventDefault(); }
                e.stopPropagation();
                const currentLatLng = window.getPageLatLng(currentX, currentY);
                if (currentLatLng && window.nakamichiTempLine) {
                    window.nakamichiTempLine.setPath([window.nakamichiTempPt, currentLatLng]);
                }
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
                        let path = [{ lat: window.nakamichiTempPt.lat(), lng: window.nakamichiTempPt.lng() }, { lat: endLatLng.lat(), lng: endLatLng.lng() }];
                        if (window.cadPinMode === 'drainage') {
                            window.cadDrainageLines.push(path);
                            window.drawDrainageVisual(path);
                        } else {
                            window.cadNakamichiLines.push(path);
                            window.drawNakamichiVisual(path);
                            try { window.cadSplitMakuraByNakamichi(path); } catch (e) {}
                        }
                        
                        window.cadPinMode = null;
                        const msgEl = document.getElementById('cadPinModeMsg');
                        if (msgEl) { msgEl.innerText = `💡 畝を直接タップすると、十字キーで移動や変形ができます。`; msgEl.style.color = "#FF9800"; }
                        
                        if (window.cadUnePolygons.length > 0) window.cadGenerateLines();
                        else window.saveCadStateToHistory();
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

window.openCADMode = async (id) => {
    infoWindow.close();
    window.cadTargetId = id;
    const p = loadedPolygons[id];
    const cadLoad = (window.AppLoading && AppLoading.start)
        ? AppLoading.start({ label: 'CADを準備中...', detail: '1/4 地図を初期化しています', current: 0, total: 4, delay: 0 })
        : null;

    document.getElementById('cadTargetName').innerText = p.name + " (最新の図面を読込中...)";
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
    if (cadLoad) cadLoad.update({ label: '最新図面を取得中...', detail: '2/4 保存履歴を確認しています', current: 1, total: 4 });

    try {
        const history = await callGAS('getPolygonDrawingHistory', { id });
        if (history && history.length > 0 && history[0].data) {
            p.uneSimData = history[0].data;
        }
    } catch (e) {
        console.error("CAD最新データ取得エラー:", e);
    }
    document.getElementById('cadTargetName').innerText = p.name;

    window.cadWidthLinkedFromPlan = false;
    if (cadLoad) cadLoad.update({ label: 'CAD設定を取得中...', detail: '3/4 畝幅マスタを読み込んでいます', current: 2, total: 4 });
    await window.loadCadWidthOptionsFromMaster();
    window.setCadWidthCm(null, { updatePreview: false });

    if (p.uneSimData) {
        try {
            const saved = JSON.parse(p.uneSimData);
            const savedRenderTotal = (saved.pins || []).length + (saved.nakamichiLines || []).length +
                (saved.customShapes || []).length + (saved.unePolygons || []).length;
            if (cadLoad) cadLoad.update({
                label: '保存図面を描画中...',
                detail: `4/4 ${savedRenderTotal} 要素を復元しています`,
                current: 3,
                total: 4
            });
            document.getElementById('cadAngle').value = saved.angle !== undefined ? saved.angle : 0;
            // 基準畝幅は計画連動時のみ自動選択。保存値では選択しない
            document.getElementById('cadUneCount').value = saved.uneCount !== undefined ? saved.uneCount : 0;
            
            const marginSideEl = document.getElementById('cadMarginSide');
            const marginEndEl = document.getElementById('cadMarginEnd');
            if (marginSideEl) marginSideEl.value = saved.marginSide !== undefined ? saved.marginSide : 150;
            if (marginEndEl) marginEndEl.value = saved.marginEnd !== undefined ? saved.marginEnd : 250;
            if (typeof window.setCadPinNumFontSize === 'function') {
                window.setCadPinNumFontSize(saved.pinNumFontSize || 20, { refresh: false });
            } else {
                window.cadPinNumFontSize = saved.pinNumFontSize || 20;
            }

            if (saved.pins) {
                saved.pins.forEach(pin => {
                    const mk = new google.maps.Marker({
                        position: { lat: pin.lat, lng: pin.lng }, map: window.cadMap, visible: false
                    });
                    mk.cadPinType = pin.type;
                    window.cadPins.push(mk);
                });
            }

            if (saved.nakamichiLines) {
                window.cadNakamichiLines = saved.nakamichiLines;
                window.cadNakamichiLines.forEach(line => window.drawNakamichiVisual(line));
            }
            if (window.cadFrontBaselineMarker) { window.cadFrontBaselineMarker.setMap(null); window.cadFrontBaselineMarker = null; }
            if (saved.frontBaseline) {
                window.cadFrontBaseline = saved.frontBaseline;
                if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
            }
            if (saved.customShapes) {
                saved.customShapes.forEach((item, idx) => {
                    let cPath = Array.isArray(item) ? item : item.coords;
                    let uGroup = Array.isArray(item) ? '' : (item.group || '');
                    let gPoly = window.cadCreateRidgePolygon(cPath, { fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A' });
                    gPoly.uneIndex = 'custom_' + idx;
                    gPoly.uneGroup = uGroup;
                    window.bindShapeHistoryEvents(gPoly);
                    window.cadCustomShapes.push(gPoly);
                });
            }
            if (saved.unePolygons) {
                saved.unePolygons.forEach((item, idx) => {
                    let uPath = Array.isArray(item) ? item : item.coords;
                    let uGroup = Array.isArray(item) ? '' : (item.group || '');
                    let gPoly = window.cadCreateRidgePolygon(uPath, { fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A' });
                    gPoly.uneIndex = 'une_' + idx;
                    gPoly.uneGroup = uGroup;
                    window.bindShapeHistoryEvents(gPoly);
                    window.cadUnePolygons.push(gPoly);
                });
            } else {
                // 畝未生成の保存データ：畝幅未選択なら自動生成しない
                if (window.getCadWidthCm()) cadGenerateLines();
            }
            window.reassignLabels();
            switchCadTab(2);
        } catch (e) { }
    } else {
        document.getElementById('cadAngle').value = 0;
        
        const marginSideEl = document.getElementById('cadMarginSide');
        const marginEndEl = document.getElementById('cadMarginEnd');
        if (marginSideEl) marginSideEl.value = 150;
        if (marginEndEl) marginEndEl.value = 250;
        
        const countEl = document.getElementById('cadUneCount');
        if (countEl) countEl.value = 0;
    }

    // 栽培計画でこの圃場が選ばれていれば、計画の畝間を基準畝幅に連動
    await window.applyCultivationPlanWidthToCad(id);
    if (cadLoad) cadLoad.update({ label: 'CADの準備が完了しました', detail: '4/4 図面を表示しました', current: 4, total: 4 });

    // 起動直後の状態を履歴0番目として保存
    setTimeout(() => {
        window.cadHistory = [];
        window.cadHistoryIndex = -1;
        window.saveCadStateToHistory();
    }, 500);
    } finally {
        if (cadLoad) cadLoad.done();
    }
};

window.closeCADMode = () => {
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
window.cadWidthOptions = window.CAD_DEFAULT_RIDGE_WIDTHS_CM.slice();
window.cadWidthLinkedFromPlan = false;

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

window.refreshCadWidthButtons = (selectedCm) => {
    const wrap = document.getElementById('cadWidthChoices');
    if (!wrap) return;
    const selected = (selectedCm != null && selectedCm !== '' && parseFloat(selectedCm) > 0)
        ? String(Math.round(parseFloat(selectedCm)))
        : '';
    const options = (window.cadWidthOptions && window.cadWidthOptions.length)
        ? window.cadWidthOptions
        : window.CAD_DEFAULT_RIDGE_WIDTHS_CM;

    wrap.innerHTML = '';
    options.forEach(cm => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = selected === String(cm);
        btn.textContent = cm + 'cm';
        btn.style.cssText = isActive
            ? 'padding:5px 10px;border:1px solid #388E3C;border-radius:4px;background:#4CAF50;color:#fff;cursor:pointer;font-size:12px;font-weight:bold;line-height:1.2;white-space:nowrap;'
            : 'padding:5px 10px;border:1px solid #666;border-radius:4px;background:#333;color:#eee;cursor:pointer;font-size:12px;line-height:1.2;white-space:nowrap;';
        btn.onmouseenter = function() {
            if (!isActive) btn.style.borderColor = '#4CAF50';
        };
        btn.onmouseleave = function() {
            if (!isActive) btn.style.borderColor = '#666';
        };
        btn.onclick = function() {
            window.cadWidthLinkedFromPlan = false;
            window.setCadWidthCm(cm);
        };
        wrap.appendChild(btn);
    });

    const hint = document.getElementById('cadWidthHint');
    if (hint) {
        if (selected) {
            hint.textContent = window.cadWidthLinkedFromPlan
                ? `栽培計画の畝間と連動中（${selected}cm）`
                : `選択中: ${selected}cm`;
            hint.style.color = window.cadWidthLinkedFromPlan ? '#4CAF50' : '#aaa';
        } else {
            hint.textContent = '未選択（栽培プリセットの畝間から選んでください）';
            hint.style.color = '#FF9800';
        }
    }
};

/** 栽培マスタ／プリセットから畝間候補を読み込みボタン化 */
window.loadCadWidthOptionsFromMaster = async () => {
    const set = new Set(window.CAD_DEFAULT_RIDGE_WIDTHS_CM);
    try {
        let data = null;
        if (typeof callGAS === 'function') {
            try {
                data = await callGAS('getCultivationMaster');
                if (data) {
                    try { localStorage.setItem('cpMasterDataCache', JSON.stringify(data)); } catch (e) {}
                }
            } catch (e) {
                console.warn('getCultivationMaster失敗、キャッシュを使用:', e);
            }
        }
        if (!data) {
            try {
                const cached = localStorage.getItem('cpMasterDataCache');
                if (cached) data = JSON.parse(cached);
            } catch (e) {}
        }
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
    } catch (e) {
        console.warn('畝幅候補の取得に失敗:', e);
    }
    window.cadWidthOptions = Array.from(set).sort((a, b) => a - b);
    window.refreshCadWidthButtons(window.getCadWidthCm());
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
    const mode1 = document.getElementById('cadMode1');
    const mode2 = document.getElementById('cadMode2');
    const mode3 = document.getElementById('cadMode3');
    const mode4 = document.getElementById('cadMode4');
    if (mode1) mode1.style.display = tab === 1 ? 'block' : 'none';
    if (mode2) mode2.style.display = tab === 2 ? 'block' : 'none';
    if (mode3) mode3.style.display = tab === 3 ? 'block' : 'none';
    if (mode4) mode4.style.display = tab === 4 ? 'block' : 'none';
    const tab1 = document.getElementById('cadTab1');
    const tab2 = document.getElementById('cadTab2');
    const tab3 = document.getElementById('cadTab3');
    const tab4 = document.getElementById('cadTab4');
    if (tab1) { tab1.style.background = tab === 1 ? '#FF9800' : '#222'; tab1.style.color = tab === 1 ? '#fff' : '#aaa'; }
    if (tab2) { tab2.style.background = tab === 2 ? '#2196F3' : '#222'; tab2.style.color = tab === 2 ? '#fff' : '#aaa'; }
    if (tab3) { tab3.style.background = tab === 3 ? '#7B1FA2' : '#222'; tab3.style.color = tab === 3 ? '#fff' : '#aaa'; }
    if (tab4) { tab4.style.background = tab === 4 ? '#4CAF50' : '#222'; tab4.style.color = tab === 4 ? '#fff' : '#aaa'; }
    if (tab === 3 && typeof window.cadPreviewRidgeNumberSplit === 'function') {
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

window.cadPreviewRidgeNumberSplit = () => {
    const el = document.getElementById('cadSplitPreview');
    if (!el) return;
    const built = window.cadBuildRidgeNumberSplitPlan(window.cadReadRidgeNumberSplitOptions());
    if (!built.ok) {
        el.innerHTML = '<span style="color:#ef9a9a;">' + (built.message || '分割できません') + '</span>';
        return;
    }
    const fmt = window.formatCadUneGroupDisplayName || ((x) => x);
    const lines = built.groups.map((g) => {
        return `・${fmt(g.name)}: 元畝番号 ${g.labels.join(', ')}（${g.count}畝）`;
    });
    const lastN = built.groups.length;
    const dirLabel = built.direction === 'reverse' ? '逆向き（最終畝側から）' : '生成順（1番側から）';
    el.innerHTML =
        '<div style="color:#ce93d8;margin-bottom:4px;">' + built.message + '</div>' +
        '<div>向き: ' + dirLabel + '</div>' +
        '<div>端（空き）: 開始側 ' + built.endStart + '本（/1番）… 終了側 ' + built.endFinish + '本（' + lastN + '番/）</div>' +
        '<div>空け: 隣り合う分割番号（例 1番/2番）</div>' +
        lines.map((l) => '<div>' + l + '</div>').join('');
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
        try { switchCadTab(3); } catch (e) {}
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
    let displayAngle = Math.round(-window.cadCurrentRotation) % 360;
    if (displayAngle < 0) displayAngle += 360;
    document.getElementById('cadAngle').value = displayAngle;
    updateCadPreviewCount();
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
    const msgEl = document.getElementById('cadPinModeMsg'); if (msgEl) msgEl.innerText = "💡 畝を直接タップすると、十字キーで移動や変形ができます。";
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

window.cadSetPinMode = (type) => {
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
        if (msgEl) { msgEl.innerText = `【中道ライン】始点となる場所をタップしてください`; msgEl.style.color = "#E91E63"; }
    } else if (type === 'drainage') {
        window.nakamichiTempPt = null;
        if (msgEl) { msgEl.innerText = `【排水ライン】始点となる場所をタップしてください`; msgEl.style.color = "#00BCD4"; }
    } else if (type === 'snap_line') {
        if (msgEl) { msgEl.innerText = `【角度合わせ】基準にしたい外周の直線をタップしてください`; msgEl.style.color = "#4CAF50"; }
    } else if (isEquipPin) {
        const name = type === 'water_in' ? '💧 吸水ピン' : type === 'water_out' ? '🕳️ 排水ピン' : type === 'parking_truck' ? '🅿️ 駐車場' : '🚜 機械侵入口';
        if (msgEl) { msgEl.innerText = `【${name}】配置場所をタップ！（または下のGPSで置く）`; msgEl.style.color = "#03A9F4"; }
        window.cadGpsPinType = type;
        window.cadUpdateGpsUi({ status: `選択中: ${name} → 「GPSで置く」か地図タップ` });
    }
};

window.cadGpsPinTypeLabel = (type) => {
    if (type === 'water_in') return '💧 吸水';
    if (type === 'water_out') return '🕳️ 排水';
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
    const n = Math.max(8, Math.min(48, Math.round(parseFloat(px) || 20)));
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
    const cur = parseFloat(window.cadPinNumFontSize) || 20;
    window.setCadPinNumFontSize(cur + (parseFloat(delta) || 0));
};

window.drawNakamichiVisual = (path) => {
    if (!window.cadNakamichiMapPolygons) window.cadNakamichiMapPolygons = [];
    if (!path || path.length < 2) return;

    let line = new google.maps.Polyline({
        path: path,
        strokeColor: '#E91E63',
        strokeOpacity: 0.85,
        strokeWeight: Math.max(0.5, 6),
        map: window.cadMap,
        zIndex: 10,
        draggable: true,
        editable: true
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
    const cutBuf = turf.buffer(centerLine, 0.45 / 1000, { units: 'kilometers' });
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
        if (typeof customAlert === 'function') customAlert('排水口ピン（🕳️）が配置されていません。');
        else alert('排水口ピン（🕳️）が配置されていません。');
        return;
    }
    const waterOutPins = window.cadPins.filter(mk => mk.cadPinType === 'water_out');
    if (!waterOutPins.length) {
        if (typeof customAlert === 'function') customAlert('排水口ピン（🕳️）が見つかりません。まず「排水ピン」を配置してください。');
        else alert('排水口ピン（🕳️）が見つかりません。まず「排水ピン」を配置してください。');
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
    window.cadPinMode = 'makuraune';
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = '枕畝：外殻（辺）の近くをタップすると、その外周に沿った曲がった枕畝を生成します。';
        msgEl.style.color = "#ea580c";
    }
};

/** 方位角の最小差（0〜180） */
window.cadBearingDiff = (a, b) => {
    let d = Math.abs(Number(a) - Number(b)) % 360;
    if (d > 180) d = 360 - d;
    return d;
};

/**
 * タップ点に近い圃場外周の辺を起点に、角度が近い連続辺をたどる
 * @returns {number[][]} [lng,lat] の折れ線（外殻に追随）
 */
window.cadFindBoundaryEdgeChainNearPoint = (ringCoords, centerPt, maxAngleDiffDeg) => {
    const coords = ringCoords;
    if (!coords || coords.length < 2) return null;
    const maxDiff = (maxAngleDiffDeg != null) ? maxAngleDiffDeg : 40;

    let best = { dist: Infinity, i: 0 };
    for (let i = 0; i < coords.length - 1; i++) {
        const a = coords[i];
        const b = coords[i + 1];
        if (!a || !b) continue;
        // ごく短い辺は無視
        if (turf.distance(turf.point(a), turf.point(b), { units: 'meters' }) < 0.15) continue;
        const line = turf.lineString([a, b]);
        const d = turf.pointToLineDistance(centerPt, line, { units: 'meters' });
        if (d < best.dist) best = { dist: d, i };
    }
    if (!isFinite(best.dist)) return null;

    const startBearing = turf.bearing(turf.point(coords[best.i]), turf.point(coords[best.i + 1]));
    let i0 = best.i;
    let i1 = best.i + 1;

    while (i0 > 0) {
        const b = turf.bearing(turf.point(coords[i0 - 1]), turf.point(coords[i0]));
        if (window.cadBearingDiff(b, startBearing) > maxDiff) break;
        if (turf.distance(turf.point(coords[i0 - 1]), turf.point(coords[i0]), { units: 'meters' }) < 0.15) break;
        i0--;
    }
    while (i1 < coords.length - 1) {
        const b = turf.bearing(turf.point(coords[i1]), turf.point(coords[i1 + 1]));
        if (window.cadBearingDiff(b, startBearing) > maxDiff) break;
        if (turf.distance(turf.point(coords[i1]), turf.point(coords[i1 + 1]), { units: 'meters' }) < 0.15) break;
        i1++;
    }

    const chain = coords.slice(i0, i1 + 1);
    if (chain.length < 2) return null;
    return { chain: chain, nearestDist: best.dist, startBearing: startBearing };
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
 * 圃場ポリゴン内で、枕帯が左右（長手方向）に端まで届くよう補正する。
 * タップ辺方向に長い帯を作り直し、圃場∩帯で左右端まで埋める。
 */
window.cadStretchMakuraToFieldSides = (makuraPoly, fieldPoly, edgeChain, widthM) => {
    try {
        if (!makuraPoly || !fieldPoly || !edgeChain || edgeChain.length < 2) return makuraPoly;
        const w = Math.max(Number(widthM) || 1.5, 0.5);

        // 辺の中点と方位
        const midIdx = Math.floor((edgeChain.length - 1) / 2);
        const a = edgeChain[Math.max(0, midIdx)];
        const b = edgeChain[Math.min(edgeChain.length - 1, midIdx + 1)];
        const alongBearing = turf.bearing(turf.point(a), turf.point(b));
        const center = turf.center(makuraPoly);

        // 圃場対角線より十分長い帯を長手方向に作る
        const bbox = turf.bbox(fieldPoly);
        const diag = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], { units: 'meters' }) + 20;
        const p1 = turf.destination(center, diag / 2, alongBearing, { units: 'meters' });
        const p2 = turf.destination(center, diag / 2, alongBearing + 180, { units: 'meters' });
        const longLine = turf.lineString([
            p2.geometry.coordinates,
            p1.geometry.coordinates
        ]);
        // 端欠け防止でさらに延長してからバッファ
        const extended = window.cadExtendLineStringEnds(longLine, Math.max(w * 4, 8));
        const strip = turf.buffer(extended, w / 2, { units: 'meters' });
        if (!strip) return makuraPoly;

        let stretched = turf.intersect(fieldPoly, strip);
        if (!stretched) return makuraPoly;

        // 元の枕と合成（欠けた左右を補完しつつ、元の形状も維持）
        try {
            const united = turf.union(makuraPoly, stretched);
            if (united) {
                const clipped = turf.intersect(fieldPoly, united);
                if (clipped) return clipped;
            }
        } catch (eUnion) {}
        return stretched;
    } catch (e) {
        console.warn('cadStretchMakuraToFieldSides failed:', e);
        return makuraPoly;
    }
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

    // --- 外殻追随: 近い辺＋角度の近い連続辺に沿った帯 ---
    // 外殻線中心のバッファは外側にも広がるため、半径=畝幅で圃場内に約1畝幅の帯になる
    let continuousStrip = null;
    let finalPoly = null;
    let usedEdgeChain = null;
    // 角まで辿りやすいよう角度許容を少し広めに
    const edgeInfo = window.cadFindBoundaryEdgeChainNearPoint(coords, centerPt, 55);
    if (edgeInfo && edgeInfo.chain && edgeInfo.chain.length >= 2) {
        try {
            usedEdgeChain = edgeInfo.chain;
            let edgeLine = turf.lineString(edgeInfo.chain);
            // バッファの丸端で左右が欠けるのを防ぐため、両端を延長してから帯にする
            edgeLine = window.cadExtendLineStringEnds(edgeLine, Math.max(actualWidthM * 4, 8));
            const strip = turf.buffer(edgeLine, actualWidthM, { units: 'meters' });
            if (strip) continuousStrip = turf.intersect(tPoly, strip);
            // 圃場の左右端まで届くよう補正
            if (continuousStrip) {
                continuousStrip = window.cadStretchMakuraToFieldSides(continuousStrip, tPoly, edgeInfo.chain, actualWidthM);
            }
            finalPoly = continuousStrip;
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

    // difference 後に左右が欠けた場合の再補正
    if (differenced && usedEdgeChain) {
        try {
            const stretched = window.cadStretchMakuraToFieldSides(differenced, tPoly, usedEdgeChain, actualWidthM);
            if (stretched) {
                let repaired = stretched;
                for (let av of avoidPolys) {
                    if (!repaired) break;
                    try { repaired = turf.difference(repaired, av); } catch (e2) {}
                }
                if (repaired) differenced = repaired;
            }
        } catch (e3) {}
    }

    // 外殻に沿った連続1本を優先。差分解で2本以上に割れたら連続帯にフォールバック
    const pickMaxDist = Math.max(actualWidthM * 1.35, 2.5);
    let chosenFeature = null;
    if (differenced) {
        const flatDiff = turf.flatten(differenced);
        const nearCount = (flatDiff.features || []).filter((f) => {
            try {
                if (!f || !f.geometry) return false;
                const c = turf.center(f);
                if (usedEdgeChain && usedEdgeChain.length >= 2) {
                    return turf.pointToLineDistance(c, turf.lineString(usedEdgeChain), { units: 'meters' }) <= pickMaxDist;
                }
                return turf.distance(c, centerPt, { units: 'meters' }) <= pickMaxDist;
            } catch (e) { return false; }
        }).length;

        if (nearCount <= 1) {
            chosenFeature = window.cadPickBestMakuraFeature(flatDiff, centerPt, usedEdgeChain, pickMaxDist);
        }
    }
    // 割れ・消失時は外枠〜畝の間を埋める連続帯をそのまま使う（1本のみ）
    if (!chosenFeature && continuousStrip) {
        const flatCont = turf.flatten(continuousStrip);
        chosenFeature = window.cadPickBestMakuraFeature(flatCont, centerPt, usedEdgeChain, pickMaxDist)
            || (flatCont.features && flatCont.features[0]) || null;
    }

    if (!chosenFeature) {
        alert("既存の畝と完全に重なっているため、枕畝を生成するスペースがありません。");
        return;
    }

    let coordinates = chosenFeature.geometry.coordinates;
    if (!coordinates || coordinates.length === 0) {
        alert("枕畝を生成できるスペースがありませんでした。");
        return;
    }
    // Polygon / 穴あきに対応（MultiPolygon の場合は最大面積の1面だけ）
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
        msgEl.innerText = '枕畝を外殻に沿って1本生成しました（外枠と畝の間を埋めています）';
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
            return turf.buffer(centerLine, 0.5 / 1000, { units: 'kilometers' });
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

window.cadGenerateLines = () => {
    try {
        if (!window.cadTargetId) return;

        if (typeof window.getCadWidthCm === 'function' && !window.getCadWidthCm()) {
            alert('⚠️ 基準の畝幅を選択してください（栽培プリセットの畝間から選べます）');
            return;
        }

        const angleEl = document.getElementById('cadAngle');
        const countEl = document.getElementById('cadUneCount');

        const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;
        const uneCount = countEl && countEl.value ? parseInt(countEl.value) : 0;

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
            return turf.buffer(centerLine, 0.5 / 1000, { units: 'kilometers' });
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

        const lineLen = diagDist + 40;
        let rects = [];

        for (let i = 0; i < uneCount; i++) {
            let offset = startOffset + i * actualWidthM;
            let direction = offset >= 0 ? growDirection : growDirection + 180;
            let absOffset = Math.abs(offset);
            let oPt = turf.destination(baseOrigin, absOffset, direction, { units: 'meters' });

            let pt1 = turf.destination(oPt, lineLen / 2, angle, { units: 'meters' });
            let ratio = typeof window.cadRidgeGapRatio !== 'undefined' ? (1 - window.cadRidgeGapRatio) : 0.8;
            let w = actualWidthM * ratio;
            
            let checkValid = (dist) => {
                let c = turf.destination(pt1, dist, angle + 180, {units: 'meters'});
                // 側面余白は配置オフセット側で既に確保済み。
                // ここへ足すと畝端が過剰に短くなり、外枠〜畝の間が空きすぎるため畝幅のみで判定する。
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
                } else {
                    if (currentSegment) {
                        let fine_d = currentSegment.end;
                        while (fine_d + 0.1 <= d && checkValid(fine_d + 0.1)) {
                            fine_d += 0.1;
                        }
                        currentSegment.end = fine_d;
                        if (currentSegment.end - currentSegment.start >= 1.0) validSegments.push(currentSegment);
                        currentSegment = null;
                    }
                }
            }
            if (currentSegment) {
                let fine_d = currentSegment.end;
                while (fine_d + 0.1 <= lineLen && checkValid(fine_d + 0.1)) {
                    fine_d += 0.1;
                }
                currentSegment.end = fine_d;
                if (currentSegment.end - currentSegment.start >= 1.0) {
                    validSegments.push(currentSegment);
                }
            }
            
            validSegments.forEach(seg => {
                let sPt = turf.destination(pt1, seg.start, angle + 180, {units: 'meters'});
                let ePt = turf.destination(pt1, seg.end, angle + 180, {units: 'meters'});
                
                let p1 = turf.destination(sPt, w / 2, angle + 90, {units: 'meters'}).geometry.coordinates;
                let p2 = turf.destination(sPt, w / 2, angle - 90, {units: 'meters'}).geometry.coordinates;
                let p3 = turf.destination(ePt, w / 2, angle - 90, {units: 'meters'}).geometry.coordinates;
                let p4 = turf.destination(ePt, w / 2, angle + 90, {units: 'meters'}).geometry.coordinates;
                
                rects.push(turf.polygon([[p1, p2, p3, p4, p1]]));
            });
        }

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
window.openCadEditModal = (idx) => {
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
    let customShapesData = window.cadCustomShapes.map(poly => ({ coords: poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })), group: poly.uneGroup || '', customLabel: poly.customLabel || '' }));
    let unePolygonsData = window.cadUnePolygons.map(poly => ({ coords: poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })), group: poly.uneGroup || '', customLabel: poly.customLabel || '' }));

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
        pinNumFontSize: window.cadPinNumFontSize || 20
    });

    p.uneSimData = simDataStr;
    const saveBtn = document.querySelector('button[onclick="saveUneSim()"]');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) saveBtn.innerHTML = '⏳ 保存中...';
    
    try {
        await callGAS('updatePolygon', { id: p.id, name: p.name, uneSimData: simDataStr, userName: currentUser });
        alert("💾 描画した地形とピンをすべて保存しました！");
        window.closeCADMode();
    } catch (e) {
        console.error(e);
        alert("保存中にエラーが発生しました。");
    } finally {
        if (saveBtn) saveBtn.innerHTML = originalText;
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
        const history = await callGAS('getPolygonDrawingHistory', { id: window.cadTargetId });
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
            btn.onclick = () => {
                if (confirm(item.date + ' の状態を復元しますか？現在の未保存の編集は失われます。')) {
                    window.loadCadHistoryData(item.data);
                    document.getElementById('cadHistoryModal').style.display = 'none';
                }
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
    alert("この畝以降をすべて「" + (group || '未設定') + "」に設定しました。");
};



// === Grid Copy Feature ===

