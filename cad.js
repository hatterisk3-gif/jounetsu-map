// 🚜 農業CAD専用JavaScript（admin.htmlから切り出し）
// 🚜 新・農業CADシステム（地形設計特化版）
window.cadMap = null;
window.cadTargetId = null;
window.cadTargetPolygon = null;
window.cadUnePolygons = [];
window.cadPins = [];
window.cadPinMode = null;
window.cadUneLabels = [];
window.cadNakamichiLines = [];
window.cadNakamichiMapPolygons = [];
window.cadDrainageLines = [];
window.cadDrainageMapPolygons = [];
window.cadCustomShapes = [];
window.cadGridLines = [];
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

// 🌟 ラベル位置更新のスロットリング用関数
window.updateCadLabelPositionsThrottled = () => {
    // 🌟 修正：ドラッグ中のスキップを廃止し、常に追従させる
    const now = performance.now();
    const limit = 60; // 🌟 より滑らかに追従させるため60msに変更

    if (now - lastLabelPositionsTime >= limit) {
        if (labelPositionsTimeout) {
            clearTimeout(labelPositionsTimeout);
            labelPositionsTimeout = null;
        }
        window.updateCadLabelPositions();
        lastLabelPositionsTime = now;
    } else {
        if (!labelPositionsTimeout) {
            labelPositionsTimeout = setTimeout(() => {
                window.updateCadLabelPositions();
                lastLabelPositionsTime = performance.now();
                labelPositionsTimeout = null;
            }, limit - (now - lastLabelPositionsTime));
        }
    }
};

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
    if (window.cadTargetPolygon) window.cadTargetPolygon.setOptions({ strokeWeight: Math.max(0.5, 3 / scale) });
    if (window.cadUnePolygons) window.cadUnePolygons.forEach(p => p.setOptions({ strokeWeight: Math.max(0.5, 2 / scale) }));
    if (window.cadCustomShapes) window.cadCustomShapes.forEach(p => p.setOptions({ strokeWeight: Math.max(0.5, 2 / scale) }));
    if (window.cadNakamichiMapPolygons) window.cadNakamichiMapPolygons.forEach(l => l.setOptions({ strokeWeight: Math.max(0.5, 6 / scale) }));
    if (window.cadGridLines) window.cadGridLines.forEach(l => l.setOptions({ strokeWeight: Math.max(0.5, 2 / scale) }));
};

let cadMapTransformRAF = null;
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

            // 🌟 追加：線の太さを拡大率の逆数で補正する
            if (typeof window.updateCadStrokeWeights === 'function') {
                window.updateCadStrokeWeights(apparentScale);
            }
        }
        if (typeof window.updateCadLabelPositionsThrottled === 'function') {
            window.updateCadLabelPositionsThrottled();
        }
        if (typeof window.updateCadSvgOverlay === 'function') {
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

window.updateCadSvgOverlay = () => {
    let svg = document.getElementById('cadSvgOverlay');
    if (!svg) return;
    
    let currentPolysLength = (window.cadUnePolygons ? window.cadUnePolygons.length : 0) + 
                             (window.cadCustomShapes ? window.cadCustomShapes.length : 0) + 
                             (window.cadNakamichiMapPolygons ? window.cadNakamichiMapPolygons.length : 0) +
                             (window.cadDrainageMapPolygons ? window.cadDrainageMapPolygons.length : 0);
                             
    if (window.cadSvgNeedsRebuild || !svg.querySelector('#cadSvgPaths') || svg._lastPolysLength !== currentPolysLength) {
        svg._lastPolysLength = currentPolysLength;
        let html = '<defs><filter id="hover-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/></filter></defs>' +
                   '<g id="cadSvgPaths"></g><g id="cadSvgTexts"></g><g id="cadSvgHandles"></g><g id="cadSvgPins"></g><g id="front-bar" style="filter: url(#hover-shadow);"></g>';
        svg.innerHTML = html;
        let pathsGroup = svg.querySelector('#cadSvgPaths');
        let textsGroup = svg.querySelector('#cadSvgTexts');
        let handlesGroup = svg.querySelector('#cadSvgHandles');
        
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
        
        if (window.cadTargetPolygon) {
            window.cadTargetPolygon._svgPathNode = createPathNode('#D7CCC8', '#8BC34A');
            window.cadTargetPolygon._svgPathNode.setAttribute('fill-opacity', '0.4');
            window.cadTargetPolygon._svgPathNode.setAttribute('stroke-opacity', '1.0');
            window.cadTargetPolygon._svgPathNode.setAttribute('stroke-width', '3');
            pathsGroup.appendChild(window.cadTargetPolygon._svgPathNode);
        }
        
        if (window.cadUnePolygons) {
            window.cadUnePolygons.forEach((p, idx) => {
                p._svgPathNode = createPathNode(window.cadGetGroupColor ? window.cadGetGroupColor(p.uneGroup) : '#8BC34A', '#558B2F');
                p._svgPathNode.setAttribute('style', 'pointer-events: auto; cursor: pointer; transition: filter 0.2s;');
                p._svgPathNode.addEventListener('mouseover', () => p._svgPathNode.setAttribute('filter', 'url(#hover-shadow)'));
                p._svgPathNode.addEventListener('mouseout', () => p._svgPathNode.removeAttribute('filter'));
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
                textNode.setAttribute('style', 'pointer-events: none; paint-order: stroke; stroke: #000000; stroke-width: 4px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;');
                let baseIdx = p._displayLabel ? p._displayLabel : (p.customLabel ? p.customLabel : String(idx + 1));
                let labelStr = baseIdx; if (p.uneGroup && p.uneGroup !== 'default') labelStr += ' (' + p.uneGroup + ')'; textNode.textContent = labelStr;
                p._svgTextNode = textNode;
                textsGroup.appendChild(textNode);
            });
        }
        if (window.cadCustomShapes) {
            let baseIdx = window.cadUnePolygons ? window.cadUnePolygons.length : 0;
            window.cadCustomShapes.forEach((p, idx) => {
                p._svgPathNode = createPathNode(window.cadGetGroupColor ? window.cadGetGroupColor(p.uneGroup) : '#8BC34A', '#558B2F');
                p._svgPathNode.setAttribute('style', 'pointer-events: auto; cursor: pointer; transition: filter 0.2s;');
                p._svgPathNode.addEventListener('mouseover', () => p._svgPathNode.setAttribute('filter', 'url(#hover-shadow)'));
                p._svgPathNode.addEventListener('mouseout', () => p._svgPathNode.removeAttribute('filter'));
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
                textNode.setAttribute('style', 'pointer-events: none; paint-order: stroke; stroke: #000000; stroke-width: 4px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;');
                let baseIdxStr = p._displayLabel ? p._displayLabel : (p.customLabel ? p.customLabel : String(baseIdx + idx + 1));
                textNode.textContent = baseIdxStr;
                p._svgTextNode = textNode;
                textsGroup.appendChild(textNode);
            });
        }
        if (window.cadNakamichiMapPolygons) {
            window.cadNakamichiMapPolygons.forEach(p => {
                p._svgPathNode = createPathNode('none', '#E91E63', true);
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

        if (window.cadGridLines) {
            window.cadGridLines.forEach(l => {
                l._svgPathNode = createPathNode('none', '#999999', true);
                l._svgPathNode.setAttribute('stroke-opacity', '0.8');
                l._svgPathNode.setAttribute('stroke-width', '2');
                pathsGroup.appendChild(l._svgPathNode);
            });
        }

        window.cadSvgNeedsRebuild = false;
        svg._lastHandleStateId = null;
        svg._lastPinsStateId = null;
    }
    
    let handleStateId = '';
    if (window.cadUnePolygons) window.cadUnePolygons.forEach(p => { handleStateId += (p.getPath() ? p.getPath().getLength() : 0) + '_'; });
    if (window.cadCustomShapes) window.cadCustomShapes.forEach(p => { handleStateId += (p.getPath() ? p.getPath().getLength() : 0) + '_'; });

    let handlesGroup = svg.querySelector('#cadSvgHandles');
    if (handlesGroup && svg._lastHandleStateId !== handleStateId) {
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
                        window.updateCadSvgOverlay();
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

        if (window.cadUnePolygons) window.cadUnePolygons.forEach(p => createHandlesForPoly(p));
        if (window.cadCustomShapes) window.cadCustomShapes.forEach(p => createHandlesForPoly(p));
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

    if (window.cadTargetPolygon && window.cadTargetPolygon._svgPathNode) {
        window.cadTargetPolygon._svgPathNode.setAttribute('d', updatePathD(window.cadTargetPolygon));
    }
    if (window.cadGridLines) {
        window.cadGridLines.forEach(l => {
            if (l._svgPathNode) l._svgPathNode.setAttribute('d', updatePathD(l, true));
        });
    }
    if (window.cadUnePolygons) {
        window.cadUnePolygons.forEach((p, idx) => {
            if (p._svgPathNode) p._svgPathNode.setAttribute('d', updatePathD(p));
            if (p._svgTextNode) {
                let marker = window.cadUneLabels && window.cadUneLabels[idx];
                let latLng = marker ? marker.getPosition() : null;
                if (!latLng) {
                    let path = p.getPath();
                    if(path && path.getLength() > 0) {
                        let bounds = new google.maps.LatLngBounds();
                        path.forEach(pt => bounds.extend(pt));
                        latLng = bounds.getCenter();
                    }
                }
                if (latLng) {
                    let screenPt = window.latLngToScreenPixel(latLng.lat(), latLng.lng());
                    p._svgTextNode.setAttribute('x', screenPt.x);
                    p._svgTextNode.setAttribute('y', screenPt.y);
                }
            }
        });
    }
    if (window.cadCustomShapes) {
        let baseIdx = window.cadUnePolygons ? window.cadUnePolygons.length : 0;
        window.cadCustomShapes.forEach((p, idx) => {
            if (p._svgPathNode) p._svgPathNode.setAttribute('d', updatePathD(p));
            if (p._svgTextNode) {
                let markerIdx = baseIdx + idx;
                let marker = window.cadUneLabels && window.cadUneLabels[markerIdx];
                let latLng = marker ? marker.getPosition() : null;
                if (!latLng) {
                    let path = p.getPath();
                    if(path && path.getLength() > 0) {
                        let bounds = new google.maps.LatLngBounds();
                        path.forEach(pt => bounds.extend(pt));
                        latLng = bounds.getCenter();
                    }
                }
                if (latLng) {
                    let screenPt = window.latLngToScreenPixel(latLng.lat(), latLng.lng());
                    p._svgTextNode.setAttribute('x', screenPt.x);
                    p._svgTextNode.setAttribute('y', screenPt.y);
                }
            }
        });
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
    if (window.cadUnePolygons) window.cadUnePolygons.forEach(updateHandlesPosition);
    if (window.cadCustomShapes) window.cadCustomShapes.forEach(updateHandlesPosition);

    let pinsStateId = window.cadPins ? window.cadPins.map(mk => mk.cadPinType).join('_') + '_' + window.cadPins.length : '';
    let pinsGroup = svg ? svg.querySelector('#cadSvgPins') : null;
    if (pinsGroup && svg._lastPinsStateId !== pinsStateId) {
        svg._lastPinsStateId = pinsStateId;
        pinsGroup.innerHTML = '';
        
        if (window.cadPins) {
            let waterInCount = 0;
            let waterOutCount = 0;
            window.cadPins.forEach((mk, idx) => {
                let fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                fo.setAttribute('width', '100');
                fo.setAttribute('height', '60');
                fo.setAttribute('style', 'overflow:visible; pointer-events:none;');
                
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
                    iconStr = '🛻';
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
                    numSpan.style.cssText = 'position:absolute; left:50%; top:0; transform:translate(-50%, -110%); font-size:0.7em; font-weight:bold; color:#111; line-height:1; pointer-events:none; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;';
                    div.appendChild(numSpan);
                }
                
                div.style.cssText = 'font-size:24px; text-align:center; transform:translate(-50%, -50%) rotate(var(--label-rot)); position:absolute; left:50%; top:50%; pointer-events:auto; cursor:move; user-select:none; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;';
                fo.appendChild(div);

                let delBtn = document.createElement('div');
                delBtn.innerHTML = '✕';
                delBtn.className = 'cad-pin-del-btn';
                delBtn.style.cssText = 'position:absolute; top:-20px; right:-20px; width:40px; height:40px; background:#f44336; color:white; font-size:20px; line-height:36px; text-align:center; border-radius:50%; cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.5); display:none; border: 2px solid white;';
                div.appendChild(delBtn);
                
                let isDraggingPin = false;
                let dragDistance = 0;
                let dragStartX = 0;
                let dragStartY = 0;

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
                        window.updateCadSvgOverlay();
                    }
                };
                
                const onEnd = () => {
                    if (!isDraggingPin) return;
                    isDraggingPin = false;
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onEnd);
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('touchend', onEnd);
                    
                    if (dragDistance < 10) {
                        let allDelBtns = document.querySelectorAll('.cad-pin-del-btn');
                        allDelBtns.forEach(btn => { if(btn !== delBtn) btn.style.display = 'none'; });
                        delBtn.style.display = delBtn.style.display === 'none' ? 'block' : 'none';
                    }

                    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
                };
                
                div.addEventListener('mousedown', (e) => {
                    isDraggingPin = true; 
                    dragDistance = 0; 
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;
                    e.stopPropagation();
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onEnd);
                });
                
                div.addEventListener('touchstart', (e) => {
                    isDraggingPin = true; 
                    dragDistance = 0;
                    dragStartX = e.touches[0].clientX;
                    dragStartY = e.touches[0].clientY;
                    e.stopPropagation();
                    window.addEventListener('touchmove', onMove, {passive: false});
                    window.addEventListener('touchend', onEnd);
                }, {passive: false});

                const onDelete = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if(confirm('この設備ピンを削除しますか？')) {
                        window.cadPins = window.cadPins.filter(p => p !== mk);
                        if (mk.setMap) mk.setMap(null);
                        window.cadSvgNeedsRebuild = true;
                        window.updateCadSvgOverlay();
                        if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
                    }
                };

                delBtn.addEventListener('mousedown', onDelete);
                delBtn.addEventListener('touchstart', onDelete, {passive: false});
                
                pinsGroup.appendChild(fo);
                mk._svgFoNode = fo;
            });
        }
    }
    
    if (window.cadPins) {
        let currentZoom = window.getCadZoom();
        let pinScale = Math.max(0.5, Math.pow(2, currentZoom - 20));
        let scaledFontSize = Math.round(24 * pinScale);
        let foSize = Math.max(60, scaledFontSize + 50);

        window.cadPins.forEach(mk => {
            if (mk._svgFoNode) {
                let latLng = mk.getPosition();
                if (latLng) {
                    let screenPt = window.latLngToScreenPixel(latLng.lat(), latLng.lng());
                    mk._svgFoNode.setAttribute('width', foSize);
                    mk._svgFoNode.setAttribute('height', foSize);
                    mk._svgFoNode.setAttribute('x', screenPt.x - (foSize / 2));
                    mk._svgFoNode.setAttribute('y', screenPt.y - (foSize / 2));
                    
                    let div = mk._svgFoNode.querySelector('div');
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
};

window.updateCadLabelScale = (detectedScale) => {
    // CSSのカスタムプロパティ（--cad-label-scale）によるスケールで一括制御するため、JSでの個別のフォントサイズ変更は行いません（パフォーマンスとCSS競合回避のため）
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
        ridgeGapRatio: window.cadRidgeGapRatio
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
    document.getElementById('cadWidth').value = state.width || 150;
    document.getElementById('cadUneCount').value = state.uneCount || 0;
    if (document.getElementById('cadMarginSide')) document.getElementById('cadMarginSide').value = state.marginSide || 0;
    if (document.getElementById('cadMarginEnd')) document.getElementById('cadMarginEnd').value = state.marginEnd || 0;

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
    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();

    if (state.customShapes) {
        state.customShapes.forEach((shape, idx) => {
            let cPath = shape.coords ? shape.coords : shape;
            let uGroup = shape.group || 'default';
            let gPoly = new google.maps.Polygon({ paths: cPath, fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 2), map: window.cadMap, editable: false, draggable: false, clickable: true, zIndex: 10 });
            gPoly.uneIndex = 'custom_' + idx;
            gPoly.uneGroup = uGroup;
            if (shape.customLabel) gPoly.customLabel = shape.customLabel;
            google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
            window.bindShapeHistoryEvents(gPoly);
            window.cadCustomShapes.push(gPoly);
        });
    }

    if (state.unePolygons) {
        state.unePolygons.forEach((shape, idx) => {
            let uPath = shape.coords ? shape.coords : shape;
            let uGroup = shape.group || 'default';
            let gPoly = new google.maps.Polygon({ paths: uPath, fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 2), map: window.cadMap, editable: false, draggable: false, clickable: true, zIndex: 10 });
            gPoly.uneIndex = 'une_' + idx;
            gPoly.uneGroup = uGroup;
            if (shape.customLabel) gPoly.customLabel = shape.customLabel;
            google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
            window.bindShapeHistoryEvents(gPoly);
            window.cadUnePolygons.push(gPoly);
        });
    }

    window.reassignLabels();
    window.cadAlignMapHeading();
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

    if (window.cadPinMode === 'custom_rect' || window.cadPinMode === 'custom_circle') {
        const shapeType = window.cadPinMode === 'custom_circle' ? 'circle' : 'rect';
        window.cadExecuteAddCustomShape(latLng, shapeType);
        window.cadPinMode = null;
        if (msgEl) { msgEl.innerText = '💡 畝を直接タップすると、十字キーで移動や変形ができます。'; msgEl.style.color = "#FF9800"; }
        return;
    }

    if (window.cadPinMode === 'nakamichi' || window.cadPinMode === 'drainage') return;

    if (window.cadPinMode === 'snap_line') {
        const p = loadedPolygons[window.cadTargetId];
        if (p && p.coords && p.coords.length > 2) {
            let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
            if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([coords[0][0], coords[0][1]]);
            const pt = turf.point([latLng.lng(), latLng.lat()]);
            
            let minD = Infinity;
            let bestBearing = 0;
            for (let i = 0; i < coords.length - 1; i++) {
                let line = turf.lineString([coords[i], coords[i+1]]);
                let d = turf.pointToLineDistance(pt, line, {units: 'meters'});
                if (d < minD) {
                    minD = d;
                    bestBearing = turf.bearing(turf.point(coords[i]), turf.point(coords[i+1]));
                }
            }
            
            let angle = bestBearing;
            while (angle < 0) angle += 360;
            while (angle >= 180) angle -= 180; // keep it 0-180 for standard ridge direction
            angle = Math.round(angle * 10) / 10;
            
            document.getElementById('cadAngle').value = angle;
            window.cadAlignMapHeading(); // 🌟 地図も垂直に合わせる
            window.updateCadPreviewCount(); // 畝数を自動計算
            window.saveCadStateToHistory();
        }
        window.cadPinMode = null;
        if (msgEl) { msgEl.innerText = `💡 畝を直接タップすると、十字キーで移動や変形ができます。`; msgEl.style.color = "#FF9800"; }
        return;
    }

    const mk = new google.maps.Marker({ position: latLng, map: window.cadMap, visible: false });
    mk.cadPinType = window.cadPinMode;
    window.cadPins.push(mk);
    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
    window.cadPinMode = null;
    if (msgEl) { msgEl.innerText = `💡 畝を直接タップすると、十字キーで移動や変形ができます。`; msgEl.style.color = "#FF9800"; }
    window.saveCadStateToHistory();
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
        // 探索の深さは最大3程度で十分（親要素にマーカー画像が含まれるかを querySelector で探索する重くてバグだらけの処理は廃止し、タップされた要素自身または直接の親だけをチェックする）
        while (currEl && currEl !== wrapper && depth < 4) {
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
            }

            // 設備ピン（💧, 🕳️, 🛻, 🚜など）はドラッグできるようにする
            if (currEl.innerText && (currEl.innerText.includes('💧') || currEl.innerText.includes('🕳️') || currEl.innerText.includes('🛻') || currEl.innerText.includes('🚜'))) {
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
        if (document.getElementById('cadOverlay').style.display !== 'flex' || (!ignoreDrag && !isMouseDown) || lastTouchX === null || lastTouchY === null) return;
        
        const currentX = e.pageX; const currentY = e.pageY;

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
            }
        }
        pendingCenter = null;
        pendingZoom = null;
    }, { capture: true, passive: false });

    wrapper.addEventListener('touchmove', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex') return;

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

    document.getElementById('cadTargetName').innerText = p.name + " (最新の図面を読込中...)";
    document.getElementById('cadOverlay').style.display = 'flex';

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

    try {
        const history = await callGAS('getPolygonDrawingHistory', { id });
        if (history && history.length > 0 && history[0].data) {
            p.uneSimData = history[0].data;
        }
    } catch (e) {
        console.error("CAD最新データ取得エラー:", e);
    }
    document.getElementById('cadTargetName').innerText = p.name;

    if (p.uneSimData) {
        try {
            const saved = JSON.parse(p.uneSimData);
            document.getElementById('cadAngle').value = saved.angle !== undefined ? saved.angle : 0;
            document.getElementById('cadWidth').value = saved.width !== undefined ? saved.width : 150;
            document.getElementById('cadUneCount').value = saved.uneCount !== undefined ? saved.uneCount : 0;
            
            const marginSideEl = document.getElementById('cadMarginSide');
            const marginEndEl = document.getElementById('cadMarginEnd');
            if (marginSideEl) marginSideEl.value = saved.marginSide !== undefined ? saved.marginSide : 50;
            if (marginEndEl) marginEndEl.value = saved.marginEnd !== undefined ? saved.marginEnd : 250;

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
                    let gPoly = new google.maps.Polygon({ paths: cPath, fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 2), map: window.cadMap, editable: false, draggable: false, clickable: true, zIndex: 10 });
                    gPoly.uneIndex = 'custom_' + idx;
                    gPoly.uneGroup = uGroup;
                    google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
                    window.bindShapeHistoryEvents(gPoly);
                    window.cadCustomShapes.push(gPoly);
                });
            }
            if (saved.unePolygons) {
                saved.unePolygons.forEach((item, idx) => {
                    let uPath = Array.isArray(item) ? item : item.coords;
                    let uGroup = Array.isArray(item) ? '' : (item.group || '');
                    let gPoly = new google.maps.Polygon({ paths: uPath, fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 2), map: window.cadMap, editable: false, draggable: false, clickable: true, zIndex: 10 });
                    gPoly.uneIndex = 'une_' + idx;
                    gPoly.uneGroup = uGroup;
                    google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
                    window.bindShapeHistoryEvents(gPoly);
                    window.cadUnePolygons.push(gPoly);
                });
            } else {
                cadGenerateLines();
            }
            window.reassignLabels();
            switchCadTab(2);
        } catch (e) { }
    } else {
        document.getElementById('cadAngle').value = 0;
        document.getElementById('cadWidth').value = 150;
        
        const marginSideEl = document.getElementById('cadMarginSide');
        const marginEndEl = document.getElementById('cadMarginEnd');
        if (marginSideEl) marginSideEl.value = 50;
        if (marginEndEl) marginEndEl.value = 250;
        
        updateCadPreviewCount();
    }

    // 栽培計画でこの圃場が選ばれていれば、計画の畝間を基準畝幅に優先反映
    await window.applyCultivationPlanWidthToCad(id);

    // 起動直後の状態を履歴0番目として保存
    setTimeout(() => {
        window.cadHistory = [];
        window.cadHistoryIndex = -1;
        window.saveCadStateToHistory();
    }, 500);
};

window.closeCADMode = () => {
    document.getElementById('cadOverlay').style.display = 'none';
    window.cadClearLines(true);
    if (window.cadTargetPolygon) window.cadTargetPolygon.setMap(null);
    window.cadTargetId = null;
};

/** 栽培計画の畝間をCAD基準畝幅へ反映 */
window.applyCultivationPlanWidthToCad = async (fieldId) => {
    try {
        const planParams = await callGAS('getCultivationRidgeParamsForField', { fieldId: fieldId });
        if (!planParams || !planParams.rSpace) return false;
        const widthEl = document.getElementById('cadWidth');
        if (widthEl) widthEl.value = planParams.rSpace;
        const msgEl = document.getElementById('cadPinModeMsg');
        if (msgEl) {
            const cropBit = planParams.crop
                ? `（${planParams.crop}${planParams.variety ? ' / ' + planParams.variety : ''}）`
                : '';
            msgEl.innerText = `📐 栽培計画の畝間 ${planParams.rSpace}cm を基準畝幅にセットしました${cropBit}`;
            msgEl.style.color = '#4CAF50';
        }
        if (typeof updateCadPreviewCount === 'function') updateCadPreviewCount();
        return true;
    } catch (e) {
        console.warn('栽培計画畝間の反映に失敗:', e);
        return false;
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

/**
 * 枕畝などに使う「地図上の畝と同じ幅(m)」を返す。
 * 優先: 描画済み畝の平均幅 → 基準畝幅(cadWidth)
 */
window.getCadReferenceRidgeWidthMeters = () => {
    const uneList = (window.cadUnePolygons || []).filter(p => p && p.getMap && p.getMap());
    const widths = uneList.map(p => window.estimateCadUneWidthMeters(p)).filter(w => w > 0);
    if (widths.length) {
        return widths.reduce((a, b) => a + b, 0) / widths.length;
    }
    const widthEl = document.getElementById('cadWidth');
    const cm = widthEl && widthEl.value ? parseFloat(widthEl.value) : 150;
    return ((cm > 0 ? cm : 150) / 100);
};

window.switchCadTab = (tab) => {
    const mode1 = document.getElementById('cadMode1'); const mode2 = document.getElementById('cadMode2');
    if (mode1) mode1.style.display = tab === 1 ? 'block' : 'none';
    if (mode2) mode2.style.display = tab === 2 ? 'block' : 'none';
    const tab1 = document.getElementById('cadTab1'); const tab2 = document.getElementById('cadTab2');
    if (tab1) { tab1.style.background = tab === 1 ? '#FF9800' : '#222'; tab1.style.color = tab === 1 ? '#fff' : '#aaa'; }
    if (tab2) { tab2.style.background = tab === 2 ? '#2196F3' : '#222'; tab2.style.color = tab === 2 ? '#fff' : '#aaa'; }
};

window.cadAlignMapHeading = () => {
    const angle = parseFloat(document.getElementById('cadAngle').value) || 0;
    window.cadCurrentRotation = -angle;
    window.updateCadMapTransform();
};

window.cadRotateMap = (deg) => {
    window.cadCurrentRotation += deg;
    window.updateCadMapTransform();
    let displayAngle = Math.round(-window.cadCurrentRotation) % 360;
    if (displayAngle < 0) displayAngle += 360;
    document.getElementById('cadAngle').value = displayAngle;
    updateCadPreviewCount();
};

window.cadToggleGrid = () => {
    if (window.cadGridLines && window.cadGridLines.length > 0) {
        window.cadGridLines.forEach(l => l.setMap(null)); window.cadGridLines = []; 
        window.cadSvgNeedsRebuild = true; if(window.updateCadSvgOverlay) window.updateCadSvgOverlay();
        return;
    }
    if (!window.cadTargetId) return;
    const p = loadedPolygons[window.cadTargetId];
    let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
    coords.push(coords[0]);
    const tPoly = turf.polygon([coords]); const bbox = turf.bbox(tPoly);
    const angle = parseFloat(document.getElementById('cadAngle').value) || 0;
    const centerPt = turf.center(tPoly);
    const diagDist = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], { units: 'meters' }) + 40;

    window.cadGridLines = [];
    for (let offset = -diagDist / 2; offset <= diagDist / 2; offset += 1) {
        let oPt1 = turf.destination(centerPt, Math.abs(offset), offset >= 0 ? angle + 90 : angle - 90, { units: 'meters' });
        let p1_1 = turf.destination(oPt1, diagDist / 2, angle, { units: 'meters' }).geometry.coordinates;
        let p1_2 = turf.destination(oPt1, diagDist / 2, angle + 180, { units: 'meters' }).geometry.coordinates;
        let line1 = new google.maps.Polyline({ path: [{ lat: p1_1[1], lng: p1_1[0] }, { lat: p1_2[1], lng: p1_2[0] }], strokeColor: '#999999', strokeOpacity: 0.01, strokeWeight: Math.max(0.5, 2), map: window.cadMap, clickable: false, zIndex: 1 });
        window.cadGridLines.push(line1);

        let oPt2 = turf.destination(centerPt, Math.abs(offset), offset >= 0 ? angle : angle + 180, { units: 'meters' });
        let p2_1 = turf.destination(oPt2, diagDist / 2, angle + 90, { units: 'meters' }).geometry.coordinates;
        let p2_2 = turf.destination(oPt2, diagDist / 2, angle - 90, { units: 'meters' }).geometry.coordinates;
        let line2 = new google.maps.Polyline({ path: [{ lat: p2_1[1], lng: p2_1[0] }, { lat: p2_2[1], lng: p2_2[0] }], strokeColor: '#999999', strokeOpacity: 0.01, strokeWeight: Math.max(0.5, 2), map: window.cadMap, clickable: false, zIndex: 1 });
        window.cadGridLines.push(line2);
    }
    window.cadSvgNeedsRebuild = true; 
    if(window.updateCadSvgOverlay) window.updateCadSvgOverlay();
};

window.updateCadPreviewCount = () => {
    if (!window.cadTargetId) return;
    const widthCm = parseFloat(document.getElementById('cadWidth').value);
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
    if (window.cadGridLines) { window.cadGridLines.forEach(l => l.setMap(null)); window.cadGridLines = []; }
    if (window.cadUneLabels) { window.cadUneLabels.forEach(lbl => lbl.setMap(null)); window.cadUneLabels = []; }
    if (window.nakamichiTempMarker) { window.nakamichiTempMarker.setMap(null); window.nakamichiTempMarker = null; }
    if (window.cadFrontBaselineMarker) { window.cadFrontBaselineMarker.setMap(null); window.cadFrontBaselineMarker = null; }
    if (window.cadFrontBaselineVisual) { window.cadFrontBaselineVisual.setMap(null); window.cadFrontBaselineVisual = null; }
    window.cadFrontBaseline = null;
    const msgEl = document.getElementById('cadPinModeMsg'); if (msgEl) msgEl.innerText = "💡 畝を直接タップすると、十字キーで移動や変形ができます。";
};

window.cadUserClearLines = () => {
    if (confirm("図面をすべてクリアしますか？")) {
        window.cadClearLines();
        window.saveCadStateToHistory();
        if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
    }
};

window.cadSetPinMode = (type) => {
    window.cadPinMode = type;
    const msgEl = document.getElementById('cadPinModeMsg');
    if (type === 'nakamichi') {
        window.nakamichiTempPt = null;
        if (msgEl) { msgEl.innerText = `【中道ライン】始点となる場所をタップしてください`; msgEl.style.color = "#E91E63"; }
    } else if (type === 'drainage') {
        window.nakamichiTempPt = null;
        if (msgEl) { msgEl.innerText = `【排水ライン】始点となる場所をタップしてください`; msgEl.style.color = "#00BCD4"; }
    } else if (type === 'snap_line') {
        if (msgEl) { msgEl.innerText = `【角度合わせ】基準にしたい外周の直線をタップしてください`; msgEl.style.color = "#4CAF50"; }
    } else {
        const name = type === 'water_in' ? '💧 吸水ピン' : type === 'water_out' ? '🕳️ 排水ピン' : type === 'parking_truck' ? '🛻 軽トラ駐車' : '🚜 機械侵入口';
        if (msgEl) { msgEl.innerText = `【${name}】配置場所をタップ！`; msgEl.style.color = "#03A9F4"; }
    }
};

window.drawNakamichiVisual = (path) => {
    let line = new google.maps.Polyline({ path: path, strokeColor: '#E91E63', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 6), map: window.cadMap, zIndex: 9 });
    window.cadNakamichiMapPolygons.push(line);
};

window.drawDrainageVisual = (path) => {
    // 破線を表現するため、SVGレイヤーでのみ表示（Google Map上では透明）
    let line = new google.maps.Polyline({ path: path, strokeColor: 'transparent', strokeOpacity: 0, strokeWeight: Math.max(0.5, 6), map: window.cadMap, zIndex: 9 });
    window.cadDrainageMapPolygons.push(line);
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

window.cadAddCustomShape = (type) => {
    const mode = (type === 'circle') ? 'custom_circle' : 'custom_rect';
    window.cadPinMode = mode;
    const msgEl = document.getElementById('cadPinModeMsg');
    if (msgEl) {
        msgEl.innerText = mode === 'custom_rect'
            ? '【四角畝】配置したい場所をタップしてください（畝幅・畝方向に合わせます）'
            : '【丸畝】配置したい場所をタップしてください（直径＝基準畝幅）';
        msgEl.style.color = '#8BC34A';
    }
};

/** 四角畝・丸畝をタップ位置に生成（畝幅基準・圃場内にクリップ） */
window.cadExecuteAddCustomShape = (latLng, type) => {
    if (!window.cadTargetId || !latLng) return;

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
    const centerPt = turf.point([latLng.lng(), latLng.lat()]);

    // 圃場外タップは拒否
    try {
        if (!turf.booleanPointInPolygon(centerPt, tPoly)) {
            alert('圃場の内側をタップしてください。');
            return;
        }
    } catch (e) {}

    const widthM = window.getCadReferenceRidgeWidthMeters() || 1.5;
    const angleEl = document.getElementById('cadAngle');
    const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;

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
        const gPoly = new google.maps.Polygon({
            paths: paths,
            fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(groupName) : '#8BC34A',
            fillOpacity: 0.4,
            strokeColor: '#558B2F',
            strokeOpacity: 0.8,
            strokeWeight: Math.max(0.5, 2),
            map: window.cadMap,
            editable: false,
            draggable: false,
            clickable: true,
            zIndex: 10
        });
        gPoly.uneIndex = 'custom_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000);
        gPoly.uneGroup = groupName;
        google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
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
    if (msgEl) { msgEl.innerText = '枕畝を配置したい場所をタップしてください。'; msgEl.style.color = "#ea580c"; }
};

window.cadExecuteAddMakura = (latLng) => {
    let centerPt = turf.point([latLng.lng(), latLng.lat()]);
    
    const angleEl = document.getElementById('cadAngle');
    const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;

    // 枕畝の太さ = 地図上の畝幅（なければ基準畝幅）。端面余白は使わない
    let actualWidthM = window.getCadReferenceRidgeWidthMeters();
    if (!actualWidthM || actualWidthM <= 0) actualWidthM = 1.5;
    
    const p = loadedPolygons[window.cadTargetId];
    if (!p || !p.coords || p.coords.length < 3) return;
    let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([coords[0][0], coords[0][1]]);
    const tPoly = turf.polygon([coords]);

    let makuraAngle = angle + 90;
    
    let pt1 = turf.destination(centerPt, 1000, makuraAngle + 180, { units: 'meters' });
    let pt2 = turf.destination(centerPt, 1000, makuraAngle, { units: 'meters' });
    
    let c1 = turf.destination(pt1, actualWidthM / 2, makuraAngle + 90, {units: 'meters'}).geometry.coordinates;
    let c2 = turf.destination(pt1, actualWidthM / 2, makuraAngle - 90, {units: 'meters'}).geometry.coordinates;
    let c3 = turf.destination(pt2, actualWidthM / 2, makuraAngle - 90, {units: 'meters'}).geometry.coordinates;
    let c4 = turf.destination(pt2, actualWidthM / 2, makuraAngle + 90, {units: 'meters'}).geometry.coordinates;
    
    let makuraRect = turf.polygon([[c1, c2, c3, c4, c1]]);
    
    // ※ CDN は @turf/turf@6。intersect/difference は2引数API（v7の featureCollection 形式は不可）
    let finalPoly = null;
    try {
        finalPoly = turf.intersect(tPoly, makuraRect);
    } catch(e) { console.error(e); }
    
    if (!finalPoly) {
        alert("圃場の外にタップされたか、枕畝を生成できません。");
        return;
    }
    
    let avoidPolys = window.cadUnePolygons.map(poly => {
        let path = poly.getPath().getArray();
        let coords = path.map(pt => [pt.lng(), pt.lat()]);
        if (coords.length > 2) {
            if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) {
                coords.push([coords[0][0], coords[0][1]]);
            }
            let t = turf.polygon([coords]);
            return turf.buffer(t, 0.2 / 1000, { units: 'kilometers' });
        }
        return null;
    }).filter(Boolean);
    
    for (let av of avoidPolys) {
        if (!finalPoly) break;
        try {
            finalPoly = turf.difference(finalPoly, av);
        } catch(e) { console.error(e); }
    }
    
    if (!finalPoly) {
        alert("既存の畝と完全に重なっているため、枕畝を生成するスペースがありません。");
        return;
    }
    
    let flattened = turf.flatten(finalPoly);
    
    let addedCount = 0;
    flattened.features.forEach((feature, idx) => {
        let coordinates = feature.geometry.coordinates;
        if (!coordinates || coordinates.length === 0) return;
        let paths = coordinates.map(ring => ring.map(c => ({ lat: c[1], lng: c[0] })));
        
        let gPoly = new google.maps.Polygon({ paths: paths, fillColor: '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 2), map: window.cadMap, editable: false, draggable: false, clickable: true, zIndex: 10 });
        gPoly.uneIndex = 'custom_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000);
        gPoly.uneGroup = '枕';
        google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
        window.bindShapeHistoryEvents(gPoly);
        window.cadCustomShapes.push(gPoly);
        addedCount++;
    });
    
    if (addedCount > 0) {
        window.reassignLabels();
        window.saveCadStateToHistory();
    } else {
        alert("枕畝を生成できるスペースがありませんでした。");
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

window.cadGenerateLines = () => {
    try {
        if (!window.cadTargetId) return;

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
                let wCheck = w + 2 * sideMarginMeters;
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
    const gPoly = new google.maps.Polygon({
        paths: path, fillColor: '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8,
        strokeWeight: Math.max(0.5, 2), map: window.cadMap, zIndex: 10, editable: false, draggable: false, clickable: true
    });
    gPoly.uneIndex = 'une_' + idx;
    gPoly.uneGroup = 'default';
    google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
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
    }
    
    document.getElementById('cadEditPolyModal').style.display = 'flex';
};

window.cadCompleteEditPoly = () => {
    const idx = document.getElementById('cadEditIndex').value;
    if (idx) {
        const isCustom = idx.startsWith('custom_');
        const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
        const poly = polyList.find(p => p.uneIndex === idx);
        if (poly) poly.setEditable(false);
    }
    document.getElementById('cadEditPolyModal').style.display = 'none';
    document.getElementById('cadEditIndex').value = '';
    window.cadEditOriginalPath = null;
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
            if (typeof window.updateSinglePolyLabel === 'function') window.updateSinglePolyLabel(idx);
            if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
            if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
        }
    }
    document.getElementById('cadEditPolyModal').style.display = 'none';
    document.getElementById('cadEditIndex').value = '';
    window.cadEditOriginalPath = null;
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

        let labelStr = poly._displayLabel ? poly._displayLabel : (poly.customLabel ? poly.customLabel : String(polyIndex + 1));
        marker.setLabel({
            text: labelStr,
            color: '#ffffff',
            fontSize: '24px',
            fontWeight: 'bold',
            className: 'polygon-label ridge-label'
        });
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

    document.getElementById('cadEditPolyModal').style.display = 'none';
    window.reassignLabels(); window.saveCadStateToHistory();
};

window.reassignLabels = () => {
    const totalPolygons = [...window.cadUnePolygons, ...window.cadCustomShapes];
    const initialFontSize = '24px';

    if (!window.cadUneLabels) window.cadUneLabels = [];

    while (window.cadUneLabels.length > totalPolygons.length) {
        const lbl = window.cadUneLabels.pop();
        if (lbl) lbl.setMap(null);
    }

    while (window.cadUneLabels.length < totalPolygons.length) {
        const labelMarker = new google.maps.Marker({
            map: window.cadMap,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
            zIndex: 11
        });
        window.cadUneLabels.push(labelMarker);
    }

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
            while (usedCustomNumbers.has(String(autoNumber))) {
                autoNumber++;
            }
            idxStr = String(autoNumber);
            autoNumber++;
        }
        poly._displayLabel = idxStr;

        marker.associatedPoly = poly;

        google.maps.event.clearListeners(marker, 'click');
        google.maps.event.addListener(marker, 'click', () => window.openCadEditModal(poly.uneIndex));

        const bounds = new google.maps.LatLngBounds();
        poly.getPath().forEach(pt => bounds.extend(pt));
        marker.setPosition(bounds.getCenter());

        marker.setLabel({
            text: idxStr,
            color: '#ffffff',
            fontSize: initialFontSize,
            fontWeight: 'bold',
            className: 'polygon-label ridge-label'
        });
    });

    window.updateCadLabelPositionsThrottled();
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
        frontBaseline: window.cadFrontBaseline || null
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
    listEl.innerHTML = '<div style="text-align:center; padding:20px;">読み込み中...</div>';
    document.getElementById('cadHistoryModal').style.display = 'block';
    
    try {
        const history = await callGAS('getPolygonDrawingHistory', { id: window.cadTargetId });
        if (!history || history.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">保存された履歴がありません。</div>';
            return;
        }
        
        listEl.innerHTML = '';
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
            listEl.appendChild(btn);
        });
    } catch(e) {
        console.error("CAD History Error:", e);
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
    const colors = ['#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#795548', '#009688', '#3F51B5'];
    let hash = 0;
    for (let i = 0; i < group.length; i++) hash = group.charCodeAt(i) + ((hash << 5) - hash);
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

