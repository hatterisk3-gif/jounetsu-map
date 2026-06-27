// 囿 霎ｲ讌ｭCAD蟆ら畑JavaScript・・dmin.html縺九ｉ蛻・ｊ蜃ｺ縺暦ｼ・
// 囿 譁ｰ繝ｻ霎ｲ讌ｭCAD繧ｷ繧ｹ繝・Β・亥慍蠖｢險ｭ險育音蛹也沿・・
window.cadMap = null;
window.cadTargetId = null;
window.cadTargetPolygon = null;
window.cadUnePolygons = [];
window.cadPins = [];
window.cadPinMode = null;
window.cadUneLabels = [];
window.cadNakamichiLines = [];
window.cadNakamichiMapPolygons = [];
window.cadCustomShapes = [];
window.cadGridLines = [];
window.nakamichiTempMarker = null;

window.cadCurrentRotation = 0;
const BASE_SCALE = 1.0;
window.cadCurrentScale = BASE_SCALE;

// 検 譁ｰ讖溯・・壼ｱ･豁ｴ菫晏ｭ倡畑縺ｮ繧ｹ繧ｿ繝・け
window.cadHistory = [];
window.cadHistoryIndex = -1;
window.isHistoryNavigating = false;

// 検 譛驕ｩ蛹也畑縺ｮ繧ｿ繧､繝槭・縺ｨ迥ｶ諷句､画焚
let realScaleTimeout = null;
let labelPositionsTimeout = null;
let lastLabelPositionsTime = 0;

// 検 繝ｩ繝吶Ν菴咲ｽｮ譖ｴ譁ｰ縺ｮ繧ｹ繝ｭ繝・ヨ繝ｪ繝ｳ繧ｰ逕ｨ髢｢謨ｰ
window.updateCadLabelPositionsThrottled = () => {
    // 検 菫ｮ豁｣・壹ラ繝ｩ繝・げ荳ｭ縺ｮ繧ｹ繧ｭ繝・・繧貞ｻ・ｭ｢縺励∝ｸｸ縺ｫ霑ｽ蠕薙＆縺帙ｋ
    const now = performance.now();
    const limit = 60; // 検 繧医ｊ貊代ｉ縺九↓霑ｽ蠕薙＆縺帙ｋ縺溘ａ60ms縺ｫ螟画峩

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
            // 検 菫ｮ豁｣・壹ぜ繝ｼ繝荳企剞20縺ｮ繧ｭ繝｣繝・・繧貞､悶＠縲；oogle Maps繝阪う繝・ぅ繝悶・貊代ｉ縺九↑諡｡螟ｧ縺ｫ莉ｻ縺帙ｋ・・
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

window.updateCadMapTransform = () => {
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

        // 検 霑ｽ蜉・夂ｷ壹・螟ｪ縺輔ｒ諡｡螟ｧ邇・・騾・焚縺ｧ陬懈ｭ｣縺吶ｋ
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
                             (window.cadNakamichiMapPolygons ? window.cadNakamichiMapPolygons.length : 0);
                             
    if (window.cadSvgNeedsRebuild || !svg.querySelector('#cadSvgPaths') || svg._lastPolysLength !== currentPolysLength) {
        svg._lastPolysLength = currentPolysLength;
        let html = '<defs><filter id="hover-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/></filter></defs>' +
                   '<g id="cadSvgPaths"></g><g id="cadSvgTexts"></g><g id="cadSvgHandles"></g><g id="front-bar" style="filter: url(#hover-shadow);"></g>';
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
            window.cadTargetPolygon._svgPathNode.setAttribute('fill-opacity', '0.95');
            window.cadTargetPolygon._svgPathNode.setAttribute('stroke-opacity', '1.0');
            window.cadTargetPolygon._svgPathNode.setAttribute('stroke-width', '3');
            pathsGroup.appendChild(window.cadTargetPolygon._svgPathNode);
        }
        
        if (window.cadUnePolygons) {
            window.cadUnePolygons.forEach((p, idx) => {
                p._svgPathNode = createPathNode('#8BC34A', '#558B2F');
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
                textNode.textContent = String(idx + 1);
                p._svgTextNode = textNode;
                textsGroup.appendChild(textNode);
            });
        }
        if (window.cadCustomShapes) {
            let baseIdx = window.cadUnePolygons ? window.cadUnePolygons.length : 0;
            window.cadCustomShapes.forEach((p, idx) => {
                p._svgPathNode = createPathNode('#8BC34A', '#558B2F');
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
                textNode.textContent = String(baseIdx + idx + 1);
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

        if (window.cadGridLines) {
            window.cadGridLines.forEach(l => {
                l._svgPathNode = createPathNode('none', '#999999', true);
                l._svgPathNode.setAttribute('stroke-opacity', '0.8');
                l._svgPathNode.setAttribute('stroke-width', '2');
                pathsGroup.appendChild(l._svgPathNode);
            });
        }

        window.cadSvgNeedsRebuild = false;
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

    // svg is already defined at the top of the function
    let frontBarGroup = svg ? svg.querySelector('#front-bar') : null;
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
                textNode.textContent = String(baseIdx + idx + 1);
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

        if (window.cadGridLines) {
            window.cadGridLines.forEach(l => {
                l._svgPathNode = createPathNode('none', '#999999', true);
                l._svgPathNode.setAttribute('stroke-opacity', '0.8');
                l._svgPathNode.setAttribute('stroke-width', '2');
                pathsGroup.appendChild(l._svgPathNode);
            });
        }

        window.cadSvgNeedsRebuild = false;
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

    // svg is already defined at the top of the function
    let frontBarGroup = svg ? svg.querySelector('#front-bar') : null;
    if (frontBarGroup) {
        if (window.cadFrontBaseline) {
            let fo = frontBarGroup.querySelector('foreignObject');
            if (!fo) {
                fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                fo.setAttribute('width', '100');
                fo.setAttribute('height', '40');
                fo.setAttribute('style', 'overflow:visible; pointer-events:none;');
                let div = document.createElement('div');
                div.className = 'front-bar-label';
                div.style.cssText = 'color:#ffffff; font-size:14px; font-weight:bold; text-align:center; white-space:nowrap; transform:translate(-50%, -50%); position:absolute; left:50%; top:50%; pointer-events:auto;';
                div.innerText = '逡昴・豁｣髱｢';
                fo.appendChild(div);
                frontBarGroup.appendChild(fo);
            }
            let isArr = Array.isArray(window.cadFrontBaseline);
            let pt = isArr ? window.latLngToScreenPixel((window.cadFrontBaseline[0].lat + window.cadFrontBaseline[1].lat) / 2, (window.cadFrontBaseline[0].lng + window.cadFrontBaseline[1].lng) / 2) : window.latLngToScreenPixel(window.cadFrontBaseline.lat, window.cadFrontBaseline.lng);
            
            let lineNode = frontBarGroup.querySelector('line');
            if (lineNode) lineNode.remove();
            let h1 = frontBarGroup.querySelector('.front-handle-1');
            if (h1) h1.remove();
            let h2 = frontBarGroup.querySelector('.front-handle-2');
            if (h2) h2.remove();

            fo.setAttribute('x', pt.x - 50);
            fo.setAttribute('y', pt.y - 20);

            if (!fo.cadDragBound) {
                fo.cadDragBound = true;
                let div = fo.querySelector('.front-bar-label');
                div.style.cursor = 'pointer';
                div.style.backgroundColor = '#FF5722';
                div.style.padding = '4px 8px';
                div.style.borderRadius = '4px';
                div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
                
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
        } else {
            frontBarGroup.innerHTML = '';
        }
    }
};

window.updateCadLabelScale = (detectedScale) => {
    // CSS縺ｮ繧ｫ繧ｹ繧ｿ繝繝励Ο繝代ユ繧｣・・-cad-label-scale・峨↓繧医ｋ繧ｹ繧ｱ繝ｼ繝ｫ縺ｧ荳?諡ｬ蛻ｶ蠕｡縺吶ｋ縺溘ａ縲゛S縺ｧ縺ｮ蛟句挨縺ｮ繝輔か繝ｳ繝医し繧､繧ｺ螟画峩縺ｯ陦後＞縺ｾ縺帙ｓ・医ヱ繝輔か繝ｼ繝槭Φ繧ｹ縺ｨCSS遶ｶ蜷亥屓驕ｿ縺ｮ縺溘ａ・・
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

    // 検 霑ｽ蜉・壹ラ繝ｩ繝・げ荳ｭ縺ｮ隕九°縺台ｸ翫・繧ｺ繝ｬ繧定ｨ育ｮ励・荳ｭ蠢・↓蜿肴丐縺輔○繧・
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

// 検 譁ｰ讖溯・・夂憾諷九ｒ菫晏ｭ倥＠縺ｦ縺・▽縺ｧ繧ゅ?梧綾縺・騾ｲ繧?縲阪〒縺阪ｋ繧医≧縺ｫ縺吶ｋ
window.saveCadStateToHistory = () => {
    if (window.isHistoryNavigating || !window.cadTargetId) return;

    let pins = window.cadPins.map(mk => ({ type: mk.cadPinType, lat: mk.getPosition().lat(), lng: mk.getPosition().lng() }));
    let customShapesData = window.cadCustomShapes.map(poly => poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })));
    let unePolygonsData = window.cadUnePolygons.map(poly => poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })));

    const state = {
        angle: document.getElementById('cadAngle').value,
        width: document.getElementById('cadWidth').value,
        uneCount: document.getElementById('cadUneCount').value,
        pins: pins,
        nakamichiLines: JSON.parse(JSON.stringify(window.cadNakamichiLines)),
        customShapes: customShapesData,
        unePolygons: unePolygonsData,
        frontBaseline: window.cadFrontBaseline ? JSON.parse(JSON.stringify(window.cadFrontBaseline)) : null
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
    window.cadClearLines(true); // 蜀・Κ繧ｯ繝ｪ繧｢・亥ｱ･豁ｴ縺ｫ縺ｯ谿九＆縺ｪ縺・ｼ・

    document.getElementById('cadAngle').value = state.angle || 0;
    document.getElementById('cadWidth').value = state.width || 150;
    document.getElementById('cadUneCount').value = state.uneCount || 0;

    if (state.pins) {
        state.pins.forEach(pin => {
            const mk = new google.maps.Marker({
                position: { lat: pin.lat, lng: pin.lng }, map: window.cadMap,
                label: { text: pin.type === 'water_in' ? '??' : pin.type === 'water_out' ? '???' : pin.type === 'parking_truck' ? '??' : '??', fontSize: '24px', className: 'polygon-label' },
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }, zIndex: 5000, draggable: true
            });
            mk.cadPinType = pin.type;
            google.maps.event.addListener(mk, 'dragend', () => window.saveCadStateToHistory());
            window.cadPins.push(mk);
        });
    }

    if (state.nakamichiLines) {
        window.cadNakamichiLines = state.nakamichiLines || [];
        window.cadNakamichiLines.forEach(line => window.drawNakamichiVisual(line));
    }

    if (window.cadFrontBaselineMarker) { window.cadFrontBaselineMarker.setMap(null); window.cadFrontBaselineMarker = null; }
    if (window.cadFrontBaselineVisual) { window.cadFrontBaselineVisual.setMap(null); window.cadFrontBaselineVisual = null; }
    window.cadFrontBaseline = state.frontBaseline || null;
    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();

        if (state.customShapes) {
        state.customShapes.forEach((cPath, idx) => {
            let gPoly = new google.maps.Polygon({ paths: cPath, fillColor: '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 2), map: window.cadMap, editable: false, draggable: false, clickable: true, zIndex: 10 });
            gPoly.uneIndex = 'custom_' + idx;
            google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
            window.bindShapeHistoryEvents(gPoly);
            window.cadCustomShapes.push(gPoly);
        });
    }

    if (state.unePolygons) {
        state.unePolygons.forEach((uPath, idx) => {
            let gPoly = new google.maps.Polygon({ paths: uPath, fillColor: '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 2), map: window.cadMap, editable: false, draggable: false, clickable: true, zIndex: 10 });
            gPoly.uneIndex = 'une_' + idx;
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

// 検 譁ｰ讖溯・・壹ラ繝ｩ繝・げ譎ゅ↓繧よ焚蟄励Λ繝吶Ν縺後?後Μ繧｢繝ｫ繧ｿ繧､繝縲阪〒縺､縺・※縺上け・・
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
            window.updateSingleLabelPosition(poly); // 螟牙ｽ｢譎ゅ↓繧ゅΜ繧｢繝ｫ繧ｿ繧､繝霑ｽ蠕・
    // document.getElementById('cadAngle').value = Math.round(bearing);
    // if (window.updateCadPreviewCount) window.updateCadPreviewCount();

    if (window.cadFrontBaselineVisual) window.cadFrontBaselineVisual.setMap(null);
    if (window.cadFrontBaselineMarker) window.cadFrontBaselineMarker.setMap(null);
    window.cadFrontBaseline = path;
    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();

    // 繧｢繧､繧ｳ繝ｳ陦ｨ遉ｺ縺ｨ逡昴・繝ｪ繧ｴ繝ｳ縺ｯ迢ｬ遶九＆縺帙ｋ縺溘ａ蜀咲函謌舌＠縺ｪ縺・
    window.saveCadStateToHistory();
};

window.cadAddCustomShape = (type) => {
    let center = window.cadMap.getCenter(); let centerPt = turf.point([center.lng(), center.lat()]);
    let poly;
    if (type === 'rect') {
        let baseAngle = -window.cadCurrentRotation;
        let p1 = turf.destination(centerPt, 2, baseAngle + 45, { units: 'meters' }).geometry.coordinates;
        let p2 = turf.destination(centerPt, 2, baseAngle + 135, { units: 'meters' }).geometry.coordinates;
        let p3 = turf.destination(centerPt, 2, baseAngle + 225, { units: 'meters' }).geometry.coordinates;
        let p4 = turf.destination(centerPt, 2, baseAngle + 315, { units: 'meters' }).geometry.coordinates;
        poly = turf.polygon([[p1, p2, p3, p4, p1]]);
    } else {
        poly = turf.circle(centerPt, 0.002, { steps: 16, units: 'kilometers' });
    }

    let paths = poly.geometry.coordinates[0].map(c => ({ lat: c[1], lng: c[0] }));
    let gPoly = new google.maps.Polygon({ paths: paths, fillColor: '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: Math.max(0.5, 2), map: window.cadMap, editable: false, draggable: false, clickable: true, zIndex: 10 });

    gPoly.uneIndex = 'custom_' + Date.now();
    google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
    window.bindShapeHistoryEvents(gPoly);
    window.cadCustomShapes.push(gPoly);
    window.reassignLabels();
    window.saveCadStateToHistory();
};

window.cadGenerateLines = () => {
    try {
        if (!window.cadTargetId) return;

        const angleEl = document.getElementById('cadAngle');
        const countEl = document.getElementById('cadUneCount');

        const angle = angleEl && angleEl.value ? parseFloat(angleEl.value) : 0;
        const uneCount = countEl && countEl.value ? parseInt(countEl.value) : 0;

        if (isNaN(uneCount) || uneCount <= 0) { alert("笞・・逡晄焚繧・莉･荳翫〒遒ｺ螳壹＠縺ｦ縺上□縺輔＞・・); return; }

        window.cadUnePolygons.forEach(pl => pl.setMap(null)); window.cadUnePolygons = [];

        const p = loadedPolygons[window.cadTargetId];
        if (!p || !p.coords || p.coords.length < 3) return;

        let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([coords[0][0], coords[0][1]]);
        const tPoly = turf.polygon([coords]);

        const centerTurf = turf.center(tPoly);
        let maxPosDist = 0, maxNegDist = 0;

        let baseOrigin = centerTurf;
        let useFrontBaseline = false;
        let growDirection = angle + 90;
        let actualWidthM = 0;
        let startOffset = 0;

        if (window.cadFrontBaseline && window.cadFrontBaseline.length === 2) {
            useFrontBaseline = true;
            let p1 = turf.point([window.cadFrontBaseline[0].lng, window.cadFrontBaseline[0].lat]);
            let p2 = turf.point([window.cadFrontBaseline[1].lng, window.cadFrontBaseline[1].lat]);
            baseOrigin = turf.midpoint(p1, p2);
            
            let centerBearing = turf.bearing(baseOrigin, centerTurf);
            let diffPlus = (centerBearing - (angle + 90)) * Math.PI / 180;
            let diffMinus = (centerBearing - (angle - 90)) * Math.PI / 180;
            growDirection = Math.cos(diffPlus) > Math.cos(diffMinus) ? angle + 90 : angle - 90;

            let maxDist = 0;
            tPoly.geometry.coordinates[0].forEach(coord => {
                const pt = turf.point(coord);
                const dist = turf.distance(baseOrigin, pt, { units: 'meters' });
                const bearing = turf.bearing(baseOrigin, pt);
                const angleDiff = (bearing - growDirection) * Math.PI / 180;
                const projDist = dist * Math.cos(angleDiff);
                if (projDist > maxDist) maxDist = projDist;
            });
            
            actualWidthM = maxDist / uneCount;
            startOffset = actualWidthM / 2;
        } else {
            tPoly.geometry.coordinates[0].forEach(coord => {
                const pt = turf.point(coord); const dist = turf.distance(centerTurf, pt, { units: 'meters' });
                const bearing = turf.bearing(centerTurf, pt); const angleDiff = (bearing - (angle + 90)) * Math.PI / 180;
                const projDist = dist * Math.cos(angleDiff);
                if (projDist > maxPosDist) maxPosDist = projDist;
                if (-projDist > maxNegDist) maxNegDist = -projDist;
            });
            const totalWidth = maxPosDist + maxNegDist;
            actualWidthM = totalWidth / uneCount;
            startOffset = -maxNegDist + actualWidthM / 2;
        }

        const bbox = turf.bbox(tPoly);
        const diagDist = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], { units: 'meters' });

        let nakamichiPolys = window.cadNakamichiLines.map(line => {
            const centerLine = turf.lineString([[line[0].lng, line[0].lat], [line[1].lng, line[1].lat]]);
            return turf.buffer(centerLine, 0.5 / 1000, { units: 'kilometers' });
        });

        const lineLen = diagDist + 40;
        let rects = [];

        for (let i = 0; i < uneCount; i++) {
            let offset = startOffset + i * actualWidthM;
            let direction = useFrontBaseline ? growDirection : (offset >= 0 ? angle + 90 : angle - 90);
            let absOffset = useFrontBaseline ? offset : Math.abs(offset);
            let oPt = turf.destination(baseOrigin, absOffset, direction, { units: 'meters' });

            let pt1 = turf.destination(oPt, lineLen / 2, angle, { units: 'meters' }); let pt2 = turf.destination(oPt, lineLen / 2, angle + 180, { units: 'meters' });
            let w = actualWidthM * 0.8;
            let p1 = turf.destination(pt1, w / 2, angle + 90, { units: 'meters' }).geometry.coordinates; let p2 = turf.destination(pt1, w / 2, angle - 90, { units: 'meters' }).geometry.coordinates;
            let p3 = turf.destination(pt2, w / 2, angle - 90, { units: 'meters' }).geometry.coordinates; let p4 = turf.destination(pt2, w / 2, angle + 90, { units: 'meters' }).geometry.coordinates;
            rects.push(turf.polygon([[p1, p2, p3, p4, p1]]));
        }

        let successCount = 0;
        let polyIndex = 1;

        rects.forEach(rect => {
            try {
                let intersected = turf.intersect(tPoly, rect);
                if (intersected) {
                    nakamichiPolys.forEach(nkPoly => { if (intersected) intersected = turf.difference(intersected, nkPoly) || intersected; });
                    const drawPoly = (geom) => {
                        if (turf.area(geom) < 1) return;
                        if (geom.type === 'Polygon') { addUnePolygon(geom.coordinates[0], polyIndex++); successCount++; }
                        else if (geom.type === 'MultiPolygon') { geom.coordinates.forEach(c => { addUnePolygon(c[0], polyIndex++); successCount++; }); }
                    };
                    drawPoly(intersected.geometry);
                }
            } catch (e) { }
        });

        window.reassignLabels();
        window.saveCadStateToHistory();

        window.cadSvgNeedsRebuild = true;
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();

        if (successCount === 0) alert("笞・・逡昴′逕滓・縺ｧ縺阪∪縺帙ｓ縺ｧ縺励◆縲ら幅謨ｰ縺ｮ險ｭ螳壹↑縺ｩ繧堤｢ｺ隱阪＠縺ｦ縺上□縺輔＞縲・);
        else { const mode1El = document.getElementById('cadMode1'); if (mode1El && mode1El.style.display === 'block') switchCadTab(2); }

    } catch (globalError) { alert("笶・蜃ｦ逅・ｸｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆:\n" + globalError.message); }
};

function addUnePolygon(coordsArray, idx) {
    const path = coordsArray.map(c => ({ lat: c[1], lng: c[0] }));
    const gPoly = new google.maps.Polygon({
        paths: path, fillColor: '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8,
        strokeWeight: Math.max(0.5, 2), map: window.cadMap, zIndex: 10, editable: false, draggable: false, clickable: true
    });
    gPoly.uneIndex = 'une_' + idx;
    google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
    window.bindShapeHistoryEvents(gPoly);
    window.cadUnePolygons.push(gPoly);
}

window.cadEditOriginalPath = null;
window.openCadEditModal = (idx) => {
    document.getElementById('cadEditIndex').value = idx;
    
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
    const poly = polyList.find(p => p.uneIndex === idx);
    if (poly) {
        let path = poly.getPath();
        window.cadEditOriginalPath = [];
        for (let i = 0; i < path.getLength(); i++) {
            let pt = path.getAt(i);
            window.cadEditOriginalPath.push(new google.maps.LatLng(pt.lat(), pt.lng()));
        }
    }
    
    document.getElementById('cadEditPolyModal').style.display = 'flex';
};

window.cadCancelEditPoly = () => {
    const idx = document.getElementById('cadEditIndex').value;
    if (idx && window.cadEditOriginalPath) {
        const isCustom = idx.startsWith('custom_');
        const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
        const poly = polyList.find(p => p.uneIndex === idx);
        if (poly) {
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
    newCoords.pop(); poly.setPath(newCoords); window.updateSinglePolyLabel(idx);
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
    poly.setPath(newCoords); window.updateSinglePolyLabel(idx);
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (!isContinuous) window.saveCadStateToHistory();
};

window.cadResizePoly = (scaleFactor, isContinuous = false) => {
    const idx = document.getElementById('cadEditIndex').value;
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
    const poly = polyList.find(p => p.uneIndex === idx);
    if (!poly) return;

    let path = poly.getPath(); let coords = [];
    for (let i = 0; i < path.getLength(); i++) { let pt = path.getAt(i); coords.push([pt.lng(), pt.lat()]); }
    coords.push([path.getAt(0).lng(), path.getAt(0).lat()]); let tPoly = turf.polygon([coords]);

    let scaledPoly = turf.transformScale(tPoly, scaleFactor);
    let newCoords = scaledPoly.geometry.coordinates[0].map(c => new google.maps.LatLng(c[1], c[0]));
    newCoords.pop(); poly.setPath(newCoords); window.updateSinglePolyLabel(idx);
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

    totalPolygons.forEach((poly, index) => {
        const marker = window.cadUneLabels[index];
        const idxStr = String(index + 1);

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

window.saveUneSim = () => {
    if (!window.cadTargetId) return;
    const p = loadedPolygons[window.cadTargetId];
    let pins = window.cadPins.map(mk => ({ type: mk.cadPinType, lat: mk.getPosition().lat(), lng: mk.getPosition().lng() }));
    let customShapesData = window.cadCustomShapes.map(poly => poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })));
    let unePolygonsData = window.cadUnePolygons.map(poly => poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })));

    const angleEl = document.getElementById('cadAngle'); const widthEl = document.getElementById('cadWidth'); const countEl = document.getElementById('cadUneCount');

    const simDataStr = JSON.stringify({
        angle: angleEl && angleEl.value ? angleEl.value : 0,
        width: widthEl && widthEl.value ? widthEl.value : 150,
        uneCount: countEl && countEl.value ? countEl.value : 0,
        pins: pins,
        nakamichiLines: window.cadNakamichiLines,
        customShapes: customShapesData,
        unePolygons: unePolygonsData,
        frontBaseline: window.cadFrontBaseline || null
    });

    p.uneSimData = simDataStr;
    callGAS('updatePolygon', { id: p.id, name: p.name, uneSimData: simDataStr, userName: currentUser });
    alert("沈 謠冗判縺励◆蝨ｰ蠖｢縺ｨ繝斐Φ繧偵☆縺ｹ縺ｦ菫晏ｭ倥＠縺ｾ縺励◆・・);
    window.closeCADMode();
};