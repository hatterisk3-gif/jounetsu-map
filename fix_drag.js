const fs = require('fs');
let code = fs.readFileSync('cad.js', 'utf8');

const mousedownOrig = `    wrapper.addEventListener('mousedown', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex') return;
        ignoreDrag = checkIgnoreDrag(e.target);
        lastTouchX = e.pageX; lastTouchY = e.pageY; startPageX = e.pageX; startPageY = e.pageY;
        isMouseDown = true; isDragging = false;
        pendingCenter = null;
        pendingZoom = null;
        if (!ignoreDrag) {
            e.stopPropagation();
            window.cadDragStartCenter = window.cadMap ? window.cadMap.getCenter() : null;
            window.cadDragDx = 0;
            window.cadDragDy = 0;
            window.cadDragRawDx = 0;
            window.cadDragRawDy = 0;
        }
    }, { capture: true });`;

const mousedownNew = `    wrapper.addEventListener('mousedown', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex') return;
        ignoreDrag = checkIgnoreDrag(e.target);
        lastTouchX = e.pageX; lastTouchY = e.pageY; startPageX = e.pageX; startPageY = e.pageY;
        isMouseDown = true; isDragging = false;
        pendingCenter = null;
        pendingZoom = null;
        if (!ignoreDrag) {
            e.stopPropagation();
            let editIdxObj = document.getElementById('cadEditIndex');
            let editIdx = editIdxObj && editIdxObj.value ? editIdxObj.value : null;
            if (editIdx && document.getElementById('cadEditPolyModal').style.display !== 'none') {
                const isCustom = editIdx.startsWith('custom_');
                const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
                window.cadDraggingPoly = polyList ? polyList.find(p => p.uneIndex === editIdx) : null;
                if (window.cadDraggingPoly) {
                    window.cadDragPolyStartPath = window.cadDraggingPoly.getPath().getArray().map(pt => ({lat: pt.lat(), lng: pt.lng()}));
                    return;
                }
            } else {
                window.cadDraggingPoly = null;
                window.cadDragPolyStartPath = null;
            }
            window.cadDragStartCenter = window.cadMap ? window.cadMap.getCenter() : null;
            window.cadDragDx = 0;
            window.cadDragDy = 0;
            window.cadDragRawDx = 0;
            window.cadDragRawDy = 0;
        }
    }, { capture: true });`;

const mousemoveOrig = `    wrapper.addEventListener('mousemove', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex' || ignoreDrag || !isMouseDown || lastTouchX === null || lastTouchY === null) return;
        if (!ignoreDrag) {
            e.stopPropagation();
        }
        const currentX = e.pageX; const currentY = e.pageY;

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
    }, { capture: true });`;

const mousemoveNew = `    wrapper.addEventListener('mousemove', (e) => {
        if (document.getElementById('cadOverlay').style.display !== 'flex' || ignoreDrag || !isMouseDown || lastTouchX === null || lastTouchY === null) return;
        if (!ignoreDrag) {
            e.stopPropagation();
        }
        const currentX = e.pageX; const currentY = e.pageY;

        if (Math.abs(currentX - startPageX) > 6 || Math.abs(currentY - startPageY) > 6) isDragging = true;

        if (isDragging) {
            if (window.cadDraggingPoly && window.cadDragPolyStartPath) {
                let dxScreen = currentX - startPageX;
                let dyScreen = currentY - startPageY;

                let angleRad = -(window.cadCurrentRotation || 0) * Math.PI / 180;
                let cos = Math.cos(angleRad);
                let sin = Math.sin(angleRad);
                let dxMap = (dxScreen * cos - dyScreen * sin) / window.cadCurrentScale;
                let dyMap = (dxScreen * sin + dyScreen * cos) / window.cadCurrentScale;
                
                let scaleToRealZoom = Math.pow(2, window.getCadZoom() - (window.cadMap ? window.cadMap.getZoom() : 20));
                let dxWorld = dxMap / scaleToRealZoom;
                let dyWorld = dyMap / scaleToRealZoom;
                
                const proj = window.cadMap.getProjection();
                let newCoords = window.cadDragPolyStartPath.map(pt => {
                    let wPt = proj.fromLatLngToPoint(new google.maps.LatLng(pt.lat, pt.lng));
                    return proj.fromPointToLatLng(new google.maps.Point(wPt.x + dxWorld, wPt.y + dyWorld));
                });
                window.cadDraggingPoly.setPath(newCoords);
                if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
                return;
            }

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
    }, { capture: true });`;

const mouseupOrig = `    wrapper.addEventListener('mouseup', (e) => {
        if (document.getElementById('cadOverlay').style.display === 'flex' && !isDragging && isMouseDown && startPageX !== null && startPageY !== null && !ignoreDrag) {
            window.handleMapClick(e.pageX, e.pageY);
        }`;

const mouseupNew = `    wrapper.addEventListener('mouseup', (e) => {
        if (window.cadDraggingPoly) {
            window.cadDraggingPoly = null;
            window.cadDragPolyStartPath = null;
            if (isDragging) {
                window.reassignLabels();
                window.saveCadStateToHistory();
            }
            isMouseDown = false; lastTouchX = null; lastTouchY = null; setTimeout(() => { isDragging = false; ignoreDrag = false; }, 100);
            return;
        }

        if (document.getElementById('cadOverlay').style.display === 'flex' && !isDragging && isMouseDown && startPageX !== null && startPageY !== null && !ignoreDrag) {
            window.handleMapClick(e.pageX, e.pageY);
        }`;

const touchstartOrig = `        } else if (e.touches.length === 1) {
            lastTouchX = e.touches[0].pageX; lastTouchY = e.touches[0].pageY;
            startPageX = e.touches[0].pageX; startPageY = e.touches[0].pageY;
            isDragging = false;
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
        }`;

const touchstartNew = `        } else if (e.touches.length === 1) {
            lastTouchX = e.touches[0].pageX; lastTouchY = e.touches[0].pageY;
            startPageX = e.touches[0].pageX; startPageY = e.touches[0].pageY;
            isDragging = false;
            if (!ignoreDrag) {
                if (e.cancelable) {
                    e.preventDefault();
                }
                e.stopPropagation();
                let editIdxObj = document.getElementById('cadEditIndex');
                let editIdx = editIdxObj && editIdxObj.value ? editIdxObj.value : null;
                if (editIdx && document.getElementById('cadEditPolyModal').style.display !== 'none') {
                    const isCustom = editIdx.startsWith('custom_');
                    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
                    window.cadDraggingPoly = polyList ? polyList.find(p => p.uneIndex === editIdx) : null;
                    if (window.cadDraggingPoly) {
                        window.cadDragPolyStartPath = window.cadDraggingPoly.getPath().getArray().map(pt => ({lat: pt.lat(), lng: pt.lng()}));
                        return;
                    }
                } else {
                    window.cadDraggingPoly = null;
                    window.cadDragPolyStartPath = null;
                }
                window.cadDragStartCenter = window.cadMap ? window.cadMap.getCenter() : null;
                window.cadDragDx = 0;
                window.cadDragDy = 0;
                window.cadDragRawDx = 0;
                window.cadDragRawDy = 0;
            }
        }`;

const touchmoveOrig = `            if (isDragging) {
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
    }, { capture: true, passive: false });`;

const touchmoveNew = `            if (isDragging) {
                if (window.cadDraggingPoly && window.cadDragPolyStartPath) {
                    let dxScreen = currentX - startPageX;
                    let dyScreen = currentY - startPageY;

                    let angleRad = -(window.cadCurrentRotation || 0) * Math.PI / 180;
                    let cos = Math.cos(angleRad);
                    let sin = Math.sin(angleRad);
                    let dxMap = (dxScreen * cos - dyScreen * sin) / window.cadCurrentScale;
                    let dyMap = (dxScreen * sin + dyScreen * cos) / window.cadCurrentScale;
                    
                    let scaleToRealZoom = Math.pow(2, window.getCadZoom() - (window.cadMap ? window.cadMap.getZoom() : 20));
                    let dxWorld = dxMap / scaleToRealZoom;
                    let dyWorld = dyMap / scaleToRealZoom;
                    
                    const proj = window.cadMap.getProjection();
                    let newCoords = window.cadDragPolyStartPath.map(pt => {
                        let wPt = proj.fromLatLngToPoint(new google.maps.LatLng(pt.lat, pt.lng));
                        return proj.fromPointToLatLng(new google.maps.Point(wPt.x + dxWorld, wPt.y + dyWorld));
                    });
                    window.cadDraggingPoly.setPath(newCoords);
                    if (window.updateCadSvgOverlay) window.updateCadSvgOverlay();
                    return;
                }

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
    }, { capture: true, passive: false });`;

const touchendOrig = `    const handleTouchEndOrCancel = (e) => {
        if (e.touches.length < 2) { initialPinchDist = null; initialPinchAngle = null; pinchMode = null; }
        if (e.touches.length === 0) {`;

const touchendNew = `    const handleTouchEndOrCancel = (e) => {
        if (window.cadDraggingPoly) {
            window.cadDraggingPoly = null;
            window.cadDragPolyStartPath = null;
            if (isDragging) {
                window.reassignLabels();
                window.saveCadStateToHistory();
            }
            isMouseDown = false; lastTouchX = null; lastTouchY = null; setTimeout(() => { isDragging = false; ignoreDrag = false; }, 100);
            return;
        }
        if (e.touches.length < 2) { initialPinchDist = null; initialPinchAngle = null; pinchMode = null; }
        if (e.touches.length === 0) {`;

code = code.replace(mousedownOrig, mousedownNew);
code = code.replace(mousemoveOrig, mousemoveNew);
code = code.replace(mouseupOrig, mouseupNew);
code = code.replace(touchstartOrig, touchstartNew);
code = code.replace(touchmoveOrig, touchmoveNew);
code = code.replace(touchendOrig, touchendNew);

fs.writeFileSync('cad.js', code, 'utf8');
